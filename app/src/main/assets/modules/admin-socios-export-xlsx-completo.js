/**
 * Exporta socios a .xlsx (SheetJS) alineado a la **tabla admin** del rubro actual:
 * mismas columnas que la vista (municipio / eléctrica / agua), sin columnas legacy de otros rubros.
 * Incluye datos_extra y proyección solo si aplica (como la tabla virtual).
 * made by leavera77
 */

import {
    buildCtxProyeccionSociosExport,
    proyeccionSociosExportHeaderLabels,
    proyeccionSociosExportValores,
} from './socios-catalogo-export-proyeccion.js';
import {
    filtrarSociosFilasExportVista,
    rubroSociosExportDesdeCfg,
    sociosActivoTexto,
    sociosVistaExportSpec,
} from './socios-catalogo-export-vista.js';

function _datosExtraJsonCelda(raw) {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'string') return raw;
    try {
        return JSON.stringify(raw);
    } catch (_) {
        return String(raw);
    }
}

function _parseDatosExtra(val) {
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

function _unionExtraKeys(rows) {
    const k = new Set();
    for (const row of rows) {
        const o = _parseDatosExtra(row.datos_extra);
        if (!o) continue;
        for (const key of Object.keys(o)) {
            const nk = String(key || '').trim();
            if (nk) k.add(nk);
        }
    }
    return [...k].sort();
}

function _applyColWidths(ws) {
    const XLSX = window.XLSX;
    if (!XLSX?.utils || !ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const cols = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
        let max = 10;
        for (let R = range.s.r; R <= range.e.r; R++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[addr];
            const v = cell?.v != null ? String(cell.v) : '';
            max = Math.max(max, Math.min(50, v.length + 2));
        }
        cols.push({ wch: max });
    }
    ws['!cols'] = cols;
    ws['!autofilter'] = { ref: ws['!ref'] };
}

function _numOrEmpty(v) {
    if (v == null || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? n : '';
}

function _keysYLabelsVista(rows) {
    const spec = sociosVistaExportSpec(rubroSociosExportDesdeCfg());
    let keys = [...spec.keys];
    let labels = [...spec.labels];
    if (rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'tenant_id')) && !keys.includes('tenant_id')) {
        keys = [...keys, 'tenant_id'];
        labels = [...labels, 'tenant_id'];
    }
    return { keys, labels };
}

export function exportarSociosExcelCompletoDesdeMemoria() {
    const rawRows = typeof window !== 'undefined' ? window._sociosVirtualRows : null;
    const tid = typeof window.tenantIdActual === 'function' ? Number(window.tenantIdActual()) : NaN;
    const abt = String(typeof window !== 'undefined' ? window.EMPRESA_CFG?.active_business_type || '' : '')
        .trim()
        .toLowerCase();
    const rows = filtrarSociosFilasExportVista(rawRows || [], tid, abt);
    if (!Array.isArray(rows) || !rows.length) {
        if (Array.isArray(rawRows) && rawRows.length) {
            try {
                window.toast?.(
                    'No hay filas para exportar (revisá tenant y línea de negocio activa).',
                    'warning'
                );
            } catch (_) {}
            return;
        }
        try {
            window.toast?.('No hay socios cargados. Abrí la pestaña Socios y esperá a que termine la carga.', 'warning');
        } catch (_) {}
        return;
    }
    if (typeof window.esAdmin === 'function' && !window.esAdmin()) {
        try {
            window.toast?.('Solo administradores.', 'error');
        } catch (_) {}
        return;
    }
    const XLSX = window.XLSX;
    if (!XLSX?.utils?.book_new || !XLSX.writeFile || !XLSX.utils.aoa_to_sheet) {
        try {
            window.toast?.('Excel (SheetJS) aún no cargó — esperá unos segundos y reintentá.', 'error');
        } catch (_) {}
        return;
    }

    const { keys: baseKeysExport, labels: baseLabels } = _keysYLabelsVista(rows);

    const extraKeys = _unionExtraKeys(rows);
    const incluirDeJson = rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'datos_extra'));
    const ctx = buildCtxProyeccionSociosExport();
    const proyHeaders = proyeccionSociosExportHeaderLabels(ctx);

    const headers = [
        ...baseLabels,
        ...(incluirDeJson ? ['datos_extra (JSON)'] : []),
        ...extraKeys.map((k) => `extra:${k}`),
        ...proyHeaders,
    ];

    const aoa = [headers];

    for (const r of rows) {
        const de = _parseDatosExtra(r.datos_extra);
        const line = [];
        for (const k of baseKeysExport) {
            if (k === 'latitud' || k === 'longitud') {
                line.push(_numOrEmpty(r[k]));
                continue;
            }
            if (k === 'activo') {
                line.push(sociosActivoTexto(r.activo));
                continue;
            }
            const raw = r[k];
            line.push(raw == null ? '' : String(raw));
        }
        if (incluirDeJson) {
            line.push(_datosExtraJsonCelda(r.datos_extra));
        }
        for (const ek of extraKeys) {
            const v = de && de[ek] != null ? de[ek] : '';
            line.push(v == null ? '' : String(v));
        }
        for (const pv of proyeccionSociosExportValores(r.latitud, r.longitud, ctx)) {
            line.push(pv === '' ? '' : pv);
        }
        aoa.push(line);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    _applyColWidths(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'Socios');
    const day = new Date().toISOString().slice(0, 10);
    const tidPart = Number.isFinite(tid) && tid > 0 ? `_t${tid}` : '';
    XLSX.writeFile(wb, `socios_catalogo_vista${tidPart}_${day}.xlsx`);
    try {
        window.toast?.(`Excel descargado (${rows.length.toLocaleString('es-AR')} filas).`, 'success');
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window._gnExportSociosExcelCompleto = exportarSociosExcelCompletoDesdeMemoria;
}
