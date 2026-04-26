/**
 * Servicio de re-geocodificación de pedidos (catálogo + Nominatim + línea libre + interpolación + centro localidad)
 * Permite actualizar coordenadas de pedidos viejos con el algoritmo mejorado
 *
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { getTenantProvinciaNominatim } from "./tenantProvincia.js";
import { actualizarSociosCatalogoCoordsSiMatchPedido } from "../utils/sociosCatalogoCoordsFromPedido.js";
import {
  coordsValidasWgs84,
  ejecutarPipelineGeocodificacionDesdePedidoLike,
} from "./pipelineGeocodificacionPedido.js";

/** Evita dos re-geos en paralelo para el mismo pedido (p. ej. doble webhook / race). */
const _regeoPedidoEnCurso = new Set();

async function pedidosColumnExists(columnName) {
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = $1 LIMIT 1`,
      [columnName]
    );
    return !!r.rows?.length;
  } catch (_) {
    return false;
  }
}

/**
 * Re-geocodifica un pedido existente con el sistema inteligente
 *
 * @param {number} pedidoId
 * @param {number} tenantId
 * @param {{ silent?: boolean, preferSimpleQNominatim?: boolean, ignoreBusinessTypeFilter?: boolean, req?: import('express').Request }} [options] — si `silent`, la respuesta devuelve `log: []` (p. ej. regeo automático WhatsApp). `preferSimpleQNominatim`: forzar pipeline solo `q` (WhatsApp). `ignoreBusinessTypeFilter`: omitir filtro `business_type` en SELECT/UPDATE (re-geocodificar admin). `req`: filtro multi-negocio (`business_type`).
 * @returns {Promise<{success: boolean, lat: number, lng: number, fuente: string, log: string[], mensaje: string}>}
 */
export async function regeocodificarPedido(pedidoId, tenantId, options = {}) {
  const silent = !!options.silent;
  const preferSimpleQOpt = !!options.preferSimpleQNominatim;
  const ignoreBt = !!options.ignoreBusinessTypeFilter;
  const req = options.req || null;
  const log = [];
  const L = (msg) => {
    log.push(msg);
  };
  const outLog = () => (silent ? [] : log);

  L("🔄 Iniciando re-geocodificación inteligente...");
  const provinciaTenant = await getTenantProvinciaNominatim(tenantId);
  if (provinciaTenant) {
    L(`🏛️ Provincia tenant (oficina / config): ${provinciaTenant}`);
  } else {
    L(`⚠️ Sin provincia de tenant: Nominatim no se acota por estado (configurá provincia o ubicación central)`);
  }

  try {
    let pedidoResult;
    const selParams = [pedidoId, tenantId];
    let btExtra = "";
    if (
      !ignoreBt &&
      req?.businessTypeFilterEnabled &&
      req?.activeBusinessType &&
      (await pedidosColumnExists("business_type"))
    ) {
      selParams.push(req.activeBusinessType);
      btExtra = ` AND business_type = $${selParams.length}`;
    }
    try {
      pedidoResult = await query(
        `SELECT 
        id, nis, medidor, nis_medidor, 
        cliente_nombre, cliente_calle, cliente_numero_puerta, cliente_localidad,
        lat, lng, provincia, codigo_postal, origen_reclamo
       FROM pedidos 
       WHERE id = $1 AND tenant_id = $2${btExtra}`,
        selParams
      );
    } catch (e) {
      const msg = String(e?.message || "");
      if (!msg.includes("origen_reclamo")) throw e;
      pedidoResult = await query(
        `SELECT 
        id, nis, medidor, nis_medidor, 
        cliente_nombre, cliente_calle, cliente_numero_puerta, cliente_localidad,
        lat, lng, provincia, codigo_postal
       FROM pedidos 
       WHERE id = $1 AND tenant_id = $2${btExtra}`,
        selParams
      );
    }

    if (!pedidoResult.rows || pedidoResult.rows.length === 0) {
      return {
        success: false,
        mensaje: "Pedido no encontrado",
        log: outLog(),
        _logLines: log.slice(),
      };
    }

    if (_regeoPedidoEnCurso.has(Number(pedidoId))) {
      L("⏳ Ya hay una re-geocodificación en curso para este pedido; se omite la llamada duplicada.");
      return {
        success: false,
        mensaje: "Re-geocodificación ya en curso para este pedido",
        log: outLog(),
        _logLines: log.slice(),
      };
    }
    _regeoPedidoEnCurso.add(Number(pedidoId));
    try {
      const pedido = pedidoResult.rows[0];
      const coordsActuales = coordsValidasWgs84(pedido.lat, pedido.lng);

      const pipelineRes = await ejecutarPipelineGeocodificacionDesdePedidoLike(pedido, tenantId, {
        log,
        preferSimpleQNominatim: preferSimpleQOpt,
        provinciaTenantPreloaded: provinciaTenant,
        respetarGpsWhatsapp: false,
      });

      if (!pipelineRes.ok) {
        return {
          success: false,
          mensaje: pipelineRes.mensaje || "Fallo geocodificación",
          log: outLog(),
          _logLines: log.slice(),
        };
      }

      const { latFinal, lngFinal, fuente, provPersist, cpPersist, geocodingAudit } = pipelineRes;

      const hasBtUp =
        !ignoreBt &&
        !!(req?.businessTypeFilterEnabled && req?.activeBusinessType) &&
        (await pedidosColumnExists("business_type"));
      const upBtGeo = hasBtUp ? " AND business_type = $8" : "";
      const upBtNo = hasBtUp ? " AND business_type = $7" : "";
      if (await pedidosColumnExists("geocoding_audit")) {
        const bindGeo = [
          latFinal,
          lngFinal,
          pedidoId,
          tenantId,
          provPersist,
          cpPersist,
          JSON.stringify(geocodingAudit),
        ];
        if (hasBtUp) bindGeo.push(req.activeBusinessType);
        await query(
          `UPDATE pedidos 
         SET lat = $1, lng = $2,
             provincia = CASE WHEN $5::text IS NOT NULL AND BTRIM($5::text) <> '' THEN BTRIM($5::text) ELSE provincia END,
             codigo_postal = CASE WHEN $6::text IS NOT NULL AND BTRIM($6::text) <> '' THEN BTRIM($6::text) ELSE codigo_postal END,
             geocoding_audit = $7::jsonb
         WHERE id = $3 AND tenant_id = $4${upBtGeo}`,
          bindGeo
        );
      } else {
        const bindNo = [latFinal, lngFinal, pedidoId, tenantId, provPersist, cpPersist];
        if (hasBtUp) bindNo.push(req.activeBusinessType);
        await query(
          `UPDATE pedidos 
         SET lat = $1, lng = $2,
             provincia = CASE WHEN $5::text IS NOT NULL AND BTRIM($5::text) <> '' THEN BTRIM($5::text) ELSE provincia END,
             codigo_postal = CASE WHEN $6::text IS NOT NULL AND BTRIM($6::text) <> '' THEN BTRIM($6::text) ELSE codigo_postal END
         WHERE id = $3 AND tenant_id = $4${upBtNo}`,
          bindNo
        );
      }

      const pedidoParaSocios = {
        ...pedido,
        lat: latFinal,
        lng: lngFinal,
        provincia: provPersist || pedido.provincia,
        codigo_postal: cpPersist || pedido.codigo_postal,
      };
      try {
        await actualizarSociosCatalogoCoordsSiMatchPedido({
          pedido: pedidoParaSocios,
          tenantId: Number(tenantId),
          lat: latFinal,
          lng: lngFinal,
        });
      } catch (e) {
        console.warn("[regeocodificar] socios_catalogo coords", e?.message || e);
      }

      const cambio = coordsActuales
        ? `Actualizado de (${Number(pedido.lat).toFixed(6)}, ${Number(pedido.lng).toFixed(6)}) → (${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)})`
        : `Agregado: (${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)})`;

      L(`✅ Re-geocodificación exitosa`);
      L(`   ${cambio}`);
      L(`   📊 Capa que definió el pin: ${fuente || "?"}`);

      return {
        success: true,
        lat: latFinal,
        lng: lngFinal,
        fuente,
        geocoding_audit: geocodingAudit,
        log: outLog(),
        _logLines: log.slice(),
        mensaje: "Pedido re-geocodificado exitosamente",
      };
    } finally {
      _regeoPedidoEnCurso.delete(Number(pedidoId));
    }
  } catch (err) {
    L(`\n❌ Error fatal: ${err?.message || err}`);
    console.error("[regeocodificar] Error:", err);
    return {
      success: false,
      mensaje: `Error: ${err?.message || String(err)}`,
      log: outLog(),
      _logLines: log.slice(),
    };
  }
}
