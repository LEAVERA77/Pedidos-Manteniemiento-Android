/**
 * Indicador en header: informes programados por email activos (oleada 3).
 * made by leavera77
 */

const BADGE_ID = 'gn-reportes-email-hd-badge';

const FRECUENCIA_INFO = {
    diario: {
        corto: 'Informe diario',
        detalle: 'Cada día se envía un resumen de pedidos y reclamos por correo',
    },
    semanal: {
        corto: 'Informe semanal',
        detalle: 'Cada semana (últimos 7 días) se envía el resumen por correo',
    },
    mensual: {
        corto: 'Informe mensual',
        detalle: 'Cada mes (últimos 30 días) se envía el resumen por correo',
    },
};

function esc(t) {
    return String(t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

function irAConfigInformesEmail() {
    try {
        const adm = document.getElementById('adm');
        if (adm && !adm.classList.contains('active')) {
            document.getElementById('btn-admin')?.click();
        }
    } catch (_) {}
    try {
        if (typeof window.adminTab === 'function') {
            window.adminTab('empresa');
        }
    } catch (_) {}
    setTimeout(() => {
        try {
            document
                .getElementById('gn-reportes-email-block')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
    }, 350);
}

function pintarBadge(btn, cfg) {
    const freq = String(cfg?.frecuencia || 'diario');
    const info = FRECUENCIA_INFO[freq] || {
        corto: `Informe ${freq}`,
        detalle: 'Informe automático por correo activo',
    };
    const email = String(cfg?.email || '').trim();

    btn.setAttribute('role', 'status');
    btn.setAttribute('aria-live', 'polite');
    btn.tabIndex = 0;
    btn.title = `${info.detalle}. Destino: ${email || 'sin email'}. Clic: configuración en Admin → Empresa.`;
    btn.setAttribute(
        'aria-label',
        `${info.corto} activo. Se envía a ${email || 'email configurado'}. Abrir configuración de informes.`
    );
    btn.innerHTML = `<i class="fas fa-envelope-open-text" aria-hidden="true"></i><span class="gn-reportes-hd-badge-txt">${esc(info.corto)}</span>`;

    if (btn.dataset.gnRepBadgeBound !== '1') {
        btn.dataset.gnRepBadgeBound = '1';
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            irAConfigInformesEmail();
        });
        btn.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                irAConfigInformesEmail();
            }
        });
    }
}

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
            btn = document.createElement('button');
            btn.type = 'button';
            btn.id = BADGE_ID;
            btn.className = 'gn-reportes-hd-badge';
            const slot = document.querySelector('#ms .hd-slot-mid');
            slot?.appendChild(btn);
        }
        pintarBadge(btn, cfg);
    } catch (_) {}
}
