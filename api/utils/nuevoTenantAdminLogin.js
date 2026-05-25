/**
 * Resolución de login admin al crear/reutilizar tenant (evita 409 si el login es del mismo tenant).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { normalizeLoginId, loginExistsGlobally } from "./usuarioLoginGlobal.js";

/**
 * @param {string | null | undefined} uCol
 * @param {number} tenantId
 * @returns {Promise<{ id: number, email: string } | null>}
 */
export async function findAdminUsuarioEnTenant(uCol, tenantId) {
  const col = String(uCol || "").trim();
  const tid = Number(tenantId);
  if (!col || !Number.isFinite(tid) || tid < 1) return null;
  const r = await query(
    `SELECT id, email FROM usuarios
     WHERE ${col} = $1 AND lower(rol) IN ('admin', 'administrador') AND COALESCE(activo, TRUE)
     ORDER BY id ASC LIMIT 1`,
    [tid]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return { id: Number(row.id), email: String(row.email || "").trim() };
}

/**
 * @param {string} loginAdmin normalizado
 * @param {number} tenantId
 * @param {string | null} uCol
 */
export async function loginPerteneceAdminDelTenant(loginAdmin, tenantId, uCol) {
  const admin = await findAdminUsuarioEnTenant(uCol, tenantId);
  if (!admin) return false;
  return normalizeLoginId(admin.email) === normalizeLoginId(loginAdmin);
}

/**
 * Login pedido para alta nueva o reutilización sin admin previo.
 * @param {string} loginAdmin ya normalizado o vacío
 * @param {string} nombreTenant
 * @param {{ permitirAutoSiOcupado?: boolean }} [opts]
 * @returns {Promise<{ loginPreferido: string | null, avisoLoginAuto?: string }>}
 */
export async function resolverLoginPreferidoAltaTenant(loginAdmin, nombreTenant, opts = {}) {
  const pref = normalizeLoginId(loginAdmin);
  if (!pref) return { loginPreferido: null };
  const ocupado = await loginExistsGlobally(pref);
  if (!ocupado) return { loginPreferido: pref };
  if (opts.permitirAutoSiOcupado) {
    return {
      loginPreferido: null,
      avisoLoginAuto: `El usuario «${pref}» ya existe en otro tenant; se generó uno automático.`,
    };
  }
  return { loginPreferido: null, rechazar: true };
}
