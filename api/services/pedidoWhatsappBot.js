import { query } from "../db/neon.js";
import {
  tipoTrabajoPermitidoParaNuevoPedido,
  prioridadPredeterminadaPorTipoTrabajo,
  normalizarRubroCliente,
} from "./tiposReclamo.js";
import {
  lookupDistribuidorTrafoPorNisMedidor,
  contarPedidosAbiertosMismaZona,
  OUTAGE_SECTOR_MULTI_RECLAMO,
} from "./pedidoZonaOutage.js";
import { parseDomicilioLibreArgentina } from "../utils/parseDomicilioArg.js";
import {
  resolverGeolocalizacionGarantizadaWhatsapp,
  coordsValidasWgs84,
} from "./whatsappGeolocalizacionGarantizada.js";
import {
  enriquecerSociosCatalogoCoordsDesdePedidoWhatsapp,
  esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp,
} from "../utils/sociosCatalogoCoordsFromPedido.js";
import {
  buscarCoordenadasPorNisMedidor,
  obtenerProvinciaCodigoPostalCatalogoPorIdentificador,
} from "./buscarCoordenadasPorNisMedidor.js";
import { interpolarCoordenadaPorAltura } from "./interpolacionAlturas.js";
import { normalizarDireccion } from "../utils/normalizarCalles.js";
import { regeocodificarPedido } from "./regeocodificarPedido.js";

async function columnasUsuarios() {
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios'`
  );
  return new Set((cols.rows || []).map((c) => c.column_name));
}

let _pedidosColsCache = null;
async function columnasPedidos() {
  if (_pedidosColsCache) return _pedidosColsCache;
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos'`
  );
  _pedidosColsCache = new Set((cols.rows || []).map((c) => c.column_name));
  return _pedidosColsCache;
}

export async function getFirstAdminUserIdForTenant(tenantId) {
  const colSet = await columnasUsuarios();
  const hasTenant = colSet.has("tenant_id");
  const hasCliente = colSet.has("cliente_id");
  const col = hasTenant ? "tenant_id" : hasCliente ? "cliente_id" : null;
  if (!col) return null;
  const r = await query(
    `SELECT id FROM usuarios
     WHERE ${col} = $1 AND activo = TRUE
       AND (
         LOWER(COALESCE(rol::text, '')) = 'admin'
         OR LOWER(COALESCE(rol::text, '')) = 'administrador'
       )
     ORDER BY id ASC
     LIMIT 1`,
    [tenantId]
  );
  return r.rows?.[0]?.id ?? null;
}

export async function getFirstAnyActiveUserIdForTenant(tenantId) {
  const colSet = await columnasUsuarios();
  const hasTenant = colSet.has("tenant_id");
  const hasCliente = colSet.has("cliente_id");
  const col = hasTenant ? "tenant_id" : hasCliente ? "cliente_id" : null;
  if (!col) return null;
  const r = await query(
    `SELECT id FROM usuarios WHERE ${col} = $1 AND activo = TRUE ORDER BY id ASC LIMIT 1`,
    [tenantId]
  );
  return r.rows?.[0]?.id ?? null;
}

async function pedidoColumnNullable(columnName) {
  const r = await query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = $1 LIMIT 1`,
    [columnName]
  );
  return String(r.rows?.[0]?.is_nullable || "").toUpperCase() === "YES";
}

/**
 * Admin → cualquier usuario activo del tenant → WHATSAPP_BOT_FALLBACK_USUARIO_ID → NULL si el esquema lo permite.
 */
export async function resolveUsuarioCreadorParaPedidoWhatsapp(tenantId) {
  let uid = await getFirstAdminUserIdForTenant(tenantId);
  if (uid != null) return uid;
  uid = await getFirstAnyActiveUserIdForTenant(tenantId);
  if (uid != null) return uid;
  const fb = Number(process.env.WHATSAPP_BOT_FALLBACK_USUARIO_ID || "");
  if (Number.isFinite(fb) && fb >= 1) return fb;

  const pCols = await columnasPedidos();
  const needU = pCols.has("usuario_id");
  const needC = pCols.has("usuario_creador_id");
  if (!needU && !needC) return null;

  const uNull = !needU || (await pedidoColumnNullable("usuario_id"));
  const cNull = !needC || (await pedidoColumnNullable("usuario_creador_id"));
  if (!uNull || !cNull) {
    throw new Error("sin_usuario_para_pedido_whatsapp");
  }
  return null;
}

/**
 * Crea un pedido desde el bot (creador: admin, cualquier usuario del tenant, env de respaldo o NULL si el esquema lo permite).
 */
export async function crearPedidoDesdeWhatsappBot({
  tenantId,
  tipoCliente,
  tipoTrabajo,
  descripcion,
  telefonoContacto,
  lat,
  lng,
  contactName,
  nis,
  medidor,
  nisMedidor,
  clienteDireccion,
  clienteCalle,
  clienteNumeroPuerta,
  clienteLocalidad,
  provincia,
  codigoPostal,
  suministroTipoConexion,
  suministroFases,
  barrio,
  notaUbicacionInterna,
}) {
  const tt = String(tipoTrabajo || "").trim();
  let de = String(descripcion || "").trim();
  const notaInt =
    notaUbicacionInterna != null && String(notaUbicacionInterna).trim()
      ? String(notaUbicacionInterna).trim()
      : "";
  if (notaInt && !de.includes(notaInt)) {
    de = `${de}\n\n${notaInt}`;
  }
  if (!tt || !de) {
    throw new Error("tipo_y_descripcion_requeridos");
  }
  if (!tipoTrabajoPermitidoParaNuevoPedido(tt, tipoCliente)) {
    throw new Error("tipo_trabajo_invalido");
  }

  const rubroCliente = normalizarRubroCliente(tipoCliente);
  let provinciaIn = provincia != null && String(provincia).trim() ? String(provincia).trim() : null;
  let codigoPostalIn =
    codigoPostal != null && String(codigoPostal).trim()
      ? String(codigoPostal)
          .trim()
          .replace(/\D/g, "")
      : null;
  if (codigoPostalIn && (codigoPostalIn.length < 4 || codigoPostalIn.length > 8)) {
    codigoPostalIn = null;
  }

  const usuarioId = await resolveUsuarioCreadorParaPedidoWhatsapp(Number(tenantId));

  const nisT = nis != null && String(nis).trim() ? String(nis).trim() : null;
  const medT = medidor != null && String(medidor).trim() ? String(medidor).trim() : null;
  const nmT = nisMedidor != null && String(nisMedidor).trim() ? String(nisMedidor).trim() : null;
  const lookupKey = nmT || nisT || medT;
  const tieneIdentificadorSum = !!(nmT || nisT || medT);

  if (tieneIdentificadorSum) {
    try {
      const metaCat = await obtenerProvinciaCodigoPostalCatalogoPorIdentificador({
        tenantId: Number(tenantId),
        nis: nisT,
        medidor: medT,
        nisMedidor: nmT,
      });
      if (metaCat) {
        if (!provinciaIn && metaCat.provincia) provinciaIn = metaCat.provincia;
        if (!codigoPostalIn && metaCat.codigo_postal) {
          const d = String(metaCat.codigo_postal).replace(/\D/g, "");
          if (d.length >= 4 && d.length <= 8) codigoPostalIn = d;
        }
      }
    } catch (e) {
      console.warn("[pedido-whatsapp-bot] meta provincia/CP catálogo", e?.message || e);
    }
  }

  let distribuidorVal = null;
  let trafoVal = null;
  if (tieneIdentificadorSum && lookupKey && rubroCliente !== "municipio") {
    const lk = await lookupDistribuidorTrafoPorNisMedidor(lookupKey);
    distribuidorVal = lk.distribuidor;
    trafoVal = lk.trafo;
  }

  if (rubroCliente === "cooperativa_electrica" && tieneIdentificadorSum && (distribuidorVal || trafoVal)) {
    const cnt = await contarPedidosAbiertosMismaZona({
      tenantId: Number(tenantId),
      distribuidor: distribuidorVal,
      trafo: trafoVal,
    });
    if (cnt >= 4) {
      throw new Error(OUTAGE_SECTOR_MULTI_RECLAMO);
    }
  }

  await query(
    `INSERT INTO pedido_contador(anio, ultimo_numero)
     VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0)
     ON CONFLICT (anio) DO NOTHING`
  );
  const rCont = await query(
    `UPDATE pedido_contador
     SET ultimo_numero = ultimo_numero + 1
     WHERE anio = EXTRACT(YEAR FROM CURRENT_DATE)::INT
     RETURNING anio, ultimo_numero`
  );
  const row = rCont.rows?.[0];
  if (!row) throw new Error("contador_pedido");
  const numeroPedido = `${row.anio}-${String(row.ultimo_numero).padStart(4, "0")}`;

  const cn = String(contactName || "").trim();
  const clienteNombre =
    cn || `WhatsApp ${String(telefonoContacto || "").replace(/\D/g, "")}`.trim() || "WhatsApp";

  const pCols = await columnasPedidos();
  const hasTenant = pCols.has("tenant_id");
  const hasOrigen = pCols.has("origen_reclamo");

  const dirT =
    clienteDireccion != null && String(clienteDireccion).trim()
      ? String(clienteDireccion).trim()
      : null;

  let calleT = clienteCalle != null && String(clienteCalle).trim() ? String(clienteCalle).trim() : null;
  let numT =
    clienteNumeroPuerta != null && String(clienteNumeroPuerta).trim()
      ? String(clienteNumeroPuerta).trim()
      : null;
  let locT =
    clienteLocalidad != null && String(clienteLocalidad).trim() ? String(clienteLocalidad).trim() : null;

  if (dirT) {
    const parsed = parseDomicilioLibreArgentina(dirT, locT);
    if (parsed) {
      if (!calleT) calleT = parsed.calle;
      if (!numT && parsed.numero) numT = parsed.numero;
      if (!locT) locT = parsed.localidad;
    }
  }

  // NORMALIZACIÓN DE NOMBRES DE CALLES: corregir errores ortográficos del usuario
  let calleNormalizada = calleT;
  let normalizacionInfo = null;
  if (calleT && locT) {
    const normResult = await normalizarDireccion({ calle: calleT, ciudad: locT });
    if (normResult && normResult.cambio) {
      calleNormalizada = normResult.calleNormalizada;
      normalizacionInfo = normResult;
      console.info("[pedido-whatsapp-bot] Calle normalizada: '%s' → '%s' (confianza: %.2f)", 
        calleT, calleNormalizada, normResult.confianza);
      
      // Agregar nota sobre normalización a la descripción
      if (normResult.confianza < 1.0) {
        const notaNorm = `[Sistema] Nombre de calle corregido: "${calleT}" → "${calleNormalizada}" (confianza: ${(normResult.confianza * 100).toFixed(0)}%)`;
        de = `${de}\n\n${notaNorm}`;
      }
      
      // Usar el nombre normalizado para todo el flujo siguiente
      calleT = calleNormalizada;
    }
  }

  let latFinal = lat != null && Number.isFinite(Number(lat)) ? Number(lat) : null;
  let lngFinal = lng != null && Number.isFinite(Number(lng)) ? Number(lng) : null;
  if (
    latFinal != null &&
    lngFinal != null &&
    Math.abs(latFinal) < 1e-6 &&
    Math.abs(lngFinal) < 1e-6
  ) {
    latFinal = null;
    lngFinal = null;
  }

  /**
   * PRIORIDAD ABSOLUTA: buscar coordenadas corregidas manualmente en socios_catalogo por NIS/Medidor.
   * Si no encuentra por identificadores, intenta por dirección estructurada + nombre del titular.
   * Esto garantiza persistencia de ubicaciones corregidas por el admin para el mismo cliente.
   */
  if (!coordsValidasWgs84(latFinal, lngFinal) && (tieneIdentificadorSum || calleT || locT)) {
    try {
      const coordsPadron = await buscarCoordenadasPorNisMedidor({
        tenantId: Number(tenantId),
        nis: nisT,
        medidor: medT,
        nisMedidor: nmT,
        calle: calleT,
        numero: numT,
        localidad: locT,
        nombreCliente: String(clienteNombre || "").trim(),
      });
      if (coordsPadron && coordsValidasWgs84(coordsPadron.lat, coordsPadron.lng)) {
        latFinal = coordsPadron.lat;
        lngFinal = coordsPadron.lng;
        const notaPadron = coordsPadron.esManual
          ? "[Sistema] Ubicación corregida manualmente en pedidos anteriores del mismo cliente."
          : "[Sistema] Ubicación desde el padrón de clientes (socios_catalogo).";
        if (!de.includes(notaPadron)) {
          de = `${de}\n\n${notaPadron}`;
        }
      }
    } catch (e) {
      console.warn("[pedido-whatsapp-bot] buscar coords por NIS/Medidor/dirección", e?.message || e);
    }
  }

  /**
   * WhatsApp: sin Nominatim en creación (502/CORS). Padrón + vecinos SQL + localidad + sede.
   * Si hay NIS/medidor o calle+localidad y aún no hay GPS válido, se fuerza ubicación interna.
   */
  const debeGarantizarUbicacion =
    !coordsValidasWgs84(latFinal, lngFinal) &&
    (tieneIdentificadorSum || (calleT && locT));

  if (debeGarantizarUbicacion) {
    try {
      const g = await resolverGeolocalizacionGarantizadaWhatsapp({
        tenantId: Number(tenantId),
        entradaLat: latFinal,
        entradaLng: lngFinal,
        catalogoCalle: calleT,
        catalogoNumero: numT,
        catalogoLocalidad: locT,
        excludeNisMedidor: lookupKey || null,
        identificadoPorPadron: tieneIdentificadorSum,
      });
      if (coordsValidasWgs84(g.lat, g.lng)) {
        latFinal = g.lat;
        lngFinal = g.lng;
        const n = g.nota != null ? String(g.nota).trim() : "";
        if (n && !de.includes(n)) {
          de = `${de}\n\n${n}`;
        }
      }
    } catch (e) {
      console.warn("[pedido-whatsapp-bot] geolocalizacion garantizada", e?.message || e);
    }
  }

  if (tieneIdentificadorSum && !coordsValidasWgs84(latFinal, lngFinal)) {
    try {
      const g2 = await resolverGeolocalizacionGarantizadaWhatsapp({
        tenantId: Number(tenantId),
        entradaLat: null,
        entradaLng: null,
        catalogoCalle: calleT,
        catalogoNumero: numT,
        catalogoLocalidad: locT,
        excludeNisMedidor: lookupKey || null,
        identificadoPorPadron: true,
      });
      if (coordsValidasWgs84(g2.lat, g2.lng)) {
        latFinal = g2.lat;
        lngFinal = g2.lng;
        const n2 = g2.nota != null ? String(g2.nota).trim() : "";
        if (n2 && !de.includes(n2)) {
          de = `${de}\n\n${n2}`;
        }
      }
    } catch (e) {
      console.warn("[pedido-whatsapp-bot] geolocalizacion garantizada refuerzo", e?.message || e);
    }
  }

  if (!coordsValidasWgs84(latFinal, lngFinal)) {
    try {
      const gFin = await resolverGeolocalizacionGarantizadaWhatsapp({
        tenantId: Number(tenantId),
        entradaLat: null,
        entradaLng: null,
        catalogoCalle: calleT,
        catalogoNumero: numT,
        catalogoLocalidad: locT,
        excludeNisMedidor: lookupKey || null,
        identificadoPorPadron: !!tieneIdentificadorSum,
      });
      if (coordsValidasWgs84(gFin.lat, gFin.lng)) {
        latFinal = gFin.lat;
        lngFinal = gFin.lng;
        const nFin = gFin.nota != null ? String(gFin.nota).trim() : "";
        if (nFin && !de.includes(nFin)) {
          de = `${de}\n\n${nFin}`;
        }
      }
    } catch (e) {
      console.warn("[pedido-whatsapp-bot] geolocalizacion ultimo recurso", e?.message || e);
    }
  }

  /**
   * FALLBACK ADICIONAL: Interpolación de alturas (address interpolation)
   * Si todavía no hay coordenadas válidas, pero tenemos calle, número y localidad,
   * intentar calcular la posición interpolando sobre la geometría de la calle.
   */
  if (!coordsValidasWgs84(latFinal, lngFinal) && calleT && numT && locT) {
    console.info("[pedido-whatsapp-bot] Intentando interpolación de alturas como último recurso");
    try {
      const interpol = await interpolarCoordenadaPorAltura({
        calle: calleT,
        numero: numT,
        localidad: locT,
        provincia: provinciaIn || undefined,
      });
      
      if (interpol) {
        // Agregar logs del algoritmo a la descripción para diagnóstico visible
        if (interpol.log && interpol.log.length > 0) {
          const logSection = "\n\n━━━ DIAGNÓSTICO DE GEOCODIFICACIÓN ━━━\n" + 
            interpol.log.join("\n") + 
            "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
          de = `${de}${logSection}`;
        }
        
        if (coordsValidasWgs84(interpol.lat, interpol.lng)) {
          latFinal = interpol.lat;
          lngFinal = interpol.lng;
          const notaInterpol = `[Sistema] Ubicación calculada por interpolación de alturas (${interpol.metadata?.lado || "aproximado"}). Verificar en el mapa.`;
          if (!de.includes(notaInterpol)) {
            de = `${notaInterpol}\n\n${de}`;
          }
          console.info("[pedido-whatsapp-bot] ✓ Interpolación de alturas exitosa: lat=%s, lng=%s", 
            latFinal.toFixed(6), lngFinal.toFixed(6));
        } else {
          // Interpolación falló, logs agregados a descripción para diagnóstico
          console.warn("[pedido-whatsapp-bot] Interpolación no retornó coordenadas válidas");
        }
      }
    } catch (e) {
      console.warn("[pedido-whatsapp-bot] interpolacion de alturas", e?.message || e);
      de = `${de}\n\n[Sistema] Error en interpolación: ${e?.message || "desconocido"}`;
    }
  }

  let coordsWhatsappParaCatalogo = null;
  if (
    coordsValidasWgs84(latFinal, lngFinal) &&
    !esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp(latFinal, lngFinal)
  ) {
    coordsWhatsappParaCatalogo = { lat: latFinal, lng: lngFinal };
  }

  if (!coordsValidasWgs84(latFinal, lngFinal)) {
    latFinal = -34.6037;
    lngFinal = -58.3816;
  }

  const cols = [
    "numero_pedido",
    "distribuidor",
    "cliente",
    "tipo_trabajo",
    "descripcion",
    "prioridad",
    "estado",
    "avance",
    "lat",
    "lng",
    "fecha_creacion",
    "telefono_contacto",
    "cliente_nombre",
  ];
  const vals = [
    numeroPedido,
    distribuidorVal,
    null,
    tt,
    de,
    prioridadPredeterminadaPorTipoTrabajo(tt),
    "Pendiente",
    0,
    latFinal,
    lngFinal,
    new Date(),
    telefonoContacto || null,
    clienteNombre,
  ];

  if (pCols.has("usuario_id")) {
    cols.push("usuario_id");
    vals.push(usuarioId);
  }
  if (pCols.has("usuario_creador_id")) {
    cols.push("usuario_creador_id");
    vals.push(usuarioId);
  }

  if (pCols.has("trafo")) {
    cols.push("trafo");
    vals.push(trafoVal);
  }

  if (pCols.has("nis") && nisT) {
    cols.push("nis");
    vals.push(nisT);
  }
  if (pCols.has("medidor") && medT) {
    cols.push("medidor");
    vals.push(medT);
  }
  if (pCols.has("nis_medidor") && nmT) {
    cols.push("nis_medidor");
    vals.push(nmT);
  }

  if (pCols.has("cliente_direccion") && dirT) {
    cols.push("cliente_direccion");
    vals.push(dirT);
  }

  if (pCols.has("cliente_calle") && calleT) {
    cols.push("cliente_calle");
    vals.push(calleT);
  }
  if (pCols.has("cliente_numero_puerta") && numT) {
    cols.push("cliente_numero_puerta");
    vals.push(numT);
  }
  if (pCols.has("cliente_localidad") && locT) {
    cols.push("cliente_localidad");
    vals.push(locT);
  }

  const provT = provinciaIn;
  const cpOk = codigoPostalIn && codigoPostalIn.length >= 4 && codigoPostalIn.length <= 8 ? codigoPostalIn : null;
  if (pCols.has("provincia") && provT) {
    cols.push("provincia");
    vals.push(provT);
  }
  if (pCols.has("codigo_postal") && cpOk) {
    cols.push("codigo_postal");
    vals.push(cpOk);
  }

  const stc =
    suministroTipoConexion != null && String(suministroTipoConexion).trim()
      ? String(suministroTipoConexion).trim()
      : null;
  const sfa =
    suministroFases != null && String(suministroFases).trim()
      ? String(suministroFases).trim()
      : null;
  if (pCols.has("suministro_tipo_conexion") && stc) {
    cols.push("suministro_tipo_conexion");
    vals.push(stc);
  }
  if (pCols.has("suministro_fases") && sfa) {
    cols.push("suministro_fases");
    vals.push(sfa);
  }

  const barrioT =
    rubroCliente === "municipio" && barrio != null && String(barrio).trim()
      ? String(barrio).trim().slice(0, 200)
      : null;
  if (pCols.has("barrio") && barrioT) {
    cols.push("barrio");
    vals.push(barrioT);
  }

  if (hasTenant) {
    cols.push("tenant_id");
    vals.push(Number(tenantId));
  }
  if (hasOrigen) {
    cols.push("origen_reclamo");
    vals.push("whatsapp");
  }

  const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
  const insert = await query(
    `INSERT INTO pedidos (${cols.join(", ")}) VALUES (${ph}) RETURNING *`,
    vals
  );
  const pedidoRow = insert.rows[0];
  setImmediate(() => {
    notificarAdminsNuevoPedidoWhatsappSafe(Number(tenantId), pedidoRow).catch(() => {});
    if (coordsWhatsappParaCatalogo) {
      enriquecerSociosCatalogoCoordsDesdePedidoWhatsapp({
        pedido: pedidoRow,
        tenantId: Number(tenantId),
        lat: coordsWhatsappParaCatalogo.lat,
        lng: coordsWhatsappParaCatalogo.lng,
      }).catch((e) => console.warn("[pedido-whatsapp-bot] socios_catalogo WA", e?.message || e));
    }
    regeocodificarPedido(Number(pedidoRow.id), Number(tenantId), {})
      .then((res) => notificarAdminsRegeoPedidoWhatsappSafe(Number(tenantId), pedidoRow, res))
      .catch((e) => console.warn("[pedido-whatsapp-bot] regeo automático", e?.message || e));
  });
  return pedidoRow;
}

const REGEO_NOTIF_PREFIX = "GN_REGEO_LOG_V1\n";

/** Notificación solo para admins: log de re-geocodificación automática (no bloquea al usuario de WhatsApp). */
async function notificarAdminsRegeoPedidoWhatsappSafe(tenantId, pedido, resultado) {
  if (!pedido?.id || !resultado) return;
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'notificaciones_movil' LIMIT 1`
    );
    if (!t.rows.length) return;

    const colSet = await columnasUsuarios();
    const hasTenant = colSet.has("tenant_id");
    const hasCliente = colSet.has("cliente_id");
    const col = hasTenant ? "tenant_id" : hasCliente ? "cliente_id" : null;
    if (!col) return;

    let admins = await query(
      `SELECT id FROM usuarios
       WHERE ${col} = $1 AND activo = TRUE
         AND (
           LOWER(COALESCE(rol::text, '')) = 'admin'
           OR LOWER(COALESCE(rol::text, '')) = 'administrador'
         )`,
      [tenantId]
    );
    let recipients = admins.rows || [];
    if (!recipients.length) {
      const anyU = await query(
        `SELECT id FROM usuarios WHERE ${col} = $1 AND activo = TRUE ORDER BY id ASC`,
        [tenantId]
      );
      recipients = anyU.rows || [];
    }
    if (!recipients.length) return;

    const payload = {
      success: !!resultado.success,
      fuente: resultado.fuente || null,
      mensaje: resultado.mensaje || null,
      log: Array.isArray(resultado.log) ? resultado.log.slice(0, 220) : [],
      np: pedido.numero_pedido || null,
    };
    let cuerpo = `${REGEO_NOTIF_PREFIX}${JSON.stringify(payload)}`;
    const maxC = 14000;
    if (cuerpo.length > maxC) {
      cuerpo = `${cuerpo.slice(0, maxC - 40)}\n…[truncado]`;
    }
    const titulo = resultado.success
      ? `Re-geocodificación automática · #${pedido.numero_pedido || pedido.id}`
      : `Re-geocodificación automática · #${pedido.numero_pedido || pedido.id} (revisar)`;
    for (const a of recipients) {
      await query(
        `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [a.id, pedido.id, titulo, cuerpo]
      );
    }
  } catch (e) {
    console.warn("[pedido-whatsapp-bot] notif regeo", e?.message || e);
  }
}

/**
 * Inserta filas en notificaciones_movil para admins del tenant (app móvil / panel que las lea).
 * El front web en GitHub Pages suele refrescar pedidos vía polling; este hook acelera avisos en clientes que consuman la tabla.
 */
async function notificarAdminsNuevoPedidoWhatsappSafe(tenantId, pedido) {
  if (!pedido?.id) return;
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'notificaciones_movil' LIMIT 1`
    );
    if (!t.rows.length) return;

    const colSet = await columnasUsuarios();
    const hasTenant = colSet.has("tenant_id");
    const hasCliente = colSet.has("cliente_id");
    const col = hasTenant ? "tenant_id" : hasCliente ? "cliente_id" : null;
    if (!col) return;

    let admins = await query(
      `SELECT id FROM usuarios
       WHERE ${col} = $1 AND activo = TRUE
         AND (
           LOWER(COALESCE(rol::text, '')) = 'admin'
           OR LOWER(COALESCE(rol::text, '')) = 'administrador'
         )`,
      [tenantId]
    );
    let recipients = admins.rows || [];
    if (!recipients.length) {
      const anyU = await query(
        `SELECT id FROM usuarios WHERE ${col} = $1 AND activo = TRUE ORDER BY id ASC`,
        [tenantId]
      );
      recipients = anyU.rows || [];
    }
    if (!recipients.length) {
      console.warn("[pedido-whatsapp-bot] notificaciones_movil: sin usuarios activos para tenant", tenantId);
      return;
    }
    const titulo = "Nuevo reclamo (WhatsApp)";
    const cuerpo = `Se registró el reclamo *${pedido.numero_pedido}* desde WhatsApp.`;
    for (const a of recipients) {
      await query(
        `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [a.id, pedido.id, titulo, cuerpo]
      );
    }
    console.log("[pedido-whatsapp-bot] notificaciones_movil", {
      tenantId,
      pedidoId: pedido.id,
      numero: pedido.numero_pedido,
      destinatarios: recipients.length,
    });
  } catch (e) {
    console.error("[pedido-whatsapp-bot] notificar admins", e?.message || e);
  }
}
