/**
 * Servicio de re-geocodificación de pedidos con el sistema inteligente de 5 capas
 * Permite actualizar coordenadas de pedidos viejos con el algoritmo mejorado
 * 
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { normalizarDireccion } from "../utils/normalizarCalles.js";
import { buscarCoordenadasPorNisMedidor } from "./buscarCoordenadasPorNisMedidor.js";
import { geocodeCalleNumeroLocalidadArgentina } from "./nominatimClient.js";
import { interpolarCoordenadaPorAltura } from "./interpolacionAlturas.js";

/**
 * Valida coords WGS84
 */
function coordsValidasWgs84(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (Math.abs(la) < 1e-6 && Math.abs(lo) < 1e-6) return false;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return false;
  return true;
}

/**
 * Re-geocodifica un pedido existente con el sistema inteligente
 * 
 * @param {number} pedidoId - ID del pedido
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<{success: boolean, lat: number, lng: number, fuente: string, log: string[], mensaje: string}>}
 */
export async function regeocodificarPedido(pedidoId, tenantId) {
  const log = [];
  log.push("🔄 Iniciando re-geocodificación inteligente...");
  
  try {
    // 1. Obtener datos del pedido
    const pedidoResult = await query(
      `SELECT 
        id, nis, medidor, nis_medidor, 
        cliente_nombre, cliente_calle, cliente_numero_puerta, cliente_localidad,
        latitud, longitud
       FROM pedidos 
       WHERE id = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );
    
    if (!pedidoResult.rows || pedidoResult.rows.length === 0) {
      return {
        success: false,
        mensaje: "Pedido no encontrado",
        log
      };
    }
    
    const pedido = pedidoResult.rows[0];
    const coordsActuales = coordsValidasWgs84(pedido.latitud, pedido.longitud);
    
    log.push(`📦 Pedido #${pedido.id}: ${pedido.cliente_nombre || "Sin nombre"}`);
    log.push(`📍 Dirección: ${pedido.cliente_calle || "?"} ${pedido.cliente_numero_puerta || "?"}, ${pedido.cliente_localidad || "?"}`);
    if (coordsActuales) {
      log.push(`📌 Coords actuales: ${Number(pedido.latitud).toFixed(6)}, ${Number(pedido.longitud).toFixed(6)}`);
    } else {
      log.push(`⚠️  Sin coordenadas válidas actuales`);
    }
    
    // Extraer datos
    const nisT = pedido.nis ? String(pedido.nis).trim() : null;
    const medT = pedido.medidor ? String(pedido.medidor).trim() : null;
    const nmT = pedido.nis_medidor ? String(pedido.nis_medidor).trim() : null;
    let calleT = pedido.cliente_calle ? String(pedido.cliente_calle).trim() : null;
    const numT = pedido.cliente_numero_puerta ? String(pedido.cliente_numero_puerta).trim() : null;
    const locT = pedido.cliente_localidad ? String(pedido.cliente_localidad).trim() : null;
    const nombreT = pedido.cliente_nombre ? String(pedido.cliente_nombre).trim() : null;
    
    if (!calleT && !locT && !nisT && !medT && !nmT) {
      log.push("❌ Sin datos suficientes para geocodificar");
      return {
        success: false,
        mensaje: "Pedido sin dirección ni identificadores",
        log
      };
    }
    
    let latFinal = null;
    let lngFinal = null;
    let fuente = null;
    
    // 2. NORMALIZACIÓN DE CALLES
    log.push("\n🔤 PASO 1: Normalización de calle");
    if (calleT && locT) {
      try {
        const normResult = await normalizarDireccion({ calle: calleT, ciudad: locT });
        if (normResult && normResult.cambio) {
          log.push(`  ✓ "${calleT}" → "${normResult.calleNormalizada}" (confianza: ${(normResult.confianza * 100).toFixed(0)}%)`);
          calleT = normResult.calleNormalizada;
        } else {
          log.push(`  ✓ Nombre de calle OK (sin cambios)`);
        }
      } catch (err) {
        log.push(`  ⚠️  Error en normalización: ${err?.message || err}`);
      }
    } else {
      log.push(`  → Sin calle/localidad para normalizar`);
    }
    
    // 3. BÚSQUEDA EN CATÁLOGO
    log.push("\n📚 PASO 2: Búsqueda en catálogo (socios_catalogo)");
    const tieneIdentificador = !!(nisT || medT || nmT);
    if (tieneIdentificador || (calleT && locT)) {
      try {
        const coordsCatalogo = await buscarCoordenadasPorNisMedidor({
          tenantId: Number(tenantId),
          nis: nisT,
          medidor: medT,
          nisMedidor: nmT,
          calle: calleT,
          numero: numT,
          localidad: locT,
          nombreCliente: nombreT,
        });
        
        if (coordsCatalogo && coordsValidasWgs84(coordsCatalogo.lat, coordsCatalogo.lng)) {
          latFinal = coordsCatalogo.lat;
          lngFinal = coordsCatalogo.lng;
          fuente = coordsCatalogo.esManual ? "catalogo_manual" : "catalogo";
          log.push(`  ✓ Encontrado en catálogo: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
          if (coordsCatalogo.esManual) {
            log.push(`  ✓ Coordenadas corregidas manualmente (prioridad absoluta)`);
          }
        } else {
          log.push(`  → Sin resultados en catálogo`);
        }
      } catch (err) {
        log.push(`  ⚠️  Error al buscar en catálogo: ${err?.message || err}`);
      }
    } else {
      log.push(`  → Sin identificadores ni dirección completa`);
    }
    
    // 4. NOMINATIM (si no hay coords del catálogo)
    if (!coordsValidasWgs84(latFinal, lngFinal) && calleT && locT) {
      log.push("\n🌍 PASO 3: Geocodificación con Nominatim");
      try {
        const geoResult = await geocodeCalleNumeroLocalidadArgentina(locT, calleT, numT || "", {
          allowTenantCentroidFallback: false,
          catalogStrict: false,
        });
        
        if (geoResult && coordsValidasWgs84(geoResult.lat, geoResult.lng)) {
          latFinal = geoResult.lat;
          lngFinal = geoResult.lng;
          fuente = geoResult.audit?.source || "nominatim";
          log.push(`  ✓ Nominatim: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
          log.push(`  ✓ Fuente: ${fuente}`);
        } else {
          log.push(`  → Nominatim sin resultados`);
        }
      } catch (err) {
        log.push(`  ⚠️  Error en Nominatim: ${err?.message || err}`);
      }
    }
    
    // 5. INTERPOLACIÓN (si aún no hay coords)
    if (!coordsValidasWgs84(latFinal, lngFinal) && calleT && numT && locT) {
      log.push("\n📐 PASO 4: Interpolación municipal");
      try {
        const interpol = await interpolarCoordenadaPorAltura({
          calle: calleT,
          numero: numT,
          localidad: locT,
          provincia: null,
        });
        
        if (interpol && interpol.log) {
          interpol.log.forEach(line => log.push(`  ${line}`));
        }
        
        if (interpol && coordsValidasWgs84(interpol.lat, interpol.lng)) {
          latFinal = interpol.lat;
          lngFinal = interpol.lng;
          fuente = "interpolacion";
          log.push(`  ✓ Interpolación exitosa: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
        } else {
          log.push(`  → Interpolación sin resultados válidos`);
        }
      } catch (err) {
        log.push(`  ⚠️  Error en interpolación: ${err?.message || err}`);
      }
    }
    
    // 6. RESULTADO
    log.push("\n" + "═".repeat(60));
    
    if (!coordsValidasWgs84(latFinal, lngFinal)) {
      log.push("❌ No se pudo geocodificar con ningún método");
      return {
        success: false,
        mensaje: "No se pudieron obtener coordenadas válidas",
        log
      };
    }
    
    // Actualizar pedido
    await query(
      `UPDATE pedidos 
       SET latitud = $1, longitud = $2, fecha_actualizacion = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [latFinal, lngFinal, pedidoId, tenantId]
    );
    
    const cambio = coordsActuales
      ? `Actualizado de (${Number(pedido.latitud).toFixed(6)}, ${Number(pedido.longitud).toFixed(6)}) → (${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)})`
      : `Agregado: (${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)})`;
    
    log.push(`✅ Re-geocodificación exitosa`);
    log.push(`   ${cambio}`);
    log.push(`   Fuente: ${fuente}`);
    
    return {
      success: true,
      lat: latFinal,
      lng: lngFinal,
      fuente,
      log,
      mensaje: "Pedido re-geocodificado exitosamente"
    };
    
  } catch (err) {
    log.push(`\n❌ Error fatal: ${err?.message || err}`);
    console.error("[regeocodificar] Error:", err);
    return {
      success: false,
      mensaje: `Error: ${err?.message || String(err)}`,
      log
    };
  }
}
