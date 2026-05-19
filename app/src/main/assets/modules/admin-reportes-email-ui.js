/**
 * Admin: informes periódicos por email (config + disparo manual).
 * made by leavera77
 */

const esc = (t) =>
    String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

export function htmlReportesEmailAdminBlock() {
    return `<div id="gn-reportes-email-block" style="margin-top:1rem;padding:.75rem;border:1px solid var(--bo);border-radius:.5rem">
<h4 style="margin:0 0 .5rem"><i class="fas fa-envelope"></i> Informes por email</h4>
<p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem">Resumen diario/semanal al correo del administrador (requiere SMTP en el servidor).</p>
<label style="font-size:.85rem;display:block;margin-bottom:.35rem">Email destino</label>
<input type="email" id="gn-reporte-email" placeholder="admin@empresa.com" style="width:100%;max-width:320px;padding:.4rem;border:1px solid var(--bo);border-radius:.4rem;margin-bottom:.5rem">
<label style="font-size:.85rem;display:block;margin-bottom:.35rem">Frecuencia</label>
<select id="gn-reporte-frecuencia" style="padding:.35rem;border:1px solid var(--bo);border-radius:.4rem;margin-bottom:.5rem">
  <option value="diario">Diario</option>
  <option value="semanal">Semanal</option>
  <option value="off">Desactivado</option>
</select>
<div style="display:flex;gap:.4rem;flex-wrap:wrap">
  <button type="button" class="btn-sm primary" id="gn-reporte-guardar">Guardar</button>
  <button type="button" class="btn-sm" id="gn-reporte-enviar-ahora">Enviar ahora (prueba)</button>
</div>
<span id="gn-reporte-msg" style="font-size:.75rem;color:var(--tl)"></span>
</div>`;
}

export function initAdminReportesEmailUI({ apiUrl, getApiToken, toast, esAdmin }) {
    if (!esAdmin) return;
    const block = document.getElementById('gn-reportes-email-block');
    if (!block) return;
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
        } catch (_) {}
    };
    void load();
    document.getElementById('gn-reporte-guardar')?.addEventListener('click', async () => {
        const tok = getApiToken();
        if (!tok) return toast('Iniciá sesión con API', 'warning');
        const body = {
            email: document.getElementById('gn-reporte-email')?.value?.trim(),
            frecuencia: document.getElementById('gn-reporte-frecuencia')?.value || 'off',
        };
        try {
            const r = await fetch(apiUrl('/api/reportes-programados/config'), {
                method: 'PUT',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || 'Error');
            toast('Configuración guardada', 'success');
        } catch (e) {
            toast(e.message || 'Error', 'error');
        }
    });
    document.getElementById('gn-reporte-enviar-ahora')?.addEventListener('click', async () => {
        const tok = getApiToken();
        if (!tok) return toast('Iniciá sesión con API', 'warning');
        try {
            const r = await fetch(apiUrl('/api/reportes-programados/ejecutar-ahora'), {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: '{}',
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || j.detail || 'Error');
            toast(j.mensaje || 'Informe encolado', 'success');
        } catch (e) {
            toast(e.message || 'Error', 'error');
        }
    });
}
