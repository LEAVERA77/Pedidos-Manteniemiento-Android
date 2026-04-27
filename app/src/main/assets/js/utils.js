/**
 * Utilidades compartidas (teléfonos, texto, etc.).
 */

export function normalizarTelefono(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const digits = s.replace(/\D/g, '');
    if (!digits) return '';
    return digits;
}
