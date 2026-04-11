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
import { parseDomicilioLibreArgentina, separarNumeroDuplicadoEnCalle } from "../utils/parseDomicilioArg.js";
import {
  coordsValidasWgs84,
  parseCoordLoose,
  parLatLngPasaCheckWhatsappDb,
  FALLBACK_WGS84_ARGENTINA,
} from "./whatsappGeolocalizacionGarantizada.js";
import {
  enriquecerSociosCatalogoCoordsDesdePedidoWhatsapp,
  esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp,
} from "../utils/sociosCatalogoCoordsFromPedido.js";
import { obtenerProvinciaCodigoPostalCatalogoPorIdentificador } from "./buscarCoordenadasPorNisMedidor.js";
import { resolverCoordenadasCandidatoWhatsapp } from "./pipelineGeocodificacionPedido.js";
import {
  buildTelemetriaForCorrelation,
  geocodWaOperacionFinishOk,
} from "./geocodWaOperaciones.js";

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

/** Persiste en BD el log de regeo automático (WhatsApp) para el panel admin; no falla si la columna no existe aún. */
export async function persistirGeocodeLogWhatsappEnPedido(pedidoId, tenantId, resultado) {
  if (!pedidoId || !Number.isFinite(Number(pedidoId)) || !resultado) return;
  try {
    const chk = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'geocode_log_whatsapp'
       LIMIT 1`
    );
    if (!chk.rows?.length) return;
    const pin_ok =
      !!resultado.success &&
      coordsValidasWgs84(resultado.lat, resultado.lng);
    const payload = {
      at: new Date().toISOString(),
      success: !!resultado.success,
      pin_ok,
      pipeline: resultado.pipeline || null,
      fuente: resultado.fuente || null,
      fuente_final: resultado.fuente_final != null ? resultado.fuente_final : resultado.fuente || null,
      mensaje: resultado.mensaje || null,
      lat: resultado.lat != null ? Number(resultado.lat) : null,
      lng: resultado.lng != null ? Number(resultado.lng) : null,
      log: (Array.isArray(resultado._logLines) ? resultado._logLines : resultado.log || []).slice(0, 500),
      pasos: Array.isArray(resultado.pasos) ? resultado.pasos.slice(0, 400) : undefined,
      errores: Array.isArray(resultado.errores) ? resultado.errores.slice(0, 80) : undefined,
      warnings: Array.isArray(resultado.warnings) ? resultado.warnings.slice(0, 40) : undefined,
      geocoding_audit: resultado.geocoding_audit || resultado.geocodingAudit || null,
    };
    await query(
      `UPDATE pedidos SET geocode_log_whatsapp = $1::jsonb WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(payload), pedidoId, tenantId]
    );
  } catch (e) {
    console.warn("[pedido-whatsapp-bot] geocode_log_whatsapp UPDATE", e?.message || e);
  }
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
  correlationId,
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

  if (calleT) {
    const sp = separarNumeroDuplicadoEnCalle(calleT, numT);
    if (sp.stripped) {
      calleT = sp.calle;
      if (!numT && sp.numero) numT = sp.numero;
    }
  }

  const telemetria = correlationId ? buildTelemetriaForCorrelation(correlationId) : null;
  if (telemetria?.recordPaso) {
    await telemetria.recordPaso({
      slug: "antes_resolver_pipeline",
      t: new Date().toISOString(),
      detail: "inicio geocodificación pre-INSERT",
    });
  }
  const geoRes = await resolverCoordenadasCandidatoWhatsapp(
    {
      cliente_calle: calleT,
      cliente_numero_puerta: numT,
      cliente_localidad: locT,
      provincia: provinciaIn,
      codigo_postal: codigoPostalIn,
      cliente_nombre: clienteNombre,
      nis: nisT,
      medidor: medT,
      nis_medidor: nmT,
      lat,
      lng,
    },
    tenantId,
    { telemetria }
  );
  if (!geoRes.success || !coordsValidasWgs84(geoRes.lat, geoRes.lng)) {
    throw new Error("whatsapp_geocod_fallo");
  }
  let latFinal = parseCoordLoose(geoRes.lat);
  let lngFinal = parseCoordLoose(geoRes.lng);
  if (!parLatLngPasaCheckWhatsappDb(latFinal, lngFinal)) {
    try {
      console.error(
        JSON.stringify({
          evt: "whatsapp_pedido_coords_coercion_pre_insert",
          tenantId: Number(tenantId),
          rawLat: geoRes.lat,
          rawLng: geoRes.lng,
          parsedLat: latFinal,
          parsedLng: lngFinal,
        })
      );
    } catch (_) {}
    latFinal = FALLBACK_WGS84_ARGENTINA.lat;
    lngFinal = FALLBACK_WGS84_ARGENTINA.lng;
  }

  const provTMerge =
    (geoRes.provincia_persistencia != null && String(geoRes.provincia_persistencia).trim()) ||
    (provinciaIn != null && String(provinciaIn).trim()) ||
    null;
  const cpFromGeo = geoRes.codigo_postal_persistencia;
  const cpMerge =
    cpFromGeo && String(cpFromGeo).replace(/\D/g, "").length >= 4 && String(cpFromGeo).replace(/\D/g, "").length <= 8
      ? String(cpFromGeo).replace(/\D/g, "")
      : codigoPostalIn && codigoPostalIn.length >= 4 && codigoPostalIn.length <= 8
        ? codigoPostalIn
        : null;

  let coordsWhatsappParaCatalogo = null;
  if (
    coordsValidasWgs84(latFinal, lngFinal) &&
    !esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp(latFinal, lngFinal)
  ) {
    coordsWhatsappParaCatalogo = { lat: latFinal, lng: lngFinal };
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

  const provT = provTMerge;
  const cpOk = cpMerge;
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

  if (pCols.has("geocoding_audit") && geoRes.geocoding_audit) {
    cols.push("geocoding_audit");
    vals.push(JSON.stringify(geoRes.geocoding_audit));
  }
  if (pCols.has("geocode_log_whatsapp")) {
    cols.push("geocode_log_whatsapp");
    vals.push(
      JSON.stringify({
        at: new Date().toISOString(),
        pipeline: "pre_insert",
        success: true,
        pin_ok: parLatLngPasaCheckWhatsappDb(latFinal, lngFinal),
        fuente: geoRes.fuente_final || geoRes.fuente || null,
        fuente_final: geoRes.fuente_final || geoRes.fuente || null,
        mensaje: null,
        lat: latFinal,
        lng: lngFinal,
        log: (geoRes.log || []).slice(0, 500),
        pasos: (geoRes.pasos || []).slice(0, 400),
        errores: geoRes.errores || [],
        geocoding_audit: geoRes.geocoding_audit || null,
      })
    );
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
  let insert;
  try {
    insert = await query(`INSERT INTO pedidos (${cols.join(", ")}) VALUES (${ph}) RETURNING *`, vals);
  } catch (insertErr) {
    try {
      console.error(
        JSON.stringify({
          evt: "pedido_wa_insert_error",
          tenantId: Number(tenantId),
          origen_reclamo: hasOrigen ? "whatsapp" : "(sin columna)",
          lat: latFinal,
          lng: lngFinal,
          code: insertErr?.code,
          message: String(insertErr?.message || insertErr).slice(0, 800),
        })
      );
    } catch (_) {}
    throw insertErr;
  }
  const pedidoRow = insert.rows[0];
  if (correlationId) {
    await geocodWaOperacionFinishOk(correlationId, {
      pedidoId: pedidoRow.id,
      numeroPedido: pedidoRow.numero_pedido,
      fuente: geoRes.fuente_final || geoRes.fuente,
    });
  }
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
  });
  return pedidoRow;
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
