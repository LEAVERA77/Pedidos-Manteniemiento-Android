/**
 * Pedidos visibles para mapa / selects: rubro + participación en derivados (técnicos),
 * sin los 3 checkboxes de la barra #bp2 ni el LS de admin «Derivados fuera» (el mapa muestra todos los pines).
 * made by leavera77
 */

/**
 * @param {object} p
 * @param {unknown[]} p.pedidos
 * @param {boolean} p.relaxRubroMapa
 * @param {(x: unknown) => boolean} p.pedidoVisibleSegunRubro
 * @param {(x: unknown) => boolean} p.mostrarDerivadoExternoEnMapa — admin: siempre true; técnico: misma regla que lista
 */
export function pedidosBaseMapaSinToolbarBp2(p) {
    const list = Array.isArray(p.pedidos) ? p.pedidos : [];
    const dexOk =
        typeof p.mostrarDerivadoExternoEnMapa === 'function'
            ? p.mostrarDerivadoExternoEnMapa
            : () => true;
    return list.filter((x) => {
        if (!p.relaxRubroMapa && !p.pedidoVisibleSegunRubro(x)) return false;
        if (!dexOk(x)) return false;
        return true;
    });
}
