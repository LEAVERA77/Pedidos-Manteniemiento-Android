/**
 * Descargo de empresa ante valoración WA: guardar, notificar cliente, chat humano y re-calificación.
 * made by leavera77
 */
import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";
import { normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";
import { sendTenantWhatsAppText } from "./whatsappService.js";
import {
  humanChatOpenOrGetSession,
  humanChatAppendOutbound,
  humanChatActivateSession,
  humanChatGetSessionForTenant,
} from "./whatsappHumanChat.js";
import { registerPendingClienteOpinionReRating } from "./whatsappClienteOpinion.js";

const SOURCE_DESCARGO = "opinion_descargo";

async function ensureDescargoColumns() {
  await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_descargo_empresa TEXT`);
  await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_descargo_empresa TIMESTAMPTZ`);
}

/**
 * @param {number} pedidoId
 * @param {string} descargo
 * @param {number} tenantId
 * @param {object} [req] — para filtro business_type en UPDATE
 */
export async function guardarDescargoEmpresaEnPedido(pedidoId, descargo, tenantId, req = null, opts = {}) {
  await ensureDescargoColumns();
  const id = Number(pedidoId);
  const tid = Number(tenantId);
  const val = descargo == null || String(descargo).trim() === "" ? null : String(descargo).trim();
  if (!Number.isFinite(id) || id < 1) throw new Error("ID inválido");
  const hasTUp = await pedidosTableHasTenantIdColumn();
  const bind = hasTUp ? [id, val, tid] : [id, val];
  let bt = "";
  if (req && !opts.skipBusinessFilter) bt = await pushPedidoBusinessFilter(req, bind);
  const sql = hasTUp
    ? `UPDATE pedidos
       SET opinion_descargo_empresa = $2,
           fecha_descargo_empresa = CASE WHEN $2 IS NULL THEN NULL ELSE NOW() END
       WHERE id = $1 AND tenant_id = $3${bt}
       RETURNING *`
    : `UPDATE pedidos
       SET opinion_descargo_empresa = $2,
           fecha_descargo_empresa = CASE WHEN $2 IS NULL THEN NULL ELSE NOW() END
       WHERE id = $1${bt}
       RETURNING *`;
  const r = await query(sql, bind);
  if (!r.rows.length) throw new Error("Pedido no encontrado");
  return r.rows[0];
}

function buildMensajeDescargoCliente(pedido, descargo) {
  const np = pedido.numero_pedido ?? pedido.id;
  const ent = String(pedido.cliente_nombre || "cliente").trim() || "cliente";
  const txt = String(descargo || "").trim();
  return (
    `Hola ${ent}, respecto de tu valoración del pedido *#${np}*:\n\n` +
    `*Respuesta de la empresa:*\n${txt}\n\n` +
    `Si querés consultar o ampliar, respondé por este chat y un operador te atiende.\n` +
    `Cuando finalicemos la conversación, podrás *volver a calificar* la atención (del 1 al 5).`
  );
}

/**
 * @param {object} pedido — fila pedidos
 * @param {string} descargo
 * @param {number} tenantId
 * @param {number} userId
 */
export async function notificarDescargoYAbrirChatHumano(pedido, descargo, tenantId, userId) {
  const desc = String(descargo || "").trim();
  if (!desc) return { whatsappEnviado: false, humanChatSessionId: null };

  const raw = String(pedido.telefono_contacto || "").replace(/\D/g, "");
  const waDigits = normalizeWhatsAppRecipientForMeta(raw);
  if (!waDigits || waDigits.length < 8) {
    return { whatsappEnviado: false, humanChatSessionId: null, skipReason: "sin_telefono" };
  }

  const nombre =
    String(pedido.cliente_nombre || "").trim() || `Pedido #${pedido.numero_pedido ?? pedido.id}`;
  const body = buildMensajeDescargoCliente(pedido, desc);

  let whatsappEnviado = false;
  try {
    const wr = await sendTenantWhatsAppText({
      tenantId,
      toDigits: waDigits,
      bodyText: body,
      pedidoId: pedido.id,
      logContext: "opinion_descargo_empresa",
    });
    whatsappEnviado = !!wr.ok;
  } catch (e) {
    console.warn("[opinion-descargo] WA", e?.message || e);
  }

  let humanChatSessionId = null;
  try {
    const { id: sid } = await humanChatOpenOrGetSession(tenantId, waDigits, nombre, {
      expiresInHours: 72,
    });
    humanChatSessionId = sid;
    const stub = `[Descargo empresa] Pedido #${pedido.numero_pedido ?? pedido.id}. El cliente puede responder por este hilo.`;
    await humanChatAppendOutbound(sid, stub, {
      source: SOURCE_DESCARGO,
      pedido_id: Number(pedido.id),
    });
    await humanChatActivateSession(sid, tenantId, userId);
    if (whatsappEnviado) {
      await humanChatAppendOutbound(sid, body, {
        source: SOURCE_DESCARGO,
        pedido_id: Number(pedido.id),
        wa_broadcast: true,
      });
    }
  } catch (e) {
    console.error("[opinion-descargo] human chat", e?.message || e);
  }

  return { whatsappEnviado, humanChatSessionId };
}

async function pedidoIdDesdeSesionDescargo(sessionId, tenantId) {
  const sid = Number(sessionId);
  const tid = Number(tenantId);
  if (!Number.isFinite(sid) || sid < 1) return null;
  const r = await query(
    `SELECT (meta->>'pedido_id')::int AS pid
     FROM whatsapp_human_chat_message
     WHERE session_id = $1 AND meta->>'source' = $2
     ORDER BY id ASC LIMIT 1`,
    [sid, SOURCE_DESCARGO]
  );
  const pid = r.rows?.[0]?.pid;
  return Number.isFinite(Number(pid)) && Number(pid) > 0 ? Number(pid) : null;
}

/**
 * Tras cerrar chat humano: si fue por descargo, invita a re-calificar por WA.
 */
export async function humanChatCerradoOfrecerReCalificacion(sessionId, tenantId) {
  const sid = Number(sessionId);
  const tid = Number(tenantId);
  const session = await humanChatGetSessionForTenant(sid, tid);
  if (!session) return { offered: false };

  const pedidoId = await pedidoIdDesdeSesionDescargo(sid, tid);
  if (!pedidoId) return { offered: false };

  const phone = String(session.phone_canonical || "").replace(/\D/g, "");
  if (phone.length < 8) return { offered: false };

  let np = pedidoId;
  try {
    const rp = await query(`SELECT numero_pedido FROM pedidos WHERE id = $1 LIMIT 1`, [pedidoId]);
    if (rp.rows?.[0]?.numero_pedido) np = rp.rows[0].numero_pedido;
  } catch (_) {}

  await registerPendingClienteOpinionReRating(tid, phone, pedidoId);

  const invite =
    `Gracias por conversar con nosotros sobre el pedido *#${np}*.\n\n` +
    `Si querés, podés *volver a calificar* la atención del *1* al *5* ` +
    `(la nueva valoración reemplaza a la anterior).\n` +
    `Respondé con un número o con estrellas ⭐.`;

  try {
    await sendTenantWhatsAppText({
      tenantId: tid,
      toDigits: phone,
      bodyText: invite,
      pedidoId,
      logContext: "opinion_re_rating_invite",
    });
  } catch (e) {
    console.warn("[opinion-descargo] invite re-rating WA", e?.message || e);
  }

  return { offered: true, pedidoId };
}
