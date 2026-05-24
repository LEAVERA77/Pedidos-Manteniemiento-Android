/**
 * Admin: informes periódicos por email.
 * made by leavera77
 */

import {
    PLANTILLA_EMAILJS_COPIAR,
    credencialesEmailjsInforme,
    plantillaInformeConfigurada,
} from './emailjs-plantilla-unificada.js';

export function htmlReportesEmailAdminBlock() {
    return `<div id="gn-reportes-email-block" style="margin-top:1rem;padding:.75rem;border:1px solid var(--bo);border-radius:.5rem">
<h4 style="margin:0 0 .5rem"><i class="fas fa-envelope"></i> Informes por email</h4>
<p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem">Informe <strong>diario, semanal o mensual</strong> (no usa la plantilla de código de acceso). Creá una plantilla en EmailJS con <code style="font-size:.7rem">{{email_subject}}</code> y <code style="font-size:.7rem">{{email_body}}</code>.</p>
<label style="font-size:.85rem;display:block;margin-bottom:.35rem">Template ID informes (EmailJS)</label>
<input type="text" id="gn-reporte-template-informe" placeholder="template_xxxxxxx" style="width:100%;max-width:360px;padding:.4rem;border:1px solid var(--bo);border-radius:.4rem;margin-bottom:.5rem;font-size:.8rem">
<button type="button" class="btn-sm" id="gn-reporte-ver-plantilla-emailjs" style="font-size:.75rem;margin-bottom:.5rem">Copiar instrucciones plantilla</button>
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
        templateIdInforme: document.getElementById('gn-reporte-template-informe')?.value?.trim() || '',
    };
}

function emailjsPayloadInforme(templateIdInforme) {
    const cfg = window.APP_CONFIG?.emailjs;
    if (!cfg?.publicKey || !cfg?.serviceId) return null;
    const cred = credencialesEmailjsInforme(cfg, null, templateIdInforme);
    if (!cred) return null;
    return {
        publicKey: cred.publicKey,
        serviceId: cred.serviceId,
        templateId: cred.templateIdInforme,
        templateIdInforme: cred.templateIdInforme,
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

function validarPlantillaInforme(body) {
    const cfg = window.APP_CONFIG?.emailjs;
    const tid = body.templateIdInforme || cfg?.templateIdInforme || '';
    if (!tid) {
        throw new Error(
            'Completá el Template ID de informes (EmailJS). Duplicá la plantilla, pegá {{email_subject}} y {{email_body}}, y usá un ID distinto al de recuperación de clave.'
        );
    }
    if (
        cfg?.templateId &&
        tid === cfg.templateId &&
        !(cfg.templateIdInforme && cfg.templateIdInforme !== cfg.templateId)
    ) {
        throw new Error(
            'Ese Template ID es el de recuperación de clave. En EmailJS → Duplicate template → pegá la plantilla de informe → usá el nuevo Template ID.'
        );
    }
    const cred = credencialesEmailjsInforme(cfg, { templateIdInforme: tid }, tid);
    if (!cred) {
        throw new Error('Template ID de informes inválido o falta EmailJS en config.json.');
    }
    return cred;
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
        validarPlantillaInforme(body);
        const emailjs = emailjsPayloadInforme(body.templateIdInforme);
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
        validarPlantillaInforme(body);
        const emailjs = emailjsPayloadInforme(body.templateIdInforme);
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
        const cfg = window.APP_CONFIG?.emailjs;
        const tplInput = document.getElementById('gn-reporte-template-informe');
        if (cfg?.templateIdInforme && tplInput && !tplInput.value) {
            tplInput.value = cfg.templateIdInforme;
        } else if (cfg?.templateId && tplInput && !tplInput.value && plantillaInformeConfigurada(cfg, null)) {
            tplInput.value = cfg.templateIdInforme || '';
        }
        if (!tok) return;
        try {
            const r = await fetch(apiUrl('/api/reportes-programados/config'), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            const j = await r.json().catch(() => ({}));
            if (j.email) document.getElementById('gn-reporte-email').value = j.email;
            if (j.frecuencia) document.getElementById('gn-reporte-frecuencia').value = j.frecuencia;
            if (j.emailjs_template_id_informe && tplInput) {
                tplInput.value = j.emailjs_template_id_informe;
            }
            if (j.tabla_ok === false) {
                mensajeReporteUi('Falta tabla en Neon: docs/NEON_fcm_reportes_sla.sql', true);
            }
        } catch (_) {}
    };
    void load();

    document.getElementById('gn-reporte-ver-plantilla-emailjs')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(PLANTILLA_EMAILJS_COPIAR);
            toast('Instrucciones copiadas. Creá la plantilla en EmailJS y pegá el nuevo Template ID.', 'success');
        } catch (_) {
            mensajeReporteUi(PLANTILLA_EMAILJS_COPIAR, false);
            toast('Copiá las instrucciones del texto debajo', 'warning');
        }
    });

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
                if (/Completá el email/i.test(warn) || /Template ID/i.test(warn)) throw e;
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
