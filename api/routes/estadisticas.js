import express from "express";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { parsePeriod } from "../utils/helpers.js";

const router = express.Router();
router.use(authMiddleware, adminOnly);

router.get("/resumen", async (req, res) => {
  try {
    const since = parsePeriod(req.query.periodo);
    const r = await query(
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
      WHERE fecha_creacion >= ${since}`
    );
    res.json(r.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener resumen", detail: error.message });
  }
});

router.get("/graficos", async (req, res) => {
  try {
    const since = parsePeriod(req.query.periodo);
    const [porMes, porEstado, porPrioridad, porDistribuidor, porTipo, porTecnico, porUsuario] = await Promise.all([
      query(
        `SELECT TO_CHAR(fecha_creacion,'YYYY-MM') AS mes, COUNT(*)::INT AS total
         FROM pedidos
         WHERE fecha_creacion >= ${since}
         GROUP BY mes ORDER BY mes`
      ),
      query(
        `SELECT estado, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}
         GROUP BY estado ORDER BY total DESC`
      ),
      query(
        `SELECT prioridad, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}
         GROUP BY prioridad ORDER BY total DESC`
      ),
      query(
        `SELECT distribuidor, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}
         GROUP BY distribuidor ORDER BY total DESC LIMIT 20`
      ),
      query(
        `SELECT tipo_trabajo, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}
         GROUP BY tipo_trabajo ORDER BY total DESC LIMIT 20`
      ),
      query(
        `SELECT COALESCE(tecnico_cierre,'Sin dato') AS tecnico, COUNT(*)::INT AS total
         FROM pedidos WHERE fecha_creacion >= ${since}
         GROUP BY tecnico ORDER BY total DESC LIMIT 20`
      ),
      query(
        `SELECT COALESCE(u.nombre,'Sin dato') AS usuario, COUNT(*)::INT AS total
         FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_creador_id
         WHERE p.fecha_creacion >= ${since}
         GROUP BY usuario ORDER BY total DESC LIMIT 20`
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

