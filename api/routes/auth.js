import express from "express";
import bcrypt from "bcryptjs";
import { query } from "../db/neon.js";
import { authMiddleware, signToken } from "../middleware/auth.js";
import { getUserTenantId } from "../utils/tenantUser.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "").trim();
    if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });

    const r = await query(
      "SELECT id, email, nombre, rol, password_hash, activo FROM usuarios WHERE email = $1 LIMIT 1",
      [email]
    );
    if (!r.rows.length) return res.status(401).json({ error: "Credenciales inválidas" });
    const u = r.rows[0];
    if (!u.activo) return res.status(403).json({ error: "Usuario inactivo" });

    const hash = String(u.password_hash || "");
    let ok = false;
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      ok = await bcrypt.compare(password, hash);
    } else {
      ok = password === hash; // compatibilidad temporal texto plano
    }
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const tenant_id = await getUserTenantId(u.id);
    const token = signToken({ userId: u.id, rol: u.rol, tenant_id });
    return res.json({
      token,
      user: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, tenant_id },
    });
  } catch (error) {
    return res.status(500).json({ error: "Error en login", detail: error.message });
  }
});

router.post("/verify-token", authMiddleware, async (req, res) => {
  return res.json({ ok: true, user: req.user, tenant_id: req.tenantId });
});

/** Confirma la contraseña del usuario autenticado (p. ej. antes de cambiar rubro del tenant en la web admin). */
router.post("/verify-password", authMiddleware, async (req, res) => {
  try {
    const rol = String(req.user.rol || "").toLowerCase();
    if (rol !== "admin" && rol !== "administrador") {
      return res.status(403).json({ error: "Solo administradores pueden verificar la contraseña para esta acción" });
    }
    const password = String(req.body?.password || "").trim();
    if (!password) return res.status(400).json({ error: "Contraseña requerida" });

    const r = await query("SELECT password_hash FROM usuarios WHERE id = $1 AND activo = TRUE LIMIT 1", [req.user.id]);
    if (!r.rows.length) return res.status(401).json({ error: "Usuario no encontrado" });

    const hash = String(r.rows[0].password_hash || "");
    let ok = false;
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      ok = await bcrypt.compare(password, hash);
    } else {
      ok = password === hash;
    }
    if (!ok) return res.status(401).json({ error: "Contraseña incorrecta" });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo verificar la contraseña", detail: error.message });
  }
});

/**
 * Usuario autenticado: cambiar email y/o nombre y/o contraseña (requiere contraseña actual).
 */
router.patch("/me", authMiddleware, async (req, res) => {
  try {
    const emailNuevo = req.body?.email != null ? String(req.body.email).trim().toLowerCase() : null;
    const nombreNuevo = req.body?.nombre != null ? String(req.body.nombre).trim() : null;
    const passwordActual = String(req.body?.password_actual || "").trim();
    const passwordNueva = req.body?.password_nueva != null ? String(req.body.password_nueva).trim() : "";

    if (!passwordActual) return res.status(400).json({ error: "Contraseña actual requerida" });
    if (!emailNuevo && !nombreNuevo && !passwordNueva) {
      return res.status(400).json({ error: "Indicá email, nombre o contraseña nueva" });
    }
    if (emailNuevo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNuevo)) {
      return res.status(400).json({ error: "Email no válido" });
    }
    if (passwordNueva && passwordNueva.length < 4) {
      return res.status(400).json({ error: "La contraseña nueva debe tener al menos 4 caracteres" });
    }

    const r0 = await query("SELECT id, email, nombre, password_hash FROM usuarios WHERE id = $1 AND activo = TRUE LIMIT 1", [
      req.user.id,
    ]);
    if (!r0.rows.length) return res.status(401).json({ error: "Usuario no encontrado" });
    const row = r0.rows[0];
    const hash = String(row.password_hash || "");
    let okPw = false;
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      okPw = await bcrypt.compare(passwordActual, hash);
    } else {
      okPw = passwordActual === hash;
    }
    if (!okPw) return res.status(401).json({ error: "Contraseña actual incorrecta" });

    if (emailNuevo) {
      const dup = await query("SELECT id FROM usuarios WHERE lower(trim(email)) = $1 AND id <> $2 LIMIT 1", [
        emailNuevo,
        req.user.id,
      ]);
      if (dup.rows.length) return res.status(409).json({ error: "Ya existe un usuario con ese email" });
    }

    const nextEmail = emailNuevo || row.email;
    const nextNombre = nombreNuevo != null && nombreNuevo !== "" ? nombreNuevo : row.nombre;
    let nextHash = hash;
    if (passwordNueva) nextHash = await bcrypt.hash(passwordNueva, 10);

    const up = await query(
      `UPDATE usuarios SET email = $2, nombre = $3, password_hash = $4 WHERE id = $1 RETURNING id, email, nombre, rol`,
      [req.user.id, nextEmail, nextNombre, nextHash]
    );
    return res.json({ ok: true, user: up.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar el perfil", detail: error.message });
  }
});

/** Proxy SQL para el WebView de Android (evita usar JDBC directamente en el móvil). */
router.post("/sql-proxy", authMiddleware, async (req, res) => {
  try {
    const q = String(req.body?.query || "").trim();
    if (!q) return res.status(400).json({ error: "Query requerida" });

    // Restricción de seguridad: solo permitimos SELECT en el proxy si no es admin,
    // EXCEPTO para las tablas de ubicaciones y marcado de notificaciones leídas (Workers).
    const rol = String(req.user.rol || "").toLowerCase();
    const esAdmin = rol === "admin" || rol === "administrador";
    const qLower = q.toLowerCase();

    if (!esAdmin) {
      const isSelect = qLower.startsWith("select");
      const isUbicacion = qLower.includes("ubicaciones_usuarios");
      const isNotifUpdate = qLower.startsWith("update notificaciones_movil") && qLower.includes("leida = true");

      if (!isSelect && !isUbicacion && !isNotifUpdate) {
        return res.status(403).json({ error: "Solo se permiten consultas de lectura o actualizaciones de estado autorizadas" });
      }
    }

    const result = await query(q);
    return res.json({ rows: result.rows });
  } catch (error) {
    return res.status(500).json({ error: "Error en SQL Proxy", detail: error.message });
  }
});

export default router;

