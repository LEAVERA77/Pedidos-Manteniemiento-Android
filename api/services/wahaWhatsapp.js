/**
 * Servicio de WhatsApp usando WAHA (WhatsApp HTTP API).
 * Docs: https://waha.devlike.pro/docs/how-to/send-messages/
 * made by leavera77
 */

import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";

const WAHA_API_URL = String(process.env.WAHA_API_URL || "http://localhost:3080")
  .trim()
  .replace(/\/+$/, "");
const WAHA_API_KEY = String(process.env.WAHA_API_KEY || "gestornova-waha-2026").trim();
const WAHA_SESSION = String(process.env.WAHA_SESSION || "gestornova").trim();

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": WAHA_API_KEY,
  };
}

/**
 * Crea la sesión si no existe (POST /api/sessions) y opcionalmente la arranca.
 */
export async function ensureSessionExists() {
  const url = `${WAHA_API_URL}/api/sessions/${encodeURIComponent(WAHA_SESSION)}`;
  try {
    const response = await fetch(url, { method: "GET", headers: getHeaders() });
    if (response.status === 404) {
      const cr = await fetch(`${WAHA_API_URL}/api/sessions`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name: WAHA_SESSION, start: true }),
      });
      const data = await cr.json().catch(() => ({}));
      if (!cr.ok) {
        console.error("[waha] crear sesión HTTP", cr.status, data);
        return { error: data?.message || data?.error || "create_failed", data };
      }
      return data;
    }
    return await response.json().catch(() => ({}));
  } catch (e) {
    console.error("[waha] ensureSessionExists:", e?.message || e);
    return { error: e?.message || String(e) };
  }
}

/**
 * QR en formato raw (JSON con `value`) — GET /api/{session}/auth/qr?format=raw
 */
export async function getQR() {
  const url = `${WAHA_API_URL}/api/${encodeURIComponent(WAHA_SESSION)}/auth/qr?format=raw`;
  try {
    const response = await fetch(url, { method: "GET", headers: getHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[waha] QR HTTP", response.status, data);
      return { error: data?.message || data?.error || `http_${response.status}`, data };
    }
    return data;
  } catch (error) {
    console.error("[waha] Error obteniendo QR:", error.message);
    return { error: error.message };
  }
}

/**
 * GET /api/sessions/{session}
 */
export async function getSessionStatus() {
  const url = `${WAHA_API_URL}/api/sessions/${encodeURIComponent(WAHA_SESSION)}`;
  try {
    const response = await fetch(url, { method: "GET", headers: getHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: data?.message || data?.error || `http_${response.status}`, status: data?.status };
    }
    return data;
  } catch (error) {
    console.error("[waha] Error obteniendo estado:", error.message);
    return { error: error.message };
  }
}

function chatIdFromDigits(toDigits) {
  const num = normalizeWhatsAppRecipientForMeta(String(toDigits || "").replace(/\D/g, ""), {
    mode: "outbound",
  });
  if (!num) return "";
  return `${num}@c.us`;
}

/**
 * POST /api/sendText
 */
export async function sendText(toDigits, text) {
  const chatId = chatIdFromDigits(toDigits);
  const body = String(text || "").trim();
  if (!chatId || !body) {
    return { ok: false, error: "invalid_params" };
  }

  const url = `${WAHA_API_URL}/api/sendText`;
  const payload = {
    session: WAHA_SESSION,
    chatId,
    text: body,
  };

  console.log("[waha] Enviando mensaje:", { chatIdLen: chatId.length, textLen: body.length });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("[waha] Error enviando mensaje:", data);
      return { ok: false, error: data };
    }

    console.log("[waha] Mensaje enviado correctamente");
    return { ok: true, data };
  } catch (error) {
    console.error("[waha] Excepción enviando mensaje:", error.message);
    return { ok: false, error: error.message };
  }
}

export async function startSession() {
  const url = `${WAHA_API_URL}/api/sessions/${encodeURIComponent(WAHA_SESSION)}/start`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[waha] start HTTP", response.status, data);
      return { error: data?.message || data?.error || `http_${response.status}`, data };
    }
    return data;
  } catch (error) {
    console.error("[waha] Error iniciando sesión:", error.message);
    return { error: error.message };
  }
}

export async function stopSession() {
  const url = `${WAHA_API_URL}/api/sessions/${encodeURIComponent(WAHA_SESSION)}/stop`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: data?.message || data?.error || `http_${response.status}`, data };
    }
    return data;
  } catch (error) {
    console.error("[waha] Error deteniendo sesión:", error.message);
    return { error: error.message };
  }
}
