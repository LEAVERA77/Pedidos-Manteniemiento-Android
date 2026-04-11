/**
 * Persistencia de operaciones de geocodificación WhatsApp (correlation_id + pasos[]).
 * Degradación: si la tabla no existe, las funciones no fallan el alta (solo log).
 *
 * made by leavera77
 */

import { query } from "../db/neon.js";

let _tableMissingLogged = false;

function logTableMissingOnce(e) {
  if (_tableMissingLogged) return;
  const m = String(e?.message || "");
  if (m.includes("geocod_wa_operaciones") || m.includes("does not exist")) {
    console.warn("[geocod-wa-operaciones] tabla ausente; ejecutá migración geocod_wa_operaciones.sql");
    _tableMissingLogged = true;
  }
}

/** Enmascara teléfono: últimos 4 dígitos visibles. */
export function enmascararTelefonoWhatsapp(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `****${d.slice(-4)}`;
}

/**
 * @param {{ correlationId: string, tenantId: number, telefonoMasked?: string|null, meta?: object }} p
 */
export async function geocodWaOperacionCreate(p) {
  const { correlationId, tenantId, telefonoMasked, meta } = p;
  if (!correlationId || tenantId == null) return;
  try {
    await query(
      `INSERT INTO geocod_wa_operaciones (correlation_id, tenant_id, telefono_masked, meta, pasos, estado)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'running')`,
      [
        correlationId,
        Number(tenantId),
        telefonoMasked || null,
        meta != null ? JSON.stringify(meta) : null,
        JSON.stringify([{ slug: "inicio", t: new Date().toISOString(), detail: "operación creada" }]),
      ]
    );
  } catch (e) {
    if (String(e?.message || "").includes("duplicate key")) return;
    logTableMissingOnce(e);
  }
}

/**
 * @param {string} correlationId
 * @param {object} paso — { slug, t?, ms?, ok?, err?, detail? }
 */
export async function geocodWaOperacionAppendPaso(correlationId, paso) {
  if (!correlationId || !paso?.slug) return;
  try {
    const r = await query(`SELECT pasos FROM geocod_wa_operaciones WHERE correlation_id = $1 LIMIT 1`, [
      correlationId,
    ]);
    const prev = r.rows?.[0]?.pasos;
    let arr = [];
    if (Array.isArray(prev)) arr = prev;
    else if (prev && typeof prev === "object") {
      try {
        arr = JSON.parse(JSON.stringify(prev));
      } catch (_) {
        arr = [];
      }
    }
    const row = {
      ...paso,
      t: paso.t || new Date().toISOString(),
    };
    arr.push(row);
    const cap = 400;
    if (arr.length > cap) arr = arr.slice(-cap);
    await query(
      `UPDATE geocod_wa_operaciones SET pasos = $2::jsonb, updated_at = NOW() WHERE correlation_id = $1`,
      [correlationId, JSON.stringify(arr)]
    );
  } catch (e) {
    logTableMissingOnce(e);
  }
}

export async function geocodWaOperacionFinishOk(correlationId, { pedidoId, numeroPedido, fuente } = {}) {
  if (!correlationId) return;
  try {
    await geocodWaOperacionAppendPaso(correlationId, {
      slug: "alta_completa",
      ok: true,
      detail: `pedido ${numeroPedido || pedidoId || ""}`.trim(),
    });
    await query(
      `UPDATE geocod_wa_operaciones
       SET estado = 'ok',
           pedido_id = COALESCE($2::int, pedido_id),
           numero_pedido = COALESCE($3::text, numero_pedido),
           fuente_final = COALESCE($4::text, fuente_final),
           updated_at = NOW()
       WHERE correlation_id = $1 AND estado = 'running'`,
      [correlationId, pedidoId ?? null, numeroPedido ?? null, fuente ?? null]
    );
  } catch (e) {
    logTableMissingOnce(e);
  }
}

export async function geocodWaOperacionFinishErr(correlationId, err, extra = {}) {
  if (!correlationId) return;
  const msg = String(err?.message || err || "error");
  try {
    await geocodWaOperacionAppendPaso(correlationId, {
      slug: "error_final",
      ok: false,
      err: msg.slice(0, 2000),
      detail: extra.detail ? String(extra.detail).slice(0, 500) : undefined,
    });
    await query(
      `UPDATE geocod_wa_operaciones
       SET estado = 'error',
           mensaje_error = LEFT($2::text, 4000),
           updated_at = NOW()
       WHERE correlation_id = $1 AND estado = 'running'`,
      [correlationId, msg]
    );
  } catch (e) {
    logTableMissingOnce(e);
  }
}

export async function geocodWaOperacionListForTenant(tenantId, limit = 20) {
  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  try {
    const r = await query(
      `SELECT id, correlation_id, tenant_id, telefono_masked, estado, pasos, mensaje_error, meta,
              pedido_id, numero_pedido, fuente_final, started_at, updated_at
       FROM geocod_wa_operaciones
       WHERE tenant_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [Number(tenantId), lim]
    );
    return r.rows || [];
  } catch (e) {
    logTableMissingOnce(e);
    return [];
  }
}

export async function geocodWaOperacionGet(correlationId, tenantId) {
  try {
    const r = await query(
      `SELECT id, correlation_id, tenant_id, telefono_masked, estado, pasos, mensaje_error, meta,
              pedido_id, numero_pedido, fuente_final, started_at, updated_at
       FROM geocod_wa_operaciones
       WHERE correlation_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [correlationId, Number(tenantId)]
    );
    return r.rows?.[0] || null;
  } catch (e) {
    logTableMissingOnce(e);
    return null;
  }
}

/** Telemetría para `pipelineGeocodificacionPedido` / `resolverCoordenadasCandidatoWhatsapp`. */
export function buildTelemetriaForCorrelation(correlationId) {
  if (!correlationId) return null;
  return {
    correlationId,
    recordPaso: async (partial) => {
      await geocodWaOperacionAppendPaso(correlationId, partial);
    },
  };
}
