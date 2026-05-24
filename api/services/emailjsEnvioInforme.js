/**
 * EmailJS informes — Public Key + Service + Template (Private Key opcional).
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
  const templateId = await resolveGestorNovaInformeTemplateId(tenantId, o);

  return { publicKey, serviceId, templateId, privateKey, errorPlantilla: "" };
}

/**
 * @param {Record<string, unknown>|null|undefined} override
 * @param {number} [tenantId]
 */
export async function emailjsInformeConfigurado(override, tenantId) {
  const c = await resolveEmailjsConfigInforme(override, tenantId);
  return !!(c.publicKey && c.serviceId && c.templateId);
}

/**
 * @param {Record<string, string>} templateParams
 * @param {Record<string, unknown>|null|undefined} [override]
 * @param {number} [tenantId]
 */
export async function enviarCorreoInformeEmailjs(templateParams, override, tenantId) {
  const c = await resolveEmailjsConfigInforme(override, tenantId);
  if (!c.publicKey || !c.serviceId || !c.templateId) {
    throw new Error(
      "EmailJS incompleto en el servidor. Agregá en Render EMAILJS_SERVICE_ID y EMAILJS_TEMPLATE_ID (mismos que GitHub) o enviá el informe desde la web admin."
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
