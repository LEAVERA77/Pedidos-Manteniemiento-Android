import { describe, it, expect } from "vitest";
import {
  digitsOnly,
  isLikelyArgentinaInternationalLandline,
  normalizeArgentinaMobileWhatsappDigits,
} from "../utils/argentinaMobilePhone.js";

describe("argentinaMobilePhone", () => {
  it("digitsOnly", () => {
    expect(digitsOnly("+54 9 343 454-0250")).toBe("5493434540250");
  });

  it("detecta fijo internacional (54 sin 9)", () => {
    expect(isLikelyArgentinaInternationalLandline("543434890532")).toBe(true);
    expect(isLikelyArgentinaInternationalLandline("5493434540250")).toBe(false);
  });

  it("normaliza móvil internacional y quita 15 duplicado en 549", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("5493434540250")).toBe("5493434540250");
    expect(normalizeArgentinaMobileWhatsappDigits("549341151234567")).toBe("5493411234567");
  });

  it("normaliza nacional con 0 y 15 (Entre Ríos)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("0343 15 4540-250")).toBe("5493434540250");
    expect(normalizeArgentinaMobileWhatsappDigits("0343154540250")).toBe("5493434540250");
  });

  it("rechaza fijo nacional Cerrito 0343-4890532", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("03434890532")).toBeNull();
    expect(normalizeArgentinaMobileWhatsappDigits("0343 489 0532")).toBeNull();
  });

  it("completa 15… con característica por defecto", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("154540250", { defaultAreaDigits: "343" })).toBe(
      "5493434540250"
    );
  });

  it("rechaza internacional ya formateado como fijo", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("+54 343 4890532")).toBeNull();
  });

  it("móvil sin +54 inicial (9 + área)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("93434540250")).toBe("5493434540250");
  });
});
