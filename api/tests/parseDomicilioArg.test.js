import { describe, it, expect } from "vitest";
import { parseDomicilioLibreArgentina } from "../utils/parseDomicilioArg.js";

describe("parseDomicilioLibreArgentina", () => {
  it("Doctor Haedo 365, Hasenkamp", () => {
    const r = parseDomicilioLibreArgentina("Doctor Haedo 365, Hasenkamp");
    expect(r).toEqual({
      calle: "Doctor Haedo",
      numero: "365",
      localidad: "Hasenkamp",
    });
  });

  it("calle número + fallback localidad", () => {
    const r = parseDomicilioLibreArgentina("San Martín 100", "Hasenkamp");
    expect(r?.localidad).toBe("Hasenkamp");
    expect(r?.numero).toBe("100");
  });

  it("vacío → null", () => {
    expect(parseDomicilioLibreArgentina("")).toBeNull();
    expect(parseDomicilioLibreArgentina("   ")).toBeNull();
  });
});
