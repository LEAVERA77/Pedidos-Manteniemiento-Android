import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { normalizeBusinessTypeInput } from "../services/businessType.js";

const router = express.Router();

async function insertBusinessAudit({ tenantId, previousBusinessType, newBusinessType, changedByUserId, source }) {
  try {
    await query(
      `INSERT INTO tenant_business_audit(
        tenant_id, previous_business_type, new_business_type, changed_by_user_id, source
      ) VALUES($1,$2,$3,$4,$5)`,
      [tenantId, previousBusinessType || null, newBusinessType, changedByUserId ?? null, source || "switch"]
    );
  } catch (_) {}
}

router.get("/businesses", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const r = await query(
      `SELECT business_type, active, created_at
       FROM tenant_businesses
       WHERE tenant_id = $1
       ORDER BY business_type`,
      [req.tenantId]
    );
    const active = await query(
      `SELECT active_business_type
       FROM tenant_active_business
       WHERE tenant_id = $1
       LIMIT 1`,
      [req.tenantId]
    );
    return res.json({
      ok: true,
      tenant_id: req.tenantId,
      active_business_type: String(active.rows?.[0]?.active_business_type || "").trim() || null,
      businesses: r.rows || [],
    });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo listar negocios del tenant", detail: e.message });
  }
});

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
    const rb = await query(
      `SELECT 1 FROM tenant_businesses WHERE tenant_id = $1 AND business_type = $2 AND active = TRUE LIMIT 1`,
      [req.tenantId, bt]
    );
    if (!rb.rows.length) {
      return res.status(404).json({
        error: "Negocio no configurado para este tenant",
        hint: "Ejecutá POST /api/setup/wizard para registrar esa combinación tenant+business_type",
      });
    }
    const rPrev = await query(
      `SELECT active_business_type
       FROM tenant_active_business
       WHERE tenant_id = $1
       LIMIT 1`,
      [req.tenantId]
    );
    const prev = String(rPrev.rows?.[0]?.active_business_type || "").trim() || null;
    await query(
      `INSERT INTO tenant_active_business(tenant_id, active_business_type, updated_at)
       VALUES($1,$2,NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET active_business_type = EXCLUDED.active_business_type,
                     updated_at = NOW()`,
      [req.tenantId, bt]
    );
    const r = await query(
      `UPDATE clientes SET active_business_type = $2, fecha_actualizacion = NOW()
       WHERE id = $1
       RETURNING id, active_business_type, tipo`,
      [req.tenantId, bt]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado" });
    await insertBusinessAudit({
      tenantId: req.tenantId,
      previousBusinessType: prev,
      newBusinessType: bt,
      changedByUserId: req.user?.id ?? null,
      source: "switch",
    });
    return res.json({
      ok: true,
      tenant_id: req.tenantId,
      business_type: bt,
      message: `Cambiado a ${bt}. Los datos de otros negocios siguen guardados y aislados.`,
      cliente: r.rows[0],
    });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo cambiar el negocio activo", detail: e.message });
  }
});

export default router;
