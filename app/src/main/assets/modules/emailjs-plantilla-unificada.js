/**
 * EmailJS: plantilla de INFORMES (no usar la de recuperación de clave).
 * made by leavera77
 */

/** Asunto en EmailJS → Subject */
export const PLANTILLA_EMAILJS_SUBJECT = '{{email_subject}}';

/** Cuerpo en EmailJS → Content (To = {{to_email}}) */
export const PLANTILLA_EMAILJS_BODY = '{{email_body}}';

export const PLANTILLA_EMAILJS_COPIAR = `=== EmailJS: plantilla SOLO para informes ===
1. Email Templates → Duplicate (o Create new)
2. To email: {{to_email}}
3. Subject: {{email_subject}}
4. Content (borrá todo el texto de "código de acceso"):

{{email_body}}

5. Save → copiá el Template ID en el campo "Template ID informes" del panel.
`;

/** @param {Record<string, unknown>|undefined} cfg @param {Record<string, unknown>|undefined} [stored] */
export function templateIdEmailInforme(cfg, stored) {
    const s = stored || {};
    const c = cfg || {};
    return String(
        s.templateIdInforme || s.template_id_informe || c.templateIdInforme || ''
    ).trim();
}

/** @param {Record<string, unknown>|undefined} cfg */
export function templateIdEmailReset(cfg) {
    const c = cfg || {};
    return String(c.templateIdReset || c.templateId || '').trim();
}

/** Plantilla de informe lista (ID propio, distinto al de reset). */
export function plantillaInformeConfigurada(cfg, stored) {
    const informe = templateIdEmailInforme(cfg, stored);
    if (!informe) return false;
    const reset = templateIdEmailReset(cfg);
    if (reset && informe === reset) return false;
    return true;
}

/**
 * @param {{ toEmail: string, toName?: string, subject: string, body: string, nombreEmpresa?: string }} p
 */
export function paramsEmailInforme({ toEmail, toName, subject, body, nombreEmpresa }) {
    const cuerpo = String(body || '').trim();
    const asunto = String(subject || 'Informe operativo | GestorNova').trim();
    return {
        to_email: toEmail,
        to_name: toName || 'Administrador',
        email_subject: asunto,
        email_body: cuerpo,
        informe_asunto: asunto,
        informe_cuerpo: cuerpo,
        message: cuerpo,
        subject: asunto,
        app_name: nombreEmpresa || 'GestorNova',
        token: '',
    };
}

/**
 * @param {{ toEmail: string, toName?: string, token: string, appName?: string }} p
 */
export function paramsEmailReset({ toEmail, toName, token, appName }) {
    const app = appName || 'GestorNova';
    const cuerpo = [
        `Hola ${toName || 'Administrador'},`,
        '',
        `Recibimos una solicitud para restablecer la contraseña de ${app}.`,
        '',
        `Tu código de verificación es: ${token}`,
        '',
        'El código vence en aproximadamente 30 minutos.',
        '',
        'Si no solicitaste este cambio, ignorá este mensaje.',
        '',
        'Saludos,',
        `Equipo de ${app}`,
    ].join('\n');
    return {
        to_email: toEmail,
        to_name: toName || 'Administrador',
        email_subject: `${app} — código para restablecer contraseña`,
        email_body: cuerpo,
        token,
        app_name: app,
        informe_cuerpo: '',
        message: cuerpo,
    };
}

/** Credenciales EmailJS para envío de informe (exige templateIdInforme). */
export function credencialesEmailjsInforme(cfg, stored, templateIdManual) {
    const c = cfg || {};
    const templateIdInforme =
        String(templateIdManual || '').trim() || templateIdEmailInforme(c, stored);
    if (!c.publicKey || !c.serviceId || !templateIdInforme) return null;
    if (!plantillaInformeConfigurada({ ...c, templateIdInforme }, { templateIdInforme })) {
        return null;
    }
    return {
        publicKey: c.publicKey,
        serviceId: c.serviceId,
        templateId: templateIdInforme,
        templateIdInforme,
    };
}
