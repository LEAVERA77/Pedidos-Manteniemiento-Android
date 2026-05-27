/**
 * Panel admin: resumen SLA + auditoría operativa reciente.
 * made by leavera77
 */

const esc = (t) =>
    String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

export function htmlOperacionAuditAdminBlock() {
    return `<div id="gn-est-sla-resumen-host" style="margin:1rem 0;display:none"></div>
<div id="gn-est-audit-host" style="margin:1rem 0;display:none"></div>`;
}

async function fetchJson(path, apiUrl, getApiToken) {
    const tok = getApiToken();
    if (!tok) throw new Error('Sin sesión API');
    const r = await fetch(apiUrl(path), {
        headers: { Authorization: `Bearer ${tok}` },
        cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
}

function fmtFecha(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
        return String(iso);
    }
}

export async function cargarSlaResumenEnEstadisticas({ apiUrl, getApiToken }) {
    const host = document.getElementById('gn-est-sla-resumen-host');
    if (!host) return;
    try {
        const data = await fetchJson('/api/estadisticas/sla-alertas', apiUrl, getApiToken);
        const r = data.resumen || {};
        host.style.display = 'block';
        host.innerHTML = `<div class="gn-sla-resumen-card">
<h4 style="margin:0 0 .5rem"><i class="fas fa-chart-line"></i> Resumen operativo</h4>
<div class="gn-sla-resumen-grid">
  <div><strong>${esc(r.abiertos ?? 0)}</strong><span>Abiertos</span></div>
  <div><strong>${esc(r.cerrados_7d ?? 0)}</strong><span>Cerrados (7 d)</span></div>
  <div><strong>${esc(r.alertas_activas ?? 0)}</strong><span>Alertas SLA</span></div>
</div></div>`;
    } catch (_) {
        host.style.display = 'none';
    }
}

export async function cargarOperacionAuditEnEstadisticas({ apiUrl, getApiToken }) {
    const host = document.getElementById('gn-est-audit-host');
    if (!host) return;
    try {
        const data = await fetchJson('/api/admin/operacion-audit?limit=25', apiUrl, getApiToken);
        const rows = data.registros || [];
        if (!rows.length) {
            host.style.display = 'none';
            return;
        }
        host.style.display = 'block';
        host.innerHTML =
            `<h4 style="margin:0 0 .5rem"><i class="fas fa-clipboard-list"></i> Auditoría reciente</h4>` +
            '<table class="mat-det-table" style="width:100%;font-size:.8rem"><thead><tr><th>Fecha</th><th>Pedido</th><th>Usuario</th><th>Cambio</th></tr></thead><tbody>' +
            rows
                .map((row) => {
                    const cambio =
                        row.estado_anterior && row.estado_nuevo
                            ? `${esc(row.estado_anterior)} → ${esc(row.estado_nuevo)}`
                            : esc(row.accion || '—');
                    return `<tr><td>${esc(fmtFecha(row.created_at))}</td><td>#${esc(row.pedido_id ?? '—')}</td><td>${esc(row.usuario_nombre || row.usuario_email || '—')}</td><td>${cambio}</td></tr>`;
                })
                .join('') +
            '</tbody></table>';
    } catch (e) {
        host.innerHTML = `<p style="font-size:.8rem;color:var(--tl)">Auditoría: ${esc(e.message || 'no disponible')}</p>`;
        host.style.display = 'block';
    }
}
