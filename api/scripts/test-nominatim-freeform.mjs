/**
 * Prueba local contra la API pública Nominatim (respeta throttle ~1.1s salvo NOMINATIM_THROTTLE_MS_FOR_TESTS=0).
 *
 *   cd api
 *   set NOMINATIM_THROTTLE_MS_FOR_TESTS=0
 *   node scripts/test-nominatim-freeform.mjs
 *
 * made by leavera77
 */

process.env.NOMINATIM_THROTTLE_MS_FOR_TESTS = process.env.NOMINATIM_THROTTLE_MS_FOR_TESTS ?? "0";

const { geocodeDomicilioSimpleQArgentina } = await import("../services/nominatimClient.js");

const cases = [
  {
    calle: "Sarmiento",
    numero: "202",
    localidad: "Cerrito",
    stateOrProvince: "Entre Ríos",
  },
  {
    calle: "Moreno",
    numero: "80",
    localidad: "Cerrito",
    stateOrProvince: "Entre Ríos",
  },
  {
    calle: "Avenida San Martín",
    numero: "185",
    localidad: "Cerrito",
    stateOrProvince: "Entre Ríos",
  },
];

for (const c of cases) {
  const t0 = Date.now();
  const r = await geocodeDomicilioSimpleQArgentina(c);
  const ms = Date.now() - t0;
  console.log("\n---");
  console.log("Input:", JSON.stringify(c));
  console.log(`ms=${ms} hit=${!!r}`);
  if (r) {
    console.log(`lat=${r.lat} lng=${r.lng}`);
    console.log(`display: ${r.displayName}`);
    console.log("audit:", r.audit);
  }
}
