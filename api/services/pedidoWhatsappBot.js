import { query } from "../db/neon.js";
import {
  tipoTrabajoPermitidoParaNuevoPedido,
} from "./tiposReclamo.js";

async function columnasUsuarios() {
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios'`
  );
  return new Set((cols.rows || []).map((c) => c.column_name));
}

let _pedidosColsCache = null;
async function columnasPedidos() {
  if (_pedidosColsCache) return _pedidosColsCache;
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos'`
  );
  _pedidosColsCache = new Set((cols.rows || []).map((c) => c.column_name));
  return _pedidosColsCache;
}

export async function getFirstAdminUserIdForTenant(tenantId) {
  const colSet = await columnasUsuarios();
  const hasTenant = colSet.has("tenant_id");
  const hasCliente = colSet.has("cliente_id");
  const col = hasTenant ? "tenant_id" : hasCliente ? "cliente_id" : null;
  if (!col) return null;
  const r = await query(
    `SELECT id FROM usuarios
     WHERE ${col} = $1 AND activo = TRUE
       AND (
         LOWER(COALESCE(rol::text, '')) = 'admin'
         OR LOWER(COALESCE(rol::text, '')) = 'administrador'
       )
     ORDER BY id ASC
     LIMIT 1`,
    [tenantId]
  );
  return r.rows?.[0]?.id ?? null;
}

export async function getDefaultDistribuidorCodigo() {
  const fromEnv = String(process.env.WHATSAPP_BOT_DISTRIBUIDOR_CODIGO || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const r = await query(
      `SELECT codigo FROM distribuidores WHERE activo = TRUE ORDER BY codigo ASC LIMIT 1`
    );
    return r.rows?.[0]?.codigo || "WHATSAPP";
  } catch (_) {
    return "WHATSAPP";
  }
}

/**
 * Crea un pedido desde el bot (usuario = primer admin del tenant).
 */
export async function crearPedidoDesdeWhatsappBot({
  tenantId,
  tipoCliente,
  tipoTrabajo,
  descripcion,
  telefonoContacto,
  lat,
  lng,
  contactName,
}) {
  const tt = String(tipoTrabajo || "").trim();
  const de = String(descripcion || "").trim();
  if (!tt || !de) {
    throw new Error("tipo_y_descripcion_requeridos");
  }
  if (!tipoTrabajoPermitidoParaNuevoPedido(tt, tipoCliente)) {
    throw new Error("tipo_trabajo_invalido");
  }

  const usuarioId = await getFirstAdminUserIdForTenant(tenantId);
  if (!usuarioId) {
    throw new Error("sin_usuario_admin_tenant");
  }

  const distribuidor = await getDefaultDistribuidorCodigo();

  await query(
    `INSERT INTO pedido_contador(anio, ultimo_numero)
     VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0)
     ON CONFLICT (anio) DO NOTHING`
  );
  const rCont = await query(
    `UPDATE pedido_contador
     SET ultimo_numero = ultimo_numero + 1
     WHERE anio = EXTRACT(YEAR FROM CURRENT_DATE)::INT
     RETURNING anio, ultimo_numero`
  );
  const row = rCont.rows?.[0];
  if (!row) throw new Error("contador_pedido");
  const numeroPedido = `${row.anio}-${String(row.ultimo_numero).padStart(4, "0")}`;

  const cn = String(contactName || "").trim();
  const clienteNombre =
    cn || `WhatsApp ${String(telefonoContacto || "").replace(/\D/g, "")}`.trim() || "WhatsApp";

  const pCols = await columnasPedidos();
  const hasTenant = pCols.has("tenant_id");
  const hasOrigen = pCols.has("origen_reclamo");

  const cols = [
    "numero_pedido",
    "distribuidor",
    "setd",
    "cliente",
    "tipo_trabajo",
    "descripcion",
    "prioridad",
    "estado",
    "avance",
    "lat",
    "lng",
    "usuario_id",
    "usuario_creador_id",
    "fecha_creacion",
    "telefono_contacto",
    "cliente_nombre",
  ];
  const vals = [
    numeroPedido,
    distribuidor,
    null,
    null,
    tt,
    de,
    "Media",
    "Pendiente",
    0,
    lat ?? null,
    lng ?? null,
    usuarioId,
    usuarioId,
    new Date(),
    telefonoContacto || null,
    clienteNombre,
  ];

  if (hasTenant) {
    cols.push("tenant_id");
    vals.push(Number(tenantId));
  }
  if (hasOrigen) {
    cols.push("origen_reclamo");
    vals.push("whatsapp");
  }

  const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
  const insert = await query(
    `INSERT INTO pedidos (${cols.join(", ")}) VALUES (${ph}) RETURNING *`,
    vals
  );
  const pedidoRow = insert.rows[0];
  setImmediate(() => {
    notificarAdminsNuevoPedidoWhatsappSafe(Number(tenantId), pedidoRow).catch(() => {});
  });
  return pedidoRow;
}

/**
 * Inserta filas en notificaciones_movil para admins del tenant (app móvil / panel que las lea).
 * El front web en GitHub Pages suele refrescar pedidos vía polling; este hook acelera avisos en clientes que consuman la tabla.
 */
async function notificarAdminsNuevoPedidoWhatsappSafe(tenantId, pedido) {
  if (!pedido?.id) return;
  try {
    const t = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'notificaciones_movil' LIMIT 1`
    );
    if (!t.rows.length) return;

    const colSet = await columnasUsuarios();
    const hasTenant = colSet.has("tenant_id");
    const hasCliente = colSet.has("cliente_id");
    const col = hasTenant ? "tenant_id" : hasCliente ? "cliente_id" : null;
    if (!col) return;

    const admins = await query(
      `SELECT id FROM usuarios
       WHERE ${col} = $1 AND activo = TRUE
         AND (
           LOWER(COALESCE(rol::text, '')) = 'admin'
           OR LOWER(COALESCE(rol::text, '')) = 'administrador'
         )`,
      [tenantId]
    );
    const titulo = "Nuevo reclamo (WhatsApp)";
    const cuerpo = `Se registró el reclamo *${pedido.numero_pedido}* desde WhatsApp.`;
    for (const a of admins.rows || []) {
      await query(
        `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [a.id, pedido.id, titulo, cuerpo]
      );
    }
  } catch (e) {
    console.error("[pedido-whatsapp-bot] notificar admins", e.message);
  }
}
