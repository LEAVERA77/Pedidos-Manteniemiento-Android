/**
 * Envío de correo desde la API (Render) vía EmailJS REST.
 * Origen de credenciales (en orden): override (body/BD) → variables de entorno.
 * made by leavera77
 */

/**
 * @param {Record<string, unknown>|null|undefined} override
 * @returns {{ publicKey: string, serviceId: string, templateId: string, privateKey: string }}
 */
export function resolveEmailjsConfig(override) {
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
    o.user_id,
    o.userId,
    process.env.EMAILJS_PUBLIC_KEY,
    process.env.EMAILJS_USER_ID
  );
  const serviceId = pick(o.serviceId, o.service_id, process.env.EMAILJS_SERVICE_ID);
  const templateId = pick(
    o.templateId,
    o.template_id,
    o.templateIdInforme,
    process.env.EMAILJS_TEMPLATE_ID_INFORME,
    process.env.EMAILJS_TEMPLATE_ID
  );
  const privateKey = pick(
    o.privateKey,
    o.private_key,
    o.accessToken,
    process.env.EMAILJS_PRIVATE_KEY
  );
  return { publicKey, serviceId, templateId, privateKey };
}

/**
 * @param {Record<string, unknown>|null|undefined} [override]
 * @returns {boolean}
 */
export function emailjsServidorConfigurado(override) {
  const c = resolveEmailjsConfig(override);
  return !!(c.publicKey && c.serviceId && c.templateId);
}

/**
 * @param {Record<string, string>} templateParams
 * @param {Record<string, unknown>|null|undefined} [override]
 */
export async function enviarCorreoEmailjsServidor(templateParams, override) {
  const c = resolveEmailjsConfig(override);
  if (!c.publicKey || !c.serviceId || !c.templateId) {
    throw new Error(
      "EmailJS no configurado (publicKey, serviceId, templateId en Render, en el body o guardado en admin)"
    );
  }

  /** @type {Record<string, unknown>} */
  const payload = {
    service_id: c.serviceId,
    template_id: c.templateId,
    user_id: c.publicKey,
    template_params: templateParams,
  };
  if (c.privateKey) payload.accessToken = c.privateKey;

  const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.text();
  if (!r.ok) {
    const hint =
      r.status === 403
        ? " — En EmailJS: Account → Security → activá «Allow API requests for non-browser applications», o usá «Enviar ahora» desde la web (envío en el navegador)."
        : "";
    throw new Error((body || `EmailJS HTTP ${r.status}`) + hint);
  }
  return body;
}
