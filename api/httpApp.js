import express from "express";
import cors from "cors";

import { query } from "./db/neon.js";
import { requestContextMiddleware, logApiError } from "./middleware/requestContext.js";
import authRoutes from "./routes/auth.js";
import pedidosRoutes from "./routes/pedidos.js";
import direccionesRoutes from "./routes/direcciones.js";
import usuariosRoutes from "./routes/usuarios.js";
import clientesRoutes from "./routes/clientes.js";
import clientesFinalesRoutes from "./routes/clientesFinales.js";
import distribuidoresRoutes from "./routes/distribuidores.js";
import estadisticasRoutes from "./routes/estadisticas.js";
import notificacionesRoutes from "./routes/notificaciones.js";
import whatsappRoutes from "./routes/whatsapp.js";
import whatsappBroadcastRoutes from "./routes/whatsappBroadcast.js";
import tenantSwitchRoutes from "./routes/tenantSwitch.js";
import setupWizardRoutes from "./routes/setupWizard.js";
import whatsappHumanChatRoutes from "./routes/whatsappHumanChat.js";
import webhooksWhatsappRoutes from "./routes/webhooksWhatsapp.js";
import webhooksMetaRoutes from "./routes/webhooksMeta.js";
import configUbicacionRoutes from "./routes/configUbicacion.js";
import whatsappGeocodeRoutes from "./routes/whatsappGeocode.js";
import geocodeNominatimRoutes from "./routes/geocodeNominatim.js";
import callesNormalizadasRoutes from "./routes/callesNormalizadas.js";
import adminRoutes from "./routes/admin.js";
import geocodWaOperacionesRoutes from "./routes/geocodWaOperaciones.js";
import infraAfectadosRoutes from "./routes/infraAfectados.js";
import incidenciasRoutes from "./routes/incidencias.js";
import tenantOperativaSettingsRoutes from "./routes/tenantOperativaSettings.js";
import debugRoutes from "./routes/debug.js";
import {
  authLoginLimiter,
  authVerifyPasswordLimiter,
  generalApiLimiter,
  geocodeRouteLimiter,
} from "./middleware/rateLimits.js";

export function createHttpApp() {
  const app = express();
  app.set("trust proxy", Number(process.env.TRUST_PROXY_COUNT) || 1);

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
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-Hub-Signature-256",
        "X-Request-Id",
        "X-GestorNova-Technician-Key",
      ],
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

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    return generalApiLimiter(req, res, next);
  });

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

  /** Comparar con `git log` del repo: Render inyecta `RENDER_GIT_COMMIT` si el build viene de Git. */
  app.get("/api/health/deploy", (_req, res) => {
    res.json({
      service: "pedidosmg-api",
      gitCommit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.SOURCE_VERSION || null,
      node: process.version,
    });
  });

  /** Rutas debug que pegan a Nominatim: mismo bucket que /api/geocode. */
  app.use("/api/debug/nominatim-test", geocodeRouteLimiter);
  app.use("/api/debug/nominatim-raw", geocodeRouteLimiter);

  /** Diagnóstico despliegue: GET /api/debug/version (commit + heurísticas WA INSERT). */
  app.use("/api/debug", debugRoutes);

  app.use("/api/geocode", geocodeRouteLimiter);
  app.use("/api/whatsapp/geocode", geocodeRouteLimiter);

  app.use("/api/auth/login", (req, res, next) => {
    if (req.method !== "POST") return next();
    return authLoginLimiter(req, res, next);
  });
  app.use("/api/auth/verify-password", (req, res, next) => {
    if (req.method !== "POST") return next();
    return authVerifyPasswordLimiter(req, res, next);
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/admin/geocod-wa-operaciones", geocodWaOperacionesRoutes);
  app.use("/api/config", configUbicacionRoutes);
  app.use("/api/whatsapp", whatsappGeocodeRoutes);
  app.use("/api/whatsapp/broadcast", whatsappBroadcastRoutes);
  app.use("/api/tenant", tenantSwitchRoutes);
  app.use("/api/setup", setupWizardRoutes);
  app.use("/api/geocode", geocodeNominatimRoutes);
  app.use("/api/calles-normalizadas", callesNormalizadasRoutes);
  app.use("/api/pedidos", pedidosRoutes);
  app.use("/api/incidencias", incidenciasRoutes);
  app.use("/api/direcciones", direccionesRoutes);
  app.use("/api/tenant-operativa", tenantOperativaSettingsRoutes);
  app.use("/api/infra-afectados", infraAfectadosRoutes);
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

// Last updated: 2026-04-11 02:15 - Endpoint admin para migración automática de socios_catalogo
