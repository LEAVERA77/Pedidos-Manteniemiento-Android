/**
 * Pedido manual: tras el INSERT en Neon con `foto_base64`, sube las mismas imágenes
 * al pipeline del servidor (PUT /api/pedidos/:id + parseFotosBase64 + uploadManyBase64 → foto_urls),
 * igual que el flujo API/WhatsApp. No comprime en cliente más allá de lo que ya hace el formulario.
 * made by leavera77
 */

async function buscarPedidoIdPorNumeroApi(numPedido) {
    const np = String(numPedido || '').trim();
    if (!np) return null;
    const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : null;
    const getTok = typeof window.getApiToken === 'function' ? window.getApiToken : null;
    if (!apiUrlFn || !getTok) return null;
    const tok = getTok();
    if (!tok) return null;
    const url = apiUrlFn('/api/pedidos?limit=400');
    try {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
        if (!resp.ok) return null;
        const rows = await resp.json();
        if (!Array.isArray(rows)) return null;
        const hit = rows.find((r) => String(r.numero_pedido || '') === np);
        const rawId = hit?.id;
        const n = Number(rawId);
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch (e) {
        console.warn('[gn-foto-manual] list pedidos', e && e.message);
        return null;
    }
}

/**
 * @param {{ pedidoId?: number|string|null, numPedido?: string, fotoBase64Joined: string }} args
 */
export async function gnSyncFotosReclamoCloudinary(args) {
    const joined = String(args?.fotoBase64Joined || '').trim();
    if (!joined) return { ok: false, skipped: true };

    const put = typeof window.pedidoPutApi === 'function' ? window.pedidoPutApi : null;
    if (!put) {
        console.warn('[gn-foto-manual] pedidoPutApi no disponible');
        return { ok: false };
    }

    let id = args?.pedidoId != null && args.pedidoId !== '' ? Number(args.pedidoId) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
        id = await buscarPedidoIdPorNumeroApi(args?.numPedido);
    }
    if (!Number.isFinite(id) || id <= 0) {
        console.warn('[gn-foto-manual] sin id de pedido');
        return { ok: false };
    }

    const row = await put(id, { foto_base64: joined });
    if (!row) return { ok: false };
    return { ok: true, row };
}

try {
    window.__gnSyncFotosReclamoCloudinary = gnSyncFotosReclamoCloudinary;
} catch (_) {}
