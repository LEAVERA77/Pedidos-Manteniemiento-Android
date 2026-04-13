/**
 * Cliente mínimo para la API Georef (datos.gob.ar) — respaldo cuando Nominatim no devuelve punto útil.
 * Documentación: https://datos.gob.ar/dataset/jgm-servicio-normalizacion-direcciones
 * made by leavera77
 */

const GEO_REF_DEFAULT_TIMEOUT_MS = 12000;
const GEO_REF_BASE = "https://apis.datos.gob.ar/georef/api";

export function georefArEnabled() {
  return process.env.GEO_REF_AR_ENABLED !== "0" && process.env.GEO_REF_AR_ENABLED !== "false";
}

/**
 * @param {{ calle: string, numero?: string|null, localidad: string, provincia?: string|null }} p
 * @returns {Promise<{ hit: boolean, lat?: number, lng?: number, source?: string, precision?: string|null, raw?: object }>}
 */
export async function geocodeDireccionGeorefAr(p) {
  const calle = String(p.calle || "").trim();
  const localidad = String(p.localidad || "").trim();
  if (calle.length < 2 || localidad.length < 2) {
    return { hit: false };
  }
  const num = String(p.numero || "")
    .trim()
    .replace(/\D/g, "");
  const dirLine = num ? `${calle} ${num}` : calle;
  const prov = p.provincia != null && String(p.provincia).trim() ? String(p.provincia).trim() : "";

  const params = new URLSearchParams();
  params.set("direccion", dirLine);
  params.set("localidad", localidad);
  params.set("max", "3");
  if (prov.length >= 2) params.set("provincia", prov);

  const url = `${GEO_REF_BASE}/direcciones?${params.toString()}`;
  const ms = Math.min(
    25000,
    Math.max(3000, parseInt(String(process.env.GEO_REF_FETCH_TIMEOUT_MS || GEO_REF_DEFAULT_TIMEOUT_MS), 10) || GEO_REF_DEFAULT_TIMEOUT_MS)
  );
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.GEO_REF_USER_AGENT || "GestorNova-Georef/1.0",
      },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { hit: false, raw: { http: r.status, body: j } };
    }
    const arr = Array.isArray(j.direcciones) ? j.direcciones : [];
    if (!arr.length) return { hit: false, raw: j };

    const d0 = arr[0];
    const ubi = d0?.ubicacion;
    const lat = ubi != null ? Number(ubi.lat) : NaN;
    const lng = ubi != null ? Number(ubi.lon ?? ubi.lng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { hit: false, raw: j };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { hit: false, raw: j };

    const precision = ubi.nivel != null ? String(ubi.nivel) : d0?.nivel ? String(d0.nivel) : null;
    return {
      hit: true,
      lat,
      lng,
      source: "georef_ar",
      precision,
      raw: process.env.DEBUG_GEO_REF === "1" ? j : undefined,
    };
  } catch (e) {
    return { hit: false, error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}
