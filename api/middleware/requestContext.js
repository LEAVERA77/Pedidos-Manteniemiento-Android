import { randomUUID } from "crypto";

function isQuietHealthProbe(req, res, path) {
  if (res.statusCode >= 400) return false;
  const logHealth = String(process.env.LOG_HEALTH_CHECKS || "").trim().toLowerCase();
  if (logHealth === "1" || logHealth === "true" || logHealth === "yes") return false;
  if (path === "/health" || path === "/health/db") return true;
  if (path === "/" && (req.method === "HEAD" || req.method === "GET")) return true;
  return false;
}

/**
 * Asigna X-Request-Id (o respeta el encabezado entrante) y registra una línea JSON por respuesta.
 */
export function requestContextMiddleware(req, res, next) {
  const incoming = req.get("X-Request-Id") || req.get("X-Correlation-Id");
  const reqId = incoming && String(incoming).trim().length >= 8 ? String(incoming).trim() : randomUUID();
  res.setHeader("X-Request-Id", reqId);
  req.reqId = reqId;

  const start = Date.now();
  res.on("finish", () => {
    const path = (req.originalUrl || req.url || "").split("?")[0];
    if (isQuietHealthProbe(req, res, path)) return;
    const line = {
      level: "info",
      ts: new Date().toISOString(),
      reqId,
      method: req.method,
      path,
      status: res.statusCode,
      ms: Date.now() - start,
    };
    console.log(JSON.stringify(line));
  });
  next();
}

export function logApiError(err, req) {
  const line = {
    level: "error",
    ts: new Date().toISOString(),
    reqId: req?.reqId,
    msg: err?.message || String(err),
    ...(process.env.NODE_ENV === "production" ? {} : { stack: err?.stack }),
  };
  console.log(JSON.stringify(line));
}
