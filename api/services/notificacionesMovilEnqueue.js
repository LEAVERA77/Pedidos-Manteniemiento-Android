/**
 * Encola avisos en notificaciones_movil (app Android / consumidores de la cola).
 * Sin FCM: el técnico recibe notificación local vía WebView (~45s) o WorkManager (~15 min).
 */

import { query } from "../db/neon.js";

let _tableChecked = false;
let _hasTable = false;

async function ensureNotificacionesMovilTable() {
  if (_tableChecked) return _hasTable;
  _tableChecked = true;
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'notificaciones_movil' LIMIT 1`
    );
    _hasTable = t.rows.length > 0;
  } catch {
    _hasTable = false;
  }
  return _hasTable;
}

/**
 * Avisar al técnico asignado cuando otro usuario (p. ej. admin) cierra el pedido por API.
 */
export async function enqueueNotificacionPedidoCerradoParaTecnico({
  tecnicoUsuarioId,
  pedidoId,
  numeroPedido,
  cerradoPorUsuarioId,
}) {
  const tid = Number(tecnicoUsuarioId);
  const cerr = cerradoPorUsuarioId != null ? Number(cerradoPorUsuarioId) : null;
  if (!Number.isFinite(tid) || tid < 1) return;
  if (Number.isFinite(cerr) && cerr === tid) return;
  const pid = Number(pedidoId);
  if (!Number.isFinite(pid) || pid < 1) return;
  if (!(await ensureNotificacionesMovilTable())) return;
  const np = String(numeroPedido || "").trim() || `#${pid}`;
  const titulo = "Pedido cerrado";
  const cuerpo = `El reclamo ${np} fue cerrado desde la central.`;
  try {
    await query(
      `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida)
       VALUES ($1, $2, $3, $4, FALSE)`,
      [tid, pid, titulo, cuerpo]
    );
  } catch (e) {
    console.error("[notificacionesMovilEnqueue] cierre técnico", e.message);
  }
}

async function tenantColumnForUsuarios() {
  try {
    const c = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios'`);
    const names = c.rows.map((r) => r.column_name);
    if (names.includes("tenant_id")) return "tenant_id";
    if (names.includes("cliente_id")) return "cliente_id";
  } catch (_) {}
  return null;
}

/**
 * Chat interno pedido: avisa al técnico si escribió admin, o a admins del tenant si escribió técnico.
 */
export async function enqueueNotificacionChatInternoPedido({
  pedido,
  autorUserId,
  autorRol,
  cuerpoSnippet,
  tenantId,
}) {
  if (!(await ensureNotificacionesMovilTable())) return;
  const pid = Number(pedido?.id);
  if (!Number.isFinite(pid) || pid < 1) return;
  const np = String(pedido.numero_pedido || "").trim() || `#${pid}`;
  const tid = Number(tenantId);
  const autor = Number(autorUserId);
  const snippet = String(cuerpoSnippet || "").trim().slice(0, 120);
  const titulo = `Mensaje en reclamo ${np}`;
  const cuerpo = snippet || "Nuevo mensaje en el chat del reclamo";

  try {
    if (autorRol === "admin") {
      const tech = pedido.tecnico_asignado_id != null ? Number(pedido.tecnico_asignado_id) : null;
      if (Number.isFinite(tech) && tech >= 1 && tech !== autor) {
        await query(
          `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida)
           VALUES ($1, $2, $3, $4, FALSE)`,
          [tech, pid, titulo, cuerpo]
        );
      }
      return;
    }

    const col = await tenantColumnForUsuarios();
    let rows;
    if (col && Number.isFinite(tid) && tid >= 1) {
      const r = await query(
        `SELECT id FROM usuarios WHERE ${col} = $1 AND rol = 'admin' AND activo = TRUE AND id != $2`,
        [tid, autor]
      );
      rows = r.rows;
    } else {
      const r = await query(
        `SELECT id FROM usuarios WHERE rol = 'admin' AND activo = TRUE AND id != $1`,
        [autor]
      );
      rows = r.rows;
    }
    for (const row of rows || []) {
      const uid = Number(row.id);
      if (!Number.isFinite(uid) || uid < 1) continue;
      await query(
        `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [uid, pid, titulo, cuerpo]
      );
    }
  } catch (e) {
    console.error("[notificacionesMovilEnqueue] chat interno", e.message);
  }
}

/**
 * Técnico solicita derivación a tercero → avisar a admins del tenant (panel web + cola móvil).
 */
export async function enqueueNotificacionSolicitudDerivacionParaAdmins({
  tenantId,
  pedidoId,
  numeroPedido,
  motivoSnippet,
}) {
  if (!(await ensureNotificacionesMovilTable())) return;
  const tid = Number(tenantId);
  const pid = Number(pedidoId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(pid) || pid < 1) return;
  const np = String(numeroPedido || "").trim() || `#${pid}`;
  const snip = String(motivoSnippet || "")
    .trim()
    .slice(0, 160);
  const titulo = "Solicitud de derivación (técnico)";
  const cuerpo = snip
    ? `${np}: el técnico pide derivar a un tercero. Motivo: ${snip}`
    : `${np}: el técnico pidió derivar el reclamo a un tercero. Revisá la cola de derivaciones.`;
  try {
    const col = await tenantColumnForUsuarios();
    let rows;
    if (col && Number.isFinite(tid) && tid >= 1) {
      const r = await query(
        `SELECT id FROM usuarios WHERE ${col} = $1 AND activo = TRUE
         AND (LOWER(COALESCE(rol::text,'')) = 'admin' OR LOWER(COALESCE(rol::text,'')) = 'administrador')`,
        [tid]
      );
      rows = r.rows;
    } else {
      const r = await query(
        `SELECT id FROM usuarios WHERE activo = TRUE
         AND (LOWER(COALESCE(rol::text,'')) = 'admin' OR LOWER(COALESCE(rol::text,'')) = 'administrador')`,
        []
      );
      rows = r.rows;
    }
    if (!rows?.length) return;
    for (const row of rows) {
      const uid = Number(row.id);
      if (!Number.isFinite(uid) || uid < 1) continue;
      await query(
        `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [uid, pid, titulo, cuerpo]
      );
    }
  } catch (e) {
    console.error("[notificacionesMovilEnqueue] solicitud derivación admin", e.message);
  }
}
