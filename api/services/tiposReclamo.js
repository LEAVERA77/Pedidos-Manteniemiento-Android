/**
 * Catálogos de tipos de reclamo por rubro (Argentina).
 * Mantener alineado con `app/src/main/assets/modules/catalogoReclamoPorRubro.js` y el menú del bot (whatsappBotMeta).
 */

export const TIPOS_RECLAMO_POR_RUBRO = {
  municipio: [
    "Alumbrado Público",
    "Bacheo y Pavimento",
    "Recolección/Poda",
    "Espacios Verdes",
    "Señalización/Semáforos",
    "Alcantarillas tapadas",
    "Recolección (otros)",
    "Obstrucción de Cloaca",
    "Ruidos molestos / Perturbación",
    "Animales sueltos / Mascotas",
    "Otros",
  ],
  cooperativa_agua: [
    "Corte de suministro de agua",
    "Rotura de cañería / Pérdida de agua",
    "Baja presión de agua",
    "Reparación de conexión domiciliaria",
    "Instalación de medidor",
    "Rehabilitación de servicio",
    "Control de presión",
    "Limpieza de tanques",
    "Pedido de factibilidad (nuevo servicio)",
    "Otros",
  ],
  cooperativa_electrica: [
    "Corte de Energía",
    "Cables Caídos/Peligro",
    "Problemas de Tensión",
    "Poste Inclinado/Dañado",
    "Consumo elevado",
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
  "Alcantarillas tapadas": "Media",
  /** Histórico (antes del rename en menú municipio opción 6). */
  "Limpieza de Zanjas": "Media",
  "Recolección (otros)": "Media",
  "Obstrucción de Cloaca": "Alta",
  "Ruidos molestos / Perturbación": "Media",
  "Animales sueltos / Mascotas": "Media",
  Otros: "Media",
  // cooperativa_agua
  "Corte de suministro de agua": "Alta",
  "Rotura de cañería / Pérdida de agua": "Crítica",
  "Baja presión de agua": "Media",
  "Reparación de conexión domiciliaria": "Media",
  "Instalación de medidor": "Baja",
  "Rehabilitación de servicio": "Media",
  "Control de presión": "Baja",
  "Limpieza de tanques": "Baja",
  "Pérdida en Vereda/Calle": "Alta",
  "Falta de Presión": "Media",
  "Calidad del Agua": "Alta",
  "Conexión Nueva": "Baja",
  // cooperativa_electrica
  "Corte de Energía": "Alta",
  "Cables Caídos/Peligro": "Crítica",
  "Problemas de Tensión": "Alta",
  "Poste Inclinado/Dañado": "Crítica",
  "Consumo elevado": "Baja",
  /** Histórico (antes del rename a Consumo elevado). */
  "Cambio de Medidor": "Baja",
  "Alumbrado Público (Mantenimiento)": "Media",
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
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (t === "municipio") return "municipio";
  if (t === "cooperativa_agua" || t === "cooperativa de agua") return "cooperativa_agua";
  if (
    t === "cooperativa_electrica" ||
    t === "cooperativa electrica"
  ) {
    return "cooperativa_electrica";
  }
  /** Texto libre del panel Empresa ("cooperativa", "empresa") → valor válido en CHECK de `clientes.tipo`. */
  if (t === "cooperativa" || t === "empresa") return "cooperativa_electrica";
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

/** NIS/medidor obligatorio (formulario web y validaciones). */
export function tipoReclamoRequiereNisYCliente(tipoTrabajo) {
  const v = String(tipoTrabajo || "").trim();
  if (!v) return false;
  if (v === "Reclamo de Cliente" || v === "Conexión Nueva") return true;
  if (v.includes("Conexión Nueva")) return true;
  if (v.includes("Consumo elevado")) return true;
  if (v === "Problemas de Tensión") return true;
  if (v.toLowerCase().includes("factibilidad")) return true;
  return false;
}

/** Solo NIS: no exigimos nombre de cliente en el formulario (puede venir del catálogo). */
export function tipoReclamoSoloNisSinNombreCliente(tipoTrabajo) {
  const v = String(tipoTrabajo || "").trim();
  return v === "Problemas de Tensión" || v === "Consumo elevado";
}

export function tipoReclamoRequiereNombreClienteEnFormulario(tipoTrabajo) {
  return tipoReclamoRequiereNisYCliente(tipoTrabajo) && !tipoReclamoSoloNisSinNombreCliente(tipoTrabajo);
}

/** Flujo WhatsApp: tras la descripción, pedir NIS y saltar menú nombre/dirección (no aplica a Consumo elevado: flujo domicilio). */
export function tipoReclamoWhatsappFlujoSoloNis(tipoTrabajo) {
  const v = String(tipoTrabajo || "").trim();
  return v === "Problemas de Tensión";
}

/** Cooperativa eléctrica (WhatsApp / formulario): estos tipos exigen tipo de conexión y fases si no vienen del padrón. */
const TIPOS_ELECTRICO_PIDE_SUMINISTRO = new Set([
  "Problemas de Tensión",
  "Consumo elevado",
  "Corte de Energía",
  "Alumbrado Público (Mantenimiento)",
  "Pedido de factibilidad (nuevo servicio)",
]);

export function tipoReclamoElectricoPideSuministroWhatsapp(tipoTrabajo) {
  return TIPOS_ELECTRICO_PIDE_SUMINISTRO.has(String(tipoTrabajo || "").trim());
}

/**
 * Cooperativa eléctrica: tipos para los que el técnico puede solicitar derivación a terceros.
 * Debe coincidir con `TIPOS_RECLAMO_SOLICITUD_DERIVACION_TERCERO` en app.js y con el Set en api/routes/pedidos.js.
 */
export const TIPOS_SOLICITUD_DERIVACION_TERCERO_COOP_ELECTRICA = [
  "Cables Caídos/Peligro",
  "Poste Inclinado/Dañado",
  "Alumbrado Público (Mantenimiento)",
  "Riesgo en la vía pública",
  "Corrimiento de poste/columna",
];

function normTipoDerivacionApi(tt) {
  return String(tt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .trim();
}

/**
 * Paridad con `tipoPermiteSolicitudDerivacionTercero` / `debeMostrarBotonDerivacion` en app.js (variantes y keywords).
 */
export function tipoPermiteSolicitudDerivacionTerceroCoopElectrica(tt) {
  const n = normTipoDerivacionApi(tt);
  if (!n) return false;
  for (const allowed of TIPOS_SOLICITUD_DERIVACION_TERCERO_COOP_ELECTRICA) {
    const a = normTipoDerivacionApi(allowed);
    if (!a) continue;
    if (n === a || n.includes(a) || a.includes(n)) return true;
  }
  if (/\bcables?\b/.test(n) && (/\bca[iy]d\w*\b/.test(n) || /\bpeligro\b/.test(n))) return true;
  if (/\bposte\b/.test(n) && (/\binclinad\w*\b/.test(n) || /\bdan\w*\b/.test(n))) return true;
  if (/\balumbrado\b/.test(n) && (/\bpublic\w*\b/.test(n) || /\bmantenim\w*\b/.test(n) || /\bluz\b/.test(n))) return true;
  if (/\briesgo\b/.test(n) && (/\bvia\b/.test(n) || /\bpublic\w*\b/.test(n) || /\bcalle\b/.test(n))) return true;
  if (/\bcorrimiento\b/.test(n) && (/\bposte\b/.test(n) || /\bcolumna\b/.test(n))) return true;
  return false;
}
