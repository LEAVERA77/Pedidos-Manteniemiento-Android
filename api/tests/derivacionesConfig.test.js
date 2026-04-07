import { describe, it, expect } from "vitest";
import { normalizeWhatsappConfigDigits, mergeAndValidateDerivaciones } from "../utils/derivacionesConfig.js";

describe("normalizeWhatsappConfigDigits", () => {
  it("vacío → ok digits vacío", () => {
    expect(normalizeWhatsappConfigDigits("")).toEqual({ ok: true, digits: "" });
    expect(normalizeWhatsappConfigDigits(null)).toEqual({ ok: true, digits: "" });
    expect(normalizeWhatsappConfigDigits("   ")).toEqual({ ok: true, digits: "" });
  });

  it("+54 y espacios", () => {
    const r = normalizeWhatsappConfigDigits("+54 9 341 555-1234");
    expect(r.ok).toBe(true);
    expect(r.digits).toBe("5493415551234");
  });

  it("solo dígitos válidos", () => {
    const r = normalizeWhatsappConfigDigits("5493415551234");
    expect(r.ok).toBe(true);
    expect(r.digits).toBe("5493415551234");
  });

  it("muy corto → error", () => {
    const r = normalizeWhatsappConfigDigits("12345");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("whatsapp_longitud");
  });

  it("muy largo → error", () => {
    const r = normalizeWhatsappConfigDigits("1".repeat(16));
    expect(r.ok).toBe(false);
  });
});

describe("mergeAndValidateDerivaciones", () => {
  it("fusiona slot no enviado con previo", () => {
    const prev = {
      energia: { activo: false, nombre: "", whatsapp: "" },
      agua: { activo: true, nombre: "Coop", whatsapp: "5493419998888" },
    };
    const inc = { energia: { activo: true, nombre: "EPE", whatsapp: "5493415551234" } };
    const r = mergeAndValidateDerivaciones(prev, inc);
    expect(r.ok).toBe(true);
    expect(r.value.agua.whatsapp).toBe("5493419998888");
    expect(r.value.energia.whatsapp).toBe("5493415551234");
  });

  it("activo sin whatsapp → error", () => {
    const r = mergeAndValidateDerivaciones({}, { energia: { activo: true, nombre: "X", whatsapp: "" } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("derivaciones_activo_sin_whatsapp");
  });

  it("whatsapp con texto inválido → error", () => {
    const r = mergeAndValidateDerivaciones({}, { agua: { activo: false, nombre: "", whatsapp: "abc" } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("derivaciones_whatsapp_invalido");
  });
});
