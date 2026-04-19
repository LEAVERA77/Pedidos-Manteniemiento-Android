import { query } from "../db/neon.js";

/**
 * Historial en whatsapp_notificaciones (Cloud API / bot).
 * destinatario_tipo distingue origen: meta_recibido | meta_bot_enviado | meta_bot_error
 */
export async function logWhatsappMensajeRecibido(telefonoDigits, mensaje) {
  const tel = String(telefonoDigits || "").replace(/\D/g, "");
  const msg = String(mensaje || "").slice(0, 4000);
  await query(
    `INSERT INTO whatsapp_notificaciones
     (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
     VALUES (NULL, 'meta_recibido', $1, $2, NULL, 'recibido', NOW(), NOW())`,
    [tel, msg]
  );
}

export async function logWhatsappMensajeEnviado(telefonoDigits, mensaje, ok, pedidoId = null) {
  const tel = String(telefonoDigits || "").replace(/\D/g, "");
  const msg = String(mensaje || "").slice(0, 4000);
  const pid = pedidoId != null && Number.isFinite(Number(pedidoId)) ? Number(pedidoId) : null;
  await query(
    `INSERT INTO whatsapp_notificaciones
     (destinatario_id, destinatario_tipo, telefono, mensaje, pedido_id, estado, fecha_envio, fecha_creacion)
     VALUES (NULL, $1, $2, $3, $4, $5, NOW(), NOW())`,
    [ok ? "meta_bot_enviado" : "meta_bot_error", tel, msg, pid, ok ? "enviado" : "error"]
  );
}
