/**
 * Convierte el JSON de webhook de WAHA al formato "Meta Cloud API" que espera
 * handleInboundMetaWhatsAppPayload (entry/changes/value/messages).
 * Docs WAHA: https://waha.devlike.pro/docs/how-to/events/#message
 * made by leavera77
 */

/**
 * Texto entrante: NOWEB a veces deja el texto solo en _data (protobuf).
 */
function extractWahaTextBody(payload) {
  const p = payload;
  if (!p || typeof p !== "object") return "";
  let t = String(p.body ?? "").trim();
  if (t) return t;
  const d = p._data;
  if (d?.message?.conversation) return String(d.message.conversation).trim();
  if (d?.message?.extendedTextMessage?.text) return String(d.message.extendedTextMessage.text).trim();
  if (d?.message?.imageMessage?.caption) return String(d.message.imageMessage.caption).trim();
  return "";
}

/**
 * @param {object} wahaBody Cuerpo JSON del POST de WAHA (event + payload).
 * @returns {object | null} Payload estilo Meta, o null si no aplica.
 */
export function wahaWebhookToMetaShapedPayload(wahaBody) {
  if (!wahaBody || typeof wahaBody !== "object") return null;
  const ev = String(wahaBody.event || "");
  /** `message` = entrantes; `message.any` incluye propios (filtramos con fromMe). */
  if (ev !== "message" && ev !== "message.any") return null;

  const p = wahaBody.payload;
  if (!p || typeof p !== "object") return null;
  if (p.fromMe === true) return null;

  const fromJid = String(p.from || "").trim();
  if (fromJid.endsWith("@g.us")) {
    console.warn("[waha-adapter] ignorado (grupo)");
    return null;
  }
  const digits = fromJid.replace(/@.*$/, "").replace(/\D/g, "");
  if (!digits || digits.length < 8) {
    console.warn("[waha-adapter] no se pudieron obtener dígitos de:", fromJid.slice(0, 40));
    return null;
  }

  const body = extractWahaTextBody(p);
  if (!body) {
    console.warn("[waha-adapter] mensaje sin texto útil (media sin caption u otro); event=", ev);
    return null;
  }

  /** Mismo phone_number_id que en .env para resolver tenant vía Meta helpers. */
  const phoneNumberId = String(
    process.env.WAHA_META_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID || "waha-local"
  ).trim();

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waha",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: phoneNumberId,
                display_phone_number: "",
              },
              contacts: [
                {
                  profile: { name: String(p._data?.notifyName || p.notifyName || "Usuario") },
                  wa_id: digits,
                },
              ],
              messages: [
                {
                  from: digits,
                  id: String(p.id || `waha_${Date.now()}`),
                  timestamp: String(Math.floor(Number(p.timestamp) || Date.now() / 1000)),
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
