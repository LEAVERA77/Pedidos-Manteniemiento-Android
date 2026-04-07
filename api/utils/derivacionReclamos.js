/**
 * Configuración `clientes.configuracion.derivacion_reclamos` (cooperativas eléctricas).
 * empresa_energia | cooperativa_agua: { nombre?, whatsapp? }
 */

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
 * Valida y compacta el objeto para persistir en JSONB (sin claves vacías).
 * @param {unknown} raw
 * @returns {Record<string, { nombre?: string, whatsapp?: string }>|null}
 */
export function sanitizeDerivacionReclamosForStore(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("derivacion_reclamos debe ser un objeto");
  }
  const out = {};
  for (const key of ["empresa_energia", "cooperativa_agua"]) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const slot = normalizeDerivacionSlot(raw[key]);
    if (slot) out[key] = slot;
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
  for (const key of ["empresa_energia", "cooperativa_agua"]) {
    if (!Object.prototype.hasOwnProperty.call(dr, key)) continue;
    try {
      const slot = normalizeDerivacionSlot(dr[key]);
      if (slot) out[key] = slot;
    } catch (_) {
      /* omitir slot corrupto */
    }
  }
  return Object.keys(out).length ? out : null;
}
