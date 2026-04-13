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
    const id = row.id != null ? Number(row.id) : null;
    if (id != null) {
      try {
        await query(
          `UPDATE correcciones_direcciones
             SET veces_usado = COALESCE(veces_usado, 0) + 1,
                 updated_at = NOW()
           WHERE id = $1`,
          [id]
        );
      } catch (e2) {
        logTableMissingOnce(e2);
      }
    }
    return { hit: true, lat, lng, id: id ?? undefined };
  } catch (e) {
    logTableMissingOnce(e);
    return { hit: false };
  }
}

/**
 * Guarda/actualiza coords marcadas por el operador en el mapa (por tenant + domicilio normalizado).
 * @param {{ tenantId: number, calle?: string|null, numero?: string|null, localidad?: string|null, provincia?: string|null, lat: number, lng: number, usuarioId?: number|null }} p
 * @returns {Promise<{ ok: boolean, id?: number, updated?: boolean, reason?: string }>}
 */
export async function upsertCorreccionOperadorDesdePedido(p) {
  if (!correccionesDireccionesEnabled()) return { ok: false, reason: "disabled" };

  const calleNorm = normalizarParteDireccion(p.calle);
  const locNorm = normalizarParteDireccion(p.localidad);
  if (calleNorm.length < 2 || locNorm.length < 2) return { ok: false, reason: "direccion_incompleta" };

  const numNorm = normalizarNumeroPuerta(p.numero);
  const provRaw = p.provincia != null && String(p.provincia).trim() ? String(p.provincia).trim() : "";
  const provNorm = provRaw ? normalizarParteDireccion(provRaw) : "";

  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "coords" };

  const tid = Number(p.tenantId);
  if (!Number.isFinite(tid) || tid < 1) return { ok: false, reason: "tenant" };

  const uid = p.usuarioId != null && Number.isFinite(Number(p.usuarioId)) ? Number(p.usuarioId) : null;

  try {
    const up = await query(
      `UPDATE correcciones_direcciones SET
         lat = $1,
         lng = $2,
         corregido_por = $3,
         corregido_en = NOW(),
         updated_at = NOW()
       WHERE tenant_id = $4
         AND calle_norm = $5
         AND numero_norm = $6
         AND localidad_norm = $7
         AND provincia_norm = $8
       RETURNING id`,
      [lat, lng, uid, tid, calleNorm, numNorm, locNorm, provNorm]
    );
    if (up.rows?.length) {
      return { ok: true, id: Number(up.rows[0].id), updated: true };
    }

    const ins = await query(
      `INSERT INTO correcciones_direcciones (
         tenant_id, calle_norm, numero_norm, localidad_norm, provincia_norm,
         lat, lng, corregido_por, corregido_en, updated_at, veces_usado
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), 0)
       RETURNING id`,
      [tid, calleNorm, numNorm, locNorm, provNorm, lat, lng, uid]
    );
    const nid = ins.rows?.[0]?.id;
    return { ok: true, id: nid != null ? Number(nid) : undefined, updated: false };
  } catch (e) {
    logTableMissingOnce(e);
    return { ok: false, reason: String(e?.message || e).slice(0, 240) };
  }
}
