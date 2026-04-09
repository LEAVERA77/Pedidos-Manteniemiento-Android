/**
 * Enriquece el padrón: lee Excel (demo u operativo), geocodifica con Nominatim vía geocodeWithFallback
 * (throttle + reintentos + tabla cache_geocodificacion) y actualiza socios_catalogo.
 *
 * Columnas típicas (socios-demo-300): NIS, Medidor, nombre, Calle, Numero, localidad, …
 * Alternativas: direccion / domicilio (se intenta separar calle + número).
 *
 * Uso (desde carpeta api, con DB_CONNECTION o DATABASE_URL):
 *   node scripts/enriquecerPadronDesdeExcel.mjs --tenant-id=1 --file="G:\ruta\socios-demo-300.xlsx"
 *   npm run enriquecer:excel-padron -- --tenant-id=1 --dry-run --limit=5
 *   node scripts/enriquecerPadronDesdeExcel.mjs --tenant-id=1 --ensure-latlng   # si la tabla no tiene lat/long
 *
 * Caché: tabla `cache_geocodificacion` (no `geocodificacion_cache`).
 * `--fallback-localidad`: si falla calle+número, un hit de Nominatim solo por localidad (provincia: ENRIQUECER_PROVINCIA, default Entre Ríos).
 *
 * made by leavera77
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { query } from "../db/neon.js";
import { geocodeWithFallback } from "../services/geocodeWithFallback.js";
import { ensureCacheGeocodificacionTable } from "../services/cacheGeocodificacion.js";
import { geocodeAddressArgentina } from "../services/nominatimClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const out = {
    tenantId: null,
    file: "",
    sheet: "",
    dryRun: false,
    limit: 0,
    skipExisting: false,
    offset: 0,
    ensureLatlng: false,
    fallbackLocalidad: false,
  };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-existing") out.skipExisting = true;
    else if (a === "--ensure-latlng") out.ensureLatlng = true;
    else if (a === "--fallback-localidad") out.fallbackLocalidad = true;
    else if (a.startsWith("--tenant-id=")) out.tenantId = Number(a.split("=")[1]);
    else if (a.startsWith("--file=")) out.file = a.slice("--file=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--sheet=")) out.sheet = a.slice("--sheet=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--limit=")) out.limit = Math.max(0, Number(a.split("=")[1]) || 0);
    else if (a.startsWith("--offset=")) out.offset = Math.max(0, Number(a.split("=")[1]) || 0);
  }
  return out;
}

function defaultExcelPath() {
  const candidates = [
    path.join("G:", "Mi unidad", "Programas", "socios-demo-300.xlsx"),
    path.join(__dirname, "../../app/src/main/assets/ejemplos/socios-demo-300.xlsx"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {
      /* ignore */
    }
  }
  return candidates[1];
}

function normalizeKey(k) {
  return String(k || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function rowToMap(row) {
  const m = {};
  for (const [k, v] of Object.entries(row)) {
    m[normalizeKey(k)] = v;
  }
  return m;
}

function pick(m, keys) {
  for (const k of keys) {
    const nk = normalizeKey(k);
    if (m[nk] != null && String(m[nk]).trim() !== "") return String(m[nk]).trim();
  }
  return "";
}

function parseDireccion(d) {
  const s = String(d || "").trim();
  if (!s) return { calle: "", numero: "" };
  const m = s.match(/^(.+?)\s+(\d+[A-Za-z0-9\-\/]*)\s*$/);
  if (m) return { calle: m[1].trim(), numero: m[2].trim() };
  return { calle: s, numero: "" };
}

async function columnas(name) {
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return new Set((r.rows || []).map((c) => c.column_name));
}

async function columnasTablaMeta(name) {
  const r = await query(
    `SELECT column_name, udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  const set = new Set((r.rows || []).map((c) => c.column_name));
  const types = {};
  for (const row of r.rows || []) types[row.column_name] = row;
  return { set, types };
}

/** Columna tipo `point` (Postgres) usada en algunos esquemas (x≈lng, y≈lat). */
function findPointColumnName(meta) {
  const candidates = ["coordenadas", "ubicacion", "punto", "geom", "location", "gps"];
  for (const c of candidates) {
    if (!meta.set.has(c)) continue;
    const t = meta.types[c];
    if (t && String(t.udt_name || "").toLowerCase() === "point") return c;
  }
  return null;
}

function hasNumericCoordPair(cols) {
  return (cols.has("latitud") && cols.has("longitud")) || (cols.has("lat") && cols.has("lng"));
}

async function ensureSociosLatLongColumns() {
  await query(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS latitud NUMERIC(12, 8)`);
  await query(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS longitud NUMERIC(12, 8)`);
}

function sqlLatExpr(cols, alias) {
  const a = `${alias}.`;
  const parts = [];
  if (cols.has("latitud")) parts.push(`${a}latitud::numeric`);
  if (cols.has("lat")) parts.push(`${a}lat::numeric`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `COALESCE(${parts.join(", ")})`;
}

function sqlLngExpr(cols, alias) {
  const a = `${alias}.`;
  const parts = [];
  if (cols.has("longitud")) parts.push(`${a}longitud::numeric`);
  if (cols.has("lng")) parts.push(`${a}lng::numeric`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `COALESCE(${parts.join(", ")})`;
}

function coordsValidInDb(latX, lngX) {
  return `(
    ${latX} IS NOT NULL AND ${lngX} IS NOT NULL
    AND (ABS(${latX}) >= 0.00001 OR ABS(${lngX}) >= 0.00001)
    AND ABS(${latX}) <= 90 AND ABS(${lngX}) <= 180
  )`;
}

function tenantClause(cols, tenantId, params) {
  const tenantCol = cols.has("cliente_id")
    ? "cliente_id"
    : cols.has("tenant_id")
      ? "tenant_id"
      : null;
  if (!tenantCol) return { sql: "", params };
  const p = params.length + 1;
  return { sql: ` AND (${tenantCol} IS NULL OR ${tenantCol} = $${p})`, params: [...params, tenantId] };
}

/**
 * Resuelve id en socios_catalogo: columnas nis+medidor, o solo nis_medidor (esquemas antiguos / demo).
 */
async function findSociosRowId(tenantId, nis, medidor, cols) {
  const n = String(nis || "").trim();
  const med = String(medidor || "").trim();
  if (!n && !med) return null;

  const base = `COALESCE(activo, TRUE) = TRUE`;

  if (cols.has("nis") && cols.has("medidor")) {
    if (!n || !med) return null;
    let params = [n, med];
    const { sql: tsql, params: p2 } = tenantClause(cols, tenantId, params);
    params = p2;
    const r = await query(
      `SELECT id FROM socios_catalogo WHERE ${base} AND TRIM(COALESCE(nis::text,'')) = $1 AND TRIM(COALESCE(medidor::text,'')) = $2${tsql} ORDER BY id ASC LIMIT 2`,
      params
    );
    const rows = r.rows || [];
    if (rows.length > 1) console.warn(`[warn] NIS+Medidor duplicado en padrón, uso id=${rows[0].id}`);
    return rows[0]?.id ?? null;
  }

  if (cols.has("nis") && !cols.has("medidor")) {
    if (!n) return null;
    let params = [n];
    const { sql: tsql, params: p2 } = tenantClause(cols, tenantId, params);
    params = p2;
    const r = await query(
      `SELECT id FROM socios_catalogo WHERE ${base} AND TRIM(COALESCE(nis::text,'')) = $1${tsql} ORDER BY id ASC LIMIT 2`,
      params
    );
    const rows = r.rows || [];
    return rows[0]?.id ?? null;
  }

  if (cols.has("nis_medidor")) {
    const variants = new Set();
    if (n) variants.add(n);
    if (med) variants.add(med);
    if (n && med) {
      variants.add(`${n}-${med}`);
      variants.add(`${n}_${med}`);
      variants.add(`${n}|${med}`);
      variants.add(`${n} ${med}`);
      variants.add(`${n}${med}`);
    }
    for (const v of variants) {
      if (!String(v).trim()) continue;
      let params = [String(v).trim()];
      const { sql: tsql, params: p2 } = tenantClause(cols, tenantId, params);
      params = p2;
      const r = await query(
        `SELECT id FROM socios_catalogo WHERE ${base} AND TRIM(COALESCE(nis_medidor::text,'')) = $1${tsql} ORDER BY id ASC LIMIT 2`,
        params
      );
      const rows = r.rows || [];
      if (rows[0]?.id != null) {
        if (rows.length > 1) console.warn(`[warn] nis_medidor duplicado, uso id=${rows[0].id}`);
        return rows[0].id;
      }
    }

    const dN = n.replace(/\D/g, "");
    const dM = med.replace(/\D/g, "");
    const digitCandidates = new Set();
    if (dN) digitCandidates.add(dN);
    if (dM) digitCandidates.add(dM);
    if (dN && dM) digitCandidates.add(dN + dM);
    for (const d of digitCandidates) {
      if (d.length < 3) continue;
      let params = [d];
      const { sql: tsql, params: p2 } = tenantClause(cols, tenantId, params);
      params = p2;
      const r = await query(
        `SELECT id FROM socios_catalogo WHERE ${base}
         AND regexp_replace(COALESCE(nis_medidor::text,''), '[^0-9]', '', 'g') = $1${tsql}
         ORDER BY id ASC LIMIT 2`,
        params
      );
      const rows = r.rows || [];
      if (rows[0]?.id != null) return rows[0].id;
    }
  }

  return null;
}

async function rowHasCoords(id, cols, pointCol) {
  const latX = sqlLatExpr(cols, "s");
  const lngX = sqlLngExpr(cols, "s");
  if (latX && lngX) {
    const r = await query(
      `SELECT 1 FROM socios_catalogo s WHERE s.id = $1 AND ${coordsValidInDb(latX, lngX)} LIMIT 1`,
      [id]
    );
    if (r.rows.length > 0) return true;
  }
  if (pointCol) {
    const qc = `"${String(pointCol).replace(/"/g, '""')}"`;
    const r = await query(
      `SELECT 1 FROM socios_catalogo s WHERE s.id = $1
       AND s.${qc} IS NOT NULL
       AND (ABS((s.${qc})[0]) >= 0.00001 OR ABS((s.${qc})[1]) >= 0.00001)
       AND ABS((s.${qc})[0]) <= 180 AND ABS((s.${qc})[1]) <= 90
       LIMIT 1`,
      [id]
    );
    return r.rows.length > 0;
  }
  return false;
}

async function updateSociosCoords(id, lat, lng, cols, pointCol) {
  if (cols.has("latitud") && cols.has("longitud")) {
    await query(
      `UPDATE socios_catalogo SET latitud = $1::numeric, longitud = $2::numeric WHERE id = $3`,
      [lat, lng, id]
    );
  } else if (cols.has("lat") && cols.has("lng")) {
    await query(`UPDATE socios_catalogo SET lat = $1::numeric, lng = $2::numeric WHERE id = $3`, [lat, lng, id]);
  } else if (pointCol) {
    const qc = `"${String(pointCol).replace(/"/g, '""')}"`;
    await query(
      `UPDATE socios_catalogo SET ${qc} = point($1::double precision, $2::double precision) WHERE id = $3`,
      [lng, lat, id]
    );
  } else {
    throw new Error(
      "socios_catalogo: sin latitud/longitud ni lat/lng ni columna point; usá --ensure-latlng o agregá columnas en Neon."
    );
  }
}

async function tableExists(name) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rows.length > 0;
}

async function main() {
  const args = parseArgs();
  if (!Number.isFinite(args.tenantId) || args.tenantId < 1) {
    console.error(
      "Uso: node scripts/enriquecerPadronDesdeExcel.mjs --tenant-id=N [--file=ruta.xlsx] [--sheet=Socios] [--dry-run] [--limit=N] [--offset=N] [--skip-existing] [--ensure-latlng] [--fallback-localidad]"
    );
    process.exit(1);
  }

  const xlsxPath = args.file || defaultExcelPath();
  if (!fs.existsSync(xlsxPath)) {
    console.error(`No existe el archivo: ${xlsxPath}`);
    process.exit(1);
  }

  if (!args.dryRun && (process.env.DISABLE_NOMINATIM === "1" || process.env.DISABLE_NOMINATIM === "true")) {
    console.error("DISABLE_NOMINATIM activo; no se puede geocodificar.");
    process.exit(1);
  }

  if (!(await tableExists("socios_catalogo"))) {
    console.error("No existe tabla socios_catalogo.");
    process.exit(1);
  }

  let scCols = await columnas("socios_catalogo");
  const canMatch =
    (scCols.has("nis") && scCols.has("medidor")) ||
    scCols.has("nis_medidor") ||
    scCols.has("nis");
  if (!canMatch) {
    console.error(
      "socios_catalogo: hace falta nis+medidor, o nis_medidor, o al menos nis para cruzar con el Excel."
    );
    process.exit(1);
  }

  let scMeta = await columnasTablaMeta("socios_catalogo");
  let pointCol = findPointColumnName(scMeta);
  if (args.ensureLatlng && !hasNumericCoordPair(scCols) && !pointCol) {
    await ensureSociosLatLongColumns();
    console.log("[info] Columnas latitud/longitud aseguradas en socios_catalogo.");
    scCols = await columnas("socios_catalogo");
    scMeta = await columnasTablaMeta("socios_catalogo");
    pointCol = findPointColumnName(scMeta);
  }

  if (!args.dryRun && !hasNumericCoordPair(scCols) && !pointCol) {
    console.error(
      "socios_catalogo no tiene pares lat/lng ni columna point. Ejecutá con --ensure-latlng o agregá columnas en la BD."
    );
    process.exit(1);
  }

  await ensureCacheGeocodificacionTable();

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheetName = args.sheet || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.error(`Hoja no encontrada: ${sheetName}. Disponibles: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const failures = [];
  let ok = 0;
  let skipped = 0;
  let noMatch = 0;

  const slice = rows.slice(args.offset, args.limit > 0 ? args.offset + args.limit : undefined);

  for (let i = 0; i < slice.length; i++) {
    const raw = slice[i];
    const m = rowToMap(raw);
    const excelId = pick(m, ["id", "socios_id", "id_socios"]);
    const nis = pick(m, ["nis"]);
    const medidor = pick(m, ["medidor"]);
    const localidad = pick(m, ["localidad", "ciudad", "municipio"]);
    let calle = pick(m, ["calle", "street"]);
    let numero = pick(m, ["numero", "número", "num", "altura", "nro"]);
    const direccion = pick(m, ["direccion", "dirección", "domicilio", "direccion_completa"]);
    if ((!calle || !numero) && direccion) {
      const p = parseDireccion(direccion);
      if (!calle) calle = p.calle;
      if (!numero) numero = p.numero;
    }

    const rowLabel = `fila ${args.offset + i + 2} (excel) NIS=${nis} Med=${medidor}`;

    if (localidad.length < 2 || calle.length < 2) {
      failures.push({ row: rowLabel, reason: "falta_localidad_o_calle", localidad, calle, numero });
      console.warn(`[fallo] ${rowLabel} — falta localidad o calle`);
      continue;
    }

    let sociosId = null;
    if (excelId && /^\d+$/.test(excelId) && scCols.has("id")) {
      const idNum = Number(excelId);
      let params = [idNum];
      const { sql: tsql, params: p2 } = tenantClause(scCols, args.tenantId, params);
      params = p2;
      const chk = await query(
        `SELECT id FROM socios_catalogo WHERE id = $1 AND COALESCE(activo, TRUE) = TRUE${tsql} LIMIT 1`,
        params
      );
      sociosId = chk.rows?.[0]?.id ?? null;
    }
    if (sociosId == null) {
      sociosId = await findSociosRowId(args.tenantId, nis, medidor, scCols);
    }
    if (sociosId == null) {
      noMatch++;
      failures.push({ row: rowLabel, reason: "sin_match_socios_catalogo", nis, medidor });
      console.warn(`[fallo] ${rowLabel} — no hay fila en socios_catalogo con ese NIS+medidor (tenant)`);
      continue;
    }

    if (args.skipExisting && (await rowHasCoords(sociosId, scCols, pointCol))) {
      skipped++;
      continue;
    }

    if (args.dryRun) {
      console.log(`[dry-run] ${rowLabel} id=${sociosId} → ${calle} ${numero || "s/n"}, ${localidad}`);
      continue;
    }

    let g = await geocodeWithFallback({
      calle,
      localidad,
      numero: numero || undefined,
      tenantId: args.tenantId,
      retries: 3,
    });

    if (
      !g &&
      args.fallbackLocalidad &&
      process.env.DISABLE_NOMINATIM !== "1" &&
      process.env.DISABLE_NOMINATIM !== "true"
    ) {
      const prov = String(process.env.ENRIQUECER_PROVINCIA || "Entre Ríos").trim();
      const locG = await geocodeAddressArgentina(`${localidad}, ${prov}, Argentina`, {
        filterLocalidad: localidad,
      });
      if (
        locG &&
        Number.isFinite(locG.lat) &&
        Number.isFinite(locG.lng) &&
        Math.abs(locG.lat) > 1e-5 &&
        Math.abs(locG.lng) > 1e-5
      ) {
        g = { lat: locG.lat, lng: locG.lng, fromCache: false };
        console.warn(`[aprox-localidad] ${rowLabel} → ${localidad} (${prov})`);
      }
    }

    if (!g) {
      failures.push({ row: rowLabel, reason: "geocode_null", calle, numero, localidad, socios_id: sociosId });
      console.warn(`[fallo] ${rowLabel} — Nominatim sin resultado tras reintentos`);
      continue;
    }

    try {
      await updateSociosCoords(sociosId, g.lat, g.lng, scCols, pointCol);
      ok++;
      console.log(
        `[ok] ${rowLabel} id=${sociosId} → ${g.lat},${g.lng} cache=${!!g.fromCache} (${calle} ${numero || ""}, ${localidad})`
      );
    } catch (e) {
      failures.push({ row: rowLabel, reason: String(e?.message || e), socios_id: sociosId });
      console.warn(`[fallo] ${rowLabel} — UPDATE: ${e?.message || e}`);
    }
  }

  console.log(
    JSON.stringify({
      archivo: xlsxPath,
      hoja: sheetName,
      tenant_id: args.tenantId,
      filas_leidas: slice.length,
      actualizados: ok,
      omitidos_skip_existing: skipped,
      sin_match_padron: noMatch,
      fallos: failures.length,
      dry_run: args.dryRun,
      detalle_fallos: failures.slice(0, 400),
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
