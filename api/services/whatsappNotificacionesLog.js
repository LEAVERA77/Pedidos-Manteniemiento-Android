import { query } from "../db/neon.js";
import { getWhatsappBotActiveTarget } from "./whatsappBotTargetStore.js";

let _hasTenantCol = null;

export function __resetWhatsappNotifLogCacheForTests() {
  _hasTenantCol = null;
}

async function hasTenantIdColumn() {
  if (_hasTenantCol !== null) return _hasTenantCol;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'whatsapp_notificaciones' AND column_name = 'tenant_id'
       LIMIT 1`
    );
    _hasTenantCol = Boolean(r?.rows?.length);
  } catch (_) {
    _hasTenantCol = false;
  }
  return _hasTenantCol;
}

async function resolveLogTenantId(explicitTenantId = null) {
  const n = Number(explicitTenantId);
  if (Number.isFinite(n) && n >= 1) return Math.trunc(n);
  try {
    const active = await getWhatsappBotActiveTarget();
    if (active?.tenantId) return active.tenantId;
  } catch (_) {}
  return null;
}

/**
 * Historial en whatsapp_notificaciones (Cloud API / Baileys / bot).
 * destinatario_tipo distingue origen: meta_recibido | meta_bot_enviado | meta_bot_error
 */
export async function logWhatsappMensajeRecibido(telefonoDigits, mensaje, tenantId = null) {
  const tel = String(telefonoDigits || "").replace(/\D/g, "");
  const msg = String(mensaje || "").slice(0, 4000);
  const tid = await resolveLogTenantId(tenantId);
  if ((await hasTenantIdColumn()) && tid != null) {
    await query(
      `INSERT INTO whatsapp_notificaciones
       (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion, tenant_id)
       VALUES (NULL, 'meta_recibido', $1, $2, NULL, 'recibido', NOW(), NOW(), $3)`,
      [tel, msg, tid]
    );
    return;
  }
  await query(
    `INSERT INTO whatsapp_notificaciones
     (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
     VALUES (NULL, 'meta_recibido', $1, $2, NULL, 'recibido', NOW(), NOW())`,
    [tel, msg]
  );
}

export async function logWhatsappMensajeEnviado(
  telefonoDigits,
  mensaje,
  ok,
  pedidoId = null,
  tenantId = null
) {
  const tel = String(telefonoDigits || "").replace(/\D/g, "");
  const msg = String(mensaje || "").slice(0, 4000);
  const pid = pedidoId != null && Number.isFinite(Number(pedidoId)) ? Number(pedidoId) : null;
  const tid = await resolveLogTenantId(tenantId);
  if ((await hasTenantIdColumn()) && tid != null) {
    await query(
      `INSERT INTO whatsapp_notificaciones
       (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion, tenant_id)
       VALUES (NULL, $1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
      [ok ? "meta_bot_enviado" : "meta_bot_error", tel, msg, pid, ok ? "enviado" : "error", tid]
    );
    return;
  }
  await query(
    `INSERT INTO whatsapp_notificaciones
     (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
     VALUES (NULL, $1, $2, $3, $4, $5, NOW(), NOW())`,
    [ok ? "meta_bot_enviado" : "meta_bot_error", tel, msg, pid, ok ? "enviado" : "error"]
  );
}
