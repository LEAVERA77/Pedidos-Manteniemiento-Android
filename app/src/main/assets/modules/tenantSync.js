/**
 * Reintentos de lectura `usuarios.tenant_id` / `cliente_id` en Neon (WebView).
 * La política global API vs Neon está en `tenantSessionPolicy.js`.
 * made by leavera77
 */

/**
 * Si Neon está activo, devuelve `usuarios.tenant_id` / `cliente_id` válido si existe
 * (reintento breve por carreras WebView / pooler).
 * @param {number|NaN} tidPreliminar - valor ya resuelto por Neon/API (p. ej. JWT obsoleto = 1)
 * @param {{ neonOk: boolean, modoOffline: boolean, usuarioId: number, leerTenantIdUsuarioDesdeNeon: (id:number)=>Promise<number|null>, reintentos?: number }} deps
 */
export async function preferTenantIdNeonAutoritativo(tidPreliminar, deps) {
    const d = deps && typeof deps === 'object' ? deps : {};
    const neonOk = !!d.neonOk;
    const modoOffline = !!d.modoOffline;
    const uid = Number(d.usuarioId);
    const leer = d.leerTenantIdUsuarioDesdeNeon;
    const reintentos = Number.isFinite(Number(d.reintentos)) ? Math.max(1, Math.min(4, Number(d.reintentos))) : 2;
    if (!neonOk || modoOffline || !Number.isFinite(uid) || uid < 1 || typeof leer !== 'function') {
        return tidPreliminar;
    }
    let ultimo = tidPreliminar;
    for (let i = 0; i < reintentos; i++) {
        try {
            const n = await leer(uid);
            if (n != null && Number.isFinite(n) && n > 0) return n;
        } catch (_) {}
        if (i + 1 < reintentos) await new Promise((r) => setTimeout(r, 100 + i * 80));
    }
    return ultimo;
}
