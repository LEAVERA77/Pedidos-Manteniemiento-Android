/**
 * WhatsApp vía Whapi.cloud (gate.whapi.cloud).
 * Envío: POST /messages/text — docs: https://whapi.readme.io/reference/sendmessagetext
 * made by leavera77
 */

const WHAPI_API_URL = String(process.env.WHAPI_API_URL || "https://gate.whapi.cloud")
  .trim()
  .replace(/\/+$/, "");
const WHAPI_API_KEY = String(process.env.WHAPI_API_KEY || "").trim();

function headers() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${WHAPI_API_KEY}`,
  };
}

/**
 * @param {string} toDigits Dígitos del destinatario (sin +), ej. 54911...
 * @param {string} text Cuerpo del mensaje
 * @returns {Promise<{ ok: boolean, data?: object, error?: unknown }>}
 */
export async function sendText(toDigits, text) {
  const to = String(toDigits || "").replace(/\D/g, "");
  const body = String(text || "").trim();
  if (!to || !body) {
    return { ok: false, error: "invalid_params" };
  }
  if (!WHAPI_API_KEY) {
    console.error("[whapi] WHAPI_API_KEY vacío");
    return { ok: false, error: "missing_whapi_api_key" };
  }

  const url = `${WHAPI_API_URL}/messages/text`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ to, body }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[whapi] sendText HTTP", response.status, data);
      return { ok: false, error: data, data };
    }
    return { ok: true, data };
  } catch (e) {
    console.error("[whapi] sendText:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
