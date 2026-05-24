/**
 * EmailJS solo para informes (plantilla GestorNova integrada).
 * made by leavera77
 */

import { enviarCorreoEmailjsServidor } from "./emailjsEnvioServidor.js";
import { resolveGestorNovaInformeTemplateId } from "./emailjsPlantillaInformeGestorNova.js";

/**
 * @param {Record<string, unknown>|null|undefined} override
 * @param {number} [tenantId]
 */
export async function resolveEmailjsConfigInforme(override, tenantId) {
  const o = override && typeof override === "object" ? override : {};
  const pick = (...vals) => {
    for (const v of vals) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return "";
  };
  const publicKey = pick(
    o.publicKey,
    o.public_key,
    process.env.EMAILJS_PUBLIC_KEY,
    process.env.EMAILJS_USER_ID
  );
  const serviceId = pick(o.serviceId, o.service_id, process.env.EMAILJS_SERVICE_ID);
  const privateKey = pick(o.privateKey, o.private_key, process.env.EMAILJS_PRIVATE_KEY);

  let templateId = pick(o.templateIdInforme, o.template_id_informe);
  if (!templateId) templateId = await resolveGestorNovaInformeTemplateId(tenantId);

  const templateIdReset = pick(o.templateIdReset, process.env.EMAILJS_TEMPLATE_ID);

  if (templateId && templateIdReset && templateId === templateIdReset) {
    return {
      publicKey: "",
      serviceId: "",
      templateId: "",
      privateKey: "",
      errorPlantilla:
        "La plantilla de informes coincide con la de recuperación de clave. Configurá EMAILJS_TEMPLATE_ID_INFORME distinto o EMAILJS_PRIVATE_KEY en Render.",
    };
  }

  return { publicKey, serviceId, templateId, privateKey, errorPlantilla: "" };
}

/**
 * @param {Record<string, unknown>|null|undefined} override
 * @param {number} [tenantId]
 */
export async function emailjsInformeConfigurado(override, tenantId) {
  const c = await resolveEmailjsConfigInforme(override, tenantId);
  return !!(c.publicKey && c.serviceId && c.templateId && !c.errorPlantilla);
}

/**
 * @param {Record<string, string>} templateParams
 * @param {Record<string, unknown>|null|undefined} [override]
 * @param {number} [tenantId]
 */
export async function enviarCorreoInformeEmailjs(templateParams, override, tenantId) {
  const c = await resolveEmailjsConfigInforme(override, tenantId);
  if (c.errorPlantilla) throw new Error(c.errorPlantilla);
  if (!c.publicKey || !c.serviceId || !c.templateId) {
    throw new Error(
      "Plantilla de informes no disponible. En Render: EMAILJS_TEMPLATE_ID_INFORME o EMAILJS_PRIVATE_KEY (Account → Security → API no navegador)."
    );
  }
  return enviarCorreoEmailjsServidor(templateParams, {
    publicKey: c.publicKey,
    serviceId: c.serviceId,
    templateId: c.templateId,
    templateIdInforme: c.templateId,
    privateKey: c.privateKey,
  });
}
