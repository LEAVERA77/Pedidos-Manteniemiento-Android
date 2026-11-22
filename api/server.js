import "dotenv/config";
import { validateJwtSecretForServer } from "./utils/jwtSecret.js";
import { createHttpApp } from "./httpApp.js";
import { initBaileysIfConfigured } from "./services/baileysWhatsapp.js";

validateJwtSecretForServer();
const PORT = Number(process.env.PORT || 3000);
const app = createHttpApp();

app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      msg: "api_listening",
      port: PORT,
      service: "pedidosmg-api",
    })
  );
  initBaileysIfConfigured();
});
