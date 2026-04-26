import express from "express";
import bcrypt from "bcryptjs";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { normalizeBusinessTypeInput } from "../services/businessType.js";
import { tableHasColumn } from "../utils/tenantScope.js";

const router = express.Router();
router.use(authWithTenantHost, adminOnly);

async function upsertTenantBusiness(tenantId, businessType) {
  await query(
    `INSERT INTO tenant_businesses(tenant_id, business_type, active)
     VALUES($1,$2,TRUE)
     ON CONFLICT (tenant_id, business_type)
     DO UPDATE SET active = TRUE`,
    [tenantId, businessType]
  );
}

async function upsertActiveBusiness(tenantId, businessType) {
  const prev = await query(
    `SELECT active_business_type FROM tenant_active_business WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  const previousBusinessType = String(prev.rows?.[0]?.active_business_type || "").trim() || null;
  await query(
    `INSERT INTO tenant_active_business(tenant_id, active_business_type, updated_at)
     VALUES($1,$2,NOW())
     ON CONFLICT (tenant_id)
     DO UPDATE SET active_business_type = EXCLUDED.active_business_type,
                   updated_at = NOW()`,
    [tenantId, businessType]
  );
  if (await tableHasColumn("clientes", "active_business_type")) {
    await query(`UPDATE clientes SET active_business_type = $2, fecha_actualizacion = NOW() WHERE id = $1`, [
      tenantId,
      businessType,
    ]);
  }
  try {
    await query(
      `INSERT INTO tenant_business_audit(
        tenant_id, previous_business_type, new_business_type, changed_by_user_id, source
      ) VALUES($1,$2,$3,$4,'wizard')`,
      [tenantId, previousBusinessType, businessType, null]
    );
  } catch (_) {}
}

async function ensureGlobalAdminForTenant({ tenantId, adminEmail, adminPassword, fallbackUserId }) {
  if (!(await tableHasColumn("usuarios", "business_type"))) return;
  if (fallbackUserId) {
    await query(`UPDATE usuarios SET business_type = NULL WHERE id = $1 AND tenant_id = $2`, [fallbackUserId, tenantId]);
  }
  if (!adminEmail || !adminPassword) return;
  const r = await query(
    `SELECT id FROM usuarios
     WHERE tenant_id = $1 AND lower(email) = lower($2) AND (business_type IS NULL OR rol = 'admin')
     LIMIT 1`,
    [tenantId, adminEmail]
  );
  if (r.rows.length) return;
  const hash = await bcrypt.hash(String(adminPassword), 10);
  await query(
    `INSERT INTO usuarios(tenant_id, business_type, nombre, email, password_hash, rol, activo)
     VALUES($1,NULL,'Administrador',$2,$3,'admin',TRUE)`,
    [tenantId, adminEmail, hash]
  );
}

async function contarDatos(tenantId, businessType) {
  const tables = ["pedidos", "socios_catalogo", "usuarios"];
  let total = 0;
  for (const t of tables) {
    const hasTenant = await tableHasColumn(t, "tenant_id");
    if (!hasTenant) continue;
    const hasBt = await tableHasColumn(t, "business_type");
    const params = [tenantId];
    let where = "tenant_id = $1";
    if (hasBt && t !== "usuarios") {
      params.push(businessType);
      where += ` AND business_type = $${params.length}`;
    } else if (hasBt && t === "usuarios") {
      params.push(businessType);
      where += ` AND (business_type = $${params.length} OR rol = 'admin' OR business_type IS NULL)`;
    }
    const r = await query(`SELECT COUNT(*)::int AS c FROM ${t} WHERE ${where}`, params);
    total += Number(r.rows?.[0]?.c || 0);
  }
  return total;
}

router.post("/wizard", async (req, res) => {
  try {
    const tenantId = Number(req.tenantId);
    const tenantNombre = String(req.body?.tenant_nombre || req.body?.nombre || "").trim();
    const businessType = normalizeBusinessTypeInput(req.body?.business_type || req.body?.tipo);
    if (!businessType) {
      return res.status(400).json({ error: "business_type inválido", permitidos: ["electricidad", "agua", "municipio"] });
    }
    const rc = await query(`SELECT id, nombre FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
    if (!rc.rows.length) return res.status(404).json({ error: "Tenant no encontrado" });
    if (tenantNombre && rc.rows[0].nombre !== tenantNombre) {
      return res.status(403).json({ error: "tenant_nombre no coincide con el tenant autenticado" });
    }

    const rb = await query(
      `SELECT id FROM tenant_businesses WHERE tenant_id = $1 AND business_type = $2 LIMIT 1`,
      [tenantId, businessType]
    );
    const datosExistentes = !!rb.rows.length;

    await upsertTenantBusiness(tenantId, businessType);
    await upsertActiveBusiness(tenantId, businessType);
    await ensureGlobalAdminForTenant({
      tenantId,
      adminEmail: String(req.body?.admin_email || "").trim() || null,
      adminPassword: String(req.body?.admin_password || "").trim() || null,
      fallbackUserId: req.user?.id ?? null,
    });

    const total = await contarDatos(tenantId, businessType);
    return res.json({
      ok: true,
      tenant_id: tenantId,
      business_type: businessType,
      datos_existentes: datosExistentes,
      total_registros: total,
      message: datosExistentes
        ? `Bienvenido de nuevo. Se cargaron ${total} registros del negocio ${businessType}.`
        : `Nuevo negocio ${businessType} configurado para el tenant. Inicia desde cero.`,
    });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo completar setup wizard", detail: e.message });
  }
});

export default router;
