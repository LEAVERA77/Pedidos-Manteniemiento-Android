/**
 * Argentina: quita el 9 móvil tras el código de país 54 cuando el número viene en formato internacional móvil.
 * Para importación / almacenamiento consistente con Meta inbound strip.
 * made by leavera77
 */

const AR_MOB = '54' + '9';

export function quitarMovil9Tras54Digitos(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (d.startsWith(AR_MOB) && d.length >= 12 && d.length <= 16) return `54${d.slice(AR_MOB.length)}`;
    return d;
}
