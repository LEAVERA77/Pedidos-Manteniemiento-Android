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

  it("no descarta 54+area+subscriber (catálogos sin el 9)", () => {
    expect(isLikelyArgentinaInternationalLandline("543434890532")).toBe(false);
    expect(isLikelyArgentinaInternationalLandline("543434540250")).toBe(false);
    expect(isLikelyArgentinaInternationalLandline(`${M}3434540250`)).toBe(false);
  });

  it("normaliza móvil internacional y quita 15 duplicado tras prefijo móvil", () => {
    expect(normalizeArgentinaMobileWhatsappDigits(`${M}3434540250`)).toBe(`${M}3434540250`);
    expect(normalizeArgentinaMobileWhatsappDigits(`${M}341151234567`)).toBe(`${M}3411234567`);
  });

  it("normaliza nacional con 0 y 15 (Entre Ríos)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("0343 15 4540-250")).toBe(`${M}3434540250`);
    expect(normalizeArgentinaMobileWhatsappDigits("0343154540250")).toBe(`${M}3434540250`);
  });

  it("nacional con 0 sin 15 se rechaza (no hay suficiente info)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("03434890532")).toBeNull();
    expect(normalizeArgentinaMobileWhatsappDigits("0343 489 0532")).toBeNull();
  });

  it("completa 15… con característica por defecto", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("154540250", { defaultAreaDigits: "343" })).toBe(
      `${M}3434540250`
    );
  });

  it("internacional sin 9 se convierte a móvil (insertar 9)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("+54 343 4890532")).toBe(`${M}3434890532`);
    expect(normalizeArgentinaMobileWhatsappDigits("543434540250")).toBe(`${M}3434540250`);
  });

  it("móvil sin +54 inicial (9 + área)", () => {
    expect(normalizeArgentinaMobileWhatsappDigits("93434540250")).toBe(`${M}3434540250`);
  });
});
