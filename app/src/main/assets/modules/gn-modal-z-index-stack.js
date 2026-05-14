/**
 * Apila modales (.mo) al frente: cada vez que un modal gana .active, sube z-index por encima del resto.
 * También sube `#modal-foto-ampliada`, `#cm2` (cierre), impresión y avance por encima de `#dm` cuando corresponde.
 */
let _gnModalZBase = 300000;

function bumpStackedFront(el) {
    if (!el) return;
    try {
        _gnModalZBase += 2;
        el.style.setProperty('z-index', String(_gnModalZBase), 'important');
    } catch (_) {}
}

/**
 * Capas que deben quedar por encima de `#dm` mientras están visibles (visor foto, avance, impresión, cierre, #pm, asignar técnico).
 * Si `#dm` recibe `gnForceModalZFront` o mutaciones de clase, no debe subir el z-index por encima de estas.
 */
export function gnHaySuboverlaySobreDetallePedido() {
    try {
        const foto = document.getElementById('modal-foto-ampliada');
        if (foto && foto.classList.contains('active')) return true;
        const printEl = document.getElementById('print-container');
        if (printEl && printEl.classList.contains('printing')) return true;
        const av = document.getElementById('avance-modal');
        if (av && av.classList.contains('active')) return true;
        const cm2 = document.getElementById('cm2');
        if (cm2 && cm2.classList.contains('active') && cm2.classList.contains('mo')) return true;
        const pm = document.getElementById('pm');
        if (pm && pm.classList.contains('active') && pm.classList.contains('mo')) return true;
        const asig = document.getElementById('modal-asignar-tecnico');
        if (asig && asig.classList.contains('active') && asig.classList.contains('mo')) return true;
        return false;
    } catch (_) {
        return false;
    }
}

function bumpMoZ(el) {
    if (!el || !el.classList || !el.classList.contains('mo')) return;
    if (el.id === 'dm' && gnHaySuboverlaySobreDetallePedido()) return;
    bumpStackedFront(el);
}

/** Visor de foto, cierre (#cm2), impresión o avance: contador global por encima de `#dm` cuando están visibles. */
function bumpPedidoSuboverlayIfShown(el) {
    if (!el || !el.classList) return;
    if (el.id === 'modal-foto-ampliada' && el.classList.contains('active')) bumpStackedFront(el);
    else if (el.id === 'print-container' && el.classList.contains('printing')) bumpStackedFront(el);
    else if (el.id === 'avance-modal' && el.classList.contains('active')) bumpStackedFront(el);
    else if (el.id === 'cm2' && el.classList.contains('active') && el.classList.contains('mo')) bumpStackedFront(el);
}

/**
 * Fuerza un modal `.mo` por encima de paneles con z-index alto (p. ej. #admin-panel)
 * aunque ya tuviera `.active` y el MutationObserver no dispare.
 */
export function gnForceModalZFront(el) {
    bumpMoZ(el);
}

/**
 * Sube cualquier overlay (float WA, barra fija, etc.) al mismo contador que los modales `.mo`.
 * Expuesto en `window` para pegamento mínimo en `app.js` (p. ej. barra mover ubicación).
 */
export function gnBumpOverlayElement(el) {
    bumpStackedFront(el);
}

export function initGnModalZIndexStack() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    try {
        try {
            window.gnBumpOverlayElement = gnBumpOverlayElement;
        } catch (_) {}
        const obs = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
                const t = m.target;
                if (!t || !t.classList) continue;
                if (t.id === 'modal-foto-ampliada' || t.id === 'print-container' || t.id === 'avance-modal' || t.id === 'cm2') {
                    bumpPedidoSuboverlayIfShown(t);
                    if (!gnHaySuboverlaySobreDetallePedido()) {
                        const dm = document.getElementById('dm');
                        if (dm && dm.classList.contains('mo') && dm.classList.contains('active')) bumpMoZ(dm);
                    }
                    continue;
                }
                if (t.classList.contains('mo') && t.classList.contains('active')) bumpMoZ(t);
                else if (t.classList.contains('mo') && (t.id === 'pm' || t.id === 'modal-asignar-tecnico')) {
                    if (!gnHaySuboverlaySobreDetallePedido()) {
                        const dm = document.getElementById('dm');
                        if (dm && dm.classList.contains('mo') && dm.classList.contains('active')) bumpMoZ(dm);
                    }
                }
            }
        });
        obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
        document.querySelectorAll('.mo.active').forEach(bumpMoZ);
        bumpPedidoSuboverlayIfShown(document.getElementById('modal-foto-ampliada'));
        bumpPedidoSuboverlayIfShown(document.getElementById('print-container'));
        bumpPedidoSuboverlayIfShown(document.getElementById('avance-modal'));
        bumpPedidoSuboverlayIfShown(document.getElementById('cm2'));
    } catch (_) {}
}
