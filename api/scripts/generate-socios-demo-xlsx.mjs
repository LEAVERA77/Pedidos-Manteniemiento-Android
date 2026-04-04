/**
 * Genera socios-demo-300.xlsx con domicilios basados en calles reales (Overpass/OSM).
 * Ejecutar desde carpeta api: node scripts/generate-socios-demo-xlsx.mjs
 */
import XLSX from "xlsx";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UA = "GestorNova/1.0 (socios demo generator; https://github.com/LEAVERA77/Pedidos-MG)";

const CIUDADES = [
  { localidad: "Cerrito", lat: -32.034, lon: -58.754 },
  { localidad: "María Grande", lat: -32.17, lon: -60.048 },
  { localidad: "Hasenkamp", lat: -31.512, lon: -58.302 },
  { localidad: "Aldea Santa María", lat: -31.719, lon: -59.982 },
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpsPostJson(hostname, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": typeof body === "string" ? "application/x-www-form-urlencoded" : "application/json",
          "Content-Length": Buffer.byteLength(data),
          "User-Agent": UA,
          ...headers,
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
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
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function fetchStreetNames(lat, lon, radiusM = 9000) {
  const q = `[out:json][timeout:120];
(
  way["highway"]["name"](around:${radiusM},${lat},${lon});
);
out tags;`;
  const j = await httpsPostJson("overpass-api.de", "/api/interpreter", "data=" + encodeURIComponent(q));
  const names = new Set();
  for (const el of j.elements || []) {
    const n = el.tags?.name;
    if (!n || typeof n !== "string") continue;
    const t = n.trim();
    if (t.length < 3 || t.length > 80) continue;
    if (/^(RP|RN|Ruta|Autopista|Acceso)\s/i.test(t)) continue;
    names.add(t);
  }
  return [...names];
}

function pickStreets(list, need) {
  const out = [];
  const base = [...list];
  while (out.length < need) {
    if (!base.length) break;
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
  const rows = [];
  let nisBase = 700_000_001;
  const dists = ["DIS01", "DIS02", "DIS03", "DIS04", "DIS05"];
  const tarifas = ["T1-R1", "T1-R2", "T2-R1", "T2-GM", "T3-BT"];
  const zonas = ["urbano", "rural"];

  return (async () => {
    const allStreets = {};
    for (const c of CIUDADES) {
      process.stderr.write(`Overpass: calles cerca de ${c.localidad}…\n`);
      try {
        allStreets[c.localidad] = await fetchStreetNames(c.lat, c.lon);
        process.stderr.write(`  → ${allStreets[c.localidad].length} nombres únicos\n`);
      } catch (e) {
        process.stderr.write(`  falló: ${e.message}\n`);
        allStreets[c.localidad] = [];
      }
      await sleep(2500);
    }

    let idx = 0;
    for (const c of CIUDADES) {
      let streets = allStreets[c.localidad] || [];
      if (streets.length < 10) {
        streets = [
          "San Martín", "Mitre", "Belgrano", "Moreno", "Urquiza", "Sarmiento", "Rivadavia", "Independencia",
          "9 de Julio", "25 de Mayo", "España", "Italia", "Garay", "Alvear", "Laprida",
        ];
      }
      const picked = pickStreets(streets, N_PER_CITY);
      for (let j = 0; j < N_PER_CITY; j++) {
        const calle = picked[j] || `Calle ${j + 1}`;
        const alt = 50 + ((idx * 13 + j * 7) % 1950);
        const domicilio = `${alt} ${calle}`;
        rows.push({
          nis_medidor: String(nisBase++),
          nombre: fakeNombre(idx),
          domicilio,
          telefono: `0344${String(4000000 + idx).slice(-7)}`,
          distribuidor_codigo: dists[idx % dists.length],
          localidad: c.localidad,
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
    process.stderr.write(`Escrito: ${outPath} (${rows.length} filas)\n`);
  })();
}

main();
