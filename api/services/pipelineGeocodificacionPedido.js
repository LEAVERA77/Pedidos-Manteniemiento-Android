/**
 * Pipeline compartido de geocodificación (catálogo + Nominatim + interpolación + fallbacks).
 * Usado por `regeocodificarPedido` y por la alta WhatsApp previa al INSERT.
 *
 * made by leavera77
 */

import { resolveUbicacionCentralPublic } from "../routes/configUbicacion.js";
import { separarNumeroDuplicadoEnCalle } from "../utils/parseDomicilioArg.js";
import { normalizarDireccion } from "../utils/normalizarCalles.js";
import {
  buscarCoordenadasPorNisMedidor,
  existeSocioCatalogoPorIdentificadorSinCoords,
} from "./buscarCoordenadasPorNisMedidor.js";
import {
  buscarCentroDeCalle,
  geocodeAddressArgentina,
  geocodeCalleNumeroLocalidadArgentina,
  geocodeDomicilioLineaLibreArgentina,
  geocodeDomicilioSimpleQArgentina,
  geocodeLocalityViewboxArgentina,
  getNominatimBaseUrl,
  nominatimFallbackCentroCalleEnabled,
  reverseGeocodeArgentina,
} from "./nominatimClient.js";
import {
  interpolarCoordenadaPorAltura,
  interpolarPaso5dAnclaInicioVia,
} from "./interpolacionAlturas.js";
import { getTenantProvinciaNominatim } from "./tenantProvincia.js";
import {
  coordsValidasWgs84,
  parseCoordLoose,
  parLatLngPasaCheckWhatsappDb,
  FALLBACK_WGS84_ARGENTINA,
} from "./whatsappGeolocalizacionGarantizada.js";
import { esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp } from "../utils/sociosCatalogoCoordsFromPedido.js";
import { buscarCoordenadasVecinoParidadOverpass } from "./overpassVecinosParidad.js";
import { evaluarIgnorarCoordenadasCatalogoPipeline } from "./sociosCatalogoPipelineFiltro.js";
import { geocodeDireccionGeorefAr, georefArEnabled } from "./georefClient.js";
import { buscarCorreccionDireccionEnBd } from "./correccionesDirecciones.js";
import { interpolarPosicionEnCalle, streetGeometryInterpolationEnabled } from "./streetInterpolation.js";
import { geocodeByCatastral, catastralGeocodingEnabled } from "./catastralGeocoding.js";

export { coordsValidasWgs84 };

/** @param {{ recordPaso?: (p: object) => Promise<void> }} tele */
async function teleRecord(tele, slug, extra = {}) {
  if (!tele?.recordPaso) return;
  try {
    await tele.recordPaso({ slug, ...extra });
  } catch (_) {}
}

function normCp(s) {
  if (s == null) return "";
  const d = String(s).replace(/\D/g, "");
  return d.length >= 4 && d.length <= 8 ? d : "";
}

function inferirModoUbicacion(fuenteStr) {
  const s = String(fuenteStr || "");
  if (/interpolacion_via_ancla|interpolacion_alturas_osm/i.test(s)) return "interpolado_via";
  if (/centro_ciudad_fallback/i.test(s)) return "localidad";
  if (/region_provincia|fallback_argentina_aprox_obligatorio/i.test(s)) return "region";
  if (/centro_tenant|aprox_area_oficina_tenant|tenant_config/i.test(s)) return "tenant";
  if (/centro_localidad|nominatim_q_localidad/i.test(s)) return "localidad";
  if (/georef_ar/i.test(s)) return "exacto_aprox";
  if (/correccion_manual_bd/i.test(s)) return "exacto_aprox";
  if (/interpolacion_geometria|geometria_punto_medio|catastral_via_m/i.test(s)) return "interpolado_via";
  if (/catalogo|nis|nominatim|interpolacion|simple_q|linea_libre|geocode|whatsapp_gps|osm_vecino_paridad/i.test(s))
    return "exacto_aprox";
  return "aprox";
}

/**
 * @param {object} pedido
 * @param {number|string} tenantId
 * @param {{
 *   log?: string[],
 *   preferSimpleQNominatim?: boolean,
 *   provinciaTenantPreloaded?: string|null,
 *   respetarGpsWhatsapp?: boolean,
 *   telemetria?: { recordPaso?: (p: object) => Promise<void> },
 * }} [options]
 */
export async function ejecutarPipelineGeocodificacionDesdePedidoLike(pedido, tenantId, options = {}) {
  const log = options.log != null ? options.log : [];
  const L = (msg) => {
    log.push(msg);
  };
  const tele = options.telemetria;
  await teleRecord(tele, "pipeline_inicio", { tenantId: Number(tenantId) });
  const preferSimpleQOpt = !!options.preferSimpleQNominatim;
  let provinciaTenant = options.provinciaTenantPreloaded;
  if (provinciaTenant === undefined) {
    const t0 = Date.now();
    await teleRecord(tele, "provincia_tenant_fetch_inicio");
    try {
      provinciaTenant = await getTenantProvinciaNominatim(tenantId);
      await teleRecord(tele, "provincia_tenant_fetch", { ok: true, ms: Date.now() - t0 });
    } catch (e) {
      await teleRecord(tele, "provincia_tenant_fetch", { ok: false, ms: Date.now() - t0, err: String(e?.message || e) });
      throw e;
    }
  }

    /* pedido: parámetro */
    const origenWa =
      preferSimpleQOpt ||
      String(pedido.origen_reclamo || "")
        .trim()
        .toLowerCase() === "whatsapp";
    const coordsActuales = coordsValidasWgs84(pedido.lat, pedido.lng);

    const provPed = pedido.provincia != null ? String(pedido.provincia).trim() : "";
    const provinciaEfectiva = provPed.length >= 2 ? provPed : provinciaTenant || "";
    const postalDigits = normCp(pedido.codigo_postal);

    L(`📦 Pedido #${pedido.id != null ? pedido.id : "nuevo"}: ${pedido.cliente_nombre || "Sin nombre"}`);
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
    const calleOriginalPedido = calleT ? String(calleT).trim() : null;
    let numT = pedido.cliente_numero_puerta ? String(pedido.cliente_numero_puerta).trim() : null;
    const locT = pedido.cliente_localidad ? String(pedido.cliente_localidad).trim() : null;
    const nombreT = pedido.cliente_nombre ? String(pedido.cliente_nombre).trim() : null;

    const sepCalle = separarNumeroDuplicadoEnCalle(calleT, numT);
    if (sepCalle.stripped) {
      L(
        `  ✂️ Calle / número alineados (sin duplicar n° en columna calle): "${sepCalle.calle}" · puerta ${sepCalle.numero || numT || "—"}`
      );
      calleT = sepCalle.calle;
      if (!numT && sepCalle.numero) numT = String(sepCalle.numero);
    }

    if (!calleT && !locT && !nisT && !medT && !nmT) {
      L("❌ Sin datos suficientes para geocodificar");
      return {
        ok: false,
        motivo: "sin_datos_geocod",
        mensaje: "Pedido sin dirección ni identificadores",
        latFinal: null,
        lngFinal: null,
        fuente: null,
        log,
        _logLines: log.slice(),
      };
    }

    let latFinal = null;
    let lngFinal = null;
    let fuente = null;
    /** CP desde resultado directo de Nominatim (forward), si existe. */
    let nominatimPostcode = null;
    /** WhatsApp: si ya corrimos Simple-q antes del catálogo, el segundo Nominatim usa pipeline completo. */
    let waNominatimAntesCatalogo = false;

    L("\n🔤 PASO 1: Normalización de calle");
    if (calleT && locT) {
      try {
        const normResult = await normalizarDireccion({ calle: calleT, ciudad: locT });
        if (normResult && normResult.cambio) {
          L(
            `  ✓ "${calleT}" → "${normResult.calleNormalizada}" (confianza: ${(normResult.confianza * 100).toFixed(0)}%, método: ${normResult.metodo || "similitud"})`
          );
          calleT = normResult.calleNormalizada;
        } else {
          L(`  ✓ Nombre de calle OK (sin cambios o sin match fuzzy ≥ 0,8 en diccionario)`);
        }
      } catch (err) {
        L(`  ⚠️  Error en normalización: ${err?.message || err}`);
      }
    } else {
      L(`  → Sin calle/localidad para normalizar`);
    }
    await teleRecord(tele, "paso1_normalizacion_ok");

    if (options.respetarGpsWhatsapp === true && !coordsValidasWgs84(latFinal, lngFinal)) {
      const gla = pedido.lat != null ? Number(pedido.lat) : NaN;
      const glo = pedido.lng != null ? Number(pedido.lng) : NaN;
      if (
        coordsValidasWgs84(gla, glo) &&
        !esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp(gla, glo)
      ) {
        latFinal = gla;
        lngFinal = glo;
        fuente = "whatsapp_gps";
        L("\n📍 PASO 0: GPS WhatsApp — coordenadas del dispositivo (prioridad)");
        L(`  ✓ ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
        await teleRecord(tele, "paso0_gps_whatsapp", { fuente: "whatsapp_gps" });
      }
    }

    const mismoTextoCalle = (a, b) =>
      String(a || "")
        .trim()
        .toLowerCase() ===
      String(b || "")
        .trim()
        .toLowerCase();

    /**
     * PASO 3 + 3b + 4 con una calle concreta (sin repetir PASO 1 diccionario).
     * @param {string | null} calleBusqueda
     */
    async function ejecutarNominatim3_3b_4(calleBusqueda, opts = {}) {
      const simpleQOnly = !!opts.simpleQOnly;
      let la = null;
      let lo = null;
      let fu = null;
      let npc = null;
      if (!calleBusqueda || !locT) return { lat: la, lng: lo, fuente: fu, nominatimPostcode: npc };

      if (simpleQOnly) {
        const waMode = String(process.env.NOMINATIM_WHATSAPP_SEARCH_MODE || "free-form").trim();
        L(
          `\n🌍 PASO 3 (WhatsApp): Nominatim Simple-q / free-form (geocodeDomicilioSimpleQArgentina: q tipo UI web, provincia OSM opcional) [calle: "${calleBusqueda}"]`
        );
        L(
          `  ⚙️ NOMINATIM_WHATSAPP_SEARCH_MODE=${waMode} (si es "structured"/"legacy" no se usa la ruta free-form; default free-form)`
        );
        L(`  🌐 NOMINATIM_BASE_URL efectivo: ${getNominatimBaseUrl()}`);
        try {
          const sq = await geocodeDomicilioSimpleQArgentina({
            calle: calleBusqueda,
            numero: numT || "",
            localidad: locT,
            stateOrProvince: provinciaEfectiva.length >= 2 ? provinciaEfectiva : "",
            postalCode: postalDigits.length >= 4 ? postalDigits : "",
          });
          if (sq && coordsValidasWgs84(sq.lat, sq.lng)) {
            la = sq.lat;
            lo = sq.lng;
            fu = sq.audit?.source || "nominatim_simple_q";
            if (sq.audit?.q) {
              L(`  📝 Query audit: q="${String(sq.audit.q).slice(0, 120)}" source=${fu}`);
            }
            const aSq = sq.audit;
            if (
              tele?.recordPaso &&
              aSq &&
              (aSq.approximate ||
                (aSq.requestedHouseNumber != null &&
                  aSq.usedHouseNumber != null &&
                  aSq.usedHouseNumber !== aSq.requestedHouseNumber))
            ) {
              await teleRecord(tele, "nominatim_numero_cercano", {
                solicitado: aSq.requestedHouseNumber ?? null,
                usado: aSq.usedHouseNumber ?? null,
                source: aSq.source || null,
                q: aSq.q != null ? String(aSq.q).slice(0, 200) : undefined,
              });
            }
            if (
              aSq?.approximate ||
              (aSq?.requestedHouseNumber != null &&
                aSq?.usedHouseNumber != null &&
                aSq.usedHouseNumber !== aSq.requestedHouseNumber)
            ) {
              L(
                `  📌 Número de puerta aproximado: pedido ${aSq.requestedHouseNumber} → OSM/usado ${aSq.usedHouseNumber} (${aSq.source || fu})`
              );
            }
            if (sq.postcode) {
              const n = normCp(sq.postcode);
              if (n) {
                npc = n;
                L(`  📮 CP (Nominatim q): ${n}`);
              }
            }
            L(`  ✓ Simple/q: ${la.toFixed(6)}, ${lo.toFixed(6)} (${fu})`);
          } else {
            L(`  → Simple/q sin punto útil`);
          }
        } catch (err) {
          L(`  ⚠️  Error Nominatim Simple/q: ${err?.message || err}`);
        }
        return { lat: la, lng: lo, fuente: fu, nominatimPostcode: npc };
      }

      L(`\n🌍 PASO 3: Nominatim (calle + localidad + provincia/CP si hay) [calle busqueda: "${calleBusqueda}"]`);
      try {
        const geoResult = await geocodeCalleNumeroLocalidadArgentina(locT, calleBusqueda, numT || "", {
          allowTenantCentroidFallback: false,
          catalogStrict: false,
          stateOrProvince: provinciaEfectiva.length >= 2 ? provinciaEfectiva : undefined,
          postalCode: postalDigits.length >= 4 ? postalDigits : undefined,
        });

        if (geoResult && coordsValidasWgs84(geoResult.lat, geoResult.lng)) {
          la = geoResult.lat;
          lo = geoResult.lng;
          fu = geoResult.audit?.source || "nominatim";
          const aGeo = geoResult.audit;
          if (
            tele?.recordPaso &&
            aGeo &&
            (aGeo.approximate ||
              (aGeo.requestedHouseNumber != null &&
                aGeo.usedHouseNumber != null &&
                aGeo.usedHouseNumber !== aGeo.requestedHouseNumber))
          ) {
            await teleRecord(tele, "nominatim_numero_cercano", {
              solicitado: aGeo.requestedHouseNumber ?? null,
              usado: aGeo.usedHouseNumber ?? null,
              source: aGeo.source || null,
              q: aGeo.q != null ? String(aGeo.q).slice(0, 200) : undefined,
            });
          }
          if (
            aGeo?.approximate ||
            (aGeo?.requestedHouseNumber != null &&
              aGeo?.usedHouseNumber != null &&
              aGeo.usedHouseNumber !== aGeo.requestedHouseNumber)
          ) {
            L(
              `  📌 Número de puerta aproximado: pedido ${aGeo.requestedHouseNumber} → OSM/usado ${aGeo.usedHouseNumber} (${aGeo.source || fu})`
            );
          }
          if (geoResult.postcode) {
            npc = normCp(geoResult.postcode);
            if (npc) L(`  📮 CP (Nominatim): ${npc}`);
          }
          L(`  ✓ Nominatim: ${la.toFixed(6)}, ${lo.toFixed(6)}`);
          L(`  ✓ Fuente: ${fu}`);
        } else {
          L(`  → Nominatim sin resultados`);
        }
      } catch (err) {
        L(`  ⚠️  Error en Nominatim: ${err?.message || err}`);
      }

      if (!coordsValidasWgs84(la, lo)) {
        L("\nPASO 3b: Nominatim linea libre (fallback q)");
        try {
          const ll = await geocodeDomicilioLineaLibreArgentina(
            {
              calle: calleBusqueda,
              numero: numT || "",
              localidad: locT,
              provincia: provinciaEfectiva.length >= 2 ? provinciaEfectiva : "",
              postalCode: postalDigits.length >= 4 ? postalDigits : "",
            },
            {}
          );
          if (ll && coordsValidasWgs84(ll.lat, ll.lng)) {
            la = ll.lat;
            lo = ll.lng;
            fu = ll.audit?.source || "nominatim_linea_libre";
            if (ll.postcode) {
              const n = normCp(ll.postcode);
              if (n) {
                npc = n;
                L(`  CP (Nominatim linea libre): ${n}`);
              }
            }
            L(`  Linea libre OK: ${la.toFixed(6)}, ${lo.toFixed(6)}`);
          } else {
            L(`  Linea libre sin punto util`);
          }
        } catch (err) {
          L(`  Error Nominatim linea libre: ${err?.message || err}`);
        }
      }

      if (!coordsValidasWgs84(la, lo) && georefArEnabled() && calleBusqueda && locT) {
        L("\n🇦🇷 PASO 3d: Georef API (datos.gob.ar — respaldo nacional)");
        try {
          const gr = await geocodeDireccionGeorefAr({
            calle: calleBusqueda,
            numero: numT || "",
            localidad: locT,
            provincia: provinciaEfectiva.length >= 2 ? provinciaEfectiva : "",
          });
          if (gr.hit && coordsValidasWgs84(gr.lat, gr.lng)) {
            la = gr.lat;
            lo = gr.lng;
            fu = "georef_ar";
            L(
              `  ✓ Georef: ${la.toFixed(6)}, ${lo.toFixed(6)}${gr.precision ? ` (nivel: ${gr.precision})` : ""}`
            );
          } else {
            L(`  → Georef sin dirección útil`);
          }
        } catch (err) {
          L(`  ⚠️ Georef: ${err?.message || err}`);
        }
      }

      if (
        !coordsValidasWgs84(la, lo) &&
        streetGeometryInterpolationEnabled() &&
        calleBusqueda &&
        numT &&
        locT
      ) {
        L("\n🧭 PASO 3e: Interpolación por geometría de calle (Overpass — refs addr:housenumber + vía)");
        const t3e = Date.now();
        try {
          const ip = await interpolarPosicionEnCalle(
            calleBusqueda,
            locT,
            numT,
            provinciaEfectiva.length >= 2 ? provinciaEfectiva : ""
          );
          await teleRecord(tele, ip.hit ? "interpolacion_geometria_exito" : "interpolacion_geometria_fallo", {
            ms: Date.now() - t3e,
            hit: !!ip.hit,
            source: ip.source || null,
            razon: ip.razon || null,
          });
          if (ip.hit && coordsValidasWgs84(ip.lat, ip.lng)) {
            la = ip.lat;
            lo = ip.lng;
            fu = ip.source || "interpolacion_geometria_calle";
            L(`  ✓ ${fu}: ${la.toFixed(6)}, ${lo.toFixed(6)}`);
            if (ip.detalles && typeof ip.detalles === "object") {
              try {
                L(`  📝 Detalle: ${JSON.stringify(ip.detalles).slice(0, 220)}`);
              } catch (_) {}
            }
          } else {
            L(`  → Sin interpolación 3e (${ip.razon || "sin_hit"})`);
          }
        } catch (err) {
          await teleRecord(tele, "interpolacion_geometria_error", {
            ms: Date.now() - t3e,
            err: String(err?.message || err).slice(0, 400),
          });
          L(`  ⚠️ PASO 3e: ${err?.message || err}`);
        }
      }

      if (!coordsValidasWgs84(la, lo) && calleBusqueda && numT && locT) {
        L("\n📐 PASO 4: Interpolación municipal (Overpass + geometría de vía)");
        try {
          const interpol = await interpolarCoordenadaPorAltura({
            calle: calleBusqueda,
            numero: numT,
            localidad: locT,
            provincia: provinciaEfectiva.length >= 2 ? provinciaEfectiva : undefined,
          });

          if (interpol && interpol.log) {
            interpol.log.forEach((line) => L(`  ${line}`));
          }

          if (interpol && coordsValidasWgs84(interpol.lat, interpol.lng)) {
            la = interpol.lat;
            lo = interpol.lng;
            fu = "interpolacion";
            L(`  ✓ Interpolación exitosa: ${la.toFixed(6)}, ${lo.toFixed(6)}`);
          } else {
            L(`  → Interpolación sin resultados válidos`);
          }
        } catch (err) {
          L(`  ⚠️  Error en interpolación: ${err?.message || err}`);
        }
      }

      try {
        const corr = await buscarCorreccionDireccionEnBd({
          tenantId: Number(tenantId),
          calle: calleBusqueda,
          numero: numT,
          localidad: locT,
          provincia: provinciaEfectiva.length >= 2 ? provinciaEfectiva : "",
        });
        if (corr.hit && coordsValidasWgs84(corr.lat, corr.lng)) {
          L(
            `\n📌 Corrección manual (BD)${corr.id != null ? ` #${corr.id}` : ""}: ${corr.lat.toFixed(6)}, ${corr.lng.toFixed(6)} (sobrescribe Nominatim/Georef si aplica)`
          );
          la = corr.lat;
          lo = corr.lng;
          fu = "correccion_manual_bd";
        }
      } catch (err) {
        L(`  ⚠️ Corrección manual BD: ${err?.message || err}`);
      }

      return { lat: la, lng: lo, fuente: fu, nominatimPostcode: npc };
    }

    /** WhatsApp: Nominatim free-form / Simple-q ANTES del catálogo (no pisar con coords del padrón). */
    if (
      origenWa &&
      !coordsValidasWgs84(latFinal, lngFinal) &&
      calleT &&
      locT
    ) {
      waNominatimAntesCatalogo = true;
      L("\n🌍 WhatsApp — PASO 3 anticipado: Nominatim Simple-q / free-form antes del catálogo");
      await teleRecord(tele, "nominatim_antes_catalogo_inicio", { modo: "simple_q_whatsapp" });
      const tEarly = Date.now();
      const rEarly = await ejecutarNominatim3_3b_4(calleT, { simpleQOnly: true });
      await teleRecord(tele, "nominatim_antes_catalogo_fin", {
        ms: Date.now() - tEarly,
        hit: coordsValidasWgs84(rEarly.lat, rEarly.lng),
        fuente: rEarly.fuente || null,
      });
      if (process.env.DEBUG_WA_COORDS === "1") {
        try {
          console.log(
            JSON.stringify({
              evt: "pipeline_nominatim_antes_catalogo",
              lat: rEarly.lat,
              lng: rEarly.lng,
              fuente: rEarly.fuente,
            })
          );
        } catch (_) {}
      }
      if (coordsValidasWgs84(rEarly.lat, rEarly.lng)) {
        latFinal = rEarly.lat;
        lngFinal = rEarly.lng;
        fuente = rEarly.fuente;
        if (rEarly.nominatimPostcode) nominatimPostcode = rEarly.nominatimPostcode;
        L(
          `  ✓ Coordenadas antes de catálogo: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)} (${String(fuente || "?")})`
        );
      } else {
        L("  → Sin coordenadas en Simple-q anticipado; se sigue con catálogo");
      }
    }

    if (!coordsValidasWgs84(latFinal, lngFinal)) {
      await teleRecord(tele, "paso2_catalogo_inicio");
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
        const ignManualCat =
          process.env.IGNORAR_CATALOGO_MANUAL === "1" || process.env.IGNORAR_CATALOGO_MANUAL === "true";
        if (coordsId && coordsValidasWgs84(coordsId.lat, coordsId.lng)) {
          if (ignManualCat && coordsId.esManual) {
            L(
              `  → Catálogo manual ignorado (IGNORAR_CATALOGO_MANUAL); se continúa con Nominatim / resto del pipeline`
            );
          } else {
            const filtroCat = evaluarIgnorarCoordenadasCatalogoPipeline(coordsId);
            if (filtroCat.ignore) {
              L(`  → Catálogo ignorado (${filtroCat.razon || "filtro_calidad"})`);
            } else {
              latFinal = coordsId.lat;
              lngFinal = coordsId.lng;
              fuente = coordsId.esManual ? "catalogo_manual" : "catalogo_nis_medidor";
              L(`  ✓ Coincidencia en catálogo por identificador → ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
              if (coordsId.esManual) L(`  ✓ Coordenadas marcadas como manuales en catálogo (prioridad)`);
            }
          }
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
        const ignManualDir =
          process.env.IGNORAR_CATALOGO_MANUAL === "1" || process.env.IGNORAR_CATALOGO_MANUAL === "true";
        if (coordsDir && coordsValidasWgs84(coordsDir.lat, coordsDir.lng)) {
          if (ignManualDir && coordsDir.esManual) {
            L(
              `  → Catálogo manual (dirección) ignorado (IGNORAR_CATALOGO_MANUAL); se sigue con el pipeline`
            );
          } else {
            const filtroDir = evaluarIgnorarCoordenadasCatalogoPipeline(coordsDir);
            if (filtroDir.ignore) {
              L(`  → Catálogo (dirección) ignorado (${filtroDir.razon || "filtro_calidad"})`);
            } else {
              latFinal = coordsDir.lat;
              lngFinal = coordsDir.lng;
              fuente = coordsDir.esManual ? "catalogo_manual_direccion" : "catalogo_direccion_nombre";
              L(`  ✓ Coincidencia en catálogo por dirección+nombre → ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
            }
          }
        } else {
          L(`  → Sin coincidencia por dirección+nombre en catálogo`);
        }
      } catch (err) {
        L(`  ⚠️  Error en búsqueda por dirección: ${err?.message || err}`);
      }
    } else if (!coordsValidasWgs84(latFinal, lngFinal) && (!calleT || !locT)) {
      L("  2b — Sin datos para búsqueda por dirección+nombre en catálogo");
    }

    const nomSimpleQOnly = origenWa ? !waNominatimAntesCatalogo : false;

    if (!coordsValidasWgs84(latFinal, lngFinal)) {
      await teleRecord(tele, "nominatim_calle_inicio", {
        modo: origenWa
          ? nomSimpleQOnly
            ? "simple_q_whatsapp"
            : "estructurado_post_catalogo_o_retry"
          : "estructurado",
        simpleQOnly: nomSimpleQOnly,
      });
      const tNom = Date.now();
      const r1 = await ejecutarNominatim3_3b_4(calleT, { simpleQOnly: nomSimpleQOnly });
      await teleRecord(tele, "nominatim_calle_fin", {
        ms: Date.now() - tNom,
        hit: coordsValidasWgs84(r1.lat, r1.lng),
        fuente: r1.fuente || null,
      });
      if (process.env.DEBUG_WA_COORDS === "1") {
        try {
          console.log(
            JSON.stringify({
              evt: "pipeline_nominatim_calle_principal",
              simpleQOnly: nomSimpleQOnly,
              lat: r1.lat,
              lng: r1.lng,
              fuente: r1.fuente,
            })
          );
        } catch (_) {}
      }
      if (coordsValidasWgs84(r1.lat, r1.lng)) {
        latFinal = r1.lat;
        lngFinal = r1.lng;
        fuente = r1.fuente;
        if (r1.nominatimPostcode) nominatimPostcode = r1.nominatimPostcode;
      }
    }

    if (
      !coordsValidasWgs84(latFinal, lngFinal) &&
      calleOriginalPedido &&
      calleT &&
      !mismoTextoCalle(calleOriginalPedido, calleT)
    ) {
      L("\n↩ Reintento con calle original del pedido (sin volver a PASO 1 diccionario)…");
      const sepOrig = separarNumeroDuplicadoEnCalle(calleOriginalPedido, numT);
      const calleParaRetry = sepOrig.stripped ? sepOrig.calle : calleOriginalPedido;
      const r2 = await ejecutarNominatim3_3b_4(calleParaRetry, { simpleQOnly: nomSimpleQOnly });
      if (coordsValidasWgs84(r2.lat, r2.lng)) {
        latFinal = r2.lat;
        lngFinal = r2.lng;
        fuente = r2.fuente;
        if (r2.nominatimPostcode) nominatimPostcode = r2.nominatimPostcode;
      }
    }

    if (
      catastralGeocodingEnabled() &&
      !coordsValidasWgs84(latFinal, lngFinal) &&
      calleT &&
      locT &&
      numT
    ) {
      L("\n🌍 PASO 3f: Geolocalización catastral (cadena sobre geometría OSM + offset paridad)");
      const t3f = Date.now();
      try {
        const cat = await geocodeByCatastral(
          calleT,
          numT,
          locT,
          provinciaEfectiva.length >= 2 ? provinciaEfectiva : ""
        );
        await teleRecord(tele, cat.hit ? "catastral_exito" : "catastral_fallo", {
          ms: Date.now() - t3f,
          hit: !!cat.hit,
          razon: cat.razon || null,
        });
        if (cat.hit && coordsValidasWgs84(cat.lat, cat.lng)) {
          latFinal = cat.lat;
          lngFinal = cat.lng;
          fuente = cat.source || "catastral_via_m";
          L(
            `  ✓ Catastral: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)} (${((cat.detalles?.proporcion ?? 0) * 100).toFixed(1)}% de ~${Math.round(cat.detalles?.longitud_total_metros || 0)} m)`
          );
        } else {
          L(`  → Catastral sin resultado (${cat.razon || "sin_hit"})`);
        }
      } catch (err) {
        await teleRecord(tele, "catastral_error", {
          ms: Date.now() - t3f,
          err: String(err?.message || err).slice(0, 400),
        });
        L(`  ⚠️ PASO 3f catastral: ${err?.message || err}`);
      }
    }

    if (
      nominatimFallbackCentroCalleEnabled() &&
      !coordsValidasWgs84(latFinal, lngFinal) &&
      calleT &&
      locT
    ) {
      L("\n📍 PASO 3c: Fallback centro de calle (Nominatim sin número de puerta)");
      await teleRecord(tele, "fallback_centro_calle_inicio", {
        calle: String(calleT).slice(0, 120),
        localidad: String(locT).slice(0, 120),
      });
      const tCc = Date.now();
      let cc = { hit: false };
      try {
        cc = await buscarCentroDeCalle(
          calleT,
          locT,
          provinciaEfectiva.length >= 2 ? provinciaEfectiva : ""
        );
      } catch (err) {
        L(`  ⚠️ Centro de calle: ${err?.message || err}`);
        await teleRecord(tele, "fallback_centro_calle_error", {
          ms: Date.now() - tCc,
          err: String(err?.message || err).slice(0, 300),
        });
      }
      const okCc = cc && cc.hit === true && coordsValidasWgs84(cc.lat, cc.lng);
      await teleRecord(tele, "fallback_centro_calle_fin", {
        ms: Date.now() - tCc,
        hit: okCc,
        q: cc.q_elegida || null,
        reason: cc.reason || null,
      });
      if (okCc) {
        latFinal = cc.lat;
        lngFinal = cc.lng;
        fuente = "centro_de_calle_nominatim";
        L(
          `[pipeline] Centro de calle HIT: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)} — ${String(cc.display_name || "").slice(0, 140)}`
        );
      } else {
        L("  → Centro de calle sin resultado útil (sigue pipeline: vecinos / localidad / …)");
      }
    }

    if (!coordsValidasWgs84(latFinal, lngFinal) && calleT && locT && numT) {
      const nd = String(numT).replace(/\D/g, "");
      const nPedido = nd ? parseInt(nd, 10) : NaN;
      if (Number.isFinite(nPedido) && nPedido > 0) {
        L("\n📍 PASO 4b: Vecino OSM — misma calle, misma paridad (±20 / ±40 vía Overpass)");
        await teleRecord(tele, "overpass_vecinos_inicio", { numero_pedido: nPedido, calle: String(calleT).slice(0, 80) });
        const tOv = Date.now();
        try {
          const vec = await buscarCoordenadasVecinoParidadOverpass({
            calle: calleT,
            numeroPedido: nPedido,
            localidad: locT,
            provincia: provinciaEfectiva.length >= 2 ? provinciaEfectiva : null,
            postalDigits,
          });
          const okHit = vec && coordsValidasWgs84(vec.lat, vec.lng);
          await teleRecord(tele, "overpass_vecinos_fin", {
            ms: Date.now() - tOv,
            ok: !!okHit,
            elegido: vec
              ? {
                  numero_osm: vec.numero_osm,
                  numero_pedido: vec.numero_pedido,
                  delta: vec.delta,
                  rango: vec.rangoUsado,
                }
              : null,
          });
          if (vec?.rangoUsado === 40) {
            await teleRecord(tele, "overpass_vecinos_ampliacion", { radio: 40, motivo: "sin_candidato_pm20" });
          }
          if (okHit) {
            latFinal = vec.lat;
            lngFinal = vec.lng;
            fuente = vec.fuente || "osm_vecino_paridad";
            L(
              `  ✓ Vecino OSM: n° calle ${vec.numero_osm} (Δ${vec.delta}, rango ±${vec.rangoUsado}) → ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`
            );
          } else {
            L(`  → Sin vecino útil en OSM (misma paridad en ventana numérica)`);
          }
        } catch (err) {
          await teleRecord(tele, "overpass_vecinos_fin", {
            ms: Date.now() - tOv,
            ok: false,
            err: String(err?.message || err).slice(0, 400),
          });
          L(`  ⚠️ PASO 4b Overpass vecinos: ${err?.message || err}`);
        }
      }
    }

    }

    let metodoAnclaP5d = null;
    let precisionAnclaP5d = null;
    if (
      !coordsValidasWgs84(latFinal, lngFinal) &&
      calleT &&
      numT &&
      locT &&
      String(numT).replace(/\D/g, "").length >= 1
    ) {
      L("\n📍 PASO 5d: Ancla inicio de vía + metros sobre eje (heurística OSM)");
      try {
        const p5d = await interpolarPaso5dAnclaInicioVia({
          calle: calleT,
          numero: numT,
          localidad: locT,
          provincia: provinciaEfectiva,
          postalDigits,
          L,
        });
        for (const line of p5d.log || []) {
          if (line && String(line).trim()) L(String(line));
        }
        if (p5d.ok && coordsValidasWgs84(p5d.lat, p5d.lng)) {
          latFinal = p5d.lat;
          lngFinal = p5d.lng;
          fuente = p5d.fuente || "interpolacion_via_ancla_p5d";
          metodoAnclaP5d = p5d.metodoAncla ?? p5d.metadata?.metodo_ancla ?? null;
          precisionAnclaP5d = p5d.precisionAncla ?? p5d.metadata?.precision_ancla ?? null;
        }
      } catch (err) {
        L(`  ⚠️ PASO 5d: ${err?.message || err}`);
      }
    }

    let tenantCentroidPaso5 = null;
    try {
      const ubi = await resolveUbicacionCentralPublic(Number(tenantId));
      if (ubi && Number.isFinite(Number(ubi.lat)) && Number.isFinite(Number(ubi.lng))) {
        tenantCentroidPaso5 = { lat: Number(ubi.lat), lng: Number(ubi.lng) };
      }
    } catch (_) {}

    if (!coordsValidasWgs84(latFinal, lngFinal) && locT) {
      L("\n📍 PASO 5: Centro de localidad (OSM + fallback oficina si aplica)");
      const tP5 = Date.now();
      await teleRecord(tele, "paso5_centro_localidad_osm_inicio");
      try {
        const vb = await geocodeLocalityViewboxArgentina(locT, tenantCentroidPaso5, {
          allowTenantCentroidFallback: true,
          stateOrProvince: provinciaEfectiva.length >= 2 ? provinciaEfectiva : undefined,
          postalCode: postalDigits.length >= 4 ? postalDigits : undefined,
        });
        const cLat = vb?.center != null ? Number(vb.center.lat) : NaN;
        const cLng = vb?.center != null ? Number(vb.center.lng) : NaN;
        if (coordsValidasWgs84(cLat, cLng)) {
          latFinal = cLat;
          lngFinal = cLng;
          fuente = vb?.fromTenantCentroid ? "aprox_area_oficina_tenant" : "centro_localidad_osm";
          L(
            vb?.fromTenantCentroid
              ? `  ✓ Pin aproximado según área de referencia (ubicación central del tenant) — no reemplaza domicilio exacto`
              : `  ✓ Pin aproximado (OSM) en centro de "${locT}" — ubicación estimada, no domicilio exacto`
          );
        } else {
          L(`  → Sin centro OSM útil para la localidad (ni bbox tenant)`);
        }
      } catch (err) {
        L(`  ⚠️  Error PASO 5 (centro localidad): ${err?.message || err}`);
        await teleRecord(tele, "paso5_centro_localidad_osm_error", {
          ms: Date.now() - tP5,
          err: String(err?.message || err).slice(0, 500),
        });
      }
      await teleRecord(tele, "paso5_centro_localidad_osm_fin", {
        ms: Date.now() - tP5,
        ok: coordsValidasWgs84(latFinal, lngFinal),
      });
    }

    if (!coordsValidasWgs84(latFinal, lngFinal) && locT) {
      L("\n📍 PASO 5b: Nominatim q — localidad + provincia (fallback)");
      const t5b = Date.now();
      await teleRecord(tele, "paso5b_q_localidad_inicio");
      try {
        const qLoc =
          provinciaEfectiva.length >= 2
            ? `${locT}, ${provinciaEfectiva}, Argentina`
            : `${locT}, Argentina`;
        const gl = await geocodeAddressArgentina(qLoc, {
          filterLocalidad: locT,
          filterState: provinciaEfectiva.length >= 2 ? provinciaEfectiva : "",
          nominatimLimit: "8",
        });
        if (gl && coordsValidasWgs84(gl.lat, gl.lng)) {
          latFinal = gl.lat;
          lngFinal = gl.lng;
          fuente = "nominatim_q_localidad_fallback";
          L(`  ✓ Coordenadas por búsqueda libre de localidad: ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)}`);
        } else {
          L(`  → Sin resultado útil en PASO 5b`);
        }
      } catch (err) {
        L(`  ⚠️  PASO 5b: ${err?.message || err}`);
        await teleRecord(tele, "paso5b_error", { ms: Date.now() - t5b, err: String(err?.message || err).slice(0, 400) });
      }
      await teleRecord(tele, "paso5b_fin", { ms: Date.now() - t5b, ok: coordsValidasWgs84(latFinal, lngFinal) });
    }

    if (!coordsValidasWgs84(latFinal, lngFinal) && tenantCentroidPaso5) {
      L("\n📍 PASO 5c: Último recurso — coordenadas centrales del tenant (config)");
      latFinal = tenantCentroidPaso5.lat;
      lngFinal = tenantCentroidPaso5.lng;
      fuente = "centro_tenant_config_ultimo_recurso";
      L(`  ✓ Pin aproximado en sede/configuración del tenant (${latFinal.toFixed(5)}, ${lngFinal.toFixed(5)})`);
    }

    if (!coordsValidasWgs84(latFinal, lngFinal)) {
      L("\n📍 PASO 5e: Fallback provincia / región (política A — pin obligatorio)");
      const provF = provinciaEfectiva.length >= 2 ? provinciaEfectiva : provinciaTenant || "";
      if (provF.length >= 2) {
        try {
          const gr = await geocodeAddressArgentina(`${provF}, Argentina`, { nominatimLimit: "2" });
          if (gr && coordsValidasWgs84(gr.lat, gr.lng)) {
            latFinal = gr.lat;
            lngFinal = gr.lng;
            fuente = "region_provincia_fallback";
            L(`  ✓ Pin regional aprox. (${provF}): ${latFinal.toFixed(5)}, ${lngFinal.toFixed(5)}`);
          }
        } catch (err) {
          L(`  ⚠️ PASO 5e: ${err?.message || err}`);
        }
      }
    }

    if (!coordsValidasWgs84(latFinal, lngFinal) && locT) {
      L("\n📍 PASO 5f: Centro ciudad — último intento Nominatim (q sin filtros estrictos)");
      const t5f = Date.now();
      await teleRecord(tele, "paso5f_centro_ciudad_fallback_inicio");
      try {
        const qcc =
          provinciaEfectiva.length >= 2
            ? `${locT}, ${provinciaEfectiva}, Argentina`
            : `${locT}, Argentina`;
        const gcc = await geocodeAddressArgentina(qcc, { nominatimLimit: "3" });
        if (gcc && coordsValidasWgs84(gcc.lat, gcc.lng)) {
          latFinal = gcc.lat;
          lngFinal = gcc.lng;
          fuente = "centro_ciudad_fallback";
          L(`  ✓ ${latFinal.toFixed(6)}, ${lngFinal.toFixed(6)} (${fuente})`);
        } else {
          L(`  → Sin resultado útil en centro ciudad (Nominatim)`);
        }
      } catch (err) {
        L(`  ⚠️ PASO 5f: ${err?.message || err}`);
        await teleRecord(tele, "paso5f_error", { ms: Date.now() - t5f, err: String(err?.message || err).slice(0, 400) });
      }
      await teleRecord(tele, "paso5f_fin", { ms: Date.now() - t5f, ok: coordsValidasWgs84(latFinal, lngFinal) });
    }

    if (!coordsValidasWgs84(latFinal, lngFinal)) {
      await teleRecord(tele, "paso5g_fallback_argentina");
      latFinal = FALLBACK_WGS84_ARGENTINA.lat;
      lngFinal = FALLBACK_WGS84_ARGENTINA.lng;
      fuente = "fallback_argentina_aprox_obligatorio";
      L("\n📍 PASO 5g: Último recurso absoluto — centro aproximado Argentina (solo si todo lo anterior falló)");
      L(`  ✓ Coordenadas de respaldo: ${latFinal.toFixed(4)}, ${lngFinal.toFixed(4)}`);
    }

    L("\n" + "═".repeat(60));

    const provPersist = provinciaEfectiva.length >= 2 ? provinciaEfectiva : null;

    let cpPersistStr = postalDigits.length >= 4 ? postalDigits : "";
    if (!cpPersistStr && nominatimPostcode) cpPersistStr = nominatimPostcode;
    if (!cpPersistStr && coordsValidasWgs84(latFinal, lngFinal)) {
      const tRev = Date.now();
      await teleRecord(tele, "reverse_nominatim_cp_inicio");
      try {
        const revCp = await reverseGeocodeArgentina(latFinal, lngFinal);
        const rcp = normCp(revCp?.address?.postcode);
        if (rcp) {
          cpPersistStr = rcp;
          L(`  📮 CP inferido (reverse Nominatim): ${rcp}`);
        }
        await teleRecord(tele, "reverse_nominatim_cp_fin", { ms: Date.now() - tRev, ok: true });
      } catch (e) {
        await teleRecord(tele, "reverse_nominatim_cp_fin", {
          ms: Date.now() - tRev,
          ok: false,
          err: String(e?.message || e).slice(0, 300),
        });
      }
    }
    const cpPersist = cpPersistStr.length >= 4 ? cpPersistStr : null;

    const geocodingAudit = {
      policy: "A",
      fuente,
      modo: inferirModoUbicacion(fuente),
      metodo_ancla: metodoAnclaP5d || null,
      precision_ancla: precisionAnclaP5d || null,
      at: new Date().toISOString(),
    };
    L(
      `   🏷️ Auditoría ubicación: modo=${geocodingAudit.modo} · política ${geocodingAudit.policy}` +
        (geocodingAudit.metodo_ancla ? ` · ancla=${geocodingAudit.metodo_ancla}` : "")
    );

    latFinal = parseCoordLoose(latFinal);
    lngFinal = parseCoordLoose(lngFinal);
    if (!parLatLngPasaCheckWhatsappDb(latFinal, lngFinal)) {
      await teleRecord(tele, "coords_normalizacion_fin_pipeline", {
        ok: false,
        detail: "par no cumple CHECK SQL; aplicando fallback Argentina",
      });
      latFinal = FALLBACK_WGS84_ARGENTINA.lat;
      lngFinal = FALLBACK_WGS84_ARGENTINA.lng;
      fuente = fuente || "fallback_argentina_normalizado_fin_pipeline";
      L("\n⚠️ Normalización final: coords no válidas para CHECK WhatsApp → centro Argentina (auditable).");
    }

    if (process.env.DEBUG_WA_COORDS === "1") {
      try {
        console.log(
          JSON.stringify({
            evt: "pipeline_geocod_final",
            latFinal,
            lngFinal,
            fuente,
            waNominatimAntesCatalogo,
            checkPasa: parLatLngPasaCheckWhatsappDb(latFinal, lngFinal),
          })
        );
      } catch (_) {}
    }

    if (
      process.env.WA_INSERT_DEBUG === "1" ||
      process.env.WA_INSERT_DEBUG === "true" ||
      process.env.DEBUG_WA_COORDS === "1"
    ) {
      try {
        console.log("[pipeline] FINAL - latFinal:", latFinal, "lngFinal:", lngFinal, "source:", fuente);
      } catch (_) {}
    }

  return {
    ok: true,
    latFinal,
    lngFinal,
    fuente,
    nominatimPostcode,
    provPersist,
    cpPersist,
    geocodingAudit,
    log,
    metodoAnclaP5d,
    precisionAnclaP5d,
    mensaje: null,
    motivo: null,
  };
}

/**
 * Resuelve coordenadas antes del INSERT de un pedido WhatsApp (misma tubería que re-geocodificación).
 * @param {object} [opts] — `telemetria` para panel admin (pasos incrementales).
 */
export async function resolverCoordenadasCandidatoWhatsapp(payload, tenantId, opts = {}) {
  const pedidoLike = {
    id: null,
    cliente_calle: payload.cliente_calle ?? null,
    cliente_numero_puerta: payload.cliente_numero_puerta ?? null,
    cliente_localidad: payload.cliente_localidad ?? null,
    provincia: payload.provincia ?? null,
    codigo_postal: payload.codigo_postal ?? null,
    cliente_nombre: payload.cliente_nombre || "WhatsApp",
    nis: payload.nis ?? null,
    medidor: payload.medidor ?? null,
    nis_medidor: payload.nis_medidor ?? null,
    origen_reclamo: "whatsapp",
    lat: payload.lat != null ? Number(payload.lat) : null,
    lng: payload.lng != null ? Number(payload.lng) : null,
  };
  const log = [];
  const res = await ejecutarPipelineGeocodificacionDesdePedidoLike(pedidoLike, Number(tenantId), {
    log,
    preferSimpleQNominatim: true,
    respetarGpsWhatsapp: true,
    telemetria: opts.telemetria,
  });
  if (!res.ok) {
    return {
      success: false,
      mensaje: res.mensaje || "Fallo geocodificación",
      lat: null,
      lng: null,
      fuente: null,
      fuente_final: null,
      geocoding_audit: null,
      log: res.log || [],
      pasos: res.log || [],
      errores: [{ paso: "pipeline", detalle: res.motivo || "sin_datos" }],
      provincia_persistencia: null,
      codigo_postal_persistencia: null,
    };
  }
  const fuenteFinal = res.fuente;
  return {
    success: true,
    lat: res.latFinal,
    lng: res.lngFinal,
    fuente: fuenteFinal,
    fuente_final: fuenteFinal,
    geocoding_audit: res.geocodingAudit,
    log: res.log,
    pasos: res.log.slice(),
    errores: [],
    provincia_persistencia: res.provPersist,
    codigo_postal_persistencia: res.cpPersist,
  };
}
