import { describe, it, expect } from "vitest";
import {
  nominatimHitStrictLocalidad,
  iterHouseNumbersSameParity,
  pointInBBox,
  viewboxStringFromBBox,
} from "../services/nominatimClient.js";

describe("nominatimHitStrictLocalidad (homónimos de localidad)", () => {
  it("acepta hit cuya address.city coincide con el catálogo", () => {
    const hit = {
      display_name: "San Martín 100, Hasenkamp, Entre Ríos, Argentina",
      address: { road: "San Martín", house_number: "100", city: "Hasenkamp", state: "Entre Ríos" },
    };
    expect(nominatimHitStrictLocalidad(hit, "Hasenkamp")).toBe(true);
  });

  it("rechaza hit en otra ciudad aunque el nombre de calle sea igual", () => {
    const hit = {
      display_name: "San Martín 100, Cerrito, Entre Ríos, Argentina",
      address: { road: "San Martín", house_number: "100", city: "Cerrito", state: "Entre Ríos" },
    };
    expect(nominatimHitStrictLocalidad(hit, "Hasenkamp")).toBe(false);
  });
});

describe("iterHouseNumbersSameParity (fallback de puerta)", () => {
  it("mantiene paridad y orden por cercanía (±2, ±4, …)", () => {
    expect(iterHouseNumbersSameParity("730", 3)).toEqual([730, 728, 732, 726, 734, 724, 736]);
  });

  it("impar: empieza en el número y alterna hacia abajo/arriba", () => {
    expect(iterHouseNumbersSameParity("731", 2)).toEqual([731, 729, 733, 727, 735]);
  });
});

describe("pointInBBox (viewbox de localidad)", () => {
  const bbox = { minLat: -32.1, maxLat: -31.9, minLon: -59.2, maxLon: -58.9 };

  it("punto dentro → true", () => {
    expect(pointInBBox(-32.0, -59.0, bbox)).toBe(true);
  });

  it("punto fuera (otra localidad) → false", () => {
    expect(pointInBBox(-30.0, -59.0, bbox)).toBe(false);
  });

  it("viewboxStringFromBBox sigue orden Nominatim left,top,right,bottom", () => {
    expect(viewboxStringFromBBox(bbox)).toBe("-59.2,-31.9,-58.9,-32.1");
  });
});
