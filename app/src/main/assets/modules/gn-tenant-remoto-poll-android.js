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
/** @type {number} */
let _lastLogNoTokenMs = 0;
/** @type {number} */
let _lastLogFetchNullMs = 0;

/**
 * Log en logcat Android (tag GestorNovaTenant) vía bridge; en desktop no hace nada.
 * @param {string} msg
 */
function _log(msg) {
    const s = String(msg || '').slice(0, 3800);
    try {
        if (
            typeof window !== 'undefined' &&
            window.AndroidConfig &&
            typeof window.AndroidConfig.gnTenantPollLog === 'function'
        ) {
            window.AndroidConfig.gnTenantPollLog(s);
        }
    } catch (_) {}
}

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
    /**
     * modoOffline suele significar «Neon JDBC no disponible» en WebView/emulador;
     * GET /api/auth/tenant-operativo sigue siendo válido con JWT.
     */
    try {
        if (typeof d.getModoOffline === 'function' && d.getModoOffline()) {
            const tok = typeof d.getApiToken === 'function' ? d.getApiToken() : '';
            if (!tok) {
                const now = Date.now();
                if (now - _lastLogNoTokenMs > 60000) {
                    _lastLogNoTokenMs = now;
                    _log('[gn-tenant-poll] skip: modoOffline y sin JWT');
                }
                return;
            }
        }
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
    if (!row) {
        const now = Date.now();
        if (now - _lastLogFetchNullMs > 45000) {
            _lastLogFetchNullMs = now;
            _log('[gn-tenant-poll] tenant-operativo sin respuesta (401/red?)');
        }
        return;
    }
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
    _log(`[gn-tenant-poll] sync local=${localGood ? local : '?'} remote=${remote} staleJwt=${stale}`);
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
    _log(`[gn-tenant-poll] iniciado intervalMs=${ms}`);
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
