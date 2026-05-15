/**
 * Asigna aleatoriamente la columna **Dist.** (o **Distribuidor**) de un Excel de socios/catálogo,
 * tomando los códigos y nombres desde un Excel de infraestructura (p. ej. trafos_kva_clientes_prueba.xlsx).
 *
 * Formato escrito en cada fila: `COD - Nombre` (alineado con pedidos / estadísticas de la app).
 *
 * Uso (desde carpeta `api/`):
 *   node scripts/asignarDistribuidoresAleatoriosSociosExcel.mjs
 *   node scripts/asignarDistribuidoresAleatoriosSociosExcel.mjs --distrib="G:/ruta/trafos.xlsx" --socios="C:/ruta/socios.xlsx"
 *   node scripts/asignarDistribuidoresAleatoriosSociosExcel.mjs --out-dir="C:/Users/leave/Downloads" --seed=42
 *   node scripts/asignarDistribuidoresAleatoriosSociosExcel.mjs --format=csv   # solo CSV (por defecto xlsx+csv)
 *
 * Salida: `socios_catalogo_con_distribuidor_<timestamp>.xlsx` y `.csv` (UTF-8 con BOM para Excel).
 *
 * made by leavera77
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const out = {
    distrib: "",
    socios: "",
    outDir: "",
    /** @type {'both'|'xlsx'|'csv'} */
    format: "both",
    seed: null,
    sheetSocios: "",
    sheetDistrib: "",
  };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--distrib="))
      out.distrib = a.slice("--distrib=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--socios="))
      out.socios = a.slice("--socios=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--out-dir="))
      out.outDir = a.slice("--out-dir=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--format="))
      out.format = /** @type {any} */ (String(a.split("=")[1] || "both").toLowerCase());
    else if (a.startsWith("--seed=")) out.seed = Number(a.split("=")[1]);
    else if (a.startsWith("--sheet-socios="))
      out.sheetSocios = a.slice("--sheet-socios=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--sheet-distrib="))
      out.sheetDistrib = a.slice("--sheet-distrib=".length).replace(/^["']|["']$/g, "");
  }
  return out;
}

function defaultDistribPath() {
  const p = path.join("G:", "Mi unidad", "Programas", "trafos_kva_clientes_prueba.xlsx");
  return fs.existsSync(p) ? p : "";
}

function defaultSociosPath() {
  const dir = path.join("C:", "Users", "leave", "Downloads");
  try {
    const files = fs.readdirSync(dir);
    const hit = files.find(
      (f) =>
        /^socios_catalogo_vista_/i.test(f) &&
        (f.endsWith(".xlsx") || f.endsWith(".xls"))
    );
    if (hit) return path.join(dir, hit);
  } catch (_) {
    /* ignore */
  }
  return path.join(dir, "socios_catalogo_vista_2026-05-15 (1).xlsx");
}

/** @param {number|null} seed */
function makeRng(seed) {
  if (seed == null || !Number.isFinite(seed)) return () => Math.random();
  let s = Math.floor(Math.abs(seed)) % 2147483646;
  if (s <= 0) s += 2147483645;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function isDistHeader(cell) {
  const t = String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/u, "");
  return t === "dist" || t === "distribuidor";
}

function findDistribLabelColumns(headerRow) {
  const h = headerRow.map((c) => String(c ?? "").trim());
  let iCod = h.findIndex(
    (x) => (/id/i.test(x) && /distribuidor/i.test(x)) || x.toLowerCase() === "codigo"
  );
  let iNom = h.findIndex((x) => x.toLowerCase() === "nombre");
  if (iCod < 0) iCod = 0;
  if (iNom < 0) iNom = 1;
  return { iCod, iNom };
}

function buildDistribPool(rows, iCod, iNom) {
  const pool = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const cod = String(row[iCod] ?? "")
      .trim()
      .toUpperCase();
    const nom = String(row[iNom] ?? "").trim();
    if (!cod && !nom) continue;
    const label = cod && nom ? `${cod} - ${nom}` : cod || nom;
    pool.push(label);
  }
  return pool;
}

function main() {
  const args = parseArgs();
  const distribPath = args.distrib || defaultDistribPath();
  const sociosPath = args.socios || defaultSociosPath();
  if (!distribPath || !fs.existsSync(distribPath)) {
    console.error("Falta Excel de distribuidores (--distrib=...) o no existe:", distribPath);
    process.exit(1);
  }
  if (!sociosPath || !fs.existsSync(sociosPath)) {
    console.error("Falta Excel de socios (--socios=...) o no existe:", sociosPath);
    process.exit(1);
  }

  const wbD = XLSX.readFile(distribPath);
  const nameD = args.sheetDistrib || wbD.SheetNames[0];
  const wsD = wbD.Sheets[nameD];
  const rowsD = XLSX.utils.sheet_to_json(wsD, { header: 1, defval: "" });
  if (!rowsD.length) {
    console.error("Hoja de distribuidores vacía:", nameD);
    process.exit(1);
  }
  const { iCod, iNom } = findDistribLabelColumns(rowsD[0]);
  const pool = buildDistribPool(rowsD, iCod, iNom);
  if (!pool.length) {
    console.error("No se pudieron leer filas de distribuidores (revisá cabeceras ID Distribuidor / Nombre).");
    process.exit(1);
  }

  const wbS = XLSX.readFile(sociosPath);
  const nameS = args.sheetSocios || wbS.SheetNames[0];
  const wsS = wbS.Sheets[nameS];
  const rowsS = XLSX.utils.sheet_to_json(wsS, { header: 1, defval: "" });
  if (!rowsS.length) {
    console.error("Hoja de socios vacía:", nameS);
    process.exit(1);
  }
  const header = rowsS[0].map((c) => String(c ?? ""));
  const iDist = header.findIndex(isDistHeader);
  if (iDist < 0) {
    console.error(
      'No se encontró columna "Dist." ni "Distribuidor". Cabeceras:',
      header.join(" | ")
    );
    process.exit(1);
  }

  const rnd = makeRng(args.seed);
  let n = 0;
  for (let r = 1; r < rowsS.length; r++) {
    if (!rowsS[r]) rowsS[r] = [];
    while (rowsS[r].length <= iDist) rowsS[r].push("");
    rowsS[r][iDist] = pool[Math.floor(rnd() * pool.length)];
    n++;
  }

  const outDir = args.outDir || path.dirname(sociosPath);
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = `socios_catalogo_con_distribuidor_${ts}`;
  const xlsxPath = path.join(outDir, `${base}.xlsx`);
  const csvPath = path.join(outDir, `${base}.csv`);

  const wsOut = XLSX.utils.aoa_to_sheet(rowsS);
  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, wsOut, nameS.slice(0, 31) || "Socios");

  if (args.format === "both" || args.format === "xlsx") {
    XLSX.writeFile(wbOut, xlsxPath);
    console.log("[ok] xlsx:", xlsxPath);
  }
  if (args.format === "both" || args.format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(wsOut, { FS: ";", RS: "\r\n" });
    const bom = "\uFEFF";
    fs.writeFileSync(csvPath, bom + csv, "utf8");
    console.log("[ok] csv :", csvPath, "(separador ; UTF-8 BOM — abrir en Excel con «Datos → Desde texto/CSV»)");
  }

  console.log(`Filas socios actualizadas: ${n}. Distribuidores en pool: ${pool.length}.`);
}

main();
