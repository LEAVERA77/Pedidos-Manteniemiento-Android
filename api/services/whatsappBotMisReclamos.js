/**
 * Bot WhatsApp (Meta): consulta «Mis reclamos» y aviso a admins por chat humano.
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { sendTenantWhatsAppText } from "./whatsappService.js";

export const MSG_MIS_RECLAMOS_PEDIR_ID =
  "Ingresá tu *NIS*, *medidor*, *N° de vecino* o *N° de socio* (el dato que figure en tu cuenta o credencial):";

export function textoSubmenuTransitoMunicipio() {
  return (
    `Elegiste *Tránsito*. Indicá el tipo con el *número* del *1* al *6*:\n\n` +
    `*1)* Semáforo apagado/intermitente\n` +
    `*2)* Señalización dañada o faltante\n` +
    `*3)* Vehículo mal estacionado/abandonado\n` +
    `*4)* Calle cortada sin aviso\n` +
    `*5)* Semaforo fuera de sincronización\n` +
    `*6)* Otro problema de tránsito\n\n` +
    `_Escribí *menú* para cancelar · *atrás* para volver al menú de tipos._`
  );
}

function soloDigitos(s) {
  return String(s || "")
    .replace(/\D/g, "")
    .trim();
}

function normalizarEstadoNoCerradoSql() {
  return `UPPER(TRIM(COALESCE(estado::text,''))) NOT IN ('CERRADO','CANCELADO','CANCELADA','DESESTIMADO')`;
}

/**
 * Pedidos abiertos del tenant que coinciden por NIS / medidor / nis_medidor (texto o solo dígitos).
 * @param {number} tenantId
 * @param {string} rawQ
 * @returns {Promise<Array<{ id: number, numero_pedido: string|null, tipo_trabajo: string|null, estado: string|null, fecha_creacion: string|null }>>}
 */
export async function buscarPedidosAbiertosPorIdentificadorWhatsapp(tenantId, rawQ) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const q = String(rawQ || "").trim();
  if (q.length < 1 || q.length > 80) return [];

  const chk = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pedidos'`
  );
  const cols = new Set((chk.rows || []).map((r) => r.column_name));
  if (!cols.has("tenant_id")) return [];

  const dig = soloDigitos(q);
  const params = [tid];
  let cond = "";

  if (cols.has("nis")) {
    params.push(q);
    cond += ` OR TRIM(COALESCE(nis::text,'')) = TRIM($${params.length})`;
    if (dig.length >= 1) {
      params.push(dig);
      cond += ` OR regexp_replace(COALESCE(nis::text,''),'\\\\D','','g') = $${params.length}`;
    }
  }
  if (cols.has("medidor")) {
    params.push(q);
    cond += ` OR TRIM(COALESCE(medidor::text,'')) = TRIM($${params.length})`;
    if (dig.length >= 1) {
      params.push(dig);
      cond += ` OR regexp_replace(COALESCE(medidor::text,''),'\\\\D','','g') = $${params.length}`;
    }
  }
  if (cols.has("nis_medidor")) {
    params.push(q);
    cond += ` OR UPPER(TRIM(COALESCE(nis_medidor::text,''))) = UPPER(TRIM($${params.length}))`;
    if (dig.length >= 1) {
      params.push(dig);
      cond += ` OR regexp_replace(COALESCE(nis_medidor::text,''),'\\\\D','','g') = $${params.length}`;
    }
  }

  if (!cond) return [];

  const sql = `
    SELECT id, numero_pedido, tipo_trabajo, estado, fecha_creacion::text AS fecha_creacion
    FROM pedidos
    WHERE tenant_id = $1
      AND (${normalizarEstadoNoCerradoSql()})
      AND (${cond.slice(4)})
    ORDER BY fecha_creacion DESC NULLS LAST
    LIMIT 12`;
  try {
    const r = await query(sql, params);
    return (r.rows || []).map((row) => ({
      id: row.id,
      numero_pedido: row.numero_pedido != null ? String(row.numero_pedido) : null,
      tipo_trabajo: row.tipo_trabajo != null ? String(row.tipo_trabajo) : null,
      estado: row.estado != null ? String(row.estado) : null,
      fecha_creacion: row.fecha_creacion != null ? String(row.fecha_creacion) : null,
    }));
  } catch (e) {
    console.warn("[whatsapp-mis-reclamos] query", e?.message || e);
    return [];
  }
}

export function interpretaRespuestaSiOperadorWhatsapp(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) return null;
  if (t === "si" || t === "sí" || t === "ok" || t === "dale" || t === "1" || t === "si.") return true;
  if (t === "no" || t === "nop" || t === "2" || t === "nono") return false;
  return null;
}

/**
 * Aviso por WhatsApp a números de admins del tenant (telefono / whatsapp_notificaciones).
 */
export async function notificarAdminsChatOperadorSolicitadoWhatsapp({
  tenantId,
  nombreVecino,
  telefonoVecino,
}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return;
  const nom = String(nombreVecino || "").trim() || "Vecino";
  const tel = String(telefonoVecino || "").replace(/\D/g, "") || "—";
  const body = `📞 *Chat solicitado* — ${nom} — Tel: ${tel}`;

  try {
    const colMeta = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'usuarios'`
    );
    const cset = new Set((colMeta.rows || []).map((x) => x.column_name));
    const col = cset.has("tenant_id") ? "tenant_id" : cset.has("cliente_id") ? "cliente_id" : null;
    if (!col) return;

    const r = await query(
      `SELECT TRIM(COALESCE(telefono::text,'')) AS telefono,
              TRIM(COALESCE(whatsapp_notificaciones::text,'')) AS whatsapp_notificaciones
       FROM usuarios
       WHERE ${col} = $1 AND activo = TRUE
         AND (
           LOWER(COALESCE(rol::text,'')) = 'admin'
           OR LOWER(COALESCE(rol::text,'')) = 'administrador'
         )`,
      [tid]
    );
    const enviados = new Set();
    for (const row of r.rows || []) {
      for (const k of ["telefono", "whatsapp_notificaciones"]) {
        const d = String(row[k] || "").replace(/\D/g, "");
        if (d.length < 10 || enviados.has(d)) continue;
        enviados.add(d);
        await sendTenantWhatsAppText({
          tenantId: tid,
          toDigits: d,
          bodyText: body,
          logContext: "wa_chat_operador_solicitado",
        }).catch((e) => console.warn("[whatsapp-mis-reclamos] notify admin", d.slice(0, 4), e?.message || e));
      }
    }
  } catch (e) {
    console.warn("[whatsapp-mis-reclamos] notificarAdmins", e?.message || e);
  }
}
