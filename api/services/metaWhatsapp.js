/**
 * Envío de mensajes de texto vía WhatsApp Cloud API (Meta).
 * Graph API v21 — recipient_type individual (recomendado en docs recientes).
 */

const GRAPH_VERSION = "v21.0";

export async function sendWhatsAppText(toDigits, bodyText) {
  const token = process.env.META_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID || "";
  if (!token || !phoneNumberId) {
    return { ok: false, error: "missing_meta_credentials" };
  }
  const to = String(toDigits || "").replace(/\D/g, "");
  const body = String(bodyText || "").trim();
  if (!to || !body) {
    return { ok: false, error: "invalid_params" };
  }

  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  };

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const graph = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, status: resp.status, graph };
  }
  return { ok: true, graph };
}

/** Alias histórico en el código. */
export async function metaSendWhatsAppText(toDigits, bodyText) {
  return sendWhatsAppText(toDigits, bodyText);
}
