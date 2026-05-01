/**
 * Política de resolución del tenant_id de sesión (admin web vs WebView Android).
 * Con JWT, GET /api/auth/tenant-operativo gana sobre la lectura Neon en el WebView
 * (evita quedar en tenant 1 por desfaces JDBC / caché de columna / pooler).
 * made by leavera77
 */

import { preferTenantIdNeonAutoritativo } from './tenantSync.js';
import { fetchTenantOperativoDesdeApi } from './tenantPrincipalApi.js';

/**
 * @param {{
 *   modoOffline: boolean,
 *   neonOk: boolean,
 *   hasSql: boolean,
 *   appUserId: number,
 *   leerTenantIdUsuarioDesdeNeon: (id: number) => Promise<number|null>,
 *   getApiBaseUrl: () => string,
 *   asegurarJwtApiRest?: () => Promise<void>,
 *   getApiToken: () => string | null | undefined,
 *   apiUrl: (path: string) => string,
 *   fetchFn?: typeof fetch
 * }} deps
 * @returns {Promise<number>} tenant_id válido o NaN
 */
export async function resolverTenantOperativoSesion(deps) {
    const d = deps && typeof deps === 'object' ? deps : {};
    if (d.modoOffline || !d.appUserId) return NaN;

    let neonTid = NaN;
    if (d.neonOk && d.hasSql) {
        try {
            const n = await preferTenantIdNeonAutoritativo(NaN, {
                neonOk: !!d.neonOk && !!d.hasSql,
                modoOffline: false,
                usuarioId: d.appUserId,
                leerTenantIdUsuarioDesdeNeon: d.leerTenantIdUsuarioDesdeNeon,
                reintentos: 3,
            });
            if (Number.isFinite(n) && n > 0) neonTid = n;
        } catch (_) {}
    }

    const base = typeof d.getApiBaseUrl === 'function' ? String(d.getApiBaseUrl() || '').trim() : '';
    let apiTid = NaN;
    if (base) {
        try {
            if (typeof d.asegurarJwtApiRest === 'function') await d.asegurarJwtApiRest();
        } catch (_) {}
        const apiRow = await fetchTenantOperativoDesdeApi({
            getApiToken: d.getApiToken,
            apiUrl: d.apiUrl,
            fetchFn: d.fetchFn,
        });
        if (apiRow && Number.isFinite(apiRow.tenant_id) && apiRow.tenant_id > 0) {
            apiTid = apiRow.tenant_id;
        }
    }

    let tid = Number.isFinite(apiTid) && apiTid > 0 ? apiTid : neonTid;

    if ((!Number.isFinite(tid) || tid < 1) && base && typeof d.fetchFn === 'function') {
        try {
            if (typeof d.asegurarJwtApiRest === 'function') await d.asegurarJwtApiRest();
            const tok = typeof d.getApiToken === 'function' ? d.getApiToken() : '';
            if (tok) {
                const resp = await d.fetchFn(d.apiUrl('/api/clientes/mi-configuracion'), {
                    headers: { Authorization: `Bearer ${tok}` },
                    cache: 'no-store',
                });
                if (resp.ok) {
                    const data = await resp.json().catch(() => ({}));
                    const n = Number(data.tenant_id ?? data.cliente?.id);
                    if (Number.isFinite(n) && n > 0) tid = n;
                }
            }
        } catch (_) {}
    }

    /** No volver a preferir Neon aquí: podía pisar un tenant correcto de la API con un valor erróneo leído en WebView. */
    return Number.isFinite(tid) && tid > 0 ? tid : NaN;
}
