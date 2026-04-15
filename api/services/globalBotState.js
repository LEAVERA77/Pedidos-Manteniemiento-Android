import { query } from "../db/neon.js";

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

export function isPhoneWhatsappBotMaster(phoneDigits) {
  const p = String(phoneDigits || "").replace(/\D/g, "");
  if (!p || p.length < 8) return false;
  const list = masterPhonesWhatsappBotFromEnv();
  if (!list.length) return false;
  return list.some((m) => {
    if (!m) return false;
    if (p === m) return true;
    if (p.length >= 10 && m.length >= 10 && p.slice(-10) === m.slice(-10)) return true;
    return p.endsWith(m) || m.endsWith(p);
  });
}
