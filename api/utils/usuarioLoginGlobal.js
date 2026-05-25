/**
 * Unicidad global del login (columna usuarios.email).
 * made by leavera77
 */
import { query } from "../db/neon.js";

export function normalizeLoginId(raw) {
  return String(raw || "").trim().toLowerCase();
}

/** Evita guardar o comparar un hash bcrypt como si fuera contraseña en texto plano. */
export function parecePasswordHashBcrypt(raw) {
  const t = String(raw || "").trim();
  return /^\$2[aby]\$\d{2}\$/.test(t);
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
