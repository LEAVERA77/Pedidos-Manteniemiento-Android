/**
 * WhatsApp Cloud API — envío genérico multitenant.
 * Credenciales por tenant: clientes.configuracion.meta_access_token + meta_phone_id
 * (Phone number ID de Meta, mismo que usás en el webhook).
 * Si no vienen en JSON, se usan META_ACCESS_TOKEN y META_PHONE_NUMBER_ID del entorno.
 */

import { query } from "../db/neon.js";
import { sendWhatsAppTextWithCredentials } from "./metaWhatsapp.js";
import { logWhatsappMensajeEnviado } from "./whatsappNotificacionesLog.js";

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

  const r = await sendWhatsAppTextWithCredentials(to, body, { accessToken, phoneNumberId });
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
    `GestorNova informa: Su reclamo *#${np}* ha sido finalizado por el equipo técnico de *${ent}*. Gracias por su reporte.`;

  try {
    const r = await sendTenantWhatsAppText({
      tenantId,
      toDigits: phone,
      bodyText: body,
      pedidoId,
      logContext: "cierre_pedido",
    });
    if (!r.ok) {
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

