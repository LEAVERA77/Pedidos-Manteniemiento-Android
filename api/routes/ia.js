import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { clasificarReclamoConGroq } from "../services/groqClassifier.js";
import { generarMensajeBroadcast } from "../services/groqBroadcastGenerator.js";
import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";
import { analizarReclamosConGroq } from "../services/groqAnalisisReclamos.js";
import { sugerirKpisConGroq } from "../services/groqKpiSugeridos.js";
import { generarInformeConGroq } from "../services/groqGenerarInforme.js";
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
    if (!titulo) {
      return res.status(400).json({ ok: false, error: "titulo es requerido" });
    }
    const result = await generarMensajeBroadcast({ titulo, tipo_negocio });
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

    const r = await query(
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
    );

    const row = r.rows[0] || {};
    const total = Number(row.total) || 0;
    const cerrados = Number(row.cerrados) || 0;
    const pctCierre = total > 0 ? Math.round((cerrados / total) * 1000) / 10 : 0;
    const horas = row.horas_prom_cierre != null ? Math.round(Number(row.horas_prom_cierre) * 10) / 10 : null;
    const pct48h = cerrados > 0 ? Math.round((Number(row.cerrados_48h) / cerrados) * 1000) / 10 : 0;
    const pct24h = cerrados > 0 ? Math.round((Number(row.cerrados_24h) / cerrados) * 1000) / 10 : 0;
    const pct4h = cerrados > 0 ? Math.round((Number(row.cerrados_4h) / cerrados) * 1000) / 10 : 0;

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

    const [topVecinos, topBarrios, topTipos, repetidos, metricasResult, snapshotsResult] = await Promise.all([
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

    const groqResult = await generarInformeConGroq({
      datos: { analisis, metricas, kpi_snapshots: snapshotsResult.rows },
    });

    return res.json({
      ok: true,
      analisis,
      metricas,
      kpi_snapshots: snapshotsResult.rows,
      informe_ia: groqResult.informe_ia || null,
    });
  } catch (error) {
    console.error("[ia/generar-informe]", error);
    return res.status(500).json({ ok: false, error: "Error interno al generar informe" });
  }
});

export default router;
