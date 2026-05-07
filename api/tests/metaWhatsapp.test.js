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

  it("prefijo móvil AR internacional → 54… cuando strip está activo (default)", () => {
    delete process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
    const inMob = "54" + "9" + "3512345678";
    const out = normalizeWhatsAppRecipientForMeta(inMob);
    expect(out.startsWith("54")).toBe(true);
    expect(out.charAt(2)).not.toBe("9");
  });

  it("no altera prefijo móvil si strip desactivado explícitamente", () => {
    process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9 = "false";
    const inDigits = "54" + "9" + "3512345678";
    const out = normalizeWhatsAppRecipientForMeta(inDigits);
    expect(out).toBe(inDigits.replace(/\D/g, ""));
  });

  it("543… en inbound default → no inserta 9 (identidad estable)", () => {
    delete process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
    delete process.env.META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9;
    const out = normalizeWhatsAppRecipientForMeta("543436986848");
    expect(out).toBe("543436986848");
  });

  it("543… en outbound → inserta 9 móvil cuando insert está activo por defecto", () => {
    delete process.env.META_WHATSAPP_ARGENTINA_STRIP_MOBILE_9;
    delete process.env.META_WHATSAPP_ARGENTINA_INSERT_MOBILE_9;
    const out = normalizeWhatsAppRecipientForMeta("543436986848", { mode: "outbound" });
    const want = "54" + "9" + "3436986848";
    expect(out.startsWith("54")).toBe(true);
    expect(out.charAt(2)).toBe("9");
    expect(out).toBe(want);
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
  it("muestra prefijo y últimos 4 (disambiguar números largos)", () => {
    const m = maskWaDigitsForLog("54" + "9" + "3434540250");
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
