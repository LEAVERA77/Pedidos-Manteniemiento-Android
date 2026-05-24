/**
 * Plantilla GestorNova para informes — solo requiere Public Key + Service + Template (como Pages).
 * made by leavera77
 */

import { query } from "../db/neon.js";

let cacheTemplateId = "";

function pick(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * @param {Record<string, unknown>|null|undefined} [override]
 * @param {number} [tenantId]
 */
export async function resolveGestorNovaInformeTemplateId(tenantId, override) {
  const o = override && typeof override === "object" ? override : {};
  if (cacheTemplateId && !override) return cacheTemplateId;

  const fromOverride = pick(o.templateIdInforme, o.template_id_informe, o.templateId, o.template_id);
  if (fromOverride) {
    cacheTemplateId = fromOverride;
    return cacheTemplateId;
  }

  const fromEnv = pick(
    process.env.EMAILJS_TEMPLATE_ID_INFORME,
    process.env.EMAILJS_TEMPLATE_ID
  );
  if (fromEnv) {
    cacheTemplateId = fromEnv;
    return cacheTemplateId;
  }

  if (tenantId) {
    try {
      const r = await query(
        `SELECT emailjs_config->>'templateIdInforme' AS ti, emailjs_config->>'templateId' AS t
         FROM tenant_reporte_email_config WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      const tid = pick(r.rows?.[0]?.ti, r.rows?.[0]?.t);
      if (tid) {
        cacheTemplateId = tid;
        return cacheTemplateId;
      }
    } catch {
      /* ignore */
    }
  }

  return "";
}

/**
 * @param {number} [tenantId]
 * @param {Record<string, unknown>|null|undefined} [override]
 */
export async function ensureGestorNovaInformeTemplate(tenantId, override) {
  const o = override && typeof override === "object" ? override : {};
  const publicKey = pick(
    o.publicKey,
    o.public_key,
    process.env.EMAILJS_PUBLIC_KEY,
    process.env.EMAILJS_USER_ID
  );
  const serviceId = pick(o.serviceId, o.service_id, process.env.EMAILJS_SERVICE_ID);
  const templateIdInforme = await resolveGestorNovaInformeTemplateId(tenantId, o);

  if (!publicKey) {
    return {
      ok: false,
      templateIdInforme: "",
      mensaje: "Falta EMAILJS_PUBLIC_KEY (Render o config.json).",
      usar_navegador: true,
    };
  }

  if (!serviceId || !templateIdInforme) {
    return {
      ok: true,
      templateIdInforme: templateIdInforme || "",
      publicKey,
      serviceId: serviceId || "",
      mensaje:
        "En Render solo está la Public Key: usá «Enviar ahora» desde la web admin (config.json tiene Service y Template) o agregá EMAILJS_SERVICE_ID y EMAILJS_TEMPLATE_ID en Render (mismos valores que GitHub).",
      usar_navegador: true,
      solo_public_key_render: !serviceId || !templateIdInforme,
    };
  }

  return {
    ok: true,
    templateIdInforme,
    publicKey,
    serviceId,
    mensaje: "EmailJS listo para informes",
    usar_navegador: false,
  };
}
