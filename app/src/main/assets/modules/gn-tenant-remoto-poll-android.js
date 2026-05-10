/**
 * WebView Android: detecta cambios de tenant hechos desde otro dispositivo (admin web)
 * consultando GET /api/auth/tenant-operativo (misma BD que attach-tenant / JWT middleware).
 * Sin inflar app.js: polling ~45s + tick puntual al volver visible / onResume nativo.
 * made by leavera77
 */

import { fetchTenantOperativoDesdeApi } from './tenantPrincipalApi.js';

/** @type {ReturnType<typeof setInterval> | null} */
let _iv = null;
/** @type {Record<string, unknown> | null} */
let _deps = null;

/**
 * @param {object} d
 * @returns {boolean}
 */
function _androidShell(d) {
    try {
        return typeof d.esShellAndroid === 'function' ? !!d.esShellAndroid() : false;
    } catch (_) {
        return false;
    }
}

async function tick() {
    const d = _deps;
    if (!d || !_androidShell(d)) return;
    try {
        if (typeof d.getModoOffline === 'function' && d.getModoOffline()) return;
    } catch (_) {
        return;
    }
    try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    } catch (_) {}
    try {
        if (typeof d.tieneSesionUsuario === 'function' && !d.tieneSesionUsuario()) return;
    } catch (_) {
        return;
    }
    try {
        if (typeof d.getApiToken === 'function' && !d.getApiToken()) return;
    } catch (_) {
        return;
    }
    try {
        if (typeof d.asegurarJwtApiRest === 'function') await d.asegurarJwtApiRest();
    } catch (_) {}
    const row = await fetchTenantOperativoDesdeApi({
        getApiToken: d.getApiToken,
        apiUrl: d.apiUrl,
        fetchFn: typeof fetch !== 'undefined' ? fetch : null,
    });
    if (!row) return;
    const remote = Number(row.tenant_id);
    if (!Number.isFinite(remote) || remote < 1) return;
    let local = NaN;
    try {
        local = Number(typeof d.tenantIdActual === 'function' ? d.tenantIdActual() : NaN);
    } catch (_) {
        local = NaN;
    }
    const localGood = Number.isFinite(local) && local > 0;
    const mismatch = !localGood || local !== remote;
    const stale = !!row.jwt_claim_stale;
    if (!mismatch && !stale) return;
    if (typeof d.sincronizarTenant === 'function') {
        await d.sincronizarTenant({ silent: true });
    }
}

/**
 * @param {{
 *   esShellAndroid: () => boolean,
 *   getModoOffline?: () => boolean,
 *   tieneSesionUsuario?: () => boolean,
 *   getApiToken: () => string | null | undefined,
 *   apiUrl: (path: string) => string,
 *   asegurarJwtApiRest?: () => Promise<void>,
 *   tenantIdActual: () => number,
 *   sincronizarTenant: (opts?: { silent?: boolean }) => Promise<boolean>,
 *   intervalMs?: number,
 * }} deps
 */
export function initGnTenantRemotoPollAndroid(deps) {
    stopGnTenantRemotoPollAndroid();
    const d = deps && typeof deps === 'object' ? deps : {};
    if (!_androidShell(d)) return;
    _deps = d;
    const ms = Number(d.intervalMs) > 0 ? Number(d.intervalMs) : 45000;
    if (typeof window !== 'undefined') {
        window.gnTickTenantRemotoPollAndroidOnce = gnTickTenantRemotoPollAndroidOnce;
    }
    void tick();
    _iv = setInterval(() => void tick(), ms);
}

export function stopGnTenantRemotoPollAndroid() {
    if (_iv) {
        clearInterval(_iv);
        _iv = null;
    }
    _deps = null;
    if (typeof window !== 'undefined') {
        try {
            delete window.gnTickTenantRemotoPollAndroidOnce;
        } catch (_) {}
    }
}

export function gnTickTenantRemotoPollAndroidOnce() {
    return tick();
}
