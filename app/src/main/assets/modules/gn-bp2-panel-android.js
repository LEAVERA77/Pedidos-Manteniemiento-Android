/**
 * Panel #bp2 en Android: tocar «Pedidos» siempre despliega; solo el ojo oculta.
 * Lista con scroll; detalle #dm al frente sin cerrar el panel.
 * made by leavera77
 */

function isAndroidShell() {
    try {
        return (
            document.documentElement.classList.contains('gn-android-shell') ||
            typeof window.AndroidConfig !== 'undefined'
        );
    } catch (_) {
        return false;
    }
}

/** Muestra y despliega el panel de pedidos (no colapsa con .col en APK). */
export function expandBp2Panel() {
    const bp2 = document.getElementById('bp2');
    if (!bp2) return;
    if (typeof window.setBp2PanelHidden === 'function') {
        window.setBp2PanelHidden(false);
    }
    bp2.classList.remove('col');
    bp2.classList.add('gn-bp2-android-open');
    try {
        localStorage.setItem('pmg_bp2_hidden', '0');
    } catch (_) {}
}

function bindHeaderPedidosTrigger() {
    const trigger = document.querySelector('#ph .gn-bp2-plegar-trigger');
    if (!trigger || trigger.dataset.gnBp2HdrBound === '1') return;
    trigger.dataset.gnBp2HdrBound = '1';
    const onTap = (e) => {
        if (e.target.closest('button')) return;
        if (window.__bp2DragJustEnded) return;
        e.preventDefault();
        e.stopPropagation();
        if (isAndroidShell()) {
            expandBp2Panel();
        } else {
            document.getElementById('bp2')?.classList.toggle('col');
        }
    };
    if (isAndroidShell()) {
        trigger.title = 'Mostrar lista de pedidos';
    }
    trigger.addEventListener('click', onTap);
    trigger.addEventListener(
        'keydown',
        (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isAndroidShell()) expandBp2Panel();
                else document.getElementById('bp2')?.classList.toggle('col');
            }
        },
        false
    );
}

function patchDetalleMantieneBp2() {
    const orig = window.detalle;
    if (!orig || orig.__gnBp2AndroidKeep) return;
    async function wrapped(p, opts) {
        expandBp2Panel();
        return orig.call(window, p, opts);
    }
    wrapped.__gnBp2AndroidKeep = true;
    window.detalle = wrapped;
}

function onMainScreenVisible() {
    try {
        if (localStorage.getItem('pmg_bp2_hidden') === '1') return;
    } catch (_) {}
    expandBp2Panel();
}

function initGnBp2PanelBehavior() {
    bindHeaderPedidosTrigger();
    if (!isAndroidShell()) return;
    patchDetalleMantieneBp2();
    document.addEventListener('gn-ms-visible', onMainScreenVisible);
    if (document.getElementById('ms')?.classList.contains('active')) {
        onMainScreenVisible();
    }
}

if (typeof window !== 'undefined') {
    window.expandBp2Panel = expandBp2Panel;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGnBp2PanelBehavior, { once: true });
    } else {
        initGnBp2PanelBehavior();
    }
}
