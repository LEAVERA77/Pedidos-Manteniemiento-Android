/**
 * Normalización de teléfonos argentinos para envíos WhatsApp.
 * Acepta TODO número que empiece con 54 y tenga largo suficiente.
 * No filtra fijos: el proveedor (Whapi) decide si puede enviar.
 * made by leavera77
 */

/** @param {unknown} s */
export function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

/**
 * Ya no se usa para descartar. Siempre devuelve false.
 * @param {string} _d solo dígitos
 */
export function isLikelyArgentinaInternationalLandline(_d) {
  return false;
}

/**
 * Si el número tiene formato 549+area+15+subscriber, quita el 15 espurio.
 * @param {string} d
 */
function strip15FromMobile(d) {
  if (!d.startsWith("549")) return d;
  const body = d.slice(3);
  for (const n of [4, 3, 2]) {
    const m = body.match(new RegExp(`^(\\d{${n}})15(\\d{6,9})$`));
    if (m) return `549${m[1]}${m[2]}`;
  }
  return d;
}

/**
 * Normaliza un teléfono argentino para envío por WhatsApp.
 * Regla principal: si empieza con 54 y tiene 12-15 dígitos, se acepta.
 * Limpia el "15" espurio si detecta formato 549+area+15+abonado.
 *
 * @param {unknown} raw
 * @param {{ defaultAreaDigits?: string }} [opts]
 * @returns {string | null}
 */
export function normalizeArgentinaMobileWhatsappDigits(raw, opts = {}) {
  const defaultArea = opts.defaultAreaDigits
    ? String(opts.defaultAreaDigits).replace(/\D/g, "").slice(0, 4)
    : "";

  let d = digitsOnly(raw);
  if (!d) return null;
  while (d.startsWith("00")) d = d.slice(2);

  if (d.startsWith("54") && d.length >= 12 && d.length <= 15) {
    return strip15FromMobile(d);
  }

  if (d.startsWith("9") && d.length >= 10 && d.length <= 13) {
    return strip15FromMobile(`54${d}`);
  }

  if (d.startsWith("0")) {
    const body = d.slice(1);
    const m15 = body.match(/^(\d{2,4})15(\d{6,8})$/);
    if (m15) return `549${m15[1]}${m15[2]}`;
    if (body.length >= 10 && body.length <= 12) {
      return `54${body}`;
    }
    return null;
  }

  const m15only = d.match(/^15(\d{6,8})$/);
  if (m15only && defaultArea.length >= 2) {
    return `549${defaultArea}${m15only[1]}`;
  }

  if (d.length >= 10 && d.length <= 12) {
    return `54${d}`;
  }

  return null;
}

/**
 * Para guardar en catálogo: mismo resultado que normalize, o null.
 * @param {unknown} raw
 * @param {{ defaultAreaDigits?: string }} [opts]
 */
export function telefonoMovilArgentinaCanonico(raw, opts = {}) {
  return normalizeArgentinaMobileWhatsappDigits(raw, opts);
}
