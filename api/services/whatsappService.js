/**
 * WhatsApp Cloud API — envío genérico multitenant.
 * Credenciales por tenant: clientes.configuracion.meta_access_token + meta_phone_id
 * (Phone number ID de Meta, mismo que usás en el webhook).
 * Si no vienen en JSON, se usan META_ACCESS_TOKEN y META_PHONE_NUMBER_ID del entorno.
 */

import { query } from "../db/neon.js";
import { sendWhatsAppTextWithCredentials, normalizeWhatsAppRecipientForMeta } from "./metaWhatsapp.js";
import { logWhatsappMensajeEnviado } from "./whatsappNotificacionesLog.js";
import { registerPendingClienteOpinion } from "./whatsappClienteOpinion.js";

function normCfg(cfg) {
  if (!cfg || typeof cfg !== "object") return {};
  if (typeof cfg === "string") {
    try {
      return JSON.parse(cfg);
    } catch {
      return {};
    }
  }
  return cfg;
}

/**
 * Token (y tenant) asociados al número de Meta que recibió el webhook.
 * El path de Graph debe usar el mismo phone_number_id que envía Meta en metadata.
 */
export async function getWhatsAppCredentialsByMetaPhoneNumberId(phoneNumberId) {
  const pid = String(phoneNumberId || "").trim();
  if (!pid) {
    return { accessToken: "", tenantId: null, source: "empty_phone_id" };
  }

  try {
    const r = await query(
      `SELECT id, configuracion FROM clientes
       WHERE activo = TRUE
         AND (
           (configuracion->>'meta_phone_id') = $1
           OR (configuracion->>'meta_phone_number_id') = $1
         )
       LIMIT 1`,
      [pid]
    );
    const row = r.rows?.[0];
    if (row) {
      const c = normCfg(row.configuracion);
      const accessToken = String(c.meta_access_token || c.META_ACCESS_TOKEN || "").trim();
      return {
        accessToken,
        tenantId: Number(row.id),
        source: accessToken ? "cliente_config" : "cliente_config_no_token",
      };
    }
  } catch (e) {
    console.warn("[whatsapp-service] getWhatsAppCredentialsByMetaPhoneNumberId", e.message);
  }

  const envPid = String(process.env.META_PHONE_NUMBER_ID || "").trim();
  if (envPid && pid === envPid) {
    return {
      accessToken: String(process.env.META_ACCESS_TOKEN || "").trim(),
      tenantId: Number(process.env.WHATSAPP_BOT_TENANT_ID || 1),
      source: "env_phone_match",
    };
  }

  return { accessToken: "", tenantId: null, source: "no_row_for_phone_id" };
}

/**
 * Envío del bot: prioriza token ligado al phone_number_id del webhook (Graph: /{phone_number_id}/messages).
 */
export async function sendBotWhatsAppText({
  tenantId,
  webhookPhoneNumberId,
  toDigits,
  bodyText,
  logContext = "whatsapp_bot_meta",
}) {
  const to = String(toDigits || "").replace(/\D/g, "");
  const body = String(bodyText || "").trim();
  if (!to || !body) {
    return { ok: false, error: "invalid_params", skipped: false };
  }

  const pid = String(webhookPhoneNumberId || "").trim();
  let accessToken = "";
  let graphPhoneId = pid;

  if (pid) {
    const byWebhook = await getWhatsAppCredentialsByMetaPhoneNumberId(pid);
    accessToken = String(byWebhook.accessToken || "").trim();
  }

  if (!accessToken) {
    const t = await getWhatsAppCredentialsForTenant(tenantId);
    accessToken = String(t.accessToken || "").trim();
    if (!graphPhoneId) graphPhoneId = String(t.phoneNumberId || "").trim();
  }

  if (!graphPhoneId) {
    const t = await getWhatsAppCredentialsForTenant(tenantId);
    graphPhoneId = String(t.phoneNumberId || "").trim();
  }

  if (!accessToken || !graphPhoneId) {
    console.warn("[whatsapp-service] bot: sin credenciales para enviar", {
      tenantId,
      webhookPhoneIdPresent: Boolean(pid),
      logContext,
    });
    try {
      await logWhatsappMensajeEnviado(to, `[${logContext}] sin credenciales bot`, false, null);
    } catch (_) {}
    return { ok: false, error: "missing_meta_credentials", skipped: false };
  }

  const r = await sendWhatsAppTextWithCredentials(to, body, {
    accessToken,
    phoneNumberId: graphPhoneId,
    purpose: logContext,
  });
  try {
    await logWhatsappMensajeEnviado(to, body, r.ok, null);
  } catch (e) {
    console.error("[whatsapp-service] log", e.message);
  }
  return { ok: r.ok, graph: r.graph, error: r.error, skipped: false };
}

/**
 * @returns {{ accessToken: string, phoneNumberId: string, source: string }}
 */
export async function getWhatsAppCredentialsForTenant(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return {
      accessToken: String(process.env.META_ACCESS_TOKEN || "").trim(),
      phoneNumberId: String(process.env.META_PHONE_NUMBER_ID || "").trim(),
      source: "env_fallback_invalid_tenant",
    };
  }

  try {
    const r = await query(
      `SELECT configuracion FROM clientes WHERE id = $1 AND activo = TRUE LIMIT 1`,
      [tid]
    );
    const row = r.rows?.[0];
    const c = normCfg(row?.configuracion);
    const tokenFromCfg = String(c.meta_access_token || c.META_ACCESS_TOKEN || "").trim();
    const phoneFromCfg = String(
      c.meta_phone_id || c.meta_phone_number_id || c.META_PHONE_NUMBER_ID || ""
    ).trim();

    const envToken = String(process.env.META_ACCESS_TOKEN || "").trim();
    const envPhone = String(process.env.META_PHONE_NUMBER_ID || "").trim();

    const accessToken = tokenFromCfg || envToken;
    const phoneNumberId = phoneFromCfg || envPhone;
    const source =
      tokenFromCfg && phoneFromCfg
        ? "cliente_config"
        : tokenFromCfg || phoneFromCfg
          ? "cliente_config_partial"
          : "env";

    return { accessToken, phoneNumberId, source };
  } catch (e) {
    console.warn("[whatsapp-service] getWhatsAppCredentialsForTenant", e.message);
    return {
      accessToken: String(process.env.META_ACCESS_TOKEN || "").trim(),
      phoneNumberId: String(process.env.META_PHONE_NUMBER_ID || "").trim(),
      source: "env_error",
    };
  }
}

/**
 * Envío de texto reutilizable (log opcional con pedido_id).
 */
export async function sendTenantWhatsAppText({
  tenantId,
  toDigits,
  bodyText,
  pedidoId = null,
  logContext = "generic",
}) {
  const to = String(toDigits || "").replace(/\D/g, "");
  const body = String(bodyText || "").trim();
  if (!to || !body) {
    return { ok: false, error: "invalid_params", skipped: false };
  }

  const { accessToken, phoneNumberId, source } = await getWhatsAppCredentialsForTenant(tenantId);
  if (!accessToken || !phoneNumberId) {
    console.warn("[whatsapp-service] sin credenciales Meta", { tenantId, source, logContext });
    try {
      await logWhatsappMensajeEnviado(to, `[${logContext}] sin credenciales`, false, pedidoId);
    } catch (_) {}
    return { ok: false, error: "missing_meta_credentials", skipped: false };
  }

  const r = await sendWhatsAppTextWithCredentials(to, body, {
    accessToken,
    phoneNumberId,
    purpose: logContext,
  });
  try {
    await logWhatsappMensajeEnviado(to, body, r.ok, pedidoId);
  } catch (e) {
    console.error("[whatsapp-service] log", e.message);
  }

  return { ok: r.ok, graph: r.graph, error: r.error, skipped: false };
}

/**
 * Aviso al cliente/vecino cuando el técnico cierra el reclamo.
 * No lanza: solo loguea errores.
 */
export async function notifyPedidoCierreWhatsAppSafe({
  tenantId,
  numeroPedido,
  nombreEntidad,
  telefonoContactoRaw,
  pedidoId,
}) {
  const phone = String(telefonoContactoRaw || "").replace(/\D/g, "");
  if (!phone || phone.length < 8) {
    console.log("[whatsapp-service] cierre: sin teléfono válido, no se envía WA", {
      pedidoId,
      tenantId,
    });
    return { sent: false, skipped: true, reason: "no_phone" };
  }

  const np = String(numeroPedido || "").trim() || `#${pedidoId}`;
  const ent = String(nombreEntidad || "nuestro equipo").trim();
  const body =
    `*${ent}* informa: su reclamo *#${np}* fue *finalizado* por el equipo técnico.\n\n` +
    `*Encuesta rápida (2 pasos)*\n\n` +
    `*Paso 1 — Nota (obligatorio)*\n` +
    `Calificá del *1* al *5* (1 = muy malo, 5 = excelente). Respondé con el *número* o con *⭐*.\n\n` +
    `*Paso 2 — Comentario (opcionario)*\n` +
    `Si querés, una frase. Si no, respondé *omitir*.\n\n` +
    `_Gracias por tu tiempo._`;

  try {
    const r = await sendTenantWhatsAppText({
      tenantId,
      toDigits: phone,
      bodyText: body,
      pedidoId,
      logContext: "cierre_pedido",
    });
    if (r.ok) {
      const phoneCanon = normalizeWhatsAppRecipientForMeta(phone);
      await registerPendingClienteOpinion(tenantId, phoneCanon, pedidoId);
    } else {
      console.error("[whatsapp-service] cierre: envío falló (pedido ya cerrado en BD)", {
        pedidoId,
        tenantId,
        detail: r.error || r.graph,
      });
    }
    return { sent: !!r.ok, skipped: false, ok: r.ok };
  } catch (e) {
    console.error("[whatsapp-service] cierre: excepción no bloqueante", e.message);
    return { sent: false, skipped: false, error: e.message };
  }
}

/**
 * Aviso al cliente cuando se registra un reclamo con teléfono de contacto (alta desde app o API).
 */
export async function notifyPedidoAltaClienteWhatsAppSafe({
  tenantId,
  numeroPedido,
  nombreEntidad,
  telefonoContactoRaw,
  pedidoId,
  descripcion,
  tipoTrabajo,
}) {
  const phone = String(telefonoContactoRaw || "").replace(/\D/g, "");
  if (!phone || phone.length < 8) {
    return { sent: false, skipped: true, reason: "no_phone" };
  }

  const np = String(numeroPedido || "").trim() || String(pedidoId || "");
  const desc = String(descripcion || "").trim();
  const tt = String(tipoTrabajo || "").trim();
  const causa = desc || tt || "sin detalle";
  const snippet = causa.slice(0, 280);
  const ent = String(nombreEntidad || "").trim();
  const body =
    (ent ? `*${ent}*\n\n` : "") +
    `Se cargó un reclamo *#${np}*, causa: ${snippet}\n\n` +
    `Tu pedido será tratado.`;

  try {
    const r = await sendTenantWhatsAppText({
      tenantId,
      toDigits: phone,
      bodyText: body,
      pedidoId,
      logContext: "alta_reclamo_cliente",
    });
    if (!r.ok) {
      console.error("[whatsapp-service] alta reclamo: envío falló", {
        pedidoId,
        tenantId,
        detail: r.error || r.graph,
      });
    }
    return { sent: !!r.ok, skipped: false, ok: r.ok };
  } catch (e) {
    console.error("[whatsapp-service] alta reclamo: excepción no bloqueante", e.message);
    return { sent: false, skipped: false, error: e.message };
  }
}

/**
 * Aviso al vecino/cliente cuando un técnico (app o web) actualiza el pedido originado por WhatsApp.
 * Solo debe llamarse si el pedido tiene origen WhatsApp y teléfono válido (lo decide el caller).
 */
export async function notifyPedidoClienteActualizacionWhatsAppSafe({
  tenantId,
  numeroPedido,
  nombreEntidad,
  telefonoContactoRaw,
  pedidoId,
  tipo,
  avancePct = null,
  trabajoRealizadoSnippet = null,
}) {
  const phone = String(telefonoContactoRaw || "").replace(/\D/g, "");
  if (!phone || phone.length < 8) {
    return { sent: false, skipped: true, reason: "no_phone" };
  }

  const np = String(numeroPedido || "").trim() || `#${pedidoId}`;
  const ent = String(nombreEntidad || "nuestro equipo").trim();
  let body;
  if (tipo === "en_ejecucion") {
    body =
      `*${ent}* informa: su reclamo *#${np}* está ahora *en ejecución*. El equipo técnico está trabajando en su pedido.`;
  } else if (tipo === "avance") {
    const pct =
      avancePct != null && Number.isFinite(Number(avancePct)) ? ` Avance: *${Math.round(Number(avancePct))}%*.` : "";
    const extra = trabajoRealizadoSnippet
      ? `\n\n${String(trabajoRealizadoSnippet).trim().slice(0, 280)}`
      : "";
    body = `*${ent}* — Actualización de su reclamo *#${np}*:${pct}${extra}`;
  } else {
    return { sent: false, skipped: true, reason: "unknown_tipo" };
  }

  try {
    const r = await sendTenantWhatsAppText({
      tenantId,
      toDigits: phone,
      bodyText: body,
      pedidoId,
      logContext: `cliente_pedido_${tipo}`,
    });
    if (!r.ok) {
      console.error("[whatsapp-service] aviso cliente pedido: envío falló", {
        pedidoId,
        tenantId,
        tipo,
        detail: r.error || r.graph,
      });
    }
    return { sent: !!r.ok, skipped: false, ok: r.ok };
  } catch (e) {
    console.error("[whatsapp-service] aviso cliente pedido: excepción", e.message);
    return { sent: false, skipped: false, error: e.message };
  }
}

/**
 * Aviso al cliente cuando el reclamo se deriva a una empresa externa.
 * No bloquea el flujo principal si falla.
 */
export async function notifyPedidoDerivacionClienteWhatsAppSafe({
  tenantId,
  numeroPedido,
  nombreEntidad,
  telefonoContactoRaw,
  pedidoId,
  destinoNombre,
  /** Dígitos del WhatsApp del tercero (config. derivación); solo para enlace wa.me opcional al vecino. */
  terceroWhatsAppDigits,
}) {
  const phone = String(telefonoContactoRaw || "").replace(/\D/g, "");
  if (!phone || phone.length < 8) {
    return { sent: false, skipped: true, reason: "no_phone" };
  }
  const np = String(numeroPedido || "").trim() || `#${pedidoId}`;
  const ent = String(nombreEntidad || "la entidad").trim();
  const dest = String(destinoNombre || "la empresa correspondiente").trim();
  const td = String(terceroWhatsAppDigits || "").replace(/\D/g, "");
  const waLine =
    td.length >= 8 && td.length <= 22
      ? `\n\nEnlace directo a WhatsApp de *${dest}*:\nhttps://wa.me/${td}`
      : "";
  const body =
    `*${ent}* informa: su reclamo *#${np}* fue *derivado* a *${dest}* para su atención.\n\n` +
    `Podés comunicarte con *${dest}* para coordinar o consultas sobre tu reclamo.${waLine}\n\n` +
    `El caso queda registrado y en seguimiento.`;
  try {
    const r = await sendTenantWhatsAppText({
      tenantId,
      toDigits: phone,
      bodyText: body,
      pedidoId,
      logContext: "cliente_pedido_derivado_externo",
    });
    if (!r.ok) {
      console.error("[whatsapp-service] aviso derivación cliente: envío falló", {
        pedidoId,
        tenantId,
        detail: r.error || r.graph,
      });
    }
    return { sent: !!r.ok, skipped: false, ok: r.ok };
  } catch (e) {
    console.error("[whatsapp-service] aviso derivación cliente: excepción", e.message);
    return { sent: false, skipped: false, error: e.message };
  }
}

