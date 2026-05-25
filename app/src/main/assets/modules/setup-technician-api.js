/**
 * API setup técnico (listar tenants, etc.) — usable desde módulos sin depender de app.js.
 * made by leavera77
 */

function resolveApiUrl(path) {
    if (typeof window !== 'undefined' && typeof window.apiUrl === 'function') {
        return window.apiUrl(path);
    }
    return String(path || '');
}

/**
 * @param {string | null} apiToken
 * @param {string} techKey
 */
export async function apiSetupTechnicianFetchTenants(apiToken, techKey) {
    const k = String(techKey || '').trim();
    if (!k) throw new Error('Ingresá la clave técnica.');
    const headers = { 'X-GestorNova-Technician-Key': k };
    if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
    const r = await fetch(resolveApiUrl('/api/setup/technician/tenants'), { headers, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw new Error([j.error, j.detail].filter(Boolean).join(' — ') || `HTTP ${r.status}`);
    }
    return j;
}
