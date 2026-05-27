/**
 * Zona de servicio del tenant (bbox desde tenant_localidades).
 * made by leavera77
 */

import { query } from "../db/neon.js";

async function tableExists(name) {
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [name]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

function parseBBox(raw) {
  if (!raw) return null;
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    const minLat = Number(o.minLat ?? o.min_lat ?? o.south);
    const maxLat = Number(o.maxLat ?? o.max_lat ?? o.north);
    const minLng = Number(o.minLng ?? o.min_lon ?? o.west);
    const maxLng = Number(o.maxLng ?? o.max_lon ?? o.east);
    if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) return null;
    return { minLat, maxLat, minLng, maxLng };
  } catch {
    return null;
  }
}

function expandBBox(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    minLat: Math.min(a.minLat, b.minLat),
    maxLat: Math.max(a.maxLat, b.maxLat),
    minLng: Math.min(a.minLng, b.minLng),
    maxLng: Math.max(a.maxLng, b.maxLng),
  };
}

function pointInBBox(lat, lng, bbox) {
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lng >= bbox.minLng &&
    lng <= bbox.maxLng
  );
}

/**
 * @param {number} tenantId
 */
export async function getZonaServicioTenant(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return { configurada: false, bbox: null, localidades: 0 };
  }
  if (!(await tableExists("tenant_localidades"))) {
    return { configurada: false, bbox: null, localidades: 0, tabla_ok: false };
  }
  const r = await query(
    `SELECT nombre, bounding_box, lat, lng
     FROM tenant_localidades
     WHERE tenant_id = $1 AND activo IS NOT FALSE`,
    [tid]
  );
  let bbox = null;
  let conBbox = 0;
  for (const row of r.rows || []) {
    const bb = parseBBox(row.bounding_box);
    if (bb) {
      bbox = expandBBox(bbox, bb);
      conBbox++;
      continue;
    }
    const la = Number(row.lat);
    const lo = Number(row.lng);
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      const pad = 0.08;
      const approx = {
        minLat: la - pad,
        maxLat: la + pad,
        minLng: lo - pad,
        maxLng: lo + pad,
      };
      bbox = expandBBox(bbox, approx);
      conBbox++;
    }
  }
  return {
    configurada: conBbox > 0,
    bbox,
    localidades: (r.rows || []).length,
    localidades_con_bbox: conBbox,
    tabla_ok: true,
  };
}

/**
 * @param {number} tenantId
 * @param {number} lat
 * @param {number} lng
 */
export async function verificarCoordenadasZonaServicio(tenantId, lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    return { ok: false, error: "coordenadas_invalidas" };
  }
  const zona = await getZonaServicioTenant(tenantId);
  if (!zona.configurada || !zona.bbox) {
    return { ok: true, dentro: true, configurada: false, zona };
  }
  const dentro = pointInBBox(la, lo, zona.bbox);
  return { ok: true, dentro, configurada: true, zona };
}
