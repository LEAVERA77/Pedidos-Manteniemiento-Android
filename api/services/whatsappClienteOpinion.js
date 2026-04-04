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

async function getPending(tenantId, phoneDigits) {
  const phone = canonicalPhone(phoneDigits);
  const tid = Number(tenantId);
  if (!phone || !Number.isFinite(tid) || tid < 1) return null;
  try {
    await ensureOpinionPendingTable();
    const r = await query(
      `SELECT pedido_id FROM cliente_opinion_pending
       WHERE tenant_id = $1 AND phone_canonical = $2 AND expires_at > NOW()
       LIMIT 1`,
      [tid, phone]
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

/**
 * Si hay opinión pendiente y el texto parece feedback (no comando del menú), guarda en pedidos.
 * @returns {Promise<{ handled: boolean, ack?: string }>}
 */
export async function tryConsumeClienteOpinionReply({ tenantId, phoneDigits, text }) {
  const raw = String(text || "").trim();
  if (raw.length < 2) return { handled: false };

  const low = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    /^(hola|menu|gracias|ok|dale|si|no|listo|perfecto|bueno)$/i.test(low) ||
    /^(0|inicio|ayuda|volver)$/i.test(low)
  ) {
    return { handled: false };
  }

  if (/^\d{1,2}$/.test(raw)) return { handled: false };
  if (/\bcargar\s+reclamo\b/.test(low) || /\bnuevo\s+reclamo\b/.test(low)) return { handled: false };

  const pend = await getPending(tenantId, phoneDigits);
  if (!pend) return { handled: false };

  await ensureOpinionColumns();

  const chk = await query(`SELECT id, tenant_id FROM pedidos WHERE id = $1 LIMIT 1`, [pend.pedidoId]);
  const row = chk.rows?.[0];
  if (!row) {
    await clearPendingClienteOpinion(tenantId, phoneDigits);
    return { handled: false };
  }
  const rowTid = row.tenant_id != null ? Number(row.tenant_id) : null;
  if (rowTid != null && Number.isFinite(rowTid) && rowTid !== Number(tenantId)) {
    return { handled: false };
  }

  const opinion = raw.slice(0, 2000);
  await query(
    `UPDATE pedidos SET opinion_cliente = $2, fecha_opinion_cliente = NOW() WHERE id = $1`,
    [pend.pedidoId, opinion]
  );
  await clearPendingClienteOpinion(tenantId, phoneDigits);

  return {
    handled: true,
    ack: "Gracias por sus observaciones, las tendremos en cuenta.",
  };
}
