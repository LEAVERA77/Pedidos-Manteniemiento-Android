import express from "express";
import { authWithTenantHost } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { usuarioPerteneceATenant } from "../utils/tenantScope.js";
import { upsertFcmToken } from "../services/fcmPush.js";

const router = express.Router();
router.use(authWithTenantHost);

router.post("/enviar-push", async (req, res) => {
  try {
    if (req.user.rol !== "admin") return res.status(403).json({ error: "Solo admin" });
    const { usuario_id, pedido_id, titulo, cuerpo } = req.body;
    if (!usuario_id || !titulo || !cuerpo) {
      return res.status(400).json({ error: "usuario_id, titulo y cuerpo son requeridos" });
    }
    const okUser = await usuarioPerteneceATenant(usuario_id, req.tenantId);
    if (!okUser) {
      return res.status(403).json({ error: "El usuario no pertenece a este tenant" });
    }
    const r = await query(
      `INSERT INTO notificaciones_movil(usuario_id, pedido_id, titulo, cuerpo, leida)
       VALUES($1,$2,$3,$4,FALSE) RETURNING *`,
      [usuario_id, pedido_id || null, titulo, cuerpo]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "No se pudo crear notificación", detail: error.message });
  }
});

router.post("/fcm-token", async (req, res) => {
  try {
    const fcmToken = String(req.body?.fcm_token || req.body?.token || "").trim();
    if (fcmToken.length < 20) {
      return res.status(400).json({ error: "fcm_token inválido" });
    }
    const ok = await upsertFcmToken({
      usuarioId: req.user.id,
      tenantId: req.tenantId,
      fcmToken,
      plataforma: req.body?.plataforma || "android",
    });
    if (!ok) {
      return res.status(503).json({
        error: "Tabla usuario_fcm_token no existe",
        hint: "docs/NEON_fcm_reportes_sla.sql",
      });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo guardar token", detail: error.message });
  }
});

router.get("/mis-notificaciones", async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM notificaciones_movil
       WHERE usuario_id = $1
       ORDER BY id DESC
       LIMIT 200`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron listar notificaciones", detail: error.message });
  }
});

export default router;
