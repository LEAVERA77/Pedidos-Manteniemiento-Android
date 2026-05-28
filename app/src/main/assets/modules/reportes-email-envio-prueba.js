/**
 * Envío de informe de prueba (Admin → Informes por email).
 * Usa plantilla EmailJS de informe ({{email_body}}), no la de código de acceso.
 * made by leavera77
 */

import {
    paramsEmailInforme,
    credencialesEmailjsInforme,
    plantillaInformeEmailjsConfigurada,
} from './emailjs-plantilla-unificada.js';

/** @param {unknown} e */
export function mensajeErrorInformeEmail(e) {
    if (!e) return 'Error desconocido';
    if (typeof e === 'string') return e;
    const o = /** @type {{ text?: string, message?: string }} */ (e);
    if (o.text) return String(o.text);
    if (o.message) return String(o.message);
    try {
        return JSON.stringify(e);
    } catch (_) {
        return String(e);
    }
}

/**
 * @param {(path: string) => string} apiUrl
 * @param {string} tok
 * @param {{ frecuencia: string }} body
 */
export async function obtenerResumenInformeEmail(apiUrl, tok, body) {
    const r = await fetch(apiUrl('/api/reportes-programados/resumen'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ frecuencia: body.frecuencia || 'diario' }),
    });
    const resumen = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(resumen.error || resumen.mensaje || `Error al armar informe (${r.status})`);
    return resumen;
}

/**
 * @param {(path: string) => string} apiUrl
 * @param {string} tok
 */
export async function obtenerSetupPlantillaInforme(apiUrl, tok) {
    const r = await fetch(apiUrl('/api/reportes-programados/emailjs-informe-setup'), {
        headers: { Authorization: `Bearer ${tok}` },
    });
    return r.json().catch(() => ({}));
}

function credencialesInformeCliente(setup) {
    return credencialesEmailjsInforme(window.APP_CONFIG?.emailjs, setup || null);
}

/**
 * @param {string} destino
 * @param {Record<string, unknown>} resumen
 * @param {{ templateIdInforme?: string }|null} setup
 */
async function enviarInformeDesdeNavegador(destino, resumen, setup) {
    const val = plantillaInformeEmailjsConfigurada(window.APP_CONFIG?.emailjs);
    if (!val.ok) throw new Error(val.error);

    const ej = credencialesInformeCliente(setup);
    if (!ej?.templateId) {
        throw new Error(
            'Falta templateIdInforme en config.json (plantilla con {{email_subject}} y {{email_body}}, no la de código de acceso). Ver docs/EMAILJS_INFORME_PERIODICO.md'
        );
    }
    if (!window.emailjs || typeof window.emailjs.send !== 'function') {
        throw new Error('EmailJS no cargado; recargá la página');
    }
    const cuerpo = String(resumen.text || resumen.emailjsParams?.informe_cuerpo || resumen.emailjsParams?.email_body || '').trim();
    if (!cuerpo) throw new Error('El informe está vacío; revisá que haya pedidos en el período');

    const params = paramsEmailInforme({
        toEmail: destino,
        toName: resumen.emailjsParams?.to_name || 'Administrador',
        subject: resumen.subject || resumen.emailjsParams?.informe_asunto,
        body: cuerpo,
        nombreEmpresa: resumen.nombreEmpresa || resumen.emailjsParams?.app_name,
    });
    await window.emailjs.send(ej.serviceId, ej.templateId, params, ej.publicKey);
}

function payloadEmailjsInformeParaApi(setup) {
    const ej = credencialesInformeCliente(setup);
    if (!ej) return undefined;
    return {
        publicKey: ej.publicKey,
        serviceId: ej.serviceId,
        templateId: ej.templateId,
        templateIdInforme: ej.templateId,
    };
}

/**
 * @param {(path: string) => string} apiUrl
 * @param {string} tok
 * @param {{ email: string, frecuencia: string }} body
 * @param {{ templateIdInforme?: string }|null} setup
 */
async function enviarInformeDesdeApi(apiUrl, tok, body, setup) {
    const emailjs = payloadEmailjsInformeParaApi(setup);
    const r = await fetch(apiUrl('/api/reportes-programados/ejecutar-ahora'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: body.email,
            frecuencia: body.frecuencia,
            emailjs: emailjs || undefined,
        }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        const err = new Error(j.mensaje || j.error || j.detail || `Error (${r.status})`);
        /** @type {Record<string, unknown>} */ (err).usarCliente = !!j.usar_cliente;
        /** @type {Record<string, unknown>} */ (err).payload = j;
        throw err;
    }
    return j.mensaje || `Informe enviado a ${body.email}`;
}

/**
 * Vista previa del texto que irá en el mail.
 * @param {Record<string, unknown>} resumen
 */
export function htmlVistaPreviaInforme(resumen) {
    const txt = String(resumen.text || '').trim();
    if (!txt) return '';
    const esc = (s) =>
        String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    return `<div id="gn-reporte-preview" style="margin-top:.65rem;padding:.55rem .65rem;border:1px dashed var(--bo);border-radius:.45rem;background:var(--bg);max-height:200px;overflow-y:auto;font-size:.75rem;line-height:1.45;color:var(--td);white-space:pre-wrap">${esc(txt)}</div>`;
}

/**
 * @param {{
 *   apiUrl: (p: string) => string;
 *   getApiToken: () => string|null|undefined;
 *   guardarConfig?: (tok: string, body: { email: string, frecuencia: string }) => Promise<void>;
 *   registrarEnvio?: (tok: string) => Promise<void>;
 * }} opts
 * @param {{ email: string, frecuencia: string }} body
 */
export async function enviarInformePruebaAhora(opts, body) {
    const tok = opts.getApiToken();
    if (!tok) throw new Error('Iniciá sesión con API');

    const destino = String(body.email || '').trim();
    if (!destino) throw new Error('Completá el email destino');

    if (opts.guardarConfig) {
        try {
            await opts.guardarConfig(tok, body);
        } catch (e) {
            const warn = String(/** @type {Error} */ (e).message || e);
            if (/Completá el email/i.test(warn)) throw e;
            if (!/NEON_fcm_reportes_sla/i.test(warn)) console.warn('[reportes-email]', warn);
        }
    }

    const setup = await obtenerSetupPlantillaInforme(opts.apiUrl, tok);
    const resumen = await obtenerResumenInformeEmail(opts.apiUrl, tok, body);

    let okMsg;
    try {
        okMsg = await enviarInformeDesdeApi(opts.apiUrl, tok, body, setup);
    } catch (apiErr) {
        const usarCliente = !!/** @type {Record<string, unknown>} */ (apiErr).usarCliente;
        const val = plantillaInformeEmailjsConfigurada(window.APP_CONFIG?.emailjs);
        if (!usarCliente && !val.ok) throw apiErr;
        if (!val.ok) {
            throw new Error(
                `${apiErr.message || 'No se pudo enviar desde el servidor'}. ${val.error}`
            );
        }
        await enviarInformeDesdeNavegador(destino, resumen, setup);
        if (opts.registrarEnvio) await opts.registrarEnvio(tok).catch(() => {});
        okMsg = `Informe enviado a ${destino} (desde el navegador)`;
    }

    return { okMsg, resumen };
}
