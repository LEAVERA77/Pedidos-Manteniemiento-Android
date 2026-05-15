/**
 * Pedidos visibles para mapa / selects: rubro + participación en derivados (técnicos),
 * sin los 3 checkboxes de la barra #bp2 ni el LS de admin «Derivados fuera» (el mapa muestra todos los pines).
 * made by leavera77
 */

/**
 * Sin «Todos», el catálogo por rubro puede ocultar reclamos con `tipo_trabajo` legacy u otro listado;
 * el técnico/supervisor debe ver igual los que tiene asignados (`tai`).
 *
 * @param {{ relax: boolean; pedido: unknown; pedidoVisibleSegunRubro: (x: unknown) => boolean; operadorId?: unknown }} a
 */
export function pedidoPasaFiltroRubroSiAsignadoAOperador(a) {
    if (a.relax) return true;
    if (typeof a.pedidoVisibleSegunRubro === 'function' && a.pedidoVisibleSegunRubro(a.pedido)) return true;
    const oid = a.operadorId != null && a.operadorId !== '' ? String(a.operadorId) : '';
    const tai = a.pedido?.tai;
    if (oid && tai != null && String(tai) === oid) return true;
    return false;
}

/**
 * @param {object} p
 * @param {unknown[]} p.pedidos
 * @param {boolean} p.relaxRubroMapa
 * @param {(x: unknown) => boolean} p.pedidoVisibleSegunRubro
 * @param {(x: unknown) => boolean} p.mostrarDerivadoExternoEnMapa — admin: siempre true; técnico: misma regla que lista
 * @param {unknown} [p.operadorId] — técnico/supervisor: `app.u.id` para no ocultar pedidos asignados aunque falle el match de rubro
 */
export function pedidosBaseMapaSinToolbarBp2(p) {
    const list = Array.isArray(p.pedidos) ? p.pedidos : [];
    const dexOk =
        typeof p.mostrarDerivadoExternoEnMapa === 'function'
            ? p.mostrarDerivadoExternoEnMapa
            : () => true;
    return list.filter((x) => {
        if (
            !pedidoPasaFiltroRubroSiAsignadoAOperador({
                relax: p.relaxRubroMapa,
                pedido: x,
                pedidoVisibleSegunRubro: p.pedidoVisibleSegunRubro,
                operadorId: p.operadorId,
            })
        ) {
            return false;
        }
        if (!dexOk(x)) return false;
        return true;
    });
}
