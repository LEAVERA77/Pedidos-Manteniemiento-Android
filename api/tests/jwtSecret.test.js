import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { requireSafeJwtSecret, resolveJwtSecret, validateJwtSecretForServer } from "../utils/jwtSecret.js";

const good = "0123456789abcdef0123456789abcdef";
describe("secreto JWT: validación de arranque", () => {
  it("rechaza vacío, valor de ejemplo y cortos", () => {
    for (const JWT_SECRET of [undefined, "", "dev_secret", "cambiar_en_produccion", "corto", ` ${good}`]) {
      expect(() => requireSafeJwtSecret({ JWT_SECRET })).toThrow(/JWT_SECRET/);
    }
  });
  it("acepta un secreto configurado suficientemente largo", () => {
    expect(requireSafeJwtSecret({ JWT_SECRET: good })).toBe(good);
    expect(() => validateJwtSecretForServer({ JWT_SECRET: good })).not.toThrow();
  });
  it("no habilita fallback en producción aunque se pida excepción de desarrollo", () => {
    const env = { NODE_ENV: "production", ALLOW_INSECURE_DEV_JWT: "true" };
    expect(() => resolveJwtSecret(env)).toThrow();
    expect(() => validateJwtSecretForServer(env)).toThrow();
  });
  it("el servidor no escucha con el secreto de desarrollo en producción", () => {
    const child = spawnSync(process.execPath, ["server.js"], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production", JWT_SECRET: "dev_secret", DB_CONNECTION: "postgresql://localhost/test", ALLOW_INSECURE_DEV_JWT: "true" },
      encoding: "utf8", timeout: 12000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain("JWT_SECRET");
    expect(child.stdout).not.toContain("api_listening");
  }, 15000);
  it("solo admite fallback mediante excepción explícita fuera de producción", () => {
    expect(() => validateJwtSecretForServer({})).toThrow();
    expect(() => validateJwtSecretForServer({ ALLOW_INSECURE_DEV_JWT: "true" })).not.toThrow();
    expect(resolveJwtSecret({})).toBe("dev_secret");
  });
});
