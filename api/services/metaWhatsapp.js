/**
 * Envío de mensajes de texto vía WhatsApp Cloud API (Meta).
 * Graph API v21 — recipient_type individual (recomendado en docs recientes).
 * Activo con `WHATSAPP_PROVIDER=meta` (default). Cambiar proveedor: `api/docs/CAMBIAR_PROVEEDOR_WHATSAPP.md`.
 */

const rawVer = String(process.env.META_GRAPH_API_VERSION || "v21.0").trim();
const GRAPH_VERSION = (rawVer.startsWith("v") ? rawVer : `v${rawVer}`) || "v21.0";

/** Base Graph API (producción: https://graph.facebook.com). Emulador local: p. ej. http://localhost:4004 — sin barra final. */
function metaGraphBaseUrl() {
  const raw = String(process.env.META_GRAPH_URL || "https://graph.facebook.com").trim();
  return raw.replace(/\/+$/, "");
}

function argentinaStripEnabledFromEnv() {
  const v = process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
  if (v == null || String(v).trim() === "") return true;
  const s = String(v).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(s)) return false;
  return true;
}

/**
 * Insertar 9 móvil tras +54 cuando falta (543… → 549…). Por defecto ACTIVO en **outbound**:
 * contactos guardados sin 9 y envíos a terceros (ENERSA) lo requieren.
 * Desactivar: META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9=false
 */
function argentinaInsertMobileNineEnabledFromEnv() {
  const v = process.env.META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9;
  if (v == null || String(v).trim() === "") return true;
  const s = String(v).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(s)) return false;
  return true;
}

/**
 * Graph API `to` (Argentina): el webhook manda 549 + área + abonado; la lista de prueba de Meta
 * suele registrar 54 + área + abonado (sin el 9) → 131030 si no normalizamos.
 *
 * Por defecto: quitar un 9 tras 54 (549… → 54…). Desactivar solo con META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9=false|0|no|off
 *
 * **Modos:**
 * - `inbound` (default): solo strip; NO insertar 9. Identidad/sesión/webhook/`wa_id` (debe ser estable).
 * - `outbound`: strip + inserción 543…→549… cuando aplica (derivación ENERSA, envíos Graph).
 *
 * @param {string} digits
 * @param {{ mode?: 'inbound' | 'outbound' }} [opts]
 */
export function normalizeWhatsAppRecipientForMeta(digits, opts = {}) {
  const mode = opts.mode === "outbound" ? "outbound" : "inbound";
  const d = String(digits || "").replace(/\D/g, "");
  const stripEnvRaw = process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
  const stripOn = argentinaStripEnabledFromEnv();
  const wouldStrip = d.startsWith("549") && d.length >= 12 && d.length <= 16;
  let out = d;

  if (stripOn && wouldStrip) {
    out = `54${d.slice(3)}`;
  } else if (
    mode === "outbound" &&
    argentinaInsertMobileNineEnabledFromEnv() &&
    d.startsWith("54") &&
    d.length >= 11 &&
    d.charAt(2) !== "9"
  ) {
    out = `549${d.slice(2)}`;
  }

  if (wouldStrip || d.startsWith("54")) {
    console.log("[meta-whatsapp][ar-normalize]", {
      mode,
      inLen: d.length,
      inPrefix3: d.slice(0, 3),
      stripEnvRaw: stripEnvRaw === undefined ? "(undefined)" : String(stripEnvRaw),
      stripOn,
      wouldStripPattern: wouldStrip,
      insertMobile9Outbound: mode === "outbound" && argentinaInsertMobileNineEnabledFromEnv(),
      outLen: out.length,
      outPrefix3: out.slice(0, 3),
      changed: out !== d,
    });
  }

  return out;
}

/**
 * Máscara para logs (Render): varios números AR comparten los mismos 4–6 dígitos iniciales (ej. 549343…).
 * Usar siempre `mask` o `tail4` para distinguir vecino vs tercero (ENERSA).
 */
export function maskWaDigitsForLog(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return { len: 0, mask: "(vacío)" };
  if (d.length <= 8) return { len: d.length, mask: d, tail4: d.slice(-4) };
  return {
    len: d.length,
    mask: `${d.slice(0, 4)}…${d.slice(-4)}`,
    tail4: d.slice(-4),
    head6: d.slice(0, 6),
  };
}

export async function sendWhatsAppTextWithCredentials(
  toDigits,
  bodyText,
  { accessToken, phoneNumberId, purpose }
) {
  const purposeTag = String(purpose || "unspecified").slice(0, 96);
  const token = String(accessToken || "").trim();
  const pid = String(phoneNumberId || "").trim();
  if (!token || !pid) {
    return { ok: false, error: "missing_meta_credentials" };
  }
  const rawTo = String(toDigits || "").replace(/\D/g, "");
  const to = normalizeWhatsAppRecipientForMeta(rawTo, { mode: "outbound" });
  const body = String(bodyText || "").trim();
  if (!to || !body) {
    return { ok: false, error: "invalid_params" };
  }
  if (to.length < 8 || to.length > 16) {
    console.error("[meta-whatsapp] destino descartado: longitud E.164 inusual", {
      purpose: purposeTag,
      rawIn: maskWaDigitsForLog(rawTo),
      toLen: to.length,
      rawLen: rawTo.length,
    });
    return { ok: false, error: "invalid_destination_length" };
  }

  console.log("[meta-whatsapp][outbound]", {
    purpose: purposeTag,
    rawIn: maskWaDigitsForLog(rawTo),
    toOut: maskWaDigitsForLog(to),
    normalizedChanged: to !== rawTo,
  });

  const endpoint = `${metaGraphBaseUrl()}/${GRAPH_VERSION}/${pid}/messages`;
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
    console.error("[meta-whatsapp] Graph API error", {
      purpose: purposeTag,
      rawIn: maskWaDigitsForLog(rawTo),
      toOut: maskWaDigitsForLog(to),
      status: resp.status,
      detail: errPart,
    });
    if (graph?.error?.code === 190) {
      console.error(
        "[meta-whatsapp] Token Meta expirado o inválido: renová el token en Meta y actualizá META_ACCESS_TOKEN o clientes.configuracion.meta_access_token."
      );
    }
    if (graph?.error?.code === 131030) {
      console.error(
        "[meta-whatsapp] (#131030) Meta rechazó el envío: el número de destino no está en la lista de destinatarios de prueba (o la app no está en Live). El destino en logs (toOut.tail4) coincide con quien escribió; agregá ese WhatsApp en Meta for Developers → WhatsApp → API setup (Phone numbers / lista de prueba) o publicá la app."
      );
    }
    const summary = graph?.error?.message ? String(graph.error.message).slice(0, 520) : `http_${resp.status}`;
    return { ok: false, status: resp.status, graph, error: summary };
  }
  if (graph?.error) {
    console.error("[meta-whatsapp] Graph body error", graph.error);
    return { ok: false, status: resp.status || 502, graph, error: "graph_body_error" };
  }
  console.log("[meta-whatsapp] mensaje enviado OK", {
    purpose: purposeTag,
    toOut: maskWaDigitsForLog(to),
    messageId: graph?.messages?.[0]?.id || "—",
  });
  return { ok: true, graph };
}

export async function sendWhatsAppText(toDigits, bodyText) {
  return sendWhatsAppTextWithCredentials(toDigits, bodyText, {
    accessToken: process.env.META_ACCESS_TOKEN || "",
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
    purpose: "meta_sendWhatsAppText_env",
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
  { accessToken, phoneNumberId, purpose }
) {
  const purposeTag = String(purpose || "interactive_list").slice(0, 96);
  const token = String(accessToken || "").trim();
  const pid = String(phoneNumberId || "").trim();
  if (!token || !pid) {
    console.error("[meta-whatsapp] interactive list: faltan token o phone_number_id");
    return { ok: false, error: "missing_meta_credentials" };
  }
  const rawTo = String(toDigits || "").replace(/\D/g, "");
  const to = normalizeWhatsAppRecipientForMeta(rawTo, { mode: "outbound" });
  const list = Array.isArray(tipos) ? tipos.map((t) => String(t || "").trim()).filter(Boolean) : [];
  if (!to || !list.length) {
    return { ok: false, error: "invalid_params" };
  }
  if (to.length < 8 || to.length > 16) {
    console.error("[meta-whatsapp] interactive list: destino descartado (longitud E.164)", {
      purpose: purposeTag,
      rawIn: maskWaDigitsForLog(rawTo),
      toLen: to.length,
      rawLen: rawTo.length,
    });
    return { ok: false, error: "invalid_destination_length" };
  }
  console.log("[meta-whatsapp][outbound-interactive]", { purpose: purposeTag, rawIn: maskWaDigitsForLog(rawTo), toOut: maskWaDigitsForLog(to) });
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

  const endpoint = `${metaGraphBaseUrl()}/${GRAPH_VERSION}/${pid}/messages`;
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
    console.error("[meta-whatsapp] interactive list error", {
      purpose: purposeTag,
      rawIn: maskWaDigitsForLog(rawTo),
      toOut: maskWaDigitsForLog(to),
      status: resp.status,
      detail: errPart,
    });
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
    purpose: "interactive_list_env",
  });
}
