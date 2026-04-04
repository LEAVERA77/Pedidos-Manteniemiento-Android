import { randomUUID } from "crypto";

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
