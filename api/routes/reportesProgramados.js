/**
 * Reportes periódicos por email + cron.
 * made by leavera77
 */

import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import {
  getReporteEmailConfig,
  putReporteEmailConfig,
  generarYEnviarReporteTenant,
  ejecutarReportesProgramadosCron,
} from "../services/reportesEmailProgramados.js";

const router = express.Router();

router.get("/config", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const cfg = await getReporteEmailConfig(req.tenantId);
    return res.json(cfg);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put("/config", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const row = await putReporteEmailConfig(req.tenantId, {
      email: req.body?.email,
      frecuencia: req.body?.frecuencia,
    });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/ejecutar-ahora", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const out = await generarYEnviarReporteTenant(req.tenantId, {
      forzar: true,
      emailOverride: req.body?.email,
      frecuenciaOverride: req.body?.frecuencia,
    });
    if (!out.ok) return res.status(400).json(out);
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message, detail: e.message, mensaje: e.message });
  }
});

/** Cron externo (Render): header X-Cron-Secret = CRON_SECRET */
router.post("/cron/ejecutar", async (req, res) => {
  const sec = String(req.headers["x-cron-secret"] || "");
  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected || sec !== expected) {
    return res.status(403).json({ error: "No autorizado" });
  }
  try {
    const out = await ejecutarReportesProgramadosCron();
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
