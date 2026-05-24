/**
 * Parámetros EmailJS — informes y recuperación de clave.
 * made by leavera77
 */

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

/** @param {Record<string, unknown>|undefined} cfg */
export function templateIdEmailReset(cfg) {
    const c = cfg || {};
    return String(c.templateIdReset || c.templateId || '').trim();
}

/** Credenciales desde config.json (Pages): publicKey + serviceId + templateId. */
export function credencialesEmailjsDesdeConfig(cfg) {
    const c = cfg || {};
    const publicKey = String(c.publicKey || '').trim();
    const serviceId = String(c.serviceId || '').trim();
    const templateId = String(c.templateIdInforme || c.templateId || '').trim();
    if (!publicKey || !serviceId || !templateId) return null;
    return {
        publicKey,
        serviceId,
        templateId,
        templateIdInforme: templateId,
    };
}

/** @param {Record<string, unknown>|undefined} cfg @param {{ templateIdInforme?: string }|null} [setup] */
export function credencialesEmailjsInforme(cfg, setup) {
    const merged = {
        ...(cfg || {}),
        templateIdInforme: setup?.templateIdInforme || cfg?.templateIdInforme,
        templateId: setup?.templateIdInforme || cfg?.templateIdInforme || cfg?.templateId,
    };
    return credencialesEmailjsDesdeConfig(merged);
}
