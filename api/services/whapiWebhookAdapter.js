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
    if (!body) {
      console.warn("[whapi-adapter] mensaje sin texto útil, type=", m.type);
      continue;
    }

    const name = String(m.from_name || "Usuario").trim() || "Usuario";
    if (!contactMap.has(digits)) {
      contactMap.set(digits, { profile: { name }, wa_id: digits });
    }

    metaMessages.push({
      from: digits,
      id: String(m.id || `whapi_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
      timestamp: String(Math.floor(Number(m.timestamp) || Date.now() / 1000)),
      type: "text",
      text: { body },
    });
  }

  if (metaMessages.length === 0) {
    const snap = rawMessages.slice(0, 5).map((m) => ({
      type: m?.type,
      from_me: m?.from_me,
    }));
    console.log("[whapi-adapter] sin texto entrante (eco propio, tipo no soportado o sin body)", {
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
