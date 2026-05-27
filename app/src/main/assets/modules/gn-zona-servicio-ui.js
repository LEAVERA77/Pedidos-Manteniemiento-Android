/**
 * Zona de servicio (bbox tenant_localidades) en ajustes geocerca admin.
 * made by leavera77
 */

import { abrirZonaServicioEnMapa } from './gn-zona-servicio-mapa-preview.js';

const HOST_ID = 'gn-zona-servicio-host';

function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function htmlZonaServicioAdminBlock() {
    return `<div id="${HOST_ID}" class="gn-zona-servicio-host" style="margin:.75rem 0;display:none"></div>`;
}

export async function cargarZonaServicioAdmin({ apiUrl, getApiToken }) {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    const tok = getApiToken?.();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl('/api/tenant-operativa/zona-servicio'), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        host.style.display = 'block';
        if (!data.configurada) {
            host.innerHTML = `<p class="gn-zona-servicio-note"><i class="fas fa-map"></i> Zona de servicio: sin bbox en <code>tenant_localidades</code> (${esc(data.localidades || 0)} localidad(es)). Opcional para validar coordenadas.</p>`;
            return;
        }
        const b = data.bbox;
        host.innerHTML = `<p class="gn-zona-servicio-note"><i class="fas fa-draw-polygon"></i> Zona de servicio activa (${esc(data.localidades_con_bbox)} localidad(es) con área). Lat ${esc(b?.minLat?.toFixed(3))}–${esc(b?.maxLat?.toFixed(3))}, Lon ${esc(b?.minLng?.toFixed(3))}–${esc(b?.maxLng?.toFixed(3))}.</p>
<button type="button" class="btn btn-s gn-zona-map-btn" style="margin-top:.35rem"><i class="fas fa-map"></i> Ver en mapa</button>`;
        host.querySelector('.gn-zona-map-btn')?.addEventListener('click', () => abrirZonaServicioEnMapa(b));
    } catch (e) {
        host.innerHTML = `<p class="gn-zona-servicio-note">${esc(e.message || '')}</p>`;
        host.style.display = 'block';
    }
}
