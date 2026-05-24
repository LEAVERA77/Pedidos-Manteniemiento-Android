/**
 * Admin: informes periódicos por email (config + disparo manual).
 * «Enviar ahora» usa EmailJS del config.json en el navegador (como recuperación de clave).
 * made by leavera77
 */

export function htmlReportesEmailAdminBlock() {
    return `<div id="gn-reportes-email-block" style="margin-top:1rem;padding:.75rem;border:1px solid var(--bo);border-radius:.5rem">
<h4 style="margin:0 0 .5rem"><i class="fas fa-envelope"></i> Informes por email</h4>
<p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem">Informe operativo <strong>diario, semanal o mensual</strong> con resumen de pedidos y análisis breve (IA si hay <code style="font-size:.7rem">GROQ_API_KEY</code> en Render). En EmailJS conviene una plantilla con <code style="font-size:.7rem">{{informe_cuerpo}}</code> — ver <code style="font-size:.7rem">docs/EMAILJS_INFORME_PERIODICO.md</code>.</p>
<label style="font-size:.85rem;display:block;margin-bottom:.35rem">Email destino</label>
<input type="email" id="gn-reporte-email" placeholder="admin@empresa.com" style="width:100%;max-width:320px;padding:.4rem;border:1px solid var(--bo);border-radius:.4rem;margin-bottom:.5rem">
<label style="font-size:.85rem;display:block;margin-bottom:.35rem">Frecuencia</label>
<select id="gn-reporte-frecuencia" style="padding:.35rem;border:1px solid var(--bo);border-radius:.4rem;margin-bottom:.5rem">
  <option value="diario">Diario (24 h)</option>
  <option value="semanal">Semanal (7 días)</option>
  <option value="mensual">Mensual (30 días)</option>
  <option value="off">Desactivado</option>
</select>
<div style="display:flex;gap:.4rem;flex-wrap:wrap">
  <button type="button" class="btn-sm primary" id="gn-reporte-guardar">Guardar</button>
  <button type="button" class="btn-sm" id="gn-reporte-enviar-ahora">Enviar ahora (prueba)</button>
</div>
<span id="gn-reporte-msg" style="font-size:.75rem;color:var(--tl);display:block;margin-top:.35rem"></span>
</div>`;
}

function leerFormReporteEmail() {
    return {
        email: document.getElementById('gn-reporte-email')?.value?.trim() || '',
        frecuencia: document.getElementById('gn-reporte-frecuencia')?.value || 'off',
    };
}

function emailjsDesdeAppConfig() {
    const cfg = window.APP_CONFIG?.emailjs;
    if (!cfg?.publicKey || !cfg?.serviceId || !cfg?.templateId) return null;
    return {
        publicKey: cfg.publicKey,
        serviceId: cfg.serviceId,
        templateId: cfg.templateId,
    };
}

function mensajeReporteUi(text, esError = false) {
    const msgEl = document.getElementById('gn-reporte-msg');
    if (msgEl) {
        msgEl.textContent = text || '';
        msgEl.style.color = esError ? 'var(--re)' : 'var(--tl)';
    }
}

/** @param {unknown} e */
function mensajeErrorInforme(e) {
    if (!e) return 'Error desconocido';
    if (typeof e === 'string') return e;
    const o = /** @type {{ text?: string, status?: number, message?: string }} */ (e);
    if (o.text) return String(o.text);
    if (o.message) return String(o.message);
    try {
        return JSON.stringify(e);
    } catch (_) {
        return String(e);
    }
}

/**
 * EmailJS browser v3 — params de informe desde la API.
 * @param {{ serviceId: string, templateId: string, publicKey: string }} ej
 * @param {string} destino
 * @param {Record<string, string>} resumen
 */
async function enviarEmailjsInforme(ej, destino, resumen) {
    const params = {
        ...(resumen.emailjsParams || {}),
        to_email: destino,
        to_name: resumen.emailjsParams?.to_name || 'Administrador',
        message: resumen.text || resumen.emailjsParams?.informe_cuerpo || '',
        subject: resumen.subject || resumen.emailjsParams?.informe_asunto || 'Informe operativo | GestorNova',
        informe_cuerpo: resumen.text || resumen.emailjsParams?.informe_cuerpo || '',
        informe_asunto: resumen.subject || resumen.emailjsParams?.informe_asunto || '',
        app_name: resumen.nombreEmpresa || resumen.emailjsParams?.app_name || 'GestorNova',
        token: '—',
    };
    await window.emailjs.send(ej.serviceId, ej.templateId, params, ej.publicKey);
}

/**
 * @param {(path: string) => string} apiUrl
 * @param {string} tok
 * @param {{ frecuencia: string }} body
 */
async function obtenerResumenInforme(apiUrl, tok, body) {
    const r = await fetch(apiUrl('/api/reportes-programados/resumen'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ frecuencia: body.frecuencia || 'diario' }),
    });
    const resumen = await r.json().catch(() => ({}));
    if (r.ok && resumen.text) return resumen;
    if (r.status === 404 || r.status === 405) {
        const periodo =
            body.frecuencia === 'mensual'
                ? 'último mes'
                : body.frecuencia === 'semanal'
                  ? '7 días'
                  : '24 horas';
        return {
            text:
                `Informe de prueba GestorNova (${periodo})\n\n` +
                `Actualizá la API en Render para estadísticas y análisis automático.\n\n— GestorNova`,
            subject: 'Informe operativo de prueba | GestorNova',
            emailjsParams: {
                informe_asunto: 'Informe operativo de prueba | GestorNova',
                informe_cuerpo: `Informe de prueba (${periodo}). Actualizá Render.`,
            },
        };
    }
    throw new Error(resumen.error || resumen.mensaje || `Error al armar informe (${r.status})`);
}

/**
 * @param {{ apiUrl: (p: string) => string, getApiToken: () => string|null|undefined, toast: (m: string, t?: string) => void, esAdmin: boolean }} opts
 */
export function initAdminReportesEmailUI({ apiUrl, getApiToken, toast, esAdmin }) {
    if (!esAdmin) return;
    const block = document.getElementById('gn-reportes-email-block');
    if (!block) return;

    const guardarConfig = async (tok, bodyIn) => {
        const body = bodyIn || leerFormReporteEmail();
        if (!body.email) throw new Error('Completá el email destino');
        const emailjs = emailjsDesdeAppConfig();
        const r = await fetch(apiUrl('/api/reportes-programados/config'), {
            method: 'PUT',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(emailjs ? { ...body, emailjs } : body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || j.mensaje || `Error al guardar (${r.status})`);
        return j;
    };

    const enviarInformeDesdeNavegador = async (tok, body) => {
        const ej = emailjsDesdeAppConfig();
        if (!ej) {
            throw new Error('EmailJS no está en config.json (secretos GitHub Pages: EMAILJS_PUBLIC_KEY, etc.)');
        }
        if (!window.emailjs || typeof window.emailjs.send !== 'function') {
            throw new Error('Servicio de correo no cargado; recargá la página');
        }
        const resumen = await obtenerResumenInforme(apiUrl, tok, body);
        await enviarEmailjsInforme(ej, body.email, resumen);

        await fetch(apiUrl('/api/reportes-programados/registrar-envio'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        }).catch(() => {});

        return `Informe enviado a ${body.email} (EmailJS en el navegador)`;
    };

    const enviarInformeDesdeApi = async (tok, body) => {
        const emailjs = emailjsDesdeAppConfig();
        const r = await fetch(apiUrl('/api/reportes-programados/ejecutar-ahora'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(emailjs ? { ...body, emailjs } : body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            const err = new Error(j.mensaje || j.error || j.detail || `Error (${r.status})`);
            err.usarCliente = j.usar_cliente === true;
            throw err;
        }
        return j.mensaje || `Informe enviado a ${body.email}`;
    };

    const load = async () => {
        const tok = getApiToken();
        if (!tok) return;
        try {
            const r = await fetch(apiUrl('/api/reportes-programados/config'), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            const j = await r.json().catch(() => ({}));
            if (j.email) document.getElementById('gn-reporte-email').value = j.email;
            if (j.frecuencia) document.getElementById('gn-reporte-frecuencia').value = j.frecuencia;
            if (j.tabla_ok === false) {
                mensajeReporteUi('Falta tabla en Neon: docs/NEON_fcm_reportes_sla.sql', true);
            }
        } catch (_) {}
    };
    void load();

    document.getElementById('gn-reporte-guardar')?.addEventListener('click', async () => {
        const tok = getApiToken();
        if (!tok) return toast('Iniciá sesión con API', 'warning');
        try {
            await guardarConfig(tok);
            mensajeReporteUi('Configuración guardada');
            toast('Configuración guardada', 'success');
        } catch (e) {
            const m = e.message || 'Error';
            mensajeReporteUi(m, true);
            toast(m, 'error');
        }
    });

    document.getElementById('gn-reporte-enviar-ahora')?.addEventListener('click', async () => {
        const tok = getApiToken();
        if (!tok) return toast('Iniciá sesión con API', 'warning');
        const body = leerFormReporteEmail();
        if (!body.email) {
            mensajeReporteUi('Completá el email destino', true);
            return toast('Completá el email destino', 'warning');
        }
        const btn = document.getElementById('gn-reporte-enviar-ahora');
        if (btn) btn.disabled = true;
        mensajeReporteUi('Enviando…');
        try {
            try {
                await guardarConfig(tok, body);
            } catch (e) {
                const warn = String(e.message || e);
                if (/Completá el email/i.test(warn)) throw e;
                if (!/NEON_fcm_reportes_sla/i.test(warn)) {
                    console.warn('[reportes-email] guardar config:', warn);
                }
            }

            let okMsg;
            if (emailjsDesdeAppConfig()) {
                okMsg = await enviarInformeDesdeNavegador(tok, body);
            } else {
                try {
                    okMsg = await enviarInformeDesdeApi(tok, body);
                } catch (apiErr) {
                    if (apiErr.usarCliente) {
                        throw new Error(
                            'Sin EmailJS en config.json ni en Render. Configurá secretos de Pages o EMAILJS_* en Render.'
                        );
                    }
                    throw apiErr;
                }
            }

            mensajeReporteUi(okMsg);
            toast(okMsg, 'success');
        } catch (e) {
            const m = mensajeErrorInforme(e);
            mensajeReporteUi(m, true);
            toast(m, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}
