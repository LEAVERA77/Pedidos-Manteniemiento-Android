/**
 * Registro de auditoría operativa (cambios de estado en pedidos).
 * made by leavera77
 */

import { query } from "../db/neon.js";

let _tableReady = false;

export async function ensureOperacionAuditTable() {
  if (_tableReady) return true;
  await query(`
    CREATE TABLE IF NOT EXISTS operacion_audit_log (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      usuario_id INTEGER,
      pedido_id INTEGER,
      accion VARCHAR(64) NOT NULL,
      detalle JSONB,
      estado_anterior VARCHAR(64),
      estado_nuevo VARCHAR(64),
      ip_address VARCHAR(45),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_operacion_audit_tenant_created
    ON operacion_audit_log (tenant_id, created_at DESC)
  `);
  _tableReady = true;
  return true;
}

/**
 * @param {object} p
 * @param {number} p.tenantId
 * @param {number|null} [p.usuarioId]
 * @param {number|null} [p.pedidoId]
 * @param {string} p.accion
 * @param {object|null} [p.detalle]
 * @param {string|null} [p.estadoAnterior]
 * @param {string|null} [p.estadoNuevo]
 * @param {import('express').Request} [p.req]
 */
export async function logOperacionAudit({
  tenantId,
  usuarioId = null,
  pedidoId = null,
  accion,
  detalle = null,
  estadoAnterior = null,
  estadoNuevo = null,
  req = null,
}) {
  if (!tenantId || !accion) return;
  await ensureOperacionAuditTable();
  const ip =
    req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req?.socket?.remoteAddress ||
    null;
  await query(
    `INSERT INTO operacion_audit_log
       (tenant_id, usuario_id, pedido_id, accion, detalle, estado_anterior, estado_nuevo, ip_address)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
    [
      tenantId,
      usuarioId,
      pedidoId,
      String(accion).slice(0, 64),
      detalle ? JSON.stringify(detalle) : null,
      estadoAnterior,
      estadoNuevo,
      ip,
    ]
  );
}

/**
 * @param {import('express').Request} req
 * @param {{ limit?: number }} [opts]
 */
export async function listOperacionAudit(req, opts = {}) {
  await ensureOperacionAuditTable();
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);
  const params = [req.tenantId, limit];
  const r = await query(
    `SELECT a.id, a.pedido_id, a.accion, a.estado_anterior, a.estado_nuevo,
            a.detalle, a.created_at,
            u.nombre AS usuario_nombre, u.email AS usuario_email
     FROM operacion_audit_log a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.tenant_id = $1
     ORDER BY a.created_at DESC
     LIMIT $2`,
    params
  );
  return { registros: r.rows || [] };
}
