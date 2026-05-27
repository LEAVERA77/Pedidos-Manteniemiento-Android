/**
 * Indicador en header: informes programados activos (oleada 3).
 * made by leavera77
 */

const BADGE_ID = 'gn-reportes-email-hd-badge';

export async function refrescarIndicadorReportesEmail({ apiUrl, getApiToken, esAdmin }) {
    if (!esAdmin?.()) return;
    const tok = getApiToken?.();
    if (!tok) return;
    let btn = document.getElementById(BADGE_ID);
    try {
        const r = await fetch(apiUrl('/api/reportes-programados/config'), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        const cfg = await r.json().catch(() => ({}));
        if (!r.ok) return;
        const activo = !!(cfg?.email && cfg?.frecuencia && cfg.frecuencia !== 'off');
        if (!activo) {
            btn?.remove();
            return;
        }
        if (!btn) {
            btn = document.createElement('span');
            btn.id = BADGE_ID;
            btn.className = 'gn-reportes-hd-badge';
            btn.title = `Informe ${cfg.frecuencia} activo → ${cfg.email}`;
            const slot = document.querySelector('#ms .hd-slot-mid');
            slot?.appendChild(btn);
        }
        btn.innerHTML = `<i class="fas fa-envelope-open-text" aria-hidden="true"></i> ${esc(String(cfg.frecuencia))}`;
    } catch (_) {}
}

function esc(t) {
    return String(t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;');
}
