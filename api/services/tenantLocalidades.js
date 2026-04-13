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

/** Georef usa a veces nombres más largos (p. ej. Tierra del Fuego…). */
function coincideProvinciaGeoref(dbNorm, userNorm) {
  if (!dbNorm || !userNorm) return false;
  if (dbNorm === userNorm) return true;
  if (dbNorm.startsWith(userNorm + ",")) return true;
  if (dbNorm.startsWith(userNorm + " ")) return true;
  return false;
}

async function tieneFilasLocalidadesArgentinas() {
  if (!(await tableExists("localidades_argentinas"))) return false;
  try {
    const r = await query(`SELECT 1 FROM localidades_argentinas LIMIT 1`);
    return r.rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function validarEnArgentinaConProvincia(tenantId, normNombre, normProv, rawDisplay, provinciaNombreOpt) {
  const q = await query(
    `SELECT nombre, nombre_normalizado, provincia, provincia_normalizado, lat, lng, codigo_postal
     FROM localidades_argentinas WHERE nombre_normalizado = $1`,
    [normNombre]
  );
  const hit = (q.rows || []).find((r) => coincideProvinciaGeoref(String(r.provincia_normalizado || ""), normProv));
  if (hit) {
    return { ok: true, nombreCanonico: hit.nombre, meta: hit, fuente: "georef" };
  }

  const filasT = await filasTenantLocalidades(Number(tenantId));
  for (const row of filasT) {
    const nn = String(row.nombre_normalizado || "").trim() || normalizarNombreLocalidad(String(row.nombre || ""));
    if (nn !== normNombre) continue;
    const pv = row.provincia != null ? normalizarNombreLocalidad(String(row.provincia)) : "";
    if (pv && coincideProvinciaGeoref(pv, normProv)) {
      return { ok: true, nombreCanonico: String(row.nombre || "").trim(), meta: row, fuente: "tenant" };
    }
  }

  const len = normNombre.length;
  const minL = Math.max(2, len - 3);
  const maxL = len + 6;
  const sug = await query(
    `SELECT nombre, nombre_normalizado FROM localidades_argentinas
     WHERE provincia_normalizado LIKE $1 || '%'
       AND char_length(nombre_normalizado) BETWEEN $2 AND $3`,
    [normProv, minL, maxL]
  );
  const scored = (sug.rows || []).map((r) => ({
    r,
    d: levenshtein(normNombre, String(r.nombre_normalizado || "")),
  }));
  scored.sort((a, b) => a.d - b.d);
  const top = scored.slice(0, 6).filter((x) => x.d <= 4);
  const nombres = top.map((x) => x.r.nombre).filter(Boolean);
  const lista = nombres.length ? nombres.map((x) => `*${x}*`).join(", ") : "";
  const provTitulo = String(provinciaNombreOpt || "").trim() || "esa provincia";
  return {
    ok: false,
    msg:
      `La localidad *"${String(rawDisplay || "").trim()}"* no figura en *${provTitulo}* según el padrón nacional.\n\n` +
      (lista ? `¿Quisiste decir: ${lista}?\n\n` : "") +
      `Revisá el nombre o tocá *atrás* y elegí otra provincia si corresponde.`,
  };
}

async function validarEnArgentinaSinProvincia(normIn, rawDisplay) {
  const ex = await query(
    `SELECT nombre, nombre_normalizado, provincia FROM localidades_argentinas WHERE nombre_normalizado = $1 LIMIT 40`,
    [normIn]
  );
  if (ex.rows?.length) {
    const row = ex.rows[0];
    return { ok: true, nombreCanonico: row.nombre, meta: row, fuente: "georef" };
  }

  const pref = await query(
    `SELECT nombre, nombre_normalizado FROM localidades_argentinas
     WHERE nombre_normalizado LIKE $1 || '%' ORDER BY char_length(nombre_normalizado) ASC LIMIT 20`,
    [normIn]
  );
  if (pref.rows?.length === 1) {
    const r = pref.rows[0];
    return { ok: true, nombreCanonico: r.nombre, meta: r, fuente: "georef" };
  }
  if (pref.rows?.length > 1) {
    const scored = pref.rows.map((r) => ({
      r,
      d: levenshtein(normIn, String(r.nombre_normalizado || "")),
    }));
    scored.sort((a, b) => a.d - b.d);
    const best = scored[0];
    const maxDist = normIn.length <= 8 ? 2 : 3;
    if (best && best.d <= maxDist) {
      return { ok: true, nombreCanonico: best.r.nombre, meta: best.r, fuente: "georef" };
    }
  }

  const broad = await query(
    `SELECT nombre, nombre_normalizado FROM localidades_argentinas
     WHERE nombre_normalizado LIKE '%' || $1 || '%' LIMIT 25`,
    [normIn.length >= 4 ? normIn.slice(0, 4) : normIn]
  );
  if (broad.rows?.length) {
    const scored = broad.rows.map((r) => ({
      r,
      d: levenshtein(normIn, String(r.nombre_normalizado || "")),
    }));
    scored.sort((a, b) => a.d - b.d);
    const best = scored[0];
    const maxDist = normIn.length <= 8 ? 3 : 4;
    if (best && best.d <= maxDist) {
      return { ok: true, nombreCanonico: best.r.nombre, meta: best.r, fuente: "georef" };
    }
  }

  return null;
}

async function validarEnTenantYSocios(tenantId, rawNombre, normIn) {
  const tid = Number(tenantId);
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
    return { ok: true, nombreCanonico: c.nombre, meta: c.row, fuente: "tenant" };
  }

  const prefijos = [];
  for (const [nn, c] of candidatos) {
    if (nn.startsWith(normIn) || normIn.startsWith(nn)) prefijos.push(c);
  }
  if (prefijos.length === 1) {
    const c = prefijos[0];
    return { ok: true, nombreCanonico: c.nombre, meta: c.row, fuente: "tenant" };
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
    return { ok: true, nombreCanonico: best.c.nombre, meta: best.c.row, fuente: "tenant" };
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
 * 1) Catálogo nacional `localidades_argentinas` (Georef) si está poblado.
 * 2) `tenant_localidades` + socios (cooperativa).
 * @param {string|null|undefined} provinciaNombreOpt — si viene, filtra por provincia (paso posterior al nombre de ciudad).
 * @returns {Promise<{ ok: boolean, skipped?: boolean, nombreCanonico?: string, meta?: object, msg?: string, fuente?: string }>}
 */
export async function validarLocalidadParaChatWhatsapp(tenantId, rawNombre, provinciaNombreOpt = null) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return { ok: true, skipped: true, nombreCanonico: String(rawNombre || "").trim() };
  }
  const normIn = normalizarNombreLocalidad(rawNombre);
  if (normIn.length < 2) {
    return { ok: false, msg: "La *ciudad o localidad* es demasiado corta." };
  }

  const hasAr = await tieneFilasLocalidadesArgentinas();
  const normProv = provinciaNombreOpt != null ? normalizarNombreLocalidad(String(provinciaNombreOpt)) : null;

  if (hasAr && normProv && normProv.length >= 2) {
    return validarEnArgentinaConProvincia(tid, normIn, normProv, rawNombre, provinciaNombreOpt);
  }

  if (hasAr && !normProv) {
    const ar = await validarEnArgentinaSinProvincia(normIn, rawNombre);
    if (ar?.ok) return ar;

    const tenantR = await validarEnTenantYSocios(tid, rawNombre, normIn);
    if (tenantR.skipped) {
      return {
        ok: false,
        msg:
          `No encontré *"${String(rawNombre || "").trim()}*" en el padrón nacional de localidades.\n\n` +
          `Escribí el nombre oficial (como en mapa o DNI) o *atrás* para volver.`,
      };
    }
    if (tenantR.ok) return tenantR;
    return tenantR;
  }

  return validarEnTenantYSocios(tid, rawNombre, normIn);
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
