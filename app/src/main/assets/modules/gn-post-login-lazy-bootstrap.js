/**
 * Carga diferida de Leaflet, mapa y montajes admin tras login (#ms), sin bloquear pantalla de acceso.
 * made by leavera77
 */
import { initGnFeaturesAdminMounts } from './gn-features-bootstrap.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let _started = false;
/** @type {Promise<void> | null} */
let _leafletPromise = null;

function mainScreenActive() {
    try {
        return !!document.getElementById('ms')?.classList.contains('active');
    } catch (_) {
        return false;
    }
}

function loadStylesheet(href) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`link[href="${href}"]`)) {
            resolve();
            return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error('css'));
        document.head.appendChild(link);
    });
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            if (window.L) resolve();
            else {
                const s = document.querySelector(`script[src="${src}"]`);
                s?.addEventListener('load', () => resolve(), { once: true });
                s?.addEventListener('error', () => reject(new Error('js')), { once: true });
            }
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('js'));
        document.body.appendChild(script);
    });
}

export function ensureLeafletLoaded() {
    if (typeof window !== 'undefined' && window.L) return Promise.resolve();
    if (_leafletPromise) return _leafletPromise;
    _leafletPromise = (async () => {
        await loadStylesheet(LEAFLET_CSS);
        await loadScript(LEAFLET_JS);
    })().catch((e) => {
        _leafletPromise = null;
        console.warn('[gn-post-login-lazy-bootstrap] Leaflet', e);
        throw e;
    });
    return _leafletPromise;
}

async function prefetchMapView() {
    try {
        await import('../map-view.js');
    } catch (e) {
        console.warn('[gn-post-login-lazy-bootstrap] map-view prefetch', e);
    }
}

async function kickPostLoginHeavy() {
    if (_started || !mainScreenActive()) return;
    _started = true;

    const run = async () => {
        try {
            await ensureLeafletLoaded();
        } catch (_) {}

        try {
            if (typeof window.__gnPostLoginMapLazy === 'function') {
                window.__gnPostLoginMapLazy();
            }
        } catch (_) {}

        try {
            const ctx = window.__gnAdminMountsCtx;
            if (ctx) initGnFeaturesAdminMounts(ctx);
        } catch (e) {
            console.warn('[gn-post-login-lazy-bootstrap] admin mounts', e);
        }

        void prefetchMapView();
    };

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => void run(), { timeout: 2800 });
    } else {
        setTimeout(() => void run(), 500);
    }
}

function scheduleKick() {
    if (!mainScreenActive()) return;
    kickPostLoginHeavy();
}

if (typeof document !== 'undefined') {
    document.addEventListener('gn-ms-visible', scheduleKick);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleKick, { once: true });
    } else {
        scheduleKick();
    }
}

if (typeof window !== 'undefined') {
    window.ensureLeafletLoaded = ensureLeafletLoaded;
}
