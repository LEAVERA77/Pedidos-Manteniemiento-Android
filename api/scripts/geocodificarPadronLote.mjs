/**
 * Geocodificar filas del padrón sin coordenadas válidas (corrida única o mantenimiento).
 * Usa geocodificacion_cache + Nominatim con throttle/reintentos (desactivar con DISABLE_NOMINATIM).
 * Ver también: scripts/geocodificarPadron.js (alias).
 *
 * Uso (desde carpeta api):
 *   node scripts/geocodificarPadronLote.mjs --tenant-id=1 [--limit=500] [--dry-run] [--table=socios|cf|all]
 *
 * made by leavera77
 */
import "dotenv/config";
import { query } from "../db/neon.js";
import { geocodeWithFallback } from "../services/geocodeWithFallback.js";
import { ensureCacheGeocodificacionTable } from "../services/cacheGeocodificacion.js";

function parseArgs() {
  const out = { tenantId: null, limit: 500, dryRun: false, table: "all" };
  for (const a of process.argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--tenant-id=")) out.tenantId = Number(a.split("=")[1]);
    else if (a.startsWith("--limit=")) out.limit = Math.max(1, Number(a.split("=")[1]) || 500);
    else if (a.startsWith("--table=")) out.table = String(a.split("=")[1]).toLowerCase();
  }
  return out;
}

async function columnas(name) {
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return new Set((r.rows || []).map((c) => c.column_name));
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

function coordsInvalidWhere(latX, lngX) {
  return `(
    ${latX} IS NULL OR ${lngX} IS NULL
    OR (ABS(${latX}) < 0.00001 AND ABS(${lngX}) < 0.00001)
  )`;
}

async function fetchSociosSinCoords(tenantId, limit, cols) {
  const latX = sqlLatExpr(cols, "s");
  const lngX = sqlLngExpr(cols, "s");
  if (!latX || !lngX || !cols.has("calle") || !cols.has("localidad")) return [];

  const tenantCol = cols.has("cliente_id")
    ? "cliente_id"
    : cols.has("tenant_id")
      ? "tenant_id"
      : null;

  const params = [];
  let p = 1;
  let tenantCond = "TRUE";
  if (tenantCol) {
    tenantCond = `(s.${tenantCol} IS NULL OR s.${tenantCol} = $${p})`;
    params.push(tenantId);
    p++;
  }

  params.push(limit);
  const limParam = `$${p}`;
  const inv = coordsInvalidWhere(latX, lngX);
  const cpSelect = cols.has("codigo_postal")
    ? `TRIM(COALESCE(s.codigo_postal::text, ''))`
    : `''::text`;

  const sql = `
    SELECT s.id,
           TRIM(COALESCE(s.calle, '')) AS calle,
           TRIM(COALESCE(s.localidad, '')) AS localidad,
           TRIM(COALESCE(s.numero::text, '')) AS numero,
           ${cpSelect} AS codigo_postal
    FROM socios_catalogo s
    WHERE COALESCE(s.activo, TRUE) = TRUE
      AND ${tenantCond}
      AND LENGTH(TRIM(COALESCE(s.calle, ''))) >= 2
      AND LENGTH(TRIM(COALESCE(s.localidad, ''))) >= 2
      AND ${inv}
    ORDER BY s.id
    LIMIT ${limParam}
  `;
  const r = await query(sql, params);
  return r.rows || [];
}

async function updateSociosCoords(id, lat, lng, cols) {
  if (cols.has("latitud") && cols.has("longitud")) {
    await query(
      `UPDATE socios_catalogo SET latitud = $1::numeric, longitud = $2::numeric WHERE id = $3`,
      [lat, lng, id]
    );
  } else if (cols.has("lat") && cols.has("lng")) {
    await query(`UPDATE socios_catalogo SET lat = $1::numeric, lng = $2::numeric WHERE id = $3`, [
      lat,
      lng,
      id,
    ]);
  } else {
    throw new Error("socios_catalogo: sin latitud/longitud ni lat/lng");
  }
}

async function fetchCfSinCoords(tenantId, limit, cols) {
  const latX = sqlLatExpr(cols, "c");
  const lngX = sqlLngExpr(cols, "c");
  if (!latX || !lngX || !cols.has("calle") || !cols.has("localidad")) return [];
  const inv = coordsInvalidWhere(latX, lngX);

  const r = await query(
    `
    SELECT c.id,
           TRIM(COALESCE(c.calle, '')) AS calle,
           TRIM(COALESCE(c.localidad, '')) AS localidad,
           TRIM(COALESCE(c.numero::text, '')) AS numero,
           ''::text AS codigo_postal
    FROM clientes_finales c
    WHERE c.cliente_id = $1
      AND COALESCE(c.activo, TRUE) = TRUE
      AND LENGTH(TRIM(COALESCE(c.calle, ''))) >= 2
      AND LENGTH(TRIM(COALESCE(c.localidad, ''))) >= 2
      AND ${inv}
    ORDER BY c.id
    LIMIT $2
  `,
    [tenantId, limit]
  );
  return r.rows || [];
}

async function updateCfCoords(id, lat, lng, cols) {
  if (cols.has("latitud") && cols.has("longitud")) {
    await query(
      `UPDATE clientes_finales SET latitud = $1::numeric, longitud = $2::numeric WHERE id = $3`,
      [lat, lng, id]
    );
  } else if (cols.has("lat") && cols.has("lng")) {
    await query(`UPDATE clientes_finales SET lat = $1::numeric, lng = $2::numeric WHERE id = $3`, [
      lat,
      lng,
      id,
    ]);
  } else {
    throw new Error("clientes_finales: sin columnas de coordenadas conocidas");
  }
}

async function tableExists(name) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rows.length > 0;
}

async function processRows(rows, label, dryRun, tenantId, updateFn) {
  const failures = [];
  let ok = 0;
  for (const row of rows) {
    const calle = row.calle || "";
    const loc = row.localidad || "";
    const num = row.numero || "";
    const cp = row.codigo_postal || "";
    if (calle.length < 2 || loc.length < 2) {
      failures.push({ id: row.id, reason: "calle/localidad corta", calle, localidad: loc });
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] ${label} id=${row.id} ${calle} ${num} ${loc}`);
      continue;
    }
    const g = await geocodeWithFallback({
      calle,
      localidad: loc,
      numero: num || undefined,
      codigoPostal: cp || undefined,
      tenantId,
      retries: 2,
    });
    if (!g) {
      failures.push({ id: row.id, reason: "geocode_null", calle, localidad: loc, numero: num });
      console.warn(`[fallo] ${label} id=${row.id} ${calle} ${num} ${loc}`);
      continue;
    }
    try {
      await updateFn(row.id, g.lat, g.lng);
      ok++;
      console.log(`[ok] ${label} id=${row.id} ${calle} → ${g.lat},${g.lng} cache=${!!g.fromCache}`);
    } catch (e) {
      failures.push({ id: row.id, reason: String(e?.message || e), calle, localidad: loc });
    }
  }
  return { ok, failures };
}

async function main() {
  const args = parseArgs();
  if (!Number.isFinite(args.tenantId) || args.tenantId < 1) {
    console.error(
      "Uso: node scripts/geocodificarPadronLote.mjs --tenant-id=N [--limit=500] [--dry-run] [--table=socios|cf|all]"
    );
    process.exit(1);
  }
  if (process.env.DISABLE_NOMINATIM === "1" || process.env.DISABLE_NOMINATIM === "true") {
    console.error("DISABLE_NOMINATIM está activo; no se puede geocodificar vía Nominatim.");
    process.exit(1);
  }

  await ensureCacheGeocodificacionTable();

  const allFailures = [];
  let totalOk = 0;

  if (args.table === "all" || args.table === "socios") {
    if (await tableExists("socios_catalogo")) {
      const cols = await columnas("socios_catalogo");
      const rows = await fetchSociosSinCoords(args.tenantId, args.limit, cols);
      console.log(`[socios_catalogo] filas a procesar: ${rows.length}`);
      const r = await processRows(
        rows,
        "socios",
        args.dryRun,
        args.tenantId,
        async (id, la, lo) => updateSociosCoords(id, la, lo, cols)
      );
      totalOk += r.ok;
      allFailures.push(...r.failures.map((f) => ({ ...f, table: "socios_catalogo" })));
    }
  }

  if (args.table === "all" || args.table === "cf") {
    if (await tableExists("clientes_finales")) {
      const cols = await columnas("clientes_finales");
      const rows = await fetchCfSinCoords(args.tenantId, args.limit, cols);
      console.log(`[clientes_finales] filas a procesar: ${rows.length}`);
      const r = await processRows(
        rows,
        "cf",
        args.dryRun,
        args.tenantId,
        async (id, la, lo) => updateCfCoords(id, la, lo, cols)
      );
      totalOk += r.ok;
      allFailures.push(...r.failures.map((f) => ({ ...f, table: "clientes_finales" })));
    }
  }

  console.log(
    JSON.stringify({
      tenant_id: args.tenantId,
      dry_run: args.dryRun,
      actualizados: totalOk,
      fallos: allFailures.length,
      detalle_fallos: allFailures.slice(0, 500),
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
