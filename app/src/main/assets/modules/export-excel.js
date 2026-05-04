/**
 * Exportación Excel/CSV y helpers de archivo (sin estado de sesión propio).
 * Las funciones que dependen del dominio reciben `deps` desde app.js.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

export function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

export function textToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
}

export function guardarArchivoAndroid(nombre, mime, base64) {
    if (!(window.AndroidDevice && typeof window.AndroidDevice.saveBase64File === 'function')) return false;
    try {
        return !!window.AndroidDevice.saveBase64File(nombre, mime, base64);
    } catch (_) {
        return false;
    }
}

export function dl(data, nombre, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
    }, 1000);
}

export function exportarCSV(datos, nombre) {
    const headers = Object.keys(datos[0]);
    const rows = datos.map(row => headers.map(h => {
        const val = row[h] || '';
        return '"' + String(val).replace(/"/g, '""') + '"';
    }).join(','));

    const csv = [headers.map(h => '"' + h + '"').join(','), ...rows].join('\n');
    const fileName = nombre + '.csv';
    const mime = 'text/csv;charset=utf-8;';
    const okAndroid = guardarArchivoAndroid(fileName, mime, textToBase64('\uFEFF' + csv));
    if (!okAndroid) {
        const blob = new Blob(['\uFEFF' + csv], { type: mime });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
    }
    toast(okAndroid ? 'CSV guardado en Descargas' : 'CSV descargado', 'success');
}

export function escapeCsvCeldaPedidos(v) {
    const s = String(v ?? '');
    if (/[\r\n",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

export function splitFechaHoraExportAR(v) {
    if (v == null || v === '') return { fecha: '', hora: '' };
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return { fecha: String(v), hora: '' };
    return {
        fecha: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
}

/**
 * @param {object[]} pedidos
 * @param {string} nombre
 * @param {{
 *   proyectarCoordPedido: (la: any, ln: any) => any,
 *   etiquetaZonaPedido: () => string,
 *   valorZonaPedidoUI: (p: any) => string,
 *   esCooperativaElectricaRubro: () => boolean,
 *   empresaCfg: () => object,
 *   nombreHojaExcelPedidoUnico: (p: any) => string,
 * }} deps
 */
export function runExportPedidosExcelCsv(pedidos, nombre, deps) {
    if (!pedidos || pedidos.length === 0) {
        toast('No hay datos para exportar', 'error');
        return;
    }

    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    const {
        proyectarCoordPedido,
        etiquetaZonaPedido,
        valorZonaPedidoUI,
        esCooperativaElectricaRubro,
        empresaCfg,
        nombreHojaExcelPedidoUnico,
    } = deps;

    const datosExport = pedidos.map(p => {
        const pc = proyectarCoordPedido(p.la, p.ln);
        const cf = String((empresaCfg() || {}).coord_proy_familia || 'none').trim();
        let crsAdm = '';
        let xPlano = '';
        let yPlano = '';
        if (pc) {
            crsAdm = pc.titulo + ' · ' + pc.crsLinea + ' · ' + pc.modoTxt;
            xPlano = pc.vx;
            yPlano = pc.vy;
        } else if (cf === 'none' && p.x_inchauspe != null && p.y_inchauspe != null) {
            crsAdm = 'Inchauspe (valores al crear pedido)';
            xPlano = String(p.x_inchauspe).replace('.', ',');
            yPlano = String(p.y_inchauspe).replace('.', ',');
        }
        return {
            'N° Pedido': p.np || '',
            'Fecha Creación': p.f ? new Date(p.f).toLocaleString('es-AR', { ...tz, hour12: false }) : '',
            'Fecha Cierre': p.fc ? new Date(p.fc).toLocaleString('es-AR', { ...tz, hour12: false }) : '',
            'Fecha Último Avance': p.fa ? new Date(p.fa).toLocaleString('es-AR', { ...tz, hour12: false }) : '',
            [etiquetaZonaPedido()]: valorZonaPedidoUI(p) || '',
            ...(esCooperativaElectricaRubro() ? { Trafo: p.trf || '' } : {}),
            'Cliente': p.cl || '',
            'Tipo de Trabajo': p.tt || '',
            'NIS': p.nis || '',
            'Nombre y apellido': (p.cnom || p.cl || ''),
            'Calle': p.ccal || '',
            'Número': p.cnum || '',
            'Localidad': p.cloc || '',
            'Tel. contacto': p.tel || '',
            'Dirección consolidada': [p.ccal || '', p.cnum || '', p.cloc || ''].filter(Boolean).join(', ') || p.cdir || '',
            'Tipo de conexión': p.stc || '',
            'Fases': p.sfs || '',
            'Referencia ubicación': p.cdir || '',
            'Descripción': p.de || '',
            'Prioridad': p.pr || '',
            'Estado': p.es || '',
            'Avance %': p.av || 0,
            'Trabajo Realizado': p.tr || '',
            'Técnico Cierre': p.tc || '',
            'Latitud (WGS84)': p.la ? p.la.toString().replace('.', ',') : '',
            'Longitud (WGS84)': p.ln ? p.ln.toString().replace('.', ',') : '',
            'CRS planas (admin)': crsAdm,
            'X / Este (m)': xPlano,
            'Y / Norte (m)': yPlano,
            'Cantidad Fotos': p.fotos ? p.fotos.length : 0,
            'Foto Cierre': p.foto_cierre ? 'Sí' : 'No'
        };
    });

    if (typeof XLSX !== 'undefined') {
        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(datosExport);

            const colWidths = [
                { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
                { wch: 15 }, { wch: 20 }, { wch: 10 }, { wch: 20 },
                { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 8 }, { wch: 16 },
                { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
                { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
                { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
                { wch: 10 }, { wch: 10 }
            ];
            ws['!cols'] = colWidths;

            const sheetName = pedidos.length === 1 ? nombreHojaExcelPedidoUnico(pedidos[0]) : 'Pedidos';
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const fileName = nombre + '.xlsx';
            const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            const okAndroid = guardarArchivoAndroid(fileName, mime, arrayBufferToBase64(buf));
            if (!okAndroid) dl(buf, fileName, mime);
            toast(okAndroid ? 'Excel guardado en Descargas' : 'Excel descargado', 'success');
        } catch (e) {
            console.error('Error al generar Excel:', e);
            toast('Error al generar Excel, usando CSV', 'error');
            exportarCSV(datosExport, nombre);
        }
    } else {
        exportarCSV(datosExport, nombre);
    }
}
