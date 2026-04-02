/**
 * Envío de mensajes de texto vía WhatsApp Cloud API (Meta).
 * Graph API v21 — recipient_type individual (recomendado en docs recientes).
 */

const rawVer = String(process.env.META_GRAPH_API_VERSION || "v21.0").trim();
const GRAPH_VERSION = (rawVer.startsWith("v") ? rawVer : `v${rawVer}`) || "v21.0";

export async function sendWhatsAppText(toDigits, bodyText) {
  const token = process.env.META_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID || "";
  if (!token || !phoneNumberId) {
    console.error("[meta-whatsapp] missing META_ACCESS_TOKEN or META_PHONE_NUMBER_ID");
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
    to,
    type: "text",
    text: { preview_url: false, body },
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
    const errPart = graph?.error
      ? `${graph.error.message || "graph_error"} (code ${graph.error.code ?? "?"}, subcode ${graph.error.error_subcode ?? "?"})`
      : JSON.stringify(graph).slice(0, 400);
    console.error("[meta-whatsapp] Graph API error", { status: resp.status, to: to.slice(0, 4) + "…", detail: errPart });
    if (graph?.error?.code === 190) {
      console.error(
        "[meta-whatsapp] Token Meta expirado o inválido: en developers.facebook.com generá un token de acceso (System User o de larga duración) y actualizá META_ACCESS_TOKEN en Render (o el host donde corre la API)."
      );
    }
    return { ok: false, status: resp.status, graph };
  }
  if (graph?.error) {
    console.error("[meta-whatsapp] Graph body error", graph.error);
    return { ok: false, status: resp.status || 502, graph };
  }
  console.log("[meta-whatsapp] mensaje enviado OK", { to: to.slice(0, 4) + "…", messageId: graph?.messages?.[0]?.id || "—" });
  return { ok: true, graph };
}

/** Alias histórico en el código. */
export async function metaSendWhatsAppText(toDigits, bodyText) {
  return sendWhatsAppText(toDigits, bodyText);
}
