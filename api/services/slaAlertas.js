/**
 * Alertas SLA simples (pendiente / sin avance).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";

/**
 * @param {import('express').Request} req
 */
export async function calcularAlertasSla(req) {
  const hasT = await pedidosTableHasTenantIdColumn();
  const params = hasT ? [req.tenantId] : [];
  const bt = await pushPedidoBusinessFilter(req, params);
  const tsql = hasT ? ` AND tenant_id = $1` : "";
  const alertas = [];

  const rPend = await query(
    `SELECT COUNT(*)::int AS n FROM pedidos
     WHERE estado = 'Pendiente' AND fecha_creacion < NOW() - INTERVAL '24 hours'${tsql}${bt}`,
    [...params]
  );
  const nPend = rPend.rows?.[0]?.n ?? 0;
  if (nPend > 0) {
    alertas.push({
      tipo: "pendiente_24h",
      cantidad: nPend,
      mensaje: `Pedidos pendientes con más de 24 h sin asignar`,
    });
  }

  const rEj = await query(
    `SELECT COUNT(*)::int AS n FROM pedidos
     WHERE estado = 'En ejecución'
       AND (fecha_avance IS NULL OR fecha_avance < NOW() - INTERVAL '48 hours')${tsql}${bt}`,
    [...params]
  );
  const nEj = rEj.rows?.[0]?.n ?? 0;
  if (nEj > 0) {
    alertas.push({
      tipo: "sin_avance_48h",
      cantidad: nEj,
      mensaje: `En ejecución sin avance registrado en 48 h`,
    });
  }

  const rAbiertos = await query(
    `SELECT COUNT(*)::int AS n FROM pedidos
     WHERE estado NOT IN ('Cerrado', 'Desestimado')${tsql}${bt}`,
    [...params]
  );
  const rCerrados7 = await query(
    `SELECT COUNT(*)::int AS n FROM pedidos
     WHERE estado = 'Cerrado' AND fecha_cierre >= NOW() - INTERVAL '7 days'${tsql}${bt}`,
    [...params]
  );

  return {
    alertas,
    resumen: {
      abiertos: rAbiertos.rows?.[0]?.n ?? 0,
      cerrados_7d: rCerrados7.rows?.[0]?.n ?? 0,
      alertas_activas: alertas.length,
    },
  };
}

/**
 * Ranking técnicos por cierres y opinión WA.
 */
export async function rankingTecnicos(req, periodo = "30d") {
  const since =
    periodo === "7d"
      ? "NOW() - INTERVAL '7 days'"
      : periodo === "90d"
        ? "NOW() - INTERVAL '90 days'"
        : "NOW() - INTERVAL '30 days'";
  const hasT = await pedidosTableHasTenantIdColumn();
  const params = hasT ? [req.tenantId] : [];
  const bt = await pushPedidoBusinessFilter(req, params);
  const tsql = hasT ? ` AND p.tenant_id = $1` : "";
  const r = await query(
    `SELECT u.id, u.nombre,
            COUNT(*) FILTER (WHERE p.estado = 'Cerrado')::int AS cerrados,
            ROUND(AVG(EXTRACT(EPOCH FROM (p.fecha_cierre - p.fecha_creacion))/3600) FILTER (WHERE p.estado = 'Cerrado' AND p.fecha_cierre IS NOT NULL)::numeric, 1) AS horas_prom_cierre,
            ROUND(AVG(p.opinion_cliente_estrellas) FILTER (WHERE p.opinion_cliente_estrellas IS NOT NULL)::numeric, 1) AS opinion_prom
     FROM pedidos p
     JOIN usuarios u ON u.id = p.tecnico_asignado_id
     WHERE p.fecha_creacion >= ${since}${tsql}${bt ? bt.replace(/\bbusiness_type\b/g, "p.business_type") : ""}
     GROUP BY u.id, u.nombre
     HAVING COUNT(*) FILTER (WHERE p.estado = 'Cerrado') > 0
     ORDER BY cerrados DESC, horas_prom_cierre ASC NULLS LAST
     LIMIT 30`,
    [...params]
  );
  return { ranking: r.rows, periodo };
}
