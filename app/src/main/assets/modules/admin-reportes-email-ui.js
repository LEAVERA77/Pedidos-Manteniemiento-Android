/**
 * Admin: informes por email (EmailJS: plantilla informe con {{email_body}}).
 * made by leavera77
 */

import {
    enviarInformePruebaAhora,
    htmlVistaPreviaInforme,
    mensajeErrorInformeEmail,
} from './reportes-email-envio-prueba.js';
import { plantillaInformeEmailjsConfigurada } from './emailjs-plantilla-unificada.js';

export function htmlReportesEmailAdminBlock() {
    const avisoPlantilla = plantillaInformeEmailjsConfigurada(
        typeof window !== 'undefined' ? window.APP_CONFIG?.emailjs : undefined
    );
    const avisoHtml = avisoPlantilla.ok
        ? ''
        : `<p style="font-size:.72rem;color:#b45309;margin:0 0 .5rem;padding:.45rem .55rem;background:#fffbeb;border:1px solid #fcd34d;border-radius:.4rem">${avisoPlantilla.error}</p>`;
    return `<div id="gn-reportes-email-block" style="margin-top:1rem;padding:.75rem;border:1px solid var(--bo);border-radius:.5rem">
<h4 style="margin:0 0 .5rem"><i class="fas fa-envelope"></i> Informes por email</h4>
<p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem">Informe <strong>diario, semanal o mensual</strong> con resumen de pedidos y análisis. «Enviar ahora» manda el <strong>informe operativo</strong> (no el mail de código de acceso).</p>
${avisoHtml}
<p style="font-size:.72rem;color:var(--tl);margin:0 0 .5rem">Plantilla EmailJS para informes: asunto <code>{{email_subject}}</code>, cuerpo <code>{{email_body}}</code>. En <code>config.json</code> usá <code>templateIdInforme</code> (distinto de <code>templateIdReset</code>). Ver <code>docs/EMAILJS_INFORME_PERIODICO.md</code>.</p>
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
<div id="gn-reporte-preview-mount"></div>
<p style="font-size:.72rem;color:var(--tl);margin:.5rem 0 0"><i class="fas fa-clock"></i> Automático en servidor: cron en Render <code>POST /api/reportes-programados/cron/ejecutar</code> con <code>x-cron-secret</code>.</p>
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
        const r = await fetch(apiUrl('/api/reportes-programados/config'), {
            method: 'PUT',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || j.mensaje || `Error al guardar (${r.status})`);
        return j;
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
        const previewMount = document.getElementById('gn-reporte-preview-mount');
        if (btn) btn.disabled = true;
        mensajeReporteUi('Armando y enviando informe…');
        try {
            const { okMsg, resumen } = await enviarInformePruebaAhora(
                {
                    apiUrl,
                    getApiToken,
                    guardarConfig,
                    registrarEnvio: async (t) => {
                        await fetch(apiUrl('/api/reportes-programados/registrar-envio'), {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
                        });
                    },
                },
                body
            );
            if (previewMount) previewMount.innerHTML = htmlVistaPreviaInforme(resumen);
            mensajeReporteUi(okMsg);
            toast(okMsg, 'success');
        } catch (e) {
            const m = mensajeErrorInformeEmail(e);
            mensajeReporteUi(m, true);
            toast(m, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}
