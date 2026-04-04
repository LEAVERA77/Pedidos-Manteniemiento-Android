import express from "express";
import cors from "cors";

import { query } from "./db/neon.js";
import { requestContextMiddleware, logApiError } from "./middleware/requestContext.js";
import authRoutes from "./routes/auth.js";
import pedidosRoutes from "./routes/pedidos.js";
import usuariosRoutes from "./routes/usuarios.js";
import clientesRoutes from "./routes/clientes.js";
import clientesFinalesRoutes from "./routes/clientesFinales.js";
import distribuidoresRoutes from "./routes/distribuidores.js";
import estadisticasRoutes from "./routes/estadisticas.js";
import notificacionesRoutes from "./routes/notificaciones.js";
import whatsappRoutes from "./routes/whatsapp.js";
import whatsappHumanChatRoutes from "./routes/whatsappHumanChat.js";
import webhooksWhatsappRoutes from "./routes/webhooksWhatsapp.js";
import webhooksMetaRoutes from "./routes/webhooksMeta.js";
import configUbicacionRoutes from "./routes/configUbicacion.js";
import whatsappGeocodeRoutes from "./routes/whatsappGeocode.js";

export function createHttpApp() {
  const app = express();

  app.use(requestContextMiddleware);

  const allowedOrigins = new Set(
    String(
      process.env.CORS_ALLOWED_ORIGINS ||
        "https://leavera77.github.io,http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const corsOptionsDelegate = (req, callback) => {
    const origin = req.header("Origin");
    const corsOptions = {
      origin: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Hub-Signature-256", "X-Request-Id"],
      optionsSuccessStatus: 204,
      maxAge: 86400,
    };

    if (!origin) {
      corsOptions.origin = true;
      return callback(null, corsOptions);
    }

    if (allowedOrigins.has(origin)) {
      corsOptions.origin = true;
      return callback(null, corsOptions);
    }

    return callback(null, corsOptions);
  };

  app.use(cors(corsOptionsDelegate));
  app.options("*", cors(corsOptionsDelegate));
  app.use("/api/webhooks/whatsapp/meta", webhooksMetaRoutes);
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "pedidosmg-api", db: "not-checked" });
  });

  app.get("/health/db", async (_req, res) => {
    try {
      await query("SELECT 1");
      res.json({ ok: true, service: "pedidosmg-api", db: "ok" });
    } catch (error) {
      res.status(500).json({ ok: false, service: "pedidosmg-api", db: "error", error: error.message });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/config", configUbicacionRoutes);
  app.use("/api/whatsapp", whatsappGeocodeRoutes);
  app.use("/api/pedidos", pedidosRoutes);
  app.use("/api/usuarios", usuariosRoutes);
  app.use("/api/clientes", clientesRoutes);
  app.use("/api/clientes-finales", clientesFinalesRoutes);
  app.use("/api/distribuidores", distribuidoresRoutes);
  app.use("/api/estadisticas", estadisticasRoutes);
  app.use("/api/notificaciones", notificacionesRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/whatsapp/human-chat", whatsappHumanChatRoutes);
  app.use("/api/webhooks/whatsapp", webhooksWhatsappRoutes);

  app.get("/api/app-version", async (_req, res) => {
    try {
      const r = await query(
        `SELECT version_code, version_name, apk_url, release_notes, force_update
         FROM app_version
         ORDER BY version_code DESC
         LIMIT 1`
      );
      if (!r.rows.length) return res.status(404).json({ error: "No hay versión configurada" });
      const row = r.rows[0];
      return res.json({
        versionCode: row.version_code,
        versionName: row.version_name || `v${row.version_code}`,
        apkUrl: row.apk_url || "",
        releaseNotes: row.release_notes || "",
        forceUpdate: !!row.force_update,
      });
    } catch (error) {
      return res.status(500).json({ error: "Error al consultar versión", detail: error.message });
    }
  });

  app.use((err, req, res, _next) => {
    logApiError(err, req);
    res.status(err.status || 500).json({
      error: err.publicMessage || "Error interno del servidor",
      detail: process.env.NODE_ENV === "production" ? undefined : err.message,
    });
  });

  return app;
}
