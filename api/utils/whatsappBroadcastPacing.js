/**
 * Pacing anti-bloqueo para envíos masivos WhatsApp (Whapi no limita por servidor;
 * conviene jitter, pausas por tanda y límites — ver guía Whapi mailings).
 * https://support.whapi.cloud/help-desk/blocking/how-to-do-mailings-without-the-risk-of-being-blocked
 * made by leavera77
 */

import { randomInt } from "node:crypto";

function parseIntEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function getWhatsappProviderRaw() {
  return String(process.env.WHATSAPP_PROVIDER || "meta").toLowerCase().trim();
}

/**
 * @returns {{
 *   delayMinMs: number,
 *   delayMaxMs: number,
 *   batchEvery: number,
 *   batchPauseMinMs: number,
 *   batchPauseMaxMs: number,
 *   maxPerJob: number,
 *   maxPerDay: number,
 *   isWhapi: boolean,
 * }}
 */
export function getBroadcastPacingConfig() {
  const isWhapi = getWhatsappProviderRaw() === "whapi";
  if (isWhapi) {
    return {
      delayMinMs: parseIntEnv("WHAPI_BROADCAST_DELAY_MIN_MS", 30_000),
      delayMaxMs: Math.max(
        parseIntEnv("WHAPI_BROADCAST_DELAY_MIN_MS", 30_000),
        parseIntEnv("WHAPI_BROADCAST_DELAY_MAX_MS", 90_000)
      ),
      batchEvery: parseIntEnv("WHAPI_BROADCAST_BATCH_EVERY", 15),
      batchPauseMinMs: parseIntEnv("WHAPI_BROADCAST_BATCH_PAUSE_MIN_MS", 120_000),
      batchPauseMaxMs: Math.max(
        parseIntEnv("WHAPI_BROADCAST_BATCH_PAUSE_MIN_MS", 120_000),
        parseIntEnv("WHAPI_BROADCAST_BATCH_PAUSE_MAX_MS", 300_000)
      ),
      maxPerJob: parseIntEnv("WHAPI_BROADCAST_MAX_PER_JOB", 0),
      maxPerDay: parseIntEnv("WHAPI_BROADCAST_MAX_PER_DAY", 0),
      isWhapi: true,
    };
  }
  return {
    delayMinMs: parseIntEnv("BROADCAST_DELAY_MIN_MS", 400),
    delayMaxMs: Math.max(parseIntEnv("BROADCAST_DELAY_MIN_MS", 400), parseIntEnv("BROADCAST_DELAY_MAX_MS", 1200)),
    batchEvery: parseIntEnv("BROADCAST_BATCH_EVERY", 50),
    batchPauseMinMs: parseIntEnv("BROADCAST_BATCH_PAUSE_MIN_MS", 2000),
    batchPauseMaxMs: Math.max(
      parseIntEnv("BROADCAST_BATCH_PAUSE_MIN_MS", 2000),
      parseIntEnv("BROADCAST_BATCH_PAUSE_MAX_MS", 8000)
    ),
    maxPerJob: parseIntEnv("BROADCAST_MAX_PER_JOB", 0),
    maxPerDay: parseIntEnv("BROADCAST_MAX_PER_DAY", 0),
    isWhapi: false,
  };
}

/** Entero aleatorio en [min, max] inclusive (randomInt max es exclusivo en Node). */
export function randomDelayMs(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi <= 0) return 0;
  return randomInt(lo, hi + 1);
}

export async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Pausa entre un mensaje y el siguiente (después del envío índice `sentIndex` 0-based).
 */
export async function sleepAfterOutgoingMessage(cfg, sentIndex) {
  const n = sentIndex + 1;
  if (cfg.batchEvery > 0 && n % cfg.batchEvery === 0) {
    await sleep(randomDelayMs(cfg.batchPauseMinMs, cfg.batchPauseMaxMs));
  }
  await sleep(randomDelayMs(cfg.delayMinMs, cfg.delayMaxMs));
}

export function getBroadcastSyncMaxRecipients() {
  return parseIntEnv("BROADCAST_SYNC_MAX_RECIPIENTS", 5);
}

/** Texto opcional al pie del mensaje (opt-out STOP). */
export function getBroadcastFooterText() {
  const t = String(process.env.BROADCAST_FOOTER_ES || "").trim();
  if (t) return t;
  return "Si no querés recibir más avisos, respondé STOP.";
}

export function appendBroadcastFooter(bodyText) {
  const base = String(bodyText || "").trimEnd();
  const foot = getBroadcastFooterText();
  if (!foot) return base;
  if (base.includes(foot)) return base;
  return `${base}\n\n${foot}`;
}
