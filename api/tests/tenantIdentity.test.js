import { describe, it, expect } from "vitest";
import { normalizeCompanyNameKey, tenantIdentityPairKey } from "../utils/tenantIdentity.js";

describe("tenantIdentity", () => {
  it("normaliza espacios y mayúsculas", () => {
    expect(normalizeCompanyNameKey("  Coop   Alpha  ")).toBe("coop alpha");
  });

  it("pairKey alinea nombre y business_type", () => {
    expect(tenantIdentityPairKey("Coop Alpha", "electricidad")).toBe("coop alpha|electricidad");
  });
});
