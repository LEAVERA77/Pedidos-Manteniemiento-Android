import express from "express";
import { authWithTenantHost, adminOnly, tecnicoSupervisorOnly } from "../middleware/auth.js";
import { clasificarReclamoConGroq } from "../services/groqClassifier.js";
import { generarMensajeBroadcast } from "../services/groqBroadcastGenerator.js";
import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";
import { analizarReclamosConGroq } from "../services/groqAnalisisReclamos.js";
import { analizarAsignadosTecnicoConGroq } from "../services/groqAnalisisTecnicoAsignados.js";
import { sugerirKpisConGroq } from "../services/groqKpiSugeridos.js";
import { generarInformeConGroq } from "../services/groqGenerarInforme.js";
import { explicarKpisConGroq } from "../services/groqExplicarKpis.js";
import { generarMensajeDerivacionConGroq } from "../services/groqMensajeDerivacion.js";
import { parsePeriod } from "../utils/helpers.js";

const router = express.Router();

/**
 * POST /api/ia/clasificar-reclamo
 * Body: { texto, tipo_negocio }
 * Requiere autenticación (admin o técnico del tenant).
 */
router.post("/clasificar-reclamo", authWithTenantHost, async (req, res) => {
  try {
    const texto = String(req.body?.texto || "").trim();
    const tipoNegocio = String(req.body?.tipo_negocio || "").trim();
    if (!texto) {
      return res.status(400).json({ ok: false, error: "texto es requerido" });
    }
    if (!tipoNegocio) {
      return res.status(400).json({ ok: false, error: "tipo_negocio es requerido" });
    }
    const result = await clasificarReclamoConGroq({ texto, tipoNegocio });
    if (!result.ok) {
      return res.status(502).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[ia/clasificar-reclamo]", error);
    return res.status(500).json({ ok: false, error: "Error interno al clasificar reclamo" });
  }
});

/**
 * POST /api/ia/generar-aviso
 * Body: { titulo, tipo_negocio }
 * Genera un mensaje de aviso masivo con IA.
 */
router.post("/generar-aviso", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const titulo = String(req.body?.titulo || "").trim();
    const tipo_negocio = String(req.body?.tipo_negocio || "").trim();
    const nombre_tenant = String(req.body?.nombre_tenant || "").trim();
    if (!titulo) {
      return res.status(400).json({ ok: false, error: "titulo es requerido" });
    }
    const result = await generarMensajeBroadcast({ titulo, tipo_negocio, nombre_tenant });
    if (!result.ok) {
      return res.status(502).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[ia/generar-aviso]", error);
    return res.status(500).json({ ok: false, error: "Error interno al generar aviso" });
  }
});

/**
 * POST /api/ia/analizar-reclamos
 * Body: { tipo_negocio, periodo_dias? }
 * Ejecuta agregaciones SQL y opcionalmente pide recomendaciones a Groq.
 */
router.post("/analizar-reclamos", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const periodDias = Math.min(Math.max(Number(req.body?.periodo_dias) || 30, 1), 365);
    const bodyTid = Number(req.body?.tenant_id);
    if (Number.isFinite(bodyTid) && bodyTid > 0 && bodyTid !== Number(req.tenantId)) {
      console.warn("[ia/analizar-reclamos] body.tenant_id no coincide con sesión; se ignora", {
        bodyTid,
        auth: req.tenantId,
      });
    }
    const hasT = await pedidosTableHasTenantIdColumn();
    const tid = req.tenantId;

    const params = hasT ? [tid] : [];
    const bt = await pushPedidoBusinessFilter(req, params);
    const tsql = hasT ? " AND tenant_id = $1" : "";
    const since = `NOW() - INTERVAL '${periodDias} days'`;

    const [topVecinos, topBarrios, topTipos, repetidos] = await Promise.all([
      query(
        `SELECT cliente_nombre, COUNT(*)::INT AS total
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${bt}
           AND COALESCE(TRIM(cliente_nombre),'') != ''
         GROUP BY cliente_nombre ORDER BY total DESC LIMIT 5`,
        [...params]
      ),
      query(
        `SELECT distribuidor, COUNT(*)::INT AS total
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${bt}
           AND COALESCE(TRIM(distribuidor),'') != ''
         GROUP BY distribuidor ORDER BY total DESC LIMIT 5`,
        [...params]
      ),
      query(
        `SELECT tipo_trabajo, COUNT(*)::INT AS total
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${bt}
           AND COALESCE(TRIM(tipo_trabajo),'') != ''
         GROUP BY tipo_trabajo ORDER BY total DESC LIMIT 5`,
        [...params]
      ),
      query(
        `SELECT cliente_nombre, tipo_trabajo, COUNT(*)::INT AS veces
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${bt}
           AND COALESCE(TRIM(cliente_nombre),'') != ''
         GROUP BY cliente_nombre, tipo_trabajo
         HAVING COUNT(*) >= 2
         ORDER BY veces DESC LIMIT 10`,
        [...params]
      ),
    ]);

    const analisis = {
      periodo_dias: periodDias,
      top_vecinos: topVecinos.rows,
      top_barrios: topBarrios.rows,
      top_tipos: topTipos.rows,
      repetidos: repetidos.rows,
    };

    const groqResult = await analizarReclamosConGroq({ resumen: analisis });

    return res.json({
      ok: true,
      analisis,
      recomendacion_ia: groqResult.recomendacion_ia || null,
    });
  } catch (error) {
    console.error("[ia/analizar-reclamos]", error);
    return res.status(500).json({ ok: false, error: "Error interno al analizar reclamos" });
  }
});

/**
 * POST /api/ia/analizar-asignados-tecnico
 * Body: { resumen: object } — agregado en cliente (solo pedidos asignados al técnico, sin pendientes).
 * Auth: técnico o supervisor (no admin).
 */
router.post("/analizar-asignados-tecnico", authWithTenantHost, tecnicoSupervisorOnly, async (req, res) => {
  try {
    const raw = req.body?.resumen;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return res.status(400).json({ ok: false, error: "resumen (objeto) es requerido" });
    }
    const pedidos = Array.isArray(raw.pedidos_asignados) ? raw.pedidos_asignados : [];
    if (pedidos.length > 40) {
      return res.status(400).json({ ok: false, error: "Demasiados pedidos en resumen (máx. 40)" });
    }
    if (!pedidos.length) {
      return res.json({
        ok: true,
        recomendacion_ia: "No hay pedidos asignados o en ejecución en el panel para analizar.",
      });
    }
    const posRaw = raw.posicion_tecnico_wgs84;
    let posicion_tecnico_wgs84 = null;
    if (posRaw && typeof posRaw === "object") {
      const la = Number(posRaw.lat);
      const lo = Number(posRaw.lon);
      if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
        posicion_tecnico_wgs84 = { lat: la, lon: lo };
      }
    }
    const distRaw = Array.isArray(raw.distancias_pares) ? raw.distancias_pares : [];
    const distancias_pares = distRaw.slice(0, 42).map((d) => {
      if (!d || typeof d !== "object") return null;
      return {
        de_np: String(d.de_np ?? "").slice(0, 24),
        a_np: String(d.a_np ?? "").slice(0, 24),
        km: Number.isFinite(Number(d.km)) ? Math.round(Number(d.km) * 100) / 100 : null,
      };
    }).filter(Boolean);

    const resumen = {
      modo: String(raw.modo || "tecnico_asignados").slice(0, 64),
      posicion_tecnico_wgs84,
      cantidad: pedidos.length,
      pedidos_asignados: pedidos.map((p) => {
        if (!p || typeof p !== "object") return {};
        return {
          np: String(p.np ?? "").slice(0, 24),
          prioridad: String(p.prioridad ?? "").slice(0, 24),
          estado: String(p.estado ?? "").slice(0, 32),
          tipo: String(p.tipo ?? "").slice(0, 120),
          horas_abierto: Number.isFinite(Number(p.horas_abierto)) ? Number(p.horas_abierto) : null,
          km_desde_gps: Number.isFinite(Number(p.km_desde_gps)) ? Math.round(Number(p.km_desde_gps) * 100) / 100 : null,
          tiene_coord: !!p.tiene_coord,
          direccion_resumen: String(p.direccion_resumen ?? "").slice(0, 160),
          puntaje_urgencia: Number.isFinite(Number(p.puntaje_urgencia))
            ? Math.round(Number(p.puntaje_urgencia) * 100) / 100
            : null,
        };
      }),
      distancias_pares,
    };
    const groqResult = await analizarAsignadosTecnicoConGroq({ resumen });
    return res.json({
      ok: true,
      recomendacion_ia: groqResult.recomendacion_ia || null,
    });
  } catch (error) {
    console.error("[ia/analizar-asignados-tecnico]", error);
    return res.status(500).json({ ok: false, error: "Error interno al analizar asignados" });
  }
});

/**
 * POST /api/ia/sugerir-kpis
 * Body: { tipo_negocio, periodo_dias? }
 * Calcula métricas reales via SQL y pide a Groq nombres + interpretación.
 */
router.post("/sugerir-kpis", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const periodDias = Math.min(Math.max(Number(req.body?.periodo_dias) || 30, 1), 365);
    const hasT = await pedidosTableHasTenantIdColumn();
    const tid = req.tenantId;

    const params = hasT ? [tid] : [];
    const bt = await pushPedidoBusinessFilter(req, params);
    const tsql = hasT ? " AND tenant_id = $1" : "";
    const since = `NOW() - INTERVAL '${periodDias} days'`;

    const base = `FROM pedidos WHERE fecha_creacion >= ${since}${tsql}${bt}`;

    const [r, topBarrios, barrioStats] = await Promise.all([
      query(
        `SELECT
           COUNT(*)::INT AS total,
           COUNT(*) FILTER (WHERE estado='Cerrado')::INT AS cerrados,
           COUNT(*) FILTER (WHERE estado='Pendiente')::INT AS pendientes,
           COUNT(*) FILTER (WHERE estado='En ejecución')::INT AS en_ejecucion,
           AVG(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600)
             FILTER (WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL) AS horas_prom_cierre,
           COUNT(*) FILTER (WHERE estado='Cerrado'
             AND EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600 <= 48)::INT AS cerrados_48h,
           COUNT(*) FILTER (WHERE estado='Cerrado'
             AND EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600 <= 24)::INT AS cerrados_24h,
           COUNT(*) FILTER (WHERE estado='Cerrado'
             AND EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600 <= 4)::INT AS cerrados_4h
         ${base}`,
        [...params]
      ),
      query(
        `SELECT COALESCE(NULLIF(TRIM(barrio),''), NULLIF(TRIM(distribuidor),'')) AS zona,
                COUNT(*)::INT AS total,
                COUNT(*) FILTER (WHERE estado='Pendiente')::INT AS pendientes,
                COUNT(*) FILTER (WHERE estado='Cerrado')::INT AS cerrados,
                ROUND(AVG(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600)
                  FILTER (WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL))::INT AS horas_prom
         ${base}
           AND COALESCE(NULLIF(TRIM(barrio),''), NULLIF(TRIM(distribuidor),'')) IS NOT NULL
         GROUP BY zona ORDER BY total DESC LIMIT 8`,
        [...params]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT COALESCE(NULLIF(TRIM(barrio),''), NULLIF(TRIM(distribuidor),'')) AS zona,
                tipo_trabajo, COUNT(*)::INT AS total
         ${base}
           AND COALESCE(NULLIF(TRIM(barrio),''), NULLIF(TRIM(distribuidor),'')) IS NOT NULL
           AND COALESCE(TRIM(tipo_trabajo),'') != ''
         GROUP BY zona, tipo_trabajo ORDER BY total DESC LIMIT 20`,
        [...params]
      ).catch(() => ({ rows: [] })),
    ]);

    const row = r.rows[0] || {};
    const total = Number(row.total) || 0;
    const cerrados = Number(row.cerrados) || 0;
    const pctCierre = total > 0 ? Math.round((cerrados / total) * 1000) / 10 : 0;
    const horas = row.horas_prom_cierre != null ? Math.round(Number(row.horas_prom_cierre) * 10) / 10 : null;
    const pct48h = cerrados > 0 ? Math.round((Number(row.cerrados_48h) / cerrados) * 1000) / 10 : 0;
    const pct24h = cerrados > 0 ? Math.round((Number(row.cerrados_24h) / cerrados) * 1000) / 10 : 0;
    const pct4h = cerrados > 0 ? Math.round((Number(row.cerrados_4h) / cerrados) * 1000) / 10 : 0;

    const barrios = (topBarrios.rows || []).map((b) => {
      const zona = String(b.zona || "").trim();
      const tiposPorZona = (barrioStats.rows || [])
        .filter((s) => String(s.zona || "").trim() === zona)
        .sort((a, b2) => (Number(b2.total) || 0) - (Number(a.total) || 0))
        .slice(0, 3)
        .map((s) => ({ tipo: s.tipo_trabajo, total: Number(s.total) || 0 }));
      return {
        zona,
        total: Number(b.total) || 0,
        pendientes: Number(b.pendientes) || 0,
        cerrados: Number(b.cerrados) || 0,
        horas_prom: b.horas_prom != null ? Number(b.horas_prom) : null,
        top_tipos: tiposPorZona,
      };
    });

    const metricas = {
      periodo_dias: periodDias,
      total_reclamos: total,
      cerrados,
      pendientes: Number(row.pendientes) || 0,
      en_ejecucion: Number(row.en_ejecucion) || 0,
      pct_cierre: pctCierre,
      horas_promedio_cierre: horas,
      pct_cerrados_48h: pct48h,
      pct_cerrados_24h: pct24h,
      pct_cerrados_4h: pct4h,
      tipo_negocio: String(req.body?.tipo_negocio || "").trim(),
    };

    const groqResult = await sugerirKpisConGroq({ metricas });

    const kpis = (groqResult.kpis_ia || []).map((k) => ({
      metrica: String(k.metrica || "").slice(0, 80),
      nombre: String(k.nombre || "").slice(0, 120),
      valor: Number(k.valor) || 0,
      unidad: String(k.unidad || "").slice(0, 30),
      interpretacion: String(k.interpretacion || "").slice(0, 300),
      alerta: !!k.alerta,
      periodo_inicio: new Date(Date.now() - periodDias * 86400000).toISOString().slice(0, 10),
      periodo_fin: new Date().toISOString().slice(0, 10),
    }));

    return res.json({
      ok: true,
      metricas,
      kpis: kpis.length ? kpis : null,
      barrios: barrios.length ? barrios : null,
    });
  } catch (error) {
    console.error("[ia/sugerir-kpis]", error);
    return res.status(500).json({ ok: false, error: "Error interno al sugerir KPIs" });
  }
});

/**
 * POST /api/ia/generar-informe
 * Body: { tipo_negocio, periodo_dias? }
 * Combina análisis de reclamos + métricas + KPI snapshots en un informe unificado con IA.
 */
router.post("/generar-informe", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const periodDias = Math.min(Math.max(Number(req.body?.periodo_dias) || 30, 1), 365);
    const hasT = await pedidosTableHasTenantIdColumn();
    const tid = req.tenantId;

    const params = hasT ? [tid] : [];
    const bt = await pushPedidoBusinessFilter(req, params);
    const tsql = hasT ? " AND tenant_id = $1" : "";
    const since = `NOW() - INTERVAL '${periodDias} days'`;
    const base = `FROM pedidos WHERE fecha_creacion >= ${since}${tsql}${bt}`;

    const sincePrev = `NOW() - INTERVAL '${periodDias * 2} days'`;

    const [topVecinos, topBarrios, topTipos, repetidos, metricasResult, snapshotsResult, satisfaccionResult, satisfaccionPrevResult] = await Promise.all([
      query(
        `SELECT cliente_nombre, COUNT(*)::INT AS total
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${bt}
           AND COALESCE(TRIM(cliente_nombre),'') != ''
         GROUP BY cliente_nombre ORDER BY total DESC LIMIT 5`,
        [...params]
      ),
      query(
        `SELECT distribuidor, COUNT(*)::INT AS total
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${bt}
           AND COALESCE(TRIM(distribuidor),'') != ''
         GROUP BY distribuidor ORDER BY total DESC LIMIT 5`,
        [...params]
      ),
      query(
        `SELECT tipo_trabajo, COUNT(*)::INT AS total
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${bt}
           AND COALESCE(TRIM(tipo_trabajo),'') != ''
         GROUP BY tipo_trabajo ORDER BY total DESC LIMIT 5`,
        [...params]
      ),
      query(
        `SELECT cliente_nombre, tipo_trabajo, COUNT(*)::INT AS veces
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${bt}
           AND COALESCE(TRIM(cliente_nombre),'') != ''
         GROUP BY cliente_nombre, tipo_trabajo
         HAVING COUNT(*) >= 2
         ORDER BY veces DESC LIMIT 10`,
        [...params]
      ),
      query(
        `SELECT
           COUNT(*)::INT AS total,
           COUNT(*) FILTER (WHERE estado='Cerrado')::INT AS cerrados,
           COUNT(*) FILTER (WHERE estado='Pendiente')::INT AS pendientes,
           COUNT(*) FILTER (WHERE estado='En ejecución')::INT AS en_ejecucion,
           AVG(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600)
             FILTER (WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL) AS horas_prom_cierre,
           COUNT(*) FILTER (WHERE estado='Cerrado'
             AND EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600 <= 48)::INT AS cerrados_48h,
           COUNT(*) FILTER (WHERE estado='Cerrado'
             AND EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600 <= 24)::INT AS cerrados_24h,
           COUNT(*) FILTER (WHERE estado='Cerrado'
             AND EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600 <= 4)::INT AS cerrados_4h
         ${base}`,
        [...params]
      ),
      hasT
        ? query(
            `SELECT * FROM kpi_snapshots WHERE tenant_id = $1 ORDER BY periodo_fin DESC LIMIT 20`,
            [tid]
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
      query(
        `SELECT
           AVG(opinion_cliente_estrellas)::NUMERIC(3,2) AS promedio_estrellas,
           COUNT(opinion_cliente_estrellas)::INT AS cantidad_respuestas
         FROM pedidos
         WHERE fecha_opinion_cliente >= ${since}${tsql}${bt}
           AND opinion_cliente_estrellas IS NOT NULL
           AND opinion_cliente_estrellas BETWEEN 1 AND 5`,
        [...params]
      ).catch(() => ({ rows: [{}] })),
      query(
        `SELECT
           AVG(opinion_cliente_estrellas)::NUMERIC(3,2) AS promedio_estrellas_prev,
           COUNT(opinion_cliente_estrellas)::INT AS cantidad_prev
         FROM pedidos
         WHERE fecha_opinion_cliente >= ${sincePrev}${tsql}${bt}
           AND fecha_opinion_cliente < ${since}
           AND opinion_cliente_estrellas IS NOT NULL
           AND opinion_cliente_estrellas BETWEEN 1 AND 5`,
        [...params]
      ).catch(() => ({ rows: [{}] })),
    ]);

    const row = metricasResult.rows[0] || {};
    const total = Number(row.total) || 0;
    const cerrados = Number(row.cerrados) || 0;
    const pctCierre = total > 0 ? Math.round((cerrados / total) * 1000) / 10 : 0;
    const horas = row.horas_prom_cierre != null ? Math.round(Number(row.horas_prom_cierre) * 10) / 10 : null;
    const pct48h = cerrados > 0 ? Math.round((Number(row.cerrados_48h) / cerrados) * 1000) / 10 : 0;
    const pct24h = cerrados > 0 ? Math.round((Number(row.cerrados_24h) / cerrados) * 1000) / 10 : 0;
    const pct4h = cerrados > 0 ? Math.round((Number(row.cerrados_4h) / cerrados) * 1000) / 10 : 0;

    const analisis = {
      periodo_dias: periodDias,
      top_vecinos: topVecinos.rows,
      top_barrios: topBarrios.rows,
      top_tipos: topTipos.rows,
      repetidos: repetidos.rows,
    };

    const metricas = {
      periodo_dias: periodDias,
      total_reclamos: total,
      cerrados,
      pendientes: Number(row.pendientes) || 0,
      en_ejecucion: Number(row.en_ejecucion) || 0,
      pct_cierre: pctCierre,
      horas_promedio_cierre: horas,
      pct_cerrados_48h: pct48h,
      pct_cerrados_24h: pct24h,
      pct_cerrados_4h: pct4h,
      tipo_negocio: String(req.body?.tipo_negocio || "").trim(),
    };

    const satRow = satisfaccionResult.rows[0] || {};
    const satPrevRow = satisfaccionPrevResult.rows[0] || {};
    const promEstrellas = satRow.promedio_estrellas != null ? Math.round(Number(satRow.promedio_estrellas) * 100) / 100 : null;
    const cantRespuestas = Number(satRow.cantidad_respuestas) || 0;
    const pctSatisfaccion = promEstrellas != null ? Math.round((promEstrellas / 5) * 1000) / 10 : null;
    const promPrev = satPrevRow.promedio_estrellas_prev != null ? Math.round(Number(satPrevRow.promedio_estrellas_prev) * 100) / 100 : null;
    const pctPrev = promPrev != null ? Math.round((promPrev / 5) * 1000) / 10 : null;
    let tendenciaSat = 'estable';
    if (pctSatisfaccion != null && pctPrev != null) {
      if (pctSatisfaccion > pctPrev + 2) tendenciaSat = 'mejora';
      else if (pctSatisfaccion < pctPrev - 2) tendenciaSat = 'empeora';
    }

    const satisfaccion = {
      promedio_estrellas: promEstrellas,
      porcentaje: pctSatisfaccion,
      cantidad_respuestas: cantRespuestas,
      periodo_anterior_porcentaje: pctPrev,
      tendencia: tendenciaSat,
    };

    const groqResult = await generarInformeConGroq({
      datos: { analisis, metricas, kpi_snapshots: snapshotsResult.rows, satisfaccion },
    });

    return res.json({
      ok: true,
      analisis,
      metricas,
      satisfaccion,
      kpi_snapshots: snapshotsResult.rows,
      informe_ia: groqResult.informe_ia || null,
    });
  } catch (error) {
    console.error("[ia/generar-informe]", error);
    return res.status(500).json({ ok: false, error: "Error interno al generar informe" });
  }
});

/**
 * POST /api/ia/explicar-kpis
 * Body: { kpis: [{metrica, valor_numero, unidad, periodo_inicio, periodo_fin}], tipo_negocio }
 * Returns IA explanations for each KPI metric.
 */
router.post("/explicar-kpis", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const kpis = Array.isArray(req.body?.kpis) ? req.body.kpis : [];
    const tipo_negocio = String(req.body?.tipo_negocio || "").trim();
    if (!kpis.length) {
      return res.json({ ok: true, explicaciones: {} });
    }
    const result = await explicarKpisConGroq({ kpis, tipo_negocio });
    return res.json(result);
  } catch (error) {
    console.error("[ia/explicar-kpis]", error);
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
});

/**
 * POST /api/ia/detectar-duplicados
 * Body: { tipo_trabajo, descripcion, barrio?, lat?, lng? }
 * Busca pedidos abiertos similares en los ultimos 7 dias.
 */
router.post("/detectar-duplicados", authWithTenantHost, async (req, res) => {
  try {
    const tid = req.tenantId;
    const tt = String(req.body?.tipo_trabajo || "").trim();
    const desc = String(req.body?.descripcion || "").trim();
    const barrio = String(req.body?.barrio || "").trim();
    const lat = parseFloat(req.body?.lat);
    const lng = parseFloat(req.body?.lng);
    if (!tt) return res.status(400).json({ ok: false, error: "tipo_trabajo requerido" });

    const hasTid = await pedidosTableHasTenantIdColumn();
    const params = [];
    let base = `SELECT id, numero_pedido, tipo_trabajo, descripcion, estado, barrio, lat, lng, fecha_creacion
                FROM pedidos WHERE estado NOT IN ('Cerrado','Desestimado','Derivado externo')
                AND fecha_creacion >= NOW() - INTERVAL '7 days'`;
    if (hasTid) {
      params.push(tid);
      base += ` AND tenant_id = $${params.length}`;
    }
    params.push(tt);
    base += ` AND LOWER(TRIM(tipo_trabajo)) = LOWER(TRIM($${params.length}))`;
    base += ` ORDER BY fecha_creacion DESC LIMIT 10`;

    const r = await query(base, params);
    const candidatos = (r.rows || []).map((p) => {
      let score = 60;
      if (barrio && p.barrio && barrio.toLowerCase() === String(p.barrio).toLowerCase()) score += 20;
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(parseFloat(p.lat)) && Number.isFinite(parseFloat(p.lng))) {
        const dLat = lat - parseFloat(p.lat);
        const dLng = lng - parseFloat(p.lng);
        const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
        if (distKm < 0.5) score += 25;
        else if (distKm < 1) score += 15;
        else if (distKm < 2) score += 5;
      }
      if (desc && p.descripcion) {
        const w1 = new Set(desc.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const w2 = new Set(String(p.descripcion).toLowerCase().split(/\s+/).filter(w => w.length > 3));
        let overlap = 0;
        for (const w of w1) { if (w2.has(w)) overlap++; }
        if (w1.size > 0) score += Math.round((overlap / w1.size) * 15);
      }
      return { ...p, score };
    }).filter((p) => p.score >= 75);

    return res.json({ ok: true, duplicados: candidatos });
  } catch (e) {
    console.error("[ia/detectar-duplicados]", e);
    return res.status(500).json({ ok: false, error: "error_interno" });
  }
});

/**
 * POST /api/ia/generar-mensaje-derivacion
 * Admin: genera un mensaje profesional para derivar un reclamo a un tercero.
 */
router.post("/generar-mensaje-derivacion", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const { destinatario, tipo_reclamo, direccion, barrio, descripcion, prioridad, telefono_contacto, mensaje_borrador } =
      req.body || {};
    if (!destinatario) return res.status(400).json({ ok: false, error: "destinatario requerido" });

    let nombre_tenant = "";
    try {
      const r = await query("SELECT nombre FROM clientes WHERE id = $1 LIMIT 1", [req.tenantId]);
      nombre_tenant = r.rows?.[0]?.nombre || "";
    } catch (_) {}

    const mensaje = await generarMensajeDerivacionConGroq({
      destinatario: String(destinatario).trim(),
      tipo_reclamo: String(tipo_reclamo || "").trim(),
      direccion: String(direccion || "").trim(),
      barrio: String(barrio || "").trim(),
      descripcion: String(descripcion || "").trim().slice(0, 500),
      prioridad: String(prioridad || "").trim(),
      telefono_contacto: String(telefono_contacto || "").trim(),
      nombre_tenant,
      mensaje_borrador: String(mensaje_borrador || "").trim(),
    });

    return res.json({ ok: true, mensaje });
  } catch (e) {
    console.error("[ia/generar-mensaje-derivacion]", e?.message || e);
    return res.status(500).json({ ok: false, error: "No se pudo generar el mensaje" });
  }
});

export default router;
