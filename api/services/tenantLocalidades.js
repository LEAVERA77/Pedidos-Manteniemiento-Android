/**
 * Validación de localidad en WhatsApp y metadatos (bbox) para el pipeline de geocodificación.
 * made by leavera77
 */

import { query } from "../db/neon.js";
import {
  geocodeLocalityViewboxArgentina,
  pointInBBox,
  coordsPassLocalityCentroidGuard,
} from "./nominatimClient.js";

async function tableExists(name) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rows.length > 0;
}

async function columnas(name) {
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return new Set((r.rows || []).map((c) => c.column_name));
}

export function normalizarNombreLocalidad(s) {
  return String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Acepta bbox guardado como minLon/maxLon o minLng/maxLng. */
export function parseBoundingBoxJson(raw) {
  if (raw == null) return null;
  const o = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch (_) { return null; } })() : raw;
  if (!o || typeof o !== "object") return null;
  const minLat = Number(o.minLat);
  const maxLat = Number(o.maxLat);
  const minLon = Number(o.minLon != null ? o.minLon : o.minLng);
  const maxLon = Number(o.maxLon != null ? o.maxLon : o.maxLng);
  if (![minLat, maxLat, minLon, maxLon].every((x) => Number.isFinite(x))) return null;
  return { minLat, maxLat, minLon, maxLon };
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

async function localidadesDistinctSociosCatalogo(tenantId) {
  if (!(await tableExists("socios_catalogo"))) return [];
  const cols = await columnas("socios_catalogo");
  if (!cols.has("localidad")) return [];
  const tenantCol = cols.has("cliente_id")
    ? "cliente_id"
    : cols.has("tenant_id")
      ? "tenant_id"
      : null;
  const params = [];
  let sql = `SELECT DISTINCT TRIM(localidad::text) AS nombre FROM socios_catalogo WHERE localidad IS NOT NULL AND TRIM(localidad::text) <> ''`;
  if (tenantCol) {
    sql += ` AND (${tenantCol} IS NULL OR ${tenantCol} = $1)`;
    params.push(Number(tenantId));
  }
  sql += ` LIMIT 600`;
  try {
    const r = await query(sql, params);
    return (r.rows || []).map((row) => String(row.nombre || "").trim()).filter(Boolean);
  } catch (e) {
    console.warn("[tenantLocalidades] socios_catalogo distinct localidad", e?.message || e);
    return [];
  }
}

async function filasTenantLocalidades(tenantId) {
  if (!(await tableExists("tenant_localidades"))) return [];
  try {
    const r = await query(
      `SELECT id, nombre, nombre_normalizado, provincia, lat, lng, bounding_box
       FROM tenant_localidades
       WHERE tenant_id = $1 AND activo IS NOT FALSE`,
      [Number(tenantId)]
    );
    return r.rows || [];
  } catch (e) {
    console.warn("[tenantLocalidades] lectura tenant_localidades", e?.message || e);
    return [];
  }
}

/**
 * Si hay catálogo (tabla tenant_localidades y/o localidades en socios_catalogo), exige coincidencia o sugerencias.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, nombreCanonico?: string, meta?: object, msg?: string }>}
 */
export async function validarLocalidadParaChatWhatsapp(tenantId, rawNombre) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return { ok: true, skipped: true, nombreCanonico: String(rawNombre || "").trim() };
  }
  const normIn = normalizarNombreLocalidad(rawNombre);
  if (normIn.length < 2) {
    return { ok: false, msg: "La *ciudad o localidad* es demasiado corta." };
  }

  const [filasCat, desdeSocios] = await Promise.all([filasTenantLocalidades(tid), localidadesDistinctSociosCatalogo(tid)]);

  const candidatos = new Map();
  for (const row of filasCat) {
    const n = String(row.nombre || "").trim();
    const nn = String(row.nombre_normalizado || "").trim() || normalizarNombreLocalidad(n);
    if (!n) continue;
    candidatos.set(nn, { tipo: "tabla", nombre: n, row });
  }
  for (const n of desdeSocios) {
    const nn = normalizarNombreLocalidad(n);
    if (!candidatos.has(nn)) candidatos.set(nn, { tipo: "socios", nombre: n, row: null });
  }

  if (candidatos.size === 0) {
    return { ok: true, skipped: true, nombreCanonico: String(rawNombre || "").trim() };
  }

  if (candidatos.has(normIn)) {
    const c = candidatos.get(normIn);
    return { ok: true, nombreCanonico: c.nombre, meta: c.row };
  }

  const prefijos = [];
  for (const [nn, c] of candidatos) {
    if (nn.startsWith(normIn) || normIn.startsWith(nn)) prefijos.push(c);
  }
  if (prefijos.length === 1) {
    const c = prefijos[0];
    return { ok: true, nombreCanonico: c.nombre, meta: c.row };
  }

  const scored = [];
  for (const [nn, c] of candidatos) {
    const d = levenshtein(normIn, nn);
    scored.push({ d, c });
  }
  scored.sort((a, b) => a.d - b.d);
  const best = scored[0];
  const maxDist = normIn.length <= 8 ? 2 : 3;
  if (best && best.d <= maxDist) {
    return { ok: true, nombreCanonico: best.c.nombre, meta: best.c.row };
  }

  const sugeridas = scored
    .slice(0, 5)
    .map((x) => x.c.nombre)
    .filter((x, i, a) => a.indexOf(x) === i);
  const lista = sugeridas.length ? sugeridas.map((x) => `*${x}*`).join(", ") : "ninguna cercana";
  return {
    ok: false,
    msg:
      `No encontré la localidad *"${String(rawNombre || "").trim()}*" en nuestro padrón.\n\n` +
      `¿Quisiste decir alguna de estas?: ${lista}\n\n` +
      `Escribí de nuevo el nombre *completo* de la localidad o *atrás* para volver.`,
  };
}

/**
 * Metadatos de bbox preferentes desde tenant_localidades (si existe fila para el nombre).
 */
export async function buscarMetaLocalidadTenant(tenantId, nombreLocalidad) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const norm = normalizarNombreLocalidad(nombreLocalidad);
  if (norm.length < 2) return null;
  if (!(await tableExists("tenant_localidades"))) return null;
  try {
    const r = await query(
      `SELECT id, nombre, nombre_normalizado, provincia, lat, lng, bounding_box
       FROM tenant_localidades
       WHERE tenant_id = $1 AND activo IS NOT FALSE AND nombre_normalizado = $2
       LIMIT 1`,
      [tid, norm]
    );
    return r.rows?.[0] || null;
  } catch (e) {
    return null;
  }
}

/**
 * True si el punto es coherente con la localidad (bbox BD si hay + viewbox Nominatim + guard de centroide).
 */
export async function coordenadasPlausiblesParaLocalidadTenant(lat, lng, tenantId, locNombre, stateOrProvince, postalDigits) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;

  const meta = await buscarMetaLocalidadTenant(tenantId, locNombre);
  const bboxDb = meta?.bounding_box != null ? parseBoundingBoxJson(meta.bounding_box) : null;
  if (bboxDb && !pointInBBox(la, lo, bboxDb)) {
    return false;
  }

  const postal = String(postalDigits || "")
    .trim()
    .replace(/\D/g, "");
  const state = String(stateOrProvince || "").trim();

  const vbMeta = await geocodeLocalityViewboxArgentina(String(locNombre || "").trim(), null, {
    allowTenantCentroidFallback: false,
    stateOrProvince: state.length >= 2 ? state : undefined,
    postalCode: postal.length >= 4 ? postal : undefined,
  });

  if (vbMeta?.bbox && !pointInBBox(la, lo, vbMeta.bbox)) {
    return false;
  }
  if (vbMeta && !vbMeta.fromTenantCentroid) {
    if (!coordsPassLocalityCentroidGuard(la, lo, vbMeta, null)) {
      return false;
    }
  }
  return true;
}
