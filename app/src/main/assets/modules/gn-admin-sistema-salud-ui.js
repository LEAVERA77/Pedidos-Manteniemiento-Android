/**
 * Tarjeta de salud del sistema en Admin → Empresa.
 * made by leavera77
 */

const HOST_ID = 'gn-admin-sistema-salud-host';

function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function staticPageHref(fileName) {
    try {
        const path = window.location.pathname || '/';
        const base = path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '/');
        return `${base}${fileName}`.replace(/\/+/g, '/');
    } catch (_) {
        return fileName;
    }
}

function rowHtml(label, ok, meta) {
    const cls = ok ? 'gn-salud-ok' : 'gn-salud-bad';
    const icon = ok ? 'fa-check-circle' : 'fa-exclamation-circle';
    return `<li class="gn-salud-row ${cls}"><i class="fas ${icon}"></i><span><strong>${esc(label)}</strong><small>${esc(meta || '')}</small></span></li>`;
}

export function htmlSistemaSaludAdminBlock() {
    return `<div id="${HOST_ID}" class="gn-sistema-salud-host" style="margin:1rem 0"></div>`;
}

export async function cargarSistemaSaludAdmin({ apiUrl, getApiToken }) {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    const tok = getApiToken?.();
    if (!tok) return;
    host.innerHTML =
        '<p style="font-size:.8rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Comprobando servicios…</p>';
    try {
        const r = await fetch(apiUrl('/api/admin/sistema-salud'), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        const data = await r.json().catch(() => ({}));
        if (r.status === 403) {
            host.innerHTML =
                '<p style="font-size:.8rem;color:var(--tm)"><i class="fas fa-lock"></i> La salud del sistema solo está disponible con <strong>rol administrador</strong>. Si entraste como técnico o supervisor, no verás este panel.</p>';
            return;
        }
        if (!r.ok) throw new Error(data.error || r.statusText);
        const api = data.api || {};
        const db = data.db || {};
        const nom = data.nominatim || {};
        const dep = data.deploy || {};
        const nomMeta = nom.disabled
            ? 'Deshabilitado (DISABLE_NOMINATIM)'
            : nom.reachable
              ? `${nom.latency_ms ?? '—'} ms · HTTP ${nom.http_status ?? '—'}`
              : esc(nom.error || 'Sin respuesta');
        const commit = dep.gitCommit ? String(dep.gitCommit).slice(0, 8) : '—';
        host.innerHTML = `<div class="gn-sistema-salud-card">
<h4 style="margin:0 0 .5rem"><i class="fas fa-heartbeat"></i> Salud del sistema</h4>
<ul class="gn-salud-list">
${rowHtml('API', api.ok !== false, 'Proceso activo')}
${rowHtml('Base de datos', !!db.ok, db.ok ? `${db.latency_ms} ms` : db.error || 'Error')}
${rowHtml('Geocodificación', !!nom.ok, nomMeta)}
</ul>
<p style="font-size:.72rem;color:var(--tl);margin:.45rem 0 0">Deploy: <code>${esc(commit)}</code> · Node ${esc(dep.node || '')}</p>
<div class="gn-salud-actions">
  <a class="btn btn-s" href="${esc(staticPageHref('status.html'))}" target="_blank" rel="noopener">Página pública de estado</a>
  <button type="button" class="btn btn-s" data-gn-salud-refresh>Actualizar</button>
</div>
</div>`;
        host.querySelector('[data-gn-salud-refresh]')?.addEventListener('click', () => {
            void cargarSistemaSaludAdmin({ apiUrl, getApiToken });
        });
    } catch (e) {
        host.innerHTML = `<p style="font-size:.8rem;color:var(--re)">${esc(e.message || 'No disponible')}</p>`;
    }
}
