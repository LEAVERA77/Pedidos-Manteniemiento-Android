/** Clave en env + header `X-GestorNova-Technician-Key` o alias `x-tech-key` (soporte; no va en el repo). */
export function technicianTenantKeyOk(req) {
  const expected = String(process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY || "").trim();
  const got = String(
    req.headers["x-gestornova-technician-key"] || req.headers["x-tech-key"] || ""
  ).trim();
  return Boolean(expected && got === expected);
}

export function requireTechnicianTenantKey(req, res, next) {
  if (!technicianTenantKeyOk(req)) {
    return res.status(403).json({ error: "Operación no permitida" });
  }
  return next();
}
