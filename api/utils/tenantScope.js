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
