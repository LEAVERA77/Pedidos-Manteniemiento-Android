import fs from 'fs';
const app = fs.readFileSync('app/src/main/assets/app.js', 'utf8');
const lines = app.split(/\r?\n/);
const imprimir = lines.slice(17599, 17764).join('\n');
const generar = lines.slice(17766, 17920).join('\n');
const header = `/**
 * Impresión y PDF multipágina de estadísticas admin (orquestación).
 * Captura: informes-estadisticas-pdf-capture.js
 * made by leavera77
 */

import { construirHtmlEncabezadoInformeEmpresa } from './informe-empresa-html-encabezado.js';
import { pdfEncabezadoEmpresaBloque } from './empresa-encabezado-pdf.js';
import {
    pdfMmAjustarImagen,
    escAttrPrint,
    prepararVistaCapturaEstadisticasPdf,
    coleccionSeccionesPdfEstadisticas,
    capturaPdfBloqueResumenEstadisticas,
    html2canvasCapturaElemento,
} from './informes-estadisticas-pdf-capture.js';

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setInformesEstadisticasPrintDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function ctx() {
    return _deps || {};
}

`;
function wrap(fnBody, name) {
    let b = fnBody;
    b = b.replace(/^async function \w+\(\)/, `export async function ${name}()`);
    const subs = [
        ['!esAdmin()', '!ctx().esAdmin?.()'],
        ['modoOffline || !NEON_OK', 'ctx().modoOffline?.() || !ctx().neonOk?.()'],
        [/\btoast\(/g, 'ctx().toast?.('],
        [/\btoastError\(/g, 'ctx().toastError?.('],
        [/\badminTab\(/g, 'ctx().adminTab?.('],
        [/\bcargarEstadisticas\(/g, 'ctx().cargarEstadisticas?.('],
        [/\blineaPeriodoInformeEstadisticas\(\)/g, 'ctx().lineaPeriodoInformeEstadisticas?.()'],
        [/\btituloResumenReferenciaEstadisticas\(\)/g, 'ctx().tituloResumenReferenciaEstadisticas?.()'],
        [/\bpedidosFiltroTenantSql\(/g, 'ctx().pedidosFiltroTenantSql?.('],
        [/\bresolveCondicionFechaPedidosStats\(/g, 'ctx().resolveCondicionFechaPedidosStats?.('],
        [/\bkpiPdfPiePaginas\(/g, 'ctx().kpiPdfPiePaginas?.('],
    ];
    for (const s of subs) b = b.replace(s[0], s[1]);
    return b;
}
const out = header + wrap(imprimir, 'imprimirInformeConGraficos') + '\n\n' + wrap(generar, 'generarPdfEstadisticasMultipaginaENRE') + '\n';
fs.writeFileSync('app/src/main/assets/modules/informes-estadisticas-print.js', out);
console.log('ok', out.split('\n').length, 'lines');
