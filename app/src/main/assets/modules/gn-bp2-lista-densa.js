/**
 * Panel #bp2: lista más compacta cuando hay muchos pedidos (pendientes/asignados).
 * Cerrados siguen limitados en render() del panel principal.
 * made by leavera77
 */

const UMBRAL = 35;

export function syncBp2ListaDensidad() {
    const pl = document.getElementById('pl');
    const bp2 = document.getElementById('bp2');
    if (!pl || !bp2) return;
    const n = pl.querySelectorAll('.pi').length;
    const dense = n >= UMBRAL;
    bp2.classList.toggle('gn-bp2-many-pedidos', dense);
    pl.classList.toggle('gn-bp2-lista-densa', dense);
}

let _obsPl = null;

export function installGnBp2ListaDensaObserver() {
    const pl = document.getElementById('pl');
    if (!pl || _obsPl) return;
    _obsPl = new MutationObserver(() => syncBp2ListaDensidad());
    _obsPl.observe(pl, { childList: true });
    syncBp2ListaDensidad();
}
