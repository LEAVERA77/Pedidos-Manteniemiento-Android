import { query } from "../db/neon.js";
import { tableHasColumn } from "./tenantScope.js";
import { normalizarRubroCliente, rubroNormToBusinessType, businessTypeToRubroParaTipos } from "../services/businessType.js";

let _pedidosBt;
let _clientesAbt;
let _tenantBusinesses;
let _tenantActiveBusiness;

export async function pedidosHasBusinessTypeColumn() {
  if (_pedidosBt === undefined) {
    _pedidosBt = await tableHasColumn("pedidos", "business_type");
  }
  return _pedidosBt;
}

export async function clientesHasActiveBusinessTypeColumn() {
  if (_clientesAbt === undefined) {
    _clientesAbt = await tableHasColumn("clientes", "active_business_type");
  }
  return _clientesAbt;
}

export async function tenantBusinessesTableExists() {
  if (_tenantBusinesses === undefined) {
    _tenantBusinesses = await tableHasColumn("tenant_businesses", "business_type");
  }
  return _tenantBusinesses;
}

export async function tenantActiveBusinessTableExists() {
  if (_tenantActiveBusiness === undefined) {
    _tenantActiveBusiness = await tableHasColumn("tenant_active_business", "active_business_type");
  }
  return _tenantActiveBusiness;
}

/**
 * Añade `AND business_type = $n` para filtros de listados/updates de pedidos.
 * @param {import('express').Request} req
 * @param {unknown[]} params mutado
 * @returns {Promise<string>} sufijo SQL o ""
 */
export async function pushPedidoBusinessFilter(req, params) {
  if (!req?.businessTypeFilterEnabled || !req?.activeBusinessType) return "";
  if (!(await pedidosHasBusinessTypeColumn())) return "";
  params.push(req.activeBusinessType);
  return ` AND business_type = $${params.length}`;
}

/**
 * Misma intención que {@link pushPedidoBusinessFilter} pero incluye filas legacy con `business_type` NULL
 * (pedidos creados antes del multitenant o sin rellenar), para que GET/PUT por id no devuelvan 404.
 */
export async function pushPedidoBusinessFilterRelaxed(req, params) {
  if (!req?.businessTypeFilterEnabled || !req?.activeBusinessType) return "";
  if (!(await pedidosHasBusinessTypeColumn())) return "";
  params.push(req.activeBusinessType);
  return ` AND (business_type IS NULL OR business_type = $${params.length})`;
}

/**
 * Carga `active_business_type` del tenant y habilita filtro si existen columnas en BD.
 */
export async function loadTenantBusinessContext(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return { activeBusinessType: "electricidad", businessTypeFilterEnabled: false };
  }
  const hasAbt = await clientesHasActiveBusinessTypeColumn();
  const hasBt = await pedidosHasBusinessTypeColumn();
  const hasTa = await tenantActiveBusinessTableExists();
  const r0 = await query(`SELECT tipo${hasAbt ? ", active_business_type" : ""} FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
  const row0 = r0.rows?.[0];
  const rubro = normalizarRubroCliente(row0?.tipo);
  const fallback = rubroNormToBusinessType(rubro);
  if (!hasAbt || !hasBt) {
    return {
      activeBusinessType: fallback,
      businessTypeFilterEnabled: false,
    };
  }
  let raw = String(row0?.active_business_type || "").trim().toLowerCase();
  if (hasTa) {
    try {
      const ra = await query(
        `SELECT active_business_type FROM tenant_active_business WHERE tenant_id = $1 LIMIT 1`,
        [tid]
      );
      const rawTa = String(ra.rows?.[0]?.active_business_type || "").trim().toLowerCase();
      if (rawTa) raw = rawTa;
    } catch (_) {}
  }
  const valid = ["electricidad", "agua", "municipio"].includes(raw) ? raw : fallback;
  return {
    activeBusinessType: valid,
    businessTypeFilterEnabled: true,
  };
}

/** Rubro interno (tipos de reclamo) según la línea de negocio activa. */
export function rubroEfectivoParaTipos(req) {
  return businessTypeToRubroParaTipos(req?.activeBusinessType || "electricidad");
}
