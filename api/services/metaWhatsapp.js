/**
 * Envío de mensajes de texto vía WhatsApp Cloud API (Meta).
 * Graph API v21 — recipient_type individual (recomendado en docs recientes).
 */

const rawVer = String(process.env.META_GRAPH_API_VERSION || "v21.0").trim();
const GRAPH_VERSION = (rawVer.startsWith("v") ? rawVer : `v${rawVer}`) || "v21.0";

/**
 * Móviles Argentina en WhatsApp Cloud API: formato internacional sin + es 549 + código de área + abonado.
 * Si Meta envía 54 + área sin el 9 (ej. 5411… en lugar de 54911…), Graph puede fallar al responder.
 * Inserta el 9 solo cuando falta (tercer dígito ≠ 9).
 * Desactivar: META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9=false
 */
export function normalizeWhatsAppRecipientForMeta(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  const flag = String(process.env.META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9 ?? "true").toLowerCase();
  if (flag === "0" || flag === "false") return d;
  if (!d.startsWith("54") || d.length < 11) return d;
  if (d.charAt(2) === "9") return d;
  return `549${d.slice(2)}`;
}

export async function sendWhatsAppTextWithCredentials(toDigits, bodyText, { accessToken, phoneNumberId }) {
  const token = String(accessToken || "").trim();
  const pid = String(phoneNumberId || "").trim();
  if (!token || !pid) {
    return { ok: false, error: "missing_meta_credentials" };
  }
  const rawTo = String(toDigits || "").replace(/\D/g, "");
  const to = normalizeWhatsAppRecipientForMeta(rawTo);
  if (to !== rawTo) {
    console.log("[meta-whatsapp] destinatario AR: formato móvil 549…", { len: to.length });
  }
  const body = String(bodyText || "").trim();
  if (!to || !body) {
    return { ok: false, error: "invalid_params" };
  }

  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pid}/messages`;
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
        "[meta-whatsapp] Token Meta expirado o inválido: renová el token en Meta y actualizá META_ACCESS_TOKEN o clientes.configuracion.meta_access_token."
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

export async function sendWhatsAppText(toDigits, bodyText) {
  return sendWhatsAppTextWithCredentials(toDigits, bodyText, {
    accessToken: process.env.META_ACCESS_TOKEN || "",
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
  });
}

/** Alias histórico en el código. */
export async function metaSendWhatsAppText(toDigits, bodyText) {
  return sendWhatsAppText(toDigits, bodyText);
}

function b64UrlEncode(str) {
  return Buffer.from(String(str), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

/** Decodifica el id de fila devuelto por list_reply (debe coincidir con b64UrlEncode del tipo). */
export function decodeWhatsAppListRowId(id) {
  let b = String(id || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4;
  if (pad) b += "=".repeat(4 - pad);
  try {
    return Buffer.from(b, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Lista interactiva (Cloud API). Máx. 10 filas en total; título de fila ≤24 caracteres.
 * El id de cada fila codifica el texto completo del tipo de reclamo (UTF-8 → base64url).
 */
export async function sendWhatsAppInteractiveListWithCredentials(
  toDigits,
  { bodyText, buttonText, sectionTitle, tipos },
  { accessToken, phoneNumberId }
) {
  const token = String(accessToken || "").trim();
  const pid = String(phoneNumberId || "").trim();
  if (!token || !pid) {
    console.error("[meta-whatsapp] interactive list: faltan token o phone_number_id");
    return { ok: false, error: "missing_meta_credentials" };
  }
  const rawTo = String(toDigits || "").replace(/\D/g, "");
  const to = normalizeWhatsAppRecipientForMeta(rawTo);
  if (to !== rawTo) {
    console.log("[meta-whatsapp] lista interactiva: destinatario AR 549…", { len: to.length });
  }
  const list = Array.isArray(tipos) ? tipos.map((t) => String(t || "").trim()).filter(Boolean) : [];
  if (!to || !list.length) {
    return { ok: false, error: "invalid_params" };
  }
  if (list.length > 10) {
    return { ok: false, error: "too_many_rows" };
  }

  const rows = list.map((full) => {
    const title = full.length <= 24 ? full : `${full.slice(0, 21)}…`;
    const row = {
      id: b64UrlEncode(full),
      title,
    };
    if (full.length > 24) {
      row.description = full.length <= 72 ? full : `${full.slice(0, 69)}…`;
    }
    return row;
  });

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: String(bodyText || "Elegí una opción").slice(0, 1024) },
      action: {
        button: String(buttonText || "Ver opciones").slice(0, 20),
        sections: [
          {
            title: String(sectionTitle || "Reclamos").slice(0, 24),
            rows,
          },
        ],
      },
    },
  };

  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pid}/messages`;
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
    console.error("[meta-whatsapp] interactive list error", { status: resp.status, to: to.slice(0, 4) + "…", detail: errPart });
    if (graph?.error?.code === 190) {
      console.error(
        "[meta-whatsapp] Token Meta expirado o inválido: actualizá credenciales del tenant o META_ACCESS_TOKEN."
      );
    }
    return { ok: false, status: resp.status, graph };
  }
  if (graph?.error) {
    console.error("[meta-whatsapp] interactive list body error", graph.error);
    return { ok: false, status: resp.status || 502, graph };
  }
  console.log("[meta-whatsapp] lista interactiva OK", { to: to.slice(0, 4) + "…", n: list.length });
  return { ok: true, graph };
}

export async function sendWhatsAppInteractiveList(toDigits, opts) {
  return sendWhatsAppInteractiveListWithCredentials(toDigits, opts, {
    accessToken: process.env.META_ACCESS_TOKEN || "",
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
  });
}
