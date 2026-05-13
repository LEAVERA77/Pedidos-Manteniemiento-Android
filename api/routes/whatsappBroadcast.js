import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { sendTenantWhatsAppText } from "../services/whatsappService.js";
import { normalizeBusinessTypeInput } from "../services/businessType.js";
import {
  getTenantConfiguracionForWhatsappAreas,
  normalizeArgentinaMobileWithTenantAreaConfig,
} from "../utils/whatsappArAreaConfig.js";
import {
  appendBroadcastFooter,
  getBroadcastPacingConfig,
  getBroadcastSyncMaxRecipients,
  sleepAfterOutgoingMessage,
} from "../utils/whatsappBroadcastPacing.js";
import { bumpBroadcastMessagesSent, getBroadcastMetricsReport } from "../services/broadcastReplyMetrics.js";
import { evaluateWarmupForBroadcast, getWarmupStatusPayload } from "../utils/whatsappBroadcastWarmup.js";

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

/**
 * Destinatarios masivos: **solo móviles** AR (54 + 9 + área). Excluye fijos (54 sin 9).
 * Une `pedidos.telefono_contacto` y `socios_catalogo.telefono` del tenant (y rubro si existe la columna).
 */
async function telefonosMovilesPedidosYSociosTenantBusiness(tenantId, businessType) {
  const hasBtP = await tableHasColumn("pedidos", "business_type");
  const cfg = await getTenantConfiguracionForWhatsappAreas(tenantId);

  const paramsP = [tenantId];
  let whP = "tenant_id = $1 AND telefono_contacto IS NOT NULL AND TRIM(telefono_contacto::text) <> ''";
  if (hasBtP && businessType) {
    paramsP.push(businessType);
    whP += ` AND (business_type = $${paramsP.length} OR business_type IS NULL OR TRIM(business_type::text) = '')`;
  }
  const hasLocP = await tableHasColumn("pedidos", "cliente_localidad");
  const rP = await query(
    hasLocP
      ? `SELECT TRIM(telefono_contacto::text) AS raw,
                NULLIF(TRIM(COALESCE(cliente_localidad::text, '')), '') AS loc
         FROM pedidos WHERE ${whP}
         GROUP BY TRIM(telefono_contacto::text), NULLIF(TRIM(COALESCE(cliente_localidad::text, '')), '')`
      : `SELECT DISTINCT TRIM(telefono_contacto::text) AS raw, NULL::text AS loc FROM pedidos WHERE ${whP}`,
    paramsP
  );

  let rS = { rows: [] };
  try {
    const hasTS = await tableHasColumn("socios_catalogo", "tenant_id");
    const hasBtS = await tableHasColumn("socios_catalogo", "business_type");
    const hasLocS = await tableHasColumn("socios_catalogo", "localidad");
    if (hasTS) {
      const paramsS = [tenantId];
      const hasAcepta = await tableHasColumn("socios_catalogo", "acepta_avisos");
      let whS = `tenant_id = $1 AND COALESCE(activo, TRUE) AND telefono IS NOT NULL AND TRIM(telefono::text) <> ''`;
      if (hasAcepta) {
        whS += ` AND COALESCE(acepta_avisos, TRUE) = TRUE`;
      }
      if (hasBtS && businessType) {
        paramsS.push(businessType);
        whS += ` AND (business_type = $${paramsS.length} OR business_type IS NULL OR TRIM(business_type::text) = '')`;
      }
      rS = await query(
        hasLocS
          ? `SELECT TRIM(telefono::text) AS raw,
                    NULLIF(TRIM(COALESCE(localidad::text, '')), '') AS loc
             FROM socios_catalogo WHERE ${whS}
             GROUP BY TRIM(telefono::text), NULLIF(TRIM(COALESCE(localidad::text, '')), '')`
          : `SELECT DISTINCT TRIM(telefono::text) AS raw, NULL::text AS loc FROM socios_catalogo WHERE ${whS}`,
        paramsS
      );
    }
  } catch (e) {
    console.warn("[whatsappBroadcast] socios_catalogo", e?.message || e);
  }

  const out = new Set();
  for (const row of [...(rP.rows || []), ...(rS.rows || [])]) {
    const norm = normalizeArgentinaMobileWithTenantAreaConfig(row.raw, cfg, row.loc);
    if (norm && norm.length >= 12) out.add(norm);
  }
  return [...out];
}

async function resolveBroadcastPhones(tenantId, businessType) {
  const rawTels = await telefonosMovilesPedidosYSociosTenantBusiness(tenantId, businessType);
  const warm = await evaluateWarmupForBroadcast(tenantId, rawTels.length);
  if (!warm.allowed) {
    return { ok: false, error: warm.error, telefonos: [], warmup: warm, requested: rawTels.length };
  }
  return {
    ok: true,
    telefonos: rawTels.slice(0, warm.cap),
    warmup: warm,
    requested: rawTels.length,
  };
}

async function sumDestinatariosBroadcastHoy(tenantId) {
  try {
    const r = await query(
      `SELECT COALESCE(SUM(destinatarios_total), 0)::int AS s
       FROM comunicaciones_envios
       WHERE tenant_id = $1
         AND created_at >= date_trunc('day', NOW())
         AND (meta->>'kind') IN ('community', 'corte_programado')`,
      [tenantId]
    );
    return Number(r.rows?.[0]?.s) || 0;
  } catch (_) {
    return 0;
  }
}

function assertBroadcastLimits(cfg, tenantId, total, sumHoy) {
  if (cfg.maxPerJob > 0 && total > cfg.maxPerJob) {
    return {
      ok: false,
      error: `La campaña supera el máximo por envío (${cfg.maxPerJob} destinatarios). Ajustá WHAPI_BROADCAST_MAX_PER_JOB / BROADCAST_MAX_PER_JOB o segmentá la audiencia.`,
    };
  }
  if (cfg.maxPerDay > 0 && sumHoy + total > cfg.maxPerDay) {
    return {
      ok: false,
      error: `Límite diario de destinatarios (${cfg.maxPerDay}) superado (hoy acumulado: ${sumHoy}). Reintentá mañana o subí WHAPI_BROADCAST_MAX_PER_DAY / BROADCAST_MAX_PER_DAY.`,
    };
  }
  return { ok: true };
}

async function insertComunicacionEnvio({
  tenantId,
  businessType,
  titulo,
  cuerpo,
  imagenUrl,
  botones,
  destinatariosTotal,
  enviadosOk,
  enviadosError,
  meta,
  userId,
}) {
  try {
    const r = await query(
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
        imagenUrl || null,
        JSON.stringify(Array.isArray(botones) ? botones.slice(0, 3) : []),
        destinatariosTotal,
        enviadosOk,
        enviadosError,
        JSON.stringify(meta || {}),
        userId ?? null,
      ]
    );
    return r.rows?.[0]?.id ?? null;
  } catch (e) {
    console.warn("[whatsappBroadcast] insert comunicaciones_envios", e?.message || e);
    return null;
  }
}

async function finalizeComunicacionBroadcast(id, { ok, err, erroresDetalle, duracionMs, status, abortReason }) {
  const metaPatch = {
    broadcast_status: status,
    broadcast_finished_at: new Date().toISOString(),
  };
  if (abortReason) metaPatch.broadcast_abort_reason = abortReason;
  try {
    await query(
      `UPDATE comunicaciones_envios
       SET enviados_ok = $2,
           enviados_error = $3,
           duracion_ms = $4,
           reintentos_total = COALESCE(reintentos_total, 0),
           errores_detalle = $5::jsonb,
           meta = COALESCE(meta, '{}'::jsonb) || $6::jsonb
       WHERE id = $1`,
      [id, ok, err, duracionMs, JSON.stringify(erroresDetalle || []), JSON.stringify(metaPatch)]
    );
  } catch (e) {
    console.warn("[whatsappBroadcast] finalize comunicacion", e?.message || e);
  }
}

async function executeBroadcastSendLoop({ tenantId, telefonos, bodyText, logContext, comunicacionId }) {
  const cfg = getBroadcastPacingConfig();
  const start = Date.now();
  let ok = 0;
  let err = 0;
  const erroresDetalle = [];
  const list = Array.isArray(telefonos) ? telefonos : [];
  for (let i = 0; i < list.length; i++) {
    const to = list[i];
    const rSend = await sendTenantWhatsAppText({
      tenantId,
      toDigits: to,
      bodyText,
      pedidoId: null,
      logContext,
    });
    if (rSend.ok) ok += 1;
    else {
      err += 1;
      erroresDetalle.push({ telefono: to, error: String(rSend.error || rSend.graph?.error?.message || "send_failed") });
    }
    if (comunicacionId && ((i + 1) % 10 === 0 || i === list.length - 1)) {
      try {
        await query(`UPDATE comunicaciones_envios SET enviados_ok = $2, enviados_error = $3 WHERE id = $1`, [
          comunicacionId,
          ok,
          err,
        ]);
      } catch (_) {}
    }
    if (i < list.length - 1) {
      await sleepAfterOutgoingMessage(cfg, i);
    }
  }
  return {
    ok,
    err,
    erroresDetalle,
    duracionMs: Date.now() - start,
  };
}

async function runCommunityBroadcastJob(comunicacionId) {
  const t0 = Date.now();
  let row;
  try {
    const r = await query(
      `UPDATE comunicaciones_envios
       SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb
       WHERE id = $1
         AND (meta->>'broadcast_status') = 'queued'
       RETURNING id, tenant_id, business_type, cuerpo, titulo`,
      [
        comunicacionId,
        JSON.stringify({
          broadcast_status: "running",
          broadcast_started_at: new Date().toISOString(),
        }),
      ]
    );
    row = r.rows?.[0];
  } catch (e) {
    console.error("[whatsappBroadcast] job claim community", e);
    return;
  }
  if (!row) {
    return;
  }

  const resolved = await resolveBroadcastPhones(row.tenant_id, row.business_type);
  if (!resolved.ok) {
    await finalizeComunicacionBroadcast(comunicacionId, {
      ok: 0,
      err: 0,
      erroresDetalle: [{ error: resolved.error }],
      duracionMs: Date.now() - t0,
      status: "error",
      abortReason: resolved.error,
    });
    return;
  }
  const telefonos = resolved.telefonos;
  const bodyText = String(row.cuerpo || "");
  const result = await executeBroadcastSendLoop({
    tenantId: row.tenant_id,
    telefonos,
    bodyText,
    logContext: "broadcast_comunidad",
    comunicacionId,
  });

  await finalizeComunicacionBroadcast(comunicacionId, {
    ...result,
    status: "done",
  });
  await bumpBroadcastMessagesSent(row.tenant_id, result.ok);
  console.log("[whatsappBroadcast] community job done", {
    id: comunicacionId,
    ms: Date.now() - t0,
    dest: telefonos.length,
    ok: result.ok,
    err: result.err,
  });
}

async function runCorteBroadcastJob(comunicacionId) {
  const t0 = Date.now();
  let row;
  try {
    const r = await query(
      `UPDATE comunicaciones_envios
       SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb
       WHERE id = $1
         AND (meta->>'broadcast_status') = 'queued'
       RETURNING id, tenant_id, business_type, cuerpo, meta`,
      [
        comunicacionId,
        JSON.stringify({
          broadcast_status: "running",
          broadcast_started_at: new Date().toISOString(),
        }),
      ]
    );
    row = r.rows?.[0];
  } catch (e) {
    console.error("[whatsappBroadcast] job claim corte", e);
    return;
  }
  if (!row) return;

  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const zona = String(meta.zona_afectada || "").trim();
  const motivo = String(meta.motivo || "").trim();
  const fi = meta.fecha_inicio ?? null;
  const ff = meta.fecha_fin ?? null;

  const resolved = await resolveBroadcastPhones(row.tenant_id, row.business_type);
  if (!resolved.ok) {
    await finalizeComunicacionBroadcast(comunicacionId, {
      ok: 0,
      err: 0,
      erroresDetalle: [{ error: resolved.error }],
      duracionMs: Date.now() - t0,
      status: "error",
      abortReason: resolved.error,
    });
    return;
  }
  const telefonos = resolved.telefonos;
  const bodyText = String(row.cuerpo || "");
  const result = await executeBroadcastSendLoop({
    tenantId: row.tenant_id,
    telefonos,
    bodyText,
    logContext: "broadcast_corte_programado",
    comunicacionId,
  });

  await finalizeComunicacionBroadcast(comunicacionId, {
    ...result,
    status: "done",
  });

  await bumpBroadcastMessagesSent(row.tenant_id, result.ok);

  try {
    await query(
      `INSERT INTO cortes_programados(
          tenant_id, business_type, zona_afectada, fecha_inicio, fecha_fin, motivo, mensaje_enviado, mensaje_texto
        ) VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,TRUE,$7)`,
      [row.tenant_id, row.business_type, zona || null, fi || null, ff || null, motivo || null, bodyText]
    );
  } catch (e) {
    console.warn("[whatsappBroadcast] cortes_programados insert", e?.message || e);
  }

  console.log("[whatsappBroadcast] corte job done", {
    id: comunicacionId,
    ms: Date.now() - t0,
    dest: telefonos.length,
    ok: result.ok,
    err: result.err,
  });
}

/** GET estado de un envío masivo (fila comunicaciones_envios). */
router.get("/status/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "id inválido" });
    }
    const r = await query(
      `SELECT id, destinatarios_total, enviados_ok, enviados_error, duracion_ms, meta, created_at
       FROM comunicaciones_envios
       WHERE id = $1 AND tenant_id = $2`,
      [id, req.tenantId]
    );
    const row = r.rows?.[0];
    if (!row) {
      return res.status(404).json({ error: "No encontrado" });
    }
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
    return res.json({
      ok: true,
      id: row.id,
      destinatarios_total: row.destinatarios_total,
      enviados_ok: row.enviados_ok,
      enviados_error: row.enviados_error,
      duracion_ms: row.duracion_ms,
      broadcast_status: meta.broadcast_status || null,
      kind: meta.kind || null,
      created_at: row.created_at,
    });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo leer el estado", detail: e.message });
  }
});

router.get("/metrics", async (req, res) => {
  try {
    const [warmup, rep] = await Promise.all([
      getWarmupStatusPayload(req.tenantId),
      getBroadcastMetricsReport(req.tenantId, { days: 7, lowRatioPct: 20, consecutiveRequired: 3 }),
    ]);
    return res.json({
      ok: true,
      warmup,
      metrics_avg_ratio_7d: rep.avg_ratio_7d,
      low_ratio_alert: rep.low_ratio_alert,
      consecutive_low_days: rep.consecutive_low_days,
      daily: rep.rows,
      guide_url: warmup.guide_url,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/community", async (req, res) => {
  try {
    if (req.body?.confirm !== true && String(req.body?.confirm).toLowerCase() !== "true") {
      return res.status(400).json({ error: "confirm: true requerido para envío masivo" });
    }
    const titulo = String(req.body?.titulo || "").trim();
    let mensaje = String(req.body?.mensaje || "").trim();
    if (!mensaje) return res.status(400).json({ error: "mensaje requerido" });

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
    let cuerpo = titulo ? `*${titulo}*\n\n${mensaje}` : mensaje;
    cuerpo = appendBroadcastFooter(cuerpo);

    const cfg = getBroadcastPacingConfig();
    const resolved = await resolveBroadcastPhones(req.tenantId, bt);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.error });
    }
    const tels = resolved.telefonos;
    const warmupWarning = resolved.warmup?.warning || null;
    if (!tels.length) {
      return res.status(400).json({
        error:
          "No hay teléfonos móviles válidos en pedidos ni en el catálogo de socios (se excluyen fijos y números mal cargados). En Empresa podés cargar característica por localidad (343 vs 3438, etc.) y un respaldo para números 15… incompletos.",
      });
    }

    const sumHoy = await sumDestinatariosBroadcastHoy(req.tenantId);
    const lim = assertBroadcastLimits(cfg, req.tenantId, tels.length, sumHoy);
    if (!lim.ok) {
      return res.status(400).json({ error: lim.error });
    }

    const syncMax = getBroadcastSyncMaxRecipients();
    const useAsync = tels.length > syncMax;

    if (useAsync) {
      const comunicacionId = await insertComunicacionEnvio({
        tenantId: req.tenantId,
        businessType: bt,
        titulo,
        cuerpo,
        imagenUrl: req.body?.imagen_url || null,
        botones: req.body?.botones,
        destinatariosTotal: tels.length,
        enviadosOk: 0,
        enviadosError: 0,
        meta: { kind: "community", broadcast_status: "queued" },
        userId: req.user?.id,
      });
      if (!comunicacionId) {
        return res.status(503).json({
          error:
            "No se pudo registrar el envío en base de datos; no se inició la cola. Revisá la tabla comunicaciones_envios.",
        });
      }
      setImmediate(() => {
        runCommunityBroadcastJob(comunicacionId).catch((e) => {
          console.error("[whatsappBroadcast] community async job", e);
          finalizeComunicacionBroadcast(comunicacionId, {
            ok: 0,
            err: 0,
            erroresDetalle: [{ error: String(e?.message || e) }],
            duracionMs: 0,
            status: "error",
            abortReason: String(e?.message || e),
          });
        });
      });
      return res.status(202).json({
        ok: true,
        async: true,
        comunicacion_id: comunicacionId,
        destinatarios: tels.length,
        business_type: bt,
        warmup_warning: warmupWarning,
        message:
          "Envío masivo iniciado en segundo plano con intervalos seguros (anti-bloqueo). Consultá GET /api/whatsapp/broadcast/status/:id para el progreso.",
      });
    }

    const result = await executeBroadcastSendLoop({
      tenantId: req.tenantId,
      telefonos: tels,
      bodyText: cuerpo,
      logContext: "broadcast_comunidad",
    });

    await insertComunicacionEnvio({
      tenantId: req.tenantId,
      businessType: bt,
      titulo,
      cuerpo,
      imagenUrl: req.body?.imagen_url || null,
      botones: req.body?.botones,
      destinatariosTotal: tels.length,
      enviadosOk: result.ok,
      enviadosError: result.err,
      meta: {
        kind: "community",
        broadcast_status: "done",
        sync: true,
      },
      userId: req.user?.id,
    });

    await bumpBroadcastMessagesSent(req.tenantId, result.ok);

    return res.json({
      ok: true,
      async: false,
      destinatarios: tels.length,
      enviados_ok: result.ok,
      enviados_error: result.err,
      business_type: bt,
      warmup_warning: warmupWarning,
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
    let cuerpo = [
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
    cuerpo = appendBroadcastFooter(cuerpo);

    const cfg = getBroadcastPacingConfig();
    const resolved = await resolveBroadcastPhones(req.tenantId, bt);
    if (!resolved.ok) {
      return res.status(400).json({ error: resolved.error });
    }
    const tels = resolved.telefonos;
    const warmupWarning = resolved.warmup?.warning || null;
    if (!tels.length) {
      return res.status(400).json({
        error:
          "No hay teléfonos móviles en pedidos ni en socios para avisar (WhatsApp solo a celulares; los fijos se omiten). Revisá teléfonos en reclamos y padrón, y en Empresa la característica por localidad o la lista de prefijos (3438,343,…).",
      });
    }

    const sumHoy = await sumDestinatariosBroadcastHoy(req.tenantId);
    const lim = assertBroadcastLimits(cfg, req.tenantId, tels.length, sumHoy);
    if (!lim.ok) {
      return res.status(400).json({ error: lim.error });
    }

    const syncMax = getBroadcastSyncMaxRecipients();
    const useAsync = tels.length > syncMax;

    if (useAsync) {
      const comunicacionId = await insertComunicacionEnvio({
        tenantId: req.tenantId,
        businessType: bt,
        titulo: `Corte programado — ${zona}`,
        cuerpo,
        imagenUrl: null,
        botones: [],
        destinatariosTotal: tels.length,
        enviadosOk: 0,
        enviadosError: 0,
        meta: {
          kind: "corte_programado",
          broadcast_status: "queued",
          zona_afectada: zona,
          motivo,
          fecha_inicio: fi || null,
          fecha_fin: ff || null,
        },
        userId: req.user?.id,
      });
      if (!comunicacionId) {
        return res.status(503).json({ error: "No se pudo registrar el envío; no se inició la cola." });
      }
      setImmediate(() => {
        runCorteBroadcastJob(comunicacionId).catch((e) => {
          console.error("[whatsappBroadcast] corte async job", e);
          finalizeComunicacionBroadcast(comunicacionId, {
            ok: 0,
            err: 0,
            erroresDetalle: [{ error: String(e?.message || e) }],
            duracionMs: 0,
            status: "error",
            abortReason: String(e?.message || e),
          });
        });
      });
      return res.status(202).json({
        ok: true,
        async: true,
        comunicacion_id: comunicacionId,
        destinatarios: tels.length,
        warmup_warning: warmupWarning,
        message:
          "Aviso de corte iniciado en segundo plano. Consultá GET /api/whatsapp/broadcast/status/:id para el progreso.",
      });
    }

    const result = await executeBroadcastSendLoop({
      tenantId: req.tenantId,
      telefonos: tels,
      bodyText: cuerpo,
      logContext: "broadcast_corte_programado",
    });

    try {
      await query(
        `INSERT INTO cortes_programados(
          tenant_id, business_type, zona_afectada, fecha_inicio, fecha_fin, motivo, mensaje_enviado, mensaje_texto
        ) VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,TRUE,$7)`,
        [req.tenantId, bt, zona || null, fi || null, ff || null, motivo || null, cuerpo]
      );
    } catch (e) {
      console.warn("[whatsappBroadcast] cortes_programados", e?.message || e);
    }

    await insertComunicacionEnvio({
      tenantId: req.tenantId,
      businessType: bt,
      titulo: `Corte programado — ${zona}`,
      cuerpo,
      imagenUrl: null,
      botones: [],
      destinatariosTotal: tels.length,
      enviadosOk: result.ok,
      enviadosError: result.err,
      meta: { kind: "corte_programado", broadcast_status: "done", sync: true },
      userId: req.user?.id,
    });

    await bumpBroadcastMessagesSent(req.tenantId, result.ok);

    return res.json({
      ok: true,
      async: false,
      destinatarios: tels.length,
      enviados_ok: result.ok,
      enviados_error: result.err,
      warmup_warning: warmupWarning,
    });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo registrar el corte programado", detail: e.message });
  }
});

export default router;
