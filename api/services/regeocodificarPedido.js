/**
 * Servicio de re-geocodificación de pedidos con el sistema inteligente de 5 capas
 * Permite actualizar coordenadas de pedidos viejos con el algoritmo mejorado
 *
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { normalizarDireccion } from "../utils/normalizarCalles.js";
import {
  buscarCoordenadasPorNisMedidor,
  existeSocioCatalogoPorIdentificadorSinCoords,
} from "./buscarCoordenadasPorNisMedidor.js";
import { geocodeCalleNumeroLocalidadArgentina, reverseGeocodeArgentina } from "./nominatimClient.js";
import { interpolarCoordenadaPorAltura } from "./interpolacionAlturas.js";
import { getTenantProvinciaNominatim } from "./tenantProvincia.js";
import { actualizarSociosCatalogoCoordsSiMatchPedido } from "../utils/sociosCatalogoCoordsFromPedido.js";

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

function normCp(s) {
  if (s == null) return "";
  const d = String(s).replace(/\D/g, "");
  return d.length >= 4 && d.length <= 8 ? d : "";
}

/**
 * Re-geocodifica un pedido existente con el sistema inteligente
 *
 * @param {number} pedidoId
 * @param {number} tenantId
 * @param {{ silent?: boolean }} [options] — compat.: el array `log` siempre se llena (auditoría / notificación admin)
 * @returns {Promise<{success: boolean, lat: number, lng: number, fuente: string, log: string[], mensaje: string}>}
 */
export async function regeocodificarPedido(pedidoId, tenantId, options = {}) {
  const log = [];
  const L = (msg) => {
    log.push(msg);
  };

  L("🔄 Iniciando re-geocodificación inteligente...");
  const provinciaTenant = await getTenantProvinciaNominatim(tenantId);
  if (provinciaTenant) {
    L(`🏛️ Provincia tenant (oficina / config): ${provinciaTenant}`);
  } else {
    L(`⚠️ Sin provincia de tenant: Nominatim no se acota por estado (configurá provincia o ubicación central)`);
  }

  try {
    const pedidoResult = await query(
      `SELECT 
        id, nis, medidor, nis_medidor, 
        cliente_nombre, cliente_calle, cliente_numero_puerta, cliente_localidad,
        lat, lng, provincia, codigo_postal
       FROM pedidos 
       WHERE id = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    if (!pedidoResult.rows || pedidoResult.rows.length === 0) {
      return {
        success: false,
        mensaje: "Pedido no encontrado",
        log,
      };
    }

    const pedido = pedidoResult.rows[0];
    const coordsActuales = coordsValidasWgs84(pedido.lat, pedido.lng);

    const provPed = pedido.provincia != null ? String(pedido.provincia).trim() : "";
    const provinciaEfectiva = provPed.length >= 2 ? provPed : provinciaTenant || "";
    const postalDigits = normCp(pedido.codigo_postal);

    L(`📦 Pedido #${pedido.id}: ${pedido.cliente_nombre || "Sin nombre"}`);
    L(
      `📍 Dirección: ${pedido.cliente_calle || "?"} ${pedido.cliente_numero_puerta || "?"}, ${pedido.cliente_localidad || "?"}`
    );
    if (provinciaEfectiva) L(`🏛️ Provincia (pedido/tenant): ${provinciaEfectiva}`);
    if (postalDigits) L(`📮 CP: ${postalDigits}`);
    if (coordsActuales) {
      L(`📌 Coords actuales: ${Number(pedido.lat).toFixed(6)}, ${Number(pedido.lng).toFixed(6)}`);
    } else {
      L(`⚠️  Sin coordenadas válidas actuales`);
    }

    const nisT = pedido.nis ? String(pedido.nis).trim() : null;
    const medT = pedido.medidor ? String(pedido.medidor).trim() : null;
    const nmT = pedido.nis_medidor ? String(pedido.nis_medidor).trim() : null;
    let calleT = pedido.cliente_calle ? String(pedido.cliente_calle).trim() : null;
    const numT = pedido.cliente_numero_puerta ? String(pedido.cliente_numero_puerta).trim() : null;
    const locT = pedido.cliente_localidad ? String(pedido.cliente_localidad).trim() : null;
    const nombreT = pedido.cliente_nombre ? String(pedido.cliente_nombre).trim() : null;

    if (!calleT && !locT && !nisT && !medT && !nmT) {
      L("❌ Sin datos suficientes para geocodificar");
      return {
        success: false,
        mensaje: "Pedido sin dirección ni identificadores",
        log,
      };
    }

    let latFinal = null;
    let lngFinal = null;
    let fuente = null;
    /** CP desde resultado directo de Nominatim (forward), si existe. */
    let nominatimPostcode = null;

    L("\n🔤 PASO 1: Normalización de calle");
    if (calleT && locT) {
      try {
        const normResult = await normalizarDireccion({ calle: calleT, ciudad: locT });
        if (normResult && normResult.cambio) {
          L(`  ✓ "${calleT}" → "${normResult.calleNormalizada}" (confianza: ${(normResult.confianza * 100).toFixed(0)}%)`);
          calleT = normResult.calleNormalizada;
        } else {
          L(`  ✓ Nombre de calle OK (sin cambios)`);
        }
      } catch (err) {
        L(`  ⚠️  Error en normalización: ${err?.message || err}`);
      }
    } else {
      L(`  → Sin calle/localidad para normalizar`);
    }

    L("\n📚 PASO 2: Catálogo (socios_catalogo)");
    const tieneIdentificador = !!(nisT || medT || nmT);

    if (tieneIdentificador) {
      L("  2a — Prioridad NIS / Medidor / nis_medidor");
      try {
        const coordsId = await buscarCoordenadasPorNisMedidor({
          tenantId: Number(tenantId),
          nis: nisT,
          medidor: medT,
          nisMedidor: nmT,
          calle: calleT,
          numero: numT,
          localidad: locT,
          nombreCliente: nombreT,
          soloIdentificador: true,
        });
        if (coordsId && coordsValidasWgs84(coordsId.lat, coordsId.lng)) {
          latFinal = coordsId.lat;
          lngFinal = coordsId.lng;
          fuente = coordsId.esManual ? "catalogo_manual" : "catalogo_nis_medidor";
          L(`  ✓ Coincidencia en catálogo por identificador → ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
          if (coordsId.esManual) L(`  ✓ Coordenadas marcadas como manuales en catálogo (prioridad)`);
        } else {
          const existeSinCoords = await existeSocioCatalogoPorIdentificadorSinCoords({
            tenantId: Number(tenantId),
            nis: nisT,
            medidor: medT,
            nisMedidor: nmT,
          });
          if (existeSinCoords) {
            L(`  ⚠️ Socio hallado en catálogo por NIS/Medidor pero sin lat/lon útiles → se sigue con Nominatim / interpolación`);
          } else {
            L(`  → Sin fila en catálogo para los identificadores del pedido`);
          }
        }
      } catch (err) {
        L(`  ⚠️  Error en búsqueda por identificador: ${err?.message || err}`);
      }
    } else {
      L("  2a — Sin NIS/medidor en el pedido; se omite subpaso por identificador");
    }

    if (!coordsValidasWgs84(latFinal, lngFinal) && calleT && locT && nombreT && String(nombreT).trim().length >= 3) {
      L("  2b — Respaldo por calle + localidad + nombre (titular)");
      try {
        const coordsDir = await buscarCoordenadasPorNisMedidor({
          tenantId: Number(tenantId),
          nis: null,
          medidor: null,
          nisMedidor: null,
          calle: calleT,
          numero: numT,
          localidad: locT,
          nombreCliente: nombreT,
        });
        if (coordsDir && coordsValidasWgs84(coordsDir.lat, coordsDir.lng)) {
          latFinal = coordsDir.lat;
          lngFinal = coordsDir.lng;
          fuente = coordsDir.esManual ? "catalogo_manual_direccion" : "catalogo_direccion_nombre";
          L(`  ✓ Coincidencia en catálogo por dirección+nombre → ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
        } else {
          L(`  → Sin coincidencia por dirección+nombre en catálogo`);
        }
      } catch (err) {
        L(`  ⚠️  Error en búsqueda por dirección: ${err?.message || err}`);
      }
    } else if (!coordsValidasWgs84(latFinal, lngFinal) && (!calleT || !locT)) {
      L("  2b — Sin datos para búsqueda por dirección+nombre en catálogo");
    }

    if (!coordsValidasWgs84(latFinal, lngFinal) && calleT && locT) {
      L("\n🌍 PASO 3: Nominatim (calle + localidad + provincia/CP si hay)");
      try {
        const geoResult = await geocodeCalleNumeroLocalidadArgentina(locT, calleT, numT || "", {
          allowTenantCentroidFallback: false,
          catalogStrict: false,
          stateOrProvince: provinciaEfectiva.length >= 2 ? provinciaEfectiva : undefined,
          postalCode: postalDigits.length >= 4 ? postalDigits : undefined,
        });

        if (geoResult && coordsValidasWgs84(geoResult.lat, geoResult.lng)) {
          latFinal = geoResult.lat;
          lngFinal = geoResult.lng;
          fuente = geoResult.audit?.source || "nominatim";
          if (geoResult.postcode) {
            nominatimPostcode = normCp(geoResult.postcode);
            if (nominatimPostcode) L(`  📮 CP (Nominatim): ${nominatimPostcode}`);
          }
          L(`  ✓ Nominatim: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
          L(`  ✓ Fuente: ${fuente}`);
        } else {
          L(`  → Nominatim sin resultados`);
        }
      } catch (err) {
        L(`  ⚠️  Error en Nominatim: ${err?.message || err}`);
      }
    }

    if (!coordsValidasWgs84(latFinal, lngFinal) && calleT && numT && locT) {
      L("\n📐 PASO 4: Interpolación municipal (Overpass + geometría de vía)");
      try {
        const interpol = await interpolarCoordenadaPorAltura({
          calle: calleT,
          numero: numT,
          localidad: locT,
          provincia: provinciaEfectiva.length >= 2 ? provinciaEfectiva : undefined,
        });

        if (interpol && interpol.log) {
          interpol.log.forEach((line) => L(`  ${line}`));
        }

        if (interpol && coordsValidasWgs84(interpol.lat, interpol.lng)) {
          latFinal = interpol.lat;
          lngFinal = interpol.lng;
          fuente = "interpolacion";
          L(`  ✓ Interpolación exitosa: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
        } else {
          L(`  → Interpolación sin resultados válidos`);
        }
      } catch (err) {
        L(`  ⚠️  Error en interpolación: ${err?.message || err}`);
      }
    }

    L("\n" + "═".repeat(60));

    if (!coordsValidasWgs84(latFinal, lngFinal)) {
      L("❌ No se pudo geocodificar con ningún método");
      return {
        success: false,
        mensaje: "No se pudieron obtener coordenadas válidas",
        log,
      };
    }

    const provPersist = provinciaEfectiva.length >= 2 ? provinciaEfectiva : null;

    let cpPersistStr = postalDigits.length >= 4 ? postalDigits : "";
    if (!cpPersistStr && nominatimPostcode) cpPersistStr = nominatimPostcode;
    if (!cpPersistStr && coordsValidasWgs84(latFinal, lngFinal)) {
      try {
        const revCp = await reverseGeocodeArgentina(latFinal, lngFinal);
        const rcp = normCp(revCp?.address?.postcode);
        if (rcp) {
          cpPersistStr = rcp;
          L(`  📮 CP inferido (reverse Nominatim): ${rcp}`);
        }
      } catch (_) {}
    }
    const cpPersist = cpPersistStr.length >= 4 ? cpPersistStr : null;

    await query(
      `UPDATE pedidos 
       SET lat = $1, lng = $2,
           provincia = CASE WHEN $5::text IS NOT NULL AND BTRIM($5::text) <> '' THEN BTRIM($5::text) ELSE provincia END,
           codigo_postal = CASE WHEN $6::text IS NOT NULL AND BTRIM($6::text) <> '' THEN BTRIM($6::text) ELSE codigo_postal END
       WHERE id = $3 AND tenant_id = $4`,
      [latFinal, lngFinal, pedidoId, tenantId, provPersist, cpPersist]
    );

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
      log,
      mensaje: "Pedido re-geocodificado exitosamente",
    };
  } catch (err) {
    L(`\n❌ Error fatal: ${err?.message || err}`);
    console.error("[regeocodificar] Error:", err);
    return {
      success: false,
      mensaje: `Error: ${err?.message || String(err)}`,
      log,
    };
  }
}
