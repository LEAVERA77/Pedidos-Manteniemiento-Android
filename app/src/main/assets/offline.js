export const OQ_KEY = 'pmg_offline_queue';
export const OP_KEY = 'pmg_offline_pedidos';
export const OU_KEY = 'pmg_offline_user';

/** Evita mezclar pedidos offline entre tenants (clave por tenant_id en `pmg`). */
function offlinePedidosStorageKey() {
    try {
        const raw = localStorage.getItem('pmg');
        if (raw) {
            const u = JSON.parse(raw);
            const n = Number(u?.tenant_id ?? u?.tenantId);
            if (Number.isFinite(n) && n > 0) return `pmg_offline_pedidos_t${n}`;
        }
    } catch (_) {}
    return OP_KEY;
}

export function offlineQueue() {
    try { return JSON.parse(localStorage.getItem(OQ_KEY) || '[]'); }
    catch(_) { return []; }
}
export function offlineSave(queue) {
    try { localStorage.setItem(OQ_KEY, JSON.stringify(queue)); } catch(_) {}
}
export function offlinePedidos() {
    try {
        return JSON.parse(localStorage.getItem(offlinePedidosStorageKey()) || '[]');
    } catch (_) {
        return [];
    }
}
export function offlinePedidosSave(pedidos) {
    try {
        localStorage.setItem(offlinePedidosStorageKey(), JSON.stringify(pedidos));
    } catch (_) {}
}


export function enqueueOffline(op) {
    const q = offlineQueue();
    q.push({ ...op, _offlineId: 'off_' + Date.now() + '_' + Math.random().toString(36).slice(2) });
    offlineSave(q);
    actualizarBadgeOffline();
}


export function actualizarBadgeOffline() {
    const q = offlineQueue();
    const badge = document.getElementById('offline-badge');
    if (!badge) return;
    if (q.length > 0) {
        badge.textContent = q.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

export function guardarUsuarioOffline(u, pw) {
    try {
        const lista = JSON.parse(localStorage.getItem(OU_KEY) || '[]');
        const idx = lista.findIndex(x => x.email === u.email);
        const entry = { ...u, _pw: pw, _ts: Date.now() };
        if (idx >= 0) lista[idx] = entry; else lista.push(entry);
        localStorage.setItem(OU_KEY, JSON.stringify(lista));
    } catch(_) {}
}
export function verificarUsuarioOffline(em, pw) {
    try {
        const lista = JSON.parse(localStorage.getItem(OU_KEY) || '[]');
        return lista.find(u => u.email === em && u._pw === pw) || null;
    } catch(_) { return null; }
}