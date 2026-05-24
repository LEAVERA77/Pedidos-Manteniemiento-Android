/**
 * Envío de correo desde la API (Render) vía EmailJS REST.
 * Mismas variables que GitHub Pages: EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID.
 * Opcional: EMAILJS_TEMPLATE_ID_INFORME, EMAILJS_PRIVATE_KEY (recomendado en EmailJS → Security).
 * made by leavera77
 */

/**
 * @returns {boolean}
 */
export function emailjsServidorConfigurado() {
  const pk = String(process.env.EMAILJS_PUBLIC_KEY || "").trim();
  const sid = String(process.env.EMAILJS_SERVICE_ID || "").trim();
  const tid = String(
    process.env.EMAILJS_TEMPLATE_ID_INFORME || process.env.EMAILJS_TEMPLATE_ID || ""
  ).trim();
  return !!(pk && sid && tid);
}

/**
 * @param {Record<string, string>} templateParams
 */
export async function enviarCorreoEmailjsServidor(templateParams) {
  if (!emailjsServidorConfigurado()) {
    throw new Error(
      "EmailJS no configurado (EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID en Render)"
    );
  }
  const publicKey = String(process.env.EMAILJS_PUBLIC_KEY).trim();
  const serviceId = String(process.env.EMAILJS_SERVICE_ID).trim();
  const templateId = String(
    process.env.EMAILJS_TEMPLATE_ID_INFORME || process.env.EMAILJS_TEMPLATE_ID
  ).trim();
  const privateKey = String(process.env.EMAILJS_PRIVATE_KEY || "").trim();

  /** @type {Record<string, unknown>} */
  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: templateParams,
  };
  if (privateKey) payload.accessToken = privateKey;

  const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.text();
  if (!r.ok) {
    const hint =
      r.status === 403
        ? " — En EmailJS: Account → Security → activá «Allow API requests for non-browser applications»."
        : "";
    throw new Error((body || `EmailJS HTTP ${r.status}`) + hint);
  }
  return body;
}
