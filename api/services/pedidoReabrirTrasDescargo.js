/**
 * Tras guardar descargo ante valoración WA: reabrir pedido cerrado para asignar técnico y flujo normal.
 * made by leavera77
 */
import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
function esPedidoCerrado(estado) {
  return String(estado || "")
    .trim()
    .toLowerCase() === "cerrado";
}

function pedidoTieneValoracionCliente(row) {
  if (!row) return false;
  const n = Number(row.opinion_cliente_estrellas);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return true;
  return !!(row.opinion_cliente != null && String(row.opinion_cliente).trim());
}

/**
 * Si el pedido estaba Cerrado con valoración del cliente y ya tiene descargo guardado → Pendiente sin técnico.
 * @returns {Promise<object|null>} fila pedidos actualizada o null si no aplica
 */
export async function reabrirPedidoOperativaTrasDescargoGuardado(pedidoId, tenantId) {
  const id = Number(pedidoId);
  const tid = Number(tenantId);
  if (!Number.isFinite(id) || id < 1 || !Number.isFinite(tid) || tid < 1) return null;

  const hasT = await pedidosTableHasTenantIdColumn();
  const sel = hasT
    ? `SELECT * FROM pedidos WHERE id = $1 AND tenant_id = $2 LIMIT 1`
    : `SELECT * FROM pedidos WHERE id = $1 LIMIT 1`;
  const bindSel = hasT ? [id, tid] : [id];
  const cur = await query(sel, bindSel);
  const row = cur.rows?.[0];
  if (!row) return null;

  if (!esPedidoCerrado(row.estado)) return null;
  if (!pedidoTieneValoracionCliente(row)) return null;
  const desc = String(row.opinion_descargo_empresa || "").trim();
  if (!desc) return null;

  const sets = [
    "estado = 'Pendiente'",
    "avance = 0",
    "tecnico_asignado_id = NULL",
    "fecha_asignacion = NULL",
    "fecha_cierre = NULL",
    "usuario_cierre_id = NULL",
  ];
  const cols = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pedidos'`
  );
  const colSet = new Set((cols.rows || []).map((c) => c.column_name));
  if (colSet.has("trabajo_realizado")) sets.push("trabajo_realizado = NULL");
  if (colSet.has("foto_cierre")) sets.push("foto_cierre = NULL");
  if (colSet.has("tecnico_cierre")) sets.push("tecnico_cierre = NULL");

  const where = hasT ? "id = $1 AND tenant_id = $2" : "id = $1";
  const bindUpd = hasT ? [id, tid] : [id];
  const r = await query(
    `UPDATE pedidos SET ${sets.join(", ")} WHERE ${where} RETURNING *`,
    bindUpd
  );
  return r.rows?.[0] || null;
}

/** ¿Al próximo cierre del técnico debe ofrecerse re-calificación (reemplaza la anterior)? */
export async function pedidoDebeReRatingAlCerrarTrasDescargo(pedidoId, tenantId) {
  const id = Number(pedidoId);
  const tid = Number(tenantId);
  if (!Number.isFinite(id) || id < 1) return false;
  const hasT = await pedidosTableHasTenantIdColumn();
  const sql = hasT
    ? `SELECT opinion_descargo_empresa, opinion_cliente, opinion_cliente_estrellas
       FROM pedidos WHERE id = $1 AND tenant_id = $2 LIMIT 1`
    : `SELECT opinion_descargo_empresa, opinion_cliente, opinion_cliente_estrellas
       FROM pedidos WHERE id = $1 LIMIT 1`;
  const bind = hasT ? [id, tid] : [id];
  const r = await query(sql, bind);
  const row = r.rows?.[0];
  if (!row) return false;
  if (!String(row.opinion_descargo_empresa || "").trim()) return false;
  return pedidoTieneValoracionCliente(row);
}
