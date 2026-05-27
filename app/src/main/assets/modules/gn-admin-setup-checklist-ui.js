/**
 * Checklist de configuración inicial (pestaña Empresa, admin).
 * made by leavera77
 */

const HOST_ID = 'gn-admin-setup-checklist-host';

export function htmlSetupChecklistAdminBlock() {
    return `<div id="${HOST_ID}" class="gn-setup-checklist-host" style="margin:1rem 0"></div>`;
}

function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export async function cargarSetupChecklistAdmin({ apiUrl, getApiToken }) {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    const tok = getApiToken?.();
    if (!tok) return;
    host.innerHTML = '<p style="font-size:.8rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Revisando configuración…</p>';
    try {
        const r = await fetch(apiUrl('/api/admin/setup-checklist'), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        const items = data.items || [];
        const res = data.resumen || {};
        host.innerHTML =
            `<div class="gn-setup-checklist-card">
<h4 style="margin:0 0 .5rem"><i class="fas fa-clipboard-check"></i> Configuración del tenant (${esc(res.porcentaje ?? 0)}%)</h4>
<ul class="gn-setup-checklist-list">${items
                .map(
                    (it) =>
                        `<li class="gn-setup-checklist-item${it.ok ? ' gn-setup-checklist-item--ok' : ''}"><i class="fas ${it.ok ? 'fa-check-circle' : 'fa-circle'}"></i> ${esc(it.label)}</li>`
                )
                .join('')}</ul>
<p style="font-size:.72rem;color:var(--tl);margin:.5rem 0 0">${esc(res.completados)}/${esc(res.total)} ítems completados</p>
</div>`;
    } catch (e) {
        host.innerHTML = `<p style="font-size:.8rem;color:var(--re)">${esc(e.message || 'No disponible')}</p>`;
    }
}

function wireEmpresaTabRefresh() {
    document.addEventListener(
        'click',
        (e) => {
            const tab = e.target?.closest?.('.admin-tab');
            const onclick = tab?.getAttribute?.('onclick') || '';
            if (!onclick.includes("adminTab('empresa')")) return;
            setTimeout(() => {
                const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : '';
                if (!tok) return;
                void cargarSetupChecklistAdmin({
                    apiUrl: window.apiUrl,
                    getApiToken: window.getApiToken,
                });
            }, 0);
        },
        true
    );
}

if (typeof document !== 'undefined') {
    wireEmpresaTabRefresh();
}
