/**
 * Catálogos de tipos de reclamo por rubro (Argentina).
 * Debe mantenerse alineado con el frontend (index.html).
 */

export const TIPOS_RECLAMO_POR_RUBRO = {
  municipio: [
    "Alumbrado Público",
    "Bacheo y Pavimento",
    "Recolección/Poda",
    "Espacios Verdes",
    "Señalización/Semáforos",
    "Limpieza de Zanjas",
    "Recolección (otros)",
    "Cloacas",
    "Otros",
  ],
  cooperativa_agua: [
    "Pérdida en Vereda/Calle",
    "Falta de Presión",
    "Calidad del Agua",
    "Obstrucción de Cloaca",
    "Cambio de Medidor",
    "Conexión Nueva",
    "Otros",
  ],
  cooperativa_electrica: [
    "Corte de Energía",
    "Cables Caídos/Peligro",
    "Problemas de Tensión",
    "Poste Inclinado/Dañado",
    "Cambio de Medidor",
    "Alumbrado Público (Mantenimiento)",
    "Riesgo en la vía pública",
    "Corrimiento de poste/columna",
    "Pedido de factibilidad (nuevo servicio)",
    "Otros",
  ],
};

/** Lista histórica (antes de rubros); solo lectura / compatibilidad en UI. */
export const TIPOS_RECLAMO_LEGACY = [
  "Riesgo vía pública",
  "Mantenimiento preventivo",
  "Material averiado",
  "Poda de árboles",
  "Nidos",
  "Falla de Línea",
  "Inspección Termográfica",
  "Avería en Transformador",
  "Reclamo de Cliente",
  "Conexión Nueva",
  "Corte Programado",
  "Emergencia",
  "Otros",
];

/** Gravedad sugerida por tipo (alineado con estadísticas / mapa: Crítica, Alta, Media, Baja). */
export const PRIORIDAD_RECLAMO_POR_TIPO = {
  // municipio
  "Alumbrado Público": "Media",
  "Bacheo y Pavimento": "Media",
  "Recolección/Poda": "Baja",
  "Espacios Verdes": "Baja",
  "Señalización/Semáforos": "Alta",
  "Limpieza de Zanjas": "Media",
  "Recolección (otros)": "Media",
  Cloacas: "Alta",
  Otros: "Media",
  // cooperativa_agua
  "Pérdida en Vereda/Calle": "Alta",
  "Falta de Presión": "Media",
  "Calidad del Agua": "Alta",
  "Obstrucción de Cloaca": "Alta",
  "Cambio de Medidor": "Baja",
  "Conexión Nueva": "Baja",
  // cooperativa_electrica
  "Corte de Energía": "Alta",
  "Cables Caídos/Peligro": "Crítica",
  "Problemas de Tensión": "Alta",
  "Poste Inclinado/Dañado": "Crítica",
  "Alumbrado Público (Mantenimiento)": "Baja",
  "Riesgo en la vía pública": "Crítica",
  "Corrimiento de poste/columna": "Crítica",
  "Pedido de factibilidad (nuevo servicio)": "Baja",
  // legacy / histórico
  "Riesgo vía pública": "Crítica",
  "Mantenimiento preventivo": "Baja",
  "Material averiado": "Media",
  "Poda de árboles": "Baja",
  Nidos: "Baja",
  "Falla de Línea": "Alta",
  "Inspección Termográfica": "Baja",
  "Avería en Transformador": "Alta",
  "Reclamo de Cliente": "Media",
  "Corte Programado": "Baja",
  Emergencia: "Crítica",
};

const PRIORIDADES_VALIDAS = new Set(["Baja", "Media", "Alta", "Crítica"]);

export function prioridadPredeterminadaPorTipoTrabajo(tipoTrabajo) {
  const t = String(tipoTrabajo || "").trim();
  if (!t) return "Media";
  const p = PRIORIDAD_RECLAMO_POR_TIPO[t];
  if (p && PRIORIDADES_VALIDAS.has(p)) return p;
  return "Media";
}

/** Prioridad enviada por el cliente o, si falta o no es válida, la del tipo de reclamo. */
export function normalizarPrioridadPedido(prioridad, tipoTrabajoFallback) {
  const s = String(prioridad ?? "").trim();
  if (s && PRIORIDADES_VALIDAS.has(s)) return s;
  return prioridadPredeterminadaPorTipoTrabajo(tipoTrabajoFallback);
}

export function normalizarRubroCliente(tipoCliente) {
  const t = String(tipoCliente || "")
    .trim()
    .toLowerCase();
  if (t === "municipio") return "municipio";
  if (t === "cooperativa_agua" || t === "cooperativa de agua") return "cooperativa_agua";
  if (
    t === "cooperativa_electrica" ||
    t === "cooperativa eléctrica" ||
    t === "cooperativa electrica"
  ) {
    return "cooperativa_electrica";
  }
  return null;
}

export function tiposReclamoParaClienteTipo(tipoCliente) {
  const rubro = normalizarRubroCliente(tipoCliente);
  if (rubro && TIPOS_RECLAMO_POR_RUBRO[rubro]) {
    return [...TIPOS_RECLAMO_POR_RUBRO[rubro]];
  }
  const u = new Set();
  Object.values(TIPOS_RECLAMO_POR_RUBRO).forEach((arr) => arr.forEach((x) => u.add(x)));
  return [...u];
}

export function todosLosTiposReclamoConocidos() {
  const u = new Set(TIPOS_RECLAMO_LEGACY);
  Object.values(TIPOS_RECLAMO_POR_RUBRO).forEach((arr) => arr.forEach((x) => u.add(x)));
  return [...u];
}

/**
 * Nuevo pedido: debe ser uno de los tipos del rubro del cliente (si rubro definido).
 */
export function tipoTrabajoPermitidoParaNuevoPedido(tipoTrabajo, tipoCliente) {
  const tt = String(tipoTrabajo || "").trim();
  if (!tt) return false;
  const rubro = normalizarRubroCliente(tipoCliente);
  const permitidos = rubro
    ? TIPOS_RECLAMO_POR_RUBRO[rubro] || tiposReclamoParaClienteTipo(null)
    : tiposReclamoParaClienteTipo(null);
  return permitidos.includes(tt);
}

/** Tipos que en la app requieren NIS y cliente (alineado con frontend). */
export function tipoReclamoRequiereNisYCliente(tipoTrabajo) {
  const v = String(tipoTrabajo || "").trim();
  if (!v) return false;
  if (v === "Reclamo de Cliente" || v === "Conexión Nueva") return true;
  if (v.includes("Conexión Nueva")) return true;
  if (v.includes("Cambio de Medidor")) return true;
  if (v.toLowerCase().includes("factibilidad")) return true;
  return false;
}
