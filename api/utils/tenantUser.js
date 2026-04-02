import { query } from "../db/neon.js";

/**
 * Resuelve el id de cliente/tenant asociado al usuario (tenant_id o cliente_id).
 */
export async function getUserTenantId(userId) {
  try {
    const cols = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios'`
    );
    const hasTenant = cols.rows.some((c) => c.column_name === "tenant_id");
    const hasCliente = cols.rows.some((c) => c.column_name === "cliente_id");
    if (!hasTenant && !hasCliente) return 1;

    const sql = hasTenant
      ? "SELECT COALESCE(tenant_id, 1) AS tenant_id FROM usuarios WHERE id = $1 LIMIT 1"
      : "SELECT COALESCE(cliente_id, 1) AS tenant_id FROM usuarios WHERE id = $1 LIMIT 1";
    const r = await query(sql, [userId]);
    return Number(r.rows?.[0]?.tenant_id || 1);
  } catch (_) {
    return 1;
  }
}
