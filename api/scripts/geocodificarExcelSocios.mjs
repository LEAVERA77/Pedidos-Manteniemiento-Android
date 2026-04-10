/**
 * Lee un Excel de padrón (socios), geocodifica cada fila por dirección (calle, número, localidad)
 * y escribe un .xlsx nuevo con **latitud** y **longitud** en columnas numéricas separadas (WGS84).
 *
 * Proveedores:
 * - **Google Geocoding** si existe `GOOGLE_MAPS_API_KEY` o `GOOGLE_MAPS_GEOCODING_API_KEY` (recomendado para coincidir con Google Maps).
 * - Si no hay clave: **Nominatim** (OSM) vía `geocodeCalleNumeroLocalidadArgentina` (~1 req/s; respetar políticas OSM).
 *
 * Uso (desde carpeta `api/`):
 *   node scripts/geocodificarExcelSocios.mjs --file="G:\\Mi unidad\\Programas\\socios-demo-300-enriquecido.xlsx"
 *   node scripts/geocodificarExcelSocios.mjs --file="..." --out="G:\\...\\salida.xlsx" --limit=50
 *   node scripts/geocodificarExcelSocios.mjs --file="..." --provider=nominatim
 *   node scripts/geocodificarExcelSocios.mjs --file="..." --dry-run --limit=5
 *
 * Variables útiles: `ENRIQUECER_PROVINCIA` (default Entre Ríos), `DISABLE_NOMINATIM=1` fuerza error si no hay Google.
 *
 * made by leavera77
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { geocodeCalleNumeroLocalidadArgentina } from "../services/nominatimClient.js";
import { geocodeAddressArgentina } from "../services/nominatimClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const out = {
    file: "",
    sheet: "",
    outPath: "",
    limit: 0,
    offset: 0,
    dryRun: false,
    skipExisting: false,
    provider: "auto",
    fallbackLocalidad: false,
    googleDelayMs: 120,
  };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-existing") out.skipExisting = true;
    else if (a === "--fallback-localidad") out.fallbackLocalidad = true;
    else if (a.startsWith("--file=")) out.file = a.slice("--file=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--sheet=")) out.sheet = a.slice("--sheet=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--out=")) out.outPath = a.slice("--out=".length).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--limit=")) out.limit = Math.max(0, Number(a.split("=")[1]) || 0);
    else if (a.startsWith("--offset=")) out.offset = Math.max(0, Number(a.split("=")[1]) || 0);
    else if (a.startsWith("--provider=")) out.provider = String(a.split("=")[1] || "auto").toLowerCase();
    else if (a.startsWith("--google-delay-ms="))
      out.googleDelayMs = Math.max(0, Number(a.split("=")[1]) || 120);
  }
  return out;
}

function defaultExcelPath() {
  const candidates = [
    path.join("G:", "Mi unidad", "Programas", "socios-demo-300-enriquecido.xlsx"),
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
  return candidates[0];
}

function defaultOutPath(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}-geocodificado.xlsx`);
}

function normalizeKey(k) {
  return String(k || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function rowToMapFromHeaders(headers, row) {
  const m = {};
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeKey(headers[i]);
    if (key) m[key] = row[i];
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function googleApiKey() {
  return String(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_GEOCODING_API_KEY || "").trim();
}

async function geocodeGoogleAddress(fullAddress) {
  const key = googleApiKey();
  if (!key) return null;
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address", fullAddress);
  u.searchParams.set("key", key);
  u.searchParams.set("region", "ar");
  const res = await fetch(u);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;
  const loc = data.results[0].geometry?.location;
  if (!loc) return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, source: "google" };
}

function coordsUsables(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return false;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
  return true;
}

function findHeaderIndex(headers, aliases) {
  const norm = headers.map((h) => normalizeKey(h));
  for (const a of aliases) {
    const na = normalizeKey(a);
    const ix = norm.indexOf(na);
    if (ix >= 0) return ix;
  }
  return -1;
}

async function geocodeOneRow(m, opts) {
  const localidad = pick(m, ["localidad", "ciudad", "municipio"]);
  let calle = pick(m, ["calle", "street"]);
  let numero = pick(m, ["numero", "número", "num", "altura", "nro"]);
  const direccion = pick(m, ["direccion", "dirección", "domicilio", "direccion_completa"]);
  if ((!calle || !numero) && direccion) {
    const p = parseDireccion(direccion);
    if (!calle) calle = p.calle;
    if (!numero) numero = p.numero;
  }

  const prov = String(process.env.ENRIQUECER_PROVINCIA || "Entre Ríos").trim();

  const useGoogle =
    opts.provider === "google" || (opts.provider === "auto" && !!googleApiKey());
  const nominatimBlocked =
    process.env.DISABLE_NOMINATIM === "1" || process.env.DISABLE_NOMINATIM === "true";

  if (useGoogle) {
    const parts = [
      calle,
      numero ? String(numero) : "",
      localidad,
      prov,
      "Argentina",
    ].filter((x) => String(x || "").trim().length > 0);
    const addr = parts.join(", ");
    if (addr.length < 5) return { err: "falta_direccion" };
    const g = await geocodeGoogleAddress(addr);
    if (g) return g;
    if (opts.provider === "google") return { err: "google_sin_resultado" };
  }

  if (nominatimBlocked && !useGoogle) {
    return { err: "nominatim_desactivado_sin_google" };
  }

  if (localidad.length < 2 || calle.length < 2) {
    return { err: "falta_localidad_o_calle" };
  }

  let g = await geocodeCalleNumeroLocalidadArgentina(localidad, calle, numero || undefined, {
    allowTenantCentroidFallback: true,
    stateOrProvince: prov,
  });

  if (
    !g &&
    opts.fallbackLocalidad &&
    localidad.length >= 2 &&
    !nominatimBlocked
  ) {
    const locG = await geocodeAddressArgentina(`${localidad}, ${prov}, Argentina`, {
      filterLocalidad: localidad,
    });
    if (locG && coordsUsables(locG.lat, locG.lng)) {
      return { lat: locG.lat, lng: locG.lng, source: "nominatim_localidad" };
    }
  }

  if (!g) return { err: "geocode_null" };
  return { lat: g.lat, lng: g.lng, source: "nominatim" };
}

async function main() {
  const args = parseArgs();
  const xlsxPath = args.file || defaultExcelPath();
  if (!fs.existsSync(xlsxPath)) {
    console.error(`No existe el archivo: ${xlsxPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheetName = args.sheet || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.error(`No existe la hoja: ${sheetName}`);
    process.exit(1);
  }

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  if (!aoa.length || !aoa[0]?.length) {
    console.error("Hoja vacía.");
    process.exit(1);
  }

  const headers = aoa[0].map((h) => String(h ?? "").trim());
  let latIdx = findHeaderIndex(headers, ["latitud", "lat", "latitude", "lat_gps"]);
  let lonIdx = findHeaderIndex(headers, ["longitud", "lng", "lon", "longitude", "lng_gps"]);

  if (latIdx < 0) {
    headers.push("latitud");
    latIdx = headers.length - 1;
    for (let r = 1; r < aoa.length; r++) {
      while (aoa[r].length < headers.length) aoa[r].push(null);
      aoa[r][latIdx] = null;
    }
    aoa[0] = headers;
  }
  if (lonIdx < 0) {
    headers.push("longitud");
    lonIdx = headers.length - 1;
    for (let r = 1; r < aoa.length; r++) {
      while (aoa[r].length < headers.length) aoa[r].push(null);
      aoa[r][lonIdx] = null;
    }
    aoa[0] = headers;
  }

  const maxCol = Math.max(headers.length, ...aoa.map((row) => row.length));
  for (let r = 0; r < aoa.length; r++) {
    while (aoa[r].length < maxCol) aoa[r].push(null);
  }

  const outPath = args.outPath || defaultOutPath(xlsxPath);
  const provider =
    args.provider === "google" || args.provider === "nominatim" || args.provider === "auto"
      ? args.provider
      : "auto";

  let ok = 0;
  let skipped = 0;
  let fail = 0;
  const failures = [];

  const rowStart = 1 + args.offset;
  let rowEnd = aoa.length;
  if (args.limit > 0) rowEnd = Math.min(rowEnd, rowStart + args.limit);

  for (let ri = rowStart; ri < rowEnd; ri++) {
    const row = aoa[ri];
    if (!row) continue;
    const m = rowToMapFromHeaders(headers, row);

    const la0 = row[latIdx];
    const lo0 = row[lonIdx];
    if (
      args.skipExisting &&
      coordsUsables(
        typeof la0 === "number" ? la0 : parseFloat(String(la0).replace(",", ".")),
        typeof lo0 === "number" ? lo0 : parseFloat(String(lo0).replace(",", "."))
      )
    ) {
      skipped++;
      continue;
    }

    const label = `fila ${ri + 1} (excel)`;
    if (args.dryRun) {
      const calle = pick(m, ["calle", "street"]);
      const loc = pick(m, ["localidad", "ciudad"]);
      console.log(`[dry-run] ${label} ${calle} · ${loc}`);
      continue;
    }

    const g = await geocodeOneRow(m, { provider, fallbackLocalidad: args.fallbackLocalidad });
    if (g.err) {
      fail++;
      failures.push({ row: ri + 1, reason: g.err });
      console.warn(`[fallo] ${label} — ${g.err}`);
      continue;
    }

    aoa[ri][latIdx] = g.lat;
    aoa[ri][lonIdx] = g.lng;
    ok++;
    console.log(`[ok] ${label} → ${g.lat}, ${g.lng} (${g.source || "?"})`);

    if (g.source === "google") {
      await sleep(args.googleDelayMs);
    }
  }

  if (!args.dryRun) {
    const nws = XLSX.utils.aoa_to_sheet(aoa);
    const outWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(outWb, nws, sheetName.slice(0, 31) || "Socios");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    XLSX.writeFile(outWb, outPath);
    console.log(`Escrito: ${outPath}`);
  }

  console.log(
    JSON.stringify({
      entrada: xlsxPath,
      salida: args.dryRun ? null : outPath,
      hoja: sheetName,
      filas_procesadas: Math.max(0, rowEnd - rowStart),
      ok,
      omitidos_skip_existing: skipped,
      fallos: fail,
      proveedor_solicitado: provider,
      google_configurado: !!googleApiKey(),
      dry_run: args.dryRun,
      muestra_fallos: failures.slice(0, 30),
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
