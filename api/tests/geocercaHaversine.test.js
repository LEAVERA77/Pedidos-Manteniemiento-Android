import { describe, it, expect } from "vitest";
import { distanciaMetrosHaversine } from "../services/geocercaHaversine.js";

describe("geocercaHaversine", () => {
  it("distancia ~0 mismo punto", () => {
    expect(distanciaMetrosHaversine(-34.6, -58.4, -34.6, -58.4)).toBeLessThan(1);
  });
  it("100 m aprox en latitud fija", () => {
    const d = distanciaMetrosHaversine(-34.6, -58.4, -34.6009, -58.4);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});
