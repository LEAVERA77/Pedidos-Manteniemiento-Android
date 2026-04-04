import { query } from "../db/neon.js";

/**
 * Tabla genérica key/value JSON (Neon). Ubicación central por tenant: key dedicada.
 */
export async function ensureConfiguracionTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS configuracion (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function keyUbicacionCentral(tenantId) {
  return `ubicacion_central_tenant_${Number(tenantId)}`;
}

export async function getUbicacionCentralFromTable(tenantId) {
  await ensureConfiguracionTable();
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const r = await query(`SELECT value FROM configuracion WHERE key = $1 LIMIT 1`, [keyUbicacionCentral(tid)]);
  const v = r.rows?.[0]?.value;
  if (!v || typeof v !== "object") return null;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const zoom = Number(v.zoom);
  return {
    lat,
    lng,
    zoom: Number.isFinite(zoom) && zoom > 0 && zoom <= 22 ? zoom : 13,
    nombre: String(v.nombre || "").trim(),
  };
}

export async function setUbicacionCentralInTable(tenantId, { lat, lng, zoom, nombre }) {
  await ensureConfiguracionTable();
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) throw new Error("tenant_invalido");
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new Error("lat_lng_invalidos");
  const z = zoom != null ? Number(zoom) : 13;
  const value = {
    lat: la,
    lng: lo,
    zoom: Number.isFinite(z) && z > 0 && z <= 22 ? z : 13,
    nombre: nombre != null ? String(nombre).trim() : "",
  };
  await query(
    `INSERT INTO configuracion (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [keyUbicacionCentral(tid), JSON.stringify(value)]
  );
  return value;
}
