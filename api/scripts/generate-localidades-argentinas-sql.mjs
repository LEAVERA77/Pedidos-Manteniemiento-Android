/**
 * Descarga localidades desde Georef (datos.gob.ar) y genera SQL de carga masiva.
 * Uso: desde carpeta api: node scripts/generate-localidades-argentinas-sql.mjs
 * made by leavera77
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = "https://apis.datos.gob.ar/georef/api/localidades";

function normalizarTexto(texto) {
  return String(texto || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sqlStr(s) {
  if (s == null || s === "") return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return "NULL";
  return String(Number(n));
}

async function fetchTodasLocalidades() {
  const todas = [];
  const seen = new Set();
  let inicio = 0;
  const max = 5000;
  let totalEsperado = null;

  for (;;) {
    const url = `${API_BASE}?max=${max}&inicio=${inicio}`;
    process.stderr.write(`Georef GET inicio=${inicio} max=${max}\n`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Georef HTTP ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
    }
    const data = await res.json();
    const locs = data.localidades || [];
    if (totalEsperado == null && data.total != null) totalEsperado = data.total;
    for (const loc of locs) {
      const gid = loc.id != null ? String(loc.id) : null;
      if (gid && seen.has(gid)) continue;
      if (gid) seen.add(gid);
      todas.push(loc);
    }
    const cantidad = data.cantidad ?? locs.length;
    if (locs.length === 0 || cantidad === 0) break;
    inicio += cantidad;
    if (locs.length < max) break;
    if (totalEsperado != null && inicio >= totalEsperado) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  return todas;
}

function filaToValues(loc) {
  const nombre = String(loc.nombre || "").trim();
  const prov = loc.provincia && loc.provincia.nombre != null ? String(loc.provincia.nombre).trim() : "";
  const provId = loc.provincia && loc.provincia.id != null ? parseInt(String(loc.provincia.id), 10) : null;
  const lat = loc.centroide && loc.centroide.lat != null ? Number(loc.centroide.lat) : null;
  const lng = loc.centroide && loc.centroide.lon != null ? Number(loc.centroide.lon) : null;
  const cp =
    loc.codigo_postal != null && String(loc.codigo_postal).trim()
      ? String(loc.codigo_postal).trim().replace(/\D/g, "").slice(0, 8)
      : null;
  const gid = loc.id != null ? String(loc.id) : null;
  const nn = normalizarTexto(nombre);
  const pn = normalizarTexto(prov);
  if (!nombre || !prov || !nn) return null;
  return `(${sqlStr(gid)}, ${sqlStr(nombre)}, ${sqlStr(nn)}, ${sqlStr(prov)}, ${sqlStr(pn)}, ${
    provId != null && Number.isFinite(provId) ? String(provId) : "NULL"
  }, ${sqlNum(lat)}, ${sqlNum(lng)}, ${cp ? sqlStr(cp) : "NULL"})`;
}

function generarSql(localidades) {
  const rows = localidades.map(filaToValues).filter(Boolean);
  const header = `-- ============================================================
-- LOCALIDADES DE ARGENTINA — Georef (datos.gob.ar)
-- Generado: ${new Date().toISOString()}
-- Registros: ${rows.length}
-- Ejecutar DESPUÉS de localidades_argentinas.sql (DDL)
-- made by leavera77
-- ============================================================

BEGIN;

TRUNCATE TABLE localidades_argentinas RESTART IDENTITY;

`;

  const batchSize = 400;
  let body = "";
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    body +=
      `INSERT INTO localidades_argentinas (georef_id, nombre, nombre_normalizado, provincia, provincia_normalizado, provincia_id, lat, lng, codigo_postal) VALUES\n` +
      chunk.join(",\n") +
      ";\n\n";
  }

  const footer = `COMMIT;

ANALYZE localidades_argentinas;
`;

  return header + body + footer;
}

async function main() {
  const localidades = await fetchTodasLocalidades();
  process.stderr.write(`Total localidades únicas: ${localidades.length}\n`);
  const sql = generarSql(localidades);
  const outDir = path.join(__dirname, "..", "db", "migrations");
  const outPath = path.join(outDir, "localidades_argentinas_data.sql");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, sql, "utf8");
  process.stderr.write(`Escrito: ${outPath} (${(sql.length / 1024).toFixed(1)} KB)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
