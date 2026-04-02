import { query } from "../db/neon.js";
import {
  tipoTrabajoPermitidoParaNuevoPedido,
} from "./tiposReclamo.js";

async function columnasUsuarios() {
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios'`
  );
  return new Set((cols.rows || []).map((c) => c.column_name));
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

  const insert = await query(
    `INSERT INTO pedidos (
      numero_pedido, distribuidor, setd, cliente, tipo_trabajo, descripcion, prioridad,
      estado, avance, lat, lng, usuario_id, usuario_creador_id, fecha_creacion,
      telefono_contacto, cliente_nombre
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      'Pendiente',0,$8,$9,$10,$10,NOW(),
      $11,$12
    ) RETURNING *`,
    [
      numeroPedido,
      distribuidor,
      null,
      null,
      tt,
      de,
      "Media",
      lat ?? null,
      lng ?? null,
      usuarioId,
      telefonoContacto || null,
      `WhatsApp ${telefonoContacto || ""}`.trim(),
    ]
  );
  return insert.rows[0];
}
