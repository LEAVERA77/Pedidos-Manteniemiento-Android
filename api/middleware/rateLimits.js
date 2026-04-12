/**
 * Rate limiting por IP (express-rate-limit).
 * En Render / proxy: configurar TRUST_PROXY_COUNT (default 1) para X-Forwarded-For.
 * made by leavera77
 */
import rateLimit from "express-rate-limit";

const windowMsGeneral = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const maxGeneral = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

const windowMsAuth = Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000;
const maxAuth = Number(process.env.RATE_LIMIT_AUTH_MAX) || 5;

const windowMsGeocode = Number(process.env.RATE_LIMIT_GEOCODE_WINDOW_MS) || 60 * 1000;
const maxGeocode = Number(process.env.RATE_LIMIT_GEOCODE_MAX) || 30;

/** Todas las rutas /api/* excepto webhooks (Meta/Evolution). */
export const generalApiLimiter = rateLimit({
  windowMs: windowMsGeneral,
  max: maxGeneral,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiadas solicitudes. Por favor, esperá unos minutos antes de intentar nuevamente.",
  },
  skip: (req) => {
    const p = req.path || "";
    return p.startsWith("/api/webhooks");
  },
});

/** POST /api/auth/login — intentos fallidos cuentan; éxito no (skipSuccessfulRequests). */
export const authLoginLimiter = rateLimit({
  windowMs: windowMsAuth,
  max: maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: "Demasiados intentos de inicio de sesión. Esperá unos minutos antes de reintentar.",
  },
});

/** POST /api/auth/verify-password — cubierto aparte del login. */
export const authVerifyPasswordLimiter = rateLimit({
  windowMs: windowMsAuth,
  max: maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: "Demasiados intentos de verificación. Esperá unos minutos antes de reintentar.",
  },
});

/** Rutas que llaman a Nominatim con costo. */
export const geocodeRouteLimiter = rateLimit({
  windowMs: windowMsGeocode,
  max: maxGeocode,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiadas solicitudes de geocodificación. Esperá un momento.",
  },
});
