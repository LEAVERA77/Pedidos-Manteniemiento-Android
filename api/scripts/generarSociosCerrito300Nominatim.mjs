/**
 * Genera Excel de 300 socios para la localidad Cerrito (Entre Ríos), con coordenadas vía Nominatim.
 * Calles reales desde Overpass (OSM); nombres tipo "Abonado NNNNNN" (sin texto "demo").
 *
 * Uso (desde `api/`):
 *   node scripts/generarSociosCerrito300Nominatim.mjs
 *   node scripts/generarSociosCerrito300Nominatim.mjs --out="../app/src/main/assets/ejemplos/socios-cerrito-300-nominatim.xlsx" --limit=300
 *
 * Requiere red (Overpass + Nominatim). Respeta throttle del cliente (~1,1 s entre llamadas a Nominatim).
 * made by leavera77
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { geocodeAddressArgentina } from "../services/nominatimClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Misma zona que `generate-socios-demo-xlsx.mjs` — Cerrito, Entre Ríos. */
const CERRITO = {
  localidad: "Cerrito",
  provincia: "Entre Ríos",
  south: -31.612,
  west: -60.143,
  north: -31.505,
  east: -60.013,
};

const UA = "GestorNova/1.0 (generarSociosCerrito300; +https://github.com/LEAVERA77/Pedidos-MG)";
const OVERPASS_HOSTS = ["overpass.kumi.systems", "lz4.overpass-api.de", "overpass-api.de"];

const CALLES_FALLBACK = [
  "San Martín", "Mitre", "Belgrano", "Urquiza", "Sarmiento", "Rivadavia", "España", "Moreno",
  "9 de Julio", "25 de Mayo", "Libertad", "Uruguay", "Independencia", "Laprida", "Pellegrini",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function overpassPost(hostname, query) {
  const body = "data=" + encodeURIComponent(query);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: "/api/interpreter",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": UA,
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          if (res.statusCode === 429 || res.statusCode === 504) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 120)}`));
            return;
          }
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.setTimeout(150000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function fetchStreetsCerrito() {
  const z = CERRITO;
  const q = `[out:json][timeout:120];
(
  way["highway"]["name"](${z.south},${z.west},${z.north},${z.east});
);
out center tags;`;

  let lastErr;
  for (const host of OVERPASS_HOSTS) {
    try {
      process.stderr.write(`Overpass ${host}…\n`);
      const j = await overpassPost(host, q);
      const names = new Set();
      for (const el of j.elements || []) {
        const n = el.tags?.name;
        if (!n || typeof n !== "string") continue;
        const t = n.trim();
        if (t.length < 3 || t.length > 85) continue;
        if (/^(RP|RN|Ruta|Autopista|Acceso)\s/i.test(t)) continue;
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        if (lat >= z.south && lat <= z.north && lon >= z.west && lon <= z.east) names.add(t);
      }
      return [...names];
    } catch (e) {
      lastErr = e;
      process.stderr.write(`  → ${e.message}\n`);
      await sleep(4000);
    }
  }
  throw lastErr || new Error("overpass failed");
}

function pickStreets(list, need) {
  const out = [];
  const base = [...list];
  while (out.length < need && base.length) {
    const i = Math.floor(Math.random() * base.length);
    out.push(base.splice(i, 1)[0]);
  }
  let k = 0;
  while (out.length < need && list.length) {
    out.push(list[k % list.length]);
    k++;
  }
  return out.slice(0, need);
}

function parseArgs() {
  const out = { outPath: "", limit: 300 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--out=")) out.outPath = a.slice(6).replace(/^["']|["']$/g, "");
    else if (a.startsWith("--limit=")) out.limit = Math.max(1, Math.min(500, Number(a.split("=")[1]) || 300));
  }
  return out;
}

function coordsOk(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return false;
  return true;
}

async function geocodeCalleNum(calle, numero) {
  const q = `${calle} ${numero}, ${CERRITO.localidad}, ${CERRITO.provincia}, Argentina`;
  const g = await geocodeAddressArgentina(q, {
    filterLocalidad: CERRITO.localidad,
    filterState: CERRITO.provincia,
    filterCalle: calle,
    nominatimLimit: 8,
  });
  if (g && coordsOk(g.lat, g.lng)) return { lat: g.lat, lng: g.lng, postcode: g.postcode || "" };
  return null;
}

async function resolverCoords(calle0, num0, idx, streets) {
  const intentos = [];
  const c0 = String(calle0 || "").trim();
  const n0 = String(num0 ?? "").trim();
  if (c0.length >= 2) intentos.push({ calle: c0, numero: n0 || "100" });
  for (let a = 0; a < 30; a++) {
    const calle = streets[(idx + a * 3) % streets.length];
    const num = String(80 + ((idx * 19 + a * 47) % 1900));
    intentos.push({ calle, numero: num });
  }
  const vistos = new Set();
  for (const { calle, numero } of intentos) {
    const k = `${calle}|${numero}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const r = await geocodeCalleNum(calle, numero);
    if (r) return { ...r, calleUsada: calle, numeroUsado: numero };
  }
  return null;
}

async function main() {
  const args = parseArgs();
  const n = args.limit;
  const outPath =
    args.outPath ||
    path.join(__dirname, "../../app/src/main/assets/ejemplos/socios-cerrito-300-nominatim.xlsx");

  let streets;
  try {
    streets = await fetchStreetsCerrito();
  } catch (e) {
    process.stderr.write(`Overpass falló (${e.message}) — usando calles fallback.\n`);
    streets = [...CALLES_FALLBACK];
  }
  if (streets.length < 5) {
    streets = [...new Set([...streets, ...CALLES_FALLBACK])];
  }
  const picked = pickStreets(streets, n);

  const rows = [];
  const medUsed = new Set();
  let nisBase = 300_000_001;

  function random5Unique() {
    let v;
    do {
      v = String(10000 + Math.floor(Math.random() * 90000));
    } while (medUsed.has(v));
    medUsed.add(v);
    return v;
  }

  for (let i = 0; i < n; i++) {
    const calle = picked[i] || streets[i % streets.length];
    const num = String(50 + ((i * 17) % 1850));
    const nis = String(nisBase++);
    const nombre = `Abonado ${nis}`;
    process.stderr.write(`[${i + 1}/${n}] ${calle} ${num}… `);
    const hit = await resolverCoords(calle, num, i + 1, streets);
    if (!hit) {
      console.error("SIN COORDS");
      process.exit(1);
    }
    console.error(`OK ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}`);
    rows.push({
      NIS: nis,
      Medidor: random5Unique(),
      nombre,
      Calle: hit.calleUsada,
      Numero: hit.numeroUsado,
      localidad: CERRITO.localidad,
      provincia: CERRITO.provincia,
      codigo_postal: hit.postcode || "",
      latitud: hit.lat,
      longitud: hit.lng,
      telefono: "",
      distribuidor_: "DIS01",
      tipo_tarifa: "T1-R1",
      urbano_rural: i % 2 === 0 ? "urbano" : "rural",
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Socios");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(wb, outPath);
  console.log(JSON.stringify({ ok: true, filas: rows.length, salida: outPath, localidad: CERRITO.localidad }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
