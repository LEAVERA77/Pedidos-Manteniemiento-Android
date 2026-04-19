import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { normalizeBusinessTypeInput } from "../services/businessType.js";

const router = express.Router();

router.post("/switch-business", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    if (!(await tableHasColumn("clientes", "active_business_type"))) {
      return res.status(503).json({
        error: "Falta columna active_business_type en clientes",
        hint: "Ejecutá api/db/migrations/business_type_multi_negocio.sql en Neon",
      });
    }
    const bt = normalizeBusinessTypeInput(req.body?.business_type);
    if (!bt) {
      return res.status(400).json({ error: "business_type inválido", permitidos: ["electricidad", "agua", "municipio"] });
    }
    const r = await query(
      `UPDATE clientes SET active_business_type = $2, fecha_actualizacion = NOW() WHERE id = $1 RETURNING id, active_business_type, tipo`,
      [req.tenantId, bt]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado" });
    return res.json({ ok: true, tenant_id: req.tenantId, cliente: r.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo cambiar el negocio activo", detail: e.message });
  }
});

export default router;
