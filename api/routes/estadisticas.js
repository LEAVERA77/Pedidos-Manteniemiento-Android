import express from "express";
import { authWithTenantHost, adminOnly, adminOrTecnicoIncidencias } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { parsePeriod } from "../utils/helpers.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";
import { calcularAlertasSla, rankingTecnicos } from "../services/slaAlertas.js";

const router = express.Router();
router.use(authWithTenantHost);

router.get("/resumen", adminOnly, async (req, res) => {
  try {
    const since = parsePeriod(req.query.periodo);
    const hasT = await pedidosTableHasTenantIdColumn();
    const paramsR = hasT ? [req.tenantId] : [];
    const btR = await pushPedidoBusinessFilter(req, paramsR);
    const r = hasT
      ? await query(
          `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado='Pendiente') AS pendientes,
        COUNT(*) FILTER (WHERE estado='En ejecución') AS en_ejecucion,
        COUNT(*) FILTER (WHERE estado='Cerrado') AS cerrados,
        COUNT(*) FILTER (WHERE prioridad='Crítica' AND estado!='Cerrado') AS criticos_activos,
        COUNT(*) FILTER (WHERE prioridad='Alta' AND estado!='Cerrado') AS altos_activos,
        COUNT(*) FILTER (WHERE estado='Cerrado' AND fecha_cierre::date = CURRENT_DATE) AS cerrados_hoy,
        AVG(EXTRACT(EPOCH FROM (fecha_cierre-fecha_creacion))/3600) FILTER (WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL) AS horas_prom_cierre
      FROM pedidos
      WHERE fecha_creacion >= ${since} AND tenant_id = $1${btR}`,
          paramsR
        )
      : await query(
          `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado='Pendiente') AS pendientes,
        COUNT(*) FILTER (WHERE estado='En ejecución') AS en_ejecucion,
        COUNT(*) FILTER (WHERE estado='Cerrado') AS cerrados,
        COUNT(*) FILTER (WHERE prioridad='Crítica' AND estado!='Cerrado') AS criticos_activos,
        COUNT(*) FILTER (WHERE prioridad='Alta' AND estado!='Cerrado') AS altos_activos,
        COUNT(*) FILTER (WHERE estado='Cerrado' AND fecha_cierre::date = CURRENT_DATE) AS cerrados_hoy,
        AVG(EXTRACT(EPOCH FROM (fecha_cierre-fecha_creacion))/3600) FILTER (WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL) AS horas_prom_cierre
      FROM pedidos
      WHERE fecha_creacion >= ${since}${btR || ""}`,
          paramsR
        );
    res.json(r.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener resumen", detail: error.message });
  }
});

router.get("/graficos", adminOnly, async (req, res) => {
  try {
    const since = parsePeriod(req.query.periodo);
    const hasT = await pedidosTableHasTenantIdColumn();
    const tid = req.tenantId;
    const p = hasT ? [tid] : [];
    const btG = await pushPedidoBusinessFilter(req, p);
    const tsql = hasT ? ` AND tenant_id = $1` : "";
    const btP = btG ? btG.replace(/\bbusiness_type\b/g, "p.business_type") : "";

    const [porMes, porEstado, porPrioridad, porDistribuidor, porTipo, porTecnico, porUsuario] = await Promise.all([
      query(
        `SELECT TO_CHAR(fecha_creacion,'YYYY-MM') AS mes, COUNT(*)::INT AS total
         FROM pedidos
         WHERE fecha_creacion >= ${since}${tsql}${btG}
         GROUP BY mes ORDER BY mes`,
        [...p]
      ),
      query(
        `SELECT estado, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}${tsql}${btG}
         GROUP BY estado ORDER BY total DESC`,
        [...p]
      ),
      query(
        `SELECT prioridad, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}${tsql}${btG}
         GROUP BY prioridad ORDER BY total DESC`,
        [...p]
      ),
      query(
        `SELECT distribuidor, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}${tsql}${btG}
         GROUP BY distribuidor ORDER BY total DESC LIMIT 20`,
        [...p]
      ),
      query(
        `SELECT tipo_trabajo, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}${tsql}${btG}
         GROUP BY tipo_trabajo ORDER BY total DESC LIMIT 20`,
        [...p]
      ),
      query(
        `SELECT COALESCE(tecnico_cierre,'Sin dato') AS tecnico, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}${tsql}${btG}
         GROUP BY tecnico ORDER BY total DESC LIMIT 20`,
        [...p]
      ),
      query(
        `SELECT COALESCE(u.nombre,'Sin dato') AS usuario, COUNT(*)::INT AS total
         FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_creador_id
         WHERE p.fecha_creacion >= ${since}${hasT ? " AND p.tenant_id = $1" : ""}${btP}
         GROUP BY usuario ORDER BY total DESC LIMIT 20`,
        [...p]
      ),
    ]);
    res.json({
      porMes: porMes.rows,
      porEstado: porEstado.rows,
      porPrioridad: porPrioridad.rows,
      porDistribuidor: porDistribuidor.rows,
      porTipo: porTipo.rows,
      porTecnico: porTecnico.rows,
      porUsuario: porUsuario.rows,
    });
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener gráficos", detail: error.message });
  }
});

/** Infraestructura por distribuidor (Excel admin) para denominadores SAIDI/SAIFI en front. */
router.get("/datos-red", adminOrTecnicoIncidencias, async (req, res) => {
  try {
    const ex = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'distribuidores_red' LIMIT 1`
    );
    if (!(ex.rows || []).length) {
      return res.json({ disponible: false, datos: {} });
    }
    const tid = req.tenantId;
    const r = await query(
      `SELECT codigo, trafos, kva, clientes FROM distribuidores_red WHERE tenant_id = $1 ORDER BY codigo`,
      [tid]
    );
    /** @type {Record<string, { trafos: number; kva: number; clientes: number }>} */
    const datos = {};
    for (const row of r.rows || []) {
      const c = String(row.codigo || "").trim().toUpperCase();
      if (!c) continue;
      datos[c] = {
        trafos: Number(row.trafos) || 0,
        kva: Number(row.kva) || 0,
        clientes: Number(row.clientes) || 0,
      };
    }
    res.json({ disponible: true, datos });
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener datos de red", detail: error.message });
  }
});

router.get("/ranking-tecnicos", adminOnly, async (req, res) => {
  try {
    const periodo = String(req.query.periodo || "30d");
    const data = await rankingTecnicos(req, periodo);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener ranking", detail: error.message });
  }
});

router.get("/sla-alertas", adminOnly, async (req, res) => {
  try {
    const data = await calcularAlertasSla(req);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron calcular alertas", detail: error.message });
  }
});

export default router;
