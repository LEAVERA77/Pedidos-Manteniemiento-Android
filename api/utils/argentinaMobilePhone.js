/**
 * Normalización de teléfonos argentinos para envíos WhatsApp (solo **móvil**).
 * Los fijos (p. ej. 0343-4890532 → 54 343 … sin el 9 móvil) se rechazan explícitamente.
 *
 * Referencia: E.164 móvil AR = 54 + 9 + código de área (sin 0) + abonado (sin el 15 nacional).
 */

/** @param {unknown} s */
export function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

/**
 * Número internacional argentino que **no** es móvil (54 + área sin el 9).
 * Ej.: 543434890532 (Cerrito fijo 0343-4890532).
 * @param {string} d solo dígitos
 */
export function isLikelyArgentinaInternationalLandline(d) {
  if (!d || d.length < 10 || !d.startsWith("54")) return false;
  if (d.startsWith("549")) return false;
  if (d.charAt(2) === "9") return false;
  return d.length >= 11;
}

/**
 * Algunos catálogos guardan el 15 nacional dentro del bloque 549…; lo quitamos una vez.
 * @param {string} d
 */
function stripSpurious15After549Area(d) {
  for (const n of [4, 3, 2]) {
    const m = d.match(new RegExp(`^549(\\d{${n}})15(\\d{6,9})$`));
    if (m) return `549${m[1]}${m[2]}`;
  }
  return d;
}

/**
 * @param {string} body dígitos sin el 0 inicial del plan de numeración nacional
 * @returns {{ area: string, subscriber: string } | null}
 */
function extractNationalMobile15(body) {
  if (!body) return null;
  const mBa = body.match(/^11(15)(\d{6,9})$/);
  if (mBa) return { area: "11", subscriber: mBa[2] };
  const m4 = body.match(/^(\d{4})(15)(\d{6,8})$/);
  if (m4) return { area: m4[1], subscriber: m4[3] };
  const m3 = body.match(/^(\d{3})(15)(\d{6,8})$/);
  if (m3) return { area: m3[1], subscriber: m3[3] };
  const m2 = body.match(/^(?!11)(\d{2})(15)(\d{6,8})$/);
  if (m2) return { area: m2[1], subscriber: m2[3] };
  return null;
}

/**
 * Convierte texto libre a dígitos E.164 móvil AR (549…) o null si parece fijo / inválido.
 *
 * @param {unknown} raw
 * @param {{ defaultAreaDigits?: string }} [opts] — si el valor es solo "15…" sin característica, se antepone `defaultAreaDigits` (p. ej. "343").
 * @returns {string | null}
 */
export function normalizeArgentinaMobileWhatsappDigits(raw, opts = {}) {
  const defaultArea = opts.defaultAreaDigits
    ? String(opts.defaultAreaDigits).replace(/\D/g, "").slice(0, 4)
    : "";

  let d = digitsOnly(raw);
  if (!d) return null;
  while (d.startsWith("00")) d = d.slice(2);

  if (isLikelyArgentinaInternationalLandline(d)) return null;

  if (d.startsWith("549")) {
    d = stripSpurious15After549Area(d);
    if (d.length >= 12 && d.length <= 15) return d;
    return null;
  }

  if (d.startsWith("54") && d.charAt(2) === "9") {
    d = stripSpurious15After549Area(d);
    if (d.length >= 12 && d.length <= 15) return d;
    return null;
  }

  if (d.startsWith("54")) return null;

  if (d.startsWith("9") && d.length >= 10 && d.length <= 13) {
    const rest = d.slice(1);
    if (/^11\d{8,9}$/.test(rest)) return `549${rest}`;
    const m3 = rest.match(/^(\d{3})(\d{6,8})$/);
    if (m3) return `549${m3[1]}${m3[2]}`;
  }

  const m15only = d.match(/^15(\d{6,8})$/);
  if (m15only && defaultArea.length >= 2) {
    return `549${defaultArea}${m15only[1]}`;
  }

  if (d.startsWith("0")) {
    const body = d.slice(1);
    const mob = extractNationalMobile15(body);
    if (mob) return `549${mob.area}${mob.subscriber}`;
    return null;
  }

  const mob2 = extractNationalMobile15(d);
  if (mob2) return `549${mob2.area}${mob2.subscriber}`;

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
