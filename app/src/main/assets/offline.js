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


function notifyOfflineQueueChanged() {
    try {
        window.dispatchEvent(new CustomEvent('pmg-offline-queue-changed'));
    } catch (_) {}
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
    notifyOfflineQueueChanged();
}

// El verificador dificulta la extracción directa de la contraseña; no cifra la cola
// ni impide ataques de diccionario cuando alguien obtiene el almacenamiento local.
const OFFLINE_PBKDF2_ITERATIONS = 210000;
function offlineHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function offlineUnhex(hex) {
    if (typeof hex !== 'string' || !/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error('hex inválido');
    return Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
}
async function offlineDerivar(pw, salt, iterations) {
    if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') throw new Error('WebCrypto no disponible');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
function offlinePublicUser(u) {
    const { _pw, _offlineVerifier, ...clean } = u;
    return clean;
}
function offlineEmail(email) { return String(email || '').trim().toLowerCase(); }
function offlineAdmin(u) {
    const rol = String(u?.rol || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return rol === 'admin' || rol === 'administrador';
}

export async function guardarUsuarioOffline(u, pw, expectedLegacyEntry = null) {
    if (offlineAdmin(u)) {
        eliminarUsuarioOfflinePorEmail(u?.email);
        return false;
    }
    if (!offlineEmail(u?.email) || typeof pw !== 'string' || !pw) return false;
    try {
        if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') return false;
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await offlineDerivar(pw, salt, OFFLINE_PBKDF2_ITERATIONS);
        // Leer después de la derivación evita sobrescribir usuarios agregados durante la espera.
        const lista = JSON.parse(localStorage.getItem(OU_KEY) || '[]');
        if (!Array.isArray(lista)) return false;
        const entry = { ...offlinePublicUser(u), _offlineVerifier: {
            version: 1, iterations: OFFLINE_PBKDF2_ITERATIONS, salt: offlineHex(salt), hash: offlineHex(hash)
        }, _ts: Date.now() };
        const idx = lista.findIndex(x => offlineEmail(x.email) === offlineEmail(u.email));
        // No recrear una credencial antigua si fue eliminada o cambiada durante la derivación.
        if (expectedLegacyEntry && (idx < 0 || JSON.stringify(lista[idx]) !== JSON.stringify(expectedLegacyEntry))) return false;
        if (idx >= 0) lista[idx] = entry; else lista.push(entry);
        localStorage.setItem(OU_KEY, JSON.stringify(lista));
        return true;
    } catch (_) { return false; }
}
export async function verificarUsuarioOffline(em, pw) {
    try {
        const lista = JSON.parse(localStorage.getItem(OU_KEY) || '[]');
        if (!Array.isArray(lista) || typeof pw !== 'string') return null;
        const u = lista.find(x => offlineEmail(x.email) === offlineEmail(em));
        if (!u) return null;
        const v = u._offlineVerifier;
        if (v) {
            if (v.version !== 1 || !Number.isInteger(v.iterations) || v.iterations < 100000 || v.iterations > 1000000 ||
                typeof v.salt !== 'string' || v.salt.length !== 32 || typeof v.hash !== 'string' || v.hash.length !== 64) return null;
            const actual = await offlineDerivar(pw, offlineUnhex(v.salt), v.iterations);
            const expected = offlineUnhex(v.hash);
            let diff = 0;
            for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
            return diff === 0 ? offlinePublicUser(u) : null;
        }
        // Equipos antiguos siguen funcionando; al autenticarse correctamente, migrar
        // sin borrar la credencial anterior si WebCrypto o el almacenamiento fallan.
        if (typeof u._pw !== 'string' || u._pw !== pw) return null;
        if (!offlineAdmin(u)) await guardarUsuarioOffline(u, pw, u);
        return offlinePublicUser(u);
    } catch (_) { return null; }
}

/** Quita caché offline de login (evita clave vieja tras cambio de credenciales). */
export function eliminarUsuarioOfflinePorEmail(em) {
    try {
        const emLc = String(em || '').trim().toLowerCase();
        if (!emLc) return;
        const lista = JSON.parse(localStorage.getItem(OU_KEY) || '[]');
        const next = lista.filter((u) => String(u.email || '').trim().toLowerCase() !== emLc);
        localStorage.setItem(OU_KEY, JSON.stringify(next));
    } catch (_) {}
}