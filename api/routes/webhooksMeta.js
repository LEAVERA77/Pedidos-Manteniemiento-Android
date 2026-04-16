import crypto from "crypto";
import express from "express";
import { handleInboundMetaWhatsAppPayload } from "../services/whatsappBotMeta.js";
import { logWhatsappMensajeRecibido } from "../services/whatsappNotificacionesLog.js";
import {
  getMetaWabaIdFromEnv,
  normalizeWhatsAppRecipientForMeta,
  maskWaDigitsForLog,
} from "../services/metaWhatsapp.js";

const router = express.Router();

function safeCompare(a, b) {
  const aa = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

/**
 * Firma X-Hub-Signature-256 sobre el cuerpo RAW (application/json sin parsear).
 */
function verifyMetaSignatureRaw(appSecret, rawBody, signatureHeader) {
  if (!appSecret) return null;
  const signature = String(signatureHeader || "");
  if (!signature.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return safeCompare(signature, expected);
}

// GET /api/webhooks/whatsapp/meta — verificación suscripción Meta
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = String(req.query["hub.verify_token"] || "").trim();
  const challenge = req.query["hub.challenge"];
  const verifyToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || "").trim();

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return res.status(200).send(String(challenge || ""));
  }
  return res.sendStatus(403);
});

// POST — raw JSON para HMAC; responder 200 enseguida y procesar en background
router.post("/", express.raw({ type: "application/json", limit: "5mb" }), async (req, res) => {
  const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  const sig = req.get("x-hub-signature-256");
  const verified = verifyMetaSignatureRaw(appSecret, rawBuf, sig);
  const allowInvalidSignature = String(process.env.META_ALLOW_INVALID_SIGNATURE || "").toLowerCase() === "true";

  if (appSecret) {
    if (verified === false) {
      console.error("[webhook-meta] invalid signature", {
        meta_app_secret_present: Boolean(appSecret),
        signature_present: Boolean(sig),
        allowInvalidSignature
      });
      if (!allowInvalidSignature) {
        return res.status(401).json({ ok: false, error: "invalid_signature" });
      }
      console.warn("[webhook-meta] allowInvalidSignature=true -> continuando para depurar");
    }
  } else {
    console.warn("[webhook-meta] META_APP_SECRET vacío: no se valida firma (solo desarrollo)");
  }

  let payload = {};
  try {
    payload = JSON.parse(rawBuf.toString("utf8") || "{}");
  } catch (e) {
    console.error("[webhook-meta] JSON inválido", e.message);
    return res.status(400).json({ ok: false, error: "invalid_json" });
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const wabaIdEnv = getMetaWabaIdFromEnv();
  for (const entry of entries) {
    const entryWabaId = entry?.id != null ? String(entry.id).trim() : "";
    if (entryWabaId) {
      if (wabaIdEnv) {
        if (entryWabaId !== wabaIdEnv) {
          console.warn("[webhook-meta] entry.id (WABA del webhook) ≠ META_WABA_ID del entorno", {
            entryId: entryWabaId,
            metaWabaIdEnv: wabaIdEnv,
          });
        } else {
          console.log("[webhook-meta] waba", {
            entryId: entryWabaId,
            metaWabaIdEnv: wabaIdEnv,
            wabaIdMatch: true,
          });
        }
      } else {
        console.log("[webhook-meta] waba entry.id (opcional: META_WABA_ID en env para validar coincidencia)", {
          entryId: entryWabaId,
        });
      }
    }
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const metaPhoneNumberId = value?.metadata?.phone_number_id ?? null;
      for (const msg of messages) {
        const waId = String(msg?.from || "");
        const type = String(msg?.type || "unknown");
        let textBody = "";
        if (type === "text") textBody = String(msg?.text?.body || "");
        else if (type === "interactive" && msg?.interactive?.type === "list_reply") {
          const lr = msg.interactive.list_reply || {};
          textBody = `[list_reply] ${lr.title || ""}`;
        } else if (type === "location") {
          const loc = msg?.location || {};
          const la = loc.latitude != null ? Number(loc.latitude) : NaN;
          const lo = loc.longitude != null ? Number(loc.longitude) : NaN;
          textBody = Number.isFinite(la) && Number.isFinite(lo)
            ? `[location] lat=${la} lng=${lo}`
            : "[location] (sin coords)";
        }
        const fromDigits = waId.replace(/\D/g, "");
        const fromProcesado = normalizeWhatsAppRecipientForMeta(fromDigits);
        const toParaGraph = normalizeWhatsAppRecipientForMeta(fromDigits, { mode: "outbound" });
        console.log("[WEBHOOK] mensaje recibido de:", waId);
        console.log("[WEBHOOK] from original:", waId);
        console.log("[WEBHOOK] from procesado (inbound):", fromProcesado);
        console.log("[WEBHOOK] from inbound mask (últimos 4 = huella; 549343… es común en la zona):", maskWaDigitsForLog(fromProcesado));
        console.log("[WEBHOOK] ¿pasa validación long. inbound?:", fromProcesado.length >= 8 && fromProcesado.length <= 16);
        console.log("[WEBHOOK] destino outbound (Graph) ok longitud:", toParaGraph.length >= 8 && toParaGraph.length <= 16, {
          toLen: toParaGraph.length,
        });
        console.log("[webhook-meta] inbound", {
          object: payload?.object,
          wa_id: waId,
          type,
          phone_number_id: metaPhoneNumberId,
          text: textBody.slice(0, 500),
        });
        console.log("[webhook-meta-whatsapp] inbound_message", {
          from: waId.replace(/\D/g, "") || waId,
          text: textBody.slice(0, 500),
          type,
          phone_number_id: metaPhoneNumberId,
        });
      }
    }
  }

  res.sendStatus(200);

  setImmediate(() => {
    processInboundPayloadAsync(payload).catch((err) => console.error("[webhook-meta] async", err));
  });
});

async function processInboundPayloadAsync(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const msg of messages) {
        const waId = String(msg?.from || "").replace(/\D/g, "");
        const type = String(msg?.type || "");
        if (type === "text") {
          const text = String(msg?.text?.body || "").trim();
          if (waId && text) {
            try {
              await logWhatsappMensajeRecibido(waId, text);
            } catch (e) {
              console.error("[webhook-meta] log recibido DB", e.message);
            }
          }
        } else if (type === "interactive" && msg?.interactive?.type === "list_reply") {
          const lr = msg.interactive.list_reply || {};
          const line = `[lista] ${lr.title || ""}`;
          if (waId) {
            try {
              await logWhatsappMensajeRecibido(waId, line);
            } catch (e) {
              console.error("[webhook-meta] log recibido DB", e.message);
            }
          }
        } else if (type === "location") {
          const loc = msg?.location || {};
          const la = loc.latitude != null ? Number(loc.latitude) : NaN;
          const lo = loc.longitude != null ? Number(loc.longitude) : NaN;
          const line = Number.isFinite(la) && Number.isFinite(lo)
            ? `[ubicación] ${la},${lo}`
            : "[ubicación]";
          if (waId) {
            try {
              await logWhatsappMensajeRecibido(waId, line);
            } catch (e) {
              console.error("[webhook-meta] log recibido DB", e.message);
            }
          }
        } else if (waId) {
          try {
            await logWhatsappMensajeRecibido(waId, `[${type}]`);
          } catch (_) {}
        }
      }
    }
  }

  try {
    await handleInboundMetaWhatsAppPayload(payload);
  } catch (e) {
    console.error("[webhook-meta] bot", e);
  }
}

export default router;
