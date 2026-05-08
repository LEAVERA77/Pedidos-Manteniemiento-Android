import bcrypt from "bcryptjs";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";

/** Email único por tenant; login con esta dirección y contraseña `admin` hasta que el cliente la cambie. */
export function defaultAdminEmailForTenant(tenantId) {
  return `admin+tenant${Number(tenantId)}@gestornova.default`;
}

/**
 * Admin del tenant para attach técnico: primero rol admin; si no hay, crea cuenta de respaldo (clave `admin`).
 * No tocar app.js: la UI puede seguir usando el login habitual tras cambiar email/clave desde el programa.
 */
export async function getOrCreateAdminUidForTechnicianAttach(uCol, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const rAdm = await query(
    `SELECT id, rol FROM usuarios
     WHERE ${uCol} = $1
       AND lower(trim(coalesce(rol,''))) IN ('admin','administrador')
       AND COALESCE(activo, TRUE)
     ORDER BY id ASC
     LIMIT 1`,
    [tid]
  );
  if (rAdm.rows.length) {
    return { uid: Number(rAdm.rows[0].id), rol: String(rAdm.rows[0].rol || "admin"), created: false };
  }
  const email = defaultAdminEmailForTenant(tid);
  const dup = await query(
    `SELECT id, rol FROM usuarios WHERE ${uCol} = $1 AND lower(trim(email)) = lower($2) LIMIT 1`,
    [tid, email]
  );
  if (dup.rows.length) {
    await query(`UPDATE usuarios SET rol = 'admin', activo = TRUE WHERE id = $1`, [dup.rows[0].id]);
    return { uid: Number(dup.rows[0].id), rol: "admin", created: false };
  }
  const hash = await bcrypt.hash("admin", 10);
  const hasBt = await tableHasColumn("usuarios", "business_type");
  const ins = hasBt
    ? await query(
        `INSERT INTO usuarios (${uCol}, business_type, nombre, email, password_hash, rol, activo)
         VALUES ($1, NULL, 'Administrador', $2, $3, 'admin', TRUE)
         RETURNING id, rol`,
        [tid, email, hash]
      )
    : await query(
        `INSERT INTO usuarios (${uCol}, nombre, email, password_hash, rol, activo)
         VALUES ($1, 'Administrador', $2, $3, 'admin', TRUE)
         RETURNING id, rol`,
        [tid, email, hash]
      );
  if (!ins.rows.length) return null;
  return { uid: Number(ins.rows[0].id), rol: String(ins.rows[0].rol || "admin"), created: true };
}
