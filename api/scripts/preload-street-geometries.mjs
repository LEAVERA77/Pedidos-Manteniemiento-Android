/**
 * Precarga geometrías de calles en `calles_geometrias` a partir de pedidos recientes.
 * Uso (desde carpeta api): node scripts/preload-street-geometries.mjs [--limit=500] [--days=30] [--pause-ms=2000]
 * Overpass: entre variantes de nombre ya hay pausa (OVERPASS_GAP_BETWEEN_QUERIES_MS, default 2000).
 * Entre calles usá --pause-ms alto (p. ej. 3000–5000) si ves HTTP 429.
 *
 * made by leavera77
 */
import "dotenv/config";
import { query } from "../db/neon.js";
import { obtenerGeometriaCalleCacheada } from "../services/streetGeometryCache.js";

function parseArgs() {
  const out = { limit: 500, days: 30, pauseMs: 2000 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--limit=")) out.limit = Math.max(1, Number(a.split("=")[1]) || 500);
    if (a.startsWith("--days=")) out.days = Math.max(1, Number(a.split("=")[1]) || 30);
    if (a.startsWith("--pause-ms=")) out.pauseMs = Math.max(0, Number(a.split("=")[1]) || 2000);
  }
  return out;
}

async function main() {
  const { limit, days, pauseMs } = parseArgs();
  const r = await query(
    `SELECT DISTINCT
        cliente_calle AS calle,
        cliente_localidad AS localidad,
        provincia
     FROM pedidos
     WHERE cliente_calle IS NOT NULL
       AND TRIM(cliente_calle) <> ''
       AND cliente_localidad IS NOT NULL
       AND TRIM(cliente_localidad) <> ''
       AND fecha_creacion > NOW() - ($1::int * INTERVAL '1 day')
     LIMIT $2`,
    [days, limit]
  );

  const rows = r.rows || [];
  console.log(
    `[preload-street-geometries] ${rows.length} filas (últimos ${days} días, limit ${limit}); pausa entre calles ${pauseMs}ms; OVERPASS_GAP_BETWEEN_QUERIES_MS=${process.env.OVERPASS_GAP_BETWEEN_QUERIES_MS || "2000 (default)"}`
  );

  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const prov = row.provincia != null ? String(row.provincia).trim() : "";
    const res = await obtenerGeometriaCalleCacheada(row.calle, row.localidad, prov);
    if (res.hit) {
      ok += 1;
      console.log(`OK  ${row.calle} | ${row.localidad} | ${Math.round(res.longitudTotal || 0)} m (${res.source})`);
    } else {
      fail += 1;
      console.log(
        `—   ${row.calle} | ${row.localidad} (sin geometría o Overpass 429/timeout tras reintentos — subí --pause-ms o esperá unos minutos)`
      );
    }
    if (pauseMs > 0) {
      await new Promise((r2) => setTimeout(r2, pauseMs));
    }
  }
  console.log(`[preload-street-geometries] fin: ${ok} con geometría, ${fail} sin datos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
