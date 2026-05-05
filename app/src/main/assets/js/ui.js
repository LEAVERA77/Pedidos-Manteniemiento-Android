// ui.js - Utilidades de presentación de bajo riesgo

/** Quita prefijos históricos «GestorNova Dice:» en toasts / alert / confirm (mensaje limpio). */
export function stripGestornovaDicePrefix(s) {
    return String(s ?? '')
        .replace(/^\s*GestorNova\s+Dice\s*:\s*/i, '')
        .replace(/^\s*Gestornova\s+dice\s*:\s*/i, '')
        .trim();
}

export function gnDice(msg) {
    return stripGestornovaDicePrefix(String(msg ?? ''));
}

/** Fechas en informes / tablas sin texto tipo GMT-0300. */
export function fmtInformeFecha(v) {
    if (v == null || v === '') return '';
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    try {
        return new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(d);
    } catch (_) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
}

/** Etiqueta legible para teléfonos guardados como dígitos (WhatsApp / Meta). */
export function fmtTelWaMeta(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (!d) return '—';
    if (d.startsWith('54')) return '+' + d;
    return '+' + d;
}

export function escHtmlPrint(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function _gnEscWaHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function _gnWaGeoOpsListHasOpenDetails(listEl) {
    if (!listEl) return false;
    try {
        return !!listEl.querySelector('details.gn-wa-geo-op[open]');
    } catch (_) {
        return false;
    }
}

export function _gnWaGeoOpsShouldSkipAutoRefresh(paused, listEl) {
    return !!paused || _gnWaGeoOpsListHasOpenDetails(listEl);
}

const TIPOS_RECLAMO_SOLICITUD_DERIVACION_TERCERO = new Set([
    'Cables Caídos/Peligro',
    'Poste Inclinado/Dañado',
    'Alumbrado Público (Mantenimiento)',
    'Riesgo en la vía pública',
    'Corrimiento de poste/columna',
]);

export function tipoPermiteSolicitudDerivacionTercero(tt) {
    return TIPOS_RECLAMO_SOLICITUD_DERIVACION_TERCERO.has(String(tt || '').trim());
}

export function normalizarWhatsappInternacionalDesdeInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const digits = s.replace(/\D/g, '');
    if (!digits) return '';
    return `+${digits}`;
}

export { prioridadPredeterminadaPorTipoTrabajoUI, PRIORIDAD_RECLAMO_POR_TIPO } from '../modules/catalogoReclamoPorRubro.js';

export function _escOpt(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

export function htmlOptsUnidadMaterial(val, unidades = []) {
    const u0 = String(val ?? '').trim().toUpperCase();
    let html = unidades
        .map((u) => `<option value="${u}"${u === u0 ? ' selected' : ''}>${u}</option>`)
        .join('');
    if (u0 && unidades.indexOf(u0) < 0) {
        html = `<option value="${u0.replace(/"/g, '&quot;')}" selected>${u0}</option>` + html;
    }
    return html;
}

/** Oculta en pantalla ruido técnico ([Sistema]…, caché, sugerencias GPS) ya persistido en descripción. */
export function sanitizarTextoDescripcionPedidoVista(s) {
    if (s == null || s === '') return '';
    let t = String(s).replace(/\r\n/g, '\n');
    t = t.replace(/\n\nSi podés, enviá[\s\S]*?precisión\./gi, '');
    t = t.replace(/\n\n\[Sistema\][^\n]*/g, '');
    t = t.replace(/\n\[Sistema\][^\n]*/g, '');
    t = t.replace(/\[Sistema\][^\n]*/g, '');
    t = t.replace(/geocodificacion_cache[^\n]*/gi, '');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}

/** Municipio → vecino; cooperativas → socio (etiquetas UI / impresión). */
export function etiquetaFirmaPersona() {
    return String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio' ? 'vecino' : 'socio';
}

export function etiquetaCampoClientePedido() {
    return String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio' ? 'Vecino' : 'Cliente';
}

export function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toR = (x) => (x * Math.PI) / 180;
    const dLat = toR(lat2 - lat1);
    const dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** WGS84 finito, no (0,0), dentro de rango — pin útil en mapa. */
export function coordsSonPinValidasMapaWgs84(la, ln) {
    const a = Number(la);
    const b = Number(ln);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (a === 0 && b === 0) return false;
    if (a < -90 || a > 90 || b < -180 || b > 180) return false;
    return true;
}

/** Texto admin: cómo se obtuvo el pin (política A / re-geocodificación). */
export function etiquetaModoUbicPedido(a) {
    if (!a || typeof a !== 'object') return '';
    const ma = String(a.metodo_ancla || '').trim();
    const anclaEtq = {
        nominatim_inicio_num1: 'Ancla Nominatim (n°1 como inicio aprox.)',
        overpass_addr_min: 'Ancla Overpass (menor addr:housenumber en la zona)',
        overpass_geom_first_node: 'Ancla Overpass (primer nodo, vía más larga)',
    };
    const preAncla = ma ? `${anclaEtq[ma] || `Ancla: ${ma}`}. ` : '';
    const m = String(a.modo || '').trim();
    if (m === 'interpolado_via') {
        return `${preAncla}Aproximada — interpolación sobre vía OSM y vereda por paridad (heurística; no es medición catastral).`;
    }
    if (m === 'localidad') {
        return `${preAncla}Aproximada — centro o búsqueda por localidad / ciudad.`;
    }
    if (m === 'tenant') {
        return `${preAncla}Aproximada — sede o área de referencia del tenant.`;
    }
    if (m === 'region') {
        return `${preAncla}Muy aproximada — región o respaldo geográfico (último recurso).`;
    }
    if (m === 'exacto_aprox') {
        return `${preAncla}Según mapas / catálogo; puede no coincidir con la puerta exacta.`;
    }
    if (m === 'aprox') return `${preAncla}Aproximada (ver fuente en auditoría).`;
    if (preAncla) return preAncla.trim();
    return '';
}

/** Igual que api/utils/parseDomicilioArg.js — texto libre tipo "Doctor Haedo 365, Hasenkamp". */
export function parseDomicilioLibreArgentinaFront(cdir, localidadFallback) {
    const raw = String(cdir || '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,.;-]+|[\s,.;-]+$/g, '')
        .trim();
    if (!raw) return null;
    const fb =
        localidadFallback != null && String(localidadFallback).trim() ? String(localidadFallback).trim() : null;
    const mComa = raw.match(/^(.+?)\s+(\d{1,6})\s*[,;]\s*(.+)$/i);
    if (mComa) {
        return { calle: mComa[1].trim(), numero: mComa[2].trim(), localidad: mComa[3].trim() };
    }
    const soloNum = raw.match(/^(.+?)\s+(\d{1,6})$/);
    if (soloNum && fb) {
        return { calle: soloNum[1].trim(), numero: soloNum[2].trim(), localidad: fb };
    }
    const triple = raw.match(
        /^(.+?)\s+(\d{1,6})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s\-.]{2,79})$/u
    );
    if (triple) {
        const locCand = triple[3].trim();
        if (!/^\d+$/.test(locCand) && locCand.length >= 3) {
            return { calle: triple[1].trim(), numero: triple[2].trim(), localidad: locCand };
        }
    }
    return null;
}

/** URL de la UI pública de Nominatim (solo admin / diagnóstico; el proxy sigue siendo la API Node). */
export function nominatimUiSearchUrlFromTexto(texto) {
    let q = String(texto || '')
        .replace(/\s+/g, ' ')
        .trim();
    const m = q.match(/^q="([^"]+)"/);
    if (m) q = m[1];
    if (q.length < 2) return '';
    return `https://nominatim.openstreetmap.org/ui/search.html?q=${encodeURIComponent(q)}`;
}

export function _normGeoTxt(s) {
    try {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    } catch (_) {
        return String(s || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }
}

/** Campos de Nominatim donde suele aparecer la localidad declarada por el cliente. */
export function _nominatimCamposLocalidad(addr) {
    if (!addr || typeof addr !== 'object') return [];
    const keys = [
        'city',
        'town',
        'village',
        'hamlet',
        'municipality',
        'city_district',
        'suburb',
        'neighbourhood',
        'county',
    ];
    const out = [];
    for (const k of keys) {
        const v = addr[k];
        if (v != null && String(v).trim()) out.push(String(v).trim());
    }
    return out;
}

export function _nominatimResultadoCoincideLocalidad(r, locPedido) {
    const want = _normGeoTxt(locPedido);
    if (!want) return true;
    const dn = _normGeoTxt(r.display_name || '');
    if (dn.includes(want)) return true;
    const addr = r && r.address ? r.address : {};
    const fields = _nominatimCamposLocalidad(addr);
    for (const f of fields) {
        const nf = _normGeoTxt(f);
        if (!nf) continue;
        if (nf === want || nf.includes(want) || want.includes(nf)) return true;
    }
    return false;
}

export function _filtrarNominatimPorLocalidad(results, locPedido) {
    const arr = Array.isArray(results) ? results : [];
    return arr.filter((r) => _nominatimResultadoCoincideLocalidad(r, locPedido));
}

export function _nominatimSearchCacheKey(merged) {
    const o = merged && typeof merged === 'object' ? merged : {};
    const keys = Object.keys(o).sort();
    const norm = {};
    for (const k of keys) {
        const v = o[k];
        if (v == null) continue;
        const s = String(v).trim();
        if (!s) continue;
        norm[String(k).toLowerCase()] = s;
    }
    return JSON.stringify(norm);
}

export function _nominatimMetaFromHit(r) {
    if (!r) return {};
    const addr = r.address && typeof r.address === 'object' ? r.address : {};
    return {
        display_name: String(r.display_name || '').trim(),
        type: r.type != null ? String(r.type) : '',
        house_number: addr.house_number != null ? String(addr.house_number).trim() : '',
    };
}

export function _parseHouseNumberNominatim(addr) {
    const raw = addr && addr.house_number != null ? String(addr.house_number).trim() : '';
    if (!raw) return null;
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

export function _nominatimTipoRankPedido(r) {
    const t = String((r && r.type) || '').toLowerCase();
    if (t === 'house') return 0;
    if (t === 'building' || t === 'apartments' || t === 'residential') return 1;
    return 2;
}

export function decimalToDmsLite(decimal, isLat) {
    const n = Number(decimal);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    const hemi = isLat ? (n >= 0 ? 'N' : 'S') : (n >= 0 ? 'E' : 'O');
    return `${deg}° ${min}' ${sec}" ${hemi}`;
}

export function dmsToDecimalLite(raw) {
    const s = String(raw || '').trim();
    if (!s) return Number.NaN;
    if (!/[°º'′´"″]/.test(s)) return parseFloat(s.replace(',', '.'));
    const m = s.match(/^\s*(\d+)[°º]\s*(\d+)['′´]\s*([\d.,]+)\s*["″]?\s*([NnSsEeOoWw])\s*$/);
    if (!m) return Number.NaN;
    const deg = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseFloat(String(m[3]).replace(',', '.'));
    const hemi = m[4].toUpperCase();
    if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return Number.NaN;
    let dec = deg + min / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W' || hemi === 'O') dec = -dec;
    return dec;
}

/** Convierte hit Nominatim a viewbox: min_lon,max_lat,max_lon,min_lat. */
export function _nominatimViewboxFromResult(r) {
    if (!r || !Array.isArray(r.boundingbox) || r.boundingbox.length < 4) return null;
    const [south, north, west, east] = r.boundingbox.map((x) => Number(x));
    if (![south, north, west, east].every((n) => Number.isFinite(n))) return null;
    return `${west},${north},${east},${south}`;
}

export function _gnGeocodeLogTs() {
    try {
        return new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    } catch (_) {
        return '';
    }
}
