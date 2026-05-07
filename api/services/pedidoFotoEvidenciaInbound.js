/**
 * Vecino envía otra foto por WhatsApp cuando el pedido está en «Evidencia insuficiente».
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn, tableHasColumn } from "../utils/tenantScope.js";
import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";
import { whatsappPedidoSubirFotoDesdeMediaId } from "./whatsappPedidoFotoHelpers.js";
import { getWhatsAppCredentialsByMetaPhoneNumberId, getWhatsAppCredentialsForTenant } from "./whatsappService.js";
import { splitUrls, toJoinedUrls } from "../utils/helpers.js";

async function columnasUsuariosSet() {
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios'`
  );
  return new Set((cols.rows || []).map((c) => c.column_name));
}

/** Aviso en `notificaciones_movil` a admins del tenant (mismo patrón que nuevo reclamo WA). */
async function notificarAdminsNuevaFotoPedidoSafe(tenantId, pedido) {
  if (!pedido?.id) return;
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'notificaciones_movil' LIMIT 1`
    );
    if (!t.rows.length) return;

    const colSet = await columnasUsuariosSet();
    const hasTenant = colSet.has("tenant_id");
    const hasCliente = colSet.has("cliente_id");
    const col = hasTenant ? "tenant_id" : hasCliente ? "cliente_id" : null;
    if (!col) return;

    let admins = await query(
      `SELECT id FROM usuarios
       WHERE ${col} = $1 AND activo = TRUE
         AND (
           LOWER(COALESCE(rol::text, '')) = 'admin'
           OR LOWER(COALESCE(rol::text, '')) = 'administrador'
         )`,
      [tenantId]
    );
    let recipients = admins.rows || [];
    if (!recipients.length) {
      const anyU = await query(
        `SELECT id FROM usuarios WHERE ${col} = $1 AND activo = TRUE ORDER BY id ASC`,
        [tenantId]
      );
      recipients = anyU.rows || [];
    }
    if (!recipients.length) return;
    const np = String(pedido.numero_pedido || "").trim() || String(pedido.id);
    const titulo = "Nueva foto en reclamo";
    const cuerpo = `📸 Nueva foto para pedido *#${np}* (revisión de evidencia).`;
    for (const a of recipients) {
      await query(
        `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [a.id, pedido.id, titulo, cuerpo]
      );
    }
  } catch (e) {
    console.warn("[pedido-foto-evidencia-inbound] notificar admins", e?.message || e);
  }
}

/**
 * Si hay un pedido WA en «Evidencia insuficiente» para el mismo teléfono, sube la imagen y vuelve a Pendiente.
 * @returns {Promise<{ attached: boolean, reason?: string }>}
 */
export async function tryAttachWhatsappImageToPedidoEvidenciaInsuficiente({
  tenantId,
  phoneDigits,
  mediaId,
  phoneNumberId,
  directMediaUrl,
}) {
  const tid = Number(tenantId);
  const canon = normalizeWhatsAppRecipientForMeta(String(phoneDigits || "").replace(/\D/g, ""));
  if (!Number.isFinite(tid) || tid < 1 || canon.length < 8) return { attached: false, reason: "bad_input" };

  const r = await query(
    `SELECT * FROM pedidos
     WHERE tenant_id = $1
       AND LOWER(TRIM(COALESCE(estado::text,''))) = 'evidencia insuficiente'
       AND LOWER(TRIM(COALESCE(origen_reclamo::text,''))) = 'whatsapp'
     ORDER BY fecha_creacion DESC NULLS LAST
     LIMIT 8`,
    [tid]
  );
  const rows = r.rows || [];
  let hit = null;
  for (const row of rows) {
    const tel = String(row.telefono_contacto || "").replace(/\D/g, "");
    if (tel && normalizeWhatsAppRecipientForMeta(tel) === canon) {
      hit = row;
      break;
    }
  }
  if (!hit) return { attached: false, reason: "no_pedido" };

  const pid = String(phoneNumberId || "").trim();
  let accessToken = "";
  if (pid) {
    const byPid = await getWhatsAppCredentialsByMetaPhoneNumberId(pid);
    accessToken = String(byPid.accessToken || "").trim();
  }
  if (!accessToken) {
    const creds = await getWhatsAppCredentialsForTenant(tid);
    accessToken = String(creds.accessToken || "").trim();
  }
  const waProv = String(process.env.WHATSAPP_PROVIDER || "meta").toLowerCase().trim();
  const mid = String(mediaId || "").trim();
  const direct = String(directMediaUrl || "").trim();
  if (!accessToken && waProv === "meta" && mid && !direct) {
    return { attached: false, reason: "no_token" };
  }

  const { secureUrl } = await whatsappPedidoSubirFotoDesdeMediaId(mid, accessToken, {
    directUrl: direct,
  });
  const prev = splitUrls(hit.foto_urls);
  prev.push(secureUrl);
  const joined = toJoinedUrls(prev) || secureUrl;

  const useTenant = await pedidosTableHasTenantIdColumn();
  const clearMotivo = (await tableHasColumn("pedidos", "motivo_rechazo_foto"))
    ? ", motivo_rechazo_foto = NULL"
    : "";
  const sql = useTenant
    ? `UPDATE pedidos SET foto_urls = $1, estado = 'Pendiente'${clearMotivo} WHERE id = $2 AND tenant_id = $3 RETURNING *`
    : `UPDATE pedidos SET foto_urls = $1, estado = 'Pendiente'${clearMotivo} WHERE id = $2 RETURNING *`;
  const params = useTenant ? [joined, hit.id, tid] : [joined, hit.id];
  const up = await query(sql, params);
  const rowOut = up.rows?.[0];
  if (!rowOut) return { attached: false, reason: "update_failed" };

  setImmediate(() => {
    (async () => {
      await notificarAdminsNuevaFotoPedidoSafe(tid, rowOut).catch(() => {});
    })();
  });

  return { attached: true, pedidoId: hit.id };
}
