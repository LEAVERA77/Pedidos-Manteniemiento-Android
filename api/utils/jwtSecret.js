/** Nunca mostrar el secreto ni detalles del valor en los errores o registros. */
export function requireSafeJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32 ||
      secret !== secret.trim() || /^(dev_secret|cambiar_en_produccion)$/i.test(secret)) {
    throw new Error("JWT_SECRET debe ser un secreto aleatorio de al menos 32 bytes, configurado en el servidor");
  }
  return secret;
}

/** El fallback conocido es solo para módulos en pruebas/desarrollo, nunca producción. */
export function resolveJwtSecret(env = process.env) {
  if (String(env.NODE_ENV || "").toLowerCase() === "production") return requireSafeJwtSecret(env);
  return env.JWT_SECRET || "dev_secret";
}

/** Todo servidor real exige secreto seguro; excepción explícita para desarrollo local. */
export function validateJwtSecretForServer(env = process.env) {
  const production = String(env.NODE_ENV || "").toLowerCase() === "production";
  if (!production && env.ALLOW_INSECURE_DEV_JWT === "true" && !env.JWT_SECRET) return;
  requireSafeJwtSecret(env);
}
