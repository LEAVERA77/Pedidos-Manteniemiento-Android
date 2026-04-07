import { describe, it, expect } from "vitest";
import {
  sanitizeDerivacionReclamosForStore,
  isValidWhatsappInternational,
  derivacionReclamosDesdeConfig,
} from "../utils/derivacionReclamos.js";

describe("derivacionReclamos utils", () => {
  it("sanitize acepta slots válidos", () => {
    const s = sanitizeDerivacionReclamosForStore({
      empresa_energia: { nombre: "EDEA", whatsapp: "+5493415000111" },
      cooperativa_agua: { nombre: "Coope Agua" },
    });
    expect(s.empresa_energia.whatsapp).toBe("+5493415000111");
    expect(s.cooperativa_agua.nombre).toBe("Coope Agua");
    expect(s.cooperativa_agua.whatsapp).toBeUndefined();
  });

  it("sanitize rechaza whatsapp inválido", () => {
    expect(() =>
      sanitizeDerivacionReclamosForStore({
        cooperativa_agua: { nombre: "X", whatsapp: "5411" },
      })
    ).toThrow();
  });

  it("isValidWhatsappInternational", () => {
    expect(isValidWhatsappInternational("")).toBe(true);
    expect(isValidWhatsappInternational("+543434123456")).toBe(true);
    expect(isValidWhatsappInternational("+12")).toBe(false);
  });

  it("derivacionReclamosDesdeConfig omite slots corruptos", () => {
    const d = derivacionReclamosDesdeConfig({
      derivacion_reclamos: {
        empresa_energia: { nombre: "OK", whatsapp: "+5498765432100" },
        cooperativa_agua: { whatsapp: "mal" },
      },
    });
    expect(d.empresa_energia).toBeTruthy();
    expect(d.cooperativa_agua).toBeUndefined();
  });
});
