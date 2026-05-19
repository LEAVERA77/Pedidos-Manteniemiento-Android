/**
 * Ranking técnicos y alertas SLA en pestaña Estadísticas (admin).
 * made by leavera77
 */

const esc = (t) =>
    String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

export function htmlRankingSlaAdminBlocks() {
    return `<div id="gn-est-ranking-host" style="margin:1rem 0;display:none"></div>
<div id="gn-est-sla-host" style="margin:1rem 0;display:none"></div>`;
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

export async function cargarRankingTecnicosEnEstadisticas({ apiUrl, getApiToken, periodo = '30d' }) {
    const host = document.getElementById('gn-est-ranking-host');
    if (!host) return;
    try {
        const data = await fetchJson(`/api/estadisticas/ranking-tecnicos?periodo=${encodeURIComponent(periodo)}`, apiUrl, getApiToken);
        const rows = data.ranking || data.rows || [];
        if (!rows.length) {
            host.style.display = 'none';
            return;
        }
        host.style.display = 'block';
        host.innerHTML =
            `<h4 style="margin:0 0 .5rem"><i class="fas fa-trophy"></i> Ranking técnicos (${esc(periodo)})</h4>` +
            '<table class="mat-det-table" style="width:100%"><thead><tr><th>Técnico</th><th>Cerrados</th><th>Prom. cierre (h)</th><th>Opinión WA</th></tr></thead><tbody>' +
            rows
                .map(
                    (r, i) =>
                        `<tr><td>${i + 1}. ${esc(r.nombre || r.tecnico_nombre || '—')}</td><td>${esc(r.cerrados ?? r.total_cerrados ?? 0)}</td><td>${esc(r.horas_prom_cierre != null ? Number(r.horas_prom_cierre).toFixed(1) : '—')}</td><td>${esc(r.opinion_prom != null ? Number(r.opinion_prom).toFixed(1) : '—')}</td></tr>`
                )
                .join('') +
            '</tbody></table>';
    } catch (e) {
        host.innerHTML = `<p style="font-size:.8rem;color:var(--tl)">Ranking: ${esc(e.message || 'no disponible')}</p>`;
        host.style.display = 'block';
    }
}

export async function cargarAlertasSlaEnEstadisticas({ apiUrl, getApiToken }) {
    const host = document.getElementById('gn-est-sla-host');
    if (!host) return;
    try {
        const data = await fetchJson('/api/estadisticas/sla-alertas', apiUrl, getApiToken);
        const alertas = data.alertas || [];
        if (!alertas.length) {
            host.style.display = 'none';
            return;
        }
        host.style.display = 'block';
        host.innerHTML =
            `<h4 style="margin:0 0 .5rem;color:#b45309"><i class="fas fa-exclamation-triangle"></i> Alertas operativas (SLA)</h4><ul style="margin:0;padding-left:1.2rem;font-size:.85rem">` +
            alertas.map((a) => `<li>${esc(a.mensaje || a.tipo)} — ${esc(a.cantidad ?? '')} pedido(s)</li>`).join('') +
            '</ul>';
    } catch (e) {
        host.style.display = 'none';
    }
}
