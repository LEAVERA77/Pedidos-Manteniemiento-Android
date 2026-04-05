import express from "express";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { parseFotosBase64, splitUrls, toJoinedUrls } from "../utils/helpers.js";
import { uploadManyBase64 } from "../services/cloudinary.js";
import { getUserTenantId } from "../utils/tenantUser.js";
import {
  tipoTrabajoPermitidoParaNuevoPedido,
  tiposReclamoParaClienteTipo,
  normalizarPrioridadPedido,
  normalizarRubroCliente,
} from "../services/tiposReclamo.js";
import {
  notifyPedidoCierreWhatsAppSafe,
  notifyPedidoClienteActualizacionWhatsAppSafe,
} from "../services/whatsappService.js";
import { enqueueNotificacionPedidoCerradoParaTecnico } from "../services/notificacionesMovilEnqueue.js";
import {
  lookupDistribuidorTrafoPorNisMedidor,
  contarPedidosAbiertosMismaZona,
  OUTAGE_SECTOR_MULTI_RECLAMO,
} from "../services/pedidoZonaOutage.js";

const router = express.Router();
router.use(authMiddleware);

let _pedidosHasTenantId;
async function pedidosTableHasTenantId() {
  if (_pedidosHasTenantId !== undefined) return _pedidosHasTenantId;
  try {
    const c = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'tenant_id' LIMIT 1`
    );
    _pedidosHasTenantId = c.rows.length > 0;
  } catch {
    _pedidosHasTenantId = false;
  }
  return _pedidosHasTenantId;
}

async function assertPedidoMismoTenant(pedido, userId) {
  if (!(await pedidosTableHasTenantId())) return;
  if (pedido.tenant_id == null) return;
  const ut = await getUserTenantId(userId);
  if (Number(pedido.tenant_id) !== Number(ut)) {
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

function scheduleNotifyCierreWhatsApp(row, bodyTelefono, userId) {
  setImmediate(() => {
    (async () => {
      try {
        const tenantId =
          row.tenant_id != null && Number.isFinite(Number(row.tenant_id))
            ? Number(row.tenant_id)
            : await getUserTenantId(userId);
        const nombreEntidad = await loadNombreCliente(tenantId);
        const phone = bodyTelefono !== undefined && bodyTelefono !== null ? bodyTelefono : row.telefono_contacto;
        await notifyPedidoCierreWhatsAppSafe({
          tenantId,
          numeroPedido: row.numero_pedido,
          nombreEntidad,
          telefonoContactoRaw: phone,
          pedidoId: row.id,
        });
      } catch (e) {
        console.error("[pedidos] notify cierre WA (no bloqueante)", e.message);
      }
    })();
  });
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

async function getPedidoById(id) {
  const r = await query("SELECT * FROM pedidos WHERE id = $1 LIMIT 1", [id]);
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

    const tenantId = await getUserTenantId(req.user.id);
    const cr = await query(`SELECT tipo FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
    const tipoCliente = cr.rows?.[0]?.tipo ?? null;
    const rubro = normalizarRubroCliente(tipoCliente);
    const barrioBody = String(barrioBodyRaw || "").trim() || null;
    const distribuidorBody = String(distribuidorBodyRaw || "").trim() || null;
    const tt = String(tipo_trabajo || "").trim();
    if (!tt) {
      return res.status(400).json({ error: "tipo_trabajo es requerido" });
    }
    if (!tipoTrabajoPermitidoParaNuevoPedido(tt, tipoCliente)) {
      return res.status(400).json({
        error: "tipo_trabajo no permitido para el rubro del cliente",
        tipos_permitidos: tiposReclamoParaClienteTipo(tipoCliente),
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

    const insert = await query(
      `INSERT INTO pedidos (
        numero_pedido, distribuidor, trafo, cliente, tipo_trabajo, descripcion, prioridad,
        estado, avance, lat, lng, usuario_id, usuario_creador_id, fecha_creacion,
        telefono_contacto, cliente_nombre, foto_urls, nis, medidor,
        cliente_calle, cliente_localidad, cliente_numero_puerta, cliente_direccion,
        suministro_tipo_conexion, suministro_fases, barrio
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        'Pendiente',0,$8,$9,$10,$10,NOW(),
        $11,$12,$13,$14,$15,
        $16,$17,$18,$19,
        $20,$21,$22
      ) RETURNING *`,
      [
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
        cliente_numero_puerta ?? null,
        cliente_direccion ?? null,
        stc,
        sfa,
        barrioFinal,
      ]
    );
    return res.status(201).json(insert.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: "No se pudo crear el pedido", detail: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { estado, limit = 300 } = req.query;
    const params = [];
    const where = [];
    if (estado) {
      params.push(estado);
      where.push(`estado = $${params.length}`);
    }
    if (req.user.rol !== "admin") {
      params.push(req.user.id);
      where.push(`(tecnico_asignado_id = $${params.length} OR usuario_id = $${params.length})`);
    }
    params.push(Number(limit));
    const sql = `
      SELECT * FROM pedidos
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY fecha_creacion DESC
      LIMIT $${params.length}
    `;
    const r = await query(sql, params);
    const rows = r.rows.map((p) => ({ ...p, fotos: splitUrls(p.foto_urls) }));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: "No se pudieron listar pedidos", detail: error.message });
  }
});

router.get("/mis-pedidos", async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM pedidos
       WHERE tecnico_asignado_id = $1 OR usuario_id = $1
       ORDER BY fecha_creacion DESC
       LIMIT 500`,
      [req.user.id]
    );
    return res.json(r.rows.map((p) => ({ ...p, fotos: splitUrls(p.foto_urls) })));
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

    const r = await query(
      `SELECT * FROM pedidos WHERE ${where.join(" OR ")} ORDER BY fecha_creacion DESC LIMIT 200`,
      params
    );
    return res.json(r.rows);
  } catch (error) {
    return res.status(500).json({ error: "Error en búsqueda", detail: error.message });
  }
});

router.get("/historial/nis/:nis", async (req, res) => {
  try {
    const nis = String(req.params.nis || "").trim();
    if (!nis) return res.status(400).json({ error: "NIS requerido" });
    const r = await query("SELECT * FROM pedidos WHERE nis = $1 ORDER BY fecha_creacion DESC", [nis]);
    return res.json(r.rows);
  } catch (error) {
    return res.status(500).json({ error: "No se pudo obtener historial", detail: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const p = await getPedidoById(req.params.id);
    if (!p) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(p, req.user.id);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (req.user.rol !== "admin" && p.tecnico_asignado_id && p.tecnico_asignado_id !== req.user.id) {
      return res.status(403).json({ error: "Sin permiso para ver este pedido" });
    }
    return res.json({ ...p, fotos: splitUrls(p.foto_urls) });
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
    const pedido = await getPedidoById(id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req.user.id);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (req.user.rol !== "admin" && pedido.tecnico_asignado_id && pedido.tecnico_asignado_id !== req.user.id) {
      return res.status(403).json({ error: "Sin permiso para notificar este pedido" });
    }

    const ut = await getUserTenantId(req.user.id);
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

router.post("/:id/notify-cierre-whatsapp", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = await getPedidoById(id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req.user.id);
    } catch (e) {
      if (e.statusCode === 403) return res.status(403).json({ error: e.message });
      throw e;
    }
    if (String(pedido.estado || "") !== "Cerrado") {
      return res.status(400).json({ error: "El pedido debe estar en estado Cerrado" });
    }
    const ut = await getUserTenantId(req.user.id);
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

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = await getPedidoById(id);
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    try {
      await assertPedidoMismoTenant(pedido, req.user.id);
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
    } = req.body;

    const fotosB64 = parseFotosBase64(req.body);
    let mergedUrls = splitUrls(pedido.foto_urls);
    if (fotosB64.length) {
      const newUrls = await uploadManyBase64(fotosB64);
      mergedUrls = [...mergedUrls, ...newUrls];
    }

    const estadoAntes = String(pedido.estado || "");
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
         cliente_localidad = COALESCE($19, cliente_localidad)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        estado ?? null,
        avance ?? null,
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
      ]
    );
    const updated = r.rows[0];
    const becameCerrado = String(estado || "") === "Cerrado" && estadoAntes !== "Cerrado";
    if (becameCerrado) {
      scheduleNotifyCierreWhatsApp(updated, telefono_contacto, req.user.id);
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
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar pedido", detail: error.message });
  }
});

router.put("/:id/asignar", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const tecnicoAsignadoId = Number(req.body.tecnico_asignado_id);
    if (!tecnicoAsignadoId) return res.status(400).json({ error: "tecnico_asignado_id es requerido" });

    const ru = await query("SELECT id, rol, activo FROM usuarios WHERE id = $1 LIMIT 1", [tecnicoAsignadoId]);
    if (!ru.rows.length || !ru.rows[0].activo) return res.status(400).json({ error: "Técnico inválido o inactivo" });

    const r = await query(
      `UPDATE pedidos
       SET tecnico_asignado_id = $2, fecha_asignacion = NOW(), asignado_por_id = $3
       WHERE id = $1
       RETURNING *`,
      [id, tecnicoAsignadoId, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
    return res.json(r.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: "No se pudo asignar técnico", detail: error.message });
  }
});

export default router;

