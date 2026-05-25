import bcrypt from "bcryptjs";
import { normalizeLoginId } from "../utils/usuarioLoginGlobal.js";

/**
 * Slug para login admin_<slug> (fallback si "admin" ya existe).
 * Minúsculas, sin acentos; espacios y símbolos → _; quita artículos iniciales comunes.
 */
export function slugFromTenantNombre(nombre) {
  const raw = String(nombre || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  let s = raw.replace(/^(el|la|los|las|un|una)_/, "").replace(/^_+|_+$/g, "");
  if (!s) s = raw || "tenant";
  return s.slice(0, 40) || "tenant";
}

/** Contraseña temporal: slug sin guiones bajos + año (fácil de dictar; sin caracteres raros). */
export function temporaryPasswordFromSlug(slug) {
  const y = new Date().getFullYear();
  const base = String(slug || "tenant")
    .replace(/_/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 32);
  return `${base || "tenant"}${y}`;
}

/** Default: "admin". Si colisiona en toda la BD, admin_<slug>, admin_<slug>2… */
async function pickUniqueAdminLogin(client, slugBase) {
  const candidates = ["admin"];
  const base = slugFromTenantNombre(slugBase);
  for (let i = 0; i < 200; i++) {
    candidates.push(i === 0 ? `admin_${base}` : `admin_${base}${i + 1}`);
  }
  for (const c of candidates) {
    const r = await client.query(
      `SELECT 1 FROM usuarios WHERE lower(btrim(email)) = lower(btrim($1::text)) LIMIT 1`,
      [c]
    );
    if (!r.rows.length) return c;
  }
  throw new Error("No se pudo generar un usuario administrador único");
}

/**
 * Inserta usuario admin para un tenant recién creado (misma transacción que clientes).
 * @param {import("pg").PoolClient} client
 */
export async function crearUsuarioAdminBootstrap({
  client,
  col,
  hasBt,
  hasTw,
  tenantId,
  nombreTenant,
  telefono,
  hasMustChangePassword = false,
  loginPreferido = null,
  hasEsUsuarioDefault = false,
}) {
  const nombreTrim = String(nombreTenant || "").trim();
  const nombreCompleto = `Administrador del ${nombreTrim}`;
  const pref = normalizeLoginId(loginPreferido);
  let login;
  if (pref) {
    const r = await client.query(
      `SELECT 1 FROM usuarios WHERE lower(btrim(email)) = lower(btrim($1::text)) LIMIT 1`,
      [pref]
    );
    if (r.rows.length) {
      const err = new Error("LOGIN_YA_EXISTE");
      err.code = "LOGIN_YA_EXISTE";
      throw err;
    }
    login = pref;
  } else {
    login = await pickUniqueAdminLogin(client, nombreTrim);
  }
  const passwordPlain =
    login === "admin" ? "admin" : temporaryPasswordFromSlug(slugFromTenantNombre(nombreTrim));
  const hash = await bcrypt.hash(String(passwordPlain), 10);
  const rol = "admin";
  const tid = Number(tenantId);
  const tel = telefono != null && String(telefono).trim() !== "" ? String(telefono).trim() : null;
  const mustFrag = hasMustChangePassword ? ", must_change_password" : "";
  const mustVal = hasMustChangePassword ? ", TRUE" : "";
  const defFrag = hasEsUsuarioDefault ? ", es_usuario_default" : "";
  const defVal = hasEsUsuarioDefault ? ", TRUE" : "";
  const M = { cols: `${mustFrag}${defFrag}`, vals: `${mustVal}${defVal}` };

  if (!col) {
    if (hasBt) {
      await client.query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, business_type${M.cols})
         VALUES ($1,$2,$3,$4,TRUE,NULL${M.vals})`,
        [login, nombreCompleto, rol, hash]
      );
    } else {
      await client.query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo${M.cols})
         VALUES ($1,$2,$3,$4,TRUE${M.vals})`,
        [login, nombreCompleto, rol, hash]
      );
    }
    return { usuario: login, password: passwordPlain, nombre: nombreCompleto };
  }

  if (hasBt) {
    if (hasTw && tel) {
      await client.query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, business_type, telefono, telefono_whatsapp, whatsapp_notificaciones${M.cols})
         VALUES ($1,$2,$3,$4,TRUE,$5,NULL,$6,$6,TRUE${M.vals})`,
        [login, nombreCompleto, rol, hash, tid, tel]
      );
    } else {
      await client.query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, business_type${M.cols})
         VALUES ($1,$2,$3,$4,TRUE,$5,NULL${M.vals})`,
        [login, nombreCompleto, rol, hash, tid]
      );
    }
  } else if (hasTw && tel) {
    await client.query(
      `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, telefono, telefono_whatsapp, whatsapp_notificaciones${M.cols})
       VALUES ($1,$2,$3,$4,TRUE,$5,$6,$6,TRUE${M.vals})`,
      [login, nombreCompleto, rol, hash, tid, tel]
    );
  } else {
    await client.query(
      `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}${M.cols})
       VALUES ($1,$2,$3,$4,TRUE,$5${M.vals})`,
      [login, nombreCompleto, rol, hash, tid]
    );
  }

  return { usuario: login, password: passwordPlain, nombre: nombreCompleto };
}

/**
 * Regenera clave provisoria del admin de un tenant (wizard técnico / reutilizar alta).
 * @param {import("pg").PoolClient} client
 */
export async function regenerarClaveAdminProvisionalTenant({
  client,
  userId,
  nombreTenant,
  login,
  hasMustChangePassword = true,
}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid < 1) throw new Error("usuario_admin_invalido");
  const nombreTrim = String(nombreTenant || "").trim();
  const loginNorm = normalizeLoginId(login);
  const passwordPlain = temporaryPasswordFromSlug(slugFromTenantNombre(nombreTrim));
  const hash = await bcrypt.hash(String(passwordPlain), 10);
  const mustFrag = hasMustChangePassword ? ", must_change_password = TRUE" : "";
  await client.query(
    `UPDATE usuarios SET password_hash = $1${mustFrag}, reset_token = NULL, reset_expiry = NULL WHERE id = $2`,
    [hash, uid]
  );
  return {
    usuario: loginNorm || login,
    password: passwordPlain,
    nombre: `Administrador del ${nombreTrim}`,
    clave_regenerada: true,
  };
}
