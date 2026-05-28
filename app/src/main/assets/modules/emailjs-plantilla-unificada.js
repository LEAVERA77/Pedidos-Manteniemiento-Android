/**
 * Parámetros EmailJS — recuperación de clave.
 * made by leavera77
 */

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
        message: cuerpo,
    };
}

/** @param {Record<string, unknown>|undefined} cfg */
export function templateIdEmailReset(cfg) {
    const c = cfg || {};
    return String(c.templateIdReset || c.templateId || '').trim();
}
