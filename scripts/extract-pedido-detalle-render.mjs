import fs from 'fs';
import path from 'path';

const assets = path.join(process.cwd(), 'app', 'src', 'main', 'assets');
const lines = fs.readFileSync(path.join(assets, 'app.js'), 'utf8').split(/\r?\n/);

let body = lines.slice(11100, 11502).join('\n');
body = body.replace(
    /const dmcEl = document\.getElementById\('dmc'\);[\s\S]*?dmcEl\.innerHTML = `/,
    'const html = `'
);
body = body.replace(/\n    `;\n$/, '\n    `;\n    return html;\n');

const out = `/**
 * HTML del modal detalle de pedido (#dmc). Extraído de app.js detalle().
 * made by leavera77
 */
import { gnDetalleImgAttrs } from './pedido-detalle-html-helpers.js';

export function computeDetalleEstructuraSig(p, deps) {
    const fotosCount = Array.isArray(p.fotos) ? p.fotos.filter(Boolean).length : 0;
    return [
        String(p.id),
        String(p.es || ''),
        String(p.tai ?? ''),
        p.sdpen ? '1' : '0',
        deps.pedidoEsDerivadoFuera(p) ? '1' : '0',
        String(fotosCount),
        deps.esTipoPedidoFactibilidad(p.tt) ? '1' : '0',
        deps.incluirBloqueMaterialesEnDetallePedido(p) ? '1' : '0',
        deps.debeMostrarBotonDerivacion(p) ? '1' : '0',
        deps.esAdmin() ? 'a' : 't',
        p.es === 'Cerrado' ? '1' : '0',
        p.es === 'Desestimado' ? '1' : '0',
    ].join('|');
}

export function buildDetallePedidoDmcHtml(p, deps) {
${body}
}
`;

fs.writeFileSync(path.join(assets, 'modules', 'pedido-detalle-render.js'), out);
console.log('done', out.length);
