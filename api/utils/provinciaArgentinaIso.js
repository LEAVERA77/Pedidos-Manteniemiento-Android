/**
 * ISO 3166-2 para provincias argentinas (áreas Overpass / acotación geográfica).
 * Clave: nombre normalizado sin tildes, minúsculas, sin "provincia de".
 *
 * made by leavera77
 */

function normProv(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^provincia\s+(de\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mapeo nombre común → código ISO3166-2 (reconocido por Overpass en áreas AR). */
const NOMBRE_A_ISO = {
  "ciudad autonoma de buenos aires": "AR-C",
  "caba": "AR-C",
  "capital federal": "AR-C",
  "buenos aires": "AR-B",
  "catamarca": "AR-K",
  "chaco": "AR-H",
  "chubut": "AR-U",
  "cordoba": "AR-X",
  "corrientes": "AR-W",
  "entre rios": "AR-E",
  "formosa": "AR-P",
  "jujuy": "AR-Y",
  "la pampa": "AR-L",
  "la rioja": "AR-F",
  "mendoza": "AR-M",
  "misiones": "AR-N",
  "neuquen": "AR-Q",
  "rio negro": "AR-R",
  "salta": "AR-A",
  "san juan": "AR-J",
  "san luis": "AR-D",
  "santa cruz": "AR-Z",
  "santa fe": "AR-S",
  "santiago del estero": "AR-G",
  "tierra del fuego": "AR-V",
  "tucuman": "AR-T",
};

/**
 * @param {string} nombreProvincia — ej. "Entre Ríos"
 * @returns {string | null} — ej. "AR-E"
 */
export function iso3166ArgDesdeNombreProvincia(nombreProvincia) {
  const k = normProv(nombreProvincia);
  if (!k) return null;
  if (NOMBRE_A_ISO[k]) return NOMBRE_A_ISO[k];
  for (const [nk, iso] of Object.entries(NOMBRE_A_ISO)) {
    if (k.includes(nk) || nk.includes(k)) return iso;
  }
  return null;
}
