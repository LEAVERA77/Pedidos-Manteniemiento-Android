/**
 * Detección de columna tenant en `usuarios` (Neon vía WebView).
 * Si `information_schema` falla en JDBC, prueba `tenant_id` / `cliente_id` con consultas seguras.
 * made by leavera77
 */

let _usuariosTenantColCache = null;

export function resetUsuariosTenantColumnCache() {
    _usuariosTenantColCache = null;
}

/**
 * @param {{ sqlSimple: Function, neonOk: boolean, modoOffline: boolean }} deps
 * @returns {Promise<string>} 'tenant_id' | 'cliente_id' | ''
 */
export async function resolveUsuariosTenantColumnName(deps) {
    if (_usuariosTenantColCache !== null) return _usuariosTenantColCache;
    _usuariosTenantColCache = '';
    const sqlSimple = deps?.sqlSimple;
    const neonOk = !!deps?.neonOk;
    const modoOffline = !!deps?.modoOffline;
    if (!neonOk || modoOffline || typeof sqlSimple !== 'function') return _usuariosTenantColCache;
    try {
        const r = await sqlSimple(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name IN ('tenant_id','cliente_id')`
        );
        const names = new Set((r.rows || []).map((x) => x.column_name));
        if (names.has('tenant_id')) {
            _usuariosTenantColCache = 'tenant_id';
            return _usuariosTenantColCache;
        }
        if (names.has('cliente_id')) {
            _usuariosTenantColCache = 'cliente_id';
            return _usuariosTenantColCache;
        }
    } catch (_) {}
    try {
        await sqlSimple('SELECT tenant_id FROM usuarios WHERE id = -1 LIMIT 1');
        _usuariosTenantColCache = 'tenant_id';
        return _usuariosTenantColCache;
    } catch (_) {}
    try {
        await sqlSimple('SELECT cliente_id FROM usuarios WHERE id = -1 LIMIT 1');
        _usuariosTenantColCache = 'cliente_id';
        return _usuariosTenantColCache;
    } catch (_) {}
    return _usuariosTenantColCache;
}
