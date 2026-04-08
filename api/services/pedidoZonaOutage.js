import { query } from "../db/neon.js";

let _pedidosColsCache = null;
let _sociosCatalogoColsCache = null;

async function columnasSociosCatalogo() {
  if (_sociosCatalogoColsCache) return _sociosCatalogoColsCache;
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo'`
  );
  _sociosCatalogoColsCache = new Set((r.rows || []).map((c) => c.column_name));
  return _sociosCatalogoColsCache;
}

async function columnasPedidos() {
  if (_pedidosColsCache) return _pedidosColsCache;
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos'`
  );
  _pedidosColsCache = new Set((cols.rows || []).map((c) => c.column_name));
  return _pedidosColsCache;
}

/**
 * Busca distribuidor y transformador (trafo) en socios_catalogo por NIS/medidor unificado.
 */
export async function lookupDistribuidorTrafoPorNisMedidor(nisMedidorStr) {
  const key = nisMedidorStr != null ? String(nisMedidorStr).trim() : "";
  if (!key) {
    return { distribuidor: null, trafo: null };
  }
  try {
    const scCols = await columnasSociosCatalogo();
    const medMatch = scCols.has("medidor")
      ? "OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM($1))"
      : "";
    const r = await query(
      `SELECT distribuidor_codigo, transformador FROM socios_catalogo
       WHERE activo = TRUE AND (
         UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM($1))
         ${medMatch}
       )
       LIMIT 1`,
      [key]
    );
    const row = r.rows?.[0];
    if (!row) return { distribuidor: null, trafo: null };
    return {
      distribuidor: row.distribuidor_codigo != null ? String(row.distribuidor_codigo).trim() : null,
      trafo: row.transformador != null ? String(row.transformador).trim() : null,
    };
  } catch {
    return { distribuidor: null, trafo: null };
  }
}

/**
 * Cuenta pedidos abiertos del tenant en ventana reciente con el mismo distribuidor o trafo.
 * A partir del 5.º reclamo: count existentes >= 4 antes de insertar el nuevo.
 */
export async function contarPedidosAbiertosMismaZona({ tenantId, distribuidor, trafo }) {
  const dis = distribuidor != null ? String(distribuidor).trim() : "";
  const tr = trafo != null ? String(trafo).trim() : "";
  if (!dis && !tr) return 0;

  const pCols = await columnasPedidos();
  const hasTrafoCol = pCols.has("trafo");

  const params = [];
  const ors = [];
  if (dis) {
    params.push(dis);
    ors.push(`TRIM(COALESCE(distribuidor,'')) = TRIM($${params.length})`);
  }
  if (tr && hasTrafoCol) {
    params.push(tr);
    ors.push(`TRIM(COALESCE(trafo,'')) = TRIM($${params.length})`);
  }
  if (!ors.length) return 0;

  const wh = [
    `estado IN ('Pendiente','Asignado','En ejecución')`,
    `fecha_creacion > NOW() - INTERVAL '90 minutes'`,
    `(${ors.join(" OR ")})`,
  ];

  if (pCols.has("tenant_id") && tenantId != null && Number.isFinite(Number(tenantId))) {
    params.push(Number(tenantId));
    wh.push(`tenant_id = $${params.length}`);
  }

  const sql = `SELECT COUNT(*)::int AS c FROM pedidos WHERE ${wh.join(" AND ")}`;
  const r = await query(sql, params);
  return Number(r.rows?.[0]?.c) || 0;
}

export const OUTAGE_SECTOR_MULTI_RECLAMO = "OUTAGE_SECTOR_MULTI_RECLAMO";
