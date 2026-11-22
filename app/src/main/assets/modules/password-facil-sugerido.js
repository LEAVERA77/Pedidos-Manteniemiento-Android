/**
 * Contraseñas cortas, fáciles de dictar (palabra + año; sin símbolos raros).
 * made by leavera77
 */

const PALABRAS = [
    'reclamo',
    'campo',
    'norte',
    'calle',
    'firma',
    'mapa',
    'vecino',
    'cuadra',
    'poste',
    'obra',
    'luz',
    'agua',
    'turno',
    'visita',
];

/** @returns {string} mínimo 8 caracteres, solo letras minúsculas y dígitos del año */
export function generarPasswordFacilDictado() {
    const w = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
    const y = new Date().getFullYear();
    return `${w}${y}`;
}
