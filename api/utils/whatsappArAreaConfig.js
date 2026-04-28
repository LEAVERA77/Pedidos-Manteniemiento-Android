/**
 * Configuración de **características** (código de área) argentinas para completar/normalizar móviles.
 * El prefijo internacional de país + móvil (**549**) no se configura: es fijo en toda Argentina.
 *
 * Claves en `clientes.configuracion`:
 * - `whatsapp_ar_default_area` — string, p. ej. `"343"` (sin 0 inicial).
 * - `whatsapp_ar_areas_por_localidad` — objeto `{ "Paraná": "343", "La Paz": "3438", ... }`.
 * - `whatsapp_ar_area_prefixes` — array opcional `["3438","343"]` para intentar completar `15…` sin localidad.
 */

import { digitsOnly, normalizeArgentinaMobileWhatsappDigits } from "./argentinaMobilePhone.js";

/** @param {unknown} s */
export function normLocalityHint(s) {
  const t = String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

/** @param {unknown} raw */
export function sanitizeAreaDigits(raw) {
  let d = digitsOnly(raw);
  while (d.startsWith("0")) d = d.slice(1);
  d = d.slice(0, 5);
  if (d.length < 2) return "";
  return d;
}

/**
 * @param {unknown} cfg — `clientes.configuracion` parseado
 * @returns {Record<string, string>} clave normalizada → área dígitos
 */
export function parseAreasPorLocalidadMap(cfg) {
  const raw = cfg && typeof cfg === "object" ? cfg.whatsapp_ar_areas_por_localidad : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k0, v0] of Object.entries(raw)) {
    const k = normLocalityHint(k0);
    const v = sanitizeAreaDigits(v0);
    if (k && v) out[k] = v;
  }
  return out;
}

/**
 * @param {unknown} cfg
 * @returns {string[]}
 */
export function parseAreaPrefixesList(cfg) {
  const raw = cfg && typeof cfg === "object" ? cfg.whatsapp_ar_area_prefixes : null;
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;\s]+/) : [];
  const set = new Set();
  for (const x of arr) {
    const s = sanitizeAreaDigits(x);
    if (s.length >= 2) set.add(s);
  }
  return [...set].sort((a, b) => b.length - a.length);
}

/**
 * Elige la característica (solo dígitos, sin 549) según localidad del pedido/padrón y defaults del tenant.
 *
 * @param {Record<string, unknown>} cfg
 * @param {unknown} localityHint — `cliente_localidad` o `localidad` del padrón
 * @returns {string} puede ser cadena vacía si no hay nada configurado
 */
export function resolveArgentinaAreaDigitsFromConfig(cfg, localityHint) {
  const loc = normLocalityHint(localityHint);
  const map = parseAreasPorLocalidadMap(cfg);
  if (loc && map[loc]) return map[loc];

  if (loc) {
    const entries = Object.entries(map);
    const hits = entries
      .filter(([k]) => k && (loc.includes(k) || k.includes(loc)))
      .sort((a, b) => b[0].length - a[0].length);
    if (hits.length) return hits[0][1];
  }

  const def = sanitizeAreaDigits(cfg?.whatsapp_ar_default_area || cfg?.ar_default_area);
  if (def) return def;

  const prefs = parseAreaPrefixesList(cfg);
  return prefs[0] || "";
}

/**
 * Para números tipo solo `15…`: prueba área por localidad, luego default, luego cada prefijo de la lista.
 * @param {unknown} raw
 * @param {Record<string, unknown>} cfg
 * @param {unknown} localityHint
 * @returns {string | null}
 */
export function normalizeArgentinaMobileWithTenantAreaConfig(raw, cfg, localityHint) {
  const areaPrefixes = parseAreaPrefixesList(cfg);
  const primary = resolveArgentinaAreaDigitsFromConfig(cfg, localityHint);
  const tryOrder = [];
  if (primary) tryOrder.push(primary);
  for (const p of areaPrefixes) {
    if (p && !tryOrder.includes(p)) tryOrder.push(p);
  }
  for (const d of tryOrder) {
    const n = normalizeArgentinaMobileWhatsappDigits(raw, { defaultAreaDigits: d });
    if (n) return n;
  }
  return normalizeArgentinaMobileWhatsappDigits(raw, { defaultAreaDigits: "" });
}

function parseConfiguracionDb(val) {
  if (val == null) return {};
  if (typeof val === "object" && !Array.isArray(val)) return { ...val };
  if (typeof val === "string") {
    try {
      const o = JSON.parse(val);
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {number} tenantId
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getTenantConfiguracionForWhatsappAreas(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return {};
  try {
    const { query } = await import("../db/neon.js");
    const r = await query(`SELECT configuracion FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
    return parseConfiguracionDb(r.rows?.[0]?.configuracion);
  } catch {
    return {};
  }
}

/**
 * Una sola característica “de respaldo” (sin texto de localidad). Compat scripts y llamadas viejas.
 * @param {number} tenantId
 */
export async function getTenantWhatsappArDefaultAreaDigits(tenantId) {
  const cfg = await getTenantConfiguracionForWhatsappAreas(tenantId);
  return resolveArgentinaAreaDigitsFromConfig(cfg, "");
}

/**
 * Limpia claves opcionales que el admin envía en `PUT /api/clientes/mi-configuracion`.
 * Solo modifica propiedades que ya vienen en `inc`.
 * @param {Record<string, unknown>} inc
 */
export function sanitizeWhatsappArAreaConfigIncrement(inc) {
  if (!inc || typeof inc !== "object") return;
  if (Object.prototype.hasOwnProperty.call(inc, "whatsapp_ar_default_area")) {
    const s = sanitizeAreaDigits(inc.whatsapp_ar_default_area);
    inc.whatsapp_ar_default_area = s || null;
  }
  if (Object.prototype.hasOwnProperty.call(inc, "whatsapp_ar_areas_por_localidad")) {
    const raw = inc.whatsapp_ar_areas_por_localidad;
    if (raw == null || raw === "") {
      inc.whatsapp_ar_areas_por_localidad = {};
    } else if (typeof raw === "object" && !Array.isArray(raw)) {
      const m = {};
      for (const [k0, v0] of Object.entries(raw)) {
        const k = normLocalityHint(k0);
        const v = sanitizeAreaDigits(v0);
        if (k && v) m[k] = v;
      }
      inc.whatsapp_ar_areas_por_localidad = m;
    } else {
      inc.whatsapp_ar_areas_por_localidad = {};
    }
  }
  if (Object.prototype.hasOwnProperty.call(inc, "whatsapp_ar_area_prefixes")) {
    const p = parseAreaPrefixesList({ whatsapp_ar_area_prefixes: inc.whatsapp_ar_area_prefixes });
    inc.whatsapp_ar_area_prefixes = p.length ? p : null;
  }
}
