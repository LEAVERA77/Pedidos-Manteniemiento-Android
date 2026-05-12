import bcrypt from "bcryptjs";

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

/** Default: "admin". Si colisiona (multi-tenant BD compartida), admin_<slug>, admin_<slug>2… */
async function pickUniqueAdminLogin(client, slugBase, tenantCol, tenantId) {
  const candidates = ["admin"];
  const base = slugFromTenantNombre(slugBase);
  for (let i = 0; i < 200; i++) {
    candidates.push(i === 0 ? `admin_${base}` : `admin_${base}${i + 1}`);
  }
  for (const c of candidates) {
    const where = tenantCol
      ? `LOWER(TRIM(email)) = LOWER(TRIM($1)) AND ${tenantCol} = $2`
      : `LOWER(TRIM(email)) = LOWER(TRIM($1))`;
    const params = tenantCol ? [c, tenantId] : [c];
    const r = await client.query(`SELECT 1 FROM usuarios WHERE ${where} LIMIT 1`, params);
    if (!r.rows.length) return c;
  }
  throw new Error("No se pudo generar un usuario administrador único");
}

/**
 * Inserta usuario admin para un tenant recién creado (misma transacción que clientes).
 * @param {import("pg").PoolClient} client
 */
export async function crearUsuarioAdminBootstrap({ client, col, hasBt, hasTw, tenantId, nombreTenant, telefono }) {
  const nombreTrim = String(nombreTenant || "").trim();
  const nombreCompleto = `Administrador del ${nombreTrim}`;
  const login = await pickUniqueAdminLogin(client, nombreTrim, col, Number(tenantId));
  const passwordPlain = login === "admin" ? "admin" : temporaryPasswordFromSlug(slugFromTenantNombre(nombreTrim));
  const hash = await bcrypt.hash(String(passwordPlain), 10);
  const rol = "admin";
  const tid = Number(tenantId);
  const tel = telefono != null && String(telefono).trim() !== "" ? String(telefono).trim() : null;

  if (!col) {
    if (hasBt) {
      await client.query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, business_type)
         VALUES ($1,$2,$3,$4,TRUE,NULL)`,
        [login, nombreCompleto, rol, hash]
      );
    } else {
      await client.query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo)
         VALUES ($1,$2,$3,$4,TRUE)`,
        [login, nombreCompleto, rol, hash]
      );
    }
    return { usuario: login, password: passwordPlain, nombre: nombreCompleto };
  }

  if (hasBt) {
    if (hasTw && tel) {
      await client.query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, business_type, telefono, telefono_whatsapp, whatsapp_notificaciones)
         VALUES ($1,$2,$3,$4,TRUE,$5,NULL,$6,$6,TRUE)`,
        [login, nombreCompleto, rol, hash, tid, tel]
      );
    } else {
      await client.query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, business_type)
         VALUES ($1,$2,$3,$4,TRUE,$5,NULL)`,
        [login, nombreCompleto, rol, hash, tid]
      );
    }
  } else if (hasTw && tel) {
    await client.query(
      `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, telefono, telefono_whatsapp, whatsapp_notificaciones)
       VALUES ($1,$2,$3,$4,TRUE,$5,$6,$6,TRUE)`,
      [login, nombreCompleto, rol, hash, tid, tel]
    );
  } else {
    await client.query(
      `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col})
       VALUES ($1,$2,$3,$4,TRUE,$5)`,
      [login, nombreCompleto, rol, hash, tid]
    );
  }

  return { usuario: login, password: passwordPlain, nombre: nombreCompleto };
}
