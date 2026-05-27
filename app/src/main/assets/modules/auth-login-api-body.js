/**
 * Cuerpo JSON y fetch unificado para POST /api/auth/login (multitenant).
 * En pantalla de login NO usar tenant de JWT/pmg/config: solo hint explícito del wizard.
 * Si el hint está obsoleto (sessionStorage viejo), reintenta sin tenant_id.
 * made by leavera77
 */

let _tenantIdResolver = () => NaN;
let _loginInFlight = false;
let _lastLoginAttemptAt = 0;

const DEFAULT_LOGIN_TIMEOUT_MS = 45000;
const WARMUP_HEALTH_TIMEOUT_MS = 12000;

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

export function clearAuthLoginTenantHint() {
    try {
        sessionStorage.removeItem(AUTH_LOGIN_TENANT_HINT_KEY);
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

function buildLoginBody(usuario, password, tenantId) {
    const o = {
        usuario: String(usuario || '').trim().toLowerCase(),
        password: String(password ?? '').trim(),
    };
    const tid = tenantId != null ? Number(tenantId) : NaN;
    if (Number.isFinite(tid) && tid > 0) o.tenant_id = tid;
    return JSON.stringify(o);
}

/** @param {string} usuario @param {string} password */
export function authLoginJsonBody(usuario, password) {
    const tid = getExplicitLoginTenantHint();
    return buildLoginBody(usuario, password, tid);
}

function loginOk({ resp, data }) {
    return (
        resp.ok ||
        (resp.status === 403 && data?.code === 'must_change_password') ||
        data?.requires_otp === true
    );
}

async function maybeCompletarOtpLogin(data) {
    if (!data?.requires_otp) return data;
    if (typeof window.__gnCompleteLoginOtp !== 'function') return data;
    const completed = await window.__gnCompleteLoginOtp(data);
    return completed || data;
}

/**
 * Despierta Render (cold start) sin bloquear el login si falla.
 * @param {(path: string) => string} apiUrlFn
 * @param {typeof fetch} fetchFn
 */
async function pingApiHealthForLogin(apiUrlFn, fetchFn) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), WARMUP_HEALTH_TIMEOUT_MS);
    try {
        await fetchFn(apiUrlFn('/health'), { method: 'GET', cache: 'no-store', signal: ctl.signal });
    } catch (_) {
    } finally {
        clearTimeout(t);
    }
}

/**
 * Un POST de login con timeout propio (no compartir AbortSignal entre reintentos).
 * @returns {Promise<{ resp: Response, data: object }>}
 */
async function postLoginOnce(usuario, password, tenantId, apiUrlFn, fetchFn, timeoutMs) {
    const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_LOGIN_TIMEOUT_MS;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
        const resp = await fetchFn(apiUrlFn('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: buildLoginBody(usuario, password, tenantId),
            signal: ctl.signal,
        });
        const data = await resp.json().catch(() => ({}));
        return { resp, data };
    } finally {
        clearTimeout(t);
    }
}

async function normalizarResultadoLogin(result) {
    if (!loginOk(result) || !result.data?.requires_otp) return result;
    const completed = await maybeCompletarOtpLogin(result.data);
    if (completed?.token) {
        return {
            resp: { ok: true, status: 200 },
            data: completed,
        };
    }
    return {
        resp: { ok: false, status: 401 },
        data: { error: 'Verificación cancelada o código inválido' },
    };
}

async function fetchAuthLoginApiAttempt(usuario, password, apiUrlFn, fetchFn, timeoutMs) {
    const hint = getExplicitLoginTenantHint();
    if (hint != null) {
        const r1 = await postLoginOnce(usuario, password, hint, apiUrlFn, fetchFn, timeoutMs);
        if (loginOk(r1)) return normalizarResultadoLogin(r1);
        if (r1.resp.status === 401) {
            const r2 = await postLoginOnce(usuario, password, null, apiUrlFn, fetchFn, timeoutMs);
            if (loginOk(r2)) {
                clearAuthLoginTenantHint();
                return normalizarResultadoLogin(r2);
            }
        }
        return r1;
    }
    const r0 = await postLoginOnce(usuario, password, null, apiUrlFn, fetchFn, timeoutMs);
    return normalizarResultadoLogin(r0);
}

/**
 * POST /api/auth/login con reintento sin tenant si hay hint obsoleto (401).
 * Reintenta una vez tras timeout (AbortError), típico en cold start de Render.
 * @param {string} usuario
 * @param {string} password
 * @param {(path: string) => string} apiUrlFn
 * @param {typeof fetch} fetchFn
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<{ resp: Response, data: object }>}
 */
export async function fetchAuthLoginApi(usuario, password, apiUrlFn, fetchFn, opts = {}) {
    const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_LOGIN_TIMEOUT_MS;

    await pingApiHealthForLogin(apiUrlFn, fetchFn);

    const run = () => fetchAuthLoginApiAttempt(usuario, password, apiUrlFn, fetchFn, timeoutMs);

    if (opts.signal) {
        if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return run();
    }

    try {
        return await run();
    } catch (e) {
        if (!(e && e.name === 'AbortError')) throw e;
        clearAuthLoginTenantHint();
        try {
            return await fetchAuthLoginApiAttempt(usuario, password, apiUrlFn, fetchFn, timeoutMs);
        } catch (e2) {
            if (e2 && e2.name === 'AbortError') throw e2;
            throw e2;
        }
    }
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

/** Evita doble envío simultáneo (click + Enter); ventana corta, no bloquea un segundo intento manual. */
export function beginLoginAttempt() {
    const now = Date.now();
    if (_loginInFlight || now - _lastLoginAttemptAt < 350) return false;
    _loginInFlight = true;
    _lastLoginAttemptAt = now;
    return true;
}

export function endLoginAttempt() {
    _loginInFlight = false;
}

