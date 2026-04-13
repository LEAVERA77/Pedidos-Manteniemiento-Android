/**
 * Normalización de nombres de calle para claves de caché y comparación laxa.
 * made by leavera77
 */

const PREFIJOS = [
  "avenida",
  "av",
  "boulevard",
  "bv",
  "bulevar",
  "calle",
  "c/",
  "pasaje",
  "pje",
  "ruta",
  "rp",
  "rn",
  "camino",
  "diagonal",
  "dott",
  "doctor",
  "dr",
  "dra",
  "general",
  "gral",
  "presidente",
  "pres",
  "ingeniero",
  "ing",
  "profesor",
  "prof",
  "teniente",
  "tte",
  "coronel",
  "cnel",
  "mayor",
  "my",
  "capitan",
  "cap",
  "comandante",
  "cmdte",
  "obispo",
  "monsenor",
  "arzobispo",
  "san",
  "santo",
  "santa",
  "juan",
  "jose",
  "maria",
];

const SUFIJOS = ["norte", "sur", "este", "oeste", "n", "s", "e", "o"];

function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} nombre
 * @returns {string}
 */
export function normalizarNombreCalle(nombre) {
  if (!nombre) return "";
  let normalizado = String(nombre).toLowerCase().trim();

  for (const prefijo of PREFIJOS) {
    const e = escRe(prefijo);
    normalizado = normalizado.replace(new RegExp(`^${e}\\s+`, "i"), "");
    normalizado = normalizado.replace(new RegExp(`^${e}\\.\\s*`, "i"), "");
  }

  for (const sufijo of SUFIJOS) {
    const e = escRe(sufijo);
    normalizado = normalizado.replace(new RegExp(`\\s+${e}$`, "i"), "");
  }

  normalizado = normalizado.replace(/[.,/#!$%&*;:{}=\-_`~()]/g, "");
  normalizado = normalizado.replace(/\s+/g, " ").trim();
  return normalizado;
}

/**
 * @param {string} nombre1
 * @param {string} nombre2
 */
export function compararNombresCalle(nombre1, nombre2) {
  return normalizarNombreCalle(nombre1) === normalizarNombreCalle(nombre2);
}

/**
 * @param {string} nombre
 * @param {string[]} candidatos
 * @returns {string|null}
 */
export function buscarPorSimilitud(nombre, candidatos) {
  if (!candidatos || !candidatos.length) return null;
  const norm = normalizarNombreCalle(nombre);
  const exacto = candidatos.find((c) => normalizarNombreCalle(c) === norm);
  if (exacto) return exacto;

  const palabras = norm.split(/\s+/).filter((p) => p.length >= 3);
  for (const palabra of palabras) {
    const hit = candidatos.find((c) => normalizarNombreCalle(c).includes(palabra));
    if (hit) return hit;
  }
  return null;
}
