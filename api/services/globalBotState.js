import { query } from "../db/neon.js";
import { usuariosTenantColumnName } from "../utils/tenantScope.js";
import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";

let _tableExists;

async function globalBotTableExists() {
  if (_tableExists !== undefined) return _tableExists;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'global_bot_state' LIMIT 1`
    );
    _tableExists = r.rows.length > 0;
  } catch {
    _tableExists = false;
  }
  return _tableExists;
}

/**
 * @returns {Promise<boolean|null>} true/false si hay tabla; null si no existe migración (solo aplica env).
 */
export async function getGlobalBotActiveDb() {
  if (!(await globalBotTableExists())) return null;
  const r = await query(`SELECT bot_active FROM global_bot_state WHERE id = 1 LIMIT 1`);
  if (!r.rows.length) return true;
  return r.rows[0].bot_active !== false;
}

export async function setGlobalBotActiveDb(active, updatedByPhoneDigits = null) {
  const phone = updatedByPhoneDigits ? String(updatedByPhoneDigits).replace(/\D/g, "").slice(0, 32) : null;
  await query(
    `INSERT INTO global_bot_state (id, bot_active, updated_at, updated_by_phone)
     VALUES (1, $1::boolean, NOW(), $2)
     ON CONFLICT (id) DO UPDATE SET
       bot_active = EXCLUDED.bot_active,
       updated_at = NOW(),
       updated_by_phone = EXCLUDED.updated_by_phone`,
    [!!active, phone]
  );
}

export function whatsappBotEnvHardDisabled() {
  const v = String(process.env.WHATSAPP_BOT_ENABLED || "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

/** Bot automático de reclamos apagado solo por BD (env sigue habilitado). */
export async function isGlobalBotInhibitedByDb() {
  const a = await getGlobalBotActiveDb();
  if (a === null) return false;
  return a === false;
}

/** Desactivación efectiva del flujo automático: env en off, o BD en off cuando la tabla existe. */
export async function isWhatsAppAutomatedBotDisabled() {
  if (whatsappBotEnvHardDisabled()) return true;
  return await isGlobalBotInhibitedByDb();
}

export function masterPhonesWhatsappBotFromEnv() {
  const raw = String(
    process.env.WHATSAPP_BOT_MASTER_PHONE || process.env.WHATSAPP_BOT_MASTER_PHONES || ""
  ).trim();
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => String(s).replace(/\D/g, ""))
    .filter(Boolean);
}

/** Solo dígitos con longitud mínima (evita MASTER=549 que bloqueaba fallback a BD). */
export function masterPhonesValidFromEnv() {
  return masterPhonesWhatsappBotFromEnv().filter((s) => String(s).replace(/\D/g, "").length >= 8);
}

/** Misma regla que el webhook (549… → 54… inbound) para comparar con telefono en Neon. */
export function normalizePhoneForBotMasterMatch(digits) {
  return normalizeWhatsAppRecipientForMeta(String(digits || "").replace(/\D/g, ""), { mode: "inbound" });
}

/** Comparación laxa entre identidades WA ya normalizadas (inbound AR). */
export function digitsWaPhoneLikelyEqual(aDigits, bDigits) {
  const p = normalizePhoneForBotMasterMatch(aDigits);
  const q = normalizePhoneForBotMasterMatch(bDigits);
  if (!p || !q || p.length < 8 || q.length < 8) return false;
  if (p === q) return true;
  if (p.length >= 10 && q.length >= 10 && p.slice(-10) === q.slice(-10)) return true;
  return p.endsWith(q) || q.endsWith(p);
}

/**
 * Mensaje tipo *Desactivar*, signos, espacios raros de WhatsApp (ZWSP), etc.
 */
export function parseActivarDesactivarComando(text) {
  let s = String(text || "")
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  s = s.replace(/^\*+/, "").replace(/\*+$/, "").trim();
  s = s.replace(/^[\s¡¿"'`´.,_:;\-–—]+/g, "").trim();
  const low = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/^activar\b/.test(low)) return "activar";
  if (/^desactivar\b/.test(low)) return "desactivar";
  return null;
}

export function isPhoneWhatsappBotMaster(phoneDigits) {
  const p = normalizePhoneForBotMasterMatch(phoneDigits);
  if (!p || p.length < 8) return false;
  const list = masterPhonesValidFromEnv();
  if (!list.length) return false;
  return list.some((m) => digitsWaPhoneLikelyEqual(p, m));
}

async function phoneMatchesTenantAdminDigits(phoneDigits, tenantId) {
  const p = normalizePhoneForBotMasterMatch(phoneDigits);
  if (!p || p.length < 8) return false;

  const tid = Number(tenantId ?? process.env.WHATSAPP_BOT_TENANT_ID ?? 1);
  if (!Number.isFinite(tid) || tid < 1) return false;

  const col = await usuariosTenantColumnName();
  let rows;
  try {
    if (col) {
      rows = await query(
        `SELECT telefono, whatsapp_notificaciones FROM usuarios
         WHERE ${col} = $1 AND activo = TRUE
           AND LOWER(TRIM(COALESCE(rol, ''))) IN ('admin', 'administrador')`,
        [tid]
      );
    } else {
      rows = await query(
        `SELECT telefono, whatsapp_notificaciones FROM usuarios
         WHERE activo = TRUE
           AND LOWER(TRIM(COALESCE(rol, ''))) IN ('admin', 'administrador')`
      );
    }
  } catch (e) {
    console.warn("[global-bot-state] master DB lookup", e?.message || e);
    return false;
  }

  for (const row of rows.rows || []) {
    if (digitsWaPhoneLikelyEqual(p, row.telefono) || digitsWaPhoneLikelyEqual(p, row.whatsapp_notificaciones)) {
      return true;
    }
  }
  return false;
}

/**
 * Autorizado si coincide WHATSAPP_BOT_MASTER_PHONE(S) válido (≥8 dígitos) **o**
 * teléfono/whatsapp_notificaciones de un admin del tenant (misma normalización AR que el webhook).
 */
export async function isPhoneWhatsappBotMasterAsync(phoneDigits, tenantId) {
  if (isPhoneWhatsappBotMaster(phoneDigits)) return true;
  return phoneMatchesTenantAdminDigits(phoneDigits, tenantId);
}
