import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { normalizeBusinessTypeInput } from "../services/businessType.js";

const router = express.Router();

/**
 * Lista negocios habilitados del tenant y el negocio activo (multi-rubro).
 */
router.get("/businesses", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const tid = Number(req.tenantId);
    if (!(await tableHasColumn("tenant_businesses", "business_type"))) {
      return res.status(503).json({
        error: "Falta tabla o columna tenant_businesses",
        hint: "Ejecutá api/db/migrations/tenant_business_isolation_core.sql en Neon",
      });
    }
    const rList = await query(
      `SELECT business_type, active, created_at
       FROM tenant_businesses
       WHERE tenant_id = $1 AND active = TRUE
       ORDER BY business_type`,
      [tid]
    );
    let active = "";
    if (await tableHasColumn("tenant_active_business", "active_business_type")) {
      const rA = await query(
        `SELECT active_business_type FROM tenant_active_business WHERE tenant_id = $1 LIMIT 1`,
        [tid]
      );
      active = String(rA.rows?.[0]?.active_business_type || "").trim();
    }
    if (!active && (await tableHasColumn("clientes", "active_business_type"))) {
      const rC = await query(`SELECT tipo, active_business_type FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
      const row = rC.rows?.[0];
      active = String(row?.active_business_type || "").trim();
      if (!active) {
        const norm = normalizeBusinessTypeInput(row?.tipo);
        if (norm) active = norm;
      }
    }
    if (!active) active = "electricidad";
    const normActive = normalizeBusinessTypeInput(active) || "electricidad";
    return res.json({
      tenant_id: tid,
      businesses: (rList.rows || []).map((b) => ({
        business_type: b.business_type,
        active: b.active !== false,
        created_at: b.created_at,
      })),
      active_business_type: normActive,
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
    const r = await query(
      `UPDATE clientes SET active_business_type = $2, fecha_actualizacion = NOW() WHERE id = $1 RETURNING id, active_business_type, tipo`,
      [req.tenantId, bt]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado" });
    if (await tableHasColumn("tenant_active_business", "active_business_type")) {
      try {
        await query(
          `INSERT INTO tenant_active_business(tenant_id, active_business_type, updated_at)
           VALUES($1,$2,NOW())
           ON CONFLICT (tenant_id)
           DO UPDATE SET active_business_type = EXCLUDED.active_business_type, updated_at = NOW()`,
          [req.tenantId, bt]
        );
      } catch (_) {
        /* tabla opcional en entornos viejos */
      }
    }
    return res.json({ ok: true, tenant_id: req.tenantId, cliente: r.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo cambiar el negocio activo", detail: e.message });
  }
});

export default router;
