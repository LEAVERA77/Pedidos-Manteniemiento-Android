/**
 * Primitivas para una futura integración MFA administrativa.
 * Aún NO son un sistema de autenticación: no registran usuarios, no almacenan
 * desafíos, no aplican límites ni consumen códigos atómicamente y no emiten JWT.
 * No se deben usar en producción sin las barreras descritas en la documentación.
 */
import crypto from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

const PERIOD = 30;
const DIGITS = 6;

function idSeguro(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error("Identidad MFA inválida");
  return n;
}

function claveBytes(key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key)) {
    throw new Error("Clave de cifrado MFA inválida");
  }
  const bytes = Buffer.from(key, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== key) throw new Error("Clave de cifrado MFA inválida");
  return bytes;
}

function aad(tenantId, userId) {
  return Buffer.from(`gestornova:admin-totp:v1:${idSeguro(tenantId)}:${idSeguro(userId)}`, "utf8");
}

/** Cifrado autenticado; la clave de 32 bytes debe vivir fuera de la BD. */
export function cifrarSecretoTotp(secret, { key, tenantId, userId }) {
  if (typeof secret !== "string" || !/^[A-Z2-7]{32,128}$/.test(secret)) throw new Error("Secreto TOTP inválido");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", claveBytes(key), iv);
  cipher.setAAD(aad(tenantId, userId));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { v: 1, iv: iv.toString("base64url"), ciphertext: data.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}

export function descifrarSecretoTotp(envelope, { key, tenantId, userId }) {
  try {
    if (!envelope || envelope.v !== 1 || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv || "") ||
        !/^[A-Za-z0-9_-]{22}$/.test(envelope.tag || "") ||
        !/^[A-Za-z0-9_-]{1,256}$/.test(envelope.ciphertext || "")) throw new Error();
    const iv = Buffer.from(envelope.iv, "base64url");
    const tag = Buffer.from(envelope.tag, "base64url");
    const data = Buffer.from(envelope.ciphertext, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || iv.toString("base64url") !== envelope.iv ||
        tag.toString("base64url") !== envelope.tag || data.toString("base64url") !== envelope.ciphertext) throw new Error();
    const decipher = crypto.createDecipheriv("aes-256-gcm", claveBytes(key), iv);
    decipher.setAAD(aad(tenantId, userId));
    decipher.setAuthTag(tag);
    const secret = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    if (!/^[A-Z2-7]{32,128}$/.test(secret)) throw new Error();
    return secret;
  } catch (_) {
    throw new Error("No se pudo descifrar el secreto MFA");
  }
}

/** URI otpauth compatible con Microsoft Authenticator, que debe entregarse solo al enrolar. */
export function crearTotpParaInscripcion({ account, issuer = "GestorNova" }) {
  const label = String(account || "").trim();
  if (!label || label.length > 120) throw new Error("Cuenta MFA inválida");
  const secret = generateSecret();
  const uri = generateURI({ issuer, label, secret, algorithm: "sha1", digits: DIGITS, period: PERIOD });
  return { secret, uri };
}

/**
 * Retorna el paso del TOTP válido o null. El llamador DEBE comprobar y persistir
 * el paso con compare-and-set/transaction, de forma atómica con consumir el desafío.
 * Esta función, por sí sola, no evita verificaciones concurrentes repetidas.
 */
export async function verificarTotp({ secret, code, lastTimeStep, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code) || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return null;
  if (lastTimeStep != null && (!Number.isSafeInteger(lastTimeStep) || lastTimeStep < 0)) return null;
  try {
    const result = await verify({ secret, token: code, algorithm: "sha1", digits: DIGITS, period: PERIOD,
      epoch: nowSeconds, epochTolerance: [30, 0], ...(lastTimeStep != null ? { afterTimeStep: lastTimeStep } : {}) });
    return result.valid ? result.timeStep : null;
  } catch (_) { return null; }
}

/** Restringir al origen exacto HTTPS. Compartir un dominio entre aplicaciones sigue compartiendo RP. */
export function validarWebAuthnConfig({ origin, rpID }) {
  let u;
  try { u = new URL(origin); } catch (_) { throw new Error("Origen WebAuthn inválido"); }
  if (u.protocol !== "https:" || u.username || u.password || u.pathname !== "/" || u.search || u.hash ||
      u.origin !== origin || typeof rpID !== "string" || rpID !== u.hostname || rpID !== rpID.toLowerCase()) {
    throw new Error("Origen o RP ID WebAuthn inválido");
  }
  return { origin: u.origin, rpID };
}

/** Las opciones llevan un desafío aleatorio; debe guardarse y consumirse atómicamente en el servidor. */
export async function opcionesRegistroHello({ origin, rpID, tenantId, userId, account, excludeCredentials = [] }) {
  validarWebAuthnConfig({ origin, rpID });
  const uid = crypto.createHash("sha256").update(`gestornova:webauthn:v1:${idSeguro(tenantId)}:${idSeguro(userId)}`).digest();
  const userName = String(account || "").trim();
  if (!userName || userName.length > 120 || !Array.isArray(excludeCredentials)) throw new Error("Datos de registro inválidos");
  return generateRegistrationOptions({
    rpName: "GestorNova", rpID, userID: uid, userName, userDisplayName: userName,
    timeout: 60000, attestationType: "none", excludeCredentials,
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
  });
}

export async function verificarRegistroHello({ origin, rpID, expectedChallenge, response }) {
  validarWebAuthnConfig({ origin, rpID });
  if (!expectedChallenge || !response) throw new Error("Desafío WebAuthn inválido");
  return verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
}

export async function opcionesAccesoHello({ origin, rpID, credentials }) {
  validarWebAuthnConfig({ origin, rpID });
  if (!Array.isArray(credentials) || credentials.length === 0) throw new Error("Sin autenticadores autorizados");
  return generateAuthenticationOptions({ rpID, allowCredentials: credentials, userVerification: "required", timeout: 60000 });
}

/** El llamador debe verificar usuario, aprobación y persistir el contador atómicamente. */
export async function verificarAccesoHello({ origin, rpID, expectedChallenge, response, credential }) {
  validarWebAuthnConfig({ origin, rpID });
  if (!expectedChallenge || !response || !credential) throw new Error("Desafío WebAuthn inválido");
  return verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, credential, requireUserVerification: true });
}
