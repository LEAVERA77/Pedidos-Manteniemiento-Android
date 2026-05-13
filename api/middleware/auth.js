import jwt from "jsonwebtoken";
import { query } from "../db/neon.js";
import { getUserTenantId } from "../utils/tenantUser.js";
import { tenantHostMiddleware } from "./tenantHost.js";
import { businessContextMiddleware } from "./businessContext.js";
import { technicianTenantKeyOk } from "./technicianTenantKey.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
}

/**
 * Verifica Bearer, carga usuario, fija req.tenantId (desde BD; cruzado con tenant_id del JWT si viene).
 */
export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [, token] = header.split(" ");
    if (!token) return res.status(401).json({ error: "Token requerido" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const uid = decoded.userId ?? decoded.sub;
    if (!uid) return res.status(401).json({ error: "Token inválido" });

    const r = await query("SELECT id, email, nombre, rol, activo FROM usuarios WHERE id = $1 LIMIT 1", [uid]);

    if (!r.rows.length || !r.rows[0].activo) {
      return res.status(401).json({ error: "Usuario inválido o inactivo" });
    }
    req.user = r.rows[0];

    const dbTenantId = await getUserTenantId(req.user.id);
    if (decoded.tenant_id != null && Number.isFinite(Number(decoded.tenant_id))) {
      if (Number(decoded.tenant_id) !== Number(dbTenantId)) {
        /* JWT con tenant viejo: el operativo es el de la BD (p. ej. attach-tenant desde la web admin). */
        req.jwtTenantClaimStale = true;
      }
    }
    req.tenantId = dbTenantId;
    req.user.tenant_id = dbTenantId;

    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido", detail: error.message });
  }
}

export function adminOnly(req, res, next) {
  const rol = String(req.user?.rol || "").toLowerCase();
  if (!req.user || (rol !== "admin" && rol !== "administrador")) {
    return res.status(403).json({ error: "Requiere rol administrador" });
  }
  return next();
}

/** POST /api/setup/wizard: admin o técnico/supervisor con GESTORNOVA_TECHNICIAN_TENANT_KEY (sin crear instancia nueva). */
export function adminOrTechnicianWizardKey(req, res, next) {
  const rol = String(req.user?.rol || "").toLowerCase();
  if (rol === "admin" || rol === "administrador") return next();
  if (
    technicianTenantKeyOk(req) &&
    (rol === "tecnico" || rol === "técnico" || rol === "supervisor")
  ) {
    return next();
  }
  return res.status(403).json({
    error: "Requiere administrador o técnico/supervisor con clave GESTORNOVA_TECHNICIAN_TENANT_KEY",
  });
}

/** Incidencias: crear, cerrar grupo y desasociar — alineado con `esTecnicoOSupervisor` en el front (tecnico | supervisor). */
export function adminOrTecnicoIncidencias(req, res, next) {
  const rol = String(req.user?.rol || "").toLowerCase().trim();
  if (
    !req.user ||
    (rol !== "admin" &&
      rol !== "administrador" &&
      rol !== "tecnico" &&
      rol !== "supervisor")
  ) {
    return res.status(403).json({ error: "Requiere rol administrador o técnico" });
  }
  return next();
}

/** IA panel técnico (asignados): no admin — el análisis global de reclamos sigue en rutas adminOnly. */
export function tecnicoSupervisorOnly(req, res, next) {
  const rol = String(req.user?.rol || "").toLowerCase().trim();
  if (rol === "admin" || rol === "administrador") {
    return res.status(403).json({ ok: false, error: "Los administradores usan el análisis general del panel." });
  }
  if (rol === "tecnico" || rol === "técnico" || rol === "supervisor") return next();
  return res.status(403).json({ ok: false, error: "Requiere rol técnico o supervisor" });
}

/** Autenticación + (opcional) validación host vs JWT cuando ENFORCE_TENANT_HOST=true */
export const authWithTenantHost = [authMiddleware, tenantHostMiddleware, businessContextMiddleware];
