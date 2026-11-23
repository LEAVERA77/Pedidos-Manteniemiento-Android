import { query } from "../db/neon.js";

/**
 * Resuelve el id de cliente/tenant asociado al usuario (tenant_id o cliente_id).
 */
export async function getUserTenantId(userId) {
  try {
    const cols = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios'`,
      [], { bypassCache: true }
    );
    const hasTenant = cols.rows.some((c) => c.column_name === "tenant_id");
    const hasCliente = cols.rows.some((c) => c.column_name === "cliente_id");
    if (!hasTenant && !hasCliente) return 1;

    const sql = hasTenant
      ? "SELECT COALESCE(tenant_id, 1) AS tenant_id FROM usuarios WHERE id = $1 LIMIT 1"
      : "SELECT COALESCE(cliente_id, 1) AS tenant_id FROM usuarios WHERE id = $1 LIMIT 1";
    const r = await query(sql, [userId], { bypassCache: true });
    return Number(r.rows?.[0]?.tenant_id || 1);
  } catch (_) {
    return 1;
  }
}

/**
 * Lectura estricta para la autorización HTTP. No inventa un tenant ante
 * ausencia, dato inválido o error de BD y no comparte resultados de caché.
 * Un null indica cuenta sin asignación válida; los fallos de BD se propagan.
 */
export async function getUserTenantIdStrict(userId) {
  const uid = Number(userId);
  if (!Number.isSafeInteger(uid) || uid < 1) return null;
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios'`,
    [], { bypassCache: true }
  );
  const names = new Set(cols.rows.map((c) => c.column_name));
  const col = names.has("tenant_id") ? "tenant_id" : names.has("cliente_id") ? "cliente_id" : null;
  if (!col) return null;
  const r = await query(
    `SELECT u.${col} AS tenant_id FROM usuarios u
     JOIN clientes c ON c.id = u.${col} AND COALESCE(c.activo, TRUE) = TRUE
     WHERE u.id = $1 AND u.activo = TRUE LIMIT 1`,
    [uid], { bypassCache: true }
  );
  const tid = Number(r.rows?.[0]?.tenant_id);
  return Number.isSafeInteger(tid) && tid > 0 ? tid : null;
}
