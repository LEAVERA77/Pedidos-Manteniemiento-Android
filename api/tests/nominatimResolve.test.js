import { describe, it, expect } from "vitest";
import { resolveStructuredAddressCoords } from "../services/nominatimClient.js";

describe("resolveStructuredAddressCoords sin GPS (paridad)", () => {
  const hits = [
    { lat: -31, lng: -60, houseNum: 1100, displayName: "x" },
    { lat: -31.001, lng: -60, houseNum: 1103, displayName: "x" },
    { lat: -31.002, lng: -60, houseNum: 1107, displayName: "x" },
  ];

  it("número impar inexistente → elige impar más cercano en la calle", () => {
    const r = resolveStructuredAddressCoords({
      houseHits: hits,
      streetCenter: null,
      targetNum: 1105,
      userGps: null,
      fallbackCity: null,
    });
    expect(r.source).toBe("house_search_parity");
    expect([1103, 1107]).toContain(r.anchorHouse);
    expect(r.anchorHouse % 2).toBe(1);
  });

  it("número par inexistente → elige par más cercano", () => {
    const r = resolveStructuredAddressCoords({
      houseHits: hits,
      streetCenter: null,
      targetNum: 1104,
      userGps: null,
      fallbackCity: null,
    });
    expect(r.anchorHouse).toBe(1100);
    expect(r.anchorHouse % 2).toBe(0);
  });

  it("sin frentes numerados → eje de calle", () => {
    const r = resolveStructuredAddressCoords({
      houseHits: [],
      streetCenter: { lat: -31.5, lng: -60.5, displayName: "calle" },
      targetNum: 1105,
      userGps: null,
      fallbackCity: null,
    });
    expect(r.source).toBe("street_center");
    expect(r.lat).toBe(-31.5);
  });
});
