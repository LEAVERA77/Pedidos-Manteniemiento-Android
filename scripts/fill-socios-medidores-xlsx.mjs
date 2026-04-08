/**
 * Excel socios: pasa de nis_medidor a columnas NIS + Medidor, o rellena Medidor vacío.
 * Medidor = 5 cifras numéricas aleatorias, únicas en el archivo.
 * Uso: node scripts/fill-socios-medidores-xlsx.mjs [ruta.xlsx ...]
 * Sin argumentos: app/src/main/assets/ejemplos/socios-demo-300.xlsx
 * made by leavera77
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const XLSX = require(resolve(__dirname, "../api/node_modules/xlsx"));

const root = resolve(__dirname, "..");
const defaultPath = resolve(root, "app/src/main/assets/ejemplos/socios-demo-300.xlsx");

function random5Unique(used) {
  let v;
  do {
    v = String(10000 + Math.floor(Math.random() * 90000));
  } while (used.has(v));
  used.add(v);
  return v;
}

function normalizar(k) {
  let s = String(k || "")
    .trim()
    .toLowerCase();
  try {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}
  return s.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function processWorkbook(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  if (!rows.length) return null;

  const used = new Set();
  const keys = Object.keys(rows[0]);
  const hasNisMed = keys.some((k) => normalizar(k) === "nis_medidor");
  const hasNis = keys.some((k) => normalizar(k) === "nis");
  const hasMed = keys.some((k) => normalizar(k) === "medidor");

  const aoa = [];

  if (hasNis && hasMed) {
    aoa.push(keys);
    for (const row of rows) {
      const line = keys.map((h) => {
        if (normalizar(h) === "medidor") {
          const t = row[h] != null ? String(row[h]).trim() : "";
          return t || random5Unique(used);
        }
        return row[h];
      });
      aoa.push(line);
    }
  } else if (hasNisMed) {
    const rest = keys.filter((k) => normalizar(k) !== "nis_medidor");
    aoa.push(["NIS", "Medidor", ...rest]);
    const nmKey = keys.find((k) => normalizar(k) === "nis_medidor");
    for (const row of rows) {
      const nm = String(row[nmKey] ?? "").trim();
      aoa.push([nm, random5Unique(used), ...rest.map((k) => row[k])]);
    }
  } else {
    return null;
  }

  const out = XLSX.utils.aoa_to_sheet(aoa);
  const nCol = aoa[0].length;
  out["!cols"] = Array.from({ length: nCol }, (_, i) => ({ wch: i < 2 ? 12 : 14 }));
  return out;
}

function processFile(absPath) {
  if (!existsSync(absPath)) {
    console.error("No existe:", absPath);
    return false;
  }
  const wb = XLSX.read(readFileSync(absPath), { type: "buffer" });
  const newSheet = processWorkbook(wb);
  if (!newSheet) {
    console.error("Formato no reconocido (hace falta nis_medidor o nis+medidor):", absPath);
    return false;
  }
  wb.Sheets[wb.SheetNames[0]] = newSheet;
  XLSX.writeFile(wb, absPath);
  console.log("OK:", absPath);
  return true;
}

const paths =
  process.argv.length > 2 ? process.argv.slice(2).map((p) => resolve(p)) : [defaultPath];
let ok = 0;
for (const p of paths) {
  if (processFile(p)) ok++;
}
if (!ok) process.exit(1);
