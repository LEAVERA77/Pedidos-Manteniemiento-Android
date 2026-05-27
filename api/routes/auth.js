import express from "express";
import bcrypt from "bcryptjs";
import { query } from "../db/neon.js";
import { authMiddleware, adminOnly, signToken } from "../middleware/auth.js";
import { getUserTenantId } from "../utils/tenantUser.js";
import { tableHasColumn, usuariosTenantColumnName } from "../utils/tenantScope.js";
import { normalizeLoginId, parecePasswordHashBcrypt } from "../utils/usuarioLoginGlobal.js";
import {
  admin2faHabilitado,
  adminRolPara2fa,
  crearDesafioOtpAdmin,
  verificarDesafioOtpAdmin,
} from "../services/adminLoginOtp.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const loginId = normalizeLoginId(req.body.usuario || req.body.email || "");
    const password = String(req.body.password || "").trim();
    if (!loginId || !password) return res.status(400).json({ error: "Usuario y contraseña requeridos" });
    if (parecePasswordHashBcrypt(password)) {
      return res.status(400).json({
        error: "Ingresá la contraseña en texto plano, no el código hash de la base de datos.",
      });
    }

    const col = await usuariosTenantColumnName();
    const hasMustCol = await tableHasColumn("usuarios", "must_change_password");
    const hintTid = Number(req.body?.tenant_id);
    const mustSel = hasMustCol ? ", COALESCE(must_change_password, false) AS must_change_password" : "";
    /** `col` solo puede ser tenant_id o cliente_id (validado en tenantScope). */
    const tidExpr = col ? `, ${col}::int AS _login_tid` : "";

    const unscopedSql = `SELECT id, email, nombre, rol, password_hash, activo${mustSel}${tidExpr} FROM usuarios
         WHERE activo = TRUE AND LOWER(TRIM(email)) = LOWER(TRIM($1))
         ORDER BY id ASC`;

    /** @param {import("pg").QueryResultRow[]} rows */
    async function rowsMatchingPassword(rows) {
      const out = [];
      for (const row of rows) {
        const hash = String(row.password_hash || "");
        let ok = false;
        if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
          ok = await bcrypt.compare(password, hash);
        } else {
          ok = password === hash;
        }
        if (ok) out.push(row);
      }
      return out;
    }

    let candidateRows = [];
    if (col && Number.isFinite(hintTid) && hintTid >= 1) {
      const rScoped = await query(
        `SELECT id, email, nombre, rol, password_hash, activo${mustSel}${tidExpr} FROM usuarios
         WHERE activo = TRUE AND LOWER(TRIM(email)) = LOWER(TRIM($1)) AND ${col} = $2
         ORDER BY id ASC`,
        [loginId, hintTid]
      );
      candidateRows = rScoped.rows;
      /** Hint obsoleto (wizard/sessionStorage): si no hay filas en ese tenant, buscar sin acotar. */
      if (!candidateRows.length) {
        const rAll = await query(unscopedSql, [loginId]);
        candidateRows = rAll.rows;
      }
    } else if (col) {
      const rAll = await query(unscopedSql, [loginId]);
      candidateRows = rAll.rows;
    } else {
      const r0 = await query(
        `SELECT id, email, nombre, rol, password_hash, activo${mustSel} FROM usuarios
         WHERE activo = TRUE AND LOWER(TRIM(email)) = LOWER(TRIM($1))
         ORDER BY id ASC`,
        [loginId]
      );
      candidateRows = r0.rows;
    }

    let matches = await rowsMatchingPassword(candidateRows);

    /**
     * Con multitenant (`tenant_id` en body): solo se valida en ese tenant.
     * Mismo usuario/contraseña en otro tenant no debe autenticar si el técnico eligió otro contexto (wizard / selector).
     */
    if (!matches.length) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    if (col && matches.length > 1) {
      const tids = [
        ...new Set(
          matches
            .map((row) => Number(row._login_tid))
            .filter((n) => Number.isFinite(n) && n > 0)
        ),
      ];
      return res.status(400).json({
        error:
          "Hay más de un usuario con ese nombre de usuario en distintos tenants. Elegí el tenant en el asistente (o enviá tenant_id en el login: clientes.id del tenant).",
        code: "login_tenant_ambiguous",
        tenant_ids: tids,
      });
    }

    const u = matches[0] || null;
    if (!u) return res.status(401).json({ error: "Credenciales inválidas" });
    if (!u.activo) return res.status(403).json({ error: "Usuario inactivo" });

    const tenant_id = await getUserTenantId(u.id);
    const token = signToken({ userId: u.id, rol: u.rol, tenant_id });
    let isDefault = false;
    if (loginId.toLowerCase() === "admin" && password === "admin" && tenant_id) {
      try {
        const cfgR = await query("SELECT configuracion FROM clientes WHERE id = $1 LIMIT 1", [tenant_id]);
        const cfgRaw = cfgR.rows?.[0]?.configuracion;
        const cfg = typeof cfgRaw === "string" ? JSON.parse(cfgRaw) : cfgRaw;
        isDefault = !(cfg && cfg.default_creds_changed);
      } catch (_) {
        isDefault = true;
      }
    }
    const mustChange = !!(hasMustCol && u.must_change_password);
    if (mustChange) {
      return res.status(403).json({
        error: "Debe cambiar la contraseña antes de continuar",
        code: "must_change_password",
        user_id: u.id,
        email: u.email,
        nombre: u.nombre,
        rol: u.rol,
        tenant_id,
      });
    }
    if (admin2faHabilitado() && adminRolPara2fa(u.rol)) {
      try {
        const otp = await crearDesafioOtpAdmin(u);
        if (otp) {
          return res.json({
            requires_otp: true,
            challenge_id: otp.challenge_id,
            email_masked: otp.email_masked,
            user: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, tenant_id },
          });
        }
      } catch (e) {
        console.error("[auth/login] admin 2FA", e?.message || e);
        return res.status(503).json({
          error: "No se pudo enviar el código de verificación. Revisá EmailJS en el servidor.",
        });
      }
    }
    return res.json({
      token,
      user: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, tenant_id },
      is_default_credentials: isDefault || undefined,
    });
  } catch (error) {
    return res.status(500).json({ error: "Error en login", detail: error.message });
  }
});

/**
 * POST /api/auth/verify-login-otp
 * Body: { challenge_id, code }
 */
router.post("/verify-login-otp", async (req, res) => {
  try {
    if (!admin2faHabilitado()) {
      return res.status(400).json({ error: "Verificación OTP no habilitada" });
    }
    const challengeId = String(req.body?.challenge_id || "").trim();
    const code = String(req.body?.code || "").trim().replace(/\D/g, "");
    if (!challengeId || code.length < 4) {
      return res.status(400).json({ error: "Código o desafío inválido" });
    }
    const verified = await verificarDesafioOtpAdmin(challengeId, code);
    if (!verified?.user_id) {
      return res.status(401).json({ error: "Código incorrecto o vencido" });
    }
    const r = await query(
      `SELECT id, email, nombre, rol, activo FROM usuarios WHERE id = $1 LIMIT 1`,
      [verified.user_id]
    );
    const u = r.rows?.[0];
    if (!u?.activo || !adminRolPara2fa(u.rol)) {
      return res.status(401).json({ error: "Usuario inválido" });
    }
    const tenant_id = await getUserTenantId(u.id);
    const token = signToken({ userId: u.id, rol: u.rol, tenant_id });
    return res.json({
      token,
      user: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, tenant_id },
    });
  } catch (error) {
    return res.status(500).json({ error: "Error al verificar código", detail: error.message });
  }
});

/**
 * Primer login con usuario bootstrap (must_change_password): sin JWT previo.
 * Body: { user_id, password_actual, nueva_password, confirmar_password, nuevo_usuario?, nombre? }
 * Tras el cambio el cliente debe volver a iniciar sesión (no se emite JWT).
 */
router.post("/cambiar-primera-contrasena", async (req, res) => {
  try {
    const userId = Number(req.body?.user_id);
    const passwordActual = String(req.body?.password_actual || req.body?.password || "").trim();
    const nueva = String(req.body?.nueva_password || "").trim();
    const confirmar = String(req.body?.confirmar_password || req.body?.nueva_password || "").trim();
    const nuevoLoginRaw = normalizeLoginId(
      req.body?.nuevo_usuario ?? req.body?.usuario ?? req.body?.usuario_nuevo ?? ""
    );
    const nombreNuevo = req.body?.nombre != null ? String(req.body.nombre).trim() : null;
    if (!Number.isFinite(userId) || userId < 1) {
      return res.status(400).json({ error: "user_id requerido" });
    }
    if (!passwordActual || !nueva) {
      return res.status(400).json({ error: "Contraseña actual y nueva requeridas" });
    }
    if (nueva !== confirmar) {
      return res.status(400).json({ error: "La confirmación no coincide" });
    }
    if (nueva.length < 4) {
      return res.status(400).json({ error: "La contraseña nueva debe tener al menos 4 caracteres" });
    }
    if (parecePasswordHashBcrypt(nueva)) {
      return res.status(400).json({
        error: "Ingresá la contraseña en texto plano, no el código hash de la base de datos.",
      });
    }
    if (nuevoLoginRaw && (nuevoLoginRaw.length < 2 || nuevoLoginRaw.length > 120 || /\s/.test(nuevoLoginRaw))) {
      return res.status(400).json({ error: "Nombre de usuario no válido" });
    }
    if (nombreNuevo != null && nombreNuevo !== "" && nombreNuevo.length < 2) {
      return res.status(400).json({ error: "El nombre del administrador debe tener al menos 2 caracteres" });
    }
    const hasMustCol = await tableHasColumn("usuarios", "must_change_password");
    if (!hasMustCol) {
      return res.status(503).json({ error: "Esquema sin must_change_password" });
    }
    const hasDefCol = await tableHasColumn("usuarios", "es_usuario_default");
    const r0 = await query(
      `SELECT id, email, nombre, rol, password_hash, activo, must_change_password FROM usuarios WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (!r0.rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    const row = r0.rows[0];
    if (!row.activo) return res.status(403).json({ error: "Usuario inactivo" });
    if (!row.must_change_password) {
      return res.status(403).json({ error: "Este usuario no requiere cambio de contraseña inicial" });
    }
    const hash = String(row.password_hash || "");
    let okPw = false;
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
      okPw = await bcrypt.compare(passwordActual, hash);
    } else {
      okPw = passwordActual === hash;
    }
    if (!okPw) return res.status(401).json({ error: "Contraseña actual incorrecta" });

    const nextEmail = nuevoLoginRaw || String(row.email || "").trim();
    const nextNombre =
      nombreNuevo != null && nombreNuevo !== "" ? nombreNuevo : String(row.nombre || "").trim();
    if (!nextEmail) {
      return res.status(400).json({ error: "Indicá un nombre de usuario (login) para el administrador" });
    }
    if (!nextNombre || nextNombre.length < 2) {
      return res.status(400).json({ error: "Indicá el nombre visible del administrador" });
    }

    if (nuevoLoginRaw && nuevoLoginRaw.toLowerCase() !== String(row.email || "").trim().toLowerCase()) {
      const dup = await query(
        "SELECT id FROM usuarios WHERE lower(trim(email)) = $1 AND id <> $2 LIMIT 1",
        [nuevoLoginRaw, userId]
      );
      if (dup.rows.length) {
        return res.status(409).json({ error: "Ya existe un usuario con ese nombre de usuario" });
      }
    }

    const nextHash = await bcrypt.hash(nueva, 10);
    const defSet = hasDefCol ? ", es_usuario_default = FALSE" : "";
    const up = await query(
      `UPDATE usuarios SET email = $2, nombre = $3, password_hash = $4, must_change_password = FALSE${defSet}, reset_token = NULL, reset_expiry = NULL WHERE id = $1 RETURNING id, email, nombre, rol`,
      [userId, nextEmail, nextNombre, nextHash]
    );
    const u = up.rows[0];
    const tenant_id = await getUserTenantId(u.id);
    try {
      const rol = String(u.rol || "").toLowerCase();
      if (tenant_id && (rol === "admin" || rol === "administrador")) {
        await query(
          `UPDATE clientes SET configuracion = COALESCE(configuracion, '{}'::jsonb) || '{"default_creds_changed":true}'::jsonb WHERE id = $1`,
          [tenant_id]
        );
      }
    } catch (_) {}
    return res.json({
      ok: true,
      requiere_relogin: true,
      user: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, tenant_id },
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo cambiar la contraseña", detail: error.message });
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
 * Usuario autenticado: cambiar usuario de login (columna `email` en BD), nombre y/o contraseña (requiere contraseña actual).
 * Cuerpo: `usuario` (preferido) o `email` (alias) para el identificador de login.
 */
router.patch("/me", authMiddleware, async (req, res) => {
  try {
    const loginNuevo =
      req.body?.usuario != null
        ? String(req.body.usuario).trim().toLowerCase()
        : req.body?.email != null
          ? String(req.body.email).trim().toLowerCase()
          : null;
    const nombreNuevo = req.body?.nombre != null ? String(req.body.nombre).trim() : null;
    const passwordActual = String(req.body?.password_actual || "").trim();
    const passwordNueva = req.body?.password_nueva != null ? String(req.body.password_nueva).trim() : "";

    if (!passwordActual) return res.status(400).json({ error: "Contraseña actual requerida" });
    if (!loginNuevo && !nombreNuevo && !passwordNueva) {
      return res.status(400).json({ error: "Indicá usuario, nombre o contraseña nueva" });
    }
    if (loginNuevo) {
      const looksEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginNuevo);
      if (!looksEmail && (loginNuevo.length < 2 || loginNuevo.length > 120 || /\s/.test(loginNuevo))) {
        return res.status(400).json({ error: "Nombre de usuario no válido" });
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

    if (loginNuevo) {
      const col = await usuariosTenantColumnName();
      const tid = await getUserTenantId(req.user.id);
      const dup =
        col && tid != null && Number.isFinite(Number(tid))
          ? await query(
              `SELECT id FROM usuarios WHERE lower(trim(email)) = $1 AND id <> $2 AND ${col} = $3 LIMIT 1`,
              [loginNuevo, req.user.id, tid]
            )
          : await query("SELECT id FROM usuarios WHERE lower(trim(email)) = $1 AND id <> $2 LIMIT 1", [
              loginNuevo,
              req.user.id,
            ]);
      if (dup.rows.length) return res.status(409).json({ error: "Ya existe un usuario con ese nombre de usuario" });
    }

    const nextEmail = loginNuevo || row.email;
    const nextNombre = nombreNuevo != null && nombreNuevo !== "" ? nombreNuevo : row.nombre;
    let nextHash = hash;
    if (passwordNueva) nextHash = await bcrypt.hash(passwordNueva, 10);

    const up = passwordNueva
      ? await query(
          `UPDATE usuarios SET email = $2, nombre = $3, password_hash = $4, must_change_password = FALSE, reset_token = NULL, reset_expiry = NULL WHERE id = $1 RETURNING id, email, nombre, rol`,
          [req.user.id, nextEmail, nextNombre, nextHash]
        )
      : await query(
          `UPDATE usuarios SET email = $2, nombre = $3, password_hash = $4 WHERE id = $1 RETURNING id, email, nombre, rol`,
          [req.user.id, nextEmail, nextNombre, nextHash]
        );

    if (passwordNueva) {
      try {
        const tid = await getUserTenantId(req.user.id);
        const rol = String(row.rol || "").toLowerCase();
        if (tid && (rol === "admin" || rol === "administrador")) {
          await query(
            `UPDATE clientes SET configuracion = COALESCE(configuracion, '{}'::jsonb) || '{"default_creds_changed":true}'::jsonb WHERE id = $1`,
            [tid]
          );
        }
      } catch (_) {}
    }

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
      const col = await usuariosTenantColumnName();
      const tid = await getUserTenantId(req.user.id);
      const dup =
        col && tid != null && Number.isFinite(Number(tid))
          ? await query(
              `SELECT id FROM usuarios WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND id <> $2 AND ${col} = $3 LIMIT 1`,
              [nuevoUsuario, req.user.id, tid]
            )
          : await query(
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

