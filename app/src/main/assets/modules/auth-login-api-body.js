/**
 * Cuerpo JSON unificado para POST /api/auth/login (incluye tenant_id de sesión en multitenant).
 * made by leavera77
 */

let _tenantIdResolver = () => NaN;

/** @param {() => number} fn — típicamente `() => tenantIdActual()` */
export function initAuthLoginApiTenantResolver(fn) {
    _tenantIdResolver = typeof fn === 'function' ? fn : () => NaN;
}

/** Clave sessionStorage: último tenant elegido en el wizard (login puede mandar tenant_id viejo). */
export const AUTH_LOGIN_TENANT_HINT_KEY = 'pmg_login_tenant_hint';

/** @param {number|string|null|undefined} tenantId — clientes.id */
export function setAuthLoginTenantHint(tenantId) {
    try {
        const n = Number(tenantId);
        if (Number.isFinite(n) && n > 0) {
            sessionStorage.setItem(AUTH_LOGIN_TENANT_HINT_KEY, String(n));
        }
    } catch (_) {}
}

/** @param {string} usuario @param {string} password */
export function authLoginJsonBody(usuario, password) {
    const u = String(usuario || '').trim();
    const p = String(password ?? '');
    const o = { usuario: u, password: p };
    try {
        let tid = NaN;
        try {
            const s = sessionStorage.getItem(AUTH_LOGIN_TENANT_HINT_KEY);
            const h = Number(s);
            if (Number.isFinite(h) && h > 0) tid = h;
        } catch (_) {}
        if (!Number.isFinite(tid) || tid < 1) {
            tid = Number(_tenantIdResolver());
        }
        if (Number.isFinite(tid) && tid > 0) o.tenant_id = tid;
    } catch (_) {}
    return JSON.stringify(o);
}
