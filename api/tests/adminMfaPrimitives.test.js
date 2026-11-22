import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  crearTotpParaInscripcion, cifrarSecretoTotp, descifrarSecretoTotp, verificarTotp,
  validarWebAuthnConfig, opcionesRegistroHello, opcionesAccesoHello,
  verificarRegistroHello, verificarAccesoHello,
} from "../services/adminMfaPrimitives.js";

const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // vector público RFC 6238
const key = crypto.randomBytes(32).toString("base64url");
const identity = { key, tenantId: 2, userId: 5 };

describe("primitivas TOTP, sin integración al login", () => {
  it("crea secretos distintos y URI estándar para Authenticator", () => {
    const a = crearTotpParaInscripcion({ account: "administrador" });
    const b = crearTotpParaInscripcion({ account: "administrador" });
    expect(a.secret).not.toBe(b.secret);
    const uri = new URL(a.uri);
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.hostname).toBe("totp");
    expect(uri.searchParams.get("secret")).toBe(a.secret);
    expect(uri.searchParams.get("issuer")).toBe("GestorNova");
  });
  it("cifra con nonce aleatorio y vincula tenant y usuario", () => {
    const a = cifrarSecretoTotp(secret, identity);
    const b = cifrarSecretoTotp(secret, identity);
    expect(a.iv).not.toBe(b.iv);
    expect(JSON.stringify(a)).not.toContain(secret);
    expect(descifrarSecretoTotp(a, identity)).toBe(secret);
    expect(() => descifrarSecretoTotp(a, { ...identity, tenantId: 3 })).toThrow();
    expect(() => descifrarSecretoTotp(a, { ...identity, userId: 9 })).toThrow();
    expect(() => descifrarSecretoTotp({ ...a, tag: crypto.randomBytes(16).toString("base64url") }, identity)).toThrow();
    expect(() => cifrarSecretoTotp(secret, { ...identity, key: "corta" })).toThrow();
  });
  it("valida vector RFC, paso consumido y códigos inválidos", async () => {
    expect(await verificarTotp({ secret, code: "287082", nowSeconds: 59 })).toBe(1);
    expect(await verificarTotp({ secret, code: "287082", nowSeconds: 59, lastTimeStep: 1 })).toBeNull();
    expect(await verificarTotp({ secret, code: "287082", nowSeconds: 120 })).toBeNull();
    expect(await verificarTotp({ secret, code: "287082x", nowSeconds: 59 })).toBeNull();
    expect(await verificarTotp({ secret, code: "000000", nowSeconds: 59 })).toBeNull();
  });
});

describe("primitivas WebAuthn, sin integración al login", () => {
  const config = { origin: "https://gn.example.com", rpID: "gn.example.com" };
  it("exige HTTPS, origen exacto y RP ID exacto", () => {
    expect(validarWebAuthnConfig(config)).toEqual(config);
    for (const bad of [
      { origin: "http://gn.example.com", rpID: "gn.example.com" },
      { origin: "https://gn.example.com/otra", rpID: "gn.example.com" },
      { origin: "https://gn.example.com", rpID: "example.com" },
      { origin: "https://otro.example.com", rpID: "gn.example.com" },
    ]) expect(() => validarWebAuthnConfig(bad)).toThrow();
  });
  it("requiere autenticador de plataforma, verificación de usuario y desafíos distintos", async () => {
    const args = { ...config, tenantId: 2, userId: 5, account: "admin" };
    const a = await opcionesRegistroHello(args);
    const b = await opcionesRegistroHello(args);
    expect(a.challenge).not.toBe(b.challenge);
    expect(a.rp.id).toBe(config.rpID);
    expect(a.authenticatorSelection.userVerification).toBe("required");
    expect(a.authenticatorSelection.authenticatorAttachment).toBe("platform");
    const opts = await opcionesAccesoHello({ ...config, credentials: [{ id: "dGVzdA" }] });
    expect(opts.userVerification).toBe("required");
    await expect(opcionesAccesoHello({ ...config, credentials: [] })).rejects.toThrow();
  });
  it("rechaza respuestas inexistentes o malformadas", async () => {
    await expect(verificarRegistroHello({ ...config, expectedChallenge: "x", response: {} })).rejects.toThrow();
    await expect(verificarAccesoHello({ ...config, expectedChallenge: "x", response: {}, credential: {} })).rejects.toThrow();
  });
});
