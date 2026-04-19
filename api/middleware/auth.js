import jwt from "jsonwebtoken";
import { query } from "../db/neon.js";
import { getUserTenantId } from "../utils/tenantUser.js";
import { tenantHostMiddleware } from "./tenantHost.js";
import { businessContextMiddleware } from "./businessContext.js";

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
        return res.status(401).json({ error: "Token no válido para este tenant (iniciá sesión de nuevo)" });
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
  if (!req.user || req.user.rol !== "admin") {
    return res.status(403).json({ error: "Requiere rol administrador" });
  }
  return next();
}

/** Autenticación + (opcional) validación host vs JWT cuando ENFORCE_TENANT_HOST=true */
export const authWithTenantHost = [authMiddleware, tenantHostMiddleware, businessContextMiddleware];
