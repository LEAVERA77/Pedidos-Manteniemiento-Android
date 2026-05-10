import bcrypt from "bcryptjs";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";

/** Email único por tenant; login con esta dirección y contraseña `admin` hasta que el cliente la cambie. */
export function defaultAdminEmailForTenant(tenantId) {
  return `admin+tenant${Number(tenantId)}@gestornova.default`;
}

/**
 * Solo la cuenta de respaldo `admin+tenant{N}@gestornova.default` para attach-tenant **sin Bearer**.
 * Nunca reutiliza otros administradores del tenant: moverlos los sacaría del tenant origen.
 * Si la cuenta de respaldo existe en otro tenant (email único global), la reubica al tenant origen.
 */
export async function getOrCreateAdminUidForTechnicianAttach(uCol, sourceTenantId) {
  const tid = Number(sourceTenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const email = defaultAdminEmailForTenant(tid);

  const rLocal = await query(
    `SELECT id, rol FROM usuarios
     WHERE ${uCol} = $1 AND lower(trim(coalesce(email,''))) = lower(trim($2::text))
     LIMIT 1`,
    [tid, email]
  );
  if (rLocal.rows.length) {
    await query(`UPDATE usuarios SET rol = 'admin', activo = TRUE WHERE id = $1`, [rLocal.rows[0].id]);
    return { uid: Number(rLocal.rows[0].id), rol: "admin", created: false };
  }

  const rGlobal = await query(
    `SELECT id, rol, ${uCol}::int AS cur_tid FROM usuarios
     WHERE lower(trim(coalesce(email,''))) = lower(trim($1::text))
     LIMIT 1`,
    [email]
  );
  if (rGlobal.rows.length) {
    const uid = Number(rGlobal.rows[0].id);
    const curTid = Number(rGlobal.rows[0].cur_tid);
    if (Number.isFinite(curTid) && curTid !== tid) {
      await query(`UPDATE usuarios SET ${uCol} = $1 WHERE id = $2`, [tid, uid]);
    }
    await query(`UPDATE usuarios SET rol = 'admin', activo = TRUE WHERE id = $1`, [uid]);
    return { uid, rol: "admin", created: false };
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
