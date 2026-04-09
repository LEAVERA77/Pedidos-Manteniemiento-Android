/**
 * Lee un Excel de padrón, cruza con socios_catalogo en Neon y escribe un nuevo .xlsx
 * con columnas latitud y longitud tomadas de la base (misma lógica de match que enriquecerPadronDesdeExcel).
 *
 * Uso (desde api/):
 *   node scripts/exportarPadronEnriquecidoExcel.mjs --tenant-id=1 --file="G:\ruta\socios-demo-300.xlsx"
 *   node scripts/exportarPadronEnriquecidoExcel.mjs --tenant-id=1 --out="G:\ruta\salida.xlsx"
 *
 * made by leavera77
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { query } from "../db/neon.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const out = { tenantId: null, file: "", sheet: "", outPath: "", limit: 0, offset: 0 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--tenant-id=")) out.tenantId = Number(a.split("=")[1]);
    else if (a.startsWith("--file=")) out.file = a.slice("--file=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--sheet=")) out.sheet = a.slice("--sheet=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--out=")) out.outPath = a.slice("--out=".length).replace(/^["']|["']$/g, "");
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

function defaultOutPath(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}-enriquecido.xlsx`);
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

function findPointColumnName(meta) {
  const candidates = ["coordenadas", "ubicacion", "punto", "geom", "location", "gps"];
  for (const c of candidates) {
    if (!meta.set.has(c)) continue;
    const t = meta.types[c];
    if (t && String(t.udt_name || "").toLowerCase() === "point") return c;
  }
  return null;
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
    return r.rows?.[0]?.id ?? null;
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
    return r.rows?.[0]?.id ?? null;
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
      if (r.rows?.[0]?.id != null) return r.rows[0].id;
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
      if (r.rows?.[0]?.id != null) return r.rows[0].id;
    }
  }

  return null;
}

function normalizeCoordPair(la, lo) {
  const a = Number(la);
  const b = Number(lo);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { latitud: a, longitud: b };
}

async function fetchCoordsForId(id, cols, pointCol) {
  const latX = sqlLatExpr(cols, "s");
  const lngX = sqlLngExpr(cols, "s");
  if (latX && lngX) {
    const r = await query(
      `SELECT ${latX} AS la, ${lngX} AS lo FROM socios_catalogo s WHERE s.id = $1`,
      [id]
    );
    const row = r.rows?.[0];
    return normalizeCoordPair(row?.la, row?.lo);
  }
  if (pointCol) {
    const qc = `"${String(pointCol).replace(/"/g, '""')}"`;
    const r = await query(
      `SELECT (${qc})[1]::double precision AS la, (${qc})[0]::double precision AS lo FROM socios_catalogo WHERE id = $1`,
      [id]
    );
    const row = r.rows?.[0];
    return normalizeCoordPair(row?.la, row?.lo);
  }
  return null;
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
      "Uso: node scripts/exportarPadronEnriquecidoExcel.mjs --tenant-id=N [--file=entrada.xlsx] [--out=salida.xlsx] [--sheet=Nombre] [--limit=N] [--offset=N]"
    );
    process.exit(1);
  }

  const xlsxPath = args.file || defaultExcelPath();
  if (!fs.existsSync(xlsxPath)) {
    console.error(`No existe el archivo: ${xlsxPath}`);
    process.exit(1);
  }

  const outPath = args.outPath || defaultOutPath(xlsxPath);

  if (!(await tableExists("socios_catalogo"))) {
    console.error("No existe tabla socios_catalogo.");
    process.exit(1);
  }

  const scCols = await columnas("socios_catalogo");
  const canMatch =
    (scCols.has("nis") && scCols.has("medidor")) ||
    scCols.has("nis_medidor") ||
    scCols.has("nis");
  if (!canMatch) {
    console.error("socios_catalogo: sin columnas para cruzar NIS/medidor.");
    process.exit(1);
  }

  const scMeta = await columnasTablaMeta("socios_catalogo");
  const pointCol = findPointColumnName(scMeta);
  const hasCoords = (sqlLatExpr(scCols, "s") && sqlLngExpr(scCols, "s")) || pointCol;
  if (!hasCoords) {
    console.error(
      "socios_catalogo no tiene latitud/longitud (ni lat/lng) ni columna point; no hay coords que exportar."
    );
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheetName = args.sheet || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.error(`Hoja no encontrada: ${sheetName}. Disponibles: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const slice = rows.slice(args.offset, args.limit > 0 ? args.offset + args.limit : undefined);

  let conCoords = 0;
  let sinCoords = 0;
  let sinMatch = 0;

  const outRows = [];
  for (let i = 0; i < slice.length; i++) {
    const raw = { ...slice[i] };
    const m = rowToMap(raw);
    const excelId = pick(m, ["id", "socios_id", "id_socios"]);
    const nis = pick(m, ["nis"]);
    const medidor = pick(m, ["medidor"]);

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

    let latitud = "";
    let longitud = "";
    if (sociosId == null) {
      sinMatch++;
    } else {
      const c = await fetchCoordsForId(sociosId, scCols, pointCol);
      if (c) {
        latitud = c.latitud;
        longitud = c.longitud;
        conCoords++;
      } else {
        sinCoords++;
      }
    }

    raw.latitud = latitud;
    raw.longitud = longitud;
    outRows.push(raw);
  }

  const outWs = XLSX.utils.json_to_sheet(outRows);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, outWs, sheetName.slice(0, 31) || "Socios");
  XLSX.writeFile(outWb, outPath);

  const summary = {
    entrada: xlsxPath,
    salida: outPath,
    hoja: sheetName,
    tenant_id: args.tenantId,
    filas_exportadas: outRows.length,
    con_coordenadas_en_bd: conCoords,
    sin_coordenadas_en_bd: sinCoords,
    sin_match_padron: sinMatch,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
