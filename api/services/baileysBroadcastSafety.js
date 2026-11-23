/** Salvaguardas para masivos de una sesión Baileys. No garantizan evitar sanciones. */
import { pool, rawQuery } from "../db/neon.js";

let unresolvedLocalStop = false;
export function tripLocalBaileysBroadcastStop() { unresolvedLocalStop = true; }

export function baileysSessionId() {
  return String(process.env.BAILEYS_SESSION_ID || "default").trim() || "default";
}

// Identidad compartida por el envío y los mensajes entrantes (móvil argentino con 9).
export function normalizeBaileysBroadcastPhone(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("54") && d.length >= 11 && d.length <= 13 && d.charAt(2) !== "9") return `549${d.slice(2)}`;
  return d;
}

export function isBaileysBroadcastStop(text) {
  const s = String(text || "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
  return /^(?:stop|baja|cancelar avisos|no quiero recibir avisos)[.!\s]*$/.test(s);
}

/** La baja afecta a la línea compartida entera, incluso si luego cambia el tenant activo. */
export async function recordBaileysBroadcastStop(phone) {
  const digits = normalizeBaileysBroadcastPhone(phone);
  if (digits.length < 10) throw new Error("Número de baja inválido");
  await rawQuery(
    `INSERT INTO baileys_broadcast_opt_out (session_id, phone_digits, created_at)
     VALUES ($1, $2, NOW()) ON CONFLICT (session_id, phone_digits) DO NOTHING`,
    [baileysSessionId(), digits]
  );
}

/** Un STOP de identidad no resoluble bloquea la línea hasta revisión manual. */
export async function pauseBaileysBroadcastForUnresolvedStop() {
  await rawQuery(
    `INSERT INTO baileys_broadcast_safety_state (session_id, paused, reason, updated_at)
     VALUES ($1, TRUE, 'STOP sin número de teléfono resoluble', NOW())
     ON CONFLICT (session_id) DO UPDATE SET paused = TRUE, reason = EXCLUDED.reason, updated_at = NOW()`,
    [baileysSessionId()]
  );
}

/** La sesión QR es compartida; no enviar campañas para un tenant distinto del seleccionado. */
export async function assertBaileysBroadcastTenant(tenantId) {
  const result = await rawQuery("SELECT value FROM configuracion WHERE key = $1 LIMIT 1", ["whatsapp_bot_active_target"]);
  const value = result.rows?.[0]?.value;
  const target = typeof value === 'string' ? JSON.parse(value) : value;
  if (!target || target.locked !== true || Number(target.tenant_id ?? target.tenantId) !== Number(tenantId)) {
    throw new Error('La sesión Baileys no está fijada a esta entidad. Revisá el selector del QR.');
  }
}

/** Sin tabla o sin conexión se falla cerrado: no enviar masivos sin poder comprobar bajas. */
export async function filterBaileysBroadcastOptOut(phones) {
  const list = Array.isArray(phones) ? phones : [];
  if (unresolvedLocalStop) throw new Error('Masivos Baileys pausados en este proceso: no se pudo registrar una baja.');
  const state = await rawQuery('SELECT paused FROM baileys_broadcast_safety_state WHERE session_id = $1', [baileysSessionId()]);
  if (state.rows?.[0]?.paused) throw new Error('Masivos Baileys pausados: hay una baja que requiere revisión manual.');
  const digits = list.map(normalizeBaileysBroadcastPhone);
  const result = await rawQuery(
    `SELECT phone_digits FROM baileys_broadcast_opt_out WHERE session_id = $1 AND phone_digits = ANY($2::text[])`,
    [baileysSessionId(), digits]
  );
  const blocked = new Set((result.rows || []).map((r) => r.phone_digits));
  return list.filter((_, i) => !blocked.has(digits[i]));
}

/** Exclusión entre procesos para campañas de la misma sesión. El lock se libera también al perder la conexión. */
export async function withBaileysBroadcastLease(fn) {
  const client = await pool.connect();
  let locked = false;
  let connectionError = null;
  const onError = (err) => { connectionError = err; };
  client.on('error', onError);
  try {
    await client.query('BEGIN');
    const result = await client.query("SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS locked", [
      "baileys_broadcast", baileysSessionId(),
    ]);
    locked = result.rows?.[0]?.locked === true;
    if (!locked) throw new Error("Ya hay un envío masivo activo en esta sesión Baileys.");
    const checkLease = async () => {
      if (connectionError) throw new Error('Se perdió el bloqueo de la sesión Baileys.');
      await client.query('SELECT 1');
      if (connectionError) throw new Error('Se perdió el bloqueo de la sesión Baileys.');
    };
    return await fn(checkLease);
  } finally {
    if (!connectionError) {
      try { await client.query('ROLLBACK'); }
      catch (e) { connectionError = e; }
    }
    client.removeListener('error', onError);
    client.release(connectionError || undefined);
    if (locked && connectionError) throw new Error('Se perdió el bloqueo de la sesión Baileys.');
  }
}
