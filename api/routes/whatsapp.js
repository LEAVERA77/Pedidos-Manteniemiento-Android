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

export default router;

