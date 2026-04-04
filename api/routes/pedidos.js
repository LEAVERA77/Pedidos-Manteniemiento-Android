import express from "express";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { parseFotosBase64, splitUrls, toJoinedUrls } from "../utils/helpers.js";
import { uploadManyBase64 } from "../services/cloudinary.js";
import { getUserTenantId } from "../utils/tenantUser.js";
import {
  tipoTrabajoPermitidoParaNuevoPedido,
  tiposReclamoParaClienteTipo,
} from "../services/tiposReclamo.js";
import {
  notifyPedidoCierreWhatsAppSafe,
  notifyPedidoClienteActualizacionWhatsAppSafe,
} from "../services/whatsappService.js";

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

/** Pedidos cargados por el bot WA: avisar al vecino cuando el técnico (app/web) ejecuta o informa avance. */
function scheduleNotifyClientePedidoWhatsapp({
  pedidoAntes,
  pedidoDespues,
  body,
  userId,
  estadoAntes,
}) {
  const origenWa = String(pedidoAntes.origen_reclamo || "").toLowerCase() === "whatsapp";
  if (!origenWa) return;

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
      distribuidor,
      setd,
      cliente,
      cliente_nombre,
      tipo_trabajo,
      descripcion,
      prioridad = "Media",
      lat,
      lng,
      telefono_contacto,
      nis,
      medidor,
    } = req.body;

    const tenantId = await getUserTenantId(req.user.id);
    const cr = await query(`SELECT tipo FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
    const tipoCliente = cr.rows?.[0]?.tipo ?? null;
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

    // Compatibilidad: por ahora no forzamos nis/medidor.
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

    const insert = await query(
      `INSERT INTO pedidos (
        numero_pedido, distribuidor, setd, cliente, tipo_trabajo, descripcion, prioridad,
        estado, avance, lat, lng, usuario_id, usuario_creador_id, fecha_creacion,
        telefono_contacto, cliente_nombre, foto_urls, nis, medidor
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        'Pendiente',0,$8,$9,$10,$10,NOW(),
        $11,$12,$13,$14,$15
      ) RETURNING *`,
      [
        numeroPedido,
        distribuidor || null,
        setd || null,
        cliente || null,
        tipo_trabajo || null,
        descripcion || null,
        prioridad || "Media",
        lat ?? null,
        lng ?? null,
        req.user.id,
        telefono_contacto || null,
        cliente_nombre || cliente || null,
        toJoinedUrls(fotoUrls) || null,
        nis || null,
        medidor || null,
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
         nis = COALESCE($10, nis),
         medidor = COALESCE($11, medidor),
         cliente_nombre = COALESCE($12, cliente_nombre),
         cliente_direccion = COALESCE($13, cliente_direccion),
         cliente_numero_puerta = COALESCE($14, cliente_numero_puerta),
         cliente_referencia = COALESCE($15, cliente_referencia),
         telefono_contacto = COALESCE($16, telefono_contacto)
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
      ]
    );
    const updated = r.rows[0];
    const becameCerrado = String(estado || "") === "Cerrado" && estadoAntes !== "Cerrado";
    if (becameCerrado) {
      scheduleNotifyCierreWhatsApp(updated, telefono_contacto, req.user.id);
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

