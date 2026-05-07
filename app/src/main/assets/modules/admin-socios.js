/**
 * Admin: catálogo de socios / vecinos (tabla virtual, columnas, import Excel).
 * Lógica movida desde app.js; dependencias inyectadas vía initAdminSocios.
 * made by leavera77
 */

import { esc, parseDecimalODmsCoord, validarWgs84Import } from './utils.js';
import { quitarMovil9Tras54Digitos } from './normalizar-telefono.js';
import { logErrorWeb, mensajeErrorUsuario, toastError, escHtmlPrint, toast } from './ui-utils.js';
import {
    fajaArgentinaPorLongitud,
    resolverFajaProyeccion,
    convertirProyectadasARGaWgs84,
    proyectarWgs84AFamiliaFaja,
    PMG_FAMILIAS_PROYECCION_LIST,
    etiquetaFamiliaProyeccionCorta,
    etiquetaFamiliaProyeccionLarga
} from '../map.js';

/** @type {Record<string, unknown> | null} */
let _sociosDeps = null;

function req() {
    if (!_sociosDeps) throw new Error('initAdminSocios debe llamarse antes de usar el módulo socios');
    return _sociosDeps;
}

/**
 * @param {object} deps
 */
export function initAdminSocios(deps) {
    _sociosDeps = deps;
    try {
        window.actualizarUiSociosVistaProyeccion = actualizarUiSociosVistaProyeccion;
        window.descargarPlanillaSociosCsvExport = descargarPlanillaSociosCsvExport;
    } catch (_) {}
}

function actualizarUiSociosImportCrs() {
    try {
        const optArg = document.getElementById('socios-import-crs-arg-opt');
        const fam = String((window.EMPRESA_CFG || {}).coord_proy_familia || '').trim();
        const ok = !!fam && fam !== 'none';
        if (optArg) {
            optArg.disabled = !ok;
            const sel = document.getElementById('socios-import-crs');
            if (!ok && sel && sel.value === 'arg_en') sel.value = 'wgs84';
        }
        const crs = document.getElementById('socios-import-crs')?.value;
        const w = document.getElementById('socios-import-faja-wrap');
        if (w) w.style.display = crs === 'arg_en' ? '' : 'none';
    } catch (_) {}
}
window.actualizarUiSociosImportCrs = actualizarUiSociosImportCrs;

function obtenerZonaImportSociosProyectadas() {
    const sel = document.getElementById('socios-import-faja')?.value || 'auto';
    if (/^[1-7]$/.test(sel)) return parseInt(sel, 10);
    const cfg = window.EMPRESA_CFG || {};
    const lo = Number(cfg.lng_base);
    if (Number.isFinite(lo)) return resolverFajaProyeccion('instal', lo);
    return fajaArgentinaPorLongitud(-64);
}

/** Columnas opcionales del listado (entre Provincia y Calle, salvo Dist. que va después de Tel.). */
const SOCIOS_CATALOGO_OPTS_PRE_CALLE = [
    { id: 'codigo_postal', th: 'Cód. postal', field: 'codigo_postal' },
    { id: 'barrio', th: 'Barrio', field: 'barrio' },
    { id: 'transformador', th: 'Transf.', field: 'transformador' },
    { id: 'tipo_tarifa', th: 'Tarifa', field: 'tipo_tarifa' },
    { id: 'urbano_rural', th: 'U/R', field: 'urbano_rural' },
    { id: 'tipo_conexion', th: 'Conex.', field: 'tipo_conexion' },
    { id: 'fases', th: 'Fases', field: 'fases' },
];
const SOCIOS_CATALOGO_OPT_DISTRIB = { id: 'distribuidor_codigo', th: 'Dist.', field: 'distribuidor_codigo' };
const LS_SOC_COLVIS = 'pmg_socios_colvis_v1';

function sociosCatalogoRubroActualParaColumnas() {
    return req().normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) || 'cooperativa_electrica';
}

/** Predeterminado por rubro (sin tocar columnas fijas: NIS, medidor, nombre, localidad, provincia, calle, nº, tel., lat, lon, estado). */
function sociosCatalogoColumnasOpcionalesDefectoPorRubro(rubro) {
    const r = rubro || sociosCatalogoRubroActualParaColumnas();
    const all = new Set([...SOCIOS_CATALOGO_OPTS_PRE_CALLE.map((o) => o.id), SOCIOS_CATALOGO_OPT_DISTRIB.id]);
    if (r === 'cooperativa_electrica') return all;
    if (r === 'cooperativa_agua') return new Set(['codigo_postal', 'barrio', 'distribuidor_codigo']);
    if (r === 'municipio') return new Set(['codigo_postal', 'barrio']);
    return all;
}

function sociosCatalogoIdsOpcionalesPermitidos() {
    return new Set([...SOCIOS_CATALOGO_OPTS_PRE_CALLE.map((o) => o.id), SOCIOS_CATALOGO_OPT_DISTRIB.id]);
}

function sociosCatalogoLeerSetColumnasOpcionalesVisibles() {
    const rubro = sociosCatalogoRubroActualParaColumnas();
    const allowed = sociosCatalogoIdsOpcionalesPermitidos();
    try {
        const raw = localStorage.getItem(LS_SOC_COLVIS);
        if (raw) {
            const o = JSON.parse(raw);
            const arr = o && o.porRubro && Array.isArray(o.porRubro[rubro]) ? o.porRubro[rubro] : null;
            if (arr != null) {
                return new Set(arr.filter((id) => allowed.has(id)));
            }
        }
    } catch (_) {}
    return sociosCatalogoColumnasOpcionalesDefectoPorRubro(rubro);
}

function sociosCatalogoGuardarColumnasOpcionalesVisibles(setIds) {
    const rubro = sociosCatalogoRubroActualParaColumnas();
    const allowed = sociosCatalogoIdsOpcionalesPermitidos();
    const arr = [...setIds].filter((id) => allowed.has(id));
    let o = { version: 1, porRubro: {} };
    try {
        const raw = localStorage.getItem(LS_SOC_COLVIS);
        if (raw) {
            const prev = JSON.parse(raw);
            if (prev && typeof prev === 'object' && prev.porRubro) o.porRubro = { ...prev.porRubro };
        }
    } catch (_) {}
    o.porRubro[rubro] = arr;
    try {
        localStorage.setItem(LS_SOC_COLVIS, JSON.stringify(o));
    } catch (_) {}
}

function sociosCatalogoRestaurarColumnasOpcionalesPorRubro() {
    const rubro = sociosCatalogoRubroActualParaColumnas();
    try {
        const raw = localStorage.getItem(LS_SOC_COLVIS);
        if (!raw) {
            void cargarListaSociosAdmin();
            return;
        }
        const o = JSON.parse(raw);
        if (o && o.porRubro && o.porRubro[rubro] != null) delete o.porRubro[rubro];
        if (!o.porRubro || Object.keys(o.porRubro).length === 0) localStorage.removeItem(LS_SOC_COLVIS);
        else localStorage.setItem(LS_SOC_COLVIS, JSON.stringify(o));
    } catch (_) {}
    void cargarListaSociosAdmin();
}
window.sociosCatalogoRestaurarColumnasOpcionalesPorRubro = sociosCatalogoRestaurarColumnasOpcionalesPorRubro;

function sociosCatalogoHtmlThOpcionalesPreCalle(vis) {
    let h = '';
    for (const o of SOCIOS_CATALOGO_OPTS_PRE_CALLE) {
        if (!vis.has(o.id)) continue;
        h += `<th>${o.th}</th>`;
    }
    return h;
}

function sociosCatalogoHtmlTdOpcionalesPreCalle(s, vis, escCell) {
    let h = '';
    for (const o of SOCIOS_CATALOGO_OPTS_PRE_CALLE) {
        if (!vis.has(o.id)) continue;
        h += `<td>${escCell(s[o.field])}</td>`;
    }
    return h;
}

function sociosCatalogoHtmlThDistrib(vis) {
    return vis.has(SOCIOS_CATALOGO_OPT_DISTRIB.id) ? `<th>${SOCIOS_CATALOGO_OPT_DISTRIB.th}</th>` : '';
}

function sociosCatalogoHtmlTdDistrib(s, vis, escCell) {
    return vis.has(SOCIOS_CATALOGO_OPT_DISTRIB.id) ? `<td>${escCell(s[SOCIOS_CATALOGO_OPT_DISTRIB.field])}</td>` : '';
}

function sociosCatalogoRenderPanelPreferenciasColumnas() {
    const host = document.getElementById('socios-colprefs-cbs');
    if (!host) return;
    const vis = sociosCatalogoLeerSetColumnasOpcionalesVisibles();
    const parts = [];
    for (const o of [...SOCIOS_CATALOGO_OPTS_PRE_CALLE, SOCIOS_CATALOGO_OPT_DISTRIB]) {
        const ck = vis.has(o.id) ? ' checked' : '';
        parts.push(
            `<label style="display:inline-flex;align-items:center;gap:.3rem;cursor:pointer;white-space:nowrap"><input type="checkbox" data-socios-colvis="${o.id}"${ck}/><span>${o.th}</span></label>`
        );
    }
    host.innerHTML = parts.join('');
    host.querySelectorAll('input[data-socios-colvis]').forEach((inp) => {
        inp.addEventListener('change', () => {
            const next = new Set();
            host.querySelectorAll('input[data-socios-colvis]').forEach((el) => {
                if (el.checked) next.add(el.getAttribute('data-socios-colvis'));
            });
            sociosCatalogoGuardarColumnasOpcionalesVisibles(next);
            void cargarListaSociosAdmin();
        });
    });
}

/** Mapa localidad+provincia → código de área (carga perezosa desde Neon). */
let _sociosMapCodigoAreaArgImport = null;
let _sociosCodigoAreaArgByProvImport = null;
let _sociosCodigoAreaArgProvinciasNormSet = null;
let _sociosMapCodigoAreaArgImportIntentado = false;

/** Texto para comparar localidad/provincia con la tabla (minúsculas, sin acentos, espacios colapsados). */
function sociosCatalogoNormalizarTextoGeoArg(s) {
    let t = String(s || '')
        .trim()
        .toLowerCase();
    try {
        t = t.normalize('NFD').replace(/\p{M}/gu, '');
    } catch (_) {
        t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return t.replace(/\s+/g, ' ').trim();
}

function sociosCatalogoLevenshteinGeoArg(a, b) {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    if (m > 36 || n > 36) return a === b ? 0 : 40;
    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const cur = dp[j];
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
            prev = cur;
        }
    }
    return dp[n];
}

function sociosCatalogoScoreMatchLocGeoArg(query, cand) {
    if (query === cand) return 100;
    const q = query;
    const c = cand;
    const minl = Math.min(q.length, c.length);
    if (minl >= 4) {
        if (q.startsWith(c) || c.startsWith(q)) return 88;
        if (q.includes(c) || c.includes(q)) return minl >= 5 ? 78 : 68;
    }
    const lev = sociosCatalogoLevenshteinGeoArg(q, c);
    const mx = Math.max(q.length, c.length) || 1;
    const thr = mx <= 10 ? 2 : mx <= 18 ? 3 : 4;
    if (lev <= thr) return 72 - lev;
    return 0;
}

function sociosCatalogoResolverProvinciaCodigoAreaImport(provincia) {
    const set = _sociosCodigoAreaArgProvinciasNormSet;
    const provN = sociosCatalogoNormalizarTextoGeoArg(provincia);
    if (!provN) return { provKey: '', avisoProv: null };
    if (!set || !set.size) return { provKey: provN, avisoProv: null };
    if (set.has(provN)) return { provKey: provN, avisoProv: null };
    let best = null;
    let bestD = 99;
    for (const p of set) {
        const d = sociosCatalogoLevenshteinGeoArg(provN, p);
        if (d < bestD) {
            bestD = d;
            best = p;
        }
    }
    const maxD = provN.length <= 5 ? 1 : provN.length <= 12 ? 2 : provN.length <= 22 ? 3 : 4;
    if (best != null && bestD <= maxD && bestD > 0) {
        return {
            provKey: best,
            avisoProv: `Provincia «${String(provincia).trim()}» → «${best}» (aprox., tabla de áreas)`,
        };
    }
    return { provKey: provN, avisoProv: null };
}

/**
 * Resuelve código de área con coincidencia exacta o difusa (localidad mal escrita, provincia sin tilde).
 * @returns {{ cod: string|null, aviso: string|null, modo: string }}
 */
function sociosCatalogoResolverCodigoAreaArgentina(localidad, provincia) {
    const map = _sociosMapCodigoAreaArgImport;
    const byProv = _sociosCodigoAreaArgByProvImport;
    if (!map || !map.size) return { cod: null, aviso: null, modo: 'none' };
    const locN = sociosCatalogoNormalizarTextoGeoArg(localidad);
    if (!locN) return { cod: null, aviso: null, modo: 'none' };
    const pr = sociosCatalogoResolverProvinciaCodigoAreaImport(provincia);
    const provK = pr.provKey;
    let aviso = pr.avisoProv;
    const tryKey = (pk) => {
        const k = `${locN}\t${pk}`;
        return map.has(k) ? map.get(k) : null;
    };
    let cod = tryKey(provK);
    if (cod) return { cod, aviso, modo: 'exact' };
    const provRaw = sociosCatalogoNormalizarTextoGeoArg(provincia);
    if (provRaw && provRaw !== provK) {
        cod = tryKey(provRaw);
        if (cod) return { cod, aviso: aviso || null, modo: 'exact' };
    }
    const candidates = (byProv && provK ? byProv.get(provK) : null) || [];
    if (!candidates.length) {
        return {
            cod: null,
            aviso: aviso || `Sin código de área para «${String(localidad).trim()}» / «${String(provincia).trim()}»`,
            modo: 'none',
        };
    }
    let bestSc = 0;
    const scored = [];
    for (const row of candidates) {
        const sc = sociosCatalogoScoreMatchLocGeoArg(locN, row.locN);
        scored.push({ sc, cod: row.cod, locM: row.locN });
        if (sc > bestSc) bestSc = sc;
    }
    if (bestSc < 60) {
        return {
            cod: null,
            aviso: aviso || `Sin coincidencia de localidad para «${String(localidad).trim()}» (${provK})`,
            modo: 'none',
        };
    }
    const tops = scored.filter((x) => x.sc === bestSc);
    const cods = [...new Set(tops.map((t) => t.cod))];
    if (cods.length !== 1) {
        return {
            cod: null,
            aviso:
                (aviso ? aviso + ' · ' : '') +
                `Localidad ambigua para «${String(localidad).trim()}» (${tops.length} coincidencias)`,
            modo: 'ambiguous',
        };
    }
    const locMatch = tops[0].locM;
    const extra =
        locMatch === locN
            ? null
            : `Localidad «${String(localidad).trim()}» → «${locMatch}» (aprox., código ${cods[0]})`;
    return {
        cod: cods[0],
        aviso: extra ? (aviso ? aviso + ' · ' + extra : extra) : aviso,
        modo: locMatch === locN && !aviso ? 'exact' : 'fuzzy_loc',
    };
}

async function sociosCatalogoCargarMapaCodigosAreaArgentinaImport() {
    if (_sociosMapCodigoAreaArgImportIntentado) return _sociosMapCodigoAreaArgImport || new Map();
    _sociosMapCodigoAreaArgImportIntentado = true;
    const m = new Map();
    const byProv = new Map();
    const provSet = new Set();
    try {
        const r = await req().sqlSimple(
            'SELECT codigo_area, localidad, provincia FROM codigos_area_argentina'
        );
        for (const row of r.rows || []) {
            const locRaw = String(row.localidad || '').trim();
            const provRaw = String(row.provincia || '').trim();
            const cod = String(row.codigo_area || '').replace(/\D/g, '');
            if (!locRaw || !cod) continue;
            const locN = sociosCatalogoNormalizarTextoGeoArg(locRaw);
            const provN = sociosCatalogoNormalizarTextoGeoArg(provRaw);
            if (!locN) continue;
            const k = `${locN}\t${provN}`;
            if (!m.has(k)) m.set(k, cod);
            provSet.add(provN);
            if (!byProv.has(provN)) byProv.set(provN, []);
            byProv.get(provN).push({ locN, cod, locRaw, provRaw });
        }
        _sociosMapCodigoAreaArgImport = m;
        _sociosCodigoAreaArgByProvImport = byProv;
        _sociosCodigoAreaArgProvinciasNormSet = provSet;
    } catch (_) {
        _sociosMapCodigoAreaArgImport = m;
        _sociosCodigoAreaArgByProvImport = byProv;
        _sociosCodigoAreaArgProvinciasNormSet = provSet;
    }
    return _sociosMapCodigoAreaArgImport;
}

function sociosCatalogoBuscarCodigoAreaEnMapaImport(localidad, provincia) {
    return sociosCatalogoResolverCodigoAreaArgentina(localidad, provincia).cod;
}

/** Quita un «15» entre código de área (2–4 dígitos) y abonado (6–10 dígitos), típico móvil AR. */
function sociosCatalogoTelefonoQuitar15TrasArea(d) {
    const s = String(d || '').replace(/\D/g, '');
    const m = s.match(/^(\d{2,4})15(\d{6,10})$/);
    return m ? m[1] + m[2] : s;
}

function sociosCatalogoTelefonoColapsar15Repetido(d) {
    let s = String(d || '').replace(/\D/g, '');
    for (let i = 0; i < 8; i++) {
        const n = s.replace(/1515/g, '15');
        if (n === s) break;
        s = n;
    }
    return s;
}

/** Tras armar dígitos con prefijo país 54 + área + abonado, quita el 9 móvil (549… → 54…). */
function sociosImportTelefonoCanon54(digits549style) {
    const q = quitarMovil9Tras54Digitos(String(digits549style || '').replace(/\D/g, ''));
    return q.length >= 11 && q.length <= 15 ? q : '';
}

/**
 * Normaliza a dígitos E.164 Argentina (54 + área + abonado, sin 9 móvil tras el 54).
 * Usa tabla codigos_area_argentina si el número viene solo con prefijo 15 y localidad/provincia.
 */
function normalizarTelefonoArgentinaImportSociosSync(raw, localidad, provincia) {
    const orig = String(raw || '').trim();
    let d = orig.replace(/\D/g, '');
    if (!d || d.length < 6) return orig || null;
    d = sociosCatalogoTelefonoColapsar15Repetido(d);
    if (d.startsWith('549')) {
        let r = d.slice(3).replace(/^0+/, '');
        if (/^9\d/.test(r) && r.length >= 3) {
            const r2 = r.slice(1).replace(/^0+/, '');
            if (r2.length >= 8) r = r2;
        }
        let prev;
        for (let i = 0; i < 5; i++) {
            prev = r;
            r = sociosCatalogoTelefonoQuitar15TrasArea(r);
            if (r === prev) break;
        }
        const out = ('549' + r).replace(/\D/g, '');
        return sociosImportTelefonoCanon54(out) || orig || null;
    }
    if (d.startsWith('54') && !d.startsWith('549')) {
        d = '549' + d.slice(2).replace(/^0+/, '');
        d = sociosCatalogoTelefonoColapsar15Repetido(d);
    }
    if (d.startsWith('549')) {
        let r = d.slice(3).replace(/^0+/, '');
        let prev;
        for (let i = 0; i < 5; i++) {
            prev = r;
            r = sociosCatalogoTelefonoQuitar15TrasArea(r);
            if (r === prev) break;
        }
        const out = ('549' + r).replace(/\D/g, '');
        return sociosImportTelefonoCanon54(out) || orig || null;
    }
    while (d.startsWith('0') && d.length >= 10) d = d.slice(1);
    d = sociosCatalogoTelefonoColapsar15Repetido(d);
    if (/^15\d{6,10}$/.test(d)) {
        const sub = d.slice(2);
        const ar = sociosCatalogoBuscarCodigoAreaEnMapaImport(localidad, provincia);
        if (ar) d = String(ar).replace(/\D/g, '') + sub;
        else d = sub;
    } else {
        let prev;
        for (let i = 0; i < 5; i++) {
            prev = d;
            d = sociosCatalogoTelefonoQuitar15TrasArea(d);
            if (d === prev) break;
        }
    }
    if (!d.startsWith('549')) {
        if (d.startsWith('54')) d = '549' + d.slice(2).replace(/^0+/, '');
        else d = '549' + d.replace(/^0+/, '');
    }
    d = sociosCatalogoTelefonoColapsar15Repetido(d.replace(/\D/g, ''));
    if (d.startsWith('549')) {
        let r = d.slice(3).replace(/^0+/, '');
        let prev;
        for (let i = 0; i < 5; i++) {
            prev = r;
            r = sociosCatalogoTelefonoQuitar15TrasArea(r);
            if (r === prev) break;
        }
        d = ('549' + r).replace(/\D/g, '');
    }
    if (!d.startsWith('549')) return orig || null;
    return sociosImportTelefonoCanon54(d) || orig || null;
}

function sociosCatalogoParseObjetoDatosExtra(val) {
    if (val == null) return null;
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            const p = JSON.parse(val);
            return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
        } catch (_) {}
    }
    return null;
}

function sociosCatalogoExtraerClavesDatosExtra(rows, maxKeys) {
    const mx = Math.max(1, Math.min(40, maxKeys == null ? 28 : maxKeys));
    const k = new Set();
    for (const row of rows) {
        const o = sociosCatalogoParseObjetoDatosExtra(row.datos_extra);
        if (!o) continue;
        for (const key of Object.keys(o)) {
            const nk = String(key || '').trim();
            if (nk) k.add(nk);
            if (k.size >= mx) break;
        }
        if (k.size >= mx) break;
    }
    return [...k].sort();
}

function sociosCatalogoHtmlExtrasDatosExtra(s, keys, escCell) {
    const o = sociosCatalogoParseObjetoDatosExtra(s.datos_extra);
    let h = '';
    for (const key of keys) {
        const v = o && o[key] != null ? String(o[key]) : '';
        h += `<td style="max-width:9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escCell(v)}">${escCell(v)}</td>`;
    }
    return h;
}

function escCsvCeldaSocios(v) {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

/** CSV UTF-8 con BOM (compatible Excel) con columnas de la planilla actual, incl. teléfonos. */
export function descargarPlanillaSociosCsvExport() {
    const rows = typeof window !== 'undefined' ? window._sociosVirtualRows : null;
    if (!Array.isArray(rows) || !rows.length) {
        toastError('No hay datos cargados. Abrí Socios y esperá a que cargue la lista.');
        return;
    }
    const extraKeys = Array.isArray(window._sociosDatosExtraColumnKeys) ? window._sociosDatosExtraColumnKeys : [];
    const baseHeaders = [
        'id',
        'nis_medidor',
        'nis',
        'medidor',
        'nombre',
        'calle',
        'numero',
        'barrio',
        'telefono',
        'distribuidor_codigo',
        'localidad',
        'provincia',
        'codigo_postal',
        'tipo_tarifa',
        'urbano_rural',
        'transformador',
        'tipo_conexion',
        'fases',
        'latitud',
        'longitud',
        'activo',
    ];
    const headers = [...baseHeaders, ...extraKeys.map((k) => `extra_${k}`)];
    const lines = [headers.join(',')];
    for (const r of rows) {
        const cells = headers.map((h) => {
            if (h.startsWith('extra_')) {
                const k = h.slice(6);
                const o = sociosCatalogoParseObjetoDatosExtra(r.datos_extra);
                return escCsvCeldaSocios(o && o[k] != null ? o[k] : '');
            }
            return escCsvCeldaSocios(r[h]);
        });
        lines.push(cells.join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `socios_catalogo_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    try {
        toast('Planilla descargada (CSV). Abrila con Excel si querés.');
    } catch (_) {}
}

const LS_SOC_VISTA_PROY = 'pmg_socios_vista_proy';

function leerPrefsVistaProyeccionSociosCatalogo() {
    try {
        const raw = localStorage.getItem(LS_SOC_VISTA_PROY);
        if (raw) {
            const o = JSON.parse(raw);
            if (o && typeof o === 'object' && (o.modo === 'solo_wgs' || o.modo === 'extra_proy')) {
                const fams = Array.isArray(o.familias)
                    ? o.familias.filter((f) => PMG_FAMILIAS_PROYECCION_LIST.includes(f))
                    : [];
                const fp = String(o.familia_primaria || '').trim();
                return {
                    modo: o.modo,
                    familias: fams,
                    familia_primaria: PMG_FAMILIAS_PROYECCION_LIST.includes(fp) ? fp : ''
                };
            }
        }
    } catch (_) {}
    return { modo: 'solo_wgs', familias: [], familia_primaria: '' };
}

function guardarPrefsVistaProyeccionSociosCatalogo(p) {
    try {
        const prev = leerPrefsVistaProyeccionSociosCatalogo();
        const next = {
            modo: p.modo !== undefined ? p.modo : prev.modo,
            familias: p.familias !== undefined ? p.familias : prev.familias,
            familia_primaria: p.familia_primaria !== undefined ? p.familia_primaria : prev.familia_primaria
        };
        localStorage.setItem(LS_SOC_VISTA_PROY, JSON.stringify(next));
    } catch (_) {}
}

/** Orden de columnas X/Y: la familia «principal» va primero si está entre las elegidas. */
function ordenarFamiliasVistaProy(fams, primaria) {
    const arr = Array.isArray(fams) ? fams.filter((f) => PMG_FAMILIAS_PROYECCION_LIST.includes(f)) : [];
    const p = String(primaria || '').trim();
    if (!p || !arr.includes(p)) return arr;
    return [p, ...arr.filter((f) => f !== p)];
}

function obtenerNumColsTablaSociosAdmin() {
    const p = leerPrefsVistaProyeccionSociosCatalogo();
    const nProy = p.modo === 'extra_proy' && p.familias.length ? p.familias.length * 2 : 0;
    const vis = sociosCatalogoLeerSetColumnasOpcionalesVisibles();
    let opt = 0;
    for (const o of SOCIOS_CATALOGO_OPTS_PRE_CALLE) {
        if (vis.has(o.id)) opt++;
    }
    if (vis.has(SOCIOS_CATALOGO_OPT_DISTRIB.id)) opt++;
    const nExtra = Number(window._sociosDatosExtraColCount || 0) || 0;
    return 11 + opt + nProy + nExtra;
}

/** Misma regla que import Este/Norte: faja Auto según longitud de la central (`lng_base`). */
function obtenerZonaVistaSociosCatalogo() {
    return obtenerZonaImportSociosProyectadas();
}

function armarHeadExtraProyeccionSociosHtml() {
    const prefs = leerPrefsVistaProyeccionSociosCatalogo();
    if (prefs.modo !== 'extra_proy' || !prefs.familias.length) return '';
    const z = obtenerZonaVistaSociosCatalogo();
    const orden = ordenarFamiliasVistaProy(prefs.familias, prefs.familia_primaria);
    let h = '';
    for (const fam of orden) {
        const ab = etiquetaFamiliaProyeccionCorta(fam);
        const larga = etiquetaFamiliaProyeccionLarga(fam);
        h += `<th align="right" title="Este X (m) · ${larga} · faja ${z} (proyección desde WGS84)">X (${ab})</th><th align="right" title="Norte Y (m) · ${larga} · faja ${z}">Y (${ab})</th>`;
    }
    return h;
}

function htmlCeldasProyeccionSociosDesdeLatLng(lat, lon) {
    const prefs = leerPrefsVistaProyeccionSociosCatalogo();
    if (prefs.modo !== 'extra_proy' || !prefs.familias.length) return '';
    const la = Number(lat);
    const lo = Number(lon);
    const orden = ordenarFamiliasVistaProy(prefs.familias, prefs.familia_primaria);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        return orden.map(() => '<td>—</td><td>—</td>').join('');
    }
    const z = obtenerZonaVistaSociosCatalogo();
    let out = '';
    for (const fam of orden) {
        const pr = proyectarWgs84AFamiliaFaja(la, lo, fam, z);
        const ab = etiquetaFamiliaProyeccionCorta(fam);
        const larga = etiquetaFamiliaProyeccionLarga(fam);
        const tip = `${larga} · faja ${z} · Este/Norte (m)`;
        if (pr) {
            const xe = pr.e.toFixed(1).replace('.', ',');
            const yn = pr.n.toFixed(1).replace('.', ',');
            out += `<td align="right" title="${tip}">${xe}</td><td align="right" title="${tip}">${yn}</td>`;
        } else {
            out += '<td>—</td><td>—</td>';
        }
    }
    return out;
}

function actualizarUiSociosVistaProyeccion() {
    try {
        const p = leerPrefsVistaProyeccionSociosCatalogo();
        const rSolo = document.querySelector('input[name="socios-tabla-proy-mode"][value="solo_wgs"]');
        const rEx = document.querySelector('input[name="socios-tabla-proy-mode"][value="extra_proy"]');
        if (rSolo && rEx) {
            if (p.modo === 'extra_proy') rEx.checked = true;
            else rSolo.checked = true;
        }
        const box = document.getElementById('socios-vista-proy-checks');
        if (box) box.style.display = p.modo === 'extra_proy' ? 'flex' : 'none';
        document.querySelectorAll('.socios-proy-fam-cb').forEach((cb) => {
            const fam = cb.getAttribute('data-fam');
            if (fam) cb.checked = p.familias.includes(fam);
        });
        const selP = document.getElementById('socios-proy-fam-primaria');
        if (selP) {
            const v = p.familia_primaria && p.familias.includes(p.familia_primaria) ? p.familia_primaria : '';
            selP.value = v || '';
        }
    } catch (_) {}
}

function onCambioVistaProySocios() {
    const m = document.querySelector('input[name="socios-tabla-proy-mode"]:checked')?.value || 'solo_wgs';
    const prev = leerPrefsVistaProyeccionSociosCatalogo();
    const famsSel = [...document.querySelectorAll('.socios-proy-fam-cb:checked')]
        .map((c) => c.getAttribute('data-fam'))
        .filter(Boolean);
    const fams =
        m === 'extra_proy' ? (famsSel.length ? famsSel : prev.familias) : prev.familias;
    guardarPrefsVistaProyeccionSociosCatalogo({ modo: m, familias: fams, familia_primaria: prev.familia_primaria });
    actualizarUiSociosVistaProyeccion();
    if (document.getElementById('admin-socios')?.classList.contains('active')) void cargarListaSociosAdmin();
}
window.onCambioVistaProySocios = onCambioVistaProySocios;

function onCambioCheckFamProySocios() {
    const m = document.querySelector('input[name="socios-tabla-proy-mode"]:checked')?.value || 'solo_wgs';
    if (m !== 'extra_proy') return;
    const prev = leerPrefsVistaProyeccionSociosCatalogo();
    const fams = [...document.querySelectorAll('.socios-proy-fam-cb:checked')].map((c) => c.getAttribute('data-fam')).filter(Boolean);
    let fp = prev.familia_primaria;
    if (fp && !fams.includes(fp)) fp = '';
    guardarPrefsVistaProyeccionSociosCatalogo({ modo: 'extra_proy', familias: fams, familia_primaria: fp });
    actualizarUiSociosVistaProyeccion();
    if (document.getElementById('admin-socios')?.classList.contains('active')) void cargarListaSociosAdmin();
}
window.onCambioCheckFamProySocios = onCambioCheckFamProySocios;

function onCambioFamiliaPrimariaSociosCatalogo() {
    const sel = document.getElementById('socios-proy-fam-primaria');
    const prim = (sel?.value || '').trim();
    const prev = leerPrefsVistaProyeccionSociosCatalogo();
    const m = document.querySelector('input[name="socios-tabla-proy-mode"]:checked')?.value || 'solo_wgs';
    let fams = [...document.querySelectorAll('.socios-proy-fam-cb:checked')].map((c) => c.getAttribute('data-fam')).filter(Boolean);
    if (m === 'extra_proy' && prim && PMG_FAMILIAS_PROYECCION_LIST.includes(prim)) {
        const cb = document.querySelector(`.socios-proy-fam-cb[data-fam="${prim}"]`);
        if (cb && !cb.checked) {
            cb.checked = true;
            if (!fams.includes(prim)) fams.push(prim);
        }
    }
    guardarPrefsVistaProyeccionSociosCatalogo({
        modo: m,
        familias: m === 'extra_proy' ? fams : prev.familias,
        familia_primaria: prim
    });
    actualizarUiSociosVistaProyeccion();
    if (document.getElementById('admin-socios')?.classList.contains('active')) void cargarListaSociosAdmin();
}
window.onCambioFamiliaPrimariaSociosCatalogo = onCambioFamiliaPrimariaSociosCatalogo;

async function cargarListaSociosAdmin() {
    const cont = document.getElementById('lista-socios-admin');
    if (!cont) return;
    cont.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const hasSocTList = await req().sociosCatalogoTieneTenantId();
        const hasDEList = await req().sociosCatalogoTieneDatosExtra();
        const wf = hasSocTList ? ` WHERE tenant_id = ${esc(req().tenantIdActual())}` : '';
        const colDe = hasDEList ? ', datos_extra' : '';
        const r = await req().sqlSimpleSelectAllPages(
            `SELECT id, nis_medidor, nis, medidor, nombre, calle, numero, barrio, telefono, distribuidor_codigo, localidad, provincia, codigo_postal, tipo_tarifa, urbano_rural, transformador, tipo_conexion, fases, latitud, longitud, activo${colDe} FROM socios_catalogo${wf}`,
            'ORDER BY nis_medidor'
        );
        const rows = r.rows || [];
        if (!rows.length) {
            cont.innerHTML = '<p style="color:var(--tl);font-size:.85rem">Sin socios. Importá un Excel.</p>';
            window._sociosVirtualRows = null;
            window._sociosDatosExtraColumnKeys = [];
            window._sociosDatosExtraColCount = 0;
            return;
        }
        const extraKeys = hasDEList ? sociosCatalogoExtraerClavesDatosExtra(rows) : [];
        window._sociosDatosExtraColumnKeys = extraKeys;
        window._sociosDatosExtraColCount = extraKeys.length;
        window._sociosVirtualRows = rows;
        window._sociosVirtualRowHeight = 31;
        window._sociosTablaColCount = obtenerNumColsTablaSociosAdmin();
        const headExtra = armarHeadExtraProyeccionSociosHtml();
        const visCols = sociosCatalogoLeerSetColumnasOpcionalesVisibles();
        const thPre = sociosCatalogoHtmlThOpcionalesPreCalle(visCols);
        const thDist = sociosCatalogoHtmlThDistrib(visCols);
        const thNis = req().esMunicipioRubro() ? 'ID vecino' : 'NIS';
        const thExtras =
            extraKeys.length > 0
                ? extraKeys.map((k) => `<th title="Columna extra (datos_extra)" style="max-width:7rem">${escHtmlPrint(k)}</th>`).join('')
                : '';
        cont.innerHTML =
            `<div style="overflow-x:auto"><div id="lista-socios-admin-scroll" style="max-height:min(60vh,560px);overflow:auto;border:1px solid var(--bo);border-radius:.5rem;position:relative">
<table class="gn-soc-admin-table" style="width:100%;font-size:.8rem;border-collapse:collapse;table-layout:auto"><thead style="position:sticky;top:0;background:var(--bg);z-index:2;box-shadow:0 1px 0 var(--bo)"><tr><th align="left">${thNis}</th><th align="left">Medidor</th><th>Nombre</th><th>Localidad</th><th>Provincia</th>${thPre}<th>Calle</th><th>Nº</th><th>Tel.</th>${thDist}<th align="right" class="gn-soc-coord gn-soc-lat" title="Latitud · WGS84 (EPSG:4326), valor almacenado en BD">Lat (WGS84)</th><th align="right" class="gn-soc-coord gn-soc-lon" title="Longitud · WGS84 (EPSG:4326)">Lon (WGS84)</th>${thExtras}${headExtra}<th>Estado</th></tr></thead><tbody id="lista-socios-vtbody"></tbody></table></div>
<details id="socios-catalogo-colprefs" style="font-size:.76rem;margin:.5rem 0 0;color:var(--tm);max-width:52rem">
<summary style="cursor:pointer;font-weight:600">Columnas opcionales del listado</summary>
<p style="margin:.35rem 0 .5rem;color:var(--tl);font-size:.72rem;line-height:1.35">Elegí qué columnas mostrar para este tipo de negocio (<strong>${escHtmlPrint(sociosCatalogoRubroActualParaColumnas())}</strong>). Siempre visibles: NIS, medidor, nombre, localidad, provincia, calle, número, teléfono, latitud, longitud y estado.</p>
<div id="socios-colprefs-cbs" style="display:flex;flex-wrap:wrap;gap:.45rem 1rem;margin:.25rem 0 .5rem;align-items:center"></div>
<button type="button" class="btn-sm" style="font-size:.72rem" onclick="if(typeof sociosCatalogoRestaurarColumnasOpcionalesPorRubro==='function')sociosCatalogoRestaurarColumnasOpcionalesPorRubro()">Restaurar predeterminadas del rubro</button>
</details>
<p style="font-size:.72rem;color:var(--tl);margin:.35rem 0 0">${rows.length.toLocaleString('es-AR')} socios — vista virtual (solo filas visibles). Las columnas extra salen del Excel (<code>datos_extra</code>). Lat/Lon = datos en BD (EPSG:4326). Columnas X/Y (si las activaste): Este/Norte en metros según familia y faja del encabezado.</p></div>`;
        bindSociosCatalogoVirtualScroll();
        sociosCatalogoRenderPanelPreferenciasColumnas();
        renderSociosCatalogoVirtual();
    } catch (e) {
        logErrorWeb('lista-socios-admin', e);
        cont.innerHTML = '<p style="color:var(--re);font-size:.85rem">' + escHtmlPrint(mensajeErrorUsuario(e)) + '</p>';
    }
}

function normalizarEncabezadoExcelSocios(k) {
    let s = String(k || '')
        .replace(/^\ufeff/g, '')
        .replace(/[\u00a0\u2007\u202f\u200b\ufeff]/g, ' ')
        .trim()
        .toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    const n = s.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (n === 'pcia' || n === 'provincia') return 'provincia';
    if (n === 'estado' || n === 'state') return 'provincia';
    if (n === 'abonado' || n === 'n_abonado' || n === 'numero_abonado' || n === 'nro_abonado' || n === 'num_abonado') {
        return 'nis';
    }
    if (n === 'nis_id' || n === 'nis_suministro' || n === 'id_suministro') {
        return 'nis';
    }
    if (
        n === 'vecino' ||
        n === 'n_vecino' ||
        n === 'numero_vecino' ||
        n === 'nro_vecino' ||
        n === 'num_vecino' ||
        n === 'n_de_vecino' ||
        n === 'numero_de_vecino' ||
        n === 'num_de_vecino' ||
        n === 'nro_de_vecino' ||
        n === 'numero_del_vecino' ||
        n === 'n_del_vecino' ||
        n === 'nd_vecino' ||
        n === 'id_vecino' ||
        n === 'codigo_vecino' ||
        n === 'cod_vecino' ||
        n === 'partida' ||
        n === 'padron' ||
        n === 'padron_vecinal' ||
        n === 'nmunicipal' ||
        n === 'n_municipal' ||
        n === 'clave_vecinal' ||
        n === 'cuenta_vecino' ||
        n === 'n_cuenta'
    ) {
        return 'nis';
    }
    if (
        n === 'socio' ||
        n === 'n_socio' ||
        n === 'numero_socio' ||
        n === 'nro_socio' ||
        n === 'num_socio' ||
        n === 'cod_socio' ||
        n === 'codigo_socio' ||
        n === 'id_socio' ||
        n === 'idsocio' ||
        n === 'n_de_socio' ||
        n === 'cliente' ||
        n === 'n_cliente' ||
        n === 'numero_cliente' ||
        n === 'cod_cliente' ||
        n === 'codigo_cliente' ||
        n === 'legajo' ||
        n === 'expediente' ||
        n === 'expediente_n' ||
        n === 'id_usuario'
    ) {
        return 'nis';
    }
    if (n === 'apellidos' || n === 'apellido_socio' || n === 'apellido_titular' || n === 'apellido_del_titular') {
        return 'apellido';
    }
    if (n === 'primer_nombre' || n === 'nombre_social') {
        return 'nombres';
    }
    if (
        n === 'titular' ||
        n === 'apellido_y_nombre' ||
        n === 'apellido_nombre' ||
        n === 'nombreyapellido' ||
        n === 'apellidos_nombres' ||
        n === 'vecino_nombre' ||
        n === 'datos_personales' ||
        n === 'nombre_y_apellido' ||
        n === 'nombreapellido'
    ) {
        return 'nombre';
    }
    if (n === 'ubicacion' || n === 'lugar_del_inmueble' || n === 'domicilio_real' || n === 'calle_domicilio') {
        return 'direccion';
    }
    if (
        n === 'cp' ||
        n === 'cpa' ||
        n === 'codigo_postal' ||
        n === 'codigopostal' ||
        n === 'codpostal' ||
        n === 'postal' ||
        n === 'zip' ||
        n === 'cod_postal' ||
        n === 'cod_post'
    ) {
        return 'codigo_postal';
    }
    return n;
}

/** Une sinónimos de encabezado ya normalizados a la clave canónica `provincia`. */
function aliasEncabezadosProvinciaSocios(mapNormAOriginal) {
    if (!mapNormAOriginal || typeof mapNormAOriginal !== 'object') return;
    const keys = ['pcia', 'estado', 'state'];
    for (const k of keys) {
        if (mapNormAOriginal[k] && !mapNormAOriginal.provincia) {
            mapNormAOriginal.provincia = mapNormAOriginal[k];
        }
    }
}

function aliasEncabezadosCpSocios(mapNormAOriginal) {
    if (!mapNormAOriginal || typeof mapNormAOriginal !== 'object') return;
    const keys = ['cp', 'cpa', 'postal', 'zip', 'cod_postal', 'codigopostal', 'codpostal', 'cod_post'];
    for (const k of keys) {
        if (mapNormAOriginal[k] && !mapNormAOriginal.codigo_postal) {
            mapNormAOriginal.codigo_postal = mapNormAOriginal[k];
        }
    }
}

/** Municipio / planillas exportadas: sinónimos de «nº vecino» que quedaron con otra clave normalizada. */
function aliasEncabezadosNombreSocios(mapNormAOriginal) {
    if (!mapNormAOriginal || typeof mapNormAOriginal !== 'object') return;
    if (mapNormAOriginal.nombre) return;
    const syns = [
        'titular',
        'apellido_y_nombre',
        'apellido_nombre',
        'nombreyapellido',
        'apellidos_nombres',
        'vecino_nombre',
        'datos_personales',
        'nombre_y_apellido',
        'nombreapellido',
    ];
    for (const k of syns) {
        if (mapNormAOriginal[k]) {
            mapNormAOriginal.nombre = mapNormAOriginal[k];
            return;
        }
    }
}

/** Si el Excel usa «Socio» y el mapa quedó con clave `socio` (p. ej. caché o versión vieja), copiar a `nis`. */
function aliasEncabezadosSocioANisSocios(mapNormAOriginal) {
    if (!mapNormAOriginal || typeof mapNormAOriginal !== 'object') return;
    if (mapNormAOriginal.nis) return;
    const keys = [
        'socio',
        'n_socio',
        'numero_socio',
        'nro_socio',
        'num_socio',
        'cod_socio',
        'codigo_socio',
        'id_socio',
        'n_de_socio',
        'cliente',
        'codigo_cliente',
        'legajo',
    ];
    for (const k of keys) {
        if (mapNormAOriginal[k]) {
            mapNormAOriginal.nis = mapNormAOriginal[k];
            return;
        }
    }
}

function aliasEncabezadosIdentificadorVecinoSocios(mapNormAOriginal) {
    if (!mapNormAOriginal || typeof mapNormAOriginal !== 'object') return;
    if (mapNormAOriginal.nis) return;
    const syns = [
        'socio',
        'n_socio',
        'numero_socio',
        'codigo_socio',
        'cliente',
        'codigo_cliente',
        'legajo',
        'expediente',
        'n_de_vecino',
        'numero_de_vecino',
        'num_de_vecino',
        'nro_de_vecino',
        'numero_del_vecino',
        'n_del_vecino',
        'nd_vecino',
        'id_vecino',
        'codigo_vecino',
        'cod_vecino',
        'partida',
        'padron',
        'padron_vecinal',
        'nmunicipal',
        'n_municipal',
        'clave_vecinal',
        'cuenta_vecino',
        'n_cuenta',
    ];
    for (const k of syns) {
        if (mapNormAOriginal[k]) {
            mapNormAOriginal.nis = mapNormAOriginal[k];
            return;
        }
    }
}

/** Encabezados normalizados que mapean a columnas fijas del catálogo (el resto va a `datos_extra`). */
const SOCIOS_EXCEL_CLAVES_RESERVADAS = new Set([
    'nis',
    'medidor',
    'nis_medidor',
    'nombre',
    'nombres',
    'apellido',
    'calle',
    'calle_nombre',
    'via',
    'numero',
    'nro',
    'num',
    'altura',
    'numero_calle',
    'n',
    'direccion',
    'domicilio',
    'telefono',
    'tel',
    'celular',
    'distribuidor_codigo',
    'distribuidor',
    'codigo_distribuidor',
    'localidad',
    'ciudad',
    'municipio',
    'provincia',
    'pcia',
    'estado',
    'state',
    'codigo_postal',
    'barrio',
    'vecindario',
    'zona',
    'tipo_tarifa',
    'tarifa',
    'urbano_rural',
    'transformador',
    'trafo',
    'tipo_conexion',
    'fases',
    'latitud',
    'lat',
    'latitude',
    'lat_gps',
    'longitud',
    'lng',
    'lon',
    'longitude',
    'lng_gps',
    'este',
    'oeste',
    'coordenada_e',
    'coordenada_x',
    'easting',
    'e',
    'x',
    'este_m',
    'norte',
    'coordenada_n',
    'coordenada_y',
    'northing',
    'n',
    'y',
    'norte_m',
]);

function recolectarDatosExtraExcelSocios(row, mapNormAOriginal) {
    void mapNormAOriginal;
    const out = {};
    for (const orig of Object.keys(row)) {
        if (orig == null || String(orig).trim() === '') continue;
        const nk = normalizarEncabezadoExcelSocios(orig);
        if (!nk || SOCIOS_EXCEL_CLAVES_RESERVADAS.has(nk)) continue;
        const v = row[orig];
        if (v == null || String(v).trim() === '') continue;
        const key = String(orig).trim();
        if (!key) continue;
        out[key] = typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v).trim();
    }
    return out;
}

/** Nombre en BD: columna nombre completo o apellido + nombres. */
function nombreTitularDesdeFilaExcelSocios(row, mapNormAOriginal) {
    let nombre = valorSociosPorEncabezados(
        row,
        mapNormAOriginal,
        'nombre',
        'razon_social',
        'socio',
        'titular',
        'apellido_y_nombre',
        'nombreyapellido',
        'vecino_nombre'
    );
    const ap = valorSociosPorEncabezados(row, mapNormAOriginal, 'apellido');
    const nom = valorSociosPorEncabezados(row, mapNormAOriginal, 'nombres');
    if (!nombre && ap && nom) nombre = `${ap}, ${nom}`;
    else if (!nombre && ap && !nom) nombre = ap;
    else if (!nombre && !ap && nom) nombre = nom;
    return nombre || null;
}

/** Si el Excel no trae NIS/medidor/vecino/socio pero sí nombre y calle (o domicilio en una celda). */
function identificadorSinteticoDesdeAnclasImportSocios(filaN, nombre, calle, loc) {
    const a = String(nombre || '').trim().toLowerCase();
    const b = String(calle || '').trim().toLowerCase();
    const c = String(loc || '').trim().toLowerCase();
    const raw = `${filaN}\t${a}\t${b}\t${c}`;
    let h = 5381;
    for (let i = 0; i < raw.length; i++) {
        h = ((h << 5) + h) ^ raw.charCodeAt(i);
    }
    const hx = (h >>> 0).toString(16).slice(0, 10);
    return `XLSX-${filaN}-${hx}`;
}

function validarAnclasImportSociosPorRubro(rubro, o) {
    const { nisPart, medPart, nombre, calle, loc, provinciaSoc, identificadorSintetico } = o;
    const miss = [];
    if (!nisPart || !String(nisPart).trim()) miss.push('identificador (NIS / abonado / vecino)');
    const coop = rubro === 'cooperativa_electrica' || rubro === 'cooperativa_agua';
    if (coop && !identificadorSintetico) {
        if (!medPart || !String(medPart).trim()) miss.push('medidor');
    }
    if (!nombre || !String(nombre).trim()) miss.push('nombre o apellido+nombres');
    if (!calle || !String(calle).trim()) miss.push('dirección (calle o columna dirección)');
    if (!loc || !String(loc).trim()) miss.push('ciudad / localidad');
    if (!provinciaSoc || !String(provinciaSoc).trim()) miss.push('provincia');
    return miss;
}

/** CP por Nominatim (proxy); no bloquea importación si falla. */
async function inferirCodigoPostalImportSociosNominatim(calle, loc, provincia) {
    const c = String(calle || '').trim();
    const l = String(loc || '').trim();
    const p = String(provincia || '').trim();
    if (!c || !l || !p) return null;
    const nominatimFetchSearch = req().nominatimFetchSearch;
    if (typeof nominatimFetchSearch !== 'function') return null;
    try {
        const raw = await nominatimFetchSearch({
            q: `${c}, ${l}, ${p}, Argentina`,
            countrycodes: 'ar',
            limit: '8',
            addressdetails: '1',
        });
        const arr = Array.isArray(raw) ? raw : [];
        for (const hit of arr) {
            const pc = hit && hit.address && hit.address.postcode != null ? String(hit.address.postcode) : '';
            if (!pc) continue;
            const d = pc.replace(/\D/g, '');
            if (d.length >= 4 && d.length <= 8) return d;
        }
    } catch (_) {}
    return null;
}

/**
 * Inferencia de CP solo para filas sin `codigo_postal`, agrupando por (calle, localidad, provincia)
 * para no repetir la misma consulta a Nominatim cientos de veces. Respeta ~1 req/s entre claves distintas.
 */
async function aplicarInferenciaCpNominatimABulkImportSocios(payloads) {
    if (!Array.isArray(payloads) || !payloads.length) return 0;
    const clave = (p) =>
        `${String(p.calle || '')
            .trim()
            .toLowerCase()}\u0001${String(p.loc || '')
            .trim()
            .toLowerCase()}\u0001${String(p.provincia || '')
            .trim()
            .toLowerCase()}`;
    const unicos = new Map();
    for (const p of payloads) {
        if (p.codigo_postal && String(p.codigo_postal).trim()) continue;
        if (!p.calle || !p.loc || !p.provincia) continue;
        const k = clave(p);
        if (!unicos.has(k)) unicos.set(k, { calle: p.calle, loc: p.loc, provincia: p.provincia });
    }
    const cpPorClave = new Map();
    let idx = 0;
    const total = unicos.size;
    for (const [k, { calle, loc, provincia }] of unicos) {
        if (total > 0 && idx % 6 === 0) {
            req().actualizarOverlayImportacion(`Código postal (Nominatim)… ${idx + 1} / ${total} direcciones distintas`);
        }
        const cp = await inferirCodigoPostalImportSociosNominatim(calle, loc, provincia);
        if (cp) cpPorClave.set(k, cp);
        idx++;
        if (idx < total) await new Promise((r) => setTimeout(r, 1100));
    }
    let cpInf = 0;
    for (const p of payloads) {
        if (p.codigo_postal && String(p.codigo_postal).trim()) continue;
        if (!p.calle || !p.loc || !p.provincia) continue;
        const cpx = cpPorClave.get(clave(p));
        if (cpx) {
            p.codigo_postal = cpx;
            cpInf++;
        }
    }
    return cpInf;
}

function valorSociosPorEncabezados(row, mapNormAOriginal, ...clavesCanon) {
    for (const canon of clavesCanon) {
        const orig = mapNormAOriginal[canon];
        if (orig != null && row[orig] != null && String(row[orig]).trim() !== '') {
            return String(row[orig]).trim();
        }
    }
    for (const orig of Object.keys(row)) {
        const n = normalizarEncabezadoExcelSocios(orig);
        if (clavesCanon.includes(n)) {
            const v = row[orig];
            if (v != null && String(v).trim() !== '') return String(v).trim();
        }
    }
    return null;
}

// parseDecimalODmsCoord, parsearDmsLatLonFlexible → modules/utils.js

/** Lee número desde celda Excel (raw o texto): latitud, longitud, este, norte, etc. */
function leerCoordExcelSocios(row, mapNormAOriginal, ...clavesCanon) {
    for (const canon of clavesCanon) {
        const orig = mapNormAOriginal[canon];
        if (orig != null && row[orig] != null && row[orig] !== '') {
            const v = row[orig];
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            const s = String(v).trim();
            if (s) {
                const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
                if (Number.isFinite(n) && !/[°'′″]/.test(s)) return n;
                const d = parseDecimalODmsCoord(v);
                if (d != null && Number.isFinite(d)) return d;
            }
        }
    }
    for (const orig of Object.keys(row)) {
        const n = normalizarEncabezadoExcelSocios(orig);
        if (clavesCanon.includes(n)) {
            const v = row[orig];
            if (v == null || v === '') continue;
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            const s = String(v).trim();
            if (s) {
                const pn = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
                if (Number.isFinite(pn) && !/[°'′″]/.test(s)) return pn;
                const d = parseDecimalODmsCoord(v);
                if (d != null && Number.isFinite(d)) return d;
            }
        }
    }
    return null;
}

// validarWgs84Import → modules/utils.js

/** Medidor/NIS como texto (evita pérdida de formato; números Excel → String). */
function valorIdentificadorTextoSocios(row, mapNormAOriginal, ...clavesCanon) {
    for (const canon of clavesCanon) {
        const orig = mapNormAOriginal[canon];
        if (orig == null || row[orig] == null || row[orig] === '') continue;
        const v = row[orig];
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
        const s = String(v).trim();
        return s || null;
    }
    for (const orig of Object.keys(row)) {
        const n = normalizarEncabezadoExcelSocios(orig);
        if (clavesCanon.includes(n)) {
            const v = row[orig];
            if (v == null || v === '') continue;
            if (typeof v === 'number' && Number.isFinite(v)) return String(v);
            const s = String(v).trim();
            return s || null;
        }
    }
    return null;
}

/** Columnas NIS / Medidor en panel admin (catálogo virtual). */
function sociosCatalogoNisCelda(s) {
    const direct = String(s.nis ?? '').trim();
    if (direct) return direct;
    const nm = String(s.nis_medidor ?? '').trim();
    if (!nm) return '';
    const ix = nm.indexOf('-');
    return ix > 0 ? nm.slice(0, ix).trim() : nm;
}

function sociosCatalogoMedidorCelda(s) {
    return String(s.medidor ?? '').trim();
}

/** Lotes más grandes = menos viajes a Neon (20k+ socios). */
const SOCIOS_BULK_CHUNK = 1000;

async function ejecutarBulkInsertSociosCatalogo(lote) {
    if (!lote.length) return;
    const hasT = await req().sociosCatalogoTieneTenantId();
    const hasDE = await req().sociosCatalogoTieneDatosExtra();
    const tidEsc = esc(req().tenantIdActual());
    const coreCols = `nis_medidor, nis, medidor, nombre, calle, numero, barrio, telefono, distribuidor_codigo, localidad, provincia, codigo_postal, tipo_tarifa, urbano_rural, transformador, tipo_conexion, fases, latitud, longitud`;
    const colList = hasT ? `${coreCols}, tenant_id` : coreCols;
    const colListFull = hasDE ? `${colList}, datos_extra` : colList;
    const onConf = hasT ? `(tenant_id, nis_medidor)` : `(nis_medidor)`;
    const vals = lote
        .map((p) => {
            const deObj = p.datos_extra && typeof p.datos_extra === 'object' && !Array.isArray(p.datos_extra) ? p.datos_extra : {};
            const deSql = hasDE ? `, ${esc(JSON.stringify(deObj))}::jsonb` : '';
            const base = `(${esc(p.nis_medidor)}, ${esc(p.nis)}, ${esc(p.medidor)}, ${esc(p.nombre)}, ${esc(p.calle)}, ${esc(p.numero)}, ${esc(p.barrioSoc)}, ${esc(p.telefono)}, ${esc(p.dist)}, ${esc(p.loc)}, ${esc(p.provincia)}, ${esc(p.codigo_postal)}, ${esc(p.tar)}, ${esc(p.ur)}, ${esc(p.transf)}, ${esc(p.tcon)}, ${esc(p.fas)}, ${esc(p.latitud)}, ${esc(p.longitud)}`;
            const tail = hasT ? `${base}, ${tidEsc}${hasDE ? deSql : ''})` : `${base}${hasDE ? deSql : ''})`;
            return tail;
        })
        .join(',');
    const mergeDe = hasDE
        ? `, datos_extra = COALESCE(socios_catalogo.datos_extra, '{}'::jsonb) || COALESCE(EXCLUDED.datos_extra, '{}'::jsonb)`
        : '';
    await req().sqlSimple(
        `INSERT INTO socios_catalogo(${colListFull})
         VALUES ${vals}
         ON CONFLICT ${onConf} DO UPDATE SET
           nis = COALESCE(EXCLUDED.nis, socios_catalogo.nis),
           medidor = COALESCE(EXCLUDED.medidor, socios_catalogo.medidor),
           nombre = EXCLUDED.nombre, calle = EXCLUDED.calle, numero = EXCLUDED.numero, barrio = EXCLUDED.barrio, telefono = EXCLUDED.telefono, distribuidor_codigo = EXCLUDED.distribuidor_codigo, localidad = EXCLUDED.localidad, provincia = COALESCE(NULLIF(TRIM(EXCLUDED.provincia), ''), socios_catalogo.provincia), codigo_postal = COALESCE(NULLIF(TRIM(EXCLUDED.codigo_postal), ''), socios_catalogo.codigo_postal), tipo_tarifa = EXCLUDED.tipo_tarifa, urbano_rural = EXCLUDED.urbano_rural, transformador = EXCLUDED.transformador, tipo_conexion = EXCLUDED.tipo_conexion, fases = EXCLUDED.fases,
           latitud = CASE 
             WHEN COALESCE(socios_catalogo.ubicacion_manual, FALSE) = TRUE THEN socios_catalogo.latitud
             WHEN socios_catalogo.latitud IS NOT NULL AND ABS(socios_catalogo.latitud::numeric) > 1e-8 THEN socios_catalogo.latitud 
             ELSE EXCLUDED.latitud 
           END,
           longitud = CASE 
             WHEN COALESCE(socios_catalogo.ubicacion_manual, FALSE) = TRUE THEN socios_catalogo.longitud
             WHEN socios_catalogo.longitud IS NOT NULL AND ABS(socios_catalogo.longitud::numeric) > 1e-8 THEN socios_catalogo.longitud 
             ELSE EXCLUDED.longitud 
           END${mergeDe}`
    );
}

let _sociosVirtualScrollRaf = null;
function renderSociosCatalogoVirtual() {
    const wrap = document.getElementById('lista-socios-admin-scroll');
    const tb = document.getElementById('lista-socios-vtbody');
    if (!wrap || !tb || !window._sociosVirtualRows || !window._sociosVirtualRows.length) return;
    const data = window._sociosVirtualRows;
    const total = data.length;
    const rh = window._sociosVirtualRowHeight || 31;
    const buf = 35;
    const st = wrap.scrollTop;
    const vh = wrap.clientHeight || 480;
    let start = Math.floor(st / rh) - buf;
    if (start < 0) start = 0;
    let end = Math.ceil((st + vh) / rh) + buf;
    if (end > total) end = total;
    const padTop = start * rh;
    const padBot = Math.max(0, (total - end) * rh);
    const e = (x) => String(x ?? '').replace(/</g, '&lt;');
    const slice = data.slice(start, end);
    const fmtLon = (v) => {
        if (v == null || v === '') return '—';
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(6) : '—';
    };
    const ncol = window._sociosTablaColCount || obtenerNumColsTablaSociosAdmin();
    tb.innerHTML =
        `<tr class="gn-vspad"><td colspan="${ncol}" style="padding:0;height:${padTop}px;border:none"></td></tr>` +
        slice
            .map((s) => {
                const calleDisp = String(s.calle || '').trim();
                const numDisp = String(s.numero || '').trim();
                const proy = htmlCeldasProyeccionSociosDesdeLatLng(s.latitud, s.longitud);
                const visRow = sociosCatalogoLeerSetColumnasOpcionalesVisibles();
                const tdPre = sociosCatalogoHtmlTdOpcionalesPreCalle(s, visRow, e);
                const tdDist = sociosCatalogoHtmlTdDistrib(s, visRow, e);
                const extraKs = window._sociosDatosExtraColumnKeys || [];
                const tdExtras = sociosCatalogoHtmlExtrasDatosExtra(s, extraKs, e);
                return `<tr><td>${e(sociosCatalogoNisCelda(s))}</td><td>${e(sociosCatalogoMedidorCelda(s))}</td><td>${e(s.nombre)}</td><td>${e(s.localidad)}</td><td>${e(s.provincia)}</td>${tdPre}<td>${e(calleDisp)}</td><td>${e(numDisp)}</td><td>${e(s.telefono)}</td>${tdDist}<td align="right" class="gn-soc-coord gn-soc-lat">${fmtLon(s.latitud)}</td><td align="right" class="gn-soc-coord gn-soc-lon">${fmtLon(s.longitud)}</td>${tdExtras}${proy}<td>${s.activo ? 'Activo' : 'Baja'}</td></tr>`;
            })
            .join('') +
        `<tr class="gn-vspad"><td colspan="${ncol}" style="padding:0;height:${padBot}px;border:none"></td></tr>`;
}

function bindSociosCatalogoVirtualScroll() {
    const wrap = document.getElementById('lista-socios-admin-scroll');
    if (!wrap || wrap.dataset.gnVirtBound === '1') return;
    wrap.dataset.gnVirtBound = '1';
    wrap.addEventListener(
        'scroll',
        () => {
            if (_sociosVirtualScrollRaf) cancelAnimationFrame(_sociosVirtualScrollRaf);
            _sociosVirtualScrollRaf = requestAnimationFrame(() => {
                _sociosVirtualScrollRaf = null;
                renderSociosCatalogoVirtual();
            });
        },
        { passive: true }
    );
    if (!window.__gnSociosVirtResize) {
        window.__gnSociosVirtResize = true;
        window.addEventListener(
            'resize',
            () => {
                if (window._sociosVirtualRows && window._sociosVirtualRows.length) {
                    requestAnimationFrame(() => renderSociosCatalogoVirtual());
                }
            },
            { passive: true }
        );
    }
}

function _encabezadosNormSetSocios(mapNormAOriginal) {
    return new Set(Object.keys(mapNormAOriginal || {}));
}

function _celdaPareceDmsSocios(v) {
    const s = String(v ?? '');
    return /[°'′″]/.test(s) && /\d/.test(s);
}

/**
 * Muestra de filas del Excel (sin persistir): sugiere WGS84 vs Este/Norte y mensaje de faja Auto / fallback.
 */
async function inferirCrsSociosExcelAntesImport(file) {
    const msgEl = document.getElementById('socios-import-detect-msg');
    const crsSel = document.getElementById('socios-import-crs');
    const fajaSel = document.getElementById('socios-import-faja');
    const setMsg = (t) => {
        if (msgEl) msgEl.textContent = t || '';
    };
    if (!file || typeof XLSX === 'undefined') {
        setMsg('');
        return;
    }
    let buf;
    try {
        buf = await file.arrayBuffer();
    } catch (_) {
        setMsg('');
        return;
    }
    let wb;
    try {
        wb = XLSX.read(buf, { type: 'array' });
    } catch (_) {
        setMsg('No se pudo leer el archivo como Excel.');
        return;
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false, blankrows: false });
    if (!rawRows.length) {
        setMsg('');
        return;
    }
    const primera = rawRows[0];
    const mapNormAOriginal = {};
    Object.keys(primera).forEach((orig) => {
        const n = normalizarEncabezadoExcelSocios(orig);
        if (n && mapNormAOriginal[n] == null) mapNormAOriginal[n] = orig;
    });
    const kn = _encabezadosNormSetSocios(mapNormAOriginal);
    const tieneParesEn =
        (kn.has('este') && kn.has('norte')) ||
        (kn.has('easting') && kn.has('northing')) ||
        (kn.has('coordenada_x') && kn.has('coordenada_y')) ||
        (kn.has('coordenada_e') && kn.has('coordenada_n')) ||
        (kn.has('x') && kn.has('y'));
    const sample = rawRows.slice(0, 25);
    let scoreWgs = 0;
    let scoreEn = 0;
    let scoreDms = 0;
    for (const row of sample) {
        const laRaw = leerCoordExcelSocios(row, mapNormAOriginal, 'latitud', 'lat', 'latitude', 'lat_gps');
        const loRaw = leerCoordExcelSocios(row, mapNormAOriginal, 'longitud', 'lng', 'lon', 'longitude', 'lng_gps');
        const wgs = validarWgs84Import(laRaw, loRaw);
        if (wgs.la != null && wgs.lo != null) scoreWgs++;
        const eVal = leerCoordExcelSocios(
            row,
            mapNormAOriginal,
            'este',
            'oeste',
            'coordenada_e',
            'coordenada_x',
            'easting',
            'e',
            'x',
            'este_m'
        );
        const nVal = leerCoordExcelSocios(
            row,
            mapNormAOriginal,
            'norte',
            'coordenada_n',
            'coordenada_y',
            'northing',
            'n',
            'y',
            'norte_m'
        );
        if (eVal != null && nVal != null) {
            const e = Number(eVal);
            const nn = Number(nVal);
            if (Number.isFinite(e) && Number.isFinite(nn)) {
                const absE = Math.abs(e);
                const absN = Math.abs(nn);
                if (absE >= 50000 && absE <= 9900000 && absN >= 50000 && absN <= 15000000) scoreEn++;
            }
        }
        for (const k of ['latitud', 'lat', 'longitud', 'lng', 'lon']) {
            const o = mapNormAOriginal[k];
            if (o != null && _celdaPareceDmsSocios(row[o])) scoreDms++;
        }
    }
    let modo = null;
    if (scoreEn >= 2 && scoreEn > scoreWgs && tieneParesEn) modo = 'arg_en';
    else if (scoreWgs >= 2) modo = 'wgs84';
    else if (scoreDms >= 2 && scoreWgs < 2) modo = 'wgs84';
    else if (scoreEn >= 1 && scoreWgs === 0 && tieneParesEn) modo = 'arg_en';
    if (!modo) {
        setMsg(
            'Detectado: sin patrón claro en las primeras filas. Elegí manualmente WGS84 o Este/Norte y la faja si aplica.'
        );
        return;
    }
    if (crsSel) crsSel.value = modo;
    if (modo === 'arg_en') {
        if (fajaSel) fajaSel.value = 'auto';
        const fam = String((window.EMPRESA_CFG || {}).coord_proy_familia || '').trim();
        const cfg = window.EMPRESA_CFG || {};
        const loBase = Number(cfg.lng_base);
        const zTxt = Number.isFinite(loBase)
            ? `Auto según longitud de la central (lng_base ≈ ${loBase.toFixed(2)}° → faja ${fajaArgentinaPorLongitud(loBase)}).`
            : 'Auto sin lng_base en empresa: fallback faja 4 (meridiano central ~−64°), igual que el mapa.';
        let det = 'Este/Norte en metros (proyectadas)';
        if (!fam || fam === 'none') {
            det += ' — falta familia en Empresa (Inchauspe / POSGAR): configurá y volvé a importar si el modo Este/Norte falla.';
        } else {
            det += ` Conversión con familia Empresa: ${etiquetaFamiliaProyeccionLarga(fam)}.`;
        }
        setMsg(`Detectado: ${det} ${zTxt}`);
    } else {
        let extra = '';
        if (scoreDms >= 2) extra = ' Texto tipo ° ′ ″: se convierte al importar.';
        setMsg(`Detectado: latitud / longitud WGS84 (decimal o DMS).${extra} En BD se guarda siempre EPSG:4326.`);
    }
}

async function onInputExcelSociosConInferencia(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
        toast('Librería Excel no cargada', 'error');
        event.target.value = '';
        return;
    }
    try {
        await inferirCrsSociosExcelAntesImport(file);
    } catch (e) {
        console.warn('[socios] inferir CRS Excel', e);
        const msgEl = document.getElementById('socios-import-detect-msg');
        if (msgEl) {
            msgEl.textContent =
                'No se pudo analizar el archivo; revisá manualmente el sistema de coordenadas y la faja.';
        }
    }
    try {
        if (typeof actualizarUiSociosImportCrs === 'function') actualizarUiSociosImportCrs();
    } catch (_) {}
    await importarExcelSocios(event);
}
window.onInputExcelSociosConInferencia = onInputExcelSociosConInferencia;

async function importarExcelSocios(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { toast('Librería Excel no cargada', 'error'); return; }
    try {
        if (typeof actualizarUiSociosImportCrs === 'function') actualizarUiSociosImportCrs();
    } catch (_) {}
    const crsMode = document.getElementById('socios-import-crs')?.value || 'wgs84';
    const errMsgs = [];
    try {
        if (crsMode === 'arg_en') {
            const fam = String((window.EMPRESA_CFG || {}).coord_proy_familia || '').trim();
            if (!fam || fam === 'none') {
                toast('Configurá la familia de proyección en Empresa (coordenadas) antes de importar Este/Norte.', 'error');
                event.target.value = '';
                return;
            }
        }
        req().mostrarOverlayImportacion('Leyendo Excel de socios…');
        const reemplazar = document.getElementById('socios-import-reemplazar')?.checked;
        if (reemplazar) {
            req().actualizarOverlayImportacion('Vaciando catálogo (preservando coordenadas corregidas manualmente)…');
            // NO borrar filas con ubicacion_manual = TRUE (son correcciones del admin que deben persistir)
            const hasSocTDel = await req().sociosCatalogoTieneTenantId();
            const tfDel = hasSocTDel ? ` AND tenant_id = ${esc(req().tenantIdActual())}` : '';
            await req().sqlSimple(`DELETE FROM socios_catalogo WHERE COALESCE(ubicacion_manual, FALSE) = FALSE${tfDel}`);
            console.info('[import-socios] Catálogo vaciado preservando ubicaciones manuales');
        }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        /* raw:false conserva teléfonos como texto; coords se parsean en leerCoordExcelSocios */
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false, blankrows: false });
        if (!rawRows.length) {
            req().ocultarOverlayImportacion();
            toast('Excel vacío o sin filas de datos', 'error');
            event.target.value = '';
            return;
        }
        const primera = rawRows[0];
        const mapNormAOriginal = {};
        Object.keys(primera).forEach(orig => {
            const n = normalizarEncabezadoExcelSocios(orig);
            if (n && mapNormAOriginal[n] == null) mapNormAOriginal[n] = orig;
        });
        aliasEncabezadosSocioANisSocios(mapNormAOriginal);
        aliasEncabezadosProvinciaSocios(mapNormAOriginal);
        aliasEncabezadosCpSocios(mapNormAOriginal);
        aliasEncabezadosIdentificadorVecinoSocios(mapNormAOriginal);
        aliasEncabezadosNombreSocios(mapNormAOriginal);
        const rubroImp = req().normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) || 'cooperativa_electrica';
        await sociosCatalogoCargarMapaCodigosAreaArgentinaImport();
        const ecCfg = window.EMPRESA_CFG || {};
        const payloads = [];
        const omitidas = [];
        const avisosGeoTel = [];
        const registrarAvisoGeoTel = (msg) => {
            if (!msg || avisosGeoTel.length >= 40) return;
            const m = String(msg);
            if (!avisosGeoTel.includes(m)) avisosGeoTel.push(m);
        };
        let filaN = 0;
        for (const row of rawRows) {
            filaN++;
            const nisColUni = valorSociosPorEncabezados(
                row,
                mapNormAOriginal,
                'nis_medidor',
                'nis',
                'socio',
                'vecino',
                'abonado',
                'n_socio',
                'numero_socio',
                'codigo_socio',
                'cliente',
                'legajo'
            );
            let nisPart = valorIdentificadorTextoSocios(
                row,
                mapNormAOriginal,
                'nis',
                'socio',
                'vecino',
                'abonado',
                'nis_medidor',
                'n_socio',
                'numero_socio',
                'codigo_socio',
                'cliente',
                'legajo',
                'expediente',
                'id_usuario'
            );
            let medPart = valorIdentificadorTextoSocios(row, mapNormAOriginal, 'medidor', 'nro_medidor', 'numero_medidor');
            let nis_medidor = nisColUni != null && String(nisColUni).trim() !== '' ? String(nisColUni).trim() : null;
            if (!nis_medidor) {
                if (nisPart && medPart) nis_medidor = `${nisPart}-${medPart}`;
                else nis_medidor = nisPart || medPart;
            }
            if (!nis_medidor) {
                const nomPre = nombreTitularDesdeFilaExcelSocios(row, mapNormAOriginal);
                let calPre = valorSociosPorEncabezados(row, mapNormAOriginal, 'calle', 'calle_nombre', 'via');
                const dirPre = valorSociosPorEncabezados(row, mapNormAOriginal, 'direccion', 'domicilio');
                if (!calPre && dirPre) {
                    const t = String(dirPre).trim();
                    const m = t.match(/^(.+?)\s+(\d{1,6}[a-zA-Z\u00f1\u00b0]?)$/);
                    calPre = m ? m[1].trim() : t;
                }
                const locPre = valorSociosPorEncabezados(row, mapNormAOriginal, 'localidad', 'ciudad', 'municipio');
                if (nomPre && calPre) {
                    nis_medidor = identificadorSinteticoDesdeAnclasImportSocios(filaN, nomPre, calPre, locPre);
                }
            }
            if (!nis_medidor) {
                omitidas.push({ fila: filaN, r: 'falta identificador (NIS, abonado, vecino o nis_medidor)' });
                continue;
            }
            if (nisColUni && (!nisPart || !medPart) && /-/.test(String(nisColUni))) {
                const sp = String(nisColUni).split('-');
                if (sp.length >= 2) {
                    if (!nisPart) nisPart = sp[0].trim() || null;
                    if (!medPart) medPart = sp.slice(1).join('-').trim() || null;
                }
            }
            if ((!nisPart || !String(nisPart).trim()) && nis_medidor) {
                const nm = String(nis_medidor).trim();
                if (nm.startsWith('XLSX-')) {
                    nisPart = nm;
                } else {
                    const ix = nm.indexOf('-');
                    nisPart = ix > 0 ? nm.slice(0, ix).trim() : nm;
                }
            }
            if (filaN % 2500 === 0) {
                req().actualizarOverlayImportacion(`Analizando Excel… ${filaN} / ${rawRows.length}`);
                await new Promise((r) => setTimeout(r, 0));
            }
            const nombre = nombreTitularDesdeFilaExcelSocios(row, mapNormAOriginal);
            let calle = valorSociosPorEncabezados(row, mapNormAOriginal, 'calle', 'calle_nombre', 'via');
            let numero = valorSociosPorEncabezados(row, mapNormAOriginal, 'numero', 'nro', 'num', 'altura', 'numero_calle', 'n');
            const textoDireccionUnica = valorSociosPorEncabezados(row, mapNormAOriginal, 'direccion', 'domicilio');
            if (textoDireccionUnica && !calle && !numero) {
                const t = String(textoDireccionUnica).trim();
                const m = t.match(/^(.+?)\s+(\d{1,6}[a-zA-Z\u00f1\u00b0]?)$/);
                if (m) {
                    calle = m[1].trim();
                    numero = m[2];
                } else {
                    calle = t;
                }
            } else if (textoDireccionUnica && !calle) {
                calle = String(textoDireccionUnica).trim();
            }
            const dist = valorSociosPorEncabezados(row, mapNormAOriginal,
                'distribuidor_codigo', 'distribuidor_', 'distribuidor', 'codigo_distribuidor');
            let loc = valorSociosPorEncabezados(row, mapNormAOriginal, 'localidad', 'ciudad', 'municipio');
            if ((!loc || !String(loc).trim()) && rubroImp === 'municipio') {
                const fl = String(ecCfg.localidad || ecCfg.ciudad || ecCfg.municipio || '').trim();
                if (fl.length >= 2) loc = fl;
            }
            let provinciaSoc = valorSociosPorEncabezados(row, mapNormAOriginal, 'provincia');
            if (!provinciaSoc || !String(provinciaSoc).trim()) {
                const fp = String(ecCfg.provincia || ecCfg.state || ecCfg.provincia_nominatim || '').trim();
                if (fp.length >= 2) provinciaSoc = fp;
            }
            const areaImp = sociosCatalogoResolverCodigoAreaArgentina(loc, provinciaSoc);
            if (areaImp.aviso) registrarAvisoGeoTel(`Fila ${filaN}: ${areaImp.aviso}`);
            const digTelPre = String(
                valorSociosPorEncabezados(row, mapNormAOriginal, 'telefono', 'tel', 'celular') || ''
            ).replace(/\D/g, '');
            if (/^15\d{6,10}$/.test(digTelPre) && !areaImp.cod) {
                registrarAvisoGeoTel(
                    `Fila ${filaN}: teléfono con prefijo 15 sin código de área en tabla (revisá localidad/provincia).`
                );
            }
            let telefono = valorSociosPorEncabezados(row, mapNormAOriginal, 'telefono', 'tel', 'celular');
            if (telefono && String(telefono).trim()) {
                const tn = normalizarTelefonoArgentinaImportSociosSync(telefono, loc, provinciaSoc);
                if (tn) telefono = tn;
            }
            let codigoPostalSoc = valorSociosPorEncabezados(row, mapNormAOriginal, 'codigo_postal');
            if (codigoPostalSoc) {
                const d = String(codigoPostalSoc).replace(/\D/g, '');
                codigoPostalSoc = d.length >= 4 && d.length <= 8 ? d : null;
            }
            const barrioSoc = valorSociosPorEncabezados(row, mapNormAOriginal, 'barrio', 'vecindario', 'zona');
            const tar = valorSociosPorEncabezados(row, mapNormAOriginal, 'tipo_tarifa', 'tarifa', 'tipo_de_tarifa');
            const ur = valorSociosPorEncabezados(row, mapNormAOriginal, 'urbano_rural', 'zona', 'tipo_ubicacion');
            const transf = valorSociosPorEncabezados(row, mapNormAOriginal, 'transformador', 'trafo', 'transformador_codigo');
            const tcon = valorSociosPorEncabezados(row, mapNormAOriginal,
                'tipo_conexion', 'conexion', 'tipo_de_conexion');
            const fas = valorSociosPorEncabezados(row, mapNormAOriginal, 'fases', 'fase', 'cantidad_fases');
            let latitud = null;
            let longitud = null;
            if (crsMode === 'arg_en') {
                const fam = String((window.EMPRESA_CFG || {}).coord_proy_familia || '').trim();
                const eVal = leerCoordExcelSocios(
                    row,
                    mapNormAOriginal,
                    'este',
                    'oeste',
                    'coordenada_e',
                    'coordenada_x',
                    'easting',
                    'e',
                    'x',
                    'este_m'
                );
                const nVal = leerCoordExcelSocios(
                    row,
                    mapNormAOriginal,
                    'norte',
                    'coordenada_n',
                    'coordenada_y',
                    'northing',
                    'n',
                    'y',
                    'norte_m'
                );
                const z = obtenerZonaImportSociosProyectadas();
                const conv = convertirProyectadasARGaWgs84(fam, z, eVal, nVal);
                if (conv) {
                    latitud = conv.lat;
                    longitud = conv.lng;
                }
            } else {
                const laRaw = leerCoordExcelSocios(row, mapNormAOriginal, 'latitud', 'lat', 'latitude', 'lat_gps');
                const loRaw = leerCoordExcelSocios(row, mapNormAOriginal, 'longitud', 'lng', 'lon', 'longitude', 'lng_gps');
                const wgs = validarWgs84Import(laRaw, loRaw);
                latitud = wgs.la;
                longitud = wgs.lo;
            }
            const identificadorSintetico = String(nis_medidor || '').startsWith('XLSX-');
            const faltan = validarAnclasImportSociosPorRubro(rubroImp, {
                nisPart,
                medPart,
                nombre,
                calle,
                loc,
                provinciaSoc,
                identificadorSintetico,
            });
            if (faltan.length) {
                omitidas.push({ fila: filaN, r: faltan.join(', ') });
                continue;
            }
            const datosExtra = recolectarDatosExtraExcelSocios(row, mapNormAOriginal);
            payloads.push({
                nis_medidor,
                nis: nisPart || null,
                medidor: medPart || null,
                nombre,
                calle,
                numero,
                barrioSoc,
                telefono,
                dist,
                loc,
                provincia: provinciaSoc || null,
                codigo_postal: codigoPostalSoc || null,
                tar,
                ur,
                transf,
                tcon,
                fas,
                latitud: latitud != null ? latitud : null,
                longitud: longitud != null ? longitud : null,
                datos_extra: datosExtra,
            });
        }
        if (omitidas.length) {
            const porMotivo = {};
            for (const o of omitidas) {
                const k = o.r || '?';
                porMotivo[k] = (porMotivo[k] || 0) + 1;
            }
            console.warn('[import-socios] filas omitidas (anclas)', {
                total: omitidas.length,
                por_motivo: porMotivo,
                muestra: omitidas.slice(0, 15),
            });
        }
        const inferirCpNominatim = document.getElementById('socios-import-cp-nominatim')?.checked === true;
        let cpInf = 0;
        if (inferirCpNominatim) {
            req().actualizarOverlayImportacion('Inferencia de códigos postales (Nominatim)…');
            cpInf = await aplicarInferenciaCpNominatimABulkImportSocios(payloads);
        }
        let ok = 0;
        let fail = 0;
        const totalPay = payloads.length;
        for (let i = 0; i < totalPay; i += SOCIOS_BULK_CHUNK) {
            const chunk = payloads.slice(i, i + SOCIOS_BULK_CHUNK);
            req().actualizarOverlayImportacion(`Importando socios… ${Math.min(i + chunk.length, totalPay)} / ${totalPay}`);
            try {
                await ejecutarBulkInsertSociosCatalogo(chunk);
                ok += chunk.length;
            } catch (e) {
                for (const p of chunk) {
                    try {
                        await ejecutarBulkInsertSociosCatalogo([p]);
                        ok++;
                    } catch (e2) {
                        fail++;
                        if (errMsgs.length < 8) errMsgs.push(`NIS ${p.nis_medidor}: ${e2 && e2.message ? e2.message : String(e2)}`);
                    }
                }
            }
            await new Promise((r) => setTimeout(r, 0));
        }
        req().ocultarOverlayImportacion();
        const sufS = reemplazar ? ' (catálogo reemplazado)' : '';
        if (fail && !ok) {
            toast(`Socios: 0 OK, ${fail} errores${sufS}`, 'error');
            alert('No se pudo completar la importación de socios.\n\n' + errMsgs.join('\n'));
        } else {
            toast(`Socios: ${ok} OK` + (fail ? ', ' + fail + ' errores' : '') + sufS, ok > 0 ? 'success' : 'error');
            if (fail && errMsgs.length) alert('Algunas filas fallaron:\n\n' + errMsgs.join('\n'));
        }
        if (omitidas.length) {
            const muestra = omitidas
                .slice(0, 6)
                .map((o) => `Fila ${o.fila}: ${o.r}`)
                .join('\n');
            alert(
                `Se omitieron ${omitidas.length} fila(s) por datos incompletos según el tipo de negocio.\n\n` +
                    muestra +
                    (omitidas.length > 6 ? `\n… y ${omitidas.length - 6} más (consola del navegador).` : '')
            );
        }
        if (avisosGeoTel.length) {
            console.warn('[import-socios] avisos localidad/provincia/teléfono (tabla de áreas)', avisosGeoTel);
            const muestraA = avisosGeoTel.slice(0, 14).join('\n');
            alert(
                `Avisos de importación (${avisosGeoTel.length}): localidad o provincia aproximada, o tel. 15 sin código de área.\n\n` +
                    muestraA +
                    (avisosGeoTel.length > 14 ? `\n… y ${avisosGeoTel.length - 14} más (consola del navegador).` : '')
            );
        }
        if (cpInf > 0) {
            toast(`Código postal inferido (Nominatim) en ${cpInf} fila(s).`, 'success');
        } else if (
            !inferirCpNominatim &&
            payloads.some((p) => !p.codigo_postal && p.calle && p.loc && p.provincia)
        ) {
            toast(
                'Import rápido: sin inferir CP. Podés marcar la casilla Nominatim en la próxima importación, poner CP en el Excel, o dejar que el CP del pedido enriquezca el catálogo al geocodificar reclamos.',
                'info'
            );
        }
        cargarListaSociosAdmin();
        try {
            const chk = document.getElementById('socios-import-reemplazar');
            if (chk) chk.checked = false;
        } catch (_) {}
    } catch (e) {
        req().ocultarOverlayImportacion();
        toastError('import-excel-socios', e, 'Error al leer el Excel.');
        alert('Error al importar socios.\n\n' + mensajeErrorUsuario(e));
    }
    event.target.value = '';
}

/** Borra filas en `socios_catalogo` en Neon para el tenant (con doble confirmación salvo `skipConfirm`). No usar en cambio de sesión liviana: para eso vale `invalidarCachesMultitenantSesionYOAdminUI` + listado filtrado, sin DELETE. */
async function vaciarCoordenadasSociosCatalogo(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const skipConfirm = !!o.skipConfirm;
    const silent = !!o.silent;
    if (!req().esAdmin()) {
        toast('Operación solo para administradores', 'error');
        return;
    }
    const hasSocTVaciar = await req().sociosCatalogoTieneTenantId();
    if (!skipConfirm) {
        const confirmar = confirm(
            '⚠️ ¿ELIMINAR TODOS LOS REGISTROS del catálogo de socios?\n\n' +
                (hasSocTVaciar
                    ? 'Se borrarán todos los socios de ESTA empresa/sede (tenant actual) solamente.\n'
                    : 'Se borrarán TODOS los datos de TODOS los socios (NIS, nombre, dirección, coordenadas, TODO).\n') +
                'Esta acción NO se puede deshacer.\n\n' +
                '¿Continuar?'
        );
        if (!confirmar) return;

        const confirmar2 = confirm(
            '⚠️⚠️ ÚLTIMA CONFIRMACIÓN ⚠️⚠️\n\n' +
                (hasSocTVaciar
                    ? 'Vas a BORRAR el catálogo de socios de esta empresa/sede.\n\n¿Estás SEGURO/A?'
                    : 'Vas a BORRAR TODA LA TABLA de socios_catalogo.\n' +
                      'Se perderán todos los NIS, nombres, direcciones y coordenadas.\n\n' +
                      '¿Estás SEGURO/A?')
        );
        if (!confirmar2) return;
    }

    try {
        req().mostrarOverlayImportacion('Eliminando registros del catálogo...');
        if (hasSocTVaciar) {
            await req().sqlSimple(`DELETE FROM socios_catalogo WHERE tenant_id = ${esc(req().tenantIdActual())}`);
        } else {
            await req().sqlSimple(`DELETE FROM socios_catalogo`);
        }

        req().ocultarOverlayImportacion();

        // Recargar lista
        if (typeof listarSociosAdmin === 'function') {
            await listarSociosAdmin();
        }

        if (!silent) {
            toast(
                hasSocTVaciar ? '✓ Catálogo de socios vaciado para esta empresa' : '✓ Tabla de socios eliminada completamente',
                'success'
            );
        }
    } catch (e) {
        req().ocultarOverlayImportacion();
        console.error('[vaciar-tabla-socios]', e);
        if (!silent) toast('Error al vaciar tabla: ' + (e?.message || e), 'error');
        throw e;
    }
}
// Exponer globalmente para onclick
window.vaciarCoordenadasSociosCatalogo = vaciarCoordenadasSociosCatalogo;

let _modalFormatoSociosKeyHandler = null;
function cerrarModalFormatoExcelSocios() {
    const m = document.getElementById('modal-formato-excel-socios');
    if (m) m.remove();
    try {
        if (_modalFormatoSociosKeyHandler) {
            document.removeEventListener('keydown', _modalFormatoSociosKeyHandler);
            _modalFormatoSociosKeyHandler = null;
        }
    } catch (_) {}
}

/** Título legible del rubro para el modal de importación de socios. */
function tituloNegocioFormatoSocios() {
    const r = req().normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) || 'cooperativa_electrica';
    if (r === 'municipio') return 'Municipio';
    if (r === 'cooperativa_agua') return 'Cooperativa de agua';
    return 'Cooperativa eléctrica';
}

/** Plantilla CSV vacía con columnas ancla + innegociables (UTF-8 BOM para Excel). */
function descargarPlantillaCsvSociosRubro() {
    const r = req().normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) || 'cooperativa_electrica';
    const post = ['provincia', 'localidad', 'direccion', 'numero', 'codigo_postal', 'telefono', 'latitud', 'longitud'];
    let head = [];
    if (r === 'municipio') head = ['vecino', 'apellido', 'nombres', ...post, 'mi_columna_libre'];
    else if (r === 'cooperativa_agua') head = ['abonado', 'medidor', 'apellido', 'nombres', ...post, 'mi_columna_libre'];
    else head = ['nis', 'medidor', 'apellido', 'nombres', ...post, 'mi_columna_libre'];
    const bom = '\ufeff';
    const csv = bom + head.join(';') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plantilla_socios_${r}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast('Plantilla CSV descargada', 'success');
}

function mostrarFormatoExcelSocios() {
    cerrarModalFormatoExcelSocios();
    const r = req().normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) || 'cooperativa_electrica';
    const tNeg = tituloNegocioFormatoSocios();
    let obligHtml = '';
    let ejemplo = '';
    if (r === 'municipio') {
        obligHtml =
            '<p style="margin:0 0 .45rem;font-size:.82rem;line-height:1.5;color:var(--tm)">Tu Excel debe incluir obligatoriamente: <strong>ID vecino</strong> (sinónimos: vecino, nº de vecino, Socio…), <strong>nombre y apellido</strong> (o apellido+nombres), <strong>calle o dirección</strong>, <strong>nº de puerta</strong> (puede ir vacío), <strong>ciudad / localidad</strong> y <strong>provincia</strong>. No se exige medidor.</p>' +
            '<ul style="margin:.35rem 0;padding-left:1.15rem;line-height:1.45;font-size:.82rem;color:var(--tm)">' +
            '<li>Columnas libres: cualquier otro encabezado se guarda en <code>datos_extra</code> y aparece como columna extra en el listado del catálogo.</li></ul>';
        ejemplo =
            '<pre style="font-size:.72rem;overflow:auto;margin:.4rem 0;padding:.45rem;background:var(--bg);border:1px solid var(--bo);border-radius:.4rem">vecino;apellido;nombres;direccion;numero;localidad;provincia;codigo_postal;telefono;latitud;longitud\n' +
            '1201;Pérez;Juan;San Martín;;Paraná;Entre Ríos;;;;</pre>';
    } else if (r === 'cooperativa_agua') {
        obligHtml =
            '<p style="margin:0 0 .45rem;font-size:.82rem;line-height:1.5;color:var(--tm)">Tu Excel debe incluir obligatoriamente: <strong>ID socio / abonado</strong>, <strong>medidor</strong>, <strong>nombre y apellido</strong>, <strong>calle o dirección</strong>, <strong>nº de puerta</strong> (puede ir vacío), <strong>ciudad / localidad</strong> y <strong>provincia</strong>.</p>' +
            '<ul style="margin:.35rem 0;padding-left:1.15rem;line-height:1.45;font-size:.82rem;color:var(--tm)">' +
            '<li>Columnas libres → <code>datos_extra</code> y columnas dinámicas en el listado.</li></ul>';
        ejemplo =
            '<pre style="font-size:.72rem;overflow:auto;margin:.4rem 0;padding:.45rem;background:var(--bg);border:1px solid var(--bo);border-radius:.4rem">abonado;medidor;apellido;nombres;direccion;numero;localidad;provincia;codigo_postal;telefono;latitud;longitud\n' +
            '45001;A00123456;Gómez;María;Mitre;;Paraná;Entre Ríos;;;;</pre>';
    } else {
        obligHtml =
            '<p style="margin:0 0 .45rem;font-size:.82rem;line-height:1.5;color:var(--tm)">Tu Excel debe incluir obligatoriamente: <strong>NIS / ID</strong>, <strong>medidor</strong>, <strong>nombre y apellido</strong>, <strong>calle o dirección</strong>, <strong>nº de puerta</strong> (puede ir vacío), <strong>ciudad / localidad</strong> y <strong>provincia</strong>.</p>' +
            '<ul style="margin:.35rem 0;padding-left:1.15rem;line-height:1.45;font-size:.82rem;color:var(--tm)">' +
            '<li>Columnas libres → <code>datos_extra</code> y columnas dinámicas en el listado.</li></ul>';
        ejemplo =
            '<pre style="font-size:.72rem;overflow:auto;margin:.4rem 0;padding:.45rem;background:var(--bg);border:1px solid var(--bo);border-radius:.4rem">nis;medidor;apellido;nombres;direccion;numero;localidad;provincia;codigo_postal;telefono;latitud;longitud\n' +
            '700001;12345678;López;Carlos;Urquiza;;Paraná;Entre Ríos;;;;</pre>';
    }
    const inneg =
        '<ul style="margin:.35rem 0;padding-left:1.15rem;line-height:1.45;font-size:.82rem;color:var(--tm)">' +
        '<li>En base de datos siempre existen las columnas fijas del catálogo; <strong>código postal, teléfono, lat/lon, barrio</strong> pueden venir vacíos en el Excel.</li>' +
        '<li>Al importar: se intenta inferir el CP con Nominatim (opcional, casilla en pantalla) y se <strong>normaliza el teléfono</strong> a 54… (sin el 9 móvil tras el país; incluye 0/0343, 15 y variantes) usando la tabla de características por localidad. <strong>Localidad y provincia</strong> se comparan sin tildes y con tolerancia a errores de escritura; si hay duda, se muestra un aviso al terminar.</li>' +
        '</ul>';
    const wrap = document.createElement('div');
    wrap.id = 'modal-formato-excel-socios';
    wrap.style.cssText =
        'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(15,23,42,.45);backdrop-filter:blur(2px)';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
        `<div style="max-width:560px;width:100%;max-height:min(90vh,640px);overflow:auto;background:var(--bg);border:1px solid var(--bo);border-radius:.65rem;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:1rem 1.1rem 1rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;margin-bottom:.65rem">
        <h3 style="margin:0;font-size:1rem;color:var(--bd)">Formato de planilla para ${String(tNeg).replace(/</g, '&lt;')}</h3>
        <button type="button" class="panel-win-btn" onclick="cerrarModalFormatoExcelSocios()" aria-label="Cerrar"><i class="fas fa-times"></i></button>
      </div>
      <p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem;line-height:1.45"><strong>Fila 1 = encabezados.</strong> El orden de columnas no importa. Podés sumar columnas libres: se guardan en <code style="font-size:.72rem">datos_extra</code> (JSON en base de datos).</p>
      <h4 style="margin:.65rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Campos obligatorios (ancla)</h4>
      ${obligHtml}
      <h4 style="margin:.65rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Columnas innegociables (pueden ir vacías)</h4>
      ${inneg}
      <h4 style="margin:.65rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Enriquecimiento progresivo</h4>
      <ul style="margin:.35rem 0;padding-left:1.15rem;line-height:1.45;font-size:.82rem;color:var(--tm)">
        <li><strong>Coordenadas y nº de puerta:</strong> si el usuario comparte <strong>ubicación en vivo por WhatsApp</strong>, tiene prioridad sobre inferencias por Nominatim o geocodificación por dirección.</li>
        <li>Cada reclamo por WhatsApp también puede completar <strong>teléfono</strong> y otros datos en el catálogo cuando hay coincidencia por NIS o dirección.</li>
      </ul>
      <h4 style="margin:.65rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Ejemplo</h4>
      ${ejemplo}
      <p style="font-size:.72rem;color:#92400e;margin:.55rem 0 0;line-height:1.45;padding:.45rem .55rem;background:#fffbeb;border:1px solid #fcd34d;border-radius:.4rem"><strong>Nota:</strong> Ejecutá en Neon las migraciones <code>add_codigos_area_argentina.sql</code> y <code>seed_codigos_area_argentina.sql</code> para que la normalización de teléfonos use la tabla de características por localidad.</p>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.85rem;align-items:center">
        <button type="button" class="btn-sm primary" onclick="descargarPlantillaCsvSociosRubro()"><i class="fas fa-download"></i> Descargar plantilla CSV</button>
        <button type="button" class="btn-sm" style="border:1px solid var(--bo)" onclick="cerrarModalFormatoExcelSocios()">Cerrar</button>
      </div>
      <p style="font-size:.72rem;color:var(--tl);margin:.65rem 0 0;line-height:1.4">Coordenadas en el Excel: podés usar WGS84 o Este/Norte (según selector arriba del import). Sin «vaciar», se fusiona por <code>nis_medidor</code>.</p>
    </div>`;
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap) cerrarModalFormatoExcelSocios();
    });
    _modalFormatoSociosKeyHandler = (ev) => {
        if (ev.key === 'Escape') cerrarModalFormatoExcelSocios();
    };
    document.addEventListener('keydown', _modalFormatoSociosKeyHandler);
    document.body.appendChild(wrap);
}

export {
    cargarListaSociosAdmin,
    importarExcelSocios,
    mostrarFormatoExcelSocios,
    vaciarCoordenadasSociosCatalogo,
    cerrarModalFormatoExcelSocios,
    descargarPlantillaCsvSociosRubro,
};
