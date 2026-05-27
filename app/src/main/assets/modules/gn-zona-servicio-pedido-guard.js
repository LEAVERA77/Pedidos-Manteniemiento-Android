/**
 * Aviso si las coords de un pedido quedan fuera de la zona de servicio del tenant.
 * made by leavera77
 */

function apiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

function getTok() {
    return typeof window.getApiToken === 'function' ? window.getApiToken() : '';
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ ok: boolean, dentro?: boolean, configurada?: boolean }>}
 */
export async function verificarZonaServicioPedido(lat, lng) {
    const tok = getTok();
    if (!tok) return { ok: true };
    try {
        const r = await fetch(apiUrl('/api/tenant-operativa/zona-servicio/verificar'), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tok}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ lat, lng }),
            cache: 'no-store',
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return { ok: true };
        return data;
    } catch (_) {
        return { ok: true };
    }
}

/**
 * Si está fuera de zona, pregunta al usuario (confirm).
 * @returns {Promise<boolean>} true si puede continuar
 */
export async function confirmarSiFueraDeZonaServicio(lat, lng) {
    const data = await verificarZonaServicioPedido(lat, lng);
    if (!data.configurada || data.dentro !== false) return true;
    const msg =
        'El punto queda fuera del área de servicio configurada (localidades del tenant). ¿Guardar igual?';
    if (typeof window.gnDice === 'function' && typeof window.confirm === 'function') {
        return window.confirm(window.gnDice(msg));
    }
    return window.confirm(msg);
}

if (typeof window !== 'undefined') {
    window.gnConfirmarSiFueraDeZonaServicio = confirmarSiFueraDeZonaServicio;
    window.gnVerificarZonaServicioPedido = verificarZonaServicioPedido;
}
