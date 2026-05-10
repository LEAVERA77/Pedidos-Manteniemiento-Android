/**
 * Shell Android: al cargar la app, alinea tenant con GET /api/auth/tenant-operativo.
 * Si no coincide con localStorage (pmg), intenta sincronizarTenant; si sigue mal,
 * limpia localStorage (conserva pmg_api_token) y recarga. Timeout 10s → recarga.
 * Logs: tag GestorNovaTenant vía AndroidConfig.gnTenantPollLog.
 * made by leavera77
 */

import { fetchTenantOperativoDesdeApi } from './tenantPrincipalApi.js';

const GUARD_KEY = 'pmg_gn_tenant_force_reload_ts';
const GUARD_MS = 14000;

/** Evita ejecuciones solapadas (load + eval nativo). */
let _running = false;

function log(msg) {
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

function isShell() {
    try {
        return (
            (typeof window !== 'undefined' && typeof window.AndroidConfig !== 'undefined') ||
            (typeof window !== 'undefined' && typeof window.AndroidSession !== 'undefined')
        );
    } catch (_) {
        return false;
    }
}

function readTenantFromPmg() {
    try {
        const raw = localStorage.getItem('pmg');
        if (!raw) return NaN;
        const u = JSON.parse(raw);
        const n = Number(u?.tenant_id ?? u?.tenantId);
        return Number.isFinite(n) && n > 0 ? n : NaN;
    } catch (_) {
        return NaN;
    }
}

function guardRecentReload() {
    try {
        const t = Number(sessionStorage.getItem(GUARD_KEY));
        if (Number.isFinite(t) && Date.now() - t < GUARD_MS) return true;
    } catch (_) {}
    return false;
}

function markReloadGuard() {
    try {
        sessionStorage.setItem(GUARD_KEY, String(Date.now()));
    } catch (_) {}
}

function clearLocalExceptApiToken() {
    const tok = (() => {
        try {
            return localStorage.getItem('pmg_api_token');
        } catch (_) {
            return null;
        }
    })();
    try {
        localStorage.clear();
    } catch (_) {}
    try {
        if (tok) localStorage.setItem('pmg_api_token', tok);
    } catch (_) {}
}

/**
 * Llamada en window.load (y desde window tras recarga nativa).
 * @returns {Promise<void>}
 */
export async function bootGnTenantForceSyncAndroid() {
    if (!isShell() || _running) return;
    _running = true;
    try {
        const getTok =
            typeof window !== 'undefined' && typeof window.getApiToken === 'function'
                ? () => window.getApiToken()
                : () => null;
        const urlFn =
            typeof window !== 'undefined' && typeof window.apiUrl === 'function' ? (p) => window.apiUrl(p) : null;

        const tok0 = getTok();
        if (!tok0 || !urlFn) {
            log('[gn-tenant-boot] sin token o apiUrl; omitido');
            return;
        }

        log('[gn-tenant-boot] verificando tenant-operativo…');

        let row = null;
        let errLabel = '';
        try {
            row = await Promise.race([
                fetchTenantOperativoDesdeApi({
                    getApiToken: getTok,
                    apiUrl: urlFn,
                    fetchFn: typeof fetch !== 'undefined' ? fetch : null,
                }),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout10s')), 10000)),
            ]);
        } catch (e) {
            errLabel = e && e.message ? String(e.message) : 'err';
            row = null;
        }

        if (!row) {
            log(`[gn-tenant-boot] sin respuesta (${errLabel || 'null'}) → recarga forzada`);
            if (!guardRecentReload()) {
                markReloadGuard();
                clearLocalExceptApiToken();
                try {
                    window.location.reload();
                } catch (_) {}
            }
            return;
        }

        const remote = Number(row.tenant_id);
        if (!Number.isFinite(remote) || remote < 1) {
            log('[gn-tenant-boot] tenant remoto inválido');
            return;
        }

        const local = readTenantFromPmg();
        const stale = !!row.jwt_claim_stale;
        const mismatch = !Number.isFinite(local) || local !== remote || stale;

        if (!mismatch) {
            log(`[gn-tenant-boot] ok local=${local} remote=${remote}`);
            return;
        }

        log(`[gn-tenant-boot] desajuste local=${Number.isFinite(local) ? local : '?'} remote=${remote} staleJwt=${stale}`);

        if (typeof window.sincronizarTenantOperativoDesdeMiConfiguracionApi === 'function') {
            try {
                await window.sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true });
            } catch (_) {}
        }

        const local2 = readTenantFromPmg();
        if (Number.isFinite(local2) && local2 === remote && !stale) {
            log(`[gn-tenant-boot] corregido tras sincronizarTenant (${remote})`);
            return;
        }

        if (guardRecentReload()) {
            log('[gn-tenant-boot] evitado bucle recarga reciente');
            return;
        }
        markReloadGuard();
        log('[gn-tenant-boot] limpiando LS (conserva pmg_api_token) y recarga');
        clearLocalExceptApiToken();
        try {
            window.location.reload();
        } catch (_) {}
    } finally {
        _running = false;
    }
}

function scheduleBoot() {
    const run = () => {
        void bootGnTenantForceSyncAndroid();
    };
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (document.readyState === 'complete') {
        queueMicrotask(run);
    } else {
        window.addEventListener('load', run, { once: true });
    }
}

if (typeof window !== 'undefined') {
    window.gnBootTenantForceSyncAndroid = bootGnTenantForceSyncAndroid;
    if (isShell()) {
        scheduleBoot();
    }
}
