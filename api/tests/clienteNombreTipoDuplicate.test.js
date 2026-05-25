import { describe, it, expect, vi } from "vitest";

vi.mock("../db/neon.js", () => ({ query: vi.fn() }));

import {
  rubroEfectivoClienteRow,
  isTenantSetupIncompleto,
} from "../utils/clienteNombreTipoDuplicate.js";

describe("clienteNombreTipoDuplicate", () => {
  it("rubro desde tipo o active_business_type", () => {
    expect(rubroEfectivoClienteRow({ tipo: "cooperativa_electrica" }, true)).toBe(
      "cooperativa_electrica"
    );
    expect(rubroEfectivoClienteRow({ tipo: null, active_business_type: "electricidad" }, true)).toBe(
      "cooperativa_electrica"
    );
    expect(rubroEfectivoClienteRow({ tipo: "municipio" }, false)).toBe("municipio");
  });

  it("setup incompleto sin flag", () => {
    expect(isTenantSetupIncompleto({})).toBe(true);
    expect(isTenantSetupIncompleto({ setup_wizard_completado: false })).toBe(true);
    expect(isTenantSetupIncompleto({ setup_wizard_completado: true })).toBe(false);
  });
});
