/**
 * Plantilla EmailJS unificada: informes + recuperación de clave vía {{email_subject}} / {{email_body}}.
 * Copiá PLANTILLA_EMAILJS_SUBJECT y PLANTILLA_EMAILJS_BODY en EmailJS → Email Templates.
 * made by leavera77
 */

/** Asunto en EmailJS: Settings → Subject → pegar esto */
export const PLANTILLA_EMAILJS_SUBJECT = '{{email_subject}}';

/** Cuerpo en EmailJS: Content → pegar esto (To email = {{to_email}}) */
export const PLANTILLA_EMAILJS_BODY = `{{{email_body}}}`;

/** @param {Record<string, unknown>|undefined} cfg */
export function templateIdEmailInforme(cfg) {
    const c = cfg || {};
    return String(c.templateIdInforme || c.templateId || '').trim();
}

/**
 * @param {Record<string, unknown>|undefined} cfg
 */
export function templateIdEmailReset(cfg) {
    const c = cfg || {};
    return String(c.templateIdReset || c.templateId || '').trim();
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
        token: '—',
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
        `Saludos,`,
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
