import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import {
  humanChatListOpenSessions,
  humanChatGetMessages,
  humanChatActivateSession,
  humanChatCloseSessionAdmin,
  humanChatAppendOutbound,
  humanChatGetSessionForTenant,
} from "../services/whatsappHumanChat.js";
import { sendTenantWhatsAppText } from "../services/whatsappService.js";

const router = express.Router();

router.use(authWithTenantHost, adminOnly);

router.get("/sessions", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const sinceRaw = req.query.since;
    let since = null;
    if (sinceRaw) {
      const d = new Date(String(sinceRaw));
      if (!Number.isNaN(d.getTime())) since = d;
    }
    const rows = await humanChatListOpenSessions(tenantId, since);
    return res.json({ sessions: rows });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo listar sesiones", detail: e.message });
  }
});

router.get("/sessions/:id/messages", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const id = Number(req.params.id);
    const messages = await humanChatGetMessages(id, tenantId);
    const session = await humanChatGetSessionForTenant(id, tenantId);
    if (!session) return res.status(404).json({ error: "Sesión no encontrada" });
    return res.json({ session, messages });
  } catch (e) {
    return res.status(500).json({ error: "No se pudieron leer mensajes", detail: e.message });
  }
});

router.post("/sessions/:id/activate", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const id = Number(req.params.id);
    const s = await humanChatActivateSession(id, tenantId, req.user.id);
    return res.json({ ok: true, session: s });
  } catch (e) {
    const m = String(e?.message || "");
    if (m === "session_not_open") return res.status(404).json({ error: "Sesión no disponible" });
    return res.status(500).json({ error: "No se pudo activar", detail: e.message });
  }
});

router.post("/sessions/:id/close", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const id = Number(req.params.id);
    await humanChatCloseSessionAdmin(id, tenantId);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo cerrar", detail: e.message });
  }
});

router.post("/sessions/:id/send", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const id = Number(req.params.id);
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "text requerido" });
    const session = await humanChatGetSessionForTenant(id, tenantId);
    if (!session) return res.status(404).json({ error: "Sesión no encontrada" });
    if (!["queued", "active"].includes(session.estado)) {
      return res.status(400).json({ error: "Sesión cerrada" });
    }
    const phone = String(session.phone_canonical || "").replace(/\D/g, "");
    if (!phone) return res.status(400).json({ error: "Teléfono inválido en sesión" });

    const r = await sendTenantWhatsAppText({
      tenantId,
      toDigits: phone,
      bodyText: text,
      logContext: "whatsapp_human_chat_admin",
    });
    if (!r.ok) {
      return res.status(502).json({ error: "No se pudo enviar por WhatsApp", detail: r.error || r.graph });
    }
    await humanChatAppendOutbound(id, text, { by: req.user.id });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Error al enviar", detail: e.message });
  }
});

export default router;
