/**
 * Tras el mensaje de cierre por WA, el cliente puede responder con texto libre.
 * Estado persistido en Neon (tabla cliente_opinion_pending); sobrevive a reinicios de Render.
 *
 * La clave de teléfono debe coincidir con la que usa el webhook (normalizeWhatsAppRecipientForMeta),
 * no con el raw guardado en pedidos.telefono_contacto (549 vs 54 en AR).
 */

import { query } from "../db/neon.js";
import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";

let _tableEnsured = false;
let _obsTableEnsured = false;

function canonicalPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";
  return normalizeWhatsAppRecipientForMeta(d);
}

async function ensureOpinionPendingTable() {
  if (_tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS cliente_opinion_pending (
      tenant_id INTEGER NOT NULL,
      phone_canonical VARCHAR(40) NOT NULL,
      pedido_id INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, phone_canonical)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_cliente_opinion_pending_expires
    ON cliente_opinion_pending (expires_at)
  `);
  _tableEnsured = true;
}

async function ensureObservacionesCierreTable() {
  if (_obsTableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS cliente_observaciones_cierre (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      pedido_id INTEGER NOT NULL,
      phone_canonical VARCHAR(40),
      texto TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_cli_obs_cierre_pedido
    ON cliente_observaciones_cierre (pedido_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_cli_obs_cierre_tenant_created
    ON cliente_observaciones_cierre (tenant_id, created_at DESC)
  `);
  _obsTableEnsured = true;
}

/**
 * Registra ventana de opinión (30 días) tras enviar el mensaje de cierre por WA.
 */
export async function registerPendingClienteOpinion(tenantId, phoneDigits, pedidoId) {
  const phone = canonicalPhone(phoneDigits);
  if (!phone || phone.length < 8) return;
  const pid = Number(pedidoId);
  if (!Number.isFinite(pid) || pid < 1) return;
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return;
  try {
    await ensureOpinionPendingTable();
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    await query(
      `INSERT INTO cliente_opinion_pending (tenant_id, phone_canonical, pedido_id, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, phone_canonical)
       DO UPDATE SET pedido_id = EXCLUDED.pedido_id, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
      [tid, phone, pid, expiresAt]
    );
  } catch (e) {
    console.error("[whatsappClienteOpinion] registerPending", e.message);
  }
}

/** True si este teléfono tiene una opinión pendiente (p. ej. tras cierre por WA). */
export async function hasPendingClienteOpinion(tenantId, phoneDigits) {
  const row = await getPending(tenantId, phoneDigits);
  return row != null;
}

export async function clearPendingClienteOpinion(tenantId, phoneDigits) {
  const phone = canonicalPhone(phoneDigits);
  const tid = Number(tenantId);
  if (!phone || !Number.isFinite(tid) || tid < 1) return;
  try {
    await ensureOpinionPendingTable();
    await query(`DELETE FROM cliente_opinion_pending WHERE tenant_id = $1 AND phone_canonical = $2`, [
      tid,
      phone,
    ]);
  } catch (e) {
    console.error("[whatsappClienteOpinion] clearPending", e.message);
  }
}

/** Variantes de canon (54 vs 549) por si hubo divergencia al registrar vs webhook. */
function canonicalPhoneVariantsForLookup(phoneDigits) {
  const d = String(phoneDigits || "").replace(/\D/g, "");
  const out = new Set();
  if (d) out.add(canonicalPhone(d));
  if (d.startsWith("549") && d.length >= 12) {
    out.add(canonicalPhone("54" + d.slice(3)));
  }
  if (d.startsWith("54") && d.length >= 11 && d.charAt(2) !== "9") {
    out.add(canonicalPhone("549" + d.slice(2)));
  }
  return [...out].filter(Boolean);
}

async function getPending(tenantId, phoneDigits) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const variants = canonicalPhoneVariantsForLookup(phoneDigits);
  if (!variants.length) return null;
  try {
    await ensureOpinionPendingTable();
    const r = await query(
      `SELECT pedido_id FROM cliente_opinion_pending
       WHERE tenant_id = $1 AND phone_canonical = ANY($2::varchar[]) AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [tid, variants]
    );
    const row = r.rows?.[0];
    if (!row) return null;
    return { pedidoId: Number(row.pedido_id) };
  } catch (e) {
    console.error("[whatsappClienteOpinion] getPending", e.message);
    return null;
  }
}

async function ensureOpinionColumns() {
  try {
    await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_cliente TEXT`);
    await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_opinion_cliente TIMESTAMPTZ`);
  } catch (_) {
    /* ya existe o sin permiso */
  }
}

function normalizeLow(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.¡¿…]+$/g, "")
    .trim();
}

/** Comandos del menú / inicio de reclamo: no consumir como opinión (dejan actuar al bot). */
function esComandoExcluidoFlujoMenu(low, raw) {
  const t = String(raw || "").trim();
  if (/^(menu|inicio|ayuda|volver|0)$/i.test(low)) return true;
  if (low === "hola") return true;
  if (/\bcargar\s+reclamo\b/.test(low)) return true;
  if (/\bnuevo\s+reclamo\b/.test(low)) return true;
  if (/\bquiero\s+(hacer\s+)?(un\s+)?reclamo\b/.test(low)) return true;
  if (low === "lista" || low === "tipos" || low === "reclamo") return true;
  if (/^\d{1,2}$/.test(t)) return true;
  return false;
}

/** Tras guardar la opinión del cliente: un solo mensaje, sin menú ni lista de opciones. */
function ackOpinionClienteGuardada() {
  return (
    "Muchas gracias por tu mensaje. *Registramos tu observación* y la tendremos en cuenta para mejorar el servicio.\n\n" +
    "Si más adelante necesitás algo más, escribí *menú* o *Cargar reclamo* cuando quieras."
  );
}

/** Solo comandos explícitos para volver al menú (con opinión pendiente aún activa). */
function esEscapeMenuOpinionPendiente(raw) {
  const t = String(raw || "").trim();
  return /^(menu|menú|inicio|ayuda|volver|0)$/i.test(t);
}

/**
 * Si hay opinión pendiente y el texto parece feedback (no comando del menú), guarda en pedidos.
 * @returns {Promise<{ handled: boolean, ack?: string }>}
 */
export async function tryConsumeClienteOpinionReply({ tenantId, phoneDigits, text, nombreEntidad }) {
  const raw = String(text || "").trim();
  if (!raw) return { handled: false };

  const low = normalizeLow(raw);
  const pend = await getPending(tenantId, phoneDigits);

  if (pend) {
    if (esEscapeMenuOpinionPendiente(raw)) {
      return { handled: false };
    }
    await ensureOpinionColumns();
    await ensureObservacionesCierreTable();

    const chk = await query(`SELECT id FROM pedidos WHERE id = $1 LIMIT 1`, [pend.pedidoId]);
    const row = chk.rows?.[0];
    if (!row) {
      await clearPendingClienteOpinion(tenantId, phoneDigits);
      return { handled: false };
    }
    try {
      const tchk = await query(`SELECT tenant_id FROM pedidos WHERE id = $1 LIMIT 1`, [pend.pedidoId]);
      const rowTid = tchk.rows?.[0]?.tenant_id;
      if (
        rowTid != null &&
        Number.isFinite(Number(rowTid)) &&
        Number(rowTid) !== Number(tenantId)
      ) {
        return { handled: false };
      }
    } catch (_) {
      /* columna tenant_id ausente */
    }

    const opinion = raw.slice(0, 2000);
    const phoneCanon = canonicalPhone(phoneDigits);
    await query(
      `UPDATE pedidos SET opinion_cliente = $2, fecha_opinion_cliente = NOW() WHERE id = $1`,
      [pend.pedidoId, opinion]
    );
    try {
      await query(
        `INSERT INTO cliente_observaciones_cierre (tenant_id, pedido_id, phone_canonical, texto)
         VALUES ($1, $2, $3, $4)`,
        [Number(tenantId), pend.pedidoId, phoneCanon || null, opinion]
      );
    } catch (e) {
      console.error("[whatsappClienteOpinion] insert cliente_observaciones_cierre", e.message);
    }
    await clearPendingClienteOpinion(tenantId, phoneDigits);

    const ack = ackOpinionClienteGuardada();
    return { handled: true, ack };
  }

  if (esComandoExcluidoFlujoMenu(low, raw)) {
    return { handled: false };
  }

  if (raw.length < 2) return { handled: false };
  return { handled: false };
}
