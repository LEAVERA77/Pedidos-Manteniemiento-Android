/**
 * Métricas de calidad geográfica de pedidos (admin).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";
import { tableHasColumn } from "../utils/tenantScope.js";

/**
 * @param {import('express').Request} req
 */
export async function calcularGeoCalidadPedidos(req) {
  const hasT = await pedidosTableHasTenantIdColumn();
  const params = hasT ? [req.tenantId] : [];
  const bt = await pushPedidoBusinessFilter(req, params);
  const tsql = hasT ? ` AND tenant_id = $1` : "";

  const hasLat = await tableHasColumn("pedidos", "lat");
  const hasLng = await tableHasColumn("pedidos", "lng");
  if (!hasLat || !hasLng) {
    return {
      disponible: false,
      mensaje: "Columnas lat/lng no disponibles en pedidos",
    };
  }

  const r = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (
         WHERE lat IS NOT NULL AND lng IS NOT NULL
           AND ABS(lat::float) > 0.0001 AND ABS(lng::float) > 0.0001
       )::int AS con_coords,
       COUNT(*) FILTER (
         WHERE estado NOT IN ('Cerrado', 'Desestimado')
       )::int AS abiertos,
       COUNT(*) FILTER (
         WHERE estado NOT IN ('Cerrado', 'Desestimado')
           AND lat IS NOT NULL AND lng IS NOT NULL
           AND ABS(lat::float) > 0.0001 AND ABS(lng::float) > 0.0001
       )::int AS abiertos_con_coords
     FROM pedidos
     WHERE 1=1${tsql}${bt}`,
    params
  );
  const row = r.rows?.[0] || {};
  const total = row.total ?? 0;
  const conCoords = row.con_coords ?? 0;
  const abiertos = row.abiertos ?? 0;
  const abiertosCon = row.abiertos_con_coords ?? 0;
  const sinCoords = Math.max(0, total - conCoords);
  const pct = total > 0 ? Math.round((conCoords / total) * 100) : 0;
  const pctAbiertos = abiertos > 0 ? Math.round((abiertosCon / abiertos) * 100) : 0;

  return {
    disponible: true,
    total,
    con_coordenadas: conCoords,
    sin_coordenadas: sinCoords,
    porcentaje_con_coords: pct,
    abiertos,
    abiertos_con_coordenadas: abiertosCon,
    abiertos_sin_coordenadas: Math.max(0, abiertos - abiertosCon),
    porcentaje_abiertos_con_coords: pctAbiertos,
  };
}
