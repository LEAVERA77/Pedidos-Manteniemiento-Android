/**
 * Pedidos abiertos sin coordenadas válidas (admin / mapa).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn, tableHasColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";

const SIN_COORDS_SQL = `(lat IS NULL OR lng IS NULL OR ABS(lat::float) <= 0.0001 OR ABS(lng::float) <= 0.0001)`;
const ABIERTOS_SQL = `estado NOT IN ('Cerrado', 'Desestimado')`;

/**
 * @param {import('express').Request} req
 * @param {{ limit?: number }} [opts]
 */
export async function listarPedidosAbiertosSinCoords(req, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 50);
  const hasLat = await tableHasColumn("pedidos", "lat");
  const hasLng = await tableHasColumn("pedidos", "lng");
  if (!hasLat || !hasLng) {
    return { disponible: false, items: [] };
  }

  const hasT = await pedidosTableHasTenantIdColumn();
  const params = hasT ? [req.tenantId] : [];
  const bt = await pushPedidoBusinessFilter(req, params);
  params.push(limit);
  const limitIdx = params.length;
  const tsql = hasT ? ` AND tenant_id = $1` : "";

  const r = await query(
    `SELECT id, numero_pedido, cliente, estado, tipo_trabajo, fecha_creacion
     FROM pedidos
     WHERE ${ABIERTOS_SQL} AND ${SIN_COORDS_SQL}${tsql}${bt}
     ORDER BY fecha_creacion DESC NULLS LAST
     LIMIT $${limitIdx}`,
    params
  );

  return {
    disponible: true,
    total: r.rows?.length ?? 0,
    items: (r.rows || []).map((row) => ({
      id: row.id,
      numero_pedido: row.numero_pedido,
      cliente: row.cliente,
      estado: row.estado,
      tipo_trabajo: row.tipo_trabajo,
      fecha_creacion: row.fecha_creacion,
    })),
  };
}
