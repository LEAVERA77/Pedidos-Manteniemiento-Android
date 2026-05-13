/**
 * Apila modales (.mo) al frente: cada vez que un modal gana .active, sube z-index por encima del resto.
 * Útil cuando se abre un modal desde otro (derivación, impresión, export, etc.) en web y WebView.
 */
let _gnModalZBase = 300000;

function bumpMoZ(el) {
    if (!el || !el.classList || !el.classList.contains('mo')) return;
    try {
        _gnModalZBase += 2;
        el.style.setProperty('z-index', String(_gnModalZBase), 'important');
    } catch (_) {}
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
                if (!t || !t.classList || !t.classList.contains('mo')) continue;
                if (t.classList.contains('active')) bumpMoZ(t);
            }
        });
        obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
        document.querySelectorAll('.mo.active').forEach(bumpMoZ);
    } catch (_) {}
}
