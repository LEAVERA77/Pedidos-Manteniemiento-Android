import { describe, it, expect } from "vitest";
import { enFlujoReclamoWhatsapp } from "../services/whatsapp-bot-flujo-reclamo.js";

describe("whatsapp-bot-flujo-reclamo", () => {
  it("identificacion activa bloquea menú principal", () => {
    expect(
      enFlujoReclamoWhatsapp({
        step: "awaiting_identificacion_modo",
        tipo: "Alumbrado Público (Mantenimiento)",
        descripcion: "farola quemada",
      })
    ).toBe(true);
  });

  it("idle sin datos no es flujo", () => {
    expect(enFlujoReclamoWhatsapp(null)).toBe(false);
    expect(enFlujoReclamoWhatsapp({ step: "idle" })).toBe(false);
  });

  it("tipo y descripción sin step cuenta como flujo", () => {
    expect(
      enFlujoReclamoWhatsapp({
        tipo: "Alumbrado Público (Mantenimiento)",
        descripcion: "farola quemada",
      })
    ).toBe(true);
  });
});
