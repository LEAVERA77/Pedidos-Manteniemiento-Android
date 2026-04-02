import crypto from "crypto";
import express from "express";

const router = express.Router();

function safeCompare(a, b) {
  const aa = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function verifyMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET || "";
  if (!appSecret) return true; // Allow in non-production if secret not configured.

  const signature = req.get("x-hub-signature-256") || "";
  if (!signature.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(req.body || Buffer.alloc(0))
    .digest("hex")}`;

  return safeCompare(signature, expected);
}

// GET /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.META_VERIFY_TOKEN || "";

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return res.status(200).send(String(challenge || ""));
  }
  return res.sendStatus(403);
});

// POST /api/webhooks/meta
router.post("/", express.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
  try {
    if (!verifyMetaSignature(req)) {
      return res.status(401).json({ ok: false, error: "invalid_signature" });
    }

    const payload = JSON.parse((req.body || Buffer.from("{}")).toString("utf8"));
    const entryCount = Array.isArray(payload?.entry) ? payload.entry.length : 0;
    console.log("[webhook-meta] received", { object: payload?.object, entryCount });

    // TODO: Process entry[].changes[].value.messages / statuses and route to your bot logic.
    return res.sendStatus(200);
  } catch (error) {
    console.error("[webhook-meta]", error);
    return res.status(500).json({ ok: false, error: "webhook_error", detail: error.message });
  }
});

export default router;
