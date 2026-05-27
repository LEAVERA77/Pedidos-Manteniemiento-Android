/**
 * Re-geocodificación en lote de pedidos abiertos sin coordenadas.
 * made by leavera77
 */

import { listarPedidosAbiertosSinCoords } from "./pedidosSinCoordsAdmin.js";
import { regeocodificarPedido } from "./regeocodificarPedido.js";

/**
 * @param {import('express').Request} req
 * @param {{ limit?: number }} [opts]
 */
export async function regeocodificarLotePedidosSinCoords(req, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 25);
  const lista = await listarPedidosAbiertosSinCoords(req, { limit });
  const items = lista.items || [];
  const resultados = [];
  for (const row of items) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    try {
      const out = await regeocodificarPedido(id, req.tenantId, {
        req,
        ignoreBusinessTypeFilter: true,
      });
      resultados.push({
        id,
        numero_pedido: row.numero_pedido,
        ok: !!out?.ok,
        mensaje: out?.mensaje || (out?.ok ? "OK" : "Sin cambio"),
      });
    } catch (e) {
      resultados.push({
        id,
        numero_pedido: row.numero_pedido,
        ok: false,
        mensaje: String(e?.message || e),
      });
    }
  }
  const okN = resultados.filter((r) => r.ok).length;
  return {
    procesados: resultados.length,
    exitosos: okN,
    fallidos: resultados.length - okN,
    resultados,
  };
}
