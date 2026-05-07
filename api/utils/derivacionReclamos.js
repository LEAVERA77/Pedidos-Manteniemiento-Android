/**
 * Configuración `clientes.configuracion.derivacion_reclamos`.
 * Slots simples: { nombre?, whatsapp? } con whatsapp internacional +54…
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

/** Límite razonable para nota / observaciones persistidas y cuerpo del WA. */
const MAX_OBSERVACIONES_DERIVACION = 2000;
const MAX_DESC_SNAP = 400;
const MAX_NOMBRE_DESTINO = 160;

function trunc(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

function numCoord(v) {
  if (v == null || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Lat/lng útiles para Maps: acepta columnas habituales y descarta (0,0) u omitidos.
 * @param {object} pedido
 * @returns {{ lat: number, lng: number } | null}
 */
export function effectivePedidoLatLngParaDerivacion(pedido) {
  if (!pedido || typeof pedido !== "object") return null;
  const pairs = [
    [pedido.lat, pedido.lng],
    [pedido.latitude, pedido.longitude],
    [pedido.la, pedido.ln],
  ];
  for (const [a, b] of pairs) {
    const la = numCoord(a);
    const ln = numCoord(b);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    if (Math.abs(la) < 1e-7 && Math.abs(ln) < 1e-7) continue;
    return { lat: la, lng: ln };
  }
  return null;
}

/**
 * Arma el texto único para WhatsApp (`wa.me/?text=`) y para `derivacion_mensaje_snapshot`.
 *
 * **Ubicación:** con `https://wa.me/número?text=...` (Web o API) solo se envía **texto** plano;
 * no garantiza la burbuja de ubicación nativa de WhatsApp. La paridad útil es **enlace a
 * Google Maps** en el cuerpo (en app Android nativa podría evaluarse aparte un `geo:` / intent).
 *
 * @param {object} params
 * @param {string} params.nombreTenant — Entidad que usa GestorNova (remitente del encabezado).
 * @param {object} params.pedido — Fila pedido (lat/lng, domicilio, tipo, etc.).
 * @param {string} params.nombreEmpresaDestino — Nombre del contacto configurado o rubro destino (línea "A:").
 * @param {string} params.textoObservacionesTecnico — Observaciones del técnico y/o editadas por admin (obligatorias vía ruta).
 */
export function buildDerivacionExternaMensaje({
  nombreTenant,
  pedido,
  nombreEmpresaDestino,
  textoObservacionesTecnico,
}) {
  const entidad = trunc(nombreTenant, 120) || "GestorNova";
  const destinoNombre = trunc(nombreEmpresaDestino, MAX_NOMBRE_DESTINO) || "—";
  const np = pedido?.numero_pedido != null ? String(pedido.numero_pedido) : "";
  const id = pedido?.id != null ? String(pedido.id) : "";
  const obs = trunc(textoObservacionesTecnico, MAX_OBSERVACIONES_DERIVACION) || "—";

  const tt = trunc(pedido?.tipo_trabajo, 120);
  const pr = trunc(pedido?.prioridad, 40);
  const es = trunc(pedido?.estado, 40);
  const de = trunc(pedido?.descripcion, MAX_DESC_SNAP);
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

  const eff = effectivePedidoLatLngParaDerivacion(pedido);
  const la = eff ? eff.lat : NaN;
  const ln = eff ? eff.lng : NaN;
  let lineaUbicacion = "";
  if (Number.isFinite(la) && Number.isFinite(ln)) {
    const url = `https://www.google.com/maps?q=${la},${ln}`;
    lineaUbicacion = `Coordenadas GPS: ${la}, ${ln}\nAbrí en Maps: ${url}`;
  } else if (dirTxt) {
    lineaUbicacion = `${dirTxt}\n(Sin coordenadas GPS registradas en el sistema.)`;
  } else {
    lineaUbicacion =
      "Sin domicilio estructurado ni coordenadas GPS en el sistema. Coordinar relevo con el área emisora si hace falta más precisión.";
  }

  const reclamante =
    cnom || tel
      ? `${cnom || "—"}${tel ? ` · Tel.: ${tel}` : ""}`
      : "—";

  const lines = [
    `A: ${destinoNombre}`,
    "",
    `${entidad} le informa que recibimos el reclamo *N° ${np || "—"}* (ref. interna id ${id || "—"}) y que, *en visita / según lo informado por el técnico*, se constató en el lugar que *corresponde atenderlo vuestra empresa*.`,
    "",
    "Derivamos el reclamo con las *observaciones del técnico / operador*:",
    obs,
    "",
    "*Ubicación para relevo en campo:*",
    lineaUbicacion,
    "",
    "*Datos útiles del reclamo*",
    `• Tipo: ${tt || "—"}`,
    `• Prioridad: ${pr || "—"}`,
    `• Estado al derivar: ${es || "—"}`,
    `• Resumen pedido: ${de || "—"}`,
    `• Reclamante / contacto: ${reclamante}`,
    "",
    "*Respuesta por este mismo chat (WhatsApp):*",
    "Pueden responder por este mismo hilo de WhatsApp; un operador de nuestra entidad verá el mensaje en el panel de gestión y podrá continuar la coordinación de este reclamo.",
    "",
    "Los datos se comparten solo para coordinar este reclamo entre entidades. No reenviarlos fuera del circuito operativo acordado.",
    "",
    "Gracias por su atención.",
    entidad,
  ];

  return lines.join("\n");
}

export const ETIQUETA_DESTINO_DERIVACION = {
  empresa_energia: "Empresa de energía eléctrica",
  cooperativa_agua: "Cooperativa de agua",
  empresa_gas_natural: "Empresa de distribución de gas natural",
  empresa_tv_cable: "Empresa de televisión por cable",
  empresa_internet: "Empresa de internet",
  empresa_telefonia: "Empresa de telefonía",
  otro: "Otro (contacto manual)",
  otro_personalizado: "Otro (contacto manual)",
};

export function etiquetaDestinoDerivacion(key) {
  return ETIQUETA_DESTINO_DERIVACION[key] || key;
}
