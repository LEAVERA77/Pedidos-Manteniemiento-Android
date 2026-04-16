import {
  loadTenantBusinessContext,
  tenantBusinessesTableExists,
  tenantActiveBusinessTableExists,
} from "../utils/businessScope.js";
import { query } from "../db/neon.js";

/**
 * Middleware estricto: exige negocio activo para el tenant
 * y que exista en tenant_businesses cuando las tablas están disponibles.
 */
export async function tenantBusinessFilter(req, res, next) {
  const tid = Number(req.tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return res.status(401).json({ error: "Tenant no identificado" });
  }
  const ctx = await loadTenantBusinessContext(tid);
  req.activeBusinessType = ctx.activeBusinessType;
  req.businessTypeFilterEnabled = ctx.businessTypeFilterEnabled;

  const hasTa = await tenantActiveBusinessTableExists();
  const hasTb = await tenantBusinessesTableExists();
  if (!hasTa || !hasTb) return next();

  const r = await query(
    `SELECT 1
     FROM tenant_businesses
     WHERE tenant_id = $1 AND business_type = $2 AND active = TRUE
     LIMIT 1`,
    [tid, req.activeBusinessType]
  );
  if (!r.rows.length) {
    return res.status(400).json({
      error: "No hay negocio activo válido para el tenant",
      hint: "Ejecutá el wizard o switch-business para registrar/activar la línea",
    });
  }
  return next();
}
