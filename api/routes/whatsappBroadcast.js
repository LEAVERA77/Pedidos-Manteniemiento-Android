import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { normalizeBusinessTypeInput } from "../services/businessType.js";
import { enqueueBroadcastJob } from "../services/broadcastQueue.js";

const router = express.Router();
router.use(authWithTenantHost, adminOnly);

function aplicarPlaceholders(texto, ctx) {
  let s = String(texto || "");
  const map = {
    "{ciudad}": ctx.ciudad || "",
    "{fecha}": ctx.fecha || "",
    "{horario}": ctx.horario || "",
    "{direccion}": ctx.direccion || "",
    "{telefono}": ctx.telefono || "",
  };
  for (const [k, v] of Object.entries(map)) {
    s = s.split(k).join(v);
  }
  return s;
}

function parseTextArray(v) {
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 40);
  }
  if (typeof v === "string" && v.trim()) {
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 40);
  }
  return [];
}

async function telefonosPedidosTenantBusiness(tenantId, businessType) {
  const hasBt = await tableHasColumn("pedidos", "business_type");
  const params = [tenantId];
  let wh = "tenant_id = $1 AND telefono_contacto IS NOT NULL AND TRIM(telefono_contacto::text) <> ''";
  if (hasBt && businessType) {
    params.push(businessType);
    wh += ` AND business_type = $${params.length}`;
  }
  const r = await query(
    `SELECT DISTINCT telefono_contacto FROM pedidos WHERE ${wh}`,
    params
  );
  const out = new Set();
  for (const row of r.rows || []) {
    const d = String(row.telefono_contacto || "").replace(/\D/g, "");
    if (d.length >= 8) out.add(d);
  }
  return [...out];
}

async function tryInsertComunicacionEnvio({
  tenantId,
  businessType,
  titulo,
  cuerpo,
  imagenUrl = null,
  botones = [],
  destinatarios,
  kind,
  userId,
}) {
  try {
    const ins = await query(
      `INSERT INTO comunicaciones_envios(
        tenant_id, business_type, canal, titulo, cuerpo, imagen_url, botones_json,
        destinatarios_total, enviados_ok, enviados_error, meta, creado_por_usuario_id
      ) VALUES ($1,$2,'whatsapp',$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11)
      RETURNING id`,
      [
        tenantId,
        businessType,
        titulo || null,
        cuerpo,
        imagenUrl,
        JSON.stringify(Array.isArray(botones) ? botones.slice(0, 3) : []),
        destinatarios,
        0,
        0,
        JSON.stringify({ kind }),
        userId ?? null,
      ]
    );
    return Number(ins.rows?.[0]?.id || 0) || null;
  } catch (_) {
    return null;
  }
}

router.post("/community", async (req, res) => {
  try {
    if (req.body?.confirm !== true && String(req.body?.confirm).toLowerCase() !== "true") {
      return res.status(400).json({ error: "confirm: true requerido para envío masivo" });
    }
    const tipoAviso = String(req.body?.tipo_aviso || "general").trim().toLowerCase();
    const titulo = String(req.body?.titulo || "").trim();
    let mensaje = String(req.body?.mensaje || req.body?.texto_libre || "").trim();
    if (!mensaje) return res.status(400).json({ error: "mensaje/texto_libre requerido" });

    const bt = normalizeBusinessTypeInput(req.body?.business_type) || req.activeBusinessType || "electricidad";
    const now = new Date();
    const ctx = {
      ciudad: String(req.body?.ciudad_ctx || "").trim(),
      fecha: now.toLocaleDateString("es-AR"),
      horario: now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      direccion: String(req.body?.direccion_ctx || "").trim(),
      telefono: String(req.body?.telefono_ctx || "").trim(),
    };
    mensaje = aplicarPlaceholders(mensaje, ctx);
    const fenomeno = String(req.body?.fenomeno || "").trim();
    const ciudad = String(req.body?.ciudad || req.body?.ciudad_ctx || "").trim();
    const provincia = String(req.body?.provincia || "").trim();
    const calles = parseTextArray(req.body?.calles);
    const zonas = parseTextArray(req.body?.zonas);
    const areas = parseTextArray(req.body?.areas);
    const telefonos = parseTextArray(req.body?.telefonos);

    const cabecera = [];
    if (titulo) cabecera.push(`*${titulo}*`);
    if (fenomeno) cabecera.push(`Fenómeno: ${fenomeno}`);
    if (ciudad || provincia) cabecera.push(`Ubicación: ${[ciudad, provincia].filter(Boolean).join(", ")}`);
    if (zonas.length) cabecera.push(`Zonas: ${zonas.join(", ")}`);
    if (calles.length) cabecera.push(`Calles: ${calles.join(", ")}`);
    const cuerpo = [...cabecera, "", mensaje].filter(Boolean).join("\n");

    const tels = await telefonosPedidosTenantBusiness(req.tenantId, bt);
    if (!tels.length) {
      return res.status(400).json({ error: "No hay teléfonos de contacto en pedidos para este tenant y línea de negocio" });
    }

    const comunicacionId = await tryInsertComunicacionEnvio({
      tenantId: req.tenantId,
      businessType: bt,
      titulo,
      cuerpo,
      imagenUrl: req.body?.imagen_url || null,
      botones: req.body?.botones || [],
      destinatarios: tels.length,
      kind: "community",
      userId: req.user?.id ?? null,
    });

    let avisoId = null;
    try {
      const insAviso = await query(
        `INSERT INTO avisos_comunitarios(
          tenant_id, business_type, tipo_aviso, fenomeno, ciudad, provincia, calles, zonas,
          texto_libre, areas, telefonos, corte_programado, enviado_por, destinatarios_count
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8::text[],$9,$10::text[],$11::text[],$12::jsonb,$13,$14)
        RETURNING id`,
        [
          req.tenantId,
          bt,
          tipoAviso || "general",
          fenomeno || null,
          ciudad || null,
          provincia || null,
          calles,
          zonas,
          mensaje,
          areas,
          telefonos,
          null,
          req.user?.id ?? null,
          tels.length,
        ]
      );
      avisoId = Number(insAviso.rows?.[0]?.id || 0) || null;
    } catch (_) {}

    const metrics = await enqueueBroadcastJob({
      tenantId: req.tenantId,
      telefonos: tels,
      cuerpo,
      logContext: "broadcast_comunidad",
      comunicacionId,
      avisoId,
      maxRetries: 2,
    });

    return res.json({
      ok: true,
      destinatarios: tels.length,
      enviados_ok: metrics.ok,
      enviados_error: metrics.err,
      reintentos_total: metrics.reintentosTotal,
      duracion_ms: metrics.duracionMs,
      business_type: bt,
    });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo completar el envío masivo", detail: e.message });
  }
});

router.post("/corte-programado", async (req, res) => {
  try {
    if (req.body?.confirm !== true && String(req.body?.confirm).toLowerCase() !== "true") {
      return res.status(400).json({ error: "confirm: true requerido" });
    }
    const bt = normalizeBusinessTypeInput(req.body?.business_type) || req.activeBusinessType || "electricidad";
    if (bt === "municipio") {
      return res.status(400).json({ error: "Corte programado no aplica a municipio" });
    }
    const zona = String(req.body?.zona_afectada || "").trim();
    const motivo = String(req.body?.motivo || "").trim();
    const fi = req.body?.fecha_inicio;
    const ff = req.body?.fecha_fin;
    const servicio = bt === "agua" ? "AGUA POTABLE" : "ENERGÍA ELÉCTRICA";
    if (!zona || !motivo) return res.status(400).json({ error: "zona_afectada y motivo requeridos" });

    const extra = String(req.body?.mensaje || "").trim();
    const cuerpo = [
      `⚠️ CORTE PROGRAMADO DE ${servicio}`,
      "",
      `Zona: ${zona}`,
      `Desde: ${fi || "—"}`,
      `Hasta: ${ff || "—"}`,
      `Motivo: ${motivo}`,
      "",
      extra || "",
    ]
      .filter(Boolean)
      .join("\n");

    const tels = await telefonosPedidosTenantBusiness(req.tenantId, bt);
    if (!tels.length) {
      return res.status(400).json({ error: "No hay teléfonos en pedidos para avisar" });
    }

    const comunicacionId = await tryInsertComunicacionEnvio({
      tenantId: req.tenantId,
      businessType: bt,
      titulo: "Corte programado",
      cuerpo,
      destinatarios: tels.length,
      kind: "corte_programado",
      userId: req.user?.id ?? null,
    });

    try {
      await query(
        `INSERT INTO cortes_programados(
          tenant_id, business_type, zona_afectada, fecha_inicio, fecha_fin, motivo, mensaje_enviado, mensaje_texto
        ) VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,TRUE,$7)`,
        [req.tenantId, bt, zona || null, fi || null, ff || null, motivo || null, cuerpo]
      );
    } catch (_) {}

    let avisoId = null;
    try {
      const insAviso = await query(
        `INSERT INTO avisos_comunitarios(
          tenant_id, business_type, tipo_aviso, fenomeno, ciudad, provincia, calles, zonas,
          texto_libre, areas, telefonos, corte_programado, enviado_por, destinatarios_count
        ) VALUES ($1,$2,'corte_programado',$3,$4,$5,$6::text[],$7::text[],$8,$9::text[],$10::text[],$11::jsonb,$12,$13)
        RETURNING id`,
        [
          req.tenantId,
          bt,
          "Corte programado",
          String(req.body?.ciudad || "").trim() || null,
          String(req.body?.provincia || "").trim() || null,
          parseTextArray(req.body?.calles),
          parseTextArray(req.body?.zonas_afectadas || req.body?.zonas || zona),
          extra || null,
          parseTextArray(req.body?.areas),
          parseTextArray(req.body?.telefonos),
          JSON.stringify({
            tipo_corte: String(req.body?.tipo_corte || "").trim() || "Programado",
            zona_afectada: zona,
            fecha_inicio: fi || null,
            fecha_fin: ff || null,
            servicio_afectado: String(req.body?.servicio_afectado || servicio).trim(),
            motivo,
            afecta_servicio: req.body?.afecta_servicio ?? true,
          }),
          req.user?.id ?? null,
          tels.length,
        ]
      );
      avisoId = Number(insAviso.rows?.[0]?.id || 0) || null;
    } catch (_) {}

    const metrics = await enqueueBroadcastJob({
      tenantId: req.tenantId,
      telefonos: tels,
      cuerpo,
      logContext: "broadcast_corte_programado",
      comunicacionId,
      avisoId,
      maxRetries: 2,
    });

    return res.json({
      ok: true,
      destinatarios: tels.length,
      enviados_ok: metrics.ok,
      enviados_error: metrics.err,
      reintentos_total: metrics.reintentosTotal,
      duracion_ms: metrics.duracionMs,
    });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo registrar el corte programado", detail: e.message });
  }
});

export default router;
