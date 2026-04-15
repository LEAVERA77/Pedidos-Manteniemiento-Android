/**
 * Vincular WAHA por código (mismo flujo que "Vincular con el número" en WhatsApp).
 * Uso: WAHA_PAIR_PHONE=54911... npm run waha:pair
 *   o: npm run waha:pair -- 54911...
 */

import "dotenv/config";
import {
  ensureSessionExists,
  getSessionStatus,
  requestPairingCode,
  startSession,
} from "../services/wahaWhatsapp.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const fromEnv = String(process.env.WAHA_PAIR_PHONE || "").trim();
  const fromArg = String(process.argv[2] || "").trim();
  const phone = fromArg || fromEnv;
  if (!phone) {
    console.error(
      "Definí el número: WAHA_PAIR_PHONE=549XXXXXXXX npm run waha:pair\n  o: npm run waha:pair -- 549XXXXXXXX"
    );
    process.exit(1);
  }

  console.log("Preparando sesión WAHA…");
  await ensureSessionExists();

  let status = await getSessionStatus();
  console.log("Estado:", status?.status || status?.error);

  if (status?.status === "WORKING") {
    console.log("Ya vinculado.");
    return;
  }

  if (status?.status === "STOPPED" || status?.status === "FAILED") {
    await startSession();
    for (let i = 0; i < 12; i++) {
      await sleep(800);
      status = await getSessionStatus();
      if (status?.status === "SCAN_QR_CODE" || status?.status === "WORKING") break;
    }
  }

  const digits = phone.replace(/\D/g, "");
  console.log("Solicitando código de emparejado (número, dígitos:", digits.length + ")");
  const r = await requestPairingCode(phone);
  if (r.ok) {
    console.log("Respuesta:", JSON.stringify(r.data, null, 2));
    console.log("\nEn el teléfono: WhatsApp → Dispositivos vinculados → Vincular con el número de teléfono e ingresá el código si la app lo pide.");
  } else {
    console.error("Falló request-code:", r.error);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
