import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeWhatsAppRecipientForMeta,
  decodeWhatsAppListRowId,
  maskWaDigitsForLog,
} from "../services/metaWhatsapp.js";

describe("metaWhatsapp — normalizeWhatsAppRecipientForMeta", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("549 + móvil AR → 54… cuando strip está activo (default)", () => {
    delete process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
    const out = normalizeWhatsAppRecipientForMeta("5493512345678");
    expect(out.startsWith("54")).toBe(true);
    expect(out).not.toMatch(/^549/);
  });

  it("no altera 549 si strip desactivado explícitamente", () => {
    process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9 = "false";
    const inDigits = "5493512345678";
    const out = normalizeWhatsAppRecipientForMeta(inDigits);
    expect(out).toBe(inDigits.replace(/\D/g, ""));
  });

  it("543… en inbound default → no inserta 9 (identidad estable)", () => {
    delete process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
    delete process.env.META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9;
    const out = normalizeWhatsAppRecipientForMeta("543436986848");
    expect(out).toBe("543436986848");
  });

  it("543… en outbound → se mantiene 543… si insert no está activo (default alineado a sandbox Meta)", () => {
    delete process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
    delete process.env.META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9;
    const out = normalizeWhatsAppRecipientForMeta("543436986848", { mode: "outbound" });
    expect(out).toBe("543436986848");
  });

  it("543… en outbound → 549… cuando META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9=true", () => {
    process.env.META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9 = "true";
    delete process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
    const out = normalizeWhatsAppRecipientForMeta("543436986848", { mode: "outbound" });
    expect(out.startsWith("549")).toBe(true);
    expect(out).toBe("5493436986848");
  });

  it("543… en outbound no inserta si META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9=false", () => {
    process.env.META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9 = "false";
    process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9 = "false";
    const inDigits = "543436986848";
    const out = normalizeWhatsAppRecipientForMeta(inDigits, { mode: "outbound" });
    expect(out).toBe(inDigits);
  });
});

describe("metaWhatsapp — maskWaDigitsForLog", () => {
  it("muestra prefijo y últimos 4 (disambiguar 549343…)", () => {
    const m = maskWaDigitsForLog("5493434540250");
    expect(m.tail4).toBe("0250");
    expect(String(m.mask)).toContain("0250");
  });
});

describe("metaWhatsapp — decodeWhatsAppListRowId", () => {
  it("decodifica base64url UTF-8", () => {
    const encoded = Buffer.from("Corte de Energía", "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
    expect(decodeWhatsAppListRowId(encoded)).toBe("Corte de Energía");
  });

  it("id no base64 útil no reproduce un tipo conocido (Node devuelve cadena vacía u otro)", () => {
    const r = decodeWhatsAppListRowId("!!!");
    expect(["", null].includes(r) || !String(r).includes("Corte")).toBe(true);
  });
});
