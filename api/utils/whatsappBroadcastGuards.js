/**
 * Guardas extra anti-baneo para masivos (ventana horaria, ritmo, circuit breaker, texto).
 * Todo desactivado por defecto (0 / vacío) salvo TZ por si se activa ventana.
 * made by leavera77
 */
import { query } from "../db/neon.js";

function parseIntEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function parseFloatEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Minutos 0–1439 en la zona IANA indicada. */
export function getLocalMinutesNow(timeZone) {
  const tz = String(timeZone || "America/Argentina/Buenos_Aires").trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  } catch (_) {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

/** "08:00" → minutos desde medianoche */
function parseHHMM(s) {
  const t = String(s || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Ventana local permitida: WHAPI_BROADCAST_LOCAL_WINDOW=08:00-21:00 (vacío = sin restricción).
 * @returns {{ ok: boolean, error?: string }}
 */
export function assertBroadcastLocalTimeWindow() {
  const win = String(process.env.WHAPI_BROADCAST_LOCAL_WINDOW || "").trim();
  if (!win) return { ok: true };
  const tz = String(process.env.WHAPI_BROADCAST_LOCAL_TZ || "America/Argentina/Buenos_Aires").trim();
  const [a, b] = win.split("-").map((x) => x.trim());
  const start = parseHHMM(a);
  const end = parseHHMM(b);
  if (start == null || end == null) {
    console.warn("[broadcast-guards] WHAPI_BROADCAST_LOCAL_WINDOW inválido, se ignora:", win);
    return { ok: true };
  }
  const now = getLocalMinutesNow(tz);
  let ok;
  if (start <= end) {
    ok = now >= start && now <= end;
  } else {
    ok = now >= start || now <= end;
  }
  if (ok) return { ok: true };
  return {
    ok: false,
    error: `Fuera de la ventana horaria permitida para masivos (${win} ${tz}). Ajustá WHAPI_BROADCAST_LOCAL_WINDOW o enviá en otro horario.`,
  };
}

/** Horas mínimas entre masivos terminados (solo status done). 0 = off. */
export async function assertMinHoursBetweenBroadcasts(tenantId) {
  const hours = parseIntEnv("WHAPI_BROADCAST_MIN_HOURS_BETWEEN", 0);
  if (hours <= 0) return { ok: true };
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: true };
  try {
    const r = await query(
      `SELECT MAX(created_at) AS last_at
       FROM comunicaciones_envios
       WHERE tenant_id = $1
         AND (meta->>'kind') IN ('community', 'corte_programado')
         AND (meta->>'broadcast_status') = 'done'`,
      [tid]
    );
    const lastAt = r.rows?.[0]?.last_at;
    if (!lastAt) return { ok: true };
    const ms = new Date(lastAt).getTime() + hours * 3600000 - Date.now();
    if (ms <= 0) return { ok: true };
    const hLeft = Math.ceil(ms / 3600000);
    return {
      ok: false,
      error: `Debe pasar al menos ${hours} h entre masivos completados. Último envío hace menos tiempo (reintentá en ~${hLeft} h). Variable WHAPI_BROADCAST_MIN_HOURS_BETWEEN.`,
    };
  } catch (e) {
    console.warn("[broadcast-guards] min hours", e?.message || e);
    return { ok: true };
  }
}

/** Tope de destinatarios sumados en masivos done en rolling 7 días. 0 = off. */
export async function assertWeeklyRecipientCap(tenantId, additionalRecipients) {
  const max = parseIntEnv("WHAPI_BROADCAST_MAX_RECIPIENTS_WEEK", 0);
  if (max <= 0) return { ok: true };
  const tid = Number(tenantId);
  const add = Math.max(0, Number(additionalRecipients) || 0);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: true };
  try {
    const r = await query(
      `SELECT COALESCE(SUM(destinatarios_total), 0)::int AS s
       FROM comunicaciones_envios
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '7 days'
         AND (meta->>'kind') IN ('community', 'corte_programado')
         AND (meta->>'broadcast_status') = 'done'`,
      [tid]
    );
    const used = Number(r.rows?.[0]?.s) || 0;
    if (used + add <= max) return { ok: true };
    return {
      ok: false,
      error: `Tope semanal (7 días) de destinatarios masivos: ${max} (ya usados ~${used}, este envío sumaría ${add}). Ajustá WHAPI_BROADCAST_MAX_RECIPIENTS_WEEK o segmentá.`,
    };
  } catch (e) {
    console.warn("[broadcast-guards] weekly cap", e?.message || e);
    return { ok: true };
  }
}

/**
 * Circuit breaker: últimos N envíos done con volumen mínimo; si tasa error > umbral, bloquear.
 * WHAPI_BROADCAST_CIRCUIT_LOOKBACK=0 desactiva.
 */
export async function assertBroadcastCircuitBreaker(tenantId) {
  const lookback = parseIntEnv("WHAPI_BROADCAST_CIRCUIT_LOOKBACK", 0);
  const minDest = parseIntEnv("WHAPI_BROADCAST_CIRCUIT_MIN_DEST", 10);
  const ratioLimit = parseFloatEnv("WHAPI_BROADCAST_CIRCUIT_ERROR_RATIO", 0.35);
  if (lookback <= 0) return { ok: true };
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: true };
  try {
    const r = await query(
      `SELECT destinatarios_total, enviados_ok, enviados_error
       FROM comunicaciones_envios
       WHERE tenant_id = $1
         AND (meta->>'kind') IN ('community', 'corte_programado')
         AND (meta->>'broadcast_status') = 'done'
         AND destinatarios_total >= $3
       ORDER BY created_at DESC
       LIMIT $2`,
      [tid, lookback, minDest]
    );
    const rows = r.rows || [];
    if (rows.length < lookback) return { ok: true };
    let tot = 0;
    let err = 0;
    for (const row of rows) {
      tot += Number(row.destinatarios_total) || 0;
      err += Number(row.enviados_error) || 0;
    }
    if (tot <= 0) return { ok: true };
    const ratio = err / tot;
    if (ratio <= ratioLimit) return { ok: true };
    console.warn("[broadcast-guards] circuit breaker activo", { tenant_id: tid, ratio, lookback });
    return {
      ok: false,
      error: `Circuit breaker: en los últimos ${lookback} masivos grandes la tasa de error (~${Math.round(ratio * 100)} %) supera el máximo (${Math.round(ratioLimit * 100)} %). Revisá números, plantilla Whapi o credenciales antes de reintentar.`,
    };
  } catch (e) {
    console.warn("[broadcast-guards] circuit", e?.message || e);
    return { ok: true };
  }
}

/**
 * Si WHAPI_BROADCAST_REJECT_CAPS_PCT > 0: rechaza cuerpos con demasiadas mayúsculas (spam típico).
 */
export function assertBroadcastBodyCapsRatio(bodyText) {
  const maxPct = parseIntEnv("WHAPI_BROADCAST_REJECT_CAPS_PCT", 0);
  if (maxPct <= 0 || maxPct > 100) return { ok: true };
  const s = String(bodyText || "");
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters.length < 35) return { ok: true };
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  const pct = (upper / letters.length) * 100;
  if (pct <= maxPct) return { ok: true };
  return {
    ok: false,
    error: `El mensaje tiene demasiadas mayúsculas (~${Math.round(pct)} %). Bajá WHAPI_BROADCAST_REJECT_CAPS_PCT o reescribí el texto (anti-spam).`,
  };
}

/**
 * Lista separada por comas en WHAPI_BROADCAST_BLOCK_SUBSTRINGS; si alguna aparece ≥ N veces → bloqueo.
 * N = WHAPI_BROADCAST_BLOCK_SUBSTRING_MAX (default 4). Vacío = off.
 */
export function assertBroadcastBodyBlockedSubstrings(bodyText) {
  const raw = String(process.env.WHAPI_BROADCAST_BLOCK_SUBSTRINGS || "").trim();
  if (!raw) return { ok: true };
  const maxHits = parseIntEnv("WHAPI_BROADCAST_BLOCK_SUBSTRING_MAX", 4);
  const s = String(bodyText || "").toLowerCase();
  const needles = raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  for (const n of needles) {
    let c = 0;
    let i = 0;
    while ((i = s.indexOf(n, i)) !== -1) {
      c += 1;
      i += n.length;
      if (c >= maxHits) {
        return {
          ok: false,
          error: `El mensaje repite demasiado un patrón bloqueado (“${n.slice(0, 24)}…”). Revisá WHAPI_BROADCAST_BLOCK_SUBSTRINGS.`,
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Si WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO=1 y métricas en alerta → bloquea nuevos masivos.
 */
export async function assertBroadcastNotBlockedByLowMetrics(tenantId) {
  const on = ["1", "true", "yes"].includes(String(process.env.WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO || "").toLowerCase());
  if (!on) return { ok: true };
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return { ok: true };
  try {
    const { getBroadcastMetricsReport } = await import("../services/broadcastReplyMetrics.js");
    const rep = await getBroadcastMetricsReport(tid, { days: 7, lowRatioPct: 20, consecutiveRequired: 3 });
    if (!rep.low_ratio_alert) return { ok: true };
    return {
      ok: false,
      error:
        "Masivos bloqueados: ratio de respuestas bajo varios días seguidos (WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO). Mejorá el contenido o contactá soporte; desactivá la variable solo si asumís el riesgo.",
    };
  } catch (e) {
    console.warn("[broadcast-guards] low ratio block", e?.message || e);
    return { ok: true };
  }
}

/** Encadena todas las guardas previas al envío. */
export async function assertAllBroadcastAntiBanGuards(tenantId, additionalRecipients, bodyText) {
  const chain = [
    assertBroadcastLocalTimeWindow(),
    await assertMinHoursBetweenBroadcasts(tenantId),
    await assertWeeklyRecipientCap(tenantId, additionalRecipients),
    await assertBroadcastCircuitBreaker(tenantId),
    assertBroadcastBodyCapsRatio(bodyText),
    assertBroadcastBodyBlockedSubstrings(bodyText),
    await assertBroadcastNotBlockedByLowMetrics(tenantId),
  ];
  for (const r of chain) {
    if (r && r.ok === false) return r;
  }
  return { ok: true };
}

/** Resumen para GET /metrics (solo lectura). */
export async function getBroadcastGuardsSummary(tenantId) {
  const tz = String(process.env.WHAPI_BROADCAST_LOCAL_TZ || "America/Argentina/Buenos_Aires").trim();
  const window = String(process.env.WHAPI_BROADCAST_LOCAL_WINDOW || "").trim();
  const mins = getLocalMinutesNow(tz);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  let inWindow = true;
  if (window) {
    const r = assertBroadcastLocalTimeWindow();
    inWindow = r.ok;
  }
  return {
    local_time_hhmm: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    local_tz: tz,
    local_window: window || null,
    in_window: inWindow,
    min_hours_between: parseIntEnv("WHAPI_BROADCAST_MIN_HOURS_BETWEEN", 0),
    max_recipients_week: parseIntEnv("WHAPI_BROADCAST_MAX_RECIPIENTS_WEEK", 0),
    circuit_lookback: parseIntEnv("WHAPI_BROADCAST_CIRCUIT_LOOKBACK", 0),
    circuit_error_ratio: parseFloatEnv("WHAPI_BROADCAST_CIRCUIT_ERROR_RATIO", 0.35),
    blocklist_threshold: parseIntEnv("WHAPI_BROADCAST_BLOCKLIST_FAIL_THRESHOLD", 3),
    reject_caps_pct: parseIntEnv("WHAPI_BROADCAST_REJECT_CAPS_PCT", 0),
    block_on_low_ratio: ["1", "true", "yes"].includes(
      String(process.env.WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO || "").toLowerCase()
    ),
  };
}
