import jwt from "jsonwebtoken";
import { query } from "../db/neon.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
}

export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [, token] = header.split(" ");
    if (!token) return res.status(401).json({ error: "Token requerido" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const r = await query("SELECT id, email, nombre, rol, activo FROM usuarios WHERE id = $1 LIMIT 1", [
      decoded.userId,
    ]);

    if (!r.rows.length || !r.rows[0].activo) {
      return res.status(401).json({ error: "Usuario inválido o inactivo" });
    }
    req.user = r.rows[0];
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

