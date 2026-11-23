/**
 * Rate limiting por IP (express-rate-limit).
 * En Render / proxy: configurar TRUST_PROXY_COUNT (default 1) para X-Forwarded-For.
 * made by leavera77
 */
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "../utils/jwtSecret.js";

const windowMsGeneral = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const maxGeneral = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

const windowMsAuth = Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000;
/** En Vitest el suite completo comparte IP/limitador; subir tope para no 429 entre archivos. */
const maxAuth =
  Number(process.env.RATE_LIMIT_AUTH_MAX) ||
  (process.env.VITEST === "true" ? 50_000 : 5);

const windowMsGeocode = Number(process.env.RATE_LIMIT_GEOCODE_WINDOW_MS) || 60 * 1000;
const maxGeocode = Number(process.env.RATE_LIMIT_GEOCODE_MAX) || 30;

/** Las excepciones históricas mantienen sus propios controles. */
function skipGeneral(req) {
  const p = req.path || "";
  return p.startsWith("/api/webhooks") || p.startsWith("/api/sql") ||
    p.startsWith("/api/setup/technician") ||
    (p.includes("/api/clientes/nuevo") && req.method === "POST");
}

// La identidad solo se usa para el límite, nunca reemplaza la autorización de la ruta.
// Un JWT inválido, vencido o sin ID válido sigue sujeto al límite anónimo por IP.
const LIMIT_USER = Symbol("rate-limit-user");
function verifiedLimitUser(req) {
  if (Object.hasOwn(req, LIMIT_USER)) return req[LIMIT_USER];
  let id = null;
  try {
    const header = String(req.headers.authorization || "");
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (match) {
      const decoded = jwt.verify(match[1], resolveJwtSecret());
      const candidate = decoded && (decoded.userId ?? decoded.sub);
      if (/^[1-9]\d*$/.test(String(candidate ?? ""))) {
        const number = Number(candidate);
        if (Number.isSafeInteger(number) && number <= 2147483647) id = number;
      }
    }
  } catch (_) { /* Se cuenta como anónimo. */ }
  req[LIMIT_USER] = id;
  return id;
}

/** Protege la IP en conjunto y reparte la cuota entre usuarios con JWT válido.
 * El límite anónimo histórico y los límites específicos de login/SQL/geocodificación
 * siguen vigentes. Los contadores continúan siendo por proceso, no distribuidos.
 */
export function createGeneralApiLimiter({
  windowMs = windowMsGeneral,
  anonymousMax = maxGeneral,
  userMax = Number(process.env.RATE_LIMIT_USER_MAX) || 600,
  ipMax = Number(process.env.RATE_LIMIT_IP_MAX) || 1800,
} = {}) {
  const shared = {
    windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipGeneral,
    message: { error: "Demasiadas solicitudes. Por favor, esperá unos minutos antes de intentar nuevamente." },
  };
  const ipLimiter = rateLimit({ ...shared, max: ipMax });
  const identityLimiter = rateLimit({
    ...shared,
    max: (req) => verifiedLimitUser(req) == null ? anonymousMax : userMax,
    keyGenerator: (req) => {
      const uid = verifiedLimitUser(req);
      return uid == null ? `ip:${req.ip}` : `user:${uid}`;
    },
  });
  return (req, res, next) => ipLimiter(req, res, (err) => {
    if (err) return next(err);
    return identityLimiter(req, res, next);
  });
}

export const generalApiLimiter = createGeneralApiLimiter();

const windowMsSql = Number(process.env.RATE_LIMIT_SQL_WINDOW_MS) || 60 * 1000;
const maxSql =
  Number(process.env.RATE_LIMIT_SQL_MAX) ||
  (process.env.VITEST === "true" ? 50_000 : 600);

export const sqlGatewayLimiter = rateLimit({
  windowMs: windowMsSql,
  max: maxSql,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiadas consultas seguidas. Esperá unos segundos y reintentá.",
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

/** Recuperación: contar también solicitudes exitosas para limitar envíos repetidos. */
export const authResetRequestLimiter = rateLimit({
  windowMs: windowMsAuth,
  max: maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes de recuperación. Esperá unos minutos." },
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
