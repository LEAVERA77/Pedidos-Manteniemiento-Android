/**
 * Guardar setup inicial (nombre, tipo, logo, lat/lng, flags wizard) con tenant_id explícito.
 * Cuerpo debe llegar ya sanitizado como la rama técnica de PUT /clientes/mi-configuración.
 */
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { normalizarRubroCliente } from "./tiposReclamo.js";
import { normalizeBusinessTypeInput } from "./businessType.js";
import { setUbicacionCentralInTable } from "./configuracionStore.js";
import { sanitizeWhatsappArAreaConfigIncrement } from "../utils/whatsappArAreaConfig.js";
import { resetPedidoContadorPorTenant } from "./pedidoContador.js";

function badRequest(msg, extra = {}) {
  const e = new Error(msg);
  e.status = 400;
  e.json = { error: msg, ...extra };
  throw e;
}

/**
 * @param {number} tenantId
 * @param {Record<string, unknown>} body — sanitizado (solo claves permitidas técnico)
 * @returns {Promise<{ cliente: object }>}
 */
export async function technicianCompletarSetupInicialSave(tenantId, body) {
  const { nombre, tipo, latitud, longitud, configuracion: configuracionBody, active_business_type: activeBusinessBody } =
    body;
  const logo_url = Object.prototype.hasOwnProperty.call(body, "logo_url") ? body.logo_url : undefined;

  let tipoDb = null;
  if (tipo !== undefined && tipo !== null && String(tipo).trim() !== "") {
    const norm = normalizarRubroCliente(tipo);
    if (!norm) {
      badRequest("Tipo de cliente no reconocido", {
        detail: String(tipo),
        tipos_sugeridos: ["municipio", "cooperativa_electrica", "cooperativa_agua", "cooperativa", "empresa"],
      });
    }
    tipoDb = norm;
  }

  const hasAbtCol = await tableHasColumn("clientes", "active_business_type");
  const rTipoNow = await query(
    `SELECT tipo${hasAbtCol ? ", active_business_type" : ""} FROM clientes WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  if (!rTipoNow.rows.length) {
    const e = new Error("not_found");
    e.status = 404;
    e.json = { error: "Cliente no encontrado", tenant_id: tenantId };
    throw e;
  }
  const prevTipoNorm = normalizarRubroCliente(rTipoNow.rows[0]?.tipo);
  const prevAb = hasAbtCol ? String(rTipoNow.rows[0]?.active_business_type || "").trim().toLowerCase() : "";

  const Inc =
    typeof configuracionBody === "object" && configuracionBody !== null ? { ...configuracionBody } : {};

  const cfgJson = {
    ...Inc,
    ...(latitud != null ? { lat_base: latitud } : {}),
    ...(longitud != null ? { lng_base: longitud } : {}),
  };
  sanitizeWhatsappArAreaConfigIncrement(cfgJson);
  if (Object.prototype.hasOwnProperty.call(body, "logo_url")) {
    const v = logo_url;
    cfgJson.logo_url = v === "" || v == null ? null : String(v);
  }

  let newActiveBt = null;
  let activeBtSql = "";
  const params = [tenantId, nombre ?? null, tipoDb, JSON.stringify(cfgJson)];
  if (
    hasAbtCol &&
    activeBusinessBody !== undefined &&
    activeBusinessBody !== null &&
    String(activeBusinessBody).trim() !== ""
  ) {
    const ab = normalizeBusinessTypeInput(activeBusinessBody);
    if (ab) {
      newActiveBt = ab;
      params.push(ab);
      activeBtSql = `, active_business_type = $${params.length}`;
    }
  }

  let debeResetearContadorPedidos = false;
  if (tipoDb != null && tipoDb !== prevTipoNorm) {
    debeResetearContadorPedidos = true;
  }
  if (newActiveBt && prevAb !== "" && newActiveBt !== prevAb) {
    debeResetearContadorPedidos = true;
  }

  const r = await query(
    `UPDATE clientes
     SET nombre = COALESCE($2, nombre),
         tipo = COALESCE($3, tipo),
         configuracion = COALESCE(configuracion, '{}'::jsonb) || $4::jsonb
         ${activeBtSql},
         fecha_actualizacion = NOW()
     WHERE id = $1
     RETURNING *`,
    params
  );
  if (!r.rows.length) {
    const e = new Error("not_found");
    e.status = 404;
    e.json = { error: "Cliente no encontrado", tenant_id: tenantId };
    throw e;
  }
  const row = r.rows[0];
  if (debeResetearContadorPedidos) {
    try {
      await resetPedidoContadorPorTenant(tenantId);
    } catch (err) {
      console.warn("[technicianCompletarSetup] reset pedido_contador:", err?.message || err);
    }
  }
  let cfgMerged = row.configuracion;
  if (typeof cfgMerged === "string") {
    try {
      cfgMerged = JSON.parse(cfgMerged);
    } catch (_) {
      cfgMerged = {};
    }
  }
  const cM = cfgMerged && typeof cfgMerged === "object" ? cfgMerged : {};
  const la = cM.lat_base != null ? Number(cM.lat_base) : null;
  const lo = cM.lng_base != null ? Number(cM.lng_base) : null;
  if (Number.isFinite(la) && Number.isFinite(lo)) {
    try {
      const z = cM.zoom_mapa != null ? Number(cM.zoom_mapa) : 13;
      await setUbicacionCentralInTable(tenantId, {
        lat: la,
        lng: lo,
        zoom: Number.isFinite(z) && z > 0 ? z : 13,
        nombre: row.nombre,
      });
    } catch (err) {
      console.warn("[technicianCompletarSetup] sync ubicacion tabla", err?.message || err);
    }
  }
  return { cliente: row };
}
