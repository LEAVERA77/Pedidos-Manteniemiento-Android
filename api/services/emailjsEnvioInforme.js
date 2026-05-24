/**
 * EmailJS solo para informes (plantilla distinta a recuperación de clave).
 * made by leavera77
 */

import { resolveEmailjsConfig, enviarCorreoEmailjsServidor } from "./emailjsEnvioServidor.js";

/**
 * @param {Record<string, unknown>|null|undefined} override
 */
export function resolveEmailjsConfigInforme(override) {
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
  const templateIdInforme = pick(
    o.templateIdInforme,
    o.template_id_informe,
    o.templateId,
    o.template_id,
    process.env.EMAILJS_TEMPLATE_ID_INFORME
  );
  const templateIdReset = pick(
    o.templateIdReset,
    process.env.EMAILJS_TEMPLATE_ID
  );
  const privateKey = pick(o.privateKey, o.private_key, process.env.EMAILJS_PRIVATE_KEY);

  if (templateIdInforme && templateIdReset && templateIdInforme === templateIdReset) {
    return {
      publicKey: "",
      serviceId: "",
      templateId: "",
      privateKey: "",
      errorPlantilla:
        "El Template ID de informes no puede ser el mismo que el de recuperación de clave. Duplicá la plantilla en EmailJS (solo {{email_subject}} y {{email_body}}).",
    };
  }

  return { publicKey, serviceId, templateId: templateIdInforme, privateKey, errorPlantilla: "" };
}

export function emailjsInformeConfigurado(override) {
  const c = resolveEmailjsConfigInforme(override);
  return !!(c.publicKey && c.serviceId && c.templateId && !c.errorPlantilla);
}

/**
 * @param {Record<string, string>} templateParams
 * @param {Record<string, unknown>|null|undefined} [override]
 */
export async function enviarCorreoInformeEmailjs(templateParams, override) {
  const c = resolveEmailjsConfigInforme(override);
  if (c.errorPlantilla) throw new Error(c.errorPlantilla);
  if (!c.publicKey || !c.serviceId || !c.templateId) {
    throw new Error(
      "Falta plantilla de informes en EmailJS. Configurá EMAILJS_TEMPLATE_ID_INFORME en Render o guardá el Template ID en Admin → Empresa → Informes."
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

/** @deprecated usar resolveEmailjsConfigInforme */
export { resolveEmailjsConfig };
