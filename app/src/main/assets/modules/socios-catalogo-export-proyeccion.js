/**
 * Preferencias y columnas Este/Norte (modo extra_proy) compartidas entre la tabla virtual socios y export CSV/XLSX.
 * made by leavera77
 */

import {
    PMG_FAMILIAS_PROYECCION_LIST,
    proyectarWgs84AFamiliaFaja,
    etiquetaFamiliaProyeccionCorta,
    resolverFajaProyeccion,
    fajaArgentinaPorLongitud,
} from '../map.js';

export const LS_SOC_VISTA_PROY = 'pmg_socios_vista_proy';

export function leerPrefsVistaProyeccionSociosCatalogo() {
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
                    familia_primaria: PMG_FAMILIAS_PROYECCION_LIST.includes(fp) ? fp : '',
                };
            }
        }
    } catch (_) {}
    return { modo: 'solo_wgs', familias: [], familia_primaria: '' };
}

/** Orden de columnas X/Y: la familia «principal» va primero si está entre las elegidas. */
export function ordenarFamiliasVistaProy(fams, primaria) {
    const arr = Array.isArray(fams) ? fams.filter((f) => PMG_FAMILIAS_PROYECCION_LIST.includes(f)) : [];
    const p = String(primaria || '').trim();
    if (!p || !arr.includes(p)) return arr;
    return [p, ...arr.filter((f) => f !== p)];
}

/** Misma regla que import Este/Norte: faja Auto según longitud de la central (`lng_base`). */
export function obtenerZonaImportSociosProyectadas() {
    const sel = document.getElementById('socios-import-faja')?.value || 'auto';
    if (/^[1-7]$/.test(sel)) return parseInt(sel, 10);
    const cfg = typeof window !== 'undefined' ? window.EMPRESA_CFG || {} : {};
    const lo = Number(cfg.lng_base);
    if (Number.isFinite(lo)) return resolverFajaProyeccion('instal', lo);
    return fajaArgentinaPorLongitud(-64);
}

export function obtenerZonaVistaSociosCatalogo() {
    return obtenerZonaImportSociosProyectadas();
}

/**
 * True solo si hay WGS84 real para proyectar (evita `Number(null) === 0`).
 * Alineado con las celdas Lat/Lon del listado admin (null/vacío → sin conversión).
 */
export function sociosCatalogoTieneWgs84ParaProyeccion(lat, lon) {
    if (lat == null || lon == null) return false;
    if (typeof lat === 'string' && String(lat).trim() === '') return false;
    if (typeof lon === 'string' && String(lon).trim() === '') return false;
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
    if (Math.abs(la) > 90 || Math.abs(lo) > 180) return false;
    return true;
}

/**
 * Contexto para export (misma fuente que `_gnSociosExportCtxProy` previo).
 * @returns {{ prefs: { modo: string, familias: string[], familia_primaria: string }, zona: number, ordenarFamilias: typeof ordenarFamiliasVistaProy }}
 */
export function buildCtxProyeccionSociosExport() {
    return {
        prefs: leerPrefsVistaProyeccionSociosCatalogo(),
        zona: obtenerZonaVistaSociosCatalogo(),
        ordenarFamilias: ordenarFamiliasVistaProy,
    };
}

export function proyeccionSociosFamOrderDesdeCtx(ctx) {
    const p = ctx?.prefs || {};
    if (p.modo !== 'extra_proy' || !p.familias?.length) return [];
    return ctx.ordenarFamilias(p.familias, p.familia_primaria);
}

/** Encabezados como en la tabla: «X (…)», «Y (…)». */
export function proyeccionSociosExportHeaderLabels(ctx) {
    const orden = proyeccionSociosFamOrderDesdeCtx(ctx);
    const labels = [];
    for (const fam of orden) {
        const ab = etiquetaFamiliaProyeccionCorta(fam);
        labels.push(`X (${ab})`, `Y (${ab})`);
    }
    return labels;
}

/**
 * Valores Este/Norte en metros (1 decimal, como la grilla) o celdas vacías.
 * @returns {(number|string)[]}
 */
export function proyeccionSociosExportValores(lat, lon, ctx) {
    const orden = proyeccionSociosFamOrderDesdeCtx(ctx);
    const prefs = ctx?.prefs || {};
    if (prefs.modo !== 'extra_proy' || !orden.length) return [];
    const la = Number(lat);
    const lo = Number(lon);
    const z = ctx.zona;
    const vals = [];
    if (!sociosCatalogoTieneWgs84ParaProyeccion(lat, lon)) {
        for (let i = 0; i < orden.length; i++) {
            vals.push('', '');
        }
        return vals;
    }
    for (const fam of orden) {
        const pr = proyectarWgs84AFamiliaFaja(la, lo, fam, z);
        if (pr) {
            vals.push(Number(pr.e.toFixed(1)), Number(pr.n.toFixed(1)));
        } else {
            vals.push('', '');
        }
    }
    return vals;
}
