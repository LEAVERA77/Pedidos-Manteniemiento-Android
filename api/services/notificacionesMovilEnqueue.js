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
