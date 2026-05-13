/**
 * Atributos HTML comunes para <img> en el modal de detalle de pedido (#dm).
 * Reduce trabajo en el hilo principal al desplazar (decodificación diferida).
 * made by leavera77
 */

/** @returns {string} fragmento seguro para insertar tras `src="..."` (incluye espacio inicial). */
export function gnDetalleImgAttrs() {
    return ' loading="lazy" decoding="async" fetchpriority="low"';
}
