/**
 * Panel #bp2 (mapa / admin web y APK): tocar «Pedidos» siempre despliega; solo el ojo oculta.
 * Lista con scroll; detalle #dm al frente sin cerrar el panel.
 * made by leavera77
 */

import { scheduleClampBp2PanelIntoViewport } from './gn-panel-docks.js';
import {
    installGnBp2AndroidFloat,
    showBp2AndroidPanel,
    ensureAndroidSessionBp2HiddenDefault,
} from './gn-bp2-android-float.js';
import { installGnBp2ListaDensaObserver } from './gn-bp2-lista-densa.js';
import { installGnDmFrentePaneles } from './gn-dm-frente-paneles.js';

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

/** Muestra y despliega el panel de pedidos (la clase .col ya no pliega la lista en #ms). */
export function expandBp2Panel() {
    const bp2 = document.getElementById('bp2');
    if (!bp2) return;
    try {
        localStorage.setItem('pmg_bp2_hidden', '0');
    } catch (_) {}
    if (typeof window.setBp2PanelHidden === 'function') {
        window.setBp2PanelHidden(false);
    } else if (isAndroidShell()) {
        showBp2AndroidPanel();
    } else {
        bp2.classList.remove('col');
        bp2.classList.add('gn-bp2-expanded');
        scheduleClampBp2PanelIntoViewport();
    }
}

function bindHeaderPedidosTrigger() {
    const trigger = document.querySelector('#ph .gn-bp2-plegar-trigger');
    if (!trigger || trigger.dataset.gnBp2HdrBound === '1') return;
    trigger.dataset.gnBp2HdrBound = '1';
    trigger.title = 'Mostrar lista de pedidos (el ícono del ojo oculta el panel)';
    const onTap = (e) => {
        if (e.target.closest('button')) return;
        if (window.__bp2DragJustEnded) return;
        e.preventDefault();
        e.stopPropagation();
        expandBp2Panel();
    };
    trigger.addEventListener('click', onTap);
    trigger.addEventListener(
        'keydown',
        (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                expandBp2Panel();
            }
        },
        false
    );
}

function patchDetalleMantieneBp2() {
    const orig = window.detalle;
    if (!orig || orig.__gnBp2KeepOpen) return;
    async function wrapped(p, opts) {
        try {
            if (localStorage.getItem('pmg_bp2_hidden') !== '1') expandBp2Panel();
        } catch (_) {
            expandBp2Panel();
        }
        return orig.call(window, p, opts);
    }
    wrapped.__gnBp2KeepOpen = true;
    window.detalle = wrapped;
}

function onMainScreenVisible() {
    if (isAndroidShell()) {
        ensureAndroidSessionBp2HiddenDefault();
        try {
            if (localStorage.getItem('pmg_bp2_hidden') === '1') {
                if (typeof window.setBp2PanelHidden === 'function') window.setBp2PanelHidden(true);
            } else {
                expandBp2Panel();
            }
        } catch (_) {
            if (typeof window.setBp2PanelHidden === 'function') window.setBp2PanelHidden(true);
        }
        return;
    }
    try {
        if (localStorage.getItem('pmg_bp2_hidden') === '1') return;
    } catch (_) {}
    expandBp2Panel();
}

function initGnBp2PanelBehavior() {
    bindHeaderPedidosTrigger();
    patchDetalleMantieneBp2();
    try {
        installGnBp2AndroidFloat();
    } catch (_) {}
    try {
        installGnBp2ListaDensaObserver();
    } catch (_) {}
    try {
        installGnDmFrentePaneles();
    } catch (_) {}
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
