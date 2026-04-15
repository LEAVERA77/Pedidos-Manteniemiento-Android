/**
 * Emulador local @whatsapp-cloudapi/emulator — solo desarrollo.
 * Requiere Node >= 22 (dependencia del paquete).
 */
import "dotenv/config";
import { WhatsAppEmulator } from "@whatsapp-cloudapi/emulator";

const businessPhoneNumberId =
  process.env.META_PHONE_NUMBER_ID || "1030098870192233";
const port = Number(process.env.WHATSAPP_EMULATOR_PORT || 4004) || 4004;
const apiBase =
  process.env.EMULATOR_WEBHOOK_API_BASE || "http://localhost:3000";
const webhookUrl = `${String(apiBase).replace(/\/+$/, "")}/api/webhooks/whatsapp/meta`;

const verifyToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || "").trim();
if (!verifyToken) {
  console.warn(
    "[emulator] META_WEBHOOK_VERIFY_TOKEN vacío: definilo en .env (debe coincidir con la API)."
  );
}

const emulator = new WhatsAppEmulator({
  businessPhoneNumberId,
  port,
  webhook: {
    url: webhookUrl,
    verifyToken: verifyToken || "dev-local-verify-token",
    appSecret: process.env.META_APP_SECRET || undefined,
  },
  log: {
    level: "normal",
  },
});

async function start() {
  try {
    await emulator.start();
    console.log(`✅ Emulador WhatsApp Cloud API en http://localhost:${String(port)}`);
    console.log(`📡 Webhook → ${webhookUrl}`);
    console.log(
      "📩 Simular texto: POST http://localhost:%s/debug/messages/send-text  body: { \"from\", \"message\", \"name?\" }",
      String(port)
    );
  } catch (error) {
    console.error("❌ Error al iniciar el emulador:", error?.message || error);
    process.exit(1);
  }
}

async function stop() {
  await emulator.stop();
  console.log("🛑 Emulador detenido");
  process.exit(0);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

start();
