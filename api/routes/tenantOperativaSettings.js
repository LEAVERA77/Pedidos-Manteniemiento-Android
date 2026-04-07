/**
 * Ajustes operativos por tenant (geocerca). Solo admin.
 */

import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";

const router = express.Router();
router.use(authWithTenantHost);

async function geocercaTableOk() {
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_geocerca_settings' LIMIT 1`
    );
    return t.rows.length > 0;
  } catch {
    return false;
  }
}

router.get("/geocerca-settings", adminOnly, async (req, res) => {
  try {
    const tid = Number(req.tenantId);
    if (!(await geocercaTableOk())) {
      return res.json({ tenant_id: tid, habilitada: true, radio_metros: 100, tabla_ok: false });
    }
    const r = await query(
      `SELECT tenant_id, habilitada, radio_metros, updated_at FROM tenant_geocerca_settings WHERE tenant_id = $1 LIMIT 1`,
      [tid]
    );
    const row = r.rows?.[0];
    if (!row) {
      return res.json({
        tenant_id: tid,
        habilitada: true,
        radio_metros: 100,
        tabla_ok: true,
        nota: "Sin fila aún: usá PUT para crear",
      });
    }
    return res.json({ ...row, tabla_ok: true });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo leer configuración", detail: error.message });
  }
});

router.put("/geocerca-settings", adminOnly, async (req, res) => {
  try {
    if (!(await geocercaTableOk())) {
      return res.status(503).json({
        error: "Falta la tabla tenant_geocerca_settings",
        hint: "docs/NEON_top3_operativa_cooperativa.sql",
      });
    }
    const tid = Number(req.tenantId);
    const hab = req.body?.habilitada;
    const radio = Number(req.body?.radio_metros);
    const habilitada = hab === undefined ? true : Boolean(hab);
    let radio_metros = Number.isFinite(radio) ? Math.round(radio) : 100;
    radio_metros = Math.min(5000, Math.max(10, radio_metros));
    const r = await query(
      `INSERT INTO tenant_geocerca_settings (tenant_id, habilitada, radio_metros)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id) DO UPDATE SET
         habilitada = EXCLUDED.habilitada,
         radio_metros = EXCLUDED.radio_metros,
         updated_at = NOW()
       RETURNING *`,
      [tid, habilitada, radio_metros]
    );
    return res.json(r.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: "No se pudo guardar", detail: error.message });
  }
});

export default router;
