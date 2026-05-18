/**
 * Cuerpo JSON unificado para POST /api/auth/login (multitenant).
 * En pantalla de login NO usar tenant de JWT/pmg/config: solo hint explícito del wizard.
 * made by leavera77
 */

let _tenantIdResolver = () => NaN;
let _loginInFlight = false;

/** @param {() => number} fn — legacy; el login ya no envía tenant desde el resolver. */
export function initAuthLoginApiTenantResolver(fn) {
    _tenantIdResolver = typeof fn === 'function' ? fn : () => NaN;
}

/** Clave sessionStorage: tenant elegido en asistente / selector (única fuente para acotar login). */
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

/** Tenant solo si el usuario lo eligió en wizard/selector (no sesión anterior ni config.json). */
export function getExplicitLoginTenantHint() {
    try {
        const s = sessionStorage.getItem(AUTH_LOGIN_TENANT_HINT_KEY);
        const h = Number(s);
        if (Number.isFinite(h) && h > 0) return h;
    } catch (_) {}
    return null;
}

/**
 * Fragmento SQL ` AND col = tid` para login Neon legado; solo con hint explícito.
 * @param {(v: string|number) => string} escFn
 * @param {() => Promise<string|null>} getColFn
 */
export async function buildNeonLoginTenantSqlFrag(escFn, getColFn) {
    const hint = getExplicitLoginTenantHint();
    if (hint == null) return '';
    const colU = typeof getColFn === 'function' ? await getColFn() : null;
    if (!colU || hint < 1) return '';
    return ` AND ${colU} = ${escFn(hint)}`;
}

/** Evita doble envío (click + Enter / doble tap) que mostraba «contraseña incorrecta» y luego entraba. */
export function beginLoginAttempt() {
    if (_loginInFlight) return false;
    _loginInFlight = true;
    return true;
}

export function endLoginAttempt() {
    _loginInFlight = false;
}

/** @param {string} usuario @param {string} password */
export function authLoginJsonBody(usuario, password) {
    const u = String(usuario || '').trim();
    const p = String(password ?? '');
    const o = { usuario: u, password: p };
    const tid = getExplicitLoginTenantHint();
    if (tid != null) o.tenant_id = tid;
    return JSON.stringify(o);
}
