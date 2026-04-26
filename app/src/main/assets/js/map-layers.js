// map-layers.js - Manejo de capas de pedidos y marcadores en el mapa
import { app, esAdmin, esAndroidWebViewMapa, toast } from './core.js';
import { calcularEscalaReal } from './geo.js';

export function renderMk() {
    if (!app.map) return;
    const L = window.L;

    app.mk.forEach(m => m.remove());
    app.mk = [];

    const fill = {
        'Crítica': '#ef4444',
        'Alta': '#f97316',
        'Media': '#eab308',
        'Baja': '#3b82f6'
    };
    const panePed = app.map.getPane && app.map.getPane('gnPanePedidos') ? 'gnPanePedidos' : undefined;

    const chkNp = document.getElementById('mapa-chk-label-np');
    const showNp = chkNp ? chkNp.checked : (localStorage.getItem('pmg_map_labels_np') === '1');
    const pinsLigerosAndroid = esAndroidWebViewMapa();

    // Nota: pedidosParaMarcadoresMapa y coordsEfectivasPedidoMapa deben estar disponibles globalmente o importadas
    const pedidos = window.pedidosParaMarcadoresMapa ? window.pedidosParaMarcadoresMapa() : [];

    pedidos.forEach(p => {
        const coords = window.coordsEfectivasPedidoMapa ? window.coordsEfectivasPedidoMapa(p) : { la: p.lat, ln: p.lng };
        const { la, ln } = coords;
        if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
        const cer = p.es === 'Cerrado' || p.es === 'Derivado externo';
        const col = cer ? '#94a3b8' : (fill[p.pr] || '#3b82f6');
        const npEsc = String(p.np || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        let m;
        if (showNp && !pinsLigerosAndroid) {
            const icon = L.divIcon({
                className: '',
                html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
                    <div style="margin-bottom:2px;background:${col};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(255,255,255,.85)">#${npEsc}</div>
                    <div style="width:13px;height:13px;background:${col};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>
                </div>`,
                iconSize: [100, 36],
                iconAnchor: [50, 36]
            });
            const mkOpt = { icon, zIndexOffset: cer ? 200 : 500 };
            if (panePed) mkOpt.pane = panePed;
            m = L.marker([la, ln], mkOpt).addTo(app.map);
        } else {
            const cmOpt = {
                radius: cer ? 6 : 9,
                fillColor: col,
                color: '#fff',
                weight: 2,
                fillOpacity: cer ? 0.5 : 0.9
            };
            if (panePed) cmOpt.pane = panePed;
            m = L.circleMarker([la, ln], cmOpt).addTo(app.map);
        }

        // Popup content logic remains here but calls global window._d, _z, etc.
        m.bindPopup(`
            <div style="min-width:160px;font-family:system-ui">
                <b style="color:#1e3a8a">#${p.np}</b> · <span style="font-size:11px;color:#475569">${p.pr}</span><br>
                <span style="font-size:11px;color:#334155">${p.tt}</span><br>
                <span style="font-size:11px;font-weight:600;color:#0f172a">${p.es}</span>${p.es !== 'Cerrado' ? ` · Av. ${p.av}%` : ''}<br>
                <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
                    <button style="flex:1;min-width:72px;padding:4px;background:#1e3a8a;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_d('${p.id}')">Detalle</button>
                    <button style="flex:1;min-width:72px;padding:4px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:11px" onclick="_z('${p.id}')">Zoom</button>
                    ${esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && (p.tai == null) ? `<button style="flex:1;min-width:72px;padding:4px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_assignMapa('${p.id}')">Asignar</button>` : ''}
                    ${esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && (p.tai != null) ? `<button style="flex:1;min-width:72px;padding:4px;background:#ea580c;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_assignMapa('${p.id}')">Reasignar</button><button style="flex:1;min-width:72px;padding:4px;background:#64748b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_desasignarMapa('${p.id}')">Desasignar</button>` : ''}
                    ${esAdmin() && (window.puedeEnviarApiRestPedidos && window.puedeEnviarApiRestPedidos()) && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && !(window.pedidoEsDerivadoFuera && window.pedidoEsDerivadoFuera(p)) ? `<button style="flex:1;min-width:100%;padding:4px;background:#7c3aed;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px;margin-top:4px" onclick="_moverUbicMapa('${p.id}')"><i class="fas fa-arrows-alt"></i> Corregir posición</button>` : ''}
                </div>
            </div>`, { maxWidth: 260 });

        app.mk.push(m);
    });
}
