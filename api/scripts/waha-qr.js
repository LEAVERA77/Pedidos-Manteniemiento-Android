/**
 * Estado de WAHA y QR (formato raw).
 * Ejecutar desde carpeta api/: npm run waha:qr
 */

import "dotenv/config";
import {
  ensureSessionExists,
  getQR,
  getSessionStatus,
  startSession,
} from "../services/wahaWhatsapp.js";

const base = String(process.env.WAHA_API_URL || "http://localhost:3080").replace(/\/+$/, "");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Verificando WAHA…");
  await ensureSessionExists();

  let status = await getSessionStatus();
  console.log("Estado sesión:", status?.name || "(sin nombre)", status?.status || status?.error);

  if (status?.status === "WORKING") {
    console.log("La sesión ya está conectada a WhatsApp.");
    return;
  }

  if (status?.status === "STOPPED" || status?.status === "FAILED") {
    console.log("Iniciando sesión (start)…");
    await startSession();
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      status = await getSessionStatus();
      console.log("  →", status?.status || status?.error);
      if (status?.status === "SCAN_QR_CODE" || status?.status === "WORKING") break;
    }
  }

  console.log("\nObteniendo QR (raw)…\n");
  const qr = await getQR();

  if (qr?.value) {
    console.log("OK: payload raw con `value` (generá el QR con esa cadena o usá la UI de WAHA).");
    console.log("\nUI / Swagger:", `${base}/`);
    console.log("(Según versión, el dashboard puede mostrar QR al iniciar sesión.)\n");
  } else {
    console.log("No se pudo obtener QR raw:", qr);
  }
}

main().catch(console.error);
