/**
 * Warm-up de números nuevos Whapi antes de mailings masivos (guía anti-baneo).
 * made by leavera77
 */
import { query } from "../db/neon.js";
import { getWhatsappProviderRaw } from "./whatsappBroadcastPacing.js";

function parseMode() {
  const m = String(process.env.WHAPI_WARMUP_MODE || "off").toLowerCase().trim();
  if (m === "strict" || m === "limited") return m;
  return "off";
}

export function getWarmupDaysRequired() {
  const n = Number(process.env.WHAPI_WARMUP_DAYS_REQUIRED);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

export function computeDaysSinceActivation(activatedAt) {
  if (!activatedAt) return null;
  const t = new Date(activatedAt);
  if (Number.isNaN(t.getTime())) return null;
  return Math.floor((Date.now() - t.getTime()) / 86400000);
}

export async function getClientWarmupRow(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return null;
  try {
    const r = await query(
      `SELECT whapi_activated_at, whapi_warmup_status FROM clientes WHERE id = $1 LIMIT 1`,
      [tid]
    );
    return r.rows?.[0] || null;
  } catch (e) {
    console.warn("[warmup] read clientes", e?.message || e);
    return null;
  }
}

async function hasRecentBroadcastComms(tenantId, hours) {
  const tid = Number(tenantId);
  const h = Math.max(1, Math.min(72, Number(hours) || 1));
  try {
    const r = await query(
      `SELECT 1 FROM comunicaciones_envios
       WHERE tenant_id = $1
         AND created_at >= NOW() - ($2::int * INTERVAL '1 hour')
         AND (meta->>'kind') IN ('community', 'corte_programado')
         AND COALESCE(meta->>'broadcast_status', '') IN ('queued', 'running', 'done')
       LIMIT 1`,
      [tid, h]
    );
    return (r.rows || []).length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * @param {number} tenantId
 * @param {number} requestedDestCount total destinatarios pedidos
 * @returns {Promise<{ allowed: boolean, cap: number, error: string|null, warning: string|null, mode: string, daysSince: number|null }>}
 */
export async function evaluateWarmupForBroadcast(tenantId, requestedDestCount) {
  const mode = parseMode();
  const reqDays = getWarmupDaysRequired();
  const total = Math.max(0, Number(requestedDestCount) || 0);

  if (mode === "off" || getWhatsappProviderRaw() !== "whapi") {
    return { allowed: true, cap: total, error: null, warning: null, mode: "off", daysSince: null };
  }

  const row = await getClientWarmupRow(tenantId);
  const act = row?.whapi_activated_at;
  const days = computeDaysSinceActivation(act);

  if (act == null) {
    if (mode === "strict") {
      return {
        allowed: false,
        cap: 0,
        error: `Warm-up Whapi (strict): falta la fecha whapi_activated_at en clientes. Usá: node api/scripts/init-whapi-number.js ${tenantId}`,
        warning: null,
        mode: "strict",
        daysSince: null,
      };
    }
    if (mode === "limited") {
      return {
        allowed: true,
        cap: total,
        error: null,
        warning:
          "Warm-up: no hay fecha de activación del número (whapi_activated_at). Conviene registrarla para líneas nuevas (guía Whapi).",
        mode: "limited",
        daysSince: null,
      };
    }
    return { allowed: true, cap: total, error: null, warning: null, mode: "off", daysSince: null };
  }

  if (days >= reqDays) {
    return { allowed: true, cap: total, error: null, warning: null, mode, daysSince: days };
  }

  if (mode === "strict") {
    return {
      allowed: false,
      cap: 0,
      error: `El número está en warm-up: ${days}/${reqDays} días desde whapi_activated_at. No se permiten envíos masivos hasta completar el período (modo strict).`,
      warning: null,
      mode: "strict",
      daysSince: days,
    };
  }

  if (mode === "limited") {
    const maxRecipients = 5;
    const capped = Math.min(total, maxRecipients);
    const blockedHour = await hasRecentBroadcastComms(tenantId, 1);
    if (blockedHour) {
      return {
        allowed: false,
        cap: 0,
        error:
          "Warm-up (limited): ya hubo un envío masivo en la última hora. Esperá 60 minutos o desactivá el warm-up (WHAPI_WARMUP_MODE=off).",
        warning: null,
        mode: "limited",
        daysSince: days,
      };
    }
    const warn =
      capped < total
        ? `Warm-up (limited): día ${days}/${reqDays}. Se enviará solo a ${capped} de ${total} destinatarios.`
        : `Warm-up (limited): día ${days}/${reqDays}. Máximo ${maxRecipients} destinatarios por envío hasta completar el período.`;
    return { allowed: true, cap: capped, error: null, warning: warn, mode: "limited", daysSince: days };
  }

  return { allowed: true, cap: total, error: null, warning: null, mode, daysSince: days };
}

export async function getWarmupStatusPayload(tenantId) {
  const mode = parseMode();
  const reqDays = getWarmupDaysRequired();
  const row = await getClientWarmupRow(tenantId);
  const act = row?.whapi_activated_at;
  const daysSince = computeDaysSinceActivation(act);
  const isWarming =
    getWhatsappProviderRaw() === "whapi" &&
    mode !== "off" &&
    act != null &&
    daysSince != null &&
    daysSince < reqDays;

  return {
    mode,
    days_required: reqDays,
    whapi_activated_at: act || null,
    days_since_activation: daysSince,
    is_warming: !!isWarming,
    whapi_warmup_status: row?.whapi_warmup_status || null,
    guide_url: "https://support.whapi.cloud/help-desk/blocking/how-to-do-mailings-without-the-risk-of-being-blocked",
  };
}
