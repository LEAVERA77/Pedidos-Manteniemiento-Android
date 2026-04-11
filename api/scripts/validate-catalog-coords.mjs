/**
 * Validación periódica: puntos sospechosos conocidos + bbox por provincia (Entre Ríos, Santa Fe, …).
 *
 *   cd api
 *   node scripts/validate-catalog-coords.mjs
 *
 * made by leavera77
 */
if (!process.env.DATABASE_URL && !process.env.DB_CONNECTION) {
  console.error("Definí DATABASE_URL o DB_CONNECTION para conectar a Neon.");
  process.exit(1);
}

async function main() {
  const { query } = await import("../db/neon.js");
  const {
    PUNTOS_COORDS_SOSPECHOSOS_KNOWN,
    coordsDentroDeBboxProvincia,
  } = await import("../services/sociosCatalogoCoordsValidacion.js");

  const rCols = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'socios_catalogo'`
  );
  const colSet = new Set((rCols.rows || []).map((c) => c.column_name));
  if (!colSet.has("latitud") || !colSet.has("longitud")) {
    console.error("socios_catalogo sin latitud/longitud; abort.");
    process.exit(1);
  }

  for (const punto of PUNTOS_COORDS_SOSPECHOSOS_KNOWN) {
    const radio = punto.radio ?? 0.002;
    const sql = `
      SELECT id, nis, medidor, calle, numero, localidad, provincia, latitud, longitud, ubicacion_manual
      FROM socios_catalogo
      WHERE COALESCE(activo, TRUE) = TRUE
        AND latitud IS NOT NULL AND longitud IS NOT NULL
        AND ABS(latitud::double precision - $1::double precision) < $3::double precision
        AND ABS(longitud::double precision - $2::double precision) < $3::double precision
      ORDER BY id
      LIMIT 500`;
    const r = await query(sql, [punto.lat, punto.lng, radio]);
    const rows = r.rows || [];
    if (rows.length) {
      console.warn(`\n⚠️  ${rows.length} fila(s) cerca de: ${punto.nombre || "punto_sospechoso"}`);
      console.table(rows);
    } else {
      console.log(`OK: ninguna fila cerca de "${punto.nombre}" (radio ${radio}).`);
    }
  }

  if (colSet.has("provincia")) {
    const rAll = await query(
      `SELECT id, provincia, latitud, longitud, nis, medidor, localidad
       FROM socios_catalogo
       WHERE COALESCE(activo, TRUE) = TRUE
         AND latitud IS NOT NULL AND longitud IS NOT NULL
         AND TRIM(COALESCE(provincia, '')) <> ''
       ORDER BY id
       LIMIT 8000`
    );
    let nFuera = 0;
    for (const row of rAll.rows || []) {
      const la = Number(row.latitud);
      const lo = Number(row.longitud);
      const b = coordsDentroDeBboxProvincia(la, lo, row.provincia);
      if (!b.ok && b.fueraDeBbox) {
        nFuera++;
        if (nFuera <= 80) {
          console.warn(`⚠️  id=${row.id} provincia="${row.provincia}" coords (${la}, ${lo}) fuera de bbox aproximado`);
        }
      }
    }
    if (nFuera > 0) {
      console.warn(`\nTotal filas con coords fuera del bbox de su provincia (muestra max 80): ${nFuera}`);
    } else {
      console.log("OK: bbox provincial — sin anomalías en el lote consultado.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
