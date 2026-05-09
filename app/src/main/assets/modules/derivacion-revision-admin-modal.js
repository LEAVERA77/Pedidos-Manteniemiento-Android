/**
 * Resuelve el objeto pedido para «Revisar y enviar (servidor)» aunque no esté en `app.p`
 * (p. ej. listado filtrado, caché vieja o refetch en segundo plano).
 */
export function resolverPedidoParaDerivacionRevisionAdmin(pid) {
    const id = String(pid ?? '').trim();
    if (!id) return null;
    try {
        const ap = typeof window !== 'undefined' && window.app && Array.isArray(window.app.p) ? window.app.p : null;
        const fromList = ap ? ap.find((x) => String(x.id) === id) : null;
        if (fromList) return fromList;
    } catch (_) {}
    try {
        const cur = window.__gnDetallePedidoActivo;
        if (cur && String(cur.id) === id) return cur;
    } catch (_) {}
    return null;
}
