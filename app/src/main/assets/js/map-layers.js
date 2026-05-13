// map-layers.js — marcadores de pedidos en el mapa (misma lógica que app principal)
import { app, esAdmin, esAndroidWebViewMapa } from './core.js';
import { renderMkPedidosEnMapa } from '../modules/map-pedidos-markers.js';

export function renderMk() {
    renderMkPedidosEnMapa({
        app,
        L: window.L,
        pedidosParaMarcadoresMapa:
            typeof window.pedidosParaMarcadoresMapa === 'function' ? window.pedidosParaMarcadoresMapa : () => [],
        coordsEfectivasPedidoMapa:
            typeof window.coordsEfectivasPedidoMapa === 'function'
                ? window.coordsEfectivasPedidoMapa
                : (p) => ({ la: Number(p?.lat), ln: Number(p?.lng) }),
        esAdmin,
        esAndroidWebViewMapa,
        pedidoEsDerivadoFuera: (p) =>
            typeof window.pedidoEsDerivadoFuera === 'function' ? window.pedidoEsDerivadoFuera(p) : false,
        puedeEnviarApiRestPedidos: () =>
            typeof window.puedeEnviarApiRestPedidos === 'function' ? window.puedeEnviarApiRestPedidos() : false,
    });
}
