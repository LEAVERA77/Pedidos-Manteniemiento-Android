import { describe, it, expect } from "vitest";
import { coordsPassLocalityCentroidGuard } from "../services/nominatimClient.js";

describe("coordsPassLocalityCentroidGuard", () => {
  /** Centro aproximado Nominatim de Hasenkamp (Entre Ríos). */
  const centerHasenkamp = { lat: -31.51, lng: -59.84 };
  const vbMetaNominal = { center: centerHasenkamp, fromTenantCentroid: false };

  it("acepta domicilio coherente con el centroide (ej. Sarmiento 315)", () => {
    expect(coordsPassLocalityCentroidGuard(-31.509706, -59.836891, vbMetaNominal, 20000)).toBe(true);
  });

  it("rechaza punto lejano (ej. zona Cerrito vs centroide Hasenkamp en ~24 km)", () => {
    const wrong = { lat: -31.581991, lng: -60.076385 };
    expect(coordsPassLocalityCentroidGuard(wrong.lat, wrong.lng, vbMetaNominal, 20000)).toBe(false);
  });

  it("no aplica tope de distancia si el viewbox vino del centro del tenant", () => {
    expect(
      coordsPassLocalityCentroidGuard(-40, -60, { fromTenantCentroid: true, center: centerHasenkamp }, 1000)
    ).toBe(true);
  });

  it("sin centro en vbMeta no rechaza por distancia", () => {
    expect(coordsPassLocalityCentroidGuard(-31.58, -60.07, {}, 20000)).toBe(true);
  });
});
