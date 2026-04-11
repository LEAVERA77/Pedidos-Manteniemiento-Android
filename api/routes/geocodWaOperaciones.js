/**
 * GET operaciones de geocodificación WhatsApp (telemetría pre-INSERT) — solo admin, tenant del JWT.
 * Polling típico: cada 1–3 s desde el panel.
 *
 * made by leavera77
 */

import express from "express";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { geocodWaOperacionGet, geocodWaOperacionListForTenant } from "../services/geocodWaOperaciones.js";

const router = express.Router();

router.get("/", authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const items = await geocodWaOperacionListForTenant(req.tenantId, limit);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: "geocod_wa_list", detail: String(e?.message || e) });
  }
});

router.get("/:correlationId", authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = String(req.params.correlationId || "").trim();
    if (!id) return res.status(400).json({ error: "correlation_id_requerido" });
    const row = await geocodWaOperacionGet(id, req.tenantId);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: "geocod_wa_get", detail: String(e?.message || e) });
  }
});

export default router;
