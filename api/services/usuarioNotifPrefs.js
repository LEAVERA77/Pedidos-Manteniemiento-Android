/**
 * Preferencias de notificaciones móvil por usuario.
 * made by leavera77
 */

import { query } from "../db/neon.js";

const DEFAULTS = {
  asignacion: true,
  chat_interno: true,
  cierre_pedido: true,
  derivacion: true,
  whatsapp: true,
};

let _colOk = null;

async function columnOk() {
  if (_colOk != null) return _colOk;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'notif_prefs' LIMIT 1`
    );
    _colOk = r.rows.length > 0;
    if (!_colOk) {
      await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS notif_prefs JSONB DEFAULT NULL`);
      _colOk = true;
    }
  } catch {
    _colOk = false;
  }
  return _colOk;
}

function mergePrefs(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof o[k] === "boolean") out[k] = o[k];
  }
  return out;
}

export async function getUsuarioNotifPrefs(usuarioId) {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid) || uid < 1) return { ...DEFAULTS };
  if (!(await columnOk())) return { ...DEFAULTS };
  try {
    const r = await query(`SELECT notif_prefs FROM usuarios WHERE id = $1 LIMIT 1`, [uid]);
    return mergePrefs(r.rows?.[0]?.notif_prefs);
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setUsuarioNotifPrefs(usuarioId, prefs) {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid) || uid < 1) throw new Error("usuario_invalido");
  if (!(await columnOk())) throw new Error("notif_prefs_no_disponible");
  const merged = mergePrefs(prefs);
  await query(`UPDATE usuarios SET notif_prefs = $2::jsonb WHERE id = $1`, [uid, JSON.stringify(merged)]);
  return merged;
}

/**
 * @param {number} usuarioId
 * @param {string} categoria asignacion|chat_interno|cierre_pedido|derivacion|whatsapp
 */
export async function usuarioPermiteNotifMovil(usuarioId, categoria) {
  const prefs = await getUsuarioNotifPrefs(usuarioId);
  const key = String(categoria || "").trim() || "asignacion";
  if (prefs[key] === false) return false;
  return true;
}
