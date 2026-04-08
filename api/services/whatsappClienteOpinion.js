/**
 * Tras el mensaje de cierre por WA: primero calificación 1–5, luego comentario opcional.
 * Estado en Neon (cliente_opinion_pending.rating_stars NULL = aún falta la nota).
 */

import { query } from "../db/neon.js";
import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";
import { parseStarRating01a5 } from "../utils/parseStarRating01a5.js";

let _tableEnsured = false;
let _obsTableEnsured = false;

function canonicalPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";
  return normalizeWhatsAppRecipientForMeta(d);
}

async function ensureOpinionPendingExtraColumns() {
  try {
    await query(`ALTER TABLE cliente_opinion_pending ADD COLUMN IF NOT EXISTS rating_stars SMALLINT`);
  } catch (_) {
    /* sin permiso */
  }
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
  await ensureOpinionPendingExtraColumns();
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
      estrellas SMALLINT,
      texto TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  try {
    await query(`ALTER TABLE cliente_observaciones_cierre ADD COLUMN IF NOT EXISTS estrellas SMALLINT`);
  } catch (_) {}
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
      `INSERT INTO cliente_opinion_pending (tenant_id, phone_canonical, pedido_id, expires_at, rating_stars)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (tenant_id, phone_canonical)
       DO UPDATE SET pedido_id = EXCLUDED.pedido_id, expires_at = EXCLUDED.expires_at, rating_stars = NULL, created_at = NOW()`,
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
      `SELECT pedido_id, rating_stars FROM cliente_opinion_pending
       WHERE tenant_id = $1 AND phone_canonical = ANY($2::varchar[]) AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [tid, variants]
    );
    const row = r.rows?.[0];
    if (!row) return null;
    const rs = row.rating_stars;
    return {
      pedidoId: Number(row.pedido_id),
      ratingStars: rs != null && rs !== "" ? Number(rs) : null,
    };
  } catch (e) {
    console.error("[whatsappClienteOpinion] getPending", e.message);
    return null;
  }
}

async function ensureOpinionColumns() {
  try {
    await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_cliente TEXT`);
    await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_opinion_cliente TIMESTAMPTZ`);
    await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_cliente_estrellas SMALLINT`);
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

/** Primera línea si el usuario manda varias (solo fase de nota). */
function primeraLinea(text) {
  const s = String(text || "");
  const i = s.indexOf("\n");
  return (i === -1 ? s : s.slice(0, i)).trim();
}

function esOmitirComentarioOpinion(raw) {
  const low = normalizeLow(primeraLinea(raw));
  if (!low) return true;
  return /^(omitir|saltar|no|nada|solo eso|listo|ok|gracias|\-|\.|no gracias|sin comentario)$/i.test(low);
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
  return false;
}

function ackOpinionClienteGuardada() {
  return (
    "Muchas gracias. *Registramos tu valoración* y la tendremos en cuenta para mejorar el servicio.\n\n" +
    "Si más adelante necesitás algo más, escribí *menú* o *Cargar reclamo* cuando quieras."
  );
}

function ackPedirCalificacion() {
  return (
    "*Paso 1 de 2 — Calificación*\n\n" +
    "¿Cómo fue la atención del *1* al *5*?\n" +
    "· *1* = muy malo · *3* = regular · *5* = excelente\n\n" +
    "Respondé con *un número* o con *estrellas* (⭐).\n" +
    "Ejemplos válidos: *4* · *⭐⭐⭐⭐*"
  );
}

function ackTrasCalificacion() {
  return (
    "*Paso 2 de 2 — Comentario (opcional)*\n\n" +
    "Si querés, escribí una *frase corta* con tu opinión.\n" +
    "Si no querés texto, respondé *omitir*."
  );
}

function esEscapeMenuOpinionPendiente(raw) {
  const t = String(raw || "").trim();
  return /^(menu|menú|inicio|ayuda|volver|0)$/i.test(t);
}

/**
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

    const phoneCanon = canonicalPhone(phoneDigits);

    const needRating = pend.ratingStars == null || !Number.isFinite(pend.ratingStars);
    if (needRating) {
      const stars = parseStarRating01a5(raw);
      if (stars == null) {
        return { handled: true, ack: ackPedirCalificacion() };
      }
      await query(
        `UPDATE cliente_opinion_pending SET rating_stars = $3 WHERE tenant_id = $1 AND phone_canonical = $2`,
        [Number(tenantId), phoneCanon, stars]
      );
      return { handled: true, ack: ackTrasCalificacion() };
    }

    const stars = pend.ratingStars;
    let textoOpinion = "";
    if (!esOmitirComentarioOpinion(raw)) {
      textoOpinion = String(raw).trim().slice(0, 2000);
    }

    await query(
      `UPDATE pedidos SET opinion_cliente_estrellas = $2, opinion_cliente = $3, fecha_opinion_cliente = NOW() WHERE id = $1`,
      [pend.pedidoId, stars, textoOpinion || null]
    );
    try {
      await query(
        `INSERT INTO cliente_observaciones_cierre (tenant_id, pedido_id, phone_canonical, estrellas, texto)
         VALUES ($1, $2, $3, $4, $5)`,
        [Number(tenantId), pend.pedidoId, phoneCanon || null, stars, textoOpinion || "(sin comentario)"]
      );
    } catch (e) {
      console.error("[whatsappClienteOpinion] insert cliente_observaciones_cierre", e.message);
    }
    await clearPendingClienteOpinion(tenantId, phoneDigits);

    return { handled: true, ack: ackOpinionClienteGuardada() };
  }

  if (esComandoExcluidoFlujoMenu(low, raw)) {
    return { handled: false };
  }

  if (raw.length < 2) return { handled: false };
  return { handled: false };
}
