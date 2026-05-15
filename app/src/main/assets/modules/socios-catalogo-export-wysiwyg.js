/**
 * Export CSV / XLSX alineado al orden y columnas visibles de la tabla admin Socios (WYSIWYG).
 * Sin tenant_id ni columnas JSON ocultas; proyección Este/Norte solo si hay ≥1 fila con WGS84 válido y modo extra_proy.
 * made by leavera77
 */

import { SOCIOS_CATALOGO_OPTS_PRE_CALLE, SOCIOS_CATALOGO_OPT_DISTRIB } from './socios-catalogo-col-defs.js';
import {
    ordenarFamiliasVistaProy,
    obtenerZonaVistaSociosCatalogo,
    sociosCatalogoTieneWgs84ParaProyeccion,
} from './socios-catalogo-export-proyeccion.js';
import { proyectarWgs84AFamiliaFaja, etiquetaFamiliaProyeccionCorta } from '../map.js';
import { sociosActivoTexto } from './socios-catalogo-export-vista.js';
import { normalizarRubroEmpresa } from '../js/core.js';

const LS_SOC_COLVIS = 'pmg_socios_colvis_v1';

function rubroSociosColumnasActual() {
    return normalizarRubroEmpresa(typeof window !== 'undefined' ? window.EMPRESA_CFG?.tipo : '') || 'cooperativa_electrica';
}

function sociosColumnasOpcionalesDefectoPorRubro(rubro) {
    const r = rubro || rubroSociosColumnasActual();
    const all = new Set([...SOCIOS_CATALOGO_OPTS_PRE_CALLE.map((o) => o.id), SOCIOS_CATALOGO_OPT_DISTRIB.id]);
    if (r === 'cooperativa_electrica') return all;
    if (r === 'cooperativa_agua') return new Set(['codigo_postal', 'barrio', 'distribuidor_codigo']);
    if (r === 'cooperativa_electrica') return new Set(['codigo_postal', 'barrio', 'distribuidor_codigo']);
    if (r === 'municipio') return new Set(['codigo_postal', 'barrio']);
    return all;
}

function sociosIdsOpcionalesPermitidos() {
    return new Set([...SOCIOS_CATALOGO_OPTS_PRE_CALLE.map((o) => o.id), SOCIOS_CATALOGO_OPT_DISTRIB.id]);
}

/** Misma lógica que `admin-socios.js` — para export sin depender de initAdminSocios. */
export function leerSociosColvisSetParaExport() {
    const rubro = rubroSociosColumnasActual();
    const allowed = sociosIdsOpcionalesPermitidos();
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
    return sociosColumnasOpcionalesDefectoPorRubro(rubro);
}

function nisCelda(s) {
    const direct = String(s.nis ?? '').trim();
    if (direct) return direct;
    const nm = String(s.nis_medidor ?? '').trim();
    if (!nm) return '';
    const ix = nm.indexOf('-');
    return ix > 0 ? nm.slice(0, ix).trim() : nm;
}

function medidorCelda(s) {
    return String(s.medidor ?? '').trim();
}

function fmtLatLonCelda(v) {
    if (v == null || v === '') return '—';
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(6) : '—';
}

function parseDatosExtra(val) {
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

function algunaFilaTieneWgs84(rows) {
    return (
        Array.isArray(rows) &&
        rows.some((r) => sociosCatalogoTieneWgs84ParaProyeccion(r?.latitud, r?.longitud))
    );
}

function proyHeadersYOrden(prefs, algunaWgs) {
    if (!algunaWgs || prefs.modo !== 'extra_proy' || !prefs.familias?.length) {
        return { headers: [], orden: [], zona: null };
    }
    const z = obtenerZonaVistaSociosCatalogo();
    const orden = ordenarFamiliasVistaProy(prefs.familias, prefs.familia_primaria);
    const headers = [];
    for (const fam of orden) {
        const ab = etiquetaFamiliaProyeccionCorta(fam);
        headers.push(`X (${ab})`, `Y (${ab})`);
    }
    return { headers, orden, zona: z };
}

function valoresProyeccionFila(lat, lon, orden, zona) {
    const vals = [];
    if (!orden.length) return vals;
    if (!sociosCatalogoTieneWgs84ParaProyeccion(lat, lon)) {
        for (let i = 0; i < orden.length; i++) {
            vals.push('', '');
        }
        return vals;
    }
    const la = Number(lat);
    const lo = Number(lon);
    for (const fam of orden) {
        const pr = proyectarWgs84AFamiliaFaja(la, lo, fam, zona);
        if (pr) {
            vals.push(Number(pr.e.toFixed(1)), Number(pr.n.toFixed(1)));
        } else {
            vals.push('', '');
        }
    }
    return vals;
}

/**
 * @param {object} p
 * @param {Record<string, unknown>[]} rows
 * @param {Set<string>} visCols
 * @param {string[]} extraKeys
 * @param {boolean} esMunicipio
 * @param {{ modo: string, familias: string[], familia_primaria: string }} prefsVistaProy
 */
export function sociosCatalogoBuildWysiwygExport(p) {
    const { rows, visCols, extraKeys, esMunicipio, prefsVistaProy } = p;
    const algunaWgs = algunaFilaTieneWgs84(rows);
    const { headers: proyH, orden, zona } = proyHeadersYOrden(prefsVistaProy, algunaWgs);

    const headers = [];
    headers.push(esMunicipio ? 'ID vecino' : 'NIS');
    if (!esMunicipio) headers.push('Medidor');
    headers.push('Nombre', 'Localidad', 'Provincia');
    for (const o of SOCIOS_CATALOGO_OPTS_PRE_CALLE) {
        if (visCols.has(o.id)) headers.push(o.th);
    }
    headers.push('Calle', 'Nº', 'Tel.');
    if (visCols.has(SOCIOS_CATALOGO_OPT_DISTRIB.id)) headers.push(SOCIOS_CATALOGO_OPT_DISTRIB.th);
    headers.push('Lat (WGS84)', 'Lon (WGS84)');
    for (const k of extraKeys) {
        headers.push(k);
    }
    headers.push(...proyH);
    headers.push('Estado');

    const matrix = [];
    for (const s of rows) {
        const cells = [];
        cells.push(nisCelda(s));
        if (!esMunicipio) cells.push(medidorCelda(s));
        cells.push(
            s.nombre == null ? '' : String(s.nombre),
            s.localidad == null ? '' : String(s.localidad),
            s.provincia == null ? '' : String(s.provincia)
        );
        for (const o of SOCIOS_CATALOGO_OPTS_PRE_CALLE) {
            if (!visCols.has(o.id)) continue;
            const raw = s[o.field];
            cells.push(raw == null ? '' : String(raw));
        }
        cells.push(
            String(s.calle ?? '').trim(),
            String(s.numero ?? '').trim(),
            s.telefono == null ? '' : String(s.telefono)
        );
        if (visCols.has(SOCIOS_CATALOGO_OPT_DISTRIB.id)) {
            const d = s[SOCIOS_CATALOGO_OPT_DISTRIB.field];
            cells.push(d == null ? '' : String(d));
        }
        cells.push(fmtLatLonCelda(s.latitud), fmtLatLonCelda(s.longitud));
        const de = parseDatosExtra(s.datos_extra);
        for (const ek of extraKeys) {
            const v = de && de[ek] != null ? de[ek] : '';
            cells.push(v == null ? '' : String(v));
        }
        if (orden.length && zona != null) {
            cells.push(...valoresProyeccionFila(s.latitud, s.longitud, orden, zona));
        }
        cells.push(sociosActivoTexto(s.activo));
        matrix.push(cells);
    }

    return { headers, matrix };
}
