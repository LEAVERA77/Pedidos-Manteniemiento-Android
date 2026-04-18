import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { tenantBusinessFilter } from "../middleware/tenantBusinessFilter.js";
import { query } from "../db/neon.js";
import { parsePeriod } from "../utils/helpers.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";

const router = express.Router();
router.use(authWithTenantHost, adminOnly);
router.use(tenantBusinessFilter);

router.get("/resumen", async (req, res) => {
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

router.get("/graficos", async (req, res) => {
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

export default router;
