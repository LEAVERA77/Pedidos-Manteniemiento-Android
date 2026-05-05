/**
 * Convierte el webhook JSON de Whapi.cloud al formato Meta Cloud API que usa
 * handleInboundMetaWhatsAppPayload (entry / changes / value / messages).
 * Formato entrante: https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/incoming-message
 * made by leavera77
 */

/**
 * @param {object} msg Un elemento de `messages` del payload Whapi
 * @returns {string} Texto útil para el bot, o vacío
 */
function extractWhapiTextBody(msg) {
  if (!msg || typeof msg !== "object") return "";
  const t = String(msg.type || "").toLowerCase();

  if (t === "text" && msg.text && typeof msg.text === "object") {
    return String(msg.text.body ?? "").trim();
  }
  if (t === "link_preview" && msg.link_preview && typeof msg.link_preview === "object") {
    return String(msg.link_preview.body ?? "").trim();
  }
  if (t === "reply" && msg.reply && typeof msg.reply === "object") {
    const rt = String(msg.reply.type || "").toLowerCase();
    if (rt === "buttons_reply" && msg.reply.buttons_reply) {
      return String(msg.reply.buttons_reply.title ?? "").trim();
    }
    if (rt === "list_reply" && msg.reply.list_reply) {
      return String(msg.reply.list_reply.title ?? msg.reply.list_reply.id ?? "").trim();
    }
  }

  return "";
}

/**
 * Whapi `location` / `live_location` → coordenadas Meta Cloud API (`latitude` / `longitude`).
 * @returns {{ latitude: number, longitude: number } | null}
 */
/**
 * Imagen entrante Whapi → forma compatible con `processInboundWhatsappImageMessage` (id + link opcional Auto Download).
 * @returns {{ id: string, mime_type: string, link: string } | null}
 */
function extractWhapiImageForMeta(msg) {
  if (!msg || typeof msg !== "object") return null;
  const t = String(msg.type || "").toLowerCase();
  if (t !== "image") return null;
  const img = msg.image;
  if (!img || typeof img !== "object") return null;
  const id = String(img.id || "").trim();
  const link = String(img.link || img.url || "").trim();
  if (!id && !link) return null;
  const mime = img.mime_type ? String(img.mime_type).trim() : "image/jpeg";
  return {
    id: id || `whapi_img_${Date.now()}`,
    mime_type: mime,
    link,
  };
}

function extractWhapiLocationForMeta(msg) {
  if (!msg || typeof msg !== "object") return null;
  const t = String(msg.type || "").toLowerCase();
  let la;
  let lo;
  if (t === "location" && msg.location && typeof msg.location === "object") {
    la = Number(msg.location.latitude);
    lo = Number(msg.location.longitude);
  } else if (t === "live_location" && msg.live_location && typeof msg.live_location === "object") {
    la = Number(msg.live_location.latitude);
    lo = Number(msg.live_location.longitude);
  } else {
    return null;
  }
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { latitude: la, longitude: lo };
}

/** Dígitos del remitente: `from` o, si falta, JID en `chat_id` (ej. 549...@s.whatsapp.net). */
function senderDigitsFromWhapiMessage(m) {
  let digits = String(m.from || "").replace(/\D/g, "");
  if (digits.length >= 8) return digits;
  const chat = String(m.chat_id || "");
  const beforeAt = chat.split("@")[0] || "";
  const fromChat = beforeAt.replace(/\D/g, "");
  if (fromChat.length >= 8) return fromChat;
  return "";
}

/**
 * @param {object} whapiBody Cuerpo JSON del POST de Whapi (messages, event, channel_id).
 * @returns {object | null} Payload estilo Meta, o null si no aplica.
 */
export function whapiWebhookToMetaShapedPayload(whapiBody) {
  if (!whapiBody || typeof whapiBody !== "object") return null;

  const rawMessages = Array.isArray(whapiBody.messages) ? whapiBody.messages : [];
  if (rawMessages.length === 0) return null;

  const channelId = String(whapiBody.channel_id || "").trim();
  const phoneNumberId = String(
    process.env.WHAPI_META_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID || channelId || "whapi-local"
  ).trim();

  const metaMessages = [];
  const contactMap = new Map();

  for (const m of rawMessages) {
    if (!m || typeof m !== "object") continue;
    if (m.from_me === true) continue;

    const chatId = String(m.chat_id || "");
    if (chatId.endsWith("@g.us")) {
      console.warn("[whapi-adapter] ignorado (grupo)", chatId.slice(0, 24));
      continue;
    }

    const digits = senderDigitsFromWhapiMessage(m);
    if (!digits || digits.length < 8) {
      console.warn("[whapi-adapter] remitente inválido", {
        from: String(m.from || "").slice(0, 24),
        chat_id: String(m.chat_id || "").slice(0, 40),
      });
      continue;
    }

    const body = extractWhapiTextBody(m);
    const loc = extractWhapiLocationForMeta(m);
    const img = extractWhapiImageForMeta(m);
    if (!body && !loc && !img) {
      console.warn("[whapi-adapter] mensaje sin texto ni ubicación ni imagen útil, type=", m.type);
      continue;
    }

    const name = String(m.from_name || "Usuario").trim() || "Usuario";
    if (!contactMap.has(digits)) {
      contactMap.set(digits, { profile: { name }, wa_id: digits });
    }

    const base = {
      from: digits,
      id: String(m.id || `whapi_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
      timestamp: String(Math.floor(Number(m.timestamp) || Date.now() / 1000)),
    };

    if (body) {
      metaMessages.push({
        ...base,
        type: "text",
        text: { body },
      });
    } else if (loc) {
      metaMessages.push({
        ...base,
        type: "location",
        location: {
          latitude: loc.latitude,
          longitude: loc.longitude,
        },
      });
    } else if (img) {
      const image = { id: img.id, mime_type: img.mime_type };
      if (img.link) image.link = img.link;
      metaMessages.push({
        ...base,
        type: "image",
        image,
      });
    }
  }

  if (metaMessages.length === 0) {
    const snap = rawMessages.slice(0, 5).map((m) => ({
      type: m?.type,
      from_me: m?.from_me,
    }));
    console.log("[whapi-adapter] sin texto ni ubicación entrante (eco propio o tipo no soportado)", {
      n: rawMessages.length,
      snap,
    });
    return null;
  }

  const contacts = Array.from(contactMap.values());

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "whapi",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: phoneNumberId,
                display_phone_number: "",
              },
              contacts,
              messages: metaMessages,
            },
          },
        ],
      },
    ],
  };
}
