/**
 * Apila modales (.mo) al frente: cada vez que un modal gana .active, sube z-index por encima del resto.
 * También sube `#modal-foto-ampliada` (visor de fotos) y `#print-container` en modo impresión, que no son `.mo`
 * pero deben quedar por encima de `#dm` tras `gnForceModalZFront` (base ya > 300000 en CSS fijo).
 */
let _gnModalZBase = 300000;

function bumpStackedFront(el) {
    if (!el) return;
    try {
        _gnModalZBase += 2;
        el.style.setProperty('z-index', String(_gnModalZBase), 'important');
    } catch (_) {}
}

function bumpMoZ(el) {
    if (!el || !el.classList || !el.classList.contains('mo')) return;
    bumpStackedFront(el);
}

/** Visor de foto, impresión o avance de pedido: mismo contador que `.mo` para quedar al frente del detalle #dm. */
function bumpPedidoSuboverlayIfShown(el) {
    if (!el || !el.classList) return;
    if (el.id === 'modal-foto-ampliada' && el.classList.contains('active')) bumpStackedFront(el);
    else if (el.id === 'print-container' && el.classList.contains('printing')) bumpStackedFront(el);
    else if (el.id === 'avance-modal' && el.classList.contains('active')) bumpStackedFront(el);
}

/**
 * Fuerza un modal `.mo` por encima de paneles con z-index alto (p. ej. #admin-panel)
 * aunque ya tuviera `.active` y el MutationObserver no dispare.
 */
export function gnForceModalZFront(el) {
    bumpMoZ(el);
}

export function initGnModalZIndexStack() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    try {
        const obs = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
                const t = m.target;
                if (!t || !t.classList) continue;
                if (t.id === 'modal-foto-ampliada' || t.id === 'print-container' || t.id === 'avance-modal') {
                    bumpPedidoSuboverlayIfShown(t);
                    continue;
                }
                if (t.classList.contains('mo') && t.classList.contains('active')) bumpMoZ(t);
            }
        });
        obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
        document.querySelectorAll('.mo.active').forEach(bumpMoZ);
        bumpPedidoSuboverlayIfShown(document.getElementById('modal-foto-ampliada'));
        bumpPedidoSuboverlayIfShown(document.getElementById('print-container'));
        bumpPedidoSuboverlayIfShown(document.getElementById('avance-modal'));
    } catch (_) {}
}
