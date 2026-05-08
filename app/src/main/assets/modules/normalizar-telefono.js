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

/** Normaliza a E.164 (+54… sin 9 móvil tras 54). */
export function normalizarTelefonoWhatsapp(raw) {
    let t = String(raw || '').trim();
    if (!t) return '';
    t = t.replace(/[^\d+]/g, '');
    if (t.startsWith('00')) t = '+' + t.substring(2);
    let digits = t.replace(/\D/g, '');
    digits = quitarMovil9Tras54Digitos(digits);
    if (!digits) return '';
    return '+' + digits;
}

export function esTelefonoWhatsappValido(tel) {
    return /^\+\d{10,15}$/.test(String(tel || '').trim());
}
