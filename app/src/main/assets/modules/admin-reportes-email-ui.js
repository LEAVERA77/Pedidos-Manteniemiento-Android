/**
 * Admin: informes periódicos por email (plantilla GestorNova automática).
 * made by leavera77
 */

import { credencialesEmailjsInforme } from './emailjs-plantilla-unificada.js';

/** @type {{ templateIdInforme?: string, ok?: boolean }|null} */
let _emailjsInformeSetup = null;

export function htmlReportesEmailAdminBlock() {
    return `<div id="gn-reportes-email-block" style="margin-top:1rem;padding:.75rem;border:1px solid var(--bo);border-radius:.5rem">
<h4 style="margin:0 0 .5rem"><i class="fas fa-envelope"></i> Informes por email</h4>
<p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem">Informe <strong>diario, semanal o mensual</strong> con plantilla <strong>GestorNova</strong> (automática vía API). El texto del mail lo arma el sistema; no hace falta cargar Template ID a mano.</p>
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
 */
async function asegurarPlantillaInforme(apiUrl, tok) {
    const cfg = window.APP_CONFIG?.emailjs;
    if (cfg?.templateIdInforme) {
        _emailjsInformeSetup = { ok: true, templateIdInforme: cfg.templateIdInforme };
        return _emailjsInformeSetup;
    }
    if (_emailjsInformeSetup?.ok && _emailjsInformeSetup.templateIdInforme) {
        return _emailjsInformeSetup;
    }
    const r = await fetch(apiUrl('/api/reportes-programados/emailjs-informe-setup'), {
        headers: { Authorization: `Bearer ${tok}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
        throw new Error(j.mensaje || j.error || 'No se pudo preparar la plantilla de informes en el servidor');
    }
    _emailjsInformeSetup = j;
    return j;
}

function emailjsPayloadInforme(setup) {
    return credencialesEmailjsInforme(window.APP_CONFIG?.emailjs, setup);
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
        const setup = await asegurarPlantillaInforme(apiUrl, tok);
        const emailjs = emailjsPayloadInforme(setup);
        if (!emailjs) {
            throw new Error('EmailJS no configurado en config.json (secretos GitHub Pages)');
        }
        const r = await fetch(apiUrl('/api/reportes-programados/config'), {
            method: 'PUT',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, emailjs }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || j.mensaje || `Error al guardar (${r.status})`);
        return j;
    };

    const enviarInformeDesdeApi = async (tok, body) => {
        const setup = await asegurarPlantillaInforme(apiUrl, tok);
        const emailjs = emailjsPayloadInforme(setup);
        if (!emailjs) throw new Error('EmailJS no configurado en config.json');
        const r = await fetch(apiUrl('/api/reportes-programados/ejecutar-ahora'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: body.email, frecuencia: body.frecuencia, emailjs }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            throw new Error(j.mensaje || j.error || j.detail || `Error (${r.status})`);
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
            if (j.emailjs_template_id_informe) {
                _emailjsInformeSetup = { ok: true, templateIdInforme: j.emailjs_template_id_informe };
            }
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
        mensajeReporteUi('Enviando informe…');
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
            const okMsg = await enviarInformeDesdeApi(tok, body);
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
