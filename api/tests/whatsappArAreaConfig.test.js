import { describe, it, expect } from "vitest";
import {
  normLocalityHint,
  resolveArgentinaAreaDigitsFromConfig,
  normalizeArgentinaMobileWithTenantAreaConfig,
} from "../utils/whatsappArAreaConfig.js";

describe("whatsappArAreaConfig", () => {
  it("resuelve por coincidencia de localidad en el mapa", () => {
    const cfg = {
      whatsapp_ar_areas_por_localidad: {
        "La Paz": "3438",
        Paraná: "343",
      },
    };
    expect(resolveArgentinaAreaDigitsFromConfig(cfg, "La Paz")).toBe("3438");
    expect(resolveArgentinaAreaDigitsFromConfig(cfg, "Cerrito, Paraná")).toBe("343");
  });

  it("usa default y prefijos para 15… incompleto", () => {
    const cfg = {
      whatsapp_ar_default_area: "343",
      whatsapp_ar_area_prefixes: ["3438", "343"],
    };
    const n = normalizeArgentinaMobileWithTenantAreaConfig("154540250", cfg, "La Paz");
    expect(n).toBe("5493434540250");
  });

  it("3438 tiene prioridad sobre 343 cuando el mapa lo indica", () => {
    const cfg = {
      whatsapp_ar_areas_por_localidad: { "villa elisa": "3438" },
      whatsapp_ar_area_prefixes: ["343"],
    };
    expect(resolveArgentinaAreaDigitsFromConfig(cfg, "Villa Elisa")).toBe("3438");
  });

  it("normLocalityHint quita acentos", () => {
    expect(normLocalityHint(" Paraná ")).toBe("parana");
  });
});
