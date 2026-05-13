/**
 * Bot WhatsApp (Meta): consulta «Mis reclamos» y aviso a admins por chat humano.
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { sendTenantWhatsAppText } from "./whatsappService.js";
import { normalizarRubroCliente } from "./tiposReclamo.js";

/** Fila especial en lista interactiva de tipos (debe coincidir con `whatsappBotMeta`). */
export const WHATSAPP_LIST_ROW_MIS_RECLAMOS = "Mis reclamos";

export function mensajePedirIdentificadorMisReclamos(tipoCliente) {
  const r = normalizarRubroCliente(tipoCliente);
  let idLine = "Ingresá el dato de tu cuenta (como figura en la factura o credencial):";
  if (r === "municipio") {
    idLine = "Ingresá tu *ID Vecino* (el dato que figure en tu cuenta o credencial):";
  } else if (r === "cooperativa_agua") {
    idLine = "Ingresá tu *N° de Socio* o *medidor* (el dato en tu cuenta):";
  } else {
    idLine = "Ingresá tu *NIS* o *medidor* (el dato en tu cuenta):";
  }
  return (
    `${idLine}\n\n` +
    "Si *no tenés* ese dato a mano, escribí tu *nombre y apellido* o *solo nombre*: buscaremos *coincidencias aproximadas* en reclamos vigentes y te pediremos que elijas con un *número*.\n\n" +
    "_También podés escribir *operador* en cualquier momento para hablar con una persona._"
  );
}

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
 * @returns {Promise<Array<{ id: number, numero_pedido: string|null, tipo_trabajo: string|null, estado: string|null, fecha_creacion: string|null, derivado_destino_nombre: string|null }>>}
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

  const hasDdn = cols.has("derivado_destino_nombre");
  const sql = `
    SELECT id, numero_pedido, tipo_trabajo, estado, fecha_creacion::text AS fecha_creacion
    ${hasDdn ? ", TRIM(COALESCE(derivado_destino_nombre::text,'')) AS derivado_destino_nombre" : ", NULL::text AS derivado_destino_nombre"}
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
      derivado_destino_nombre:
        row.derivado_destino_nombre != null ? String(row.derivado_destino_nombre).trim() || null : null,
    }));
  } catch (e) {
    console.warn("[whatsapp-mis-reclamos] query", e?.message || e);
    return [];
  }
}

/** Distancia de Levenshtein (texto corto; nombres en WhatsApp). */
export function distanciaLevenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  const v0 = new Array(n + 1);
  const v1 = new Array(n + 1);
  for (let j = 0; j <= n; j++) v0[j] = j;
  for (let i = 0; i < m; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const cost = s.charCodeAt(i) === t.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= n; j++) v0[j] = v1[j];
  }
  return v0[n];
}

function nombreCanonVecino(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function puntajeNombreBusqueda(queryCanon, nombreFila) {
  const q = queryCanon;
  const n = nombreCanonVecino(nombreFila);
  if (!q.length || !n.length) return 999;
  if (n.includes(q) || q.includes(n)) return 0;
  const d = distanciaLevenshtein(q, n);
  const maxL = Math.max(q.length, n.length) || 1;
  const ratio = d / maxL;
  if (ratio <= 0.38 || d <= 3) return d + ratio * 0.01;
  const tokens = n.split(" ").filter((x) => x.length > 2);
  let best = 999;
  for (const tok of tokens) {
    const d2 = distanciaLevenshtein(q, tok);
    const mx2 = Math.max(q.length, tok.length) || 1;
    const r2 = d2 / mx2;
    if (r2 <= 0.42 || d2 <= 2) best = Math.min(best, d2 + r2 * 0.01);
  }
  return best < 999 ? best + 0.5 : 999;
}

/**
 * Pedidos abiertos cuyo `telefono_contacto` coincide con el WhatsApp del vecino (dígitos).
 */
export async function buscarPedidosAbiertosPorTelefonoContactoWhatsapp(tenantId, phoneDigits) {
  const tid = Number(tenantId);
  const dig = soloDigitos(phoneDigits);
  if (!Number.isFinite(tid) || tid < 1 || dig.length < 8) return [];
  const chk = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pedidos'`
  );
  const cols = new Set((chk.rows || []).map((r) => r.column_name));
  if (!cols.has("tenant_id") || !cols.has("telefono_contacto")) return [];

  const hasDdn = cols.has("derivado_destino_nombre");
  const suf = dig.length >= 10 ? dig.slice(-10) : dig.slice(-8);
  const sql = `
    SELECT id, numero_pedido, tipo_trabajo, estado, fecha_creacion::text AS fecha_creacion
    ${hasDdn ? ", TRIM(COALESCE(derivado_destino_nombre::text,'')) AS derivado_destino_nombre" : ", NULL::text AS derivado_destino_nombre"}
    FROM pedidos
    WHERE tenant_id = $1
      AND (${normalizarEstadoNoCerradoSql()})
      AND LENGTH(TRIM(COALESCE(telefono_contacto::text,''))) > 6
      AND (
        regexp_replace(COALESCE(telefono_contacto::text,''),'\\D','','g') = $2
        OR regexp_replace(COALESCE(telefono_contacto::text,''),'\\D','','g') LIKE '%' || $3 || '%'
      )
    ORDER BY fecha_creacion DESC NULLS LAST
    LIMIT 12`;
  try {
    const r = await query(sql, [tid, dig, suf]);
    return (r.rows || []).map((row) => ({
      id: row.id,
      numero_pedido: row.numero_pedido != null ? String(row.numero_pedido) : null,
      tipo_trabajo: row.tipo_trabajo != null ? String(row.tipo_trabajo) : null,
      estado: row.estado != null ? String(row.estado) : null,
      fecha_creacion: row.fecha_creacion != null ? String(row.fecha_creacion) : null,
      derivado_destino_nombre:
        row.derivado_destino_nombre != null ? String(row.derivado_destino_nombre).trim() || null : null,
    }));
  } catch (e) {
    console.warn("[whatsapp-mis-reclamos] telefono", e?.message || e);
    return [];
  }
}

/**
 * Coincidencias por nombre/apellido en reclamos vigentes (Levenshtein y subcadenas).
 */
export async function buscarPedidosAbiertosPorNombreLevenshteinWhatsapp(tenantId, rawQ) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const q0 = String(rawQ || "").trim();
  if (q0.length < 2 || q0.length > 80) return [];
  const q = nombreCanonVecino(q0);
  if (q.length < 2 || !/[a-záéíóúüñ]/.test(q)) return [];

  const chk = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pedidos'`
  );
  const cols = new Set((chk.rows || []).map((r) => r.column_name));
  if (!cols.has("tenant_id")) return [];
  const hasCn = cols.has("cliente_nombre");
  const hasCl = cols.has("cliente");
  if (!hasCn && !hasCl) return [];

  const nameSql = hasCn && hasCl
    ? "NULLIF(TRIM(BOTH ' ' FROM CONCAT_WS(' ', NULLIF(TRIM(COALESCE(cliente_nombre::text,'')),''), NULLIF(TRIM(COALESCE(cliente::text,'')),''))), '')"
    : hasCn
      ? "NULLIF(TRIM(COALESCE(cliente_nombre::text,'')),'')"
      : "NULLIF(TRIM(COALESCE(cliente::text,'')),'')";

  const hasDdn = cols.has("derivado_destino_nombre");
  const sql = `
    SELECT id, numero_pedido, tipo_trabajo, estado, fecha_creacion::text AS fecha_creacion,
    ${hasDdn ? "TRIM(COALESCE(derivado_destino_nombre::text,'')) AS derivado_destino_nombre" : "NULL::text AS derivado_destino_nombre"},
    ${nameSql} AS nombre_reclamante
    FROM pedidos
    WHERE tenant_id = $1
      AND (${normalizarEstadoNoCerradoSql()})
      AND LENGTH(${nameSql}) > 2
    ORDER BY fecha_creacion DESC NULLS LAST
    LIMIT 120`;

  try {
    const r = await query(sql, [tid]);
    const scored = [];
    for (const row of r.rows || []) {
      const nom = row.nombre_reclamante != null ? String(row.nombre_reclamante).trim() : "";
      const sc = puntajeNombreBusqueda(q, nom);
      if (sc >= 999) continue;
      scored.push({
        score: sc,
        id: row.id,
        numero_pedido: row.numero_pedido != null ? String(row.numero_pedido) : null,
        tipo_trabajo: row.tipo_trabajo != null ? String(row.tipo_trabajo) : null,
        estado: row.estado != null ? String(row.estado) : null,
        fecha_creacion: row.fecha_creacion != null ? String(row.fecha_creacion) : null,
        derivado_destino_nombre:
          row.derivado_destino_nombre != null ? String(row.derivado_destino_nombre).trim() || null : null,
        nombre_reclamante: nom || null,
      });
    }
    scored.sort((a, b) => a.score - b.score || String(b.fecha_creacion || "").localeCompare(String(a.fecha_creacion || "")));
    const out = [];
    const seen = new Set();
    for (const it of scored) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push({
        id: it.id,
        numero_pedido: it.numero_pedido,
        tipo_trabajo: it.tipo_trabajo,
        estado: it.estado,
        fecha_creacion: it.fecha_creacion,
        derivado_destino_nombre: it.derivado_destino_nombre,
      });
      if (out.length >= 8) break;
    }
    return out;
  } catch (e) {
    console.warn("[whatsapp-mis-reclamos] nombre", e?.message || e);
    return [];
  }
}

/**
 * Orden de búsqueda: identificador de cuenta → teléfono del reclamo → nombre aproximado.
 * @returns {{ rows: Array<any>, origen: 'id'|'tel'|'nombre'|'vacío' }}
 */
export async function resolverBusquedaMisReclamosWhatsapp(tenantId, idTxt, phoneDigitsVecino) {
  const rowsId = await buscarPedidosAbiertosPorIdentificadorWhatsapp(tenantId, idTxt);
  if (rowsId.length) return { rows: rowsId, origen: "id" };
  const dig = soloDigitos(phoneDigitsVecino);
  if (dig.length >= 8) {
    const rowsTel = await buscarPedidosAbiertosPorTelefonoContactoWhatsapp(tenantId, dig);
    if (rowsTel.length) return { rows: rowsTel, origen: "tel" };
  }
  const rowsNom = await buscarPedidosAbiertosPorNombreLevenshteinWhatsapp(tenantId, idTxt);
  if (rowsNom.length) return { rows: rowsNom, origen: "nombre" };
  return { rows: [], origen: "vacío" };
}

export function mensajeNoEncontramosMisReclamos(tipoCliente) {
  const ay = textoAyudaMisReclamosMenuInicial(tipoCliente);
  return (
    `No encontramos *reclamos vigentes* con ese dato (${ay}, nombre o teléfono cargado en el reclamo). ` +
    "Revisá la información o escribí *operador* para ayuda humana. *Menú* para volver."
  );
}

/** Texto corto para el menú de bienvenida (rubro). */
export function textoAyudaMisReclamosMenuInicial(tipoCliente) {
  const r = normalizarRubroCliente(tipoCliente);
  if (r === "municipio") return "ID Vecino";
  if (r === "cooperativa_agua") return "N° de Socio o medidor";
  return "NIS o medidor";
}

/**
 * Una línea por pedido (formato pedido en Mis reclamos).
 * @param {{ numero_pedido?: string|null, id: number, tipo_trabajo?: string|null, estado?: string|null, derivado_destino_nombre?: string|null }} r
 */
export function formatoLineaPedidoVigenteMisReclamos(r) {
  const npRaw = r.numero_pedido != null ? String(r.numero_pedido).trim() : "";
  const np = npRaw ? (npRaw.startsWith("#") ? npRaw : `#${npRaw}`) : `#${r.id}`;
  const tt = r.tipo_trabajo || "—";
  const esRaw = r.estado != null ? String(r.estado).trim() : "";
  const esLow = esRaw.toLowerCase().replace(/\s+/g, "");
  const derivNom = r.derivado_destino_nombre != null ? String(r.derivado_destino_nombre).trim() : "";
  if ((esLow.includes("derivado") || esLow.includes("externo")) && derivNom) {
    const nom = derivNom.slice(0, 80);
    return `${np} - ${tt} - Derivado a ${nom}`;
  }
  return `${np} - ${tt} - ${esRaw || "—"}`;
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
