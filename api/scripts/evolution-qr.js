/**
 * Estado de la instancia y QR de conexión Evolution API.
 * Ejecutar: node scripts/evolution-qr.js  (desde carpeta api/)
 * made by leavera77
 */

import "dotenv/config";
import { getInstanceQR, checkInstanceStatus } from "../services/evolutionWhatsapp.js";

async function main() {
  console.log("Verificando estado de Evolution API…");

  const status = await checkInstanceStatus();
  console.log("Respuesta connectionState:", JSON.stringify(status, null, 2));

  const state = status?.instance?.state;
  if (state === "open") {
    console.log("La instancia ya está conectada (state=open).");
    return;
  }

  console.log("\nObteniendo QR / código de emparejamiento…\n");
  const qr = await getInstanceQR();

  if (qr.code) {
    console.log("Código / payload (escaneá con WhatsApp → Dispositivos vinculados):");
    console.log(String(qr.code).slice(0, 200) + (String(qr.code).length > 200 ? "…" : ""));
  }
  if (qr.pairingCode) {
    console.log("Pairing code:", qr.pairingCode);
  }
  if (!qr.code && !qr.pairingCode && qr.error) {
    console.log("Error:", qr.error);
  }
  if (!qr.code && !qr.pairingCode && !qr.error) {
    console.log("Respuesta completa:", JSON.stringify(qr, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
