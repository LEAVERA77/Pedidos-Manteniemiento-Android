/**
 * Genera socios-demo-300.xlsx: columnas NIS + Medidor (5 cifras), Calle + Numero, OSM vía Overpass.
 * Ejecutar: cd api && node scripts/generate-socios-demo-xlsx.mjs
 */
import XLSX from "xlsx";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UA = "GestorNova/1.0 (socios demo; +https://github.com/LEAVERA77/Pedidos-MG)";

/** BBoxes (south, west, north, east) desde Nominatim (admin boundaries). */
const ZONAS = [
  { localidad: "Cerrito", south: -31.612, west: -60.143, north: -31.505, east: -60.013 },
  { localidad: "María Grande", south: -31.711, west: -59.965, north: -31.625, east: -59.812 },
  { localidad: "Hasenkamp", south: -31.559, west: -59.917, north: -31.486, east: -59.745 },
  { localidad: "Aldea Santa María", south: -31.635, west: -60.028, north: -31.591, east: -59.987 },
];

const N_PER_CITY = 75;

const NOMBRES = [
  "Ana", "Beatriz", "Carlos", "Daniela", "Esteban", "Florencia", "Gustavo", "Helena", "Iván", "Julia",
  "Karina", "Lucas", "Mariana", "Nicolás", "Olga", "Pablo", "Romina", "Sergio", "Teresa", "Ulises",
  "Valeria", "Walter", "Ximena", "Yamila", "Zulema", "Andrés", "Brenda", "Cecilia", "Diego", "Elena",
];

const APELLIDOS = [
  "García", "Rodríguez", "Martínez", "López", "Fernández", "González", "Pérez", "Sánchez", "Romero", "Díaz",
  "Torres", "Ruiz", "Ramírez", "Flores", "Acosta", "Benítez", "Castro", "Duarte", "Espósito", "Ferreyra",
];

const OVERPASS_HOSTS = ["overpass.kumi.systems", "lz4.overpass-api.de", "overpass-api.de"];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function random5Unique(used) {
  let v;
  do {
    v = String(10000 + Math.floor(Math.random() * 90000));
  } while (used.has(v));
  used.add(v);
  return v;
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

async function fetchAllStreets() {
  const parts = ZONAS.map(
    (z) =>
      `way["highway"]["name"](${z.south},${z.west},${z.north},${z.east});`
  ).join("\n  ");
  const q = `[out:json][timeout:180];
(
  ${parts}
);
out center tags;`;

  let lastErr;
  for (const host of OVERPASS_HOSTS) {
    try {
      process.stderr.write(`Overpass ${host}…\n`);
      const j = await overpassPost(host, q);
      const byCity = {};
      for (const z of ZONAS) byCity[z.localidad] = new Set();

      for (const el of j.elements || []) {
        const n = el.tags?.name;
        if (!n || typeof n !== "string") continue;
        const t = n.trim();
        if (t.length < 3 || t.length > 85) continue;
        if (/^(RP|RN|Ruta|Autopista|Acceso)\s/i.test(t)) continue;
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        for (const z of ZONAS) {
          if (lat >= z.south && lat <= z.north && lon >= z.west && lon <= z.east) {
            byCity[z.localidad].add(t);
            break;
          }
        }
      }

      const out = {};
      for (const z of ZONAS) {
        out[z.localidad] = [...byCity[z.localidad]];
      }
      return out;
    } catch (e) {
      lastErr = e;
      process.stderr.write(`  → ${e.message}\n`);
      await sleep(5000);
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

function fakeNombre(idx) {
  return `${NOMBRES[idx % NOMBRES.length]} ${APELLIDOS[(idx * 7) % APELLIDOS.length]} (demo ${idx + 1})`;
}

function main() {
  const FALLBACK = [
    "San Martín", "Mitre", "Belgrano", "Moreno", "Urquiza", "Sarmiento", "Rivadavia", "Independencia",
    "9 de Julio", "25 de Mayo", "España", "Italia", "Garay", "Alvear", "Laprida", "Pellegrini", "Avenida Argentina",
  ];

  return (async () => {
    let byLocalidad;
    try {
      byLocalidad = await fetchAllStreets();
    } catch (e) {
      process.stderr.write(`Overpass total fallo: ${e.message} — usando calles genéricas AR.\n`);
      byLocalidad = Object.fromEntries(ZONAS.map((z) => [z.localidad, [...FALLBACK]]));
    }

    const rows = [];
    const medUsed = new Set();
    let nisBase = 700_000_001;
    const dists = ["DIS01", "DIS02", "DIS03", "DIS04", "DIS05"];
    const tarifas = ["T1-R1", "T1-R2", "T2-R1", "T2-GM", "T3-BT"];
    const zonas = ["urbano", "rural"];

    let idx = 0;
    for (const z of ZONAS) {
      let streets = byLocalidad[z.localidad] || [];
      if (streets.length < 8) {
        process.stderr.write(`Pocas calles OSM para ${z.localidad} (${streets.length}) — mezclando fallback.\n`);
        streets = [...new Set([...streets, ...FALLBACK])];
      }
      const picked = pickStreets(streets, N_PER_CITY);
      for (let j = 0; j < N_PER_CITY; j++) {
        const calle = picked[j] || `Calle ${j + 1}`;
        const alt = 50 + ((idx * 13 + j * 7) % 1950);
        rows.push({
          NIS: String(nisBase++),
          Medidor: random5Unique(medUsed),
          nombre: fakeNombre(idx),
          Calle: calle,
          Numero: String(alt),
          telefono: `0344${String(4000000 + idx).slice(-7)}`,
          distribuidor_: dists[idx % dists.length],
          localidad: z.localidad,
          tipo_tarifa: tarifas[idx % tarifas.length],
          urbano_rural: zonas[idx % 2],
          transformador: `TR-${String(100 + (idx % 900)).padStart(3, "0")}`,
        });
        idx++;
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Socios");
    const outDir = path.join(__dirname, "../../app/src/main/assets/ejemplos");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "socios-demo-300.xlsx");
    XLSX.writeFile(wb, outPath);
    process.stderr.write(`OK ${outPath} (${rows.length} filas)\n`);
  })();
}

main();
