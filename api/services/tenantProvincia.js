/**
 * Provincia del tenant: prioridad configuración explícita en clientes.configuracion,
 * luego reverse Nominatim de la ubicación central (tabla configuración o lat_base/lng_base).
 */
import { query } from "../db/neon.js";
import { resolveUbicacionCentralPublic } from "../routes/configUbicacion.js";
import { reverseGeocodeArgentina } from "./nominatimClient.js";

function parseCfg(raw) {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === "object" ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {number} tenantId
 * @returns {Promise<string | null>} Nombre de provincia (p. ej. "Entre Ríos") o null
 */
export async function getTenantProvinciaNominatim(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  try {
    const r = await query(`SELECT configuracion FROM clientes WHERE id = $1 AND activo = TRUE LIMIT 1`, [
      tid,
    ]);
    const c = parseCfg(r.rows?.[0]?.configuracion);
    const fromCfg = c.provincia ?? c.state ?? c.provincia_nominatim ?? c.provincia_geocode;
    const s = fromCfg != null ? String(fromCfg).trim() : "";
    if (s.length >= 2) return s;

    const ubi = await resolveUbicacionCentralPublic(tid);
    if (!ubi || !Number.isFinite(Number(ubi.lat)) || !Number.isFinite(Number(ubi.lng))) return null;
    const rev = await reverseGeocodeArgentina(Number(ubi.lat), Number(ubi.lng));
    const st = rev?.address?.state;
    const out = st != null ? String(st).trim() : "";
    return out.length >= 2 ? out : null;
  } catch (e) {
    console.warn("[tenantProvincia] getTenantProvinciaNominatim", e?.message || e);
    return null;
  }
}
