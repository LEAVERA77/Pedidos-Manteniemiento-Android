/**
 * Tras el mensaje de cierre por WA, el cliente puede responder con texto libre.
 * Estado en memoria (TTL); al reiniciar el servidor se pierde la ventana pendiente.
 *
 * La clave de teléfono debe coincidir con la que usa el webhook (normalizeWhatsAppRecipientForMeta),
 * no con el raw guardado en pedidos.telefono_contacto (549 vs 54 en AR).
 */

import { query } from "../db/neon.js";
import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";

/** @type {Map<string, { pedidoId: number, expires: number }>} */
const pendingByTenantPhone = new Map();

function canonicalPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";
  return normalizeWhatsAppRecipientForMeta(d);
}

function pendingKey(tenantId, phoneDigits) {
  return `${Number(tenantId)}:${canonicalPhone(phoneDigits)}`;
}

export function registerPendingClienteOpinion(tenantId, phoneDigits, pedidoId) {
  const phone = canonicalPhone(phoneDigits);
  if (!phone || phone.length < 8) return;
  const pid = Number(pedidoId);
  if (!Number.isFinite(pid) || pid < 1) return;
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return;
  pendingByTenantPhone.set(pendingKey(tid, phone), {
    pedidoId: pid,
    expires: Date.now() + 30 * 86400000,
  });
}

export function clearPendingClienteOpinion(tenantId, phoneDigits) {
  pendingByTenantPhone.delete(pendingKey(tenantId, phoneDigits));
}

function getPending(tenantId, phoneDigits) {
  const key = pendingKey(tenantId, phoneDigits);
  const v = pendingByTenantPhone.get(key);
  if (!v) return null;
  if (Date.now() > v.expires) {
    pendingByTenantPhone.delete(key);
    return null;
  }
  return v;
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

  const pend = getPending(tenantId, phoneDigits);
  if (!pend) return { handled: false };

  await ensureOpinionColumns();

  const chk = await query(`SELECT id, tenant_id FROM pedidos WHERE id = $1 LIMIT 1`, [pend.pedidoId]);
  const row = chk.rows?.[0];
  if (!row) {
    clearPendingClienteOpinion(tenantId, phoneDigits);
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
  clearPendingClienteOpinion(tenantId, phoneDigits);

  return {
    handled: true,
    ack: "Gracias por sus observaciones, las tendremos en cuenta.",
  };
}
