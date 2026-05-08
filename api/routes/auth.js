import express from "express";
import bcrypt from "bcryptjs";
import { query } from "../db/neon.js";
import { authMiddleware, adminOnly, signToken } from "../middleware/auth.js";
import { getUserTenantId } from "../utils/tenantUser.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const loginId = String(req.body.email || req.body.usuario || "").trim();
    const password = String(req.body.password || "").trim();
    if (!loginId || !password) return res.status(400).json({ error: "Usuario y contraseña requeridos" });

    const r = await query(
      `SELECT id, email, nombre, rol, password_hash, activo FROM usuarios
       WHERE activo = TRUE AND (
         LOWER(TRIM(email)) = LOWER(TRIM($1))
         OR LOWER(TRIM(COALESCE(nombre, ''))) = LOWER(TRIM($1))
       )
       LIMIT 1`,
      [loginId]
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

/**
 * GET: tenant_id operativo desde `usuarios` en BD (misma fuente que attach-tenant / admin web).
 * Útil cuando el WebView lee Neon con carrera y el JWT aún trae un tenant viejo.
 */
router.get("/tenant-operativo", authMiddleware, async (req, res) => {
  return res.json({
    tenant_id: req.tenantId,
    user_id: req.user.id,
    jwt_claim_stale: !!req.jwtTenantClaimStale,
  });
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
    if (emailNuevo) {
      const looksEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNuevo);
      if (!looksEmail && (emailNuevo.length < 2 || emailNuevo.length > 120 || /\s/.test(emailNuevo))) {
        return res.status(400).json({ error: "Usuario o email no válido" });
      }
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

/**
 * Admin: cambiar usuario de login (columna `email`), nombre visible y/o contraseña.
 * Requiere `usuario_actual` coincidente con la sesión y contraseña actual correcta.
 */
router.put("/cambiar-credenciales", authMiddleware, adminOnly, async (req, res) => {
  try {
    const usuarioActual = String(req.body?.usuario_actual || "").trim();
    const nuevoUsuario = String(req.body?.nuevo_usuario != null ? req.body.nuevo_usuario : "").trim();
    const passwordActual = String(req.body?.password_actual || "").trim();
    const nuevaPassword = req.body?.nueva_password != null ? String(req.body.nueva_password).trim() : "";
    const nombreNuevo = req.body?.nombre != null ? String(req.body.nombre).trim() : null;

    if (!passwordActual) return res.status(400).json({ error: "Contraseña actual requerida" });
    if (!nuevoUsuario) return res.status(400).json({ error: "Usuario (login) requerido" });

    const r0 = await query(
      "SELECT id, email, nombre, rol, password_hash, activo FROM usuarios WHERE id = $1 AND activo = TRUE LIMIT 1",
      [req.user.id]
    );
    if (!r0.rows.length) return res.status(401).json({ error: "Usuario no encontrado" });
    const row = r0.rows[0];
    const emailDb = String(row.email || "").trim();
    if (usuarioActual.toLowerCase() !== emailDb.toLowerCase()) {
      return res.status(400).json({ error: "El usuario actual no coincide con la sesión" });
    }

    const hash = String(row.password_hash || "");
    let okPw = false;
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      okPw = await bcrypt.compare(passwordActual, hash);
    } else {
      okPw = passwordActual === hash;
    }
    if (!okPw) return res.status(401).json({ error: "Contraseña actual incorrecta" });

    if (nuevoUsuario.length > 254 || /\s/.test(nuevoUsuario)) {
      return res.status(400).json({ error: "Usuario de login inválido" });
    }
    const looksEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoUsuario);
    if (!looksEmail && (nuevoUsuario.length < 2 || nuevoUsuario.length > 120)) {
      return res.status(400).json({ error: "Usuario de login inválido" });
    }

    if (nuevoUsuario.toLowerCase() !== emailDb.toLowerCase()) {
      const dup = await query(
        "SELECT id FROM usuarios WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1",
        [nuevoUsuario, req.user.id]
      );
      if (dup.rows.length) return res.status(409).json({ error: "Ya existe un usuario con ese nombre de login" });
    }

    if (nuevaPassword && nuevaPassword.length < 4) {
      return res.status(400).json({ error: "La contraseña nueva debe tener al menos 4 caracteres" });
    }

    const nextNombre = nombreNuevo != null && nombreNuevo !== "" ? nombreNuevo : row.nombre;
    let nextHash = hash;
    if (nuevaPassword) nextHash = await bcrypt.hash(nuevaPassword, 10);

    const up = await query(
      `UPDATE usuarios SET email = $2, nombre = $3, password_hash = $4 WHERE id = $1 RETURNING id, email, nombre, rol`,
      [req.user.id, nuevoUsuario, nextNombre, nextHash]
    );

    const tenant_id = await getUserTenantId(req.user.id);
    const token = signToken({ userId: req.user.id, rol: up.rows[0].rol || row.rol, tenant_id });
    return res.json({ ok: true, token, user: up.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar credenciales", detail: error.message });
  }
});

export default router;

