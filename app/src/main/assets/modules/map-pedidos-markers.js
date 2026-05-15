/**
 * Marcadores de pedidos en Leaflet: agrupa reclamos abiertos (misma celda WGS84 redondeada)
 * Varios reclamos abiertos en la misma celda: un marcador por pedido (dispersión en anillo)
 * con popup individual para asignar o ver detalle de a uno.
 *
 * Punto único de render de markers desde `app.js`: `renderMkPedidosEnMapa` vía `renderMk()` /
 * `runRenderMkPostMapInit()` (no duplicar lógica de clusters/popup en otros archivos; estado
 * `app.map` / `app.mk` lo orquesta este módulo + `app.js`).
 * made by leavera77
 */

function _esCerradoMapa(es) {
    return es === 'Cerrado' || es === 'Derivado externo';
}

function _esAbiertoMapa(p) {
    const es = p?.es || '';
    return !_esCerradoMapa(es) && es !== 'Desestimado';
}

function _keyCoord(la, ln) {
    return `${Number(la).toFixed(5)},${Number(ln).toFixed(5)}`;
}

function _ordenEstadoMapa(es) {
    if (es === 'Pendiente') return 0;
    if (es === 'Asignado') return 1;
    if (es === 'En ejecución') return 2;
    return 9;
}

function _sortAbiertosMismaCelda(arr) {
    return [...arr].sort((a, b) => {
        const oa = _ordenEstadoMapa(a.p.es);
        const ob = _ordenEstadoMapa(b.p.es);
        if (oa !== ob) return oa - ob;
        return String(a.p.np || '').localeCompare(String(b.p.np || ''), undefined, { numeric: true });
    });
}

function _popupHtmlUno(p, ctx) {
    const npEsc = String(p.np || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return `
            <div style="min-width:160px;font-family:system-ui">
                <b style="color:#1e3a8a">#${npEsc}</b> · <span style="font-size:11px;color:#475569">${p.pr}</span><br>
                <span style="font-size:11px;color:#334155">${p.tt}</span><br>
                <span style="font-size:11px;font-weight:600;color:#0f172a">${p.es}</span>${p.es !== 'Cerrado' ? ` · Av. ${p.av}%` : ''}<br>
                <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
                    <button style="flex:1;min-width:72px;padding:4px;background:#1e3a8a;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_d('${p.id}')">Detalle</button>
                    <button style="flex:1;min-width:72px;padding:4px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:11px" onclick="_z('${p.id}')">Zoom</button>
                    ${ctx.esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && (p.tai == null) ? `<button style="flex:1;min-width:72px;padding:4px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_assignMapa('${p.id}')">Asignar</button>` : ''}
                    ${ctx.esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && (p.tai != null) ? `<button style="flex:1;min-width:72px;padding:4px;background:#ea580c;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_assignMapa('${p.id}')">Reasignar</button><button style="flex:1;min-width:72px;padding:4px;background:#64748b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_desasignarMapa('${p.id}')">Desasignar</button>` : ''}
                    ${ctx.esAdmin() && ctx.puedeEnviarApiRestPedidos() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && !ctx.pedidoEsDerivadoFuera(p) ? `<button style="flex:1;min-width:100%;padding:4px;background:#7c3aed;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px;margin-top:4px" onclick="_moverUbicMapa('${p.id}')"><i class="fas fa-arrows-alt"></i> Corregir posición</button>` : ''}
                </div>
            </div>`;
}

/**
 * Centro aproximado del grupo (promedio de coordenadas reales de cada pedido).
 */
function _cellCenterLatLng(grupo) {
    let sLa = 0;
    let sLn = 0;
    const arr = grupo || [];
    for (const it of arr) {
        sLa += it.la;
        sLn += it.ln;
    }
    const n = arr.length || 1;
    return { la: sLa / n, ln: sLn / n };
}

/**
 * Desplaza cada marcador en anillo (metros) para un pin por reclamo; corrige desplazamiento en lng según latitud.
 */
function _spiderLatLng(la, ln, i, n, radiusM) {
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return { la, ln };
    if (n <= 1) return { la, ln };
    const Rm = radiusM || 22;
    const a = (2 * Math.PI * i) / n;
    const north = Rm * Math.cos(a);
    const east = Rm * Math.sin(a);
    const dlat = north / 111320;
    const cosLat = Math.cos((la * Math.PI) / 180);
    const scale = Math.abs(cosLat) < 0.02 ? 0.02 : cosLat;
    const dlng = east / (111320 * scale);
    return { la: la + dlat, ln: ln + dlng };
}

/**
 * @param {object} ctx
 * @param {object} ctx.app
 * @param {object} ctx.L
 * @param {() => any[]} ctx.pedidosParaMarcadoresMapa
 * @param {(p: any) => { la: number, ln: number }} ctx.coordsEfectivasPedidoMapa
 * @param {() => boolean} ctx.esAdmin
 * @param {() => boolean} ctx.esAndroidWebViewMapa
 * @param {(p: any) => boolean} ctx.pedidoEsDerivadoFuera
 * @param {() => boolean} ctx.puedeEnviarApiRestPedidos
 */
export function renderMkPedidosEnMapa(ctx) {
    const { app, L, pedidosParaMarcadoresMapa, coordsEfectivasPedidoMapa, esAdmin, esAndroidWebViewMapa } = ctx;
    if (!app.map || !L) return;
    app.mk.forEach((m) => m.remove());
    app.mk = [];

    const fill = {
        Crítica: '#ef4444',
        Alta: '#f97316',
        Media: '#eab308',
        Baja: '#3b82f6',
    };
    const panePed = app.map.getPane && app.map.getPane('gnPanePedidos') ? 'gnPanePedidos' : undefined;

    const chkNp = document.getElementById('mapa-chk-label-np');
    const showNp = chkNp ? chkNp.checked : localStorage.getItem('pmg_map_labels_np') === '1';
    const pinsLigerosAndroid = esAndroidWebViewMapa();

    const items = [];
    pedidosParaMarcadoresMapa().forEach((p) => {
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
        const cer = _esCerradoMapa(p.es);
        const col = cer ? '#94a3b8' : fill[p.pr] || '#3b82f6';
        const npEsc = String(p.np || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        items.push({ p, la, ln, cer, col, npEsc });
    });

    const gruposAbiertos = new Map();
    for (const it of items) {
        if (!_esAbiertoMapa(it.p)) continue;
        const k = _keyCoord(it.la, it.ln);
        if (!gruposAbiertos.has(k)) gruposAbiertos.set(k, []);
        gruposAbiertos.get(k).push(it);
    }
    const multiKeys = new Set();
    for (const [k, arr] of gruposAbiertos) {
        if (arr.length >= 2) multiKeys.add(k);
    }
    const usadoMulti = new Set();

    items.forEach((it) => {
        const { p, la, ln, cer, col, npEsc } = it;
        const k = _keyCoord(la, ln);
        if (_esAbiertoMapa(p) && multiKeys.has(k)) {
            if (usadoMulti.has(k)) return;
            usadoMulti.add(k);
            const grupo = _sortAbiertosMismaCelda(gruposAbiertos.get(k) || [it]);
            const { la: cLa, ln: cLn } = _cellCenterLatLng(grupo);
            const n = grupo.length;
            grupo.forEach((gIt, idx) => {
                const pos = _spiderLatLng(cLa, cLn, idx, n);
                const html = _popupHtmlUno(gIt.p, ctx);
                const gcol = gIt.col;
                const gnpEsc = gIt.npEsc;
                let m;
                if (showNp && !pinsLigerosAndroid) {
                    const icon = L.divIcon({
                        className: '',
                        html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
                    <div style="margin-bottom:2px;background:${gcol};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(255,255,255,.85)">#${gnpEsc}</div>
                    <div style="width:13px;height:13px;background:${gcol};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>
                </div>`,
                        iconSize: [100, 36],
                        iconAnchor: [50, 36],
                    });
                    const mkOpt = { icon, zIndexOffset: gIt.cer ? 200 : 500 };
                    if (panePed) mkOpt.pane = panePed;
                    m = L.marker([pos.la, pos.ln], mkOpt).addTo(app.map);
                } else {
                    const cmOpt = {
                        radius: gIt.cer ? 6 : 9,
                        fillColor: gcol,
                        color: '#fff',
                        weight: 2,
                        fillOpacity: gIt.cer ? 0.5 : 0.9,
                    };
                    if (panePed) cmOpt.pane = panePed;
                    m = L.circleMarker([pos.la, pos.ln], cmOpt).addTo(app.map);
                }
                m.bindPopup(html, { maxWidth: 280 });
                app.mk.push(m);
            });
            return;
        }

        const html = _popupHtmlUno(p, ctx);
        let m;
        if (showNp && !pinsLigerosAndroid) {
            const icon = L.divIcon({
                className: '',
                html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
                    <div style="margin-bottom:2px;background:${col};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(255,255,255,.85)">#${npEsc}</div>
                    <div style="width:13px;height:13px;background:${col};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>
                </div>`,
                iconSize: [100, 36],
                iconAnchor: [50, 36],
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
                fillOpacity: cer ? 0.5 : 0.9,
            };
            if (panePed) cmOpt.pane = panePed;
            m = L.circleMarker([la, ln], cmOpt).addTo(app.map);
        }
        m.bindPopup(html, { maxWidth: 280 });
        app.mk.push(m);
    });
}
