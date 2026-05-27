/**
 * Android WebView: z-index unificado y centrado para modales (#dm, #pm) y paneles flotantes (chat).
 * made by leavera77
 */
import {
    gnBumpOverlayElement,
    gnForceModalZFront,
    gnHaySuboverlaySobreDetallePedido,
} from './gn-modal-z-index-stack.js';

const SHELL_CLASS = 'gn-android-shell';
const CHAT_ID = 'gn-pedido-chat-float';
const CENTERED_CLASS = 'gn-overlay-stack--centered';
const MODAL_CENTER_IDS = new Set(['dm', 'pm']);

/** @type {number} */
let _floatZ = 100055;

function isAndroidShell() {
    try {
        return (
            document.documentElement.classList.contains(SHELL_CLASS) ||
            typeof window.AndroidConfig !== 'undefined'
        );
    } catch (_) {
        return false;
    }
}

function mapPanelPadBottomPx() {
    try {
        if (typeof window.androidMouiMapPanelPadBottomPx === 'function') {
            return window.androidMouiMapPanelPadBottomPx();
        }
    } catch (_) {}
    return 72;
}

/**
 * @param {HTMLElement} el
 * @param {number} leftPx
 * @param {number} topPx
 */
function clampToViewport(el, leftPx, topPx) {
    const r = el.getBoundingClientRect();
    const w = r.width || 320;
    const h = r.height || 280;
    const pad = 8;
    const padBottom = mapPanelPadBottomPx();
    const maxL = Math.max(pad, window.innerWidth - w - pad);
    const maxT = Math.max(pad, window.innerHeight - h - padBottom);
    return {
        left: Math.min(maxL, Math.max(pad, leftPx)),
        top: Math.min(maxT, Math.max(pad, topPx)),
    };
}

function applyModalAndroidLayout(el) {
    if (!el?.classList) return;
    try {
        el.style.setProperty('display', 'flex', 'important');
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('inset', '0', 'important');
        const pad = 'max(0.5rem, env(safe-area-inset-top, 0px)) max(0.5rem, env(safe-area-inset-right, 0px)) max(0.5rem, env(safe-area-inset-bottom, 0px)) max(0.5rem, env(safe-area-inset-left, 0px))';
        el.style.setProperty('padding', pad, 'important');
    } catch (_) {}
}

function chatAboveDetail(card) {
    if (!card) return;
    try {
        const dm = document.getElementById('dm');
        if (!dm?.classList.contains('active')) return;
        const dmZ = parseInt(getComputedStyle(dm).zIndex, 10);
        if (!Number.isFinite(dmZ)) return;
        const z = dmZ + 8;
        _floatZ = Math.max(_floatZ, z);
        card.style.setProperty('z-index', String(z), 'important');
    } catch (_) {}
}

/** @param {HTMLElement | null} el */
export function gnOverlayBringToFront(el) {
    if (!el) return;
    try {
        gnBumpOverlayElement(el);
    } catch (_) {}
    _floatZ += 2;
    try {
        el.style.setProperty('z-index', String(_floatZ), 'important');
    } catch (_) {
        el.style.zIndex = String(_floatZ);
    }
    if (el.id === CHAT_ID) chatAboveDetail(el);
}

/** @param {HTMLElement | null} el */
export function gnOverlayClearCentered(el) {
    if (!el) return;
    el.classList.remove(CENTERED_CLASS);
    try {
        el.style.transform = '';
    } catch (_) {}
}

/**
 * @param {HTMLElement | null} card
 * @param {{ width?: number, height?: number }} [opts]
 */
export function gnOverlayCenterFloatingPanel(card, opts = {}) {
    if (!card) return;
    try {
        if (card.parentElement !== document.body) document.body.appendChild(card);
    } catch (_) {}
    card.style.position = 'fixed';
    card.style.right = 'auto';
    card.style.bottom = 'auto';
    card.classList.add(CENTERED_CLASS);
    const w = card.offsetWidth || opts.width || Math.min(360, window.innerWidth - 16);
    const h = card.offsetHeight || opts.height || 280;
    const pad = 8;
    const padBottom = mapPanelPadBottomPx();
    const maxW = window.innerWidth - pad * 2;
    const maxH = window.innerHeight - pad - padBottom;
    const left = Math.max(pad, (window.innerWidth - Math.min(w, maxW)) / 2);
    const top = Math.max(pad, (window.innerHeight - Math.min(h, maxH)) / 2);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.transform = 'none';
    requestAnimationFrame(() => {
        const c = clampToViewport(card, left, top);
        card.style.left = `${c.left}px`;
        card.style.top = `${c.top}px`;
    });
    gnOverlayBringToFront(card);
}

function onModalClassChange(el) {
    if (!el?.classList?.contains('mo')) return;
    if (!el.classList.contains('active')) return;
    if (MODAL_CENTER_IDS.has(el.id)) applyModalAndroidLayout(el);
    if (el.id === 'dm' && gnHaySuboverlaySobreDetallePedido()) return;
    try {
        gnForceModalZFront(el);
    } catch (_) {}
}

function observeFloatingPanels() {
    const chat = document.getElementById(CHAT_ID);
    if (chat && chat.style.display !== 'none' && chat.offsetParent !== null) {
        gnOverlayBringToFront(chat);
    }
    document.querySelectorAll(WA_FLOAT_SEL).forEach((node) => {
        if (node instanceof HTMLElement && node.offsetParent !== null) gnOverlayBringToFront(node);
    });
}

/** @type {MutationObserver | null} */
let _obs = null;

export function initGnOverlayStackAndroid() {
    if (!isAndroidShell()) return;
    try {
        window.gnOverlayBringToFront = gnOverlayBringToFront;
        window.gnOverlayCenterFloatingPanel = gnOverlayCenterFloatingPanel;
        window.gnOverlayClearCentered = gnOverlayClearCentered;
    } catch (_) {}

    if (_obs) return;

    _obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
            const t = m.target;
            if (!(t instanceof HTMLElement)) continue;
            if (t.classList.contains('mo')) onModalClassChange(t);
            if (t.id === CHAT_ID || t.matches?.(WA_FLOAT_SEL)) {
                if (t.style.display !== 'none') gnOverlayBringToFront(t);
            }
        }
    });

    try {
        _obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    } catch (_) {
        return;
    }

    document.querySelectorAll('.mo.active').forEach(onModalClassChange);
    observeFloatingPanels();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initGnOverlayStackAndroid(), { once: true });
    } else {
        initGnOverlayStackAndroid();
    }
    document.addEventListener('gn-ms-visible', () => initGnOverlayStackAndroid());
}
