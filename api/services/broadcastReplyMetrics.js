/**
 * Métricas diarias de envíos masivos y respuestas (ratio recomendado Whapi).
 * made by leavera77
 */
import { query } from "../db/neon.js";

function metricDateSql() {
  return `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`;
}

export async function bumpBroadcastMessagesSent(tenantId, count) {
  const n = Number(count) || 0;
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0 || n <= 0) return;
  try {
    await query(
      `INSERT INTO broadcast_metrics (tenant_id, metric_date, mensajes_enviados, respuestas_recibidas, respuestas_stop, updated_at)
       VALUES ($1, ${metricDateSql()}, $2, 0, 0, NOW())
       ON CONFLICT (tenant_id, metric_date)
       DO UPDATE SET
         mensajes_enviados = broadcast_metrics.mensajes_enviados + EXCLUDED.mensajes_enviados,
         updated_at = NOW()`,
      [tid, n]
    );
  } catch (e) {
    console.warn("[broadcast-metrics] bump mensajes_enviados", e?.message || e);
  }
}

export async function bumpBroadcastReplies(tenantId, delta = 1) {
  const n = Number(delta) || 0;
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0 || n <= 0) return;
  try {
    await query(
      `INSERT INTO broadcast_metrics (tenant_id, metric_date, mensajes_enviados, respuestas_recibidas, respuestas_stop, updated_at)
       VALUES ($1, ${metricDateSql()}, 0, $2, 0, NOW())
       ON CONFLICT (tenant_id, metric_date)
       DO UPDATE SET
         respuestas_recibidas = broadcast_metrics.respuestas_recibidas + EXCLUDED.respuestas_recibidas,
         updated_at = NOW()`,
      [tid, n]
    );
  } catch (e) {
    console.warn("[broadcast-metrics] bump respuestas", e?.message || e);
  }
}

export async function bumpBroadcastStops(tenantId, delta = 1) {
  const n = Number(delta) || 0;
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0 || n <= 0) return;
  try {
    await query(
      `INSERT INTO broadcast_metrics (tenant_id, metric_date, mensajes_enviados, respuestas_recibidas, respuestas_stop, updated_at)
       VALUES ($1, ${metricDateSql()}, 0, 0, $2, NOW())
       ON CONFLICT (tenant_id, metric_date)
       DO UPDATE SET
         respuestas_stop = broadcast_metrics.respuestas_stop + EXCLUDED.respuestas_stop,
         updated_at = NOW()`,
      [tid, n]
    );
  } catch (e) {
    console.warn("[broadcast-metrics] bump stops", e?.message || e);
  }
}

/**
 * Últimos N días con ratio; alerta si ratio < umbral durante `consecutive` días seguidos.
 */
export async function getBroadcastMetricsReport(tenantId, { days = 7, lowRatioPct = 20, consecutiveRequired = 3 } = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { rows: [], avg_ratio_7d: null, low_ratio_alert: false, consecutive_low_days: 0 };
  }
  const d = Math.min(90, Math.max(1, Number(days) || 7));
  try {
    const r = await query(
      `SELECT metric_date::text AS metric_date,
              mensajes_enviados,
              respuestas_recibidas,
              respuestas_stop,
              CASE WHEN mensajes_enviados > 0
                THEN ROUND(100.0 * respuestas_recibidas::numeric / mensajes_enviados, 2)
                ELSE 0 END AS ratio_respuestas
       FROM broadcast_metrics
       WHERE tenant_id = $1 AND metric_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - ($2::int * INTERVAL '1 day')
       ORDER BY metric_date DESC`,
      [tid, d]
    );
    const rows = r.rows || [];
    let sumR = 0;
    let cntR = 0;
    for (const row of rows) {
      const ratio = Number(row.ratio_respuestas);
      if (Number(row.mensajes_enviados) > 0 && Number.isFinite(ratio)) {
        sumR += ratio;
        cntR += 1;
      }
    }
    const avg_ratio_7d = cntR > 0 ? Math.round((sumR / cntR) * 100) / 100 : null;

    let streak = 0;
    let maxStreak = 0;
    const byDateAsc = [...rows].sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));
    for (const row of byDateAsc) {
      const sent = Number(row.mensajes_enviados) || 0;
      const ratio = Number(row.ratio_respuestas) || 0;
      if (sent > 0 && ratio < lowRatioPct) {
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    const low_ratio_alert = maxStreak >= consecutiveRequired;
    if (low_ratio_alert) {
      console.warn("[broadcast-metrics] ratio bajo sostenido", {
        tenant_id: tid,
        max_streak: maxStreak,
        threshold_pct: lowRatioPct,
      });
    }
    return {
      rows,
      avg_ratio_7d,
      low_ratio_alert,
      consecutive_low_days: maxStreak,
    };
  } catch (e) {
    console.warn("[broadcast-metrics] report", e?.message || e);
    return { rows: [], avg_ratio_7d: null, low_ratio_alert: false, consecutive_low_days: 0 };
  }
}
