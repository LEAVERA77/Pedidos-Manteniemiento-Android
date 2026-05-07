/**
 * Envío de texto vía Evolution API (WhatsApp Web, sin Cloud API de Meta).
 * Documentación v2: https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
 * made by leavera77
 */

import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";

const EVOLUTION_API_URL = String(process.env.EVOLUTION_API_URL || "http://localhost:8080")
  .trim()
  .replace(/\/+$/, "");
const EVOLUTION_API_KEY = String(process.env.EVOLUTION_API_KEY || "gestornova-evolution-2026").trim();
const EVOLUTION_INSTANCE = String(process.env.EVOLUTION_INSTANCE || "gestornova").trim();

function evolutionHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: EVOLUTION_API_KEY,
  };
}

/**
 * Mismo criterio de dígitos que Meta outbound (AR móvil internacional).
 * @param {string} phone
 */
export function normalizePhoneNumber(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return normalizeWhatsAppRecipientForMeta(d, { mode: "outbound" });
}

/**
 * Envía texto por Evolution API v2.
 * @param {string} toDigits solo dígitos
 * @param {string} text
 */
export async function sendText(toDigits, text) {
  const number = normalizePhoneNumber(toDigits);
  const url = `${EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`;
  const payload = { number, text: String(text || "").trim() };

  console.log("[evolution-whatsapp] enviando mensaje", {
    toLen: number.length,
    textLen: payload.text.length,
    instance: EVOLUTION_INSTANCE,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: evolutionHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("[evolution-whatsapp] error HTTP", response.status, data);
      return { ok: false, error: data };
    }

    console.log("[evolution-whatsapp] enviado OK");
    return { ok: true, data };
  } catch (error) {
    console.error("[evolution-whatsapp] excepción:", error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}

/** GET /instance/connectionState/{instance} */
export async function checkInstanceStatus() {
  const url = `${EVOLUTION_API_URL}/instance/connectionState/${encodeURIComponent(EVOLUTION_INSTANCE)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { apikey: EVOLUTION_API_KEY },
    });

    const data = await response.json().catch(() => ({}));
    return data;
  } catch (error) {
    console.error("[evolution-whatsapp] error al verificar estado:", error?.message || error);
    return { state: "error", error: error?.message || String(error) };
  }
}

/** GET /instance/connect/{instance} — QR / pairing */
export async function getInstanceQR() {
  const url = `${EVOLUTION_API_URL}/instance/connect/${encodeURIComponent(EVOLUTION_INSTANCE)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { apikey: EVOLUTION_API_KEY },
    });

    const data = await response.json().catch(() => ({}));
    return data;
  } catch (error) {
    console.error("[evolution-whatsapp] error al obtener connect:", error?.message || error);
    return { error: error?.message || String(error) };
  }
}
