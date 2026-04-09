import { describe, it, expect, vi } from "vitest";

vi.mock("../db/neon.js", () => ({
  query: vi.fn(async () => ({ rows: [] })),
}));

import {
  normalizarIdentificadorReclamoWhatsapp,
  soloDigitosIdentificadorReclamo,
  sqlDigitosContieneSubcadena,
} from "../services/whatsappReclamanteLookup.js";

describe("whatsappReclamanteLookup — normalización", () => {
  it("normaliza espacios raros y trim", () => {
    expect(normalizarIdentificadorReclamoWhatsapp("  74133 \u00a0")).toBe("74133");
  });

  it("quita BOM y marcas de dirección implícita", () => {
    expect(normalizarIdentificadorReclamoWhatsapp("\uFEFF37985")).toBe("37985");
  });

  it("soloDigitos quita separadores comunes", () => {
    expect(soloDigitosIdentificadorReclamo("74.133")).toBe("74133");
    expect(soloDigitosIdentificadorReclamo("074-133")).toBe("074133");
  });

  it("sqlDigitosContieneSubcadena usa strpos sobre dígitos normalizados", () => {
    const s = sqlDigitosContieneSubcadena("medidor::text", 2);
    expect(s).toContain("strpos");
    expect(s).toContain("medidor::text");
    expect(s).toContain("$2::text");
  });
});
