/**
 * Overrides manuales de lat/lng por calle + número + localidad (+ provincia opcional).
 * Tabla `correcciones_direcciones` (migración SQL). Si la tabla no existe, no falla el pipeline.
 * made by leavera77
 */

import { query } from "../db/neon.js";

let _tableMissingLogged = false;

function logTableMissingOnce(e) {
  if (_tableMissingLogged) return;
  const m = String(e?.message || "");
  if (m.includes("correcciones_direcciones") && m.includes("does not exist")) {
    console.warn("[correcciones-direcciones] tabla ausente; ejecutá migración correcciones_direcciones.sql");
    _tableMissingLogged = true;
  }
}

export function correccionesDireccionesEnabled() {
  return process.env.CORRECCIONES_DIRECCIONES_ENABLED !== "0" && process.env.CORRECCIONES_DIRECCIONES_ENABLED !== "false";
}

/** Sin acentos, minúsculas, espacios colapsados. */
export function normalizarParteDireccion(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function normalizarNumeroPuerta(n) {
  const d = String(n || "").replace(/\D/g, "");
  return d || "";
}

/**
 * @param {{ tenantId: number, calle: string, numero?: string|null, localidad: string, provincia?: string|null }} p
 * @returns {Promise<{ hit: boolean, lat?: number, lng?: number, id?: number }>}
 */
export async function buscarCorreccionDireccionEnBd(p) {
  if (!correccionesDireccionesEnabled()) return { hit: false };

  const calleNorm = normalizarParteDireccion(p.calle);
  const locNorm = normalizarParteDireccion(p.localidad);
  if (calleNorm.length < 2 || locNorm.length < 2) return { hit: false };

  const numNorm = normalizarNumeroPuerta(p.numero);
  const provRaw = p.provincia != null && String(p.provincia).trim() ? String(p.provincia).trim() : "";
  const provNorm = provRaw ? normalizarParteDireccion(provRaw) : "";

  const tid = Number(p.tenantId);
  const tidArg = Number.isFinite(tid) && tid > 0 ? tid : 0;

  try {
    const r = await query(
      `SELECT id, lat, lng FROM correcciones_direcciones
       WHERE calle_norm = $1 AND localidad_norm = $2 AND numero_norm = $3
         AND (
           COALESCE(provincia_norm, '') = ''
           OR $4::text = ''
           OR provincia_norm = $4
         )
         AND (tenant_id IS NULL OR ($5::int > 0 AND tenant_id = $5::int))
       ORDER BY
         CASE
           WHEN $5::int > 0 AND tenant_id = $5::int THEN 0
           WHEN tenant_id IS NULL THEN 1
           ELSE 2
         END,
         id DESC
       LIMIT 1`,
      [calleNorm, locNorm, numNorm, provNorm, tidArg]
    );
    const row = r.rows?.[0];
    if (!row) return { hit: false };
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { hit: false };
    return { hit: true, lat, lng, id: row.id != null ? Number(row.id) : undefined };
  } catch (e) {
    logTableMissingOnce(e);
    return { hit: false };
  }
}
