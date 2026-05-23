import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/neon.js", () => ({
  query: vi.fn(),
}));

vi.mock("../utils/tenantScope.js", () => ({
  tableHasColumn: vi.fn(async () => true),
}));

vi.mock("../utils/businessScope.js", () => ({
  loadTenantBusinessContext: vi.fn(async () => ({
    activeBusinessType: "electricidad",
    businessTypeFilterEnabled: false,
  })),
}));

vi.mock("../modules/busqueda-nombre-bot.js", () => ({
  buscarFilasPorNombreSociosCatalogo: vi.fn(async () => [
    {
      id: 1,
      nombre: "Garcia Juan",
      nombre_dist: 1,
      nis: "123",
      medidor: null,
      nis_medidor: "123",
      calle: "San Martin",
      numero: "100",
      localidad: "Rosario",
      barrio: null,
      telefono: null,
      tipo_conexion: "Aereo",
      fases: "Monofasico",
    },
  ]),
  levenshteinDistance: vi.fn(() => 1),
  normalizarTextoBusquedaNombreWa: vi.fn((t) =>
    String(t || "")
      .toLowerCase()
      .trim()
  ),
}));

vi.mock("../services/whatsappReclamanteLookup.js", () => ({
  buscarIdentidadParaReclamoWhatsApp: vi.fn(async () => ({ skip: true })),
}));

import { query } from "../db/neon.js";
import { buscarPadronPorIdentificador, buscarPadronPorNombre } from "../services/padronBusquedaPedido.js";

describe("padronBusquedaPedido", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it("buscar-identificador devuelve filas de socios_catalogo", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 5, nombre: "Test", nis_medidor: "99", nis: "99" }] })
      .mockResolvedValueOnce({ rows: [] });
    const { matches } = await buscarPadronPorIdentificador(1, "99");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].identificador).toBeTruthy();
  });

  it("buscar-nombre delega en busqueda Levenshtein", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ tipo: "cooperativa_electrica" }] });
    const { matches } = await buscarPadronPorNombre(1, "Garcia");
    expect(matches.length).toBe(1);
    expect(matches[0].nombre).toContain("Garcia");
  });
});
