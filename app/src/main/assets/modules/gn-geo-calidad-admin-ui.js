/**
 * Métricas de calidad geográfica en Estadísticas (admin).
 * made by leavera77
 */

import { abrirModalPedidosSinCoords } from './gn-pedidos-sin-coords-modal.js';

const HOST_ID = 'gn-est-geo-calidad-host';

const esc = (t) =>
    String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

export function htmlGeoCalidadAdminBlock() {
    return `<div id="${HOST_ID}" style="margin:1rem 0;display:none"></div>`;
}

async function ejecutarRegeocodificarLote({ apiUrl, getApiToken, host }) {
    const tok = getApiToken();
    if (!tok || !confirm('¿Re-geocodificar hasta 10 pedidos abiertos sin coordenadas?')) return;
    const btn = host?.querySelector('.gn-geo-regeo-lote-btn');
    if (btn) btn.disabled = true;
    try {
        const r = await fetch(apiUrl('/api/admin/pedidos-sin-coords/regeocodificar-lote'), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tok}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ limit: 10 }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        window.toast?.(
            `Lote: ${data.exitosos}/${data.procesados} re-geocodificados`,
            data.exitosos > 0 ? 'ok' : 'warn'
        );
        await cargarGeoCalidadEnEstadisticas({ apiUrl, getApiToken });
        if (typeof window.cargarEstadisticas === 'function') void window.cargarEstadisticas();
    } catch (e) {
        window.toast?.(e.message || 'Error en lote', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

export async function cargarGeoCalidadEnEstadisticas({ apiUrl, getApiToken }) {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    try {
        const tok = getApiToken();
        if (!tok) return;
        const r = await fetch(apiUrl('/api/admin/geo-calidad'), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        if (!data.disponible) {
            host.style.display = 'none';
            return;
        }
        host.style.display = 'block';
        const warn = data.porcentaje_abiertos_con_coords < 80;
        host.innerHTML = `<div class="gn-geo-calidad-card${warn ? ' gn-geo-calidad-card--warn' : ''}">
<h4 style="margin:0 0 .5rem"><i class="fas fa-map-marked-alt"></i> Calidad geográfica</h4>
<div class="gn-sla-resumen-grid">
  <div><strong>${esc(data.porcentaje_con_coords)}%</strong><span>Con coords (${esc(data.con_coordenadas)}/${esc(data.total)})</span></div>
  <div><strong>${esc(data.sin_coordenadas)}</strong><span>Sin coordenadas</span></div>
  <div><strong>${esc(data.porcentaje_abiertos_con_coords)}%</strong><span>Abiertos geolocalizados</span></div>
</div>
<p style="font-size:.72rem;color:var(--tl);margin:.45rem 0 0">${esc(data.abiertos_sin_coordenadas)} pedido(s) abierto(s) sin pin en mapa</p>
${Number(data.abiertos_sin_coordenadas) > 0 ? `<div class="gn-geo-calidad-actions" style="margin-top:.5rem;display:flex;flex-wrap:wrap;gap:.35rem">
<button type="button" class="btn btn-s gn-geo-sin-coords-btn"><i class="fas fa-list"></i> Ver listado</button>
<button type="button" class="btn btn-s gn-geo-regeo-lote-btn"><i class="fas fa-sync"></i> Re-geocodificar lote (10)</button>
</div>` : ''}
</div>`;
        host.querySelector('.gn-geo-sin-coords-btn')?.addEventListener('click', () => {
            void abrirModalPedidosSinCoords({ apiUrl, getApiToken });
        });
        host.querySelector('.gn-geo-regeo-lote-btn')?.addEventListener('click', () => {
            void ejecutarRegeocodificarLote({ apiUrl, getApiToken, host, data });
        });
    } catch (e) {
        host.innerHTML = `<p style="font-size:.8rem;color:var(--tl)">Geo: ${esc(e.message || 'no disponible')}</p>`;
        host.style.display = 'block';
    }
}
