/**
 * Tenant operativo según la API (misma BD que `getUserTenantId` en el servidor).
 * GET /api/auth/tenant-operativo — prioridad sobre lecturas SQL directas en WebView Android.
 * made by leavera77
 */

/**
 * @param {{
 *   getApiToken: () => string | null | undefined,
 *   apiUrl: (path: string) => string,
 *   fetchFn?: typeof fetch
 * }} deps
 * @returns {Promise<{ tenant_id: number, jwt_claim_stale?: boolean } | null>}
 */
export async function fetchTenantOperativoDesdeApi(deps) {
    const d = deps && typeof deps === 'object' ? deps : {};
    const fetchFn = typeof d.fetchFn === 'function' ? d.fetchFn : typeof fetch !== 'undefined' ? fetch : null;
    const tok = typeof d.getApiToken === 'function' ? d.getApiToken() : '';
    const apiUrl = d.apiUrl;
    if (!fetchFn || !tok || !apiUrl) return null;
    try {
        const resp = await fetchFn(apiUrl('/api/auth/tenant-operativo'), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        if (!resp.ok) return null;
        const j = await resp.json().catch(() => ({}));
        const n = Number(j.tenant_id);
        if (!Number.isFinite(n) || n < 1) return null;
        return {
            tenant_id: n,
            jwt_claim_stale: !!j.jwt_claim_stale,
        };
    } catch (_) {
        return null;
    }
}
