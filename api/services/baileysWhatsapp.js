import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  extractMessageContent,
  fetchLatestBaileysVersion,
  isLidUser,
  jidDecode,
  jidNormalizedUser,
  normalizeMessageContent,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import {
  usePostgresAuthState,
  clearPostgresAuthState,
} from "./baileysAuthPostgres.js";
import {
  storeBaileysMediaBuffer,
  consumeBaileysMediaBuffer,
} from "./baileysMediaStore.js";
import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";
import { handleInboundMetaWhatsAppPayload } from "./whatsappBotMeta.js";
import { logWhatsappMensajeRecibido } from "./whatsappNotificacionesLog.js";
import { isBaileysBroadcastStop, recordBaileysBroadcastStop, pauseBaileysBroadcastForUnresolvedStop, tripLocalBaileysBroadcastStop } from "./baileysBroadcastSafety.js";

const SESSION_ID = String(process.env.BAILEYS_SESSION_ID || "default").trim();
const AR_MOB = "54" + "9";
const silentLogger = pino({ level: "silent" });

let sock = null;
let connectionStatus = "disconnected"; // disconnected | connecting | qr_ready | connected | needs_relink
let lastQrRaw = null;
let lastQrDataUrl = null;
let lastError = null;
let startingPromise = null;
let reconnectTimer = null;
let isShuttingDown = false;
let shutdownHooksRegistered = false;

/** Mapea dígitos (con y sin 9 móvil AR) → último JID válido observado o verificado en WhatsApp. */
const replyJidByPhone = new Map();
const MAX_REPLY_JID_CACHE = 2000;

export { storeBaileysMediaBuffer, consumeBaileysMediaBuffer };

/**
 * Convierte dígitos internos (ej. `54343...` tras normalizar Meta sin 9) a formato móvil AR `549...`
 * requerido habitualmente por WhatsApp Web / Baileys (`@s.whatsapp.net`).
 */
export function digitsForBaileysSend(rawDigits) {
  const d = String(rawDigits || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("54") && d.length >= 11 && d.length <= 13 && d.charAt(2) !== "9") {
    return `${AR_MOB}${d.slice(2)}`;
  }
  return d;
}

function rememberReplyJid(digitsRaw, jid) {
  const normJid = String(jid || "").trim();
  const d = String(digitsRaw || "").replace(/\D/g, "");
  if (!d || !normJid) return;
  if (replyJidByPhone.size >= MAX_REPLY_JID_CACHE) {
    const firstKey = replyJidByPhone.keys().next().value;
    if (firstKey) replyJidByPhone.delete(firstKey);
  }
  replyJidByPhone.set(d, normJid);
  const metaNorm = normalizeWhatsAppRecipientForMeta(d);
  if (metaNorm) replyJidByPhone.set(metaNorm, normJid);
  const baileysNorm = digitsForBaileysSend(d);
  if (baileysNorm) replyJidByPhone.set(baileysNorm, normJid);
}

export function unwrapBaileysMessageContent(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "object") return null;
  return (
    extractMessageContent(rawMessage) ||
    normalizeMessageContent(rawMessage) ||
    rawMessage
  );
}

export function extractMessageText(msg) {
  const m = unwrapBaileysMessageContent(msg?.message);
  if (!m) return "";
  if (typeof m.conversation === "string") return m.conversation;
  if (typeof m.extendedTextMessage?.text === "string")
    return m.extendedTextMessage.text;
  if (typeof m.buttonsResponseMessage?.selectedDisplayText === "string")
    return m.buttonsResponseMessage.selectedDisplayText;
  if (typeof m.templateButtonReplyMessage?.selectedDisplayText === "string")
    return m.templateButtonReplyMessage.selectedDisplayText;
  if (typeof m.listResponseMessage?.title === "string")
    return m.listResponseMessage.title;
  if (typeof m.interactiveResponseMessage?.body?.text === "string")
    return m.interactiveResponseMessage.body.text;
  if (typeof m.videoMessage?.caption === "string")
    return m.videoMessage.caption;
  if (typeof m.documentMessage?.caption === "string")
    return m.documentMessage.caption;
  if (typeof m.imageMessage?.caption === "string")
    return m.imageMessage.caption;
  return "";
}

export function extractMessageLocation(msg) {
  const m = unwrapBaileysMessageContent(msg?.message);
  if (!m) return null;
  const loc = m.locationMessage || m.liveLocationMessage;
  if (!loc || typeof loc !== "object") return null;
  const lat = Number(loc.degreesLatitude);
  const lng = Number(loc.degreesLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

function cleanUserDigitsFromJid(jid) {
  const norm = jidNormalizedUser(String(jid || "").trim()) || String(jid || "").trim();
  const decoded = jidDecode(norm);
  const userPart = decoded?.user || norm.split("@")[0]?.split(":")[0] || "";
  return String(userPart).replace(/\D/g, "");
}

function isDirectPhoneJid(jid) {
  const s = String(jid || "").trim();
  return s.endsWith("@s.whatsapp.net") || s.endsWith("@c.us");
}

function toWhatsappNetJid(jid) {
  const norm = jidNormalizedUser(String(jid || "").trim()) || String(jid || "").trim();
  if (norm.endsWith("@c.us")) {
    const digits = cleanUserDigitsFromJid(norm);
    return digits ? `${digits}@s.whatsapp.net` : "";
  }
  return norm;
}

export async function resolveInboundSender(msg, currentSock = sock) {
  const rawRemote = String(msg?.key?.remoteJid || "").trim();
  if (
    !rawRemote ||
    rawRemote.endsWith("@g.us") ||
    rawRemote === "status@broadcast" ||
    rawRemote.endsWith("@broadcast") ||
    rawRemote.endsWith("@newsletter")
  ) {
    return null;
  }

  const rawAlt = String(
    msg?.key?.remoteJidAlt || msg?.key?.participantAlt || ""
  ).trim();
  const normRemote = jidNormalizedUser(rawRemote) || rawRemote;
  const normAlt = rawAlt ? jidNormalizedUser(rawAlt) || rawAlt : "";

  let pnJid = "";
  let lidJid = "";

  if (isDirectPhoneJid(normRemote)) {
    pnJid = toWhatsappNetJid(normRemote);
    if (normAlt && (isLidUser(normAlt) || normAlt.endsWith("@lid"))) {
      lidJid = normAlt;
    }
  } else if (isLidUser(normRemote) || normRemote.endsWith("@lid")) {
    lidJid = normRemote;
    if (normAlt && isDirectPhoneJid(normAlt)) {
      pnJid = toWhatsappNetJid(normAlt);
    }
    if (!pnJid && currentSock?.signalRepository?.lidMapping?.getPNForLID) {
      try {
        const mappedPn = await currentSock.signalRepository.lidMapping.getPNForLID(normRemote);
        if (mappedPn && isDirectPhoneJid(mappedPn)) {
          pnJid = toWhatsappNetJid(mappedPn);
        }
      } catch (_) {}
    }
  } else if (normAlt && isDirectPhoneJid(normAlt)) {
    pnJid = toWhatsappNetJid(normAlt);
  }

  const effectiveJid = pnJid || lidJid || normRemote;
  const waId = cleanUserDigitsFromJid(pnJid || effectiveJid);
  if (!waId) return null;

  rememberReplyJid(waId, effectiveJid);

  return {
    rawJid: rawRemote,
    remoteJid: effectiveJid,
    pnJid: pnJid || null,
    lidJid: lidJid || null,
    waId,
  };
}

function resolveBaileysPhoneNumberId() {
  return "baileys-bot";
}

function buildMetaShapedPayload(waId, metaMessage, pushName) {
  const phoneNumberId = resolveBaileysPhoneNumberId();
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "baileys",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: phoneNumberId,
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: pushName || waId },
                  wa_id: waId,
                },
              ],
              messages: [metaMessage],
            },
          },
        ],
      },
    ],
  };
}

function registerShutdownHooksOnce() {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const cleanExit = () => {
    isShuttingDown = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      sock?.ws?.close();
    } catch (_) {}
  };
  process.once("SIGTERM", cleanExit);
  process.once("SIGINT", cleanExit);
}

// En un corte futuro a multitenant, ninguna vía puede iniciar la sesión global.
// No cambiar este flag en caliente: detener los procesos legacy antes del corte.
function legacyBaileysBlocked() {
  return String(process.env.BAILEYS_MULTITENANT_ENABLED || "").trim().toLowerCase() === "true";
}
function assertLegacyBaileysAllowed() {
  if (legacyBaileysBlocked()) throw new Error("baileys_legacy_disabled_in_multitenant_mode");
}
export async function startBaileys() {
  assertLegacyBaileysAllowed();
  if (connectionStatus === "needs_relink") throw new Error("baileys_legacy_relink_requires_review");
  if (startingPromise) return startingPromise;
  registerShutdownHooksOnce();

  startingPromise = (async () => {
    try {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      connectionStatus = "connecting";
      lastError = null;

      const { state, saveCreds } = await usePostgresAuthState(SESSION_ID);
      let version;
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest?.version;
      } catch (e) {
        console.warn("[baileys] No se pudo consultar última versión WA Web, usando default:", e?.message || e);
      }

      assertLegacyBaileysAllowed();
      const currentSock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger: silentLogger,
        printQRInTerminal: false,
        browser: ["GestorNova", "Chrome", "120.0.0"],
        syncFullHistory: false,
      });
      sock = currentSock;

      currentSock.ev.on("creds.update", saveCreds);

      currentSock.ev.on("connection.update", async (update) => {
        if (legacyBaileysBlocked() || sock !== currentSock) return;
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          lastQrRaw = qr;
          connectionStatus = "qr_ready";
          try {
            lastQrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          } catch (e) {
            console.error("[baileys] QR error:", e.message);
          }
          console.log(
            "[baileys] Nuevo QR generado. Abrí /api/webhooks/whatsapp/baileys/qr para escanearlo."
          );
        }

        if (connection === "open") {
          connectionStatus = "connected";
          lastQrRaw = null;
          lastQrDataUrl = null;
          lastError = null;
          console.log("[baileys] Conectado a WhatsApp correctamente.");
        }

        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isBadSession = statusCode === DisconnectReason.badSession;
          const isReplaced = statusCode === DisconnectReason.connectionReplaced;
          lastError =
            lastDisconnect?.error?.message || `closed_${statusCode || "unknown"}`;
          if (sock === currentSock) {
            sock = null;
            connectionStatus = "disconnected";
          }

          console.warn("[baileys] Conexión cerrada:", { statusCode, reason: lastError });

          if (isShuttingDown) {
            return;
          }

          if (isReplaced) {
            console.warn(
              "[baileys] Sesión reemplazada por otra instancia activa (p. ej. redeploy en Render). No se fuerza reconexión inmediata."
            );
            return;
          }

          if (isLoggedOut || isBadSession) {
            // No borrar ni reintentar automáticamente una sesión Signal inválida.
            // La recuperación/reset requiere decisión explícita y respaldo.
            connectionStatus = "needs_relink";
            lastQrRaw = null;
            lastQrDataUrl = null;
            console.warn("[baileys] Sesión requiere revisión; se conservan las credenciales.");
            return;
          }

          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              if (!isShuttingDown) {
                startBaileys().catch((e) =>
                  console.error("[baileys] Error al reconectar:", e.message)
                );
              }
            }, 4000);
          }
        }
      });

      currentSock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (legacyBaileysBlocked() || type !== "notify") return;
        for (const msg of messages || []) {
          try {
            if (!msg || msg.key?.fromMe) continue;
            const sender = await resolveInboundSender(msg, currentSock);
            if (!sender) continue;

            const { rawJid, remoteJid, waId } = sender;
            const msgId = msg.key?.id || `baileys-${Date.now()}`;
            const timestamp = String(
              Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000)
            );
            const unwrapped = unwrapBaileysMessageContent(msg.message);
            const loc = extractMessageLocation(msg);
            const hasImage = Boolean(unwrapped?.imageMessage);
            const text = extractMessageText(msg).trim();

            console.log("[baileys] mensaje entrante:", {
              rawJid,
              remoteJid,
              waId,
              kind: loc ? "location" : hasImage ? "image" : text ? "text" : "other",
              text: text.slice(0, 80),
            });

            let metaMsg = null;

            if (loc) {
              metaMsg = {
                from: waId,
                id: msgId,
                timestamp,
                type: "location",
                location: {
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                },
              };
            } else if (hasImage) {
              try {
                const buf = await downloadMediaMessage(
                  msg,
                  "buffer",
                  {},
                  {
                    logger: silentLogger,
                    reuploadRequest: currentSock.updateMediaMessage,
                  }
                );
                const mediaId = `baileys-media:${msgId}`;
                const mimeType =
                  String(unwrapped?.imageMessage?.mimetype || "image/jpeg").trim() ||
                  "image/jpeg";
                storeBaileysMediaBuffer(mediaId, buf, mimeType);
                metaMsg = {
                  from: waId,
                  id: msgId,
                  timestamp,
                  type: "image",
                  image: {
                    id: mediaId,
                    mime_type: mimeType,
                  },
                };
              } catch (e) {
                console.error("[baileys] Error descargando imagen entrante:", e?.message || e);
                if (text) {
                  metaMsg = {
                    from: waId,
                    id: msgId,
                    timestamp,
                    type: "text",
                    text: { body: text },
                  };
                }
              }
            } else if (text) {
              metaMsg = {
                from: waId,
                id: msgId,
                timestamp,
                type: "text",
                text: { body: text },
              };
            }

            if (!metaMsg) continue;

            if (text || loc || hasImage) {
              const logBody =
                text ||
                (loc ? `[ubicación GPS ${loc.latitude}, ${loc.longitude}]` : "[imagen]");
              try {
                await logWhatsappMensajeRecibido(waId, logBody);
              } catch (e) {
                console.error("[baileys] log recibido DB:", e.message);
              }
            }

            if (text && isBaileysBroadcastStop(text)) {
              try {
                if (!sender.pnJid) {
                  await pauseBaileysBroadcastForUnresolvedStop();
                  await sendText(waId, 'Pausamos los avisos. Contactá a la entidad para confirmar tu número y completar la baja.');
                  continue;
                }
                await recordBaileysBroadcastStop(waId);
                await sendText(waId, 'Confirmamos tu baja de los avisos masivos por WhatsApp.');
              } catch (e) {
                tripLocalBaileysBroadcastStop();
                console.error('[baileys] No se pudo registrar la baja de avisos:', e?.message || e);
                await sendText(waId, 'No pudimos registrar tu baja en este momento. Contactá a la entidad para solicitarla.');
              }
              continue;
            }

            const payload = buildMetaShapedPayload(
              waId,
              metaMsg,
              msg.pushName || ""
            );
            await handleInboundMetaWhatsAppPayload(payload);
          } catch (e) {
            console.error("[baileys] Error procesando mensaje entrante:", e);
          }
        }
      });
    } catch (e) {
      connectionStatus = "disconnected";
      lastError = e?.message || String(e);
      console.error("[baileys] Error iniciando:", lastError);
    } finally {
      startingPromise = null;
    }
  })();

  return startingPromise;
}

export function initBaileysIfConfigured() {
  const provider = String(process.env.WHATSAPP_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (provider === "baileys" && !legacyBaileysBlocked()) {
    console.log(
      "[baileys] WHATSAPP_PROVIDER=baileys detectado — iniciando conexión..."
    );
    startBaileys().catch((e) =>
      console.error("[baileys] init error:", e.message)
    );
  }
}

export function getBaileysStatus() {
  return {
    status: connectionStatus,
    hasQr: Boolean(lastQrDataUrl),
    lastError,
    sessionId: SESSION_ID,
  };
}

export function getBaileysQrDataUrl() {
  if (legacyBaileysBlocked()) return null;
  return lastQrDataUrl;
}

export async function resetBaileysSessionAndReconnect() {
  assertLegacyBaileysAllowed();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const prevSock = sock;
  sock = null;
  lastQrRaw = null;
  lastQrDataUrl = null;
  lastError = null;
  connectionStatus = "disconnected";

  if (prevSock) {
    try {
      await prevSock.logout();
    } catch (_) {}
    try {
      prevSock.ev?.removeAllListeners?.("connection.update");
      prevSock.ev?.removeAllListeners?.("messages.upsert");
      prevSock.ev?.removeAllListeners?.("creds.update");
      prevSock.ws?.close?.();
    } catch (_) {}
  }

  await clearPostgresAuthState(SESSION_ID).catch((e) =>
    console.error("[baileys] Error limpiando credenciales en reset:", e?.message || e)
  );

  startBaileys().catch((e) =>
    console.error("[baileys] Error iniciando nuevo QR tras reset:", e?.message || e)
  );

  return getBaileysStatus();
}

async function resolveOutboundJid(toDigits, currentSock) {
  const raw = String(toDigits || "").replace(/\D/g, "");
  if (!raw) return "";

  const metaNorm = normalizeWhatsAppRecipientForMeta(raw);
  const baileysDigits = digitsForBaileysSend(raw);

  const cached =
    replyJidByPhone.get(raw) ||
    (metaNorm && replyJidByPhone.get(metaNorm)) ||
    (baileysDigits && replyJidByPhone.get(baileysDigits));
  if (cached) return cached;

  const primaryDigits = baileysDigits || raw;
  const candidateJid = `${primaryDigits}@s.whatsapp.net`;

  if (typeof currentSock?.onWhatsApp === "function") {
    try {
      const candidates =
        primaryDigits !== raw ? [primaryDigits, raw] : [primaryDigits];
      for (const cand of candidates) {
        const res = await currentSock.onWhatsApp(`${cand}@s.whatsapp.net`);
        const hit = Array.isArray(res) ? res[0] : null;
        if (hit?.exists && hit?.jid) {
          const verified = jidNormalizedUser(hit.jid) || hit.jid;
          rememberReplyJid(raw, verified);
          return verified;
        }
      }
    } catch (e) {
      console.warn("[baileys] onWhatsApp lookup fallback:", e?.message || e);
    }
  }

  rememberReplyJid(raw, candidateJid);
  return candidateJid;
}

export async function sendText(to, body) {
  if (legacyBaileysBlocked()) return {ok:false,error:"baileys_legacy_disabled_in_multitenant_mode"};
  if (!sock || connectionStatus !== "connected") {
    return {
      ok: false,
      error: `baileys_not_connected (${connectionStatus})`,
    };
  }
  const text = String(body || "").trim();
  if (!text) {
    return { ok: false, error: "empty_body" };
  }
  const jid = await resolveOutboundJid(to, sock);
  if (!jid) {
    return { ok: false, error: "invalid_recipient" };
  }
  if (legacyBaileysBlocked()) return {ok:false,error:"baileys_legacy_disabled_in_multitenant_mode"};
  try {
    const res = await sock.sendMessage(jid, { text });
    console.log("[baileys] mensaje enviado:", {
      jid: jid.replace(/^(\d{4})\d+(\d{4}@)/, "$1…$2"),
      len: text.length,
    });
    return { ok: true, data: res };
  } catch (e) {
    console.error("[baileys] Error enviando mensaje:", {
      jid: jid.replace(/^(\d{4})\d+(\d{4}@)/, "$1…$2"),
      error: e?.message || String(e),
    });
    return { ok: false, error: e?.message || String(e) };
  }
}
