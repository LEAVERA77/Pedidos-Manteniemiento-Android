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

/** Credenciales informe desde config.json — solo templateIdInforme (no la de reset/acceso). */
export function credencialesEmailjsDesdeConfig(cfg) {
    return credencialesEmailjsInforme(cfg, null);
}

/**
 * Valida que exista plantilla de informe distinta de la de código de acceso.
 * @param {Record<string, unknown>|undefined} cfg
 */
export function plantillaInformeEmailjsConfigurada(cfg) {
    const c = cfg || {};
    const publicKey = String(c.publicKey || '').trim();
    const serviceId = String(c.serviceId || '').trim();
    const templateIdInforme = String(c.templateIdInforme || '').trim();
    const templateIdReset = String(c.templateIdReset || c.templateId || '').trim();
    if (!publicKey || !serviceId) {
        return {
            ok: false,
            error: 'Faltan publicKey o serviceId en config.json / secretos GitHub.',
        };
    }
    if (!templateIdInforme) {
        return {
            ok: false,
            error:
                'Falta templateIdInforme en config.json. Creá en EmailJS una plantilla con asunto {{email_subject}} y cuerpo {{email_body}} (no uses la de «código de acceso»). Ver docs/EMAILJS_INFORME_PERIODICO.md',
        };
    }
    if (templateIdReset && templateIdInforme === templateIdReset) {
        return {
            ok: false,
            error:
                'templateIdInforme no puede ser la misma plantilla que templateIdReset (código de acceso). Creá una plantilla nueva solo para informes.',
        };
    }
    return { ok: true, templateId: templateIdInforme };
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
