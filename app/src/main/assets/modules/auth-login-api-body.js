/**
 * Cuerpo JSON unificado para POST /api/auth/login (incluye tenant_id de sesión en multitenant).
 * made by leavera77
 */

let _tenantIdResolver = () => NaN;

/** @param {() => number} fn — típicamente `() => tenantIdActual()` */
export function initAuthLoginApiTenantResolver(fn) {
    _tenantIdResolver = typeof fn === 'function' ? fn : () => NaN;
}

/** @param {string} usuario @param {string} password */
export function authLoginJsonBody(usuario, password) {
    const u = String(usuario || '').trim();
    const p = String(password ?? '');
    const o = { usuario: u, password: p };
    try {
        const tid = Number(_tenantIdResolver());
        if (Number.isFinite(tid) && tid > 0) o.tenant_id = tid;
    } catch (_) {}
    return JSON.stringify(o);
}
