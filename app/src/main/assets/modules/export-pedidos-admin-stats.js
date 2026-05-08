/**
 * Exportación Excel (.xlsx) del listado de pedidos admin (mismos filtros que el CSV de estadísticas).
 * made by leavera77
 */

import { splitFechaHoraExportAR } from './export-excel.js';

/** @type {Record<string, any>|null} */
let _deps = null;

/**
 * @param {{
 *   esAdmin: () => boolean,
 *   toast: (msg: string, kind?: string) => void,
 *   toastError: (tag: string, e: unknown) => void,
 *   gnCerrarModalPedidoDetalleSiAbierto: () => void,
 *   neonOk: () => boolean,
 *   sqlReady: () => boolean,
 *   modoOffline: () => boolean,
 *   sqlSimple: (q: string) => Promise<{ rows?: any[] }>,
 *   pedidosFiltroTenantSql: () => Promise<string>,
 *   resolveCondicionFechaPedidosStats: (tsql: string) => Promise<{ condFecha: string }>,
 *   appendTipoTrabajoFilterToWhere: (where: string, tipoFilt: string, escFn: (v: any) => string) => string,
 *   esc: (v: any) => string,
 *   tenantIdActual: () => number,
 * }} d
 */
export function initExportPedidosAdminStats(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function _applyColWidthsAndAutofilter(ws) {
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
            max = Math.max(max, Math.min(55, v.length + 2));
        }
        cols.push({ wch: max });
    }
    ws['!cols'] = cols;
    ws['!autofilter'] = { ref: ws['!ref'] };
}

export async function exportarPedidosExcelAdmin() {
    const d = _deps;
    if (!d) {
        try {
            window.toast?.('Export no inicializado', 'error');
        } catch (_) {}
        return;
    }
    try {
        d.gnCerrarModalPedidoDetalleSiAbierto();
    } catch (_) {}
    if (!d.esAdmin()) {
        d.toast('Solo administradores pueden exportar el listado.', 'error');
        return;
    }
    if (d.modoOffline() || !d.neonOk() || !d.sqlReady()) {
        d.toast('Se requiere conexión a la base (Neon).', 'error');
        return;
    }
    const XLSX = window.XLSX;
    if (!XLSX?.utils?.book_new || !XLSX.writeFile) {
        d.toast('Excel aún no cargó — esperá unos segundos y reintentá', 'error');
        return;
    }
    const tsql = await d.pedidosFiltroTenantSql();
    const { condFecha } = await d.resolveCondicionFechaPedidosStats(tsql);
    const estadoSel = (document.getElementById('est-csv-estado')?.value || '').trim();
    const tipoFilt = (document.getElementById('est-csv-tipo')?.value || '').trim();
    let where = `WHERE ${condFecha}${tsql}`;
    if (estadoSel) where += ` AND estado = ${d.esc(estadoSel)}`;
    where = d.appendTipoTrabajoFilterToWhere(where, tipoFilt, d.esc);
    const q = `SELECT id, numero_pedido, fecha_creacion, fecha_cierre, estado, prioridad, tipo_trabajo,
        COALESCE(TRIM(distribuidor),'') AS distribuidor,
        COALESCE(TRIM(barrio),'') AS barrio,
        COALESCE(TRIM(trafo),'') AS trafo,
        COALESCE(TRIM(nis_medidor),'') AS nis_medidor,
        COALESCE(NULLIF(TRIM(cliente_nombre),''), NULLIF(TRIM(cliente),''), '') AS contacto,
        COALESCE(TRIM(cliente_calle),'') AS cliente_calle,
        COALESCE(TRIM(cliente_numero_puerta),'') AS cliente_numero_puerta,
        COALESCE(TRIM(cliente_localidad),'') AS cliente_localidad,
        COALESCE(TRIM(telefono_contacto),'') AS telefono_contacto,
        descripcion
        FROM pedidos ${where} ORDER BY fecha_creacion DESC LIMIT 10000`;
    try {
        const r = await d.sqlSimple(q);
        const rows = r.rows || [];
        if (!rows.length) {
            d.toast('No hay pedidos con esos filtros.', 'info');
            return;
        }
        const excelRows = rows.map((row) => {
            const fc = splitFechaHoraExportAR(row.fecha_creacion);
            const ff = splitFechaHoraExportAR(row.fecha_cierre);
            return {
                id: row.id,
                numero_pedido: row.numero_pedido,
                fecha_creacion_fecha: fc.fecha,
                fecha_creacion_hora: fc.hora,
                fecha_cierre_fecha: ff.fecha,
                fecha_cierre_hora: ff.hora,
                estado: row.estado,
                prioridad: row.prioridad,
                tipo_trabajo: row.tipo_trabajo,
                distribuidor: row.distribuidor,
                barrio: row.barrio,
                trafo: row.trafo,
                nis_medidor: row.nis_medidor,
                contacto: row.contacto,
                cliente_calle: row.cliente_calle,
                cliente_numero_puerta: row.cliente_numero_puerta,
                cliente_localidad: row.cliente_localidad,
                direccion_consolidada:
                    [row.cliente_calle, row.cliente_numero_puerta, row.cliente_localidad].filter(Boolean).join(', ') ||
                    '',
                telefono_contacto: row.telefono_contacto,
                descripcion: row.descripcion,
            };
        });
        const ws = XLSX.utils.json_to_sheet(excelRows);
        _applyColWidthsAndAutofilter(ws);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
        const tid = typeof d.tenantIdActual === 'function' ? d.tenantIdActual() : 0;
        const tidStr = Number.isFinite(tid) && tid > 0 ? String(tid) : 'tenant';
        const day = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `pedidos_${tidStr}_${day}.xlsx`);
        d.toast(`Exportados ${rows.length} pedidos (Excel)`, 'success');
    } catch (e) {
        d.toastError('export-pedidos-excel-admin', e);
    }
}
