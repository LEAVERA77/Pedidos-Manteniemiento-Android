/**
 * Panel #bp2 (Pedidos): ampliar a pantalla completa y grilla de tarjetas más angostas.
 * made by leavera77
 */

const LS_BP2_MAX = 'pmg_bp2_max';

function setBp2Maximized(on) {
    const bp2 = document.getElementById('bp2');
    const btn = document.getElementById('btn-bp2-maximize');
    if (!bp2) return;
    const next = !!on;
    if (next) {
        if (!bp2.dataset.gnBp2ColBeforeMax) {
            bp2.dataset.gnBp2ColBeforeMax = bp2.classList.contains('col') ? '1' : '0';
        }
        bp2.classList.remove('col');
        bp2.classList.add('bp2-panel-maximized');
    } else {
        bp2.classList.remove('bp2-panel-maximized');
        const wasCol = bp2.dataset.gnBp2ColBeforeMax === '1';
        delete bp2.dataset.gnBp2ColBeforeMax;
        if (wasCol) bp2.classList.add('col');
    }
    if (btn) {
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
        btn.title = next ? 'Salir de pantalla completa' : 'Pantalla completa (grilla de pedidos)';
        const i = btn.querySelector('i');
        if (i) i.className = next ? 'fas fa-compress' : 'fas fa-expand';
    }
    try {
        localStorage.setItem(LS_BP2_MAX, next ? '1' : '0');
    } catch (_) {}
    try {
        if (typeof app !== 'undefined' && app.map) app.map.invalidateSize({ animate: false });
    } catch (_) {}
}

function toggleBp2Maximized() {
    const bp2 = document.getElementById('bp2');
    if (!bp2) return;
    setBp2Maximized(!bp2.classList.contains('bp2-panel-maximized'));
}

function initGnBp2Fullscreen() {
    const btn = document.getElementById('btn-bp2-maximize');
    if (!btn || btn.dataset.gnBp2FsInit === '1') return;
    btn.dataset.gnBp2FsInit = '1';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBp2Maximized();
    });
    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Escape') return;
            const bp2 = document.getElementById('bp2');
            if (!bp2?.classList.contains('bp2-panel-maximized')) return;
            setBp2Maximized(false);
        },
        true
    );
    try {
        if (localStorage.getItem(LS_BP2_MAX) === '1') {
            requestAnimationFrame(() => setBp2Maximized(true));
        }
    } catch (_) {}

    const w = typeof window !== 'undefined' ? window : null;
    if (w && typeof w.setBp2PanelHidden === 'function' && !w.setBp2PanelHidden.__gnBp2FsWrapped) {
        const orig = w.setBp2PanelHidden;
        function wrapped(hidden) {
            if (hidden) {
                try {
                    setBp2Maximized(false);
                } catch (_) {}
            }
            return orig.call(w, hidden);
        }
        wrapped.__gnBp2FsWrapped = true;
        w.setBp2PanelHidden = wrapped;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGnBp2Fullscreen);
} else {
    initGnBp2Fullscreen();
}

window.toggleBp2Maximized = toggleBp2Maximized;
window.setBp2Maximized = setBp2Maximized;
