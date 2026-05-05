/**
 * WhatsApp vía Whapi.cloud (gate.whapi.cloud).
 * Envío: POST /messages/text — docs: https://whapi.readme.io/reference/sendmessagetext
 *
 * El bot usa la misma identidad que Meta (549…→543… en inbound). Graph espera 543…;
 * la API de Whapi suele necesitar el móvil completo 549… para entregar al usuario.
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
 * Convierte dígitos internos (p. ej. 543… tras normalizar Meta) a E.164 para Whapi.
 * Meta inbound hace 549xxxxxxxx → 54 + slice(3) = 543…; la inversa es 549 + slice(2),
 * no slice(3) (si no, se desplazan dígitos y el mensaje va a otro número).
 * @param {string} rawDigits
 * @returns {string}
 */
export function digitsForWhapiSend(rawDigits) {
  const d = String(rawDigits || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("543") && d.length >= 11 && d.length <= 13) {
    return `549${d.slice(2)}`;
  }
  if (
    d.startsWith("54") &&
    d.length >= 11 &&
    d.length <= 13 &&
    d.charAt(2) !== "9"
  ) {
    return `549${d.slice(2)}`;
  }
  return d;
}

/**
 * @param {string} toDigits Dígitos del destinatario (sin +), ej. 54911...
 * @param {string} text Cuerpo del mensaje
 * @returns {Promise<{ ok: boolean, data?: object, error?: unknown }>}
 */
/**
 * Descarga binario de un medio Whapi por ID (mismo token que envío).
 * @see https://support.whapi.cloud/help-desk/receiving/http-api/how-to-retrieve-files
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function downloadWhapiMediaBuffer(mediaId) {
  const mid = String(mediaId || "").trim();
  if (!mid || !WHAPI_API_KEY) {
    throw new Error("missing_whapi_media_id_or_key");
  }
  const url = `${WHAPI_API_URL}/media/${encodeURIComponent(mid)}`;
  const r = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${WHAPI_API_KEY}`,
    },
  });
  if (!r.ok) {
    const snippet = (await r.text().catch(() => "")).slice(0, 200);
    throw new Error(`whapi_media_http_${r.status}:${snippet}`);
  }
  const ct = String(r.headers.get("content-type") || "").split(";")[0].trim() || "application/octet-stream";
  const buf = Buffer.from(await r.arrayBuffer());
  return { buffer: buf, contentType: ct };
}

export async function sendText(toDigits, text) {
  const to = digitsForWhapiSend(String(toDigits || "").replace(/\D/g, ""));
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
    const errInBody =
      data &&
      typeof data === "object" &&
      (data.error != null ||
        data.errors != null ||
        data.sent === false ||
        String(data.status || "").toLowerCase() === "error");
    if (errInBody) {
      console.error("[whapi] sendText: HTTP 200 pero cuerpo indica fallo", data);
      return { ok: false, error: data, data };
    }
    const tail = to.length >= 8 ? `${to.slice(0, 4)}…${to.slice(-4)}` : "(corto)";
    const preview = JSON.stringify(data).slice(0, 320);
    console.log("[whapi] sendText ok", { to: tail, bodyLen: body.length, responsePreview: preview });
    return { ok: true, data };
  } catch (e) {
    console.error("[whapi] sendText:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
