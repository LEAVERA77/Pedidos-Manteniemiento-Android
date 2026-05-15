/**
 * Shell Android: alinea tenant con GET /api/auth/tenant-operativo tras existir sesión (JWT + apiUrl).
 * Reintenta hasta 5 veces cada 3s si load llega antes del login; también en visibility y gnBoot… nativo.
 * made by leavera77
 */

import { fetchTenantOperativoDesdeApi } from './tenantPrincipalApi.js';
import { setAuthLoginTenantHint } from './auth-login-api-body.js';

const GUARD_KEY = 'pmg_gn_tenant_force_reload_ts';
const GUARD_MS = 14000;
const MAX_SESSION_WAIT = 5;
const SESSION_WAIT_MS = 3000;

/** Mutex solo para el bloque fetch/sync (no para la espera de sesión). */
let _runningVerify = false;
/** Intento actual de espera de sesión (1..MAX_SESSION_WAIT). */
let _waitAttempt = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let _waitTimer = null;

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

function getDeps() {
    const getTok =
        typeof window !== 'undefined' && typeof window.getApiToken === 'function'
            ? () => window.getApiToken()
            : () => null;
    const urlFn =
        typeof window !== 'undefined' && typeof window.apiUrl === 'function' ? (p) => window.apiUrl(p) : null;
    return { getTok, urlFn };
}

function sessionReady() {
    const { getTok, urlFn } = getDeps();
    return !!(getTok() && urlFn);
}

function clearWaitTimer() {
    if (_waitTimer) {
        clearTimeout(_waitTimer);
        _waitTimer = null;
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
 * Consulta API y alinea tenant (sync / recarga).
 * @returns {Promise<void>}
 */
async function runTenantVerifyCore() {
    if (!isShell() || _runningVerify) return;
    _runningVerify = true;
    try {
        const { getTok, urlFn } = getDeps();
        if (!getTok() || !urlFn) {
            return;
        }

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
        try {
            setAuthLoginTenantHint(remote);
        } catch (_) {}

        const local = readTenantFromPmg();
        const stale = !!row.jwt_claim_stale;
        const mismatch = !Number.isFinite(local) || local !== remote || stale;

        if (!mismatch) {
            log(`[gn-tenant-boot] tenant coincide: ${remote}`);
            return;
        }

        log(
            `[gn-tenant-boot] desajuste: local=${Number.isFinite(local) ? local : '?'} remoto=${remote}, sincronizando…`
        );

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
        _runningVerify = false;
    }
}

function tryWaitForSession() {
    if (!isShell()) return;
    clearWaitTimer();

    if (sessionReady()) {
        log('[gn-tenant-boot] sesión detectada, verificando tenant-operativo…');
        _waitAttempt = 0;
        void runTenantVerifyCore();
        return;
    }

    if (_waitAttempt >= MAX_SESSION_WAIT) {
        log('[gn-tenant-boot] sin sesión tras 5 intentos; omitido');
        return;
    }

    _waitAttempt += 1;
    log(`[gn-tenant-boot] esperando sesión… (intento ${_waitAttempt}/${MAX_SESSION_WAIT})`);
    _waitTimer = setTimeout(() => {
        _waitTimer = null;
        tryWaitForSession();
    }, SESSION_WAIT_MS);
}

/**
 * Punto de entrada: reinicia contador de espera y arranca comprobación (load, visibility, MainActivity).
 */
export function bootGnTenantForceSyncAndroid() {
    if (!isShell()) return;
    clearWaitTimer();
    _waitAttempt = 0;
    queueMicrotask(() => tryWaitForSession());
}

function scheduleBoot() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const run = () => bootGnTenantForceSyncAndroid();
    if (document.readyState === 'complete') {
        queueMicrotask(run);
    } else {
        window.addEventListener('load', run, { once: true });
    }
}

function installVisibilityHook() {
    if (typeof document === 'undefined') return;
    try {
        document.addEventListener('visibilitychange', () => {
            try {
                if (document.visibilityState === 'visible' && isShell()) {
                    bootGnTenantForceSyncAndroid();
                }
            } catch (_) {}
        });
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window.gnBootTenantForceSyncAndroid = bootGnTenantForceSyncAndroid;
    if (isShell()) {
        scheduleBoot();
        installVisibilityHook();
    }
}
