/**
 * OTP opcional por email para login de administradores (oleada 3).
 * Activar con ADMIN_2FA_ENABLED=1 y EmailJS configurado en el servidor.
 * made by leavera77
 */

import crypto from "node:crypto";
import { query } from "../db/neon.js";
import {
  emailjsServidorConfigurado,
  enviarCorreoEmailjsServidor,
} from "./emailjsEnvioServidor.js";

let _tableReady = false;

export function admin2faHabilitado() {
  const v = String(process.env.ADMIN_2FA_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function adminRolPara2fa(rol) {
  const r = String(rol || "").toLowerCase();
  return r === "admin" || r === "administrador";
}

async function ensureOtpTable() {
  if (_tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS admin_login_otp (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_admin_login_otp_user_exp
    ON admin_login_otp (user_id, expires_at DESC)
  `);
  _tableReady = true;
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function generarCodigo() {
  return String(crypto.randomInt(100000, 999999));
}

function enmascararEmail(email) {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at < 2) return "***";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

/**
 * @returns {Promise<{ challenge_id: string, email_masked: string }|null>}
 */
export async function crearDesafioOtpAdmin(user) {
  if (!admin2faHabilitado() || !adminRolPara2fa(user?.rol)) return null;
  if (!emailjsServidorConfigurado()) {
    console.warn("[admin2fa] ADMIN_2FA_ENABLED pero EmailJS no configurado en servidor");
    return null;
  }
  const email = String(user?.email || "").trim();
  if (!email || !email.includes("@")) return null;

  await ensureOtpTable();
  const code = generarCodigo();
  const ttlMin = Math.min(Math.max(Number(process.env.ADMIN_2FA_TTL_MIN) || 10, 5), 30);
  const expires = new Date(Date.now() + ttlMin * 60 * 1000);

  await query(`DELETE FROM admin_login_otp WHERE user_id = $1`, [user.id]);

  const challengeId = crypto.randomUUID();
  const ins = await query(
    `INSERT INTO admin_login_otp (id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [challengeId, user.id, hashCode(code), expires.toISOString()]
  );
  if (!ins.rows?.[0]?.id) return null;
  if (!challengeId) return null;

  await enviarCorreoEmailjsServidor({
    to_email: email,
    user_email: email,
    subject: "Código de acceso GestorNova",
    message: `Tu código de verificación es: ${code}\n\nVence en ${ttlMin} minutos. Si no solicitaste este acceso, ignorá el mensaje.`,
    codigo_otp: code,
  }).catch((e) => {
    console.error("[admin2fa] envío email", e?.message || e);
    throw e;
  });

  return { challenge_id: challengeId, email_masked: enmascararEmail(email) };
}

/**
 * @returns {Promise<{ user_id: number }|null>}
 */
export async function verificarDesafioOtpAdmin(challengeId, code) {
  if (!challengeId || !code) return null;
  await ensureOtpTable();
  const r = await query(
    `SELECT id, user_id, code_hash, expires_at FROM admin_login_otp WHERE id = $1 LIMIT 1`,
    [challengeId]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await query(`DELETE FROM admin_login_otp WHERE id = $1`, [challengeId]);
    return null;
  }
  if (hashCode(code) !== row.code_hash) return null;
  await query(`DELETE FROM admin_login_otp WHERE id = $1`, [challengeId]);
  return { user_id: Number(row.user_id) };
}
