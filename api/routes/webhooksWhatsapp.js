/**
 * Webhook Evolution API (y similares).
 * Configurar en Evolution: URL POST → /api/webhooks/whatsapp/evolution
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

const router = express.Router();

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: "unauthorized" });
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

// Meta Cloud API webhook verify (GET)
// GET /api/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
router.get("/meta", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || "";

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return res.status(200).send(String(challenge || ""));
  }
  return res.sendStatus(403);
});

// Meta Cloud API inbound messages (POST)
// POST /api/webhooks/whatsapp/meta
router.post("/meta", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const body = req.body || {};
    const entries = Array.isArray(body.entry) ? body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          const from = String(msg?.from || "");
          const text = String(msg?.text?.body || "");
          console.log("[webhook-meta-whatsapp] inbound_message", {
            from,
            text,
            type: msg?.type || "unknown",
          });
        }
      }
    }

    return res.status(200).json({ ok: true, received: true });
  } catch (e) {
    console.error("[webhook-meta-whatsapp]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
