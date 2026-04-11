/**
 * Reporta filas en socios_catalogo cuyas coords caen cerca de puntos "sospechosos"
 * (mismo patrón que coords mal ubicadas conocidas).
 *
 * Requiere DATABASE_URL o DB_CONNECTION (misma variable que neon.js).
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

const SUSPECT_LOCATIONS = [
  {
    name: "Diagonal Comercio 247 (ejemplo histórico)",
    lat: -31.581131,
    lng: -60.077763,
    radius: 0.002,
  },
];

async function main() {
  const { query } = await import("../db/neon.js");

  const rCols = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'socios_catalogo'`
  );
  const colSet = new Set((rCols.rows || []).map((c) => c.column_name));
  if (!colSet.has("latitud") || !colSet.has("longitud")) {
    console.error("socios_catalogo sin latitud/longitud; abort.");
    process.exit(1);
  }

  for (const loc of SUSPECT_LOCATIONS) {
    const sql = `
      SELECT id, nis, medidor, calle, numero, localidad, latitud, longitud, ubicacion_manual
      FROM socios_catalogo
      WHERE COALESCE(activo, TRUE) = TRUE
        AND latitud IS NOT NULL AND longitud IS NOT NULL
        AND ABS(latitud::double precision - $1::double precision) < $3::double precision
        AND ABS(longitud::double precision - $2::double precision) < $3::double precision
      ORDER BY id
      LIMIT 500`;
    const r = await query(sql, [loc.lat, loc.lng, loc.radius]);
    const rows = r.rows || [];
    if (rows.length) {
      console.warn(`\n⚠️  ${rows.length} fila(s) cerca de punto sospechoso: ${loc.name}`);
      console.table(rows);
    } else {
      console.log(`OK: ninguna fila cerca de "${loc.name}" (radio ${loc.radius}).`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
