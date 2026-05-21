/**
 * Nombres de usuario para UI (detalle pedido, etc.) sin mostrar "id:123".
 * Complementa `app.usuariosCache` (solo activos) con mapa por id vía Neon.
 * made by leavera77
 */

/** @type {Map<string, string>} */
const _nombresPorId = new Map();

export function gnResetUsuarioNombresMap() {
    _nombresPorId.clear();
}

/**
 * @param {unknown} id
 * @returns {string|null}
 */
export function gnNombreUsuarioPorId(id) {
    if (id == null || id === '') return null;
    const sid = String(id);
    try {
        const u = window.app?.usuariosCache?.find((x) => String(x.id) === sid);
        const n = String(u?.nombre || u?.email || '').trim();
        if (n) return n;
    } catch (_) {}
    try {
        if (String(window.app?.u?.id) === sid) {
            const n = String(window.app.u.nombre || window.app.u.email || '').trim();
            if (n) return n;
        }
    } catch (_) {}
    const memo = _nombresPorId.get(sid);
    return memo ? memo : null;
}

/**
 * Texto visible: nombre, email o "Usuario #id" (nunca "id:110").
 * @param {unknown} id
 * @returns {string}
 */
export function gnNombreUsuarioDisplay(id) {
    const n = gnNombreUsuarioPorId(id);
    if (n) return n;
    if (id == null || id === '') return '—';
    return `Usuario #${id}`;
}

/**
 * @param {Record<string, unknown>|null|undefined} p
 * @returns {number[]}
 */
export function gnIdsUsuariosEnPedido(p) {
    if (!p || typeof p !== 'object') return [];
    const raw = [p.uc, p.ui2, p.uav, p.uci, p.tai, p.uider, p.sduid, p.ui];
    const out = [];
    const seen = new Set();
    for (const v of raw) {
        if (v == null || v === '') continue;
        const sid = String(v);
        if (seen.has(sid)) continue;
        seen.add(sid);
        const n = parseInt(sid, 10);
        if (Number.isFinite(n) && n > 0) out.push(n);
    }
    return out;
}

/**
 * @param {number[]} ids
 */
async function fetchNombresNeon(ids) {
    const getDeps =
        typeof window !== 'undefined' && typeof window.__gnUsuarioNombresDeps === 'function'
            ? window.__gnUsuarioNombresDeps
            : null;
    if (!getDeps) return;
    const d = getDeps();
    if (!d?.neonOk?.() || d.modoOffline?.() || !d.sqlReady?.() || typeof d.sqlSimple !== 'function') return;
    const esc = typeof d.esc === 'function' ? d.esc : (v) => String(v);
    const missing = ids.filter((id) => !gnNombreUsuarioPorId(id));
    if (!missing.length) return;
    let wf = '';
    try {
        if (typeof d.sqlFiltroUsuariosPorTenant === 'function') wf = await d.sqlFiltroUsuariosPorTenant();
    } catch (_) {}
    const inList = missing.map((id) => esc(parseInt(String(id), 10))).join(',');
    if (!inList) return;
    try {
        const r = await d.sqlSimple(
            `SELECT id, nombre, email FROM usuarios WHERE id IN (${inList})${wf}`
        );
        for (const row of r.rows || []) {
            const sid = String(row.id);
            const n = String(row.nombre || row.email || '').trim();
            if (n) _nombresPorId.set(sid, n);
        }
    } catch (e) {
        console.warn('[gn-usuario-nombres]', e && e.message ? e.message : e);
    }
}

/**
 * @param {Record<string, unknown>} p
 */
export async function gnPrefetchNombresPedidoDetalle(p) {
    const ids = gnIdsUsuariosEnPedido(p).filter((id) => !gnNombreUsuarioPorId(id));
    if (!ids.length) return;
    await fetchNombresNeon(ids);
}
