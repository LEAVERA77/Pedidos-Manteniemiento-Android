import { query } from "../db/neon.js";

let _pedidosHasTenantId;
export async function pedidosTableHasTenantIdColumn() {
  if (_pedidosHasTenantId !== undefined) return _pedidosHasTenantId;
  try {
    const c = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'tenant_id' LIMIT 1`
    );
    _pedidosHasTenantId = c.rows.length > 0;
  } catch {
    _pedidosHasTenantId = false;
  }
  return _pedidosHasTenantId;
}

/**
 * AND alias.tenant_id = $nextParam
 * @returns {{ sql: string, pushParam: (p: unknown[]) => void } | { sql: string }}
 */
export async function sqlPedidosTenantAnd(alias, tenantId, params) {
  const has = await pedidosTableHasTenantIdColumn();
  if (!has) return { sql: "" };
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return { sql: "" };
  const idx = params.length + 1;
  params.push(tid);
  return { sql: ` AND ${alias}.tenant_id = $${idx}` };
}

let _usuariosTenantCol;
export async function usuariosTenantColumnName() {
  if (_usuariosTenantCol !== undefined) return _usuariosTenantCol;
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios'`
  );
  const names = new Set(cols.rows.map((r) => r.column_name));
  if (names.has("tenant_id")) _usuariosTenantCol = "tenant_id";
  else if (names.has("cliente_id")) _usuariosTenantCol = "cliente_id";
  else _usuariosTenantCol = null;
  return _usuariosTenantCol;
}

const _tableColCache = new Map();
export async function tableHasColumn(tableName, columnName) {
  const k = `${tableName}.${columnName}`;
  if (_tableColCache.has(k)) return _tableColCache.get(k);
  try {
    const c = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
      [tableName, columnName]
    );
    const v = c.rows.length > 0;
    _tableColCache.set(k, v);
    return v;
  } catch {
    _tableColCache.set(k, false);
    return false;
  }
}

/** Pedido por id acotado al tenant cuando `pedidos.tenant_id` existe. */
export async function getPedidoRowInTenant(pedidoId, tenantId) {
  const id = Number(pedidoId);
  const tid = Number(tenantId);
  if (!Number.isFinite(id) || id < 1) return null;
  if (await pedidosTableHasTenantIdColumn()) {
    if (!Number.isFinite(tid) || tid < 1) return null;
    const r = await query(`SELECT * FROM pedidos WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [id, tid]);
    return r.rows[0] || null;
  }
  const r = await query(`SELECT * FROM pedidos WHERE id = $1 LIMIT 1`, [id]);
  return r.rows[0] || null;
}

/** true si no hay columna de tenant en usuarios (no se puede verificar) o el usuario pertenece al tenant. */
export async function usuarioPerteneceATenant(usuarioId, tenantId) {
  const uid = Number(usuarioId);
  const tid = Number(tenantId);
  if (!Number.isFinite(uid) || uid < 1) return false;
  if (!Number.isFinite(tid) || tid < 1) return false;
  const col = await usuariosTenantColumnName();
  if (!col) return true;
  const r = await query(`SELECT 1 FROM usuarios WHERE id = $1 AND ${col} = $2 AND activo = TRUE LIMIT 1`, [uid, tid]);
  return r.rows.length > 0;
}
