/**
 * Listado de tenants solo con clave técnico.
 * Router montado en httpApp ANTES de setupWizard para no depender del orden interno del otro router.
 */
import express from "express";
import { query } from "../db/neon.js";
import { requireTechnicianTenantKey } from "../middleware/technicianTenantKey.js";

const router = express.Router();

router.get("/technician/tenants", requireTechnicianTenantKey, async (req, res) => {
  try {
    const r = await query(
      `SELECT id, nombre, tipo, COALESCE(activo, TRUE) AS activo
       FROM clientes
       ORDER BY id ASC
       LIMIT 500`
    );
    return res.json({ ok: true, clientes: r.rows || [] });
  } catch (e) {
    console.error("[setup/technician/tenants]", e);
    return res.status(500).json({ error: "No se pudo listar clientes", detail: e.message });
  }
});

export default router;
