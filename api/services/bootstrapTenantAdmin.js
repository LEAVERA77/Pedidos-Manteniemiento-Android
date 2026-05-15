/**
 * Tras crear un tenant nuevo (wizard → nueva instancia): admin provisional con cambio de clave obligatorio.
 * made by leavera77
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { query } from "../db/neon.js";
import { tableHasColumn, usuariosTenantColumnName } from "../utils/tenantScope.js";

function randomPasswordPlain() {
  const b = crypto.randomBytes(9);
  const s = b.toString("base64url").replace(/[^a-zA-Z0-9]/g, "");
  const core = (s.length >= 10 ? s.slice(0, 10) : s + "Aa9").slice(0, 12);
  return `${core.charAt(0).toUpperCase()}${core.slice(1)}`;
}

/**
 * @param {number} tenantId — clientes.id
 * @returns {Promise<{ usuario: string, password: string, user_id: number } | null>}
 */
export async function createBootstrapAdminForNewTenant(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const uCol = await usuariosTenantColumnName();
  if (!uCol) return null;
  const rC = await query(`SELECT id FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
  if (!rC.rows.length) return null;

  const login = `admin_t${tid}`;
  const dup = await query(
    `SELECT id FROM usuarios WHERE ${uCol} = $1 AND lower(trim(coalesce(email,''))) = lower(trim($2::text)) LIMIT 1`,
    [tid, login]
  );
  if (dup.rows.length) return null;

  const passwordPlain = randomPasswordPlain();
  const hash = await bcrypt.hash(passwordPlain, 10);
  const hasBt = await tableHasColumn("usuarios", "business_type");
  const hasMust = await tableHasColumn("usuarios", "must_change_password");

  const mustFrag = hasMust ? ", must_change_password" : "";
  const mustVal = hasMust ? ", TRUE" : "";
  let ins;
  if (hasBt) {
    ins = await query(
      `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${uCol}, business_type${mustFrag})
       VALUES ($1, $2, 'admin', $3, TRUE, $4, NULL${mustVal})
       RETURNING id`,
      [login, "Administrador (provisional)", hash, tid]
    );
  } else {
    ins = await query(
      `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${uCol}${mustFrag})
       VALUES ($1, $2, 'admin', $3, TRUE, $4${mustVal})
       RETURNING id`,
      [login, "Administrador (provisional)", hash, tid]
    );
  }
  const uid = ins.rows?.[0]?.id;
  if (uid == null) return null;
  return { usuario: login, password: passwordPlain, user_id: Number(uid) };
}
