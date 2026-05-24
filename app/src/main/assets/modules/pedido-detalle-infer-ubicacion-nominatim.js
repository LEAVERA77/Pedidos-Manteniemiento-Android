/**
 * Provincia y código postal en detalle de pedido vía reverse Nominatim (todos los rubros).
 * made by leavera77
 */

import { queryDetalleSection } from './pedido-detalle-shell.js';
import { buildDetalleSections } from './pedido-detalle-render.js';

/** @type {Set<string>} */
const _enCurso = new Set();

/**
 * @param {unknown} address
 */
export function extraerProvinciaCpDesdeNominatimAddress(address) {
    if (!address || typeof address !== 'object') {
        return { provincia: '', codigo_postal: '' };
    }
    const a = /** @type {Record<string, unknown>} */ (address);
    const provincia = String(a.state || a.region || a['ISO3166-2-lvl4'] || '').trim();
    const codigo_postal = String(a.postcode || a.postal_code || '').trim();
    return { provincia, codigo_postal };
}

/**
 * @param {object} p
 * @param {object} [deps]
 */
function coordsPedidoParaReverse(p, deps) {
    if (deps && typeof deps.coordsEfectivasPedidoMapa === 'function') {
        const c = deps.coordsEfectivasPedidoMapa(p);
        if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) return c;
    }
    const la = Number(p.la);
    const ln = Number(p.ln);
    if (Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) > 1e-6 && Math.abs(ln) > 1e-6) {
        return { lat: la, lng: ln };
    }
    return null;
}

/**
 * @param {number} lat
 * @param {number} lng
 */
async function nominatimReverseProvinciaCp(lat, lng) {
    if (typeof fetch !== 'function') return null;
    const getToken = typeof window.getApiToken === 'function' ? window.getApiToken : () => null;
    const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : (p) => String(p || '');
    const token = getToken();
    if (!token) return null;

    try {
        const r = await fetch(apiUrlFn('/api/geocode/nominatim/reverse'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ lat: Number(lat), lon: Number(lng), zoom: 10 }),
        });
        if (!r.ok) return null;
        const j = await r.json().catch(() => null);
        const hit = j?.result;
        if (!hit || typeof hit !== 'object') return null;
        return extraerProvinciaCpDesdeNominatimAddress(hit.address);
    } catch (e) {
        console.warn('[detalle-infer-ubicacion]', e?.message || e);
        return null;
    }
}

/**
 * @param {string} provincia
 * @param {string} codigoPostal
 */
function parchearFilasUbicacionDom(provincia, codigoPostal) {
    const sec = queryDetalleSection('ubicacion');
    if (!sec) return;
    for (const row of sec.querySelectorAll('.dr')) {
        const dl = row.querySelector('.dl');
        const dv = row.querySelector('.dv');
        if (!dl || !dv) continue;
        const label = (dl.textContent || '').trim();
        if (label === 'Provincia' && provincia && (dv.textContent === '—' || !dv.textContent.trim())) {
            dv.textContent = provincia;
        }
        if (
            label === 'Código postal' &&
            codigoPostal &&
            (dv.textContent === '—' || !dv.textContent.trim())
        ) {
            dv.textContent = codigoPostal;
        }
    }
}

/**
 * @param {object} p
 * @param {string} provincia
 * @param {string} codigoPostal
 * @param {object} deps
 */
async function persistirProvinciaCpEnPedido(p, provincia, codigoPostal, deps) {
    const id = parseInt(String(p.id), 10);
    if (!Number.isFinite(id) || String(p.id).startsWith('off_')) return;

    if (provincia) p.cpcia = provincia;
    if (codigoPostal) p.ccp = codigoPostal;

    const list = deps?.app?.p;
    if (Array.isArray(list)) {
        const ix = list.findIndex((x) => String(x.id) === String(p.id));
        if (ix >= 0) {
            if (provincia) list[ix].cpcia = provincia;
            if (codigoPostal) list[ix].ccp = codigoPostal;
        }
    }

    if (!deps?.NEON_OK || deps?.modoOffline || typeof deps?.sqlSimple !== 'function') return;
    const esc = typeof deps.esc === 'function' ? deps.esc : (v) => `'${String(v).replace(/'/g, "''")}'`;
    const sets = [];
    if (provincia) sets.push(`provincia = ${esc(provincia)}`);
    if (codigoPostal) sets.push(`codigo_postal = ${esc(codigoPostal)}`);
    if (!sets.length) return;
    try {
        await deps.sqlSimple(`UPDATE pedidos SET ${sets.join(', ')} WHERE id = ${esc(id)}`);
    } catch (e) {
        console.warn('[detalle-infer-ubicacion-persist]', e?.message || e);
    }
}

/**
 * @param {object} p
 */
export function pedidoNecesitaInferirProvinciaCp(p) {
    const needProv = !String(p?.cpcia || '').trim();
    const needCp = !String(p?.ccp || '').trim();
    return needProv || needCp;
}

/**
 * Tras abrir detalle: completa provincia / CP con Nominatim si faltan y hay WGS84.
 * @param {object} p
 * @param {object} deps
 */
export async function inferirProvinciaCpDetallePedidoSiFalta(p, deps) {
    if (!p || !pedidoNecesitaInferirProvinciaCp(p)) return;

    const coords = coordsPedidoParaReverse(p, deps);
    if (!coords) return;

    const pid = String(p.id ?? '');
    if (!pid || _enCurso.has(pid)) return;
    _enCurso.add(pid);

    const needProv = !String(p.cpcia || '').trim();
    const needCp = !String(p.ccp || '').trim();
    if (needProv || needCp) {
        parchearFilasUbicacionDom(needProv ? '…' : '', needCp ? '…' : '');
    }

    try {
        const hit = await nominatimReverseProvinciaCp(coords.lat, coords.lng);
        if (!hit) return;

        const dm = document.getElementById('dm');
        if (!dm?.classList.contains('active') || String(dm.dataset.detallePedidoId || '') !== pid) {
            return;
        }

        const provincia = needProv ? hit.provincia : String(p.cpcia || '').trim();
        const cp = needCp ? hit.codigo_postal : String(p.ccp || '').trim();
        if (!provincia && !cp) return;

        await persistirProvinciaCpEnPedido(p, provincia, cp, deps);
        parchearFilasUbicacionDom(provincia || '—', cp || '—');

        try {
            const sec = queryDetalleSection('ubicacion');
            if (sec && deps) {
                const sections = buildDetalleSections(p, deps);
                if (sections?.ubicacion) {
                    const scroll = document.querySelector('#dm .gn-dm-detail-scroll');
                    const st = scroll?.scrollTop ?? 0;
                    sec.innerHTML = sections.ubicacion;
                    if (scroll && st > 0) {
                        requestAnimationFrame(() => {
                            scroll.scrollTop = st;
                        });
                    }
                }
            }
        } catch (_) {}
    } finally {
        _enCurso.delete(pid);
    }
}
