/**
 * Argentina: dígitos con prefijo 549… → 54… (sin el 9 móvil tras el código de país).
 * Para importación / almacenamiento consistente con Meta inbound strip.
 * made by leavera77
 */

export function quitarMovil9Tras54Digitos(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (d.startsWith('549') && d.length >= 12 && d.length <= 16) return `54${d.slice(3)}`;
    return d;
}
