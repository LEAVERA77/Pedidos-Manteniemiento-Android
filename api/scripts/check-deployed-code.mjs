/**
 * Simula cols/vals + finalizePedidoWaInsertCoordinates (mismo blindaje que crearPedidoDesdeWhatsappBot).
 * No conecta a Neon: define DATABASE_URL dummy solo para que cargue neon.js.
 *
 *   cd api
 *   node scripts/check-deployed-code.mjs
 *
 * made by leavera77
 */
async function main() {
  if (!process.env.DATABASE_URL && !process.env.DB_CONNECTION) {
    process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/_offline_check_deploy_script";
  }

  const {
    parLatLngPasaCheckWhatsappDb,
    finalizePedidoWaInsertCoordinates,
    FALLBACK_WGS84_ARGENTINA,
  } = await import("../services/whatsappGeolocalizacionGarantizada.js");

  function buildSampleColsVals(latFinal, lngFinal) {
    const cols = [
      "numero_pedido",
      "distribuidor",
      "cliente",
      "tipo_trabajo",
      "descripcion",
      "prioridad",
      "estado",
      "avance",
      "lat",
      "lng",
      "fecha_creacion",
      "telefono_contacto",
      "cliente_nombre",
    ];
    const vals = [
      "2026-0001",
      null,
      null,
      "luz",
      "test",
      1,
      "Pendiente",
      0,
      latFinal,
      lngFinal,
      new Date(),
      "5491111111111",
      "Test",
    ];
    cols.push("tenant_id", "origen_reclamo");
    vals.push(1, "whatsapp");
    return { cols, vals };
  }

  function runCase(name, lat, lng) {
    const { cols, vals } = buildSampleColsVals(lat, lng);
    const latIdx = cols.indexOf("lat");
    const lngIdx = cols.indexOf("lng");
    console.log(`\n--- ${name} ---`);
    console.log("Antes finalize:", {
      latIdx,
      lngIdx,
      latValue: vals[latIdx],
      lngValue: vals[lngIdx],
      checkPasses: parLatLngPasaCheckWhatsappDb(vals[latIdx], vals[lngIdx]),
    });
    const out = finalizePedidoWaInsertCoordinates(cols, vals, lat, lng);
    console.log("Después finalize:", {
      latFinal: out.latFinal,
      lngFinal: out.lngFinal,
      valsAtLat: vals[latIdx],
      valsAtLng: vals[lngIdx],
      checkPasses: parLatLngPasaCheckWhatsappDb(vals[latIdx], vals[lngIdx]),
    });
  }

  runCase("coords válidas (Buenos Aires aprox)", -34.6, -58.38);
  runCase("cerca de (0,0) — debe coercer", 1e-7, -1e-7);
  runCase("NaN/NaN — debe fallback AR", NaN, NaN);
  runCase("solo pipeline paso5 típico", FALLBACK_WGS84_ARGENTINA.lat, FALLBACK_WGS84_ARGENTINA.lng);

  console.log(
    "\nOK: si todos muestran checkPasses true después de finalize, el módulo local alinea con el CHECK.\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
