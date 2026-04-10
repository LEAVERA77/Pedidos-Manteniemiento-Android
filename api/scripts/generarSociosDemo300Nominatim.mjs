/**
 * Genera `socios-demo-300-nominatim-verificado.xlsx` a partir del Excel de referencia
 * (misma estructura que el padrón: columnas tipo NIS, Calle, localidad, etc.).
 *
 * Por cada fila:
 * 1) Geocodifica la dirección del propio Excel (calle + número + localidad).
 * 2) Si Nominatim no devuelve punto, prueba combinaciones alternativas (calles típicas + número).
 * 3) Si tras todos los intentos sigue fallando, aborta (no escribe filas sin coordenadas).
 *
 * Respeta el rate limit de Nominatim (~1,1 s entre llamadas salvo `NOMINATIM_THROTTLE_MS_FOR_TESTS=0` en pruebas).
 *
 * Uso (desde `api/`):
 *   node scripts/generarSociosDemo300Nominatim.mjs
 *   node scripts/generarSociosDemo300Nominatim.mjs --ref="../app/src/main/assets/ejemplos/socios-demo-300.xlsx" --out="../app/src/main/assets/ejemplos/socios-demo-300-nominatim-verificado.xlsx"
 *   node scripts/generarSociosDemo300Nominatim.mjs --limit=30
 *
 * Nota: no requiere Neon; solo `api/services/nominatimClient.js`. Para poblar `geocodificacion_cache`
 * podés correr después `npm run geocodificar:excel-socios -- --file=... --skip-existing`.
 *
 * made by leavera77
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { geocodeAddressArgentina } from "../services/nominatimClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CALLES_ALT = [
  "San Martín",
  "Mitre",
  "Belgrano",
  "Urquiza",
  "Sarmiento",
  "Rivadavia",
  "España",
  "Moreno",
  "9 de Julio",
  "25 de Mayo",
  "Libertad",
  "Uruguay",
];

function parseArgs() {
  const out = { ref: "", outPath: "", limit: 300 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--ref=")) out.ref = a.slice(6).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--out=")) out.outPath = a.slice(6).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--limit=")) out.limit = Math.max(1, Math.min(300, Number(a.split("=")[1]) || 300));
  }
  return out;
}

function defaultRefPath() {
  return path.join(__dirname, "../../app/src/main/assets/ejemplos/socios-demo-300.xlsx");
}

function defaultOutPath() {
  return path.join(__dirname, "../../app/src/main/assets/ejemplos/socios-demo-300-nominatim-verificado.xlsx");
}

function coordsUsables(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return false;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
  return true;
}

async function geocodeUna(calle, numero, localidad) {
  const prov = String(process.env.ENRIQUECER_PROVINCIA || "Entre Ríos").trim();
  const numS = numero != null && String(numero).trim() ? String(numero).trim() : "";
  const q = [calle, numS, localidad, prov, "Argentina"].filter((x) => String(x || "").trim().length).join(", ");
  /* Una consulta `q=` por intento (evita 429 por doble llamada). */
  const g = await geocodeAddressArgentina(q);
  if (g && coordsUsables(g.lat, g.lng)) return { lat: g.lat, lng: g.lng };
  return null;
}

async function resolverDireccionConCoords(localidad, calle0, num0, idx) {
  const intentos = [];
  const c0 = String(calle0 || "").trim();
  const n0 = String(num0 ?? "").trim();
  if (c0.length >= 2 && localidad.length >= 2) intentos.push({ calle: c0, numero: n0 || undefined });
  for (let a = 0; a < 22; a++) {
    const calle = CALLES_ALT[(idx + a * 2) % CALLES_ALT.length];
    const num = String(350 + ((idx * 17 + a * 41) % 1650));
    intentos.push({ calle, numero: num });
  }
  const vistos = new Set();
  for (const { calle, numero } of intentos) {
    const k = `${calle}|${numero || ""}|${localidad}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const r = await geocodeUna(calle, numero, localidad);
    if (r) return { lat: r.lat, lng: r.lng, calleUsada: calle, numeroUsado: numero || "" };
  }
  return null;
}

async function main() {
  const args = parseArgs();
  const refPath = args.ref || defaultRefPath();
  const outPath = args.outPath || defaultOutPath();
  const maxRows = args.limit;

  if (!fs.existsSync(refPath)) {
    console.error(`No existe: ${refPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(refPath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  const n = Math.min(rows.length, maxRows);

  const salida = [];
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const loc = String(r.localidad ?? r.Localidad ?? "").trim();
    const calle = String(r.Calle ?? r.calle ?? "").trim();
    const num = String(r.Numero ?? r.numero ?? "").trim();
    if (!loc) {
      console.error(`Fila ${i + 2}: sin localidad`);
      process.exit(1);
    }
    process.stdout.write(`[${i + 1}/${n}] ${loc} ${calle} ${num}… `);
    const hit = await resolverDireccionConCoords(loc, calle, num, i + 1);
    if (!hit) {
      console.error("\nSin resultado Nominatim.");
      process.exit(1);
    }
    console.log(`OK → ${hit.lat}, ${hit.lng}`);
    const rowOut = { ...r };
    if (hit.calleUsada && String(hit.calleUsada) !== calle) rowOut.Calle = hit.calleUsada;
    if (hit.numeroUsado != null && String(hit.numeroUsado) !== num) rowOut.Numero = hit.numeroUsado;
    rowOut.latitud = hit.lat;
    rowOut.longitud = hit.lng;
    salida.push(rowOut);
  }

  const outWs = XLSX.utils.json_to_sheet(salida);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, outWs, sheetName.slice(0, 31) || "Socios");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(outWb, outPath);
  console.log(JSON.stringify({ salida: outPath, filas: n, referencia: refPath }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
