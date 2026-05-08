/**
 * Búsqueda por nombre/apellido en socios_catalogo para el bot de WhatsApp (Levenshtein).
 * Requiere extensión fuzzystrmatch en PostgreSQL (migración enable_fuzzystrmatch.sql).
 * Si no existe la función, usa fallback LIKE + Levenshtein en Node.
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { loadTenantBusinessContext } from "../utils/businessScope.js";
import { buscarCoordenadasVecinosMismaCalle } from "../services/whatsappPadronVecinos.js";

/** @typedef {{ id: number, nombre: string, nombre_dist: number, calle: string|null, numero: string|null, localidad: string|null, telefono: string|null, barrio: string|null, provincia: string|null, codigo_postal: string|null, lat_pad: number|null, lng_pad: number|null, nis: string|null, medidor: string|null, nis_medidor: string|null, tipo_conexion: string|null, fases: string|null }} CatalogoNombreRow */

let _tableExistsCache;
async function tableExists(name) {
  const k = String(name);
  if (_tableExistsCache?.[k] !== undefined) return _tableExistsCache[k];
  if (!_tableExistsCache) _tableExistsCache = {};
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [k]
  );
  _tableExistsCache[k] = r.rows.length > 0;
  return _tableExistsCache[k];
}

async function columnasSet(name) {
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return new Set((r.rows || []).map((c) => c.column_name));
}

function sqlLatPadExpr(cols) {
  const parts = [];
  if (cols.has("latitud")) parts.push("s.latitud::numeric");
  if (cols.has("lat")) parts.push("s.lat::numeric");
  if (!parts.length) return "NULL::numeric AS lat_pad";
  return parts.length === 1 ? `${parts[0]} AS lat_pad` : `COALESCE(${parts.join(", ")}) AS lat_pad`;
}

function sqlLngPadExpr(cols) {
  const parts = [];
  if (cols.has("longitud")) parts.push("s.longitud::numeric");
  if (cols.has("lng")) parts.push("s.lng::numeric");
  if (!parts.length) return "NULL::numeric AS lng_pad";
  return parts.length === 1 ? `${parts[0]} AS lng_pad` : `COALESCE(${parts.join(", ")}) AS lng_pad`;
}

function buildSelectList(cols, distSqlExpr) {
  const barrioSel = cols.has("barrio")
    ? "NULLIF(TRIM(COALESCE(s.barrio::text,'')), '') AS barrio"
    : "NULL::text AS barrio";
  const provSel = cols.has("provincia")
    ? "NULLIF(TRIM(COALESCE(s.provincia::text,'')), '') AS provincia"
    : "NULL::text AS provincia";
  const cpSel = cols.has("codigo_postal")
    ? "NULLIF(TRIM(COALESCE(s.codigo_postal::text,'')), '') AS codigo_postal"
    : "NULL::text AS codigo_postal";
  const nisSel = cols.has("nis") ? "NULLIF(TRIM(COALESCE(s.nis::text,'')), '') AS nis" : "NULL::text AS nis";
  const medSel = cols.has("medidor")
    ? "NULLIF(TRIM(COALESCE(s.medidor::text,'')), '') AS medidor"
    : "NULL::text AS medidor";
  const nmSel = cols.has("nis_medidor")
    ? "NULLIF(TRIM(COALESCE(s.nis_medidor::text,'')), '') AS nis_medidor"
    : "NULL::text AS nis_medidor";
  const tcSel = cols.has("tipo_conexion")
    ? "NULLIF(TRIM(COALESCE(s.tipo_conexion::text,'')), '') AS tipo_conexion"
    : "NULL::text AS tipo_conexion";
  const fSel = cols.has("fases") ? "NULLIF(TRIM(COALESCE(s.fases::text,'')), '') AS fases" : "NULL::text AS fases";
  return `
        s.id,
        NULLIF(TRIM(COALESCE(s.nombre::text,'')), '') AS nombre,
        ${distSqlExpr} AS nombre_dist,
        NULLIF(TRIM(COALESCE(s.calle::text,'')), '') AS calle,
        NULLIF(TRIM(COALESCE(s.numero::text,'')), '') AS numero,
        NULLIF(TRIM(COALESCE(s.localidad::text,'')), '') AS localidad,
        NULLIF(TRIM(COALESCE(s.telefono::text,'')), '') AS telefono,
        ${barrioSel},
        ${provSel},
        ${cpSel},
        ${sqlLatPadExpr(cols)},
        ${sqlLngPadExpr(cols)},
        ${nisSel},
        ${medSel},
        ${nmSel},
        ${tcSel},
        ${fSel}`;
}

/** Distancia de Levenshtein (iterativa; fallback en Node). */
export function levenshteinDistance(a, b) {
  const s = String(a || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const t = String(b || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (s === t) return 0;
  const maxLen = 120;
  const ss = s.length > maxLen ? s.slice(0, maxLen) : s;
  const tt = t.length > maxLen ? t.slice(0, maxLen) : t;
  const m = ss.length;
  const n = tt.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const c1 = ss.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = c1 === tt.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

function pickLatLngFromPads(row) {
  const la = row?.lat_pad != null ? Number(row.lat_pad) : NaN;
  const lo = row?.lng_pad != null ? Number(row.lng_pad) : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return { catalogoLatitud: null, catalogoLongitud: null };
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return { catalogoLatitud: null, catalogoLongitud: null };
  if (Math.abs(la) < 1e-6 && Math.abs(lo) < 1e-6) return { catalogoLatitud: null, catalogoLongitud: null };
  return { catalogoLatitud: la, catalogoLongitud: lo };
}

function normalizeCatalogRow(x) {
  return {
    id: Number(x.id),
    nombre: String(x.nombre || "").trim(),
    nombre_dist: Number(x.nombre_dist),
    calle: x.calle != null ? String(x.calle).trim() || null : null,
    numero: x.numero != null ? String(x.numero).trim() || null : null,
    localidad: x.localidad != null ? String(x.localidad).trim() || null : null,
    telefono: x.telefono != null ? String(x.telefono).trim() || null : null,
    barrio: x.barrio != null ? String(x.barrio).trim() || null : null,
    provincia: x.provincia != null ? String(x.provincia).trim() || null : null,
    codigo_postal: x.codigo_postal != null ? String(x.codigo_postal).trim() || null : null,
    lat_pad: x.lat_pad != null ? Number(x.lat_pad) : null,
    lng_pad: x.lng_pad != null ? Number(x.lng_pad) : null,
    nis: x.nis != null ? String(x.nis).trim() || null : null,
    medidor: x.medidor != null ? String(x.medidor).trim() || null : null,
    nis_medidor: x.nis_medidor != null ? String(x.nis_medidor).trim() || null : null,
    tipo_conexion: x.tipo_conexion != null ? String(x.tipo_conexion).trim() || null : null,
    fases: x.fases != null ? String(x.fases).trim() || null : null,
  };
}

/**
 * Convierte una fila del catálogo al mismo shape que `buscarIdentidadParaReclamoWhatsApp` (ok: true).
 * @param {number} tenantId
 * @param {CatalogoNombreRow} row
 */
export async function catalogoNombreRowToIdentidadRes(tenantId, row) {
  const nombre = String(row?.nombre || "").trim() || "Socio";
  const calle = row?.calle != null && String(row.calle).trim() ? String(row.calle).trim() : null;
  const numero = row?.numero != null && String(row.numero).trim() ? String(row.numero).trim() : null;
  const localidad = row?.localidad != null && String(row.localidad).trim() ? String(row.localidad).trim() : null;
  const coords = pickLatLngFromPads(row);
  const out = {
    ok: true,
    clienteNombre: nombre,
    nis: row?.nis != null && String(row.nis).trim() ? String(row.nis).trim() : null,
    medidor: row?.medidor != null && String(row.medidor).trim() ? String(row.medidor).trim() : null,
    nisMedidor:
      row?.nis_medidor != null && String(row.nis_medidor).trim()
        ? String(row.nis_medidor).trim()
        : null,
    catalogoCalle: calle,
    catalogoNumero: numero,
    catalogoLocalidad: localidad,
    catalogoProvincia: row?.provincia != null && String(row.provincia).trim() ? String(row.provincia).trim() : null,
    catalogoCodigoPostal: (() => {
      const raw = row?.codigo_postal;
      if (raw == null || !String(raw).trim()) return null;
      const d = String(raw).replace(/\D/g, "");
      return d.length >= 4 && d.length <= 8 ? d : null;
    })(),
    catalogoTipoConexion:
      row?.tipo_conexion != null && String(row.tipo_conexion).trim() ? String(row.tipo_conexion).trim() : null,
    catalogoFases: row?.fases != null && String(row.fases).trim() ? String(row.fases).trim() : null,
    ...coords,
  };
  if (out.catalogoLatitud == null && calle && localidad && numero) {
    try {
      const fb = await buscarCoordenadasVecinosMismaCalle({
        tenantId,
        calle,
        localidad,
        numeroTexto: numero,
        excludeNisMedidor: out.nisMedidor || out.medidor || out.nis || null,
        excludeClienteFinalId: null,
        preferTable: "socios_catalogo",
      });
      if (fb) {
        out.catalogoLatitud = fb.lat;
        out.catalogoLongitud = fb.lng;
        out.notaUbicacionProximidad = fb.nota;
      }
    } catch (_) {}
  }
  return out;
}

async function ejecutarBusquedaSql(tenantId, needle) {
  const cols = await columnasSet("socios_catalogo");
  const distExpr = `levenshtein(LOWER(TRIM(COALESCE(s.nombre::text,''))), LOWER(TRIM($2::text)))`;
  const selectList = buildSelectList(cols, distExpr);
  const params = [tenantId, needle];
  let businessSql = "";
  const { activeBusinessType, businessTypeFilterEnabled } = await loadTenantBusinessContext(tenantId);
  const hasBt = cols.has("business_type");
  if (hasBt && businessTypeFilterEnabled) {
    params.push(activeBusinessType);
    const i = params.length;
    businessSql = ` AND (s.business_type IS NULL OR TRIM(COALESCE(s.business_type::text,'')) = ''
        OR LOWER(TRIM(COALESCE(s.business_type::text,''))) = LOWER($${i}::text))`;
  }
  const sql = `
    SELECT * FROM (
      SELECT ${selectList}
      FROM socios_catalogo s
      WHERE COALESCE(s.activo, TRUE) = TRUE
        AND s.tenant_id = $1
        AND TRIM(COALESCE(s.nombre::text,'')) <> ''
        ${businessSql}
    ) t
    ORDER BY t.nombre_dist ASC, t.id ASC
    LIMIT 25`;
  const r = await query(sql, params);
  return (r.rows || []).map(normalizeCatalogRow);
}

async function ejecutarBusquedaFallbackLike(tenantId, needle) {
  const cols = await columnasSet("socios_catalogo");
  const selectList = buildSelectList(cols, "0");
  const tokens = String(needle || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 3);
  const tok = tokens[0] || String(needle || "").trim().slice(0, 4);
  if (!tok) return [];
  const params = [tenantId];
  let likeWhere = `LOWER(TRIM(COALESCE(s.nombre::text,''))) LIKE LOWER($2::text)`;
  params.push(`%${tok}%`);
  if (tokens.length >= 2) {
    params.push(`%${tokens[1]}%`);
    likeWhere = `LOWER(TRIM(COALESCE(s.nombre::text,''))) LIKE LOWER($2::text) AND LOWER(TRIM(COALESCE(s.nombre::text,''))) LIKE LOWER($3::text)`;
  }
  let businessSql = "";
  const { activeBusinessType, businessTypeFilterEnabled } = await loadTenantBusinessContext(tenantId);
  const hasBt = cols.has("business_type");
  if (hasBt && businessTypeFilterEnabled) {
    params.push(activeBusinessType);
    const i = params.length;
    businessSql = ` AND (s.business_type IS NULL OR TRIM(COALESCE(s.business_type::text,'')) = ''
        OR LOWER(TRIM(COALESCE(s.business_type::text,''))) = LOWER($${i}::text))`;
  }
  const sql = `
    SELECT ${selectList}
    FROM socios_catalogo s
    WHERE COALESCE(s.activo, TRUE) = TRUE
      AND s.tenant_id = $1
      AND TRIM(COALESCE(s.nombre::text,'')) <> ''
      AND (${likeWhere})
      ${businessSql}
    LIMIT 400`;
  const r = await query(sql, params);
  const rows = (r.rows || []).map(normalizeCatalogRow);
  const nNorm = String(needle || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  for (const row of rows) {
    row.nombre_dist = levenshteinDistance(nNorm, row.nombre);
  }
  rows.sort((a, b) => a.nombre_dist - b.nombre_dist || a.id - b.id);
  return rows.slice(0, 25);
}

/**
 * @typedef {{ kind: 'normal', nombreLibre: string }} ResultadoNombreBotNormal
 * @typedef {{ kind: 'confirm_one', row: CatalogoNombreRow }} ResultadoNombreBotConfirm
 * @typedef {{ kind: 'pick_list', rows: CatalogoNombreRow[], ningunaNumero: number }} ResultadoNombreBotPick
 */

/**
 * @param {{ tenantId: number, textoNombre: string }} p
 * @returns {Promise<ResultadoNombreBotNormal | ResultadoNombreBotConfirm | ResultadoNombreBotPick>}
 */
export async function clasificarBusquedaNombreSociosParaBotWa(p) {
  const tenantId = Number(p.tenantId);
  const nombreLibre = String(p.textoNombre || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!Number.isFinite(tenantId) || tenantId < 1) return { kind: "normal", nombreLibre, sinCoincidenciaPadron: false };
  if (!(await tableExists("socios_catalogo"))) return { kind: "normal", nombreLibre, sinCoincidenciaPadron: false };
  if (!(await tableHasColumn("socios_catalogo", "tenant_id"))) return { kind: "normal", nombreLibre, sinCoincidenciaPadron: false };
  if (!nombreLibre || nombreLibre.length < 2) return { kind: "normal", nombreLibre, sinCoincidenciaPadron: false };

  let rows = [];
  try {
    rows = await ejecutarBusquedaSql(tenantId, nombreLibre);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/levenshtein|fuzzystrmatch|42883|does not exist/i.test(msg)) {
      console.warn("[busqueda-nombre-bot] levenshtein no disponible, fallback LIKE + JS", msg.slice(0, 160));
      try {
        rows = await ejecutarBusquedaFallbackLike(tenantId, nombreLibre);
      } catch (e2) {
        console.warn("[busqueda-nombre-bot] fallback", e2?.message || e2);
        return { kind: "normal", nombreLibre, sinCoincidenciaPadron: false };
      }
    } else {
      console.warn("[busqueda-nombre-bot] SQL", e?.message || e);
      return { kind: "normal", nombreLibre, sinCoincidenciaPadron: false };
    }
  }

  if (!rows.length) return { kind: "normal", nombreLibre, sinCoincidenciaPadron: true };

  const d1 = rows[0].nombre_dist;

  const high = rows.filter((r) => r.nombre_dist <= 2).slice(0, 5);
  if (high.length >= 2) {
    const ningunaNumero = high.length + 1;
    return { kind: "pick_list", rows: high, ningunaNumero };
  }
  if (high.length === 1) {
    return { kind: "confirm_one", row: high[0] };
  }

  if (d1 >= 3 && d1 <= 5) {
    const partial = rows.filter((r) => r.nombre_dist >= 3 && r.nombre_dist <= 5).slice(0, 5);
    if (!partial.length) return { kind: "normal", nombreLibre, sinCoincidenciaPadron: true };
    const ningunaNumero = partial.length + 1;
    return { kind: "pick_list", rows: partial, ningunaNumero };
  }

  if (d1 > 5) return { kind: "normal", nombreLibre, sinCoincidenciaPadron: true };

  return { kind: "normal", nombreLibre, sinCoincidenciaPadron: false };
}
