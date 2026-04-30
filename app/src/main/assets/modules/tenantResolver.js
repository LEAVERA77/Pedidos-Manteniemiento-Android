/**
 * Resolución de tenant_id para sesión / login (Neon multitenant, WebView Android).
 * made by leavera77
 */

/** Fallback solo cuando ni la fila `usuarios` ni `config.json` traen tenant (>0). */
export const TENANT_ID_MONOTENANT_FALLBACK = 1;

export function tenantIdDesdeAppConfig(cfg) {
    const c = cfg && typeof cfg === 'object' ? cfg : {};
    const raw = c.app?.tenantId ?? c.tenant_id;
    if (raw == null || raw === '') return NaN;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * Tras login Neon: columna en la fila, luego `usuarios` por id, luego config, último fallback monotenant.
 * @param {{ usuario: object, leerTenantIdUsuarioDesdeNeon: (id:number)=>Promise<number|null>, appConfig: object }} p
 */
export async function resolverTenantIdPostLoginNeon(p) {
    const usuario = p?.usuario;
    const leer = p?.leerTenantIdUsuarioDesdeNeon;
    const appConfig = p?.appConfig;
    let tid = usuario && usuario.tenant_id != null && usuario.tenant_id !== '' ? Number(usuario.tenant_id) : NaN;
    if (!Number.isFinite(tid) || tid < 1) tid = NaN;
    if (typeof leer === 'function' && usuario && Number.isFinite(Number(usuario.id))) {
        try {
            const fromNeon = await leer(Number(usuario.id));
            if (fromNeon != null && Number.isFinite(fromNeon) && fromNeon > 0) tid = fromNeon;
        } catch (_) {}
    }
    if (!Number.isFinite(tid) || tid < 1) {
        const cfgT = tenantIdDesdeAppConfig(appConfig);
        tid = Number.isFinite(cfgT) && cfgT > 0 ? cfgT : TENANT_ID_MONOTENANT_FALLBACK;
    }
    return tid;
}

/** Entrar al mapa offline conservando `tenant_id` (antes se perdía y volvía el de config / 1). */
export function usuarioSesionParaEntrar(u) {
    if (!u || typeof u !== 'object') return null;
    const { _pw: _pw1, _ts: _ts1, ...rest } = u;
    return rest;
}
