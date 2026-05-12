import { describe, it, expect } from "vitest";
import {
  digitsOnly,
  isLikelyArgentinaInternationalLandline,
  normalizeArgentinaMobileWhatsappDigits,
} from "../utils/argentinaMobilePhone.js";

const M = "54" + "9";

describe("argentinaMobilePhone", () => {
  it("digitsOnly", () => {
    expect(digitsOnly("+54 9 343 454-0250")).toBe(`${M}3434540250`);
  });

  it("isLikelyArgentinaInternationalLandline siempre false", () => {
    expect(isLikelyArgentinaInternationalLandline("543434890532")).toBe(false);
    expect(isLikelyArgentinaInternationalLandline("543434540250")).toBe(false);
    expect(isLikelyArgentinaInternationalLandline(`${M}3434540250`)).toBe(false);
  });

  it("acepta número 54+area+subscriber tal cual (12-13 dígitos)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("543434540250")).toBe("543434540250");
    expect(normalizeArgentinaMobileWhatsappDigits("5434344540250")).toBe("5434344540250");
    expect(normalizeArgentinaMobileWhatsappDigits("543436986848")).toBe("543436986848");
  });

  it("acepta móvil internacional con 9 y quita 15 duplicado", () => {
    expect(normalizeArgentinaMobileWhatsappDigits(`${M}3434540250`)).toBe(`${M}3434540250`);
    expect(normalizeArgentinaMobileWhatsappDigits(`${M}341151234567`)).toBe(`${M}3411234567`);
  });

  it("normaliza nacional con 0 y 15 (Entre Ríos)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("0343 15 4540-250")).toBe(`${M}3434540250`);
    expect(normalizeArgentinaMobileWhatsappDigits("0343154540250")).toBe(`${M}3434540250`);
  });

  it("nacional con 0 sin 15 (10+ dígitos) se acepta como 54+body", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("03434890532")).toBe("543434890532");
    expect(normalizeArgentinaMobileWhatsappDigits("0343 489 0532")).toBe("543434890532");
  });

  it("completa 15… con característica por defecto", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("154540250", { defaultAreaDigits: "343" })).toBe(
      `${M}3434540250`
    );
  });

  it("móvil sin +54 inicial (9 + área)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("93434540250")).toBe(`${M}3434540250`);
  });

  it("número corto (menos de 10 dígitos) se rechaza", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("12345")).toBeNull();
    expect(normalizeArgentinaMobileWhatsappDigits("")).toBeNull();
  });
});
