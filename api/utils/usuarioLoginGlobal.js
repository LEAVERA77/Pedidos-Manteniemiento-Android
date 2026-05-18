/**
 * Unicidad global del login (columna usuarios.email).
 * made by leavera77
 */
import { query } from "../db/neon.js";

export function normalizeLoginId(raw) {
  return String(raw || "").trim();
}

/**
 * @param {string} login
 * @param {number} [excludeUserId]
 */
export async function loginExistsGlobally(login, excludeUserId) {
  const id = normalizeLoginId(login);
  if (!id) return false;
  const ex = Number(excludeUserId);
  const r = Number.isFinite(ex) && ex > 0
    ? await query(
        `SELECT id FROM usuarios WHERE lower(btrim(email)) = lower(btrim($1::text)) AND id <> $2 LIMIT 1`,
        [id, ex]
      )
    : await query(
        `SELECT id FROM usuarios WHERE lower(btrim(email)) = lower(btrim($1::text)) LIMIT 1`,
        [id]
      );
  return r.rows.length > 0;
}
