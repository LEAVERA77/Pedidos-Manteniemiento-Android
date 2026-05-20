import fs from 'fs';
import path from 'path';

const p = path.join(process.cwd(), 'app', 'src', 'main', 'assets', 'app.js');
let lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const start = 11193;
const end = 11636;
const insert = `    const deps = getDetalleRenderDeps();
    if (puedePatchIncrementalDetalle(p, opts, deps)) {
        patchDetallePedidoIncremental(p, deps);
        finalizarDetallePedidoAbierto(p);
        return;
    }

    const dmcEl = document.getElementById('dmc');
    const dmAbierto = document.getElementById('dm');
    const restaurarScrollDetalle =
        dmAbierto?.classList.contains('active') &&
        String(dmAbierto.dataset.detallePedidoId || '') === pidKey
            ? dmcEl?.querySelector('.gn-dm-detail-scroll')?.scrollTop ?? 0
            : 0;
    dmcEl.innerHTML = buildDetallePedidoDmcHtml(p, deps);
    guardarDetalleEstructuraSig(p, deps);
    if (restaurarScrollDetalle > 0) {
        requestAnimationFrame(() => {
            const sc = document.querySelector('#dm .gn-dm-detail-scroll');
            if (sc) sc.scrollTop = restaurarScrollDetalle;
        });
    }
    finalizarDetallePedidoAbierto(p);`.split('\n');

lines = [...lines.slice(0, start), ...insert, ...lines.slice(end)];
fs.writeFileSync(p, lines.join('\n'));
console.log('ok', end - start, '->', insert.length);
