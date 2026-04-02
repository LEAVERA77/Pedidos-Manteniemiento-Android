import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { normalizePhone } from "../utils/helpers.js";

const router = express.Router();
router.use(authMiddleware);

router.post("/enviar-link", async (req, res) => {
  try {
    const { destinatario_id, destinatario_tipo = "usuario", telefono, pedido_id, mensaje } = req.body;
    const tel = normalizePhone(telefono);
    if (!tel || !mensaje) return res.status(400).json({ error: "telefono y mensaje son requeridos" });

    const waUrl = `https://wa.me/${tel.replace(/[^\d]/g, "")}?text=${encodeURIComponent(String(mensaje))}`;
    const r = await query(
      `INSERT INTO whatsapp_notificaciones
       (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
       VALUES($1,$2,$3,$4,$5,'enviado',NOW(),NOW())
       RETURNING *`,
      [destinatario_id || null, destinatario_tipo, tel, mensaje, pedido_id || null]
    );
    res.status(201).json({ ok: true, waUrl, registro: r.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "No se pudo registrar envío WhatsApp", detail: error.message });
  }
});

router.get("/historial", async (req, res) => {
  try {
    if (req.user.rol !== "admin") return res.status(403).json({ error: "Solo admin" });
    const r = await query("SELECT * FROM whatsapp_notificaciones ORDER BY id DESC LIMIT 500");
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener historial", detail: error.message });
  }
});

router.post("/meta/enviar-texto", async (req, res) => {
  try {
    const { telefono, mensaje, destinatario_id, pedido_id } = req.body || {};
    const tel = normalizePhone(telefono);
    const body = String(mensaje || "").trim();
    if (!tel || !body) return res.status(400).json({ error: "telefono y mensaje son requeridos" });

    const token = process.env.META_ACCESS_TOKEN || "";
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID || "";
    if (!token || !phoneNumberId) {
      return res.status(500).json({ error: "Faltan META_ACCESS_TOKEN o META_PHONE_NUMBER_ID" });
    }

    const endpoint = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: tel.replace(/[^\d]/g, ""),
      type: "text",
      text: { body },
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
      await query(
        `INSERT INTO whatsapp_notificaciones
         (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
         VALUES($1,'usuario',$2,$3,$4,'error',NOW(),NOW())`,
        [destinatario_id || null, tel, body, pedido_id || null]
      );
      return res.status(resp.status).json({ ok: false, error: "graph_error", detail: graph });
    }

    const r = await query(
      `INSERT INTO whatsapp_notificaciones
       (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
       VALUES($1,'usuario',$2,$3,$4,'enviado',NOW(),NOW()) RETURNING *`,
      [destinatario_id || null, tel, body, pedido_id || null]
    );
    return res.json({ ok: true, graph, registro: r.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo enviar por Meta", detail: error.message });
  }
});

export default router;

