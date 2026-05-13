/**
 * Exporta socios a .xlsx (SheetJS) — misma matriz WYSIWYG que la tabla admin y el CSV.
 * made by leavera77
 */

import { filtrarSociosFilasExportVista } from './socios-catalogo-export-vista.js';
import { leerPrefsVistaProyeccionSociosCatalogo } from './socios-catalogo-export-proyeccion.js';
import { normalizarRubroEmpresa } from '../js/core.js';
import { sociosCatalogoBuildWysiwygExport, leerSociosColvisSetParaExport } from './socios-catalogo-export-wysiwyg.js';

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

    const extraKeys = Array.isArray(window._sociosDatosExtraColumnKeys) ? window._sociosDatosExtraColumnKeys : [];
    const vis = leerSociosColvisSetParaExport();
    const prefs = leerPrefsVistaProyeccionSociosCatalogo();
    const esMunicipio = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) === 'municipio';
    const { headers, matrix } = sociosCatalogoBuildWysiwygExport({
        rows,
        visCols: vis,
        extraKeys,
        esMunicipio,
        prefsVistaProy: prefs,
    });

    const aoa = [headers, ...matrix];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    _applyColWidths(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'Socios');
    const day = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `socios_catalogo_vista_${day}.xlsx`);
    try {
        window.toast?.(`Excel descargado (${rows.length.toLocaleString('es-AR')} filas).`, 'success');
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window._gnExportSociosExcelCompleto = exportarSociosExcelCompletoDesdeMemoria;
}
