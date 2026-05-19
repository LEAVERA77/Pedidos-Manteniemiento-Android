import fs from 'fs';
const lines = fs.readFileSync('app/src/main/assets/app.js', 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('function htmlSolicitudDerivacionCoopElectricaTecnico'));
const end = lines.findIndex((l) => l.includes('function htmlDerivacionTercerosPedidoDetalle'));
const end2 = lines.findIndex((l, i) => i > end && l.startsWith('/** Distribuidor'));
if (start < 0 || end < 0 || end2 < 0) {
    console.error('not found', start, end, end2);
    process.exit(1);
}
const body = lines.slice(start, end2);
const header = `/**
 * HTML derivación / terceros en modal detalle de pedido.
 * made by leavera77
 */

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setPedidoDetalleDerivacionHtmlDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function d(k) {
    const v = _deps?.[k];
    return typeof v === 'function' ? v : () => v;
}

`;
const out = body
    .map((l) => {
        if (l.startsWith('function html')) return l.replace(/^function /, 'export function ');
        return l
            .replace(/\besTecnicoOSupervisor\(\)/g, 'd("esTecnicoOSupervisor")()')
            .replace(/\besAdmin\(\)/g, 'd("esAdmin")()')
            .replace(/\bdebeMostrarBotonDerivacion\(/g, 'd("debeMostrarBotonDerivacion")(')
            .replace(/\bpedidoEsDerivadoFuera\(/g, 'd("pedidoEsDerivadoFuera")(')
            .replace(/\bnormalizarEstadoPedidoUi\(/g, 'd("normalizarEstadoPedidoUi")(')
            .replace(/\bfmtInformeFecha\(/g, 'd("fmtInformeFecha")(')
            .replace(/\bobtenerWaMeUrlDerivacionEmpresaCfg\(/g, 'd("obtenerWaMeUrlDerivacionEmpresaCfg")(')
            .replace(/\betiquetaFirmaPersona\(\)/g, 'd("etiquetaFirmaPersona")()')
            .replace(/\bapp\.u/g, '(_deps?.getAppUser?.() || {})');
    })
    .join('\n');
fs.writeFileSync('app/src/main/assets/modules/pedido-detalle-derivacion-html.js', header + out + '\n');
const newLines = [...lines.slice(0, start), ...lines.slice(end2)];
fs.writeFileSync('app/src/main/assets/app.js', newLines.join('\n'));
console.log('detalle-html ok, app lines', newLines.length);
