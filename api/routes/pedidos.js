import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { tenantBusinessFilter } from "../middleware/tenantBusinessFilter.js";
import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn, usuariosTenantColumnName, tableHasColumn } from "../utils/tenantScope.js";
import {
  pushPedidoBusinessFilter,
  pushPedidoBusinessFilterRelaxed,
  rubroEfectivoParaTipos,
  pedidosHasBusinessTypeColumn,
} from "../utils/businessScope.js";
import { parseFotosBase64, splitUrls, toJoinedUrls } from "../utils/helpers.js";
import { uploadManyBase64 } from "../services/cloudinary.js";
import { getUserTenantId } from "../utils/tenantUser.js";
import {
  tipoTrabajoPermitidoParaNuevoPedido,
  tiposReclamoParaClienteTipo,
  normalizarPrioridadPedido,
  TIPOS_SOLICITUD_DERIVACION_TERCERO_COOP_ELECTRICA,
} from "../services/tiposReclamo.js";
import {
  notifyPedidoCierreWhatsAppSafe,
  notifyPedidoClienteActualizacionWhatsAppSafe,
  notifyPedidoAltaClienteWhatsAppSafe,
  notifyPedidoDerivacionClienteWhatsAppSafe,
  sendTenantWhatsAppText,
} from "../services/whatsappService.js";
import { normalizeWhatsAppRecipientForMeta } from "../services/metaWhatsapp.js";
import {
  enqueueNotificacionPedidoCerradoParaTecnico,
  enqueueNotificacionSolicitudDerivacionParaAdmins,
} from "../services/notificacionesMovilEnqueue.js";
import {
  lookupDistribuidorTrafoPorNisMedidor,
  contarPedidosAbiertosMismaZona,
  OUTAGE_SECTOR_MULTI_RECLAMO,
} from "../services/pedidoZonaOutage.js";
import { buildClientesAfectadosPayload, insertClientesAfectadosLog } from "../services/clientesAfectadosLog.js";
import { registerPedidoOperativaRoutes } from "./pedidoOperativa.js";
import {
  derivacionReclamosDesdeConfig,
  resolverContactoDerivacion,
  buildDerivacionExternaMensaje,
  etiquetaDestinoDerivacion,
} from "../utils/derivacionReclamos.js";
import {
  humanChatOpenOrGetSession,
  humanChatAppendOutbound,
  humanChatActivateSession,
} from "../services/whatsappHumanChat.js";
import { actualizarSociosCatalogoCoordsSiMatchPedido } from "../utils/sociosCatalogoCoordsFromPedido.js";
import { regeocodificarPedido } from "../services/regeocodificarPedido.js";
import { getTenantProvinciaNominatim } from "../services/tenantProvincia.js";
import { upsertCorreccionOperadorDesdePedido } from "../services/correccionesDirecciones.js";

const router = express.Router();
router.use(authWithTenantHost);
router.use(tenantBusinessFilter);

const MAX_OBSERVACIONES_DERIVACION_API = 2000;

async function assertPedidoMismoTenant(pedido, req) {
  if (!(await pedidosTableHasTenantIdColumn())) return;
  if (pedido.tenant_id == null) return;
  if (Number(pedido.tenant_id) !== Number(req.tenantId)) {
    const e = new Error("Sin permiso para este pedido");
    e.statusCode = 403;
    throw e;
  }
}

async function loadNombreCliente(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid)) return "GestorNova";
  const r = await query(`SELECT nombre FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
  return String(r.rows?.[0]?.nombre || "GestorNova").trim() || "GestorNova";
}

function parseClienteConfigJson(raw) {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Neon puede devolver NUMERIC como string; la app Android (Gson) espera números JSON para lat/lng. */
function coercePedidoLatLng(row) {
  if (!row || typeof row !== "object") return row;
  const o = { ...row };
  if ((o.lat == null || o.lat === "") && o.latitud != null && o.latitud !== "") {
    o.lat = o.latitud;
  }
  if ((o.lng == null || o.lng === "") && o.longitud != null && o.longitud !== "") {
    o.lng = o.longitud;
  }
  for (const key of ["lat", "lng"]) {
    const v = o[key];
    if (v == null || v === "") {
      o[key] = null;
      continue;
    }
    const n = typeof v === "number" ? v : parseFloat(String(v).trim().replace(",", "."));
    o[key] = Number.isFinite(n) ? n : null;
  }
  return o;
}

function scheduleNotifyAltaReclamoWhatsApp(row, userId) {
  const phone = String(row.telefono_contacto || "").replace(/\D/g, "");
  if (!phone || phone.length < 8) return;
  setImmediate(() => {
    (async () => {
      try {
        const tenantId =
          row.tenant_id != null && Number.isFinite(Number(row.tenant_id))
            ? Number(row.tenant_id)
            : await getUserTenantId(userId);
        const nombreEntidad = await loadNombreCliente(tenantId);
        await notifyPedidoAltaClienteWhatsAppSafe({
          tenantId,
          numeroPedido: row.numero_pedido,
          nombreEntidad,
          telefonoContactoRaw: row.telefono_contacto,
          pedidoId: row.id,
          descripcion: row.descripcion,
          tipoTrabajo: row.tipo_trabajo,
        });
      } catch (e) {
        console.error("[pedidos] notify alta reclamo WA (no bloqueante)", e.message);
      }
    })();
  });
}

async function notifyCierreWhatsAppAfterPut(row, bodyTelefono, userId) {
  try {
    const tenantId =
      row.tenant_id != null && Number.isFinite(Number(row.tenant_id))
        ? Number(row.tenant_id)
        : await getUserTenantId(userId);
    const nombreEntidad = await loadNombreCliente(tenantId);
    const phone = bodyTelefono !== undefined && bodyTelefono !== null ? bodyTelefono : row.telefono_contacto;
    return await notifyPedidoCierreWhatsAppSafe({
      tenantId,
      numeroPedido: row.numero_pedido,
      nombreEntidad,
      telefonoContactoRaw: phone,
      pedidoId: row.id,
    });
  } catch (e) {
    console.error("[pedidos] notify cierre WA", e.message);
    return { sent: false, skipped: false, error: e.message };
  }
}

/** Avisar al cliente (tel. del pedido) cuando el técnico o admin pasa a ejecución o actualiza avance. */
function scheduleNotifyClientePedidoWhatsapp({
  pedidoAntes,
  pedidoDespues,
  body,
  userId,
  estadoAntes,
}) {
  const phoneRaw =
    pedidoDespues.telefono_contacto != null && pedidoDespues.telefono_contacto !== ""
      ? pedidoDespues.telefono_contacto
      : pedidoAntes.telefono_contacto;
  const phone = String(phoneRaw || "").replace(/\D/g, "");
  if (!phone || phone.length < 8) return;

  const estadoNuevo = String(pedidoDespues.estado || "");
  const becameEjecucion = estadoNuevo === "En ejecución" && estadoAntes !== "En ejecución";

  const avanceExplicit = body?.avance !== undefined && body?.avance !== null;
  const avAnt = Number(pedidoAntes.avance ?? 0);
  const avNue = Number(pedidoDespues.avance ?? 0);
  const avanceChanged = avanceExplicit && avAnt !== avNue;
  const estadoPermiteAvance = estadoNuevo === "En ejecución" || estadoNuevo === "Asignado";

  setImmediate(() => {
    (async () => {
      try {
        const tenantId =
          pedidoAntes.tenant_id != null && Number.isFinite(Number(pedidoAntes.tenant_id))
            ? Number(pedidoAntes.tenant_id)
            : await getUserTenantId(userId);
        const nombreEntidad = await loadNombreCliente(tenantId);

        if (becameEjecucion) {
          await notifyPedidoClienteActualizacionWhatsAppSafe({
            tenantId,
            numeroPedido: pedidoDespues.numero_pedido,
            nombreEntidad,
            telefonoContactoRaw: phoneRaw,
            pedidoId: pedidoDespues.id,
            tipo: "en_ejecucion",
          });
        }
        if (avanceChanged && estadoPermiteAvance) {
          const snippet =
            pedidoDespues.trabajo_realizado != null
              ? String(pedidoDespues.trabajo_realizado)
              : body?.trabajo_realizado != null
                ? String(body.trabajo_realizado)
                : null;
          await notifyPedidoClienteActualizacionWhatsAppSafe({
            tenantId,
            numeroPedido: pedidoDespues.numero_pedido,
            nombreEntidad,
            telefonoContactoRaw: phoneRaw,
            pedidoId: pedidoDespues.id,
            tipo: "avance",
            avancePct: pedidoDespues.avance,
            trabajoRealizadoSnippet: snippet,
          });
        }
      } catch (e) {
        console.error("[pedidos] notify cliente WA pedido (no bloqueante)", e.message);
      }
    })();
  });
}

async function getPedidoInTenant(id, req) {
  const tenantId = req.tenantId;
  // Acceso por id: solo aislamiento por tenant. El filtro por línea de negocio (business_type)
  // aplica a listados; si no, PUT/derivar devuelven 404 cuando el pedido tiene otra línea que la activa en UI.
  if (await pedidosTableHasTenantIdColumn()) {
    const params = [id, tenantId];
    const r = await query(
      `SELECT * FROM pedidos WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL) LIMIT 1`,
      params
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.tenant_id != null && Number(row.tenant_id) !== Number(tenantId)) {
      return null;
    }
    return row;
  }
  const params = [id];
  const r = await query(`SELECT * FROM pedidos WHERE id = $1 LIMIT 1`, params);
  return r.rows[0] || null;
}

router.post("/", async (req, res) => {
  try {
    const {
      cliente,
      cliente_nombre,
      cliente_calle,
      cliente_localidad,
      cliente_numero_puerta,
      cliente_direccion,
      tipo_trabajo,
      descripcion,
      prioridad,
      lat,
      lng,
      telefono_contacto,
      nis,
      medidor,
      suministro_tipo_conexion,
      suministro_fases,
      distribuidor: distribuidorBodyRaw,
      barrio: barrioBodyRaw,
    } = req.body;

    const tenantId = req.tenantId;
    await query(`SELECT 1 FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
    const rubro = rubroEfectivoParaTipos(req);
    const barrioBody = String(barrioBodyRaw || "").trim() || null;
    const distribuidorBody = String(distribuidorBodyRaw || "").trim() || null;
    const tt = String(tipo_trabajo || "").trim();
    if (!tt) {
      return res.status(400).json({ error: "tipo_trabajo es requerido" });
    }
    if (!tipoTrabajoPermitidoParaNuevoPedido(tt, rubro)) {
      return res.status(400).json({
        error: "tipo_trabajo no permitido para el rubro del cliente",
        tipos_permitidos: tiposReclamoParaClienteTipo(rubro),
      });
    }

    const prioridadFinal = normalizarPrioridadPedido(prioridad, tt);

    const nisK = String(nis || "").trim();
    const medK = String(medidor || "").trim();
    const tieneNisOMedidor = !!(nisK || medK);
    let distribuidorFinal = null;
    let trafoFinal = null;
    let barrioFinal = null;

    if (tieneNisOMedidor) {
      const lk = await lookupDistribuidorTrafoPorNisMedidor(nisK || medK);
      if (rubro === "municipio") {
        barrioFinal = barrioBody || distribuidorBody || lk.distribuidor || null;
        distribuidorFinal = null;
        trafoFinal = null;
      } else if (rubro === "cooperativa_agua") {
        distribuidorFinal = distribuidorBody || lk.distribuidor || null;
        trafoFinal = null;
      } else {
        distribuidorFinal = lk.distribuidor;
        trafoFinal = lk.trafo;
      }
    } else if (rubro === "municipio") {
      barrioFinal = barrioBody || distribuidorBody || null;
    } else {
      distribuidorFinal = distribuidorBody || null;
    }

    if (rubro === "cooperativa_electrica" && tieneNisOMedidor && (distribuidorFinal || trafoFinal)) {
      const cnt = await contarPedidosAbiertosMismaZona({
        tenantId,
        distribuidor: distribuidorFinal,
        trafo: trafoFinal,
        activeBusinessType: req.activeBusinessType,
        businessTypeFilterEnabled: req.businessTypeFilterEnabled,
      });
      if (cnt >= 4) {
        return res.status(409).json({
          error: "corte_zona_probable",
          code: OUTAGE_SECTOR_MULTI_RECLAMO,
          mensaje:
            "Hay varios reclamos abiertos en la misma zona en las últimas horas; podría tratarse de un corte de sector o general. Contactá a la cooperativa antes de registrar otro reclamo.",
        });
      }
    }

    const fotosB64 = parseFotosBase64(req.body);
    let fotoUrls = [];
    if (fotosB64.length) fotoUrls = await uploadManyBase64(fotosB64);

    const rYear = await query(
      `INSERT INTO pedido_contador(anio, ultimo_numero)
       VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0)
       ON CONFLICT (anio) DO NOTHING
       RETURNING anio`
    );
    void rYear;
    const rCont = await query(
      `UPDATE pedido_contador
       SET ultimo_numero = ultimo_numero + 1
       WHERE anio = EXTRACT(YEAR FROM CURRENT_DATE)::INT
       RETURNING anio, ultimo_numero`
    );
    const numeroPedido = `${rCont.rows[0].anio}-${String(rCont.rows[0].ultimo_numero).padStart(4, "0")}`;

    const stc = String(suministro_tipo_conexion || "").trim() || null;
    const sfa = String(suministro_fases || "").trim() || null;

    const provinciaDefault = await getTenantProvinciaNominatim(tenantId);

    const hasTIns = await pedidosTableHasTenantIdColumn();
    const hasBtIns = await pedidosHasBusinessTypeColumn();
    const insertParams = [
      numeroPedido,
      distribuidorFinal,
      trafoFinal,
      cliente || null,
      tipo_trabajo || null,
      descripcion || null,
      prioridadFinal,
      lat ?? null,
      lng ?? null,
      req.user.id,
      telefono_contacto || null,
      cliente_nombre || cliente || null,
      toJoinedUrls(fotoUrls) || null,
      nis || null,
      medidor || null,
      cliente_calle ?? null,
      cliente_localidad ?? null,
      provinciaDefault ?? null,
      cliente_numero_puerta ?? null,
      cliente_direccion ?? null,
      stc,
      sfa,
      barrioFinal,
    ];
    if (hasTIns) insertParams.push(tenantId);
    if (hasBtIns) insertParams.push(req.activeBusinessType || "electricidad");
    const insert = await query(
      `INSERT INTO pedidos (
        numero_pedido, distribuidor, trafo, cliente, tipo_trabajo, descripcion, prioridad,
        estado, avance, lat, lng, usuario_id, usuario_creador_id, fecha_creacion,
        telefono_contacto, cliente_nombre, foto_urls, nis, medidor,
        cliente_calle, cliente_localidad, provincia, cliente_numero_puerta, cliente_direccion,
        suministro_tipo_conexion, suministro_fases, barrio${hasTIns ? ", tenant_id" : ""}${hasBtIns ? ", business_type" : ""}
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        'Pendiente',0,$8,$9,$10,$10,NOW(),
        $11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,
        $21,$22,$23${hasTIns ? ",$24" : ""}${hasBtIns ? `,$${hasTIns ? 25 : 24}` : ""}
      ) RETURNING *`,
      insertParams
    );
    const created = insert.rows[0];
    scheduleNotifyAltaReclamoWhatsApp(created, req.user.id);
    return res.status(201).json(coercePedidoLatLng(created));
  } catch (error) {
    return res.status(500).json({ error: "No se pudo crear el pedido", detail: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { estado, limit = 300 } = req.query;
    const params = [];
    const where = [];
    if (await pedidosTableHasTenantIdColumn()) {
      params.push(req.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (estado) {
      params.push(estado);
      where.push(`estado = $${params.length}`);
    }
    if (req.user.rol !== "admin") {
      params.push(req.user.id);
      where.push(`(tecnico_asignado_id = $${params.length} OR usuario_id = $${params.length})`);
    }
    {
      const bt = await pushPedidoBusinessFilter(req, params);
      if (bt) where.push(bt.replace(/^\s*AND\s+/i, "").trim());
    }
    params.push(Number(limit));
    const sql = `
      SELECT * FROM pedidos
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY fecha_creacion DESC
      LIMIT $${params.length}
    `;
    const r = await query(sql, params);
    const rows = r.rows.map((p) => ({ ...coercePedidoLatLng(p), fotos: splitUrls(p.foto_urls) }));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: "No se pudieron listar pedidos", detail: error.message });
  }
});

router.get("/mis-pedidos", async (req, res) => {
  try {
    const hasT = await pedidosTableHasTenantIdColumn();
    const params = hasT ? [req.user.id, req.tenantId] : [req.user.id];
    const bt = await pushPedidoBusinessFilter(req, params);
    const r = await query(
      hasT
        ? `SELECT * FROM pedidos
       WHERE (tecnico_asignado_id = $1 OR usuario_id = $1) AND tenant_id = $2${bt}
       ORDER BY fecha_creacion DESC
       LIMIT 500`
        : `SELECT * FROM pedidos
       WHERE (tecnico_asignado_id = $1 OR usuario_id = $1)${bt}
       ORDER BY fecha_creacion DESC
       LIMIT 500`,
      params
    );
    return res.json(r.rows.map((p) => ({ ...coercePedidoLatLng(p), fotos: splitUrls(p.foto_urls) })));
  } catch (error) {
    return res.status(500).json({ error: "No se pudieron obtener mis pedidos", detail: error.message });
  }
});

router.get("/buscar", async (req, res) => {
  try {
    const nis = String(req.query.nis || "").trim();
    const medidor = String(req.query.medidor || "").trim();
    if (!nis && !medidor) return res.status(400).json({ error: "Ingrese nis o medidor" });

    const params = [];
    const where = [];
    if (nis) {
      params.push(nis);
      where.push(`nis = $${params.length}`);
    }
    if (medidor) {
      params.push(medidor);
      where.push(`medidor = $${params.length}`);
    }

    const hasTb = await pedidosTableHasTenantIdColumn();
    let sqlWhere = where.join(" OR ");
    if (hasTb) {
      params.push(req.tenantId);
      sqlWhere = `tenant_id = $${params.length} AND (${sqlWhere})`;
    }
    const bt = await pushPedidoBusinessFilter(req, params);
    if (bt) sqlWhere = `(${sqlWhere})${bt}`;
    const r = await query(
      `SELECT * FROM pedidos WHERE ${sqlWhere} ORDER BY fecha_creacion DESC LIMIT 200`,
      params
    );
    return res.json(r.rows.map((row) => coercePedidoLatLng(row)));
  } catch (error) {
    return res.status(500).json({ error: "Error en búsqueda", detail: error.message });
  }
});

router.get("/historial/nis/:nis", async (req, res) => {
  try {
    const nis = String(req.params.nis || "").trim();
    if (!nis) return res.status(400).json({ error: "NIS requerido" });
    const hasTh = await pedidosTableHasTenantIdColumn();
    const hp = hasTh ? [nis, req.tenantId] : [nis];
    const bt = await pushPedidoBusinessFilter(req, hp);
    const r = await query(
      hasTh
        ? `SELECT * FROM pedidos WHERE nis = $1 AND tenant_id = $2${bt} ORDER BY fecha_creacion DESC`
        : `SELECT * FROM pedidos WHERE nis = $1${bt} ORDER BY fecha_creacion DESC`,
      hp
    );
    return res.json(r.rows.map((row) => coercePedidoLatLng(row)));
  } catch (error) {
    return res.status(500).json({ error: "No se pudo obtener historial", detail: error.message });
  }
});

registerPedidoOperativaRoutes(router, { getPedidoInTenant, assertPedidoMismoTenant });

/** Tipos de reclamo (catálogo eléctrico) para los que el técnico puede pedir derivación a terceros. */
const TIPOS_SOLICITUD_DERIVACION_TERCERO = new Set(TIPOS_SOLICITUD_DERIVACION_TERCERO_COOP_ELECTRICA);

function pedidoTipoPermiteSolicitudDerivacion(tt) {
  return TIPOS_SOLICITUD_DERIVACION_TERCERO.has(String(tt || "").trim());
}

function esRolTecnicoOSupervisorAuth(rol) {
  const r = String(rol || "").toLowerCase();
  return r === "tecnico" || r === "supervisor";
}

/**
 * Técnico/supervisor asignado: solicita derivación (cola admin). Ver docs/NEON_pedidos_solicitud_derivacion_tercero.sql
 * El estado operativo del pedido sigue «Asignado» o «En ejecución»; la solicitud queda marcada con solicitud_derivacion_pendiente.
 */
router.post("/:id/solicitar-derivacion-tercero", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
    if (!esRolTecnicoOSupervisorAuth(req.user?.rol)) {
      return res.status(403).json({ error: "Solo técnico o supervisor asignado puede solicitar derivación" });
    }

    const { motivo, destino_sugerido: destinoSugRaw } = req.body || {};
    const motivoStr = motivo != null && String(motivo).trim() ? String(motivo).trim().slice(0, MAX_OBSERVACIONES_DERIVACION_API) : "";
    const destinoSug = destinoSugRaw != null ? String(destinoSugRaw).trim().slice(0, 64) : "";

    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (Number(pedido.tecnico_asignado_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Solo el técnico asignado puede solicitar la derivación" });
    }
    const es = String(pedido.estado || "");
    if (es !== "Asignado" && es !== "En ejecución") {
      return res.status(400).json({ error: "Solo con asignación o en ejecución" });
    }
    if (pedido.derivado_externo === true || String(pedido.estado || "") === "Derivado externo") {
      return res.status(400).json({ error: "El pedido ya está derivado" });
    }
    if (!pedidoTipoPermiteSolicitudDerivacion(pedido.tipo_trabajo)) {
      return res.status(400).json({ error: "Este tipo de reclamo no admite solicitud de derivación desde el técnico" });
    }
    if (pedido.solicitud_derivacion_pendiente === true) {
      return res.status(400).json({ error: "Ya hay una solicitud pendiente" });
    }
    if (!motivoStr || motivoStr.length < 8) {
      return res.status(400).json({
        error:
          "Las observaciones para el administrador son obligatorias (mínimo 8 caracteres): qué viste en campo y por qué corresponde derivar.",
      });
    }

    const hasTa = await pedidosTableHasTenantIdColumn();
    const bind = hasTa
      ? [id, req.user.id, motivoStr || null, destinoSug, req.tenantId]
      : [id, req.user.id, motivoStr || null, destinoSug];
    const bt = await pushPedidoBusinessFilter(req, bind);
    const sql = hasTa
      ? `UPDATE pedidos SET
          solicitud_derivacion_pendiente = TRUE,
          solicitud_derivacion_fecha = NOW(),
          solicitud_derivacion_usuario_id = $2,
          solicitud_derivacion_motivo = $3,
          solicitud_derivacion_destino_sugerido = NULLIF($4,'')
        WHERE id = $1 AND tenant_id = $5${bt}
        RETURNING *`
      : `UPDATE pedidos SET
          solicitud_derivacion_pendiente = TRUE,
          solicitud_derivacion_fecha = NOW(),
          solicitud_derivacion_usuario_id = $2,
          solicitud_derivacion_motivo = $3,
          solicitud_derivacion_destino_sugerido = NULLIF($4,'')
        WHERE id = $1${bt}
        RETURNING *`;
    let r;
    try {
      r = await query(sql, bind);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/solicitud_derivacion|column/i.test(msg)) {
        return res.status(503).json({
          error:
            "Faltan columnas de solicitud de derivación. Ejecutá docs/NEON_pedidos_solicitud_derivacion_tercero.sql en Neon.",
          detail: msg.slice(0, 240),
        });
      }
      throw err;
    }
    if (!r.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
    const updated = r.rows[0];
    void enqueueNotificacionSolicitudDerivacionParaAdmins({
      tenantId: req.tenantId,
      pedidoId: updated.id,
      numeroPedido: updated.numero_pedido,
      motivoSnippet: motivoStr,
      tecnicoNombre: req.user?.nombre || req.user?.email || null,
      tipoTrabajo: updated.tipo_trabajo || pedido.tipo_trabajo,
    }).catch(() => {});
    return res.json(coercePedidoLatLng(updated));
  } catch (error) {
    return res.status(500).json({ error: "No se pudo registrar la solicitud", detail: error.message });
  }
});

/** Admin: rechaza la solicitud del técnico (sin derivar). */
router.post("/:id/rechazar-solicitud-derivacion-tercero", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
    const notaAdmin =
      req.body?.nota_admin != null && String(req.body.nota_admin).trim()
        ? String(req.body.nota_admin).trim().slice(0, 500)
        : "";

    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (pedido.solicitud_derivacion_pendiente !== true) {
      return res.status(400).json({ error: "No hay solicitud pendiente" });
    }

    const nuevaNota = notaAdmin
      ? String(pedido.derivacion_nota || "").trim()
        ? `${pedido.derivacion_nota}\n[Rechazo solicitud derivación admin]: ${notaAdmin}`
        : `[Rechazo solicitud derivación admin]: ${notaAdmin}`
      : pedido.derivacion_nota;

    const hasTa = await pedidosTableHasTenantIdColumn();
    const bind = hasTa ? [id, nuevaNota ?? null, req.tenantId] : [id, nuevaNota ?? null];
    const bt = await pushPedidoBusinessFilter(req, bind);
    const sql = hasTa
      ? `UPDATE pedidos SET
          solicitud_derivacion_pendiente = FALSE,
          solicitud_derivacion_fecha = NULL,
          solicitud_derivacion_usuario_id = NULL,
          solicitud_derivacion_motivo = NULL,
          solicitud_derivacion_destino_sugerido = NULL,
          derivacion_nota = $2
        WHERE id = $1 AND tenant_id = $3 AND solicitud_derivacion_pendiente = TRUE${bt}
        RETURNING *`
      : `UPDATE pedidos SET
          solicitud_derivacion_pendiente = FALSE,
          solicitud_derivacion_fecha = NULL,
          solicitud_derivacion_usuario_id = NULL,
          solicitud_derivacion_motivo = NULL,
          solicitud_derivacion_destino_sugerido = NULL,
          derivacion_nota = $2
        WHERE id = $1 AND solicitud_derivacion_pendiente = TRUE${bt}
        RETURNING *`;
    let r;
    try {
      r = await query(sql, bind);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/solicitud_derivacion|column/i.test(msg)) {
        return res.status(503).json({
          error:
            "Faltan columnas de solicitud de derivación. Ejecutá docs/NEON_pedidos_solicitud_derivacion_tercero.sql en Neon.",
          detail: msg.slice(0, 240),
        });
      }
      throw err;
    }
    if (!r.rows.length) return res.status(404).json({ error: "Pedido no encontrado o sin solicitud" });
    return res.json(coercePedidoLatLng(r.rows[0]));
  } catch (error) {
    return res.status(500).json({ error: "No se pudo rechazar la solicitud", detail: error.message });
  }
});

/**
 * Admin: deriva el reclamo a un tercero con WhatsApp configurado en derivacion_reclamos.
 * Persistencia: estado Derivado externo + flags/columnas (ver docs/NEON_pedidos_derivacion_externa.sql).
 */
router.post("/:id/derivar-externo", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });

    const { destino, fila_index: filaIndexRaw, motivo, mensaje_final: mensajeFinalRaw } = req.body || {};
    const destinoStr = String(destino || "").trim();
    if (!destinoStr) return res.status(400).json({ error: "destino es obligatorio" });

    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }

    const es = String(pedido.estado || "");
    if (es !== "Asignado" && es !== "En ejecución") {
      return res.status(400).json({ error: "Solo se puede derivar un pedido asignado o en ejecución" });
    }
    if (pedido.derivado_externo === true) {
      return res.status(400).json({ error: "El pedido ya fue derivado fuera del tenant" });
    }

    const cr = await query(`SELECT nombre, configuracion FROM clientes WHERE id = $1 LIMIT 1`, [req.tenantId]);
    const rowC = cr.rows?.[0];
    const nombreTenant = String(rowC?.nombre || "GestorNova").trim() || "GestorNova";
    const cfg = parseClienteConfigJson(rowC?.configuracion);
    const dr = derivacionReclamosDesdeConfig(cfg) || {};

    const rContact = resolverContactoDerivacion(dr, destinoStr, filaIndexRaw);
    if (rContact.error) {
      return res.status(400).json({ error: rContact.error });
    }

    const adminObs =
      motivo != null && String(motivo).trim() ? String(motivo).trim().slice(0, MAX_OBSERVACIONES_DERIVACION_API) : "";
    const obsTecnico =
      pedido.solicitud_derivacion_motivo != null && String(pedido.solicitud_derivacion_motivo).trim()
        ? String(pedido.solicitud_derivacion_motivo).trim().slice(0, MAX_OBSERVACIONES_DERIVACION_API)
        : "";
    const textoObservaciones = adminObs || obsTecnico;
    if (!textoObservaciones) {
      return res.status(400).json({
        error:
          "Indicá las observaciones para el tercero (motivo de derivación). Si el técnico ya cargó una solicitud, podés dejar el cuadro con ese texto o editarlo antes de confirmar.",
      });
    }
    const destinoEtiqueta = etiquetaDestinoDerivacion(destinoStr);
    const nombreEmpresaDestino = (rContact.nombre && String(rContact.nombre).trim()) || destinoEtiqueta;
    const terceroWaCliente = String(rContact.whatsapp || "").replace(/\D/g, "");
    let pedidoParaMensaje = { ...pedido };
    const latBody = req.body?.lat ?? req.body?.latitude;
    const lngBody = req.body?.lng ?? req.body?.longitude;
    if (latBody != null && lngBody != null) {
      const lx = Number(latBody);
      const ly = Number(lngBody);
      if (Number.isFinite(lx) && Number.isFinite(ly) && (Math.abs(lx) > 1e-7 || Math.abs(ly) > 1e-7)) {
        pedidoParaMensaje = { ...pedidoParaMensaje, lat: lx, lng: ly };
      }
    }
    const snapBase = buildDerivacionExternaMensaje({
      nombreTenant,
      pedido: pedidoParaMensaje,
      nombreEmpresaDestino,
      textoObservacionesTecnico: textoObservaciones,
    });
    const mensajeFinal =
      mensajeFinalRaw != null && String(mensajeFinalRaw).trim()
        ? String(mensajeFinalRaw).trim().slice(0, 6000)
        : "";
    const snap = mensajeFinal || snapBase;

    const hasTa = await pedidosTableHasTenantIdColumn();
    const upParams = [
      id,
      "Derivado externo",
      true,
      destinoStr,
      rContact.nombre ? rContact.nombre.slice(0, 200) : null,
      req.user.id,
      textoObservaciones.slice(0, MAX_OBSERVACIONES_DERIVACION_API),
      snap,
    ];
    const bind = hasTa ? [...upParams, req.tenantId] : [...upParams];
    const bt = await pushPedidoBusinessFilter(req, bind);
    const sql = hasTa
      ? `UPDATE pedidos SET
          estado = $2,
          derivado_externo = $3,
          derivado_a = $4,
          derivado_destino_nombre = $5,
          fecha_derivacion = NOW(),
          usuario_derivacion_id = $6,
          derivacion_nota = $7,
          derivacion_mensaje_snapshot = $8,
          solicitud_derivacion_pendiente = FALSE,
          solicitud_derivacion_fecha = NULL,
          solicitud_derivacion_usuario_id = NULL,
          solicitud_derivacion_motivo = NULL,
          solicitud_derivacion_destino_sugerido = NULL
        WHERE id = $1 AND tenant_id = $9${bt}
        RETURNING *`
      : `UPDATE pedidos SET
          estado = $2,
          derivado_externo = $3,
          derivado_a = $4,
          derivado_destino_nombre = $5,
          fecha_derivacion = NOW(),
          usuario_derivacion_id = $6,
          derivacion_nota = $7,
          derivacion_mensaje_snapshot = $8,
          solicitud_derivacion_pendiente = FALSE,
          solicitud_derivacion_fecha = NULL,
          solicitud_derivacion_usuario_id = NULL,
          solicitud_derivacion_motivo = NULL,
          solicitud_derivacion_destino_sugerido = NULL
        WHERE id = $1${bt}
        RETURNING *`;

    let r;
    try {
      r = await query(sql, bind);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/derivado_externo|derivacion_|column/i.test(msg)) {
        return res.status(503).json({
          error:
            "Faltan columnas de derivación en la base. Ejecutá docs/NEON_pedidos_derivacion_externa.sql en Neon.",
          detail: msg.slice(0, 240),
        });
      }
      throw err;
    }
    if (!r.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });

    const row = r.rows[0];
    void (async () => {
      try {
        await notifyPedidoDerivacionClienteWhatsAppSafe({
          tenantId: req.tenantId,
          numeroPedido: row.numero_pedido,
          nombreEntidad: nombreTenant,
          telefonoContactoRaw: row.telefono_contacto,
          pedidoId: row.id,
          destinoNombre: row.derivado_destino_nombre || nombreEmpresaDestino,
          terceroWhatsAppDigits: terceroWaCliente.length >= 8 ? terceroWaCliente : undefined,
        });
      } catch (e) {
        console.error("[pedidos] aviso cliente derivación externa (no bloqueante)", e.message);
      }
    })();
    const waRaw = String(rContact.whatsapp || "").replace(/\D/g, "");
    /** Misma forma canónica que el webhook (`normalizeWhatsAppRecipientForMeta`) para que el bot encuentre la sesión. */
    const waDigits = normalizeWhatsAppRecipientForMeta(waRaw);
    let waTerceroResult = { ok: false, error: "sin_numero_whatsapp_valido" };
    if (waDigits.length >= 8) {
      waTerceroResult = await sendTenantWhatsAppText({
        tenantId: req.tenantId,
        toDigits: waRaw,
        bodyText: snap,
        pedidoId: row.id,
        logContext: "derivacion_tercero",
      });
      try {
        const { id: sid } = await humanChatOpenOrGetSession(
          req.tenantId,
          waDigits,
          rContact.nombre || nombreEmpresaDestino,
          { expiresInHours: 2 }
        );
        const stub = `[Derivación externa] Pedido #${row.numero_pedido ?? row.id}. El mensaje operativo se envió al contacto por WhatsApp (servidor). Respondé por este hilo; un operador te verá en el panel.`;
        await humanChatAppendOutbound(sid, stub, {
          source: "derivacion_externa",
          pedido_id: row.id,
        });
        await humanChatActivateSession(sid, req.tenantId, req.user.id);
      } catch (e) {
        console.error("[pedidos] human chat derivación tercero", e?.message || e);
      }
    }
    return res.json({
      ...coercePedidoLatLng(row),
      _derivacion_whatsapp_enviado: waTerceroResult.ok === true,
      _derivacion_whatsapp_envio_error: waTerceroResult.ok ? null : String(waTerceroResult.error || "send_failed"),
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo registrar la derivación", detail: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const p = await getPedidoInTenant(req.params.id, req);
    if (!p) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(p, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (req.user.rol !== "admin" && p.tecnico_asignado_id && p.tecnico_asignado_id !== req.user.id) {
      return res.status(403).json({ error: "Sin permiso para ver este pedido" });
    }
    return res.json({ ...coercePedidoLatLng(p), fotos: splitUrls(p.foto_urls) });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo obtener pedido", detail: error.message });
  }
});

/** Tras cerrar vía SQL en la app, dispara aviso WA al teléfono del pedido (mismas credenciales que el tenant). */
/**
 * Tras actualizar el pedido por SQL directo (Neon en la app), dispara el mismo aviso WA que haría PUT /pedidos/:id.
 * event: inicio | avance
 */
router.post("/:id/whatsapp-aviso-cliente", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const event = String(req.body?.event || "").toLowerCase();
    if (!["inicio", "avance"].includes(event)) {
      return res.status(400).json({ error: "event debe ser inicio o avance" });
    }
    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (req.user.rol !== "admin" && pedido.tecnico_asignado_id && pedido.tecnico_asignado_id !== req.user.id) {
      return res.status(403).json({ error: "Sin permiso para notificar este pedido" });
    }

    const ut = req.tenantId;
    const tenantId =
      pedido.tenant_id != null && Number.isFinite(Number(pedido.tenant_id)) ? Number(pedido.tenant_id) : ut;
    const nombreEntidad = await loadNombreCliente(tenantId);
    const phoneRaw = pedido.telefono_contacto;

    if (event === "inicio") {
      if (String(pedido.estado || "") !== "En ejecución") {
        return res.status(400).json({ error: "El pedido debe estar en estado En ejecución" });
      }
      const r = await notifyPedidoClienteActualizacionWhatsAppSafe({
        tenantId,
        numeroPedido: pedido.numero_pedido,
        nombreEntidad,
        telefonoContactoRaw: phoneRaw,
        pedidoId: pedido.id,
        tipo: "en_ejecucion",
      });
      return res.json({ ok: true, ...r });
    }

    const r = await notifyPedidoClienteActualizacionWhatsAppSafe({
      tenantId,
      numeroPedido: pedido.numero_pedido,
      nombreEntidad,
      telefonoContactoRaw: phoneRaw,
      pedidoId: pedido.id,
      tipo: "avance",
      avancePct: pedido.avance,
      trabajoRealizadoSnippet: pedido.trabajo_realizado || null,
    });
    return res.json({ ok: true, ...r });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo enviar el aviso", detail: error.message });
  }
});

/** Tras INSERT directo en Neon (app WebView), avisa al cliente del alta si hay teléfono y el reclamo sigue pendiente. */
router.post("/:id/notify-alta-cliente-whatsapp", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (String(pedido.estado || "") !== "Pendiente") {
      return res.status(400).json({ error: "Solo se notifica en reclamos pendientes (recién cargados)" });
    }
    const uid = Number(req.user.id);
    const esAdmin = req.user.rol === "admin";
    const creador = Number(pedido.usuario_creador_id) === uid;
    const owner = Number(pedido.usuario_id) === uid;
    if (!esAdmin && !creador && !owner) {
      return res.status(403).json({ error: "Sin permiso para notificar este pedido" });
    }
    const ut = req.tenantId;
    const tenantId =
      pedido.tenant_id != null && Number.isFinite(Number(pedido.tenant_id)) ? Number(pedido.tenant_id) : ut;
    const nombreEntidad = await loadNombreCliente(tenantId);
    const r = await notifyPedidoAltaClienteWhatsAppSafe({
      tenantId,
      numeroPedido: pedido.numero_pedido,
      nombreEntidad,
      telefonoContactoRaw: pedido.telefono_contacto,
      pedidoId: pedido.id,
      descripcion: pedido.descripcion,
      tipoTrabajo: pedido.tipo_trabajo,
    });
    return res.json({ ok: true, ...r });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo enviar el aviso de alta", detail: error.message });
  }
});

router.post("/:id/notify-cierre-whatsapp", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (String(pedido.estado || "") !== "Cerrado") {
      return res.status(400).json({ error: "El pedido debe estar en estado Cerrado" });
    }
    const ut = req.tenantId;
    const tenantId =
      pedido.tenant_id != null && Number.isFinite(Number(pedido.tenant_id)) ? Number(pedido.tenant_id) : ut;
    const nombreEntidad = await loadNombreCliente(tenantId);
    const phoneOverride = req.body?.telefono_contacto;
    const r = await notifyPedidoCierreWhatsAppSafe({
      tenantId,
      numeroPedido: pedido.numero_pedido,
      nombreEntidad,
      telefonoContactoRaw: phoneOverride !== undefined ? phoneOverride : pedido.telefono_contacto,
      pedidoId: pedido.id,
    });
    return res.json({ ok: true, ...r });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo procesar la notificación", detail: error.message });
  }
});

/** Registro de clientes afectados al cerrar (SAIDI/SAIFI). El pedido debe estar Cerrado. */
router.post("/:id/clientes-afectados", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (
      req.user.rol !== "admin" &&
      pedido.tecnico_asignado_id &&
      pedido.tecnico_asignado_id !== req.user.id
    ) {
      return res.status(403).json({ error: "Sin permiso para este pedido" });
    }
    if (String(pedido.estado || "") !== "Cerrado") {
      return res.status(400).json({ error: "El pedido debe estar cerrado antes de registrar clientes afectados" });
    }

    const built = await buildClientesAfectadosPayload(pedido, req.user.id, req.body);
    if (!built.ok) return res.status(built.status).json({ error: built.error });
    try {
      const saved = await insertClientesAfectadosLog(built.row);
      return res.status(201).json(saved);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/does not exist|relation .*clientes_afectados/i.test(msg)) {
        return res.status(503).json({
          error:
            "Falta la tabla clientes_afectados_log (u otras). Ejecutá docs/NEON_clientes_afectados_infra.sql en Neon.",
        });
      }
      throw err;
    }
  } catch (error) {
    return res.status(500).json({ error: "No se pudo registrar clientes afectados", detail: error.message });
  }
});

function pedidoTieneCoordsValidasDb(p) {
  const la = p?.lat != null ? Number(p.lat) : NaN;
  const ln = p?.lng != null ? Number(p.lng) : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  return true;
}

/**
 * Admin: guardar coordenadas obtenidas por geocodificación en el panel (Nominatim vía servidor).
 * Solo si el pedido aún no tiene lat/lng válidos.
 */
router.post("/:id/coords-geocode-panel", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
    const la = Number(req.body?.lat);
    const ln = Number(req.body?.lng ?? req.body?.lon);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      return res.status(400).json({ error: "lat y lng numéricos requeridos" });
    }
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) {
      return res.status(400).json({ error: "coordenadas fuera de rango WGS84" });
    }
    if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) {
      return res.status(400).json({ error: "No se aceptan coordenadas 0,0" });
    }

    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }

    if (pedidoTieneCoordsValidasDb(pedido)) {
      return res.json(coercePedidoLatLng(pedido));
    }

    const hasT = await pedidosTableHasTenantIdColumn();
    const bindCg = hasT ? [id, la, ln, req.tenantId] : [id, la, ln];
    const btcg = await pushPedidoBusinessFilter(req, bindCg);
    const r = await query(
      hasT
        ? `UPDATE pedidos SET lat = $2, lng = $3
           WHERE id = $1 AND tenant_id = $4${btcg}
           RETURNING *`
        : `UPDATE pedidos SET lat = $2, lng = $3
           WHERE id = $1${btcg}
           RETURNING *`,
      bindCg
    );
    if (!r.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
    return res.json(coercePedidoLatLng(r.rows[0]));
  } catch (error) {
    return res.status(500).json({ error: "No se pudieron guardar las coordenadas", detail: error.message });
  }
});

/**
 * Admin: corrección manual WGS84 en mapa (sobrescribe lat/lng aunque ya existan).
 * No aplica a pedidos cerrados o derivados fuera (solo operativa abierta).
 * Persiste también en `correcciones_direcciones` para reutilizar la ubicación en futuros reclamos con el mismo domicilio.
 * Integraciones sin id de pedido: `POST /api/direcciones/corregir` (misma tabla, mismo upsert).
 */
async function handleCoordsManualCorreccion(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
    const la = Number(req.body?.lat);
    const ln = Number(req.body?.lng ?? req.body?.lon);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      return res.status(400).json({ error: "lat y lng numéricos requeridos" });
    }
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) {
      return res.status(400).json({ error: "coordenadas fuera de rango WGS84" });
    }
    if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) {
      return res.status(400).json({ error: "No se aceptan coordenadas 0,0" });
    }

    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }

    const es = String(pedido.estado || "");
    if (es === "Cerrado" || es === "Derivado externo" || pedido.derivado_externo === true) {
      return res.status(400).json({ error: "No se puede mover la ubicación de un pedido cerrado o derivado" });
    }

    const nombreAdm = String(req.user?.nombre || req.user?.email || "admin").trim().slice(0, 120);
    const marcaUbic =
      "\n\n[Ubicación] Posición del pedido corregida manualmente en el mapa por " + nombreAdm + ".";
    const desc0 = String(pedido.descripcion || "");
    const nuevaDesc = desc0.includes("corregida manualmente en el mapa") ? desc0 : `${desc0}${marcaUbic}`;

    const hasT = await pedidosTableHasTenantIdColumn();
    const bindCm = hasT ? [id, la, ln, nuevaDesc, req.tenantId] : [id, la, ln, nuevaDesc];
    const btcm = await pushPedidoBusinessFilter(req, bindCm);
    const r = await query(
      hasT
        ? `UPDATE pedidos SET lat = $2, lng = $3, descripcion = $4
           WHERE id = $1 AND tenant_id = $5${btcm}
           RETURNING *`
        : `UPDATE pedidos SET lat = $2, lng = $3, descripcion = $4
           WHERE id = $1${btcm}
           RETURNING *`,
      bindCm
    );
    if (!r.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
    const updated = coercePedidoLatLng(r.rows[0]);

    let correccionDireccionGuardada = false;
    let correccionDireccionInfo = null;
    try {
      correccionDireccionInfo = await upsertCorreccionOperadorDesdePedido({
        tenantId: Number(req.tenantId),
        pedido,
        lat: la,
        lng: ln,
        usuarioId: req.user?.id ?? null,
      });
      correccionDireccionGuardada = correccionDireccionInfo?.ok === true;
    } catch (e) {
      console.warn("[coords-manual] correcciones_direcciones:", e?.message || e);
    }

    // Actualizar socios_catalogo de forma síncrona para asegurar persistencia inmediata
    let catalogoActualizado = false;
    let catalogoInfo = null;
    try {
      const resultado = await actualizarSociosCatalogoCoordsSiMatchPedido({
        pedido: r.rows[0],
        lat: la,
        lng: ln,
        tenantId: req.tenantId,
      });
      catalogoActualizado = resultado.ok === true;
      catalogoInfo = resultado;
      if (catalogoActualizado) {
        console.info("[coords-manual] ✓ Catálogo actualizado: socio id=%s", resultado.sociosId);
      } else {
        console.info("[coords-manual] ⚠ Catálogo NO actualizado: %s", resultado.reason || "sin razón");
      }
    } catch (e) {
      console.warn("[coords-manual] ✗ Error al actualizar catálogo:", e?.message || e);
    }

    return res.json({
      ...updated,
      _catalogoActualizado: catalogoActualizado,
      _catalogoInfo: catalogoInfo,
      _correccionDireccionGuardada: correccionDireccionGuardada,
      _correccionDireccionInfo: correccionDireccionInfo,
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudieron guardar las coordenadas", detail: error.message });
  }
}

router.put("/:id/coords-manual", adminOnly, handleCoordsManualCorreccion);
router.post("/:id/corregir-posicion", adminOnly, handleCoordsManualCorreccion);

/**
 * Admin: Re-geocodificar pedido con sistema inteligente de 5 capas
 * Actualiza coordenadas usando: catálogo → normalización → Nominatim → interpolación → fallback
 * Útil para pedidos viejos o con coords incorrectas
 */
router.post("/:id/regeocodificar", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ error: "id inválido" });
    }
    
    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) {
        return res.status(403).json({ error: e.message });
      }
      throw e;
    }
    
    // Ejecutar re-geocodificación
    const resultado = await regeocodificarPedido(id, req.tenantId, { req });
    
    // 200 + success:false: la petición es válida; el fallo es resultado de negocio (sin coords),
    // no "Bad Request". Evita confusión en DevTools y monitores (400 = request mal formado).
    if (!resultado.success) {
      return res.status(200).json({
        success: false,
        error: resultado.mensaje || "No se pudo re-geocodificar",
        mensaje: resultado.mensaje || "No se pudo re-geocodificar",
        log: resultado.log || []
      });
    }
    
    // Actualizar socios_catalogo si aplica
    if (resultado.fuente !== "catalogo_manual" && resultado.fuente !== "catalogo") {
      setImmediate(() => {
        actualizarSociosCatalogoCoordsSiMatchPedido({
          pedido,
          lat: resultado.lat,
          lng: resultado.lng,
          tenantId: req.tenantId,
        }).catch((e) => console.warn("[regeocodificar] sync socios_catalogo", e?.message || e));
      });
    }
    
    return res.json({
      success: true,
      mensaje: resultado.mensaje,
      coordenadas: {
        lat: resultado.lat,
        lng: resultado.lng
      },
      fuente: resultado.fuente,
      log: resultado.log
    });
    
  } catch (error) {
    console.error("[regeocodificar] Error:", error);
    return res.status(500).json({
      error: "Error al re-geocodificar pedido",
      detail: error.message
    });
  }
});

/** Admin: no volver a mostrar el banner de opinión baja para este pedido (persistente en BD). */
router.post("/:id/banner-calificacion-cerrado", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
    if (!(await tableHasColumn("pedidos", "banner_calificacion_cerrado"))) {
      return res.status(503).json({
        error: "Columna banner_calificacion_cerrado no existe",
        hint: "Ejecutá api/db/migrations/pedidos_banner_calificacion_cerrado.sql en Neon",
      });
    }
    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    const hasT = await pedidosTableHasTenantIdColumn();
    if (hasT) {
      await query(`UPDATE pedidos SET banner_calificacion_cerrado = TRUE WHERE id = $1 AND tenant_id = $2`, [
        id,
        req.tenantId,
      ]);
    } else {
      await query(`UPDATE pedidos SET banner_calificacion_cerrado = TRUE WHERE id = $1`, [id]);
    }
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar el banner", detail: error.message });
  }
});

/** Admin: abrir hilo de chat humano (panel) ante valoración baja — mismo patrón que derivación a terceros. */
router.post("/:id/abrir-chat-calificacion-baja", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    const raw = String(pedido.telefono_contacto || "").replace(/\D/g, "");
    const waDigits = normalizeWhatsAppRecipientForMeta(raw);
    if (!waDigits || String(waDigits).length < 8) {
      return res.status(400).json({ error: "Teléfono de contacto inválido para WhatsApp" });
    }
    const nombre = String(pedido.cliente_nombre || "").trim() || `Pedido #${pedido.numero_pedido ?? id}`;
    const { id: sid } = await humanChatOpenOrGetSession(req.tenantId, waDigits, nombre, { expiresInHours: 48 });
    const stub = `[Seguimiento calificación] Pedido #${pedido.numero_pedido ?? id}. Valoración baja: coordiná la respuesta con el cliente por este hilo.`;
    await humanChatAppendOutbound(sid, stub, { source: "opinion_cliente_baja", pedido_id: id });
    await humanChatActivateSession(sid, req.tenantId, req.user.id);
    return res.json({ ok: true, humanChatSessionId: sid });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo abrir el chat", detail: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = await getPedidoInTenant(id, req);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (
      req.user.rol !== "admin" &&
      pedido.tecnico_asignado_id &&
      pedido.tecnico_asignado_id !== req.user.id
    ) {
      return res.status(403).json({ error: "Sin permiso para actualizar este pedido" });
    }

    const {
      estado,
      avance,
      trabajo_realizado,
      tecnico_cierre,
      firma_cliente,
      firma_nombre,
      nis,
      medidor,
      cliente_nombre,
      cliente_direccion,
      cliente_numero_puerta,
      cliente_referencia,
      cliente_calle,
      cliente_localidad,
      telefono_contacto,
      checklist_seguridad,
    } = req.body;

    const fotosB64 = parseFotosBase64(req.body);
    let mergedUrls = splitUrls(pedido.foto_urls);
    if (fotosB64.length) {
      const newUrls = await uploadManyBase64(fotosB64);
      mergedUrls = [...mergedUrls, ...newUrls];
    }

    const estadoAntes = String(pedido.estado || "");
    const estadoNuevo = estado !== undefined && estado !== null ? String(estado) : null;
    const cerrandoOperativo =
      estadoNuevo === "Cerrado" && estadoAntes !== "Cerrado";
    let avanceParam = avance ?? null;
    if (cerrandoOperativo) avanceParam = 100;
    const hasTUp = await pedidosTableHasTenantIdColumn();
    const upParams = [
      id,
      estado ?? null,
      avanceParam,
      trabajo_realizado ?? null,
      tecnico_cierre ?? null,
      mergedUrls.length ? toJoinedUrls(mergedUrls) : null,
      firma_cliente ?? null,
      firma_nombre ?? null,
      req.user.id,
      nis ?? null,
      medidor ?? null,
      cliente_nombre ?? null,
      cliente_direccion ?? null,
      cliente_numero_puerta ?? null,
      cliente_referencia ?? null,
      telefono_contacto ?? null,
      estadoAntes,
      cliente_calle ?? null,
      cliente_localidad ?? null,
      checklist_seguridad ?? null,
    ];
    if (hasTUp) upParams.push(req.tenantId);
    const btUp = await pushPedidoBusinessFilterRelaxed(req, upParams);
    const r = await query(
      `UPDATE pedidos SET
         estado = COALESCE($2, estado),
         avance = COALESCE($3, avance),
         trabajo_realizado = COALESCE($4, trabajo_realizado),
         tecnico_cierre = COALESCE($5, tecnico_cierre),
         foto_urls = COALESCE($6, foto_urls),
         firma_cliente = COALESCE($7, firma_cliente),
         firma_nombre = COALESCE($8, firma_nombre),
         firma_fecha = CASE WHEN $7 IS NOT NULL THEN NOW() ELSE firma_fecha END,
         fecha_avance = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE fecha_avance END,
         fecha_cierre = CASE WHEN $2 = 'Cerrado' THEN NOW() ELSE fecha_cierre END,
         usuario_avance_id = CASE WHEN $3 IS NOT NULL THEN $9 ELSE usuario_avance_id END,
         usuario_cierre_id = CASE WHEN $2 = 'Cerrado' THEN $9 ELSE usuario_cierre_id END,
         usuario_inicio_id = CASE
           WHEN $2::text = 'En ejecución' AND ($17::text IS NULL OR $17::text IS DISTINCT FROM 'En ejecución')
           THEN $9
           ELSE usuario_inicio_id
         END,
         nis = COALESCE($10, nis),
         medidor = COALESCE($11, medidor),
         cliente_nombre = COALESCE($12, cliente_nombre),
         cliente_direccion = COALESCE($13, cliente_direccion),
         cliente_numero_puerta = COALESCE($14, cliente_numero_puerta),
         cliente_referencia = COALESCE($15, cliente_referencia),
         telefono_contacto = COALESCE($16, telefono_contacto),
         cliente_calle = COALESCE($18, cliente_calle),
         cliente_localidad = COALESCE($19, cliente_localidad),
         checklist_seguridad = COALESCE($20, checklist_seguridad)
       WHERE id = $1${hasTUp ? " AND (tenant_id = $21 OR tenant_id IS NULL)" : ""}${btUp}
       RETURNING *`,
      upParams
    );
    const updated = r.rows[0];
    const becameCerrado =
      String(updated?.estado || "") === "Cerrado" && estadoAntes !== "Cerrado";
    if (becameCerrado) {
      await notifyCierreWhatsAppAfterPut(updated, telefono_contacto, req.user.id);
      setImmediate(() => {
        enqueueNotificacionPedidoCerradoParaTecnico({
          tecnicoUsuarioId: pedido.tecnico_asignado_id,
          pedidoId: updated.id,
          numeroPedido: updated.numero_pedido,
          cerradoPorUsuarioId: req.user.id,
        }).catch(() => {});
      });
    }
    scheduleNotifyClientePedidoWhatsapp({
      pedidoAntes: pedido,
      pedidoDespues: updated,
      body: req.body,
      userId: req.user.id,
      estadoAntes,
    });
    return res.json(coercePedidoLatLng(updated));
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar pedido", detail: error.message });
  }
});

router.put("/:id/asignar", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const tecnicoAsignadoId = Number(req.body.tecnico_asignado_id);
    if (!tecnicoAsignadoId) return res.status(400).json({ error: "tecnico_asignado_id es requerido" });

    const ucol = await usuariosTenantColumnName();
    const ru = ucol
      ? await query(
          `SELECT id, rol, activo FROM usuarios WHERE id = $1 AND ${ucol} = $2 AND activo = TRUE LIMIT 1`,
          [tecnicoAsignadoId, req.tenantId]
        )
      : await query("SELECT id, rol, activo FROM usuarios WHERE id = $1 LIMIT 1", [tecnicoAsignadoId]);
    if (!ru.rows.length || !ru.rows[0].activo) return res.status(400).json({ error: "Técnico inválido o inactivo" });

    const hasTa = await pedidosTableHasTenantIdColumn();
    const bindAs = hasTa ? [id, tecnicoAsignadoId, req.user.id, req.tenantId] : [id, tecnicoAsignadoId, req.user.id];
    const bta = await pushPedidoBusinessFilter(req, bindAs);
    const r = await query(
      hasTa
        ? `UPDATE pedidos
       SET tecnico_asignado_id = $2, fecha_asignacion = NOW(), asignado_por_id = $3
       WHERE id = $1 AND tenant_id = $4${bta}
       RETURNING *`
        : `UPDATE pedidos
       SET tecnico_asignado_id = $2, fecha_asignacion = NOW(), asignado_por_id = $3
       WHERE id = $1${bta}
       RETURNING *`,
      bindAs
    );
    if (!r.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
    return res.json(coercePedidoLatLng(r.rows[0]));
  } catch (error) {
    return res.status(500).json({ error: "No se pudo asignar técnico", detail: error.message });
  }
});

export default router;

