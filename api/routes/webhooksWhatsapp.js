/**
 * Webhook Evolution API (y similares).
 * Configurar en Evolution: URL POST → /api/webhooks/whatsapp/evolution
 *
 * WAHA: POST → /api/webhooks/whatsapp/waha
 *   Docker: WHATSAPP_HOOK_URL=http://host.docker.internal:<PORT>/api/webhooks/whatsapp/waha?token=...
 *   <PORT> = mismo que en api/.env (PORT). Token = WHATSAPP_WEBHOOK_TOKEN
 *
 * Whapi.cloud: POST → /api/webhooks/whatsapp/whapi
 *   URL pública (ngrok, etc.): https://<host>/api/webhooks/whatsapp/whapi?token=...
 *
 * Variables sugeridas (.env):
 *   WHATSAPP_WEBHOOK_TOKEN=secreto-largo-compartido-con-evolution
 *
 * TODO Fase 2:
 *   - Validar firma/HMAC si Evolution lo expone en tu versión
 *   - Parsear payload real (texto, botones, media)
 *   - Avanzar whatsapp_bot_sessions + crear pedido vía servicio interno
 */
import express from "express";
import { handleInboundMetaWhatsAppPayload } from "../services/whatsappBotMeta.js";
import { logWhatsappMensajeRecibido } from "../services/whatsappNotificacionesLog.js";
import { wahaWebhookToMetaShapedPayload } from "../services/wahaWebhookAdapter.js";
import { whapiWebhookToMetaShapedPayload } from "../services/whapiWebhookAdapter.js";

const router = express.Router();

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: "unauthorized" });
}

function checkWebhookToken(req) {
  const token = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!token) return true;
  const hdr = req.get("authorization") || "";
  const q = req.query.token;
  return hdr === `Bearer ${token}` || q === token;
}

/** Whapi (y prueba en navegador): GET sin POST no recibe webhooks; responde 200 para verificar deploy. */
router.get("/whapi", (req, res) => {
  res.json({
    ok: true,
    path: "POST /api/webhooks/whatsapp/whapi",
    hint:
      "Whapi.cloud debe usar método POST. Si definiste WHATSAPP_WEBHOOK_TOKEN, la URL del panel incluye ?token=...",
  });
});

router.post("/waha", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    if (!checkWebhookToken(req)) {
      return unauthorized(res);
    }

    const body = req.body || {};
    const metaShaped = wahaWebhookToMetaShapedPayload(body);
    if (!metaShaped) {
      return res.json({ ok: true, skipped: true });
    }

    res.json({ ok: true, received: true });

    setImmediate(() => {
      processWahaInboundAsync(metaShaped, body).catch((e) =>
        console.error("[webhook-waha] async", e)
      );
    });
  } catch (e) {
    console.error("[webhook-waha]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/whapi", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    if (!checkWebhookToken(req)) {
      return unauthorized(res);
    }

    const body = req.body || {};
    const metaShaped = whapiWebhookToMetaShapedPayload(body);
    if (!metaShaped) {
      return res.json({ ok: true, skipped: true });
    }

    res.json({ ok: true, received: true });

    setImmediate(() => {
      processWhapiInboundAsync(metaShaped, body).catch((e) =>
        console.error("[webhook-whapi] async", e)
      );
    });
  } catch (e) {
    console.error("[webhook-whapi]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

async function processWhapiInboundAsync(metaShaped, rawWhapi) {
  try {
    const entries = Array.isArray(metaShaped?.entry) ? metaShaped.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          const waId = String(msg?.from || "").replace(/\D/g, "");
          const text = String(msg?.text?.body || "").trim();
          if (waId && text) {
            try {
              await logWhatsappMensajeRecibido(waId, text);
            } catch (e) {
              console.error("[webhook-whapi] log recibido DB", e.message);
            }
          }
        }
      }
    }
    await handleInboundMetaWhatsAppPayload(metaShaped);
  } catch (e) {
    console.error("[webhook-whapi] bot", e);
  }
}

async function processWahaInboundAsync(metaShaped, rawWaha) {
  try {
    const entries = Array.isArray(metaShaped?.entry) ? metaShaped.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          const waId = String(msg?.from || "").replace(/\D/g, "");
          const text = String(msg?.text?.body || "").trim();
          if (waId && text) {
            try {
              await logWhatsappMensajeRecibido(waId, text);
            } catch (e) {
              console.error("[webhook-waha] log recibido DB", e.message);
            }
          }
        }
      }
    }
    await handleInboundMetaWhatsAppPayload(metaShaped);
  } catch (e) {
    console.error("[webhook-waha] bot", e);
  }
}

router.post("/evolution", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const token = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (token) {
      const hdr = req.get("authorization") || "";
      const q = req.query.token;
      if (hdr !== `Bearer ${token}` && q !== token) {
        return unauthorized(res);
      }
    }

    const body = req.body || {};
    // Log mínimo para depuración (no loguear datos sensibles en prod)
    console.log("[webhook-whatsapp] event keys:", Object.keys(body));

    // Ejemplo: registrar evento crudo (opcional, descomentar si querés auditoría)
    // await query(
    //   `INSERT INTO webhook_event_log (origen, payload, created_at) VALUES ($1, $2::jsonb, NOW())`,
    //   ["evolution", JSON.stringify(body)]
    // );

    return res.json({ ok: true, received: true });
  } catch (e) {
    console.error("[webhook-whatsapp]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
