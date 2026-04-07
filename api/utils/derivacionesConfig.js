/**
 * Normaliza teléfono para wa.me: solo dígitos, sin + ni espacios.
 * @returns {{ ok: true, digits: string } | { ok: false, error: string }}
 */
export function normalizeWhatsappConfigDigits(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: true, digits: "" };
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return { ok: false, error: "whatsapp_longitud", detalle: "Usá entre 10 y 15 dígitos (código país sin +)." };
  }
  return { ok: true, digits };
}

const MAX_NOMBRE = 120;
const SLOTS = ["energia", "agua"];

function trimNombre(s) {
  const t = String(s ?? "").trim();
  if (t.length > MAX_NOMBRE) return t.slice(0, MAX_NOMBRE);
  return t;
}

function normalizeSlot(slotIn, slotKey) {
  if (slotIn == null || typeof slotIn !== "object") {
    return { activo: false, nombre: "", whatsapp: "" };
  }
  const activo = !!slotIn.activo;
  const nombre = trimNombre(slotIn.nombre ?? "");
  const w = normalizeWhatsappConfigDigits(slotIn.whatsapp ?? "");
  const whatsapp = w.ok ? w.digits : "";
  return { activo, nombre, whatsapp, _waInvalid: !w.ok && String(slotIn.whatsapp ?? "").trim() !== "" };
}

/**
 * Fusiona derivaciones entrantes con existentes; valida activo ⇒ whatsapp.
 * @returns {{ ok: true, value: object } | { ok: false, error: string, detalles?: object }}
 */
export function mergeAndValidateDerivaciones(existing, incoming) {
  const prev = existing && typeof existing === "object" ? existing : {};
  const inc = incoming && typeof incoming === "object" ? incoming : {};
  const out = {};
  for (const key of SLOTS) {
    const source = Object.prototype.hasOwnProperty.call(inc, key) ? inc[key] : prev[key];
    const n = normalizeSlot(source, key);
    if (n._waInvalid) {
      return {
        ok: false,
        error: "derivaciones_whatsapp_invalido",
        detalles: { slot: key, mensaje: "Teléfono WhatsApp inválido en " + key },
      };
    }
    if (n.activo && !n.whatsapp) {
      return {
        ok: false,
        error: "derivaciones_activo_sin_whatsapp",
        detalles: { slot: key, mensaje: "Si está activo, cargá el WhatsApp o desactivá la derivación." },
      };
    }
    out[key] = { activo: n.activo, nombre: n.nombre, whatsapp: n.whatsapp };
  }
  return { ok: true, value: out };
}
