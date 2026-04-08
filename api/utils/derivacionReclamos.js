/**
 * Configuración `clientes.configuracion.derivacion_reclamos`.
 * Slots simples: { nombre?, whatsapp? } con whatsapp internacional +549...
 * Listas (internet, TV): array de esos slots (máx. DERIVACION_LIST_MAX).
 */

export const DERIVACION_LIST_MAX = 15;

const SLOT_KEYS_SINGLE = [
  "empresa_energia",
  "cooperativa_agua",
  "empresa_gas_natural",
  "empresa_telefonia",
];

const SLOT_KEYS_LIST = ["empresa_internet", "empresa_tv_cable"];

export const DERIVACION_RECLAMOS_SINGLE_KEYS = [...SLOT_KEYS_SINGLE];
export const DERIVACION_RECLAMOS_LIST_KEYS = [...SLOT_KEYS_LIST];

const MAX_NOMBRE = 120;
const MAX_WA_LEN = 24;

/** Solo dígitos tras opcional + inicial (formato internacional simple). */
export function isValidWhatsappInternational(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return true;
  if (!/^\+\d{8,22}$/.test(s)) return false;
  return true;
}

export function trimNombreDerivacion(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > MAX_NOMBRE ? t.slice(0, MAX_NOMBRE) : t;
}

/**
 * Normaliza un slot { nombre, whatsapp }; whatsapp vacío = omitir número.
 * @throws {Error} si whatsapp no vacío e inválido
 */
export function normalizeDerivacionSlot(slot) {
  if (slot == null || typeof slot !== "object") return null;
  const nombre = trimNombreDerivacion(slot.nombre);
  const waRaw = slot.whatsapp != null ? String(slot.whatsapp).trim() : "";
  if (waRaw.length > MAX_WA_LEN) {
    throw new Error("whatsapp demasiado largo");
  }
  if (waRaw && !isValidWhatsappInternational(waRaw)) {
    throw new Error(
      "WhatsApp debe ser internacional con +: ej. +543434123456 (solo dígitos después del +, entre 8 y 22)"
    );
  }
  if (!nombre && !waRaw) return null;
  const out = {};
  if (nombre) out.nombre = nombre;
  if (waRaw) out.whatsapp = waRaw;
  return Object.keys(out).length ? out : null;
}

/**
 * @param {unknown} arr
 * @returns {Array<{ nombre?: string, whatsapp?: string }>}
 */
export function normalizeDerivacionSlotList(arr) {
  if (arr == null) return [];
  if (!Array.isArray(arr)) {
    throw new Error("lista de derivación debe ser un array");
  }
  const out = [];
  for (const item of arr) {
    const slot = normalizeDerivacionSlot(item);
    if (slot) out.push(slot);
    if (out.length >= DERIVACION_LIST_MAX) break;
  }
  return out;
}

/**
 * Valida y compacta el objeto para persistir en JSONB (sin claves vacías).
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
export function sanitizeDerivacionReclamosForStore(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("derivacion_reclamos debe ser un objeto");
  }
  const out = {};
  for (const key of SLOT_KEYS_SINGLE) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const slot = normalizeDerivacionSlot(raw[key]);
    if (slot) out[key] = slot;
  }
  for (const key of SLOT_KEYS_LIST) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const list = normalizeDerivacionSlotList(raw[key]);
    if (list.length) out[key] = list;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Lee configuración persistida (puede traer datos viejos inválidos): solo slots válidos.
 * @param {unknown} cfg — típicamente `clientes.configuracion` ya parseado
 */
export function derivacionReclamosDesdeConfig(cfg) {
  const dr = cfg?.derivacion_reclamos;
  if (!dr || typeof dr !== "object" || Array.isArray(dr)) return null;
  const out = {};
  for (const key of SLOT_KEYS_SINGLE) {
    if (!Object.prototype.hasOwnProperty.call(dr, key)) continue;
    try {
      const slot = normalizeDerivacionSlot(dr[key]);
      if (slot) out[key] = slot;
    } catch (_) {
      /* omitir slot corrupto */
    }
  }
  for (const key of SLOT_KEYS_LIST) {
    if (!Object.prototype.hasOwnProperty.call(dr, key)) continue;
    const raw = dr[key];
    if (!Array.isArray(raw)) continue;
    const outList = [];
    for (const item of raw) {
      try {
        const slot = normalizeDerivacionSlot(item);
        if (slot) outList.push(slot);
      } catch (_) {
        /* ítem inválido: omitir */
      }
      if (outList.length >= DERIVACION_LIST_MAX) break;
    }
    if (outList.length) out[key] = outList;
  }
  return Object.keys(out).length ? out : null;
}

export function esClaveListaDerivacion(key) {
  return SLOT_KEYS_LIST.includes(key);
}

/**
 * Resuelve contacto WhatsApp para derivación operativa.
 * @returns {{ whatsapp: string, nombre: string, filaIndex: number|null } | { error: string }}
 */
export function resolverContactoDerivacion(dr, destino, filaIndex) {
  if (!dr || typeof dr !== "object") {
    return { error: "Sin configuración de derivación para este tenant" };
  }
  if (esClaveListaDerivacion(destino)) {
    const arr = Array.isArray(dr[destino]) ? dr[destino] : [];
    const i = Number(filaIndex);
    if (!Number.isFinite(i) || i < 0 || i >= arr.length) {
      return { error: "Elegí un contacto válido de la lista" };
    }
    const slot = arr[i];
    const wa = slot?.whatsapp != null ? String(slot.whatsapp).trim() : "";
    if (!wa || !/^\+\d{8,22}$/.test(wa)) {
      return { error: "Esa fila no tiene WhatsApp válido" };
    }
    return {
      whatsapp: wa,
      nombre: String(slot?.nombre || "").trim(),
      filaIndex: i,
    };
  }
  if (!SLOT_KEYS_SINGLE.includes(destino)) {
    return { error: "Destino de derivación no permitido" };
  }
  const slot = dr[destino];
  if (!slot || typeof slot !== "object") {
    return { error: "Destino sin datos configurados" };
  }
  const wa = slot.whatsapp != null ? String(slot.whatsapp).trim() : "";
  if (!wa || !/^\+\d{8,22}$/.test(wa)) {
    return { error: "Ese destino no tiene WhatsApp configurado" };
  }
  return {
    whatsapp: wa,
    nombre: String(slot.nombre || "").trim(),
    filaIndex: null,
  };
}

const MAX_NOTA = 500;
const MAX_DESC_SNAP = 400;

function trunc(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

/**
 * Texto para WhatsApp y columna derivacion_mensaje_snapshot (auditoría).
 */
export function buildDerivacionExternaMensaje({
  nombreTenant,
  pedido,
  destinoEtiqueta,
  contactoNombre,
  motivo,
}) {
  const np = pedido?.numero_pedido != null ? String(pedido.numero_pedido) : "";
  const id = pedido?.id != null ? String(pedido.id) : "";
  const tt = trunc(pedido?.tipo_trabajo, 120);
  const de = trunc(pedido?.descripcion, MAX_DESC_SNAP);
  const pr = trunc(pedido?.prioridad, 40);
  const es = trunc(pedido?.estado, 40);
  const partsDir = [
    pedido?.cliente_calle,
    pedido?.cliente_numero_puerta,
    pedido?.cliente_localidad,
  ]
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean);
  const dirTxt = partsDir.length ? partsDir.join(", ") : trunc(pedido?.cliente_direccion, 280);
  const cnom = trunc(pedido?.cliente_nombre || pedido?.cliente, 120);
  const tel = trunc(pedido?.telefono_contacto, 40);
  const lat = pedido?.lat;
  const lng = pedido?.lng;
  let ubicacion = "";
  const la = lat != null && lat !== "" ? Number(lat) : NaN;
  const ln = lng != null && lng !== "" ? Number(lng) : NaN;
  if (Number.isFinite(la) && Number.isFinite(ln)) {
    ubicacion = `Maps: https://www.google.com/maps?q=${la},${ln}`;
  } else if (dirTxt) {
    ubicacion = `Dirección (sin coordenadas GPS): ${dirTxt}`;
  } else {
    ubicacion = "Ubicación: sin coordenadas ni domicilio estructurado cargado.";
  }
  const mot = motivo ? trunc(motivo, MAX_NOTA) : "";
  const lines = [
    `*Derivación de reclamo* — ${trunc(nombreTenant, 80)}`,
    `Pedido: #${np} (ref. interna id ${id})`,
    `Tipo de reclamo: ${tt || "—"}`,
    `Descripción: ${de || "—"}`,
    `Dirección / localidad: ${dirTxt || "—"}`,
    `Prioridad: ${pr || "—"} · Estado al derivar: ${es || "—"}`,
    ubicacion,
  ];
  if (cnom || tel) {
    lines.push(`Reclamante: ${cnom || "—"}${tel ? ` · Tel: ${tel}` : ""}`);
  }
  lines.push(`Destino: ${trunc(destinoEtiqueta, 120)}${contactoNombre ? ` (${trunc(contactoNombre, 120)})` : ""}`);
  if (mot) lines.push(`Motivo: ${mot}`);
  lines.push(
    "Los datos se comparten solo para coordinar este reclamo entre entidades. No reenviar fuera del circuito operativo."
  );
  return lines.join("\n");
}

export const ETIQUETA_DESTINO_DERIVACION = {
  empresa_energia: "Empresa de energía eléctrica",
  cooperativa_agua: "Cooperativa de agua",
  empresa_gas_natural: "Empresa de distribución de gas natural",
  empresa_tv_cable: "Empresa de televisión por cable",
  empresa_internet: "Empresa de internet",
  empresa_telefonia: "Empresa de telefonía",
};

export function etiquetaDestinoDerivacion(key) {
  return ETIQUETA_DESTINO_DERIVACION[key] || key;
}
