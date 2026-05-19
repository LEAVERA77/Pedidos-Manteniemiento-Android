/**
 * Envío FCM HTTP v1 (opcional: FIREBASE_SERVICE_ACCOUNT_JSON en env).
 * made by leavera77
 */

import { query } from "../db/neon.js";

let _cachedToken = null;
let _tokenExp = 0;

async function tableFcmOk() {
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usuario_fcm_token' LIMIT 1`
    );
    return t.rows.length > 0;
  } catch {
    return false;
  }
}

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function getAccessToken(sa) {
  const now = Date.now();
  if (_cachedToken && _tokenExp > now + 60000) return _cachedToken;
  const { createSign } = await import("crypto");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const iat = Math.floor(now / 1000);
  const claim = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const signInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256").update(signInput).end().sign(sa.private_key, "base64url");
  const jwt = `${signInput}.${sign}`;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await resp.json();
  if (!j.access_token) throw new Error(j.error || "No FCM access token");
  _cachedToken = j.access_token;
  _tokenExp = now + (j.expires_in || 3500) * 1000;
  return _cachedToken;
}

/**
 * @param {number} usuarioId
 * @param {{ titulo: string, cuerpo: string, pedidoId?: number }} payload
 */
export async function sendFcmToUsuario(usuarioId, payload) {
  const sa = parseServiceAccount();
  if (!sa?.project_id || !(await tableFcmOk())) return { sent: 0, skipped: true };
  const r = await query(
    `SELECT fcm_token FROM usuario_fcm_token WHERE usuario_id = $1 ORDER BY updated_at DESC LIMIT 5`,
    [usuarioId]
  );
  const tokens = (r.rows || []).map((x) => x.fcm_token).filter(Boolean);
  if (!tokens.length) return { sent: 0 };
  let access;
  try {
    access = await getAccessToken(sa);
  } catch (e) {
    console.warn("[fcm] auth", e.message);
    return { sent: 0, error: e.message };
  }
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  let sent = 0;
  for (const token of tokens) {
    try {
      const body = {
        message: {
          token,
          notification: {
            title: String(payload.titulo || "GestorNova").slice(0, 120),
            body: String(payload.cuerpo || "").slice(0, 240),
          },
          data: payload.pedidoId != null ? { pedido_id: String(payload.pedidoId) } : {},
        },
      };
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (resp.ok) sent += 1;
      else {
        const t = await resp.text();
        console.warn("[fcm] send", resp.status, t.slice(0, 200));
      }
    } catch (e) {
      console.warn("[fcm] send err", e.message);
    }
  }
  return { sent };
}

export async function upsertFcmToken({ usuarioId, tenantId, fcmToken, plataforma }) {
  if (!(await tableFcmOk())) return false;
  const tok = String(fcmToken || "").trim();
  if (tok.length < 20) return false;
  await query(
    `INSERT INTO usuario_fcm_token (usuario_id, tenant_id, fcm_token, plataforma, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (usuario_id, fcm_token) DO UPDATE SET updated_at = NOW(), plataforma = EXCLUDED.plataforma`,
    [usuarioId, tenantId ?? null, tok, plataforma || "android"]
  );
  return true;
}
