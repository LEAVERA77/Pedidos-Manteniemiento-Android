import { query } from "../db/neon.js";
import { sendTenantWhatsAppText } from "./whatsappService.js";

const queue = [];
let running = false;
let seq = 1;

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function persistMetrics(job, result) {
  const detalles = JSON.stringify(result.erroresDetalle || []);
  const reintentos = Number(result.reintentosTotal || 0);
  const dur = Number(result.duracionMs || 0);
  try {
    await query(
      `UPDATE comunicaciones_envios
       SET enviados_ok = $2,
           enviados_error = $3,
           duracion_ms = $4,
           reintentos_total = $5,
           errores_detalle = $6::jsonb
       WHERE id = $1`,
      [job.comunicacionId, result.ok, result.err, dur, reintentos, detalles]
    );
  } catch (_) {}
  try {
    if (job.avisoId) {
      await query(
        `UPDATE avisos_comunitarios
         SET duracion_ms = $2,
             reintentos_total = $3,
             errores_detalle = $4::jsonb
         WHERE id = $1`,
        [job.avisoId, dur, reintentos, detalles]
      );
    }
  } catch (_) {}
}

async function processJob(job) {
  const start = nowMs();
  let ok = 0;
  let err = 0;
  let reintentosTotal = 0;
  const erroresDetalle = [];
  for (const to of job.telefonos) {
    let sent = false;
    let attempts = 0;
    let lastErr = null;
    while (!sent && attempts <= job.maxRetries) {
      attempts += 1;
      const r = await sendTenantWhatsAppText({
        tenantId: job.tenantId,
        toDigits: to,
        bodyText: job.cuerpo,
        pedidoId: null,
        logContext: job.logContext,
      });
      if (r.ok) {
        sent = true;
        ok += 1;
      } else {
        lastErr = r.error || r.graph?.error?.message || "send_failed";
        if (attempts <= job.maxRetries) {
          reintentosTotal += 1;
          await sleep(job.retryDelayMs);
        }
      }
    }
    if (!sent) {
      err += 1;
      erroresDetalle.push({ telefono: to, error: String(lastErr || "error") });
    }
    await sleep(job.perMessageDelayMs);
  }
  const result = {
    ok,
    err,
    reintentosTotal,
    erroresDetalle,
    duracionMs: nowMs() - start,
  };
  await persistMetrics(job, result);
  return result;
}

async function runLoop() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      try {
        job.resolve(await processJob(job));
      } catch (e) {
        job.reject(e);
      }
    }
  } finally {
    running = false;
  }
}

export function enqueueBroadcastJob({
  tenantId,
  telefonos,
  cuerpo,
  logContext,
  comunicacionId,
  avisoId = null,
  maxRetries = 2,
  retryDelayMs = 650,
  perMessageDelayMs = 110,
}) {
  return new Promise((resolve, reject) => {
    queue.push({
      id: seq++,
      tenantId,
      telefonos: Array.isArray(telefonos) ? telefonos : [],
      cuerpo,
      logContext,
      comunicacionId,
      avisoId,
      maxRetries,
      retryDelayMs,
      perMessageDelayMs,
      resolve,
      reject,
    });
    void runLoop();
  });
}
