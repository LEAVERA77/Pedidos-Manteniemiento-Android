/**
 * Mock de `fetch` en cadena: cada llamada a Nominatim consume el siguiente JSON del array `queue`.
 * `NOMINATIM_THROTTLE_MS_FOR_TESTS=0` evita esperas del throttle (~1.1s) entre requests en `nominatimClient.js`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewboxStringFromBBox } from "../services/nominatimClient.js";

describe("geocodeCalleNumeroLocalidadArgentina (fetch mock)", () => {
  let geocodeCalleNumeroLocalidadArgentina;

  const bboxHasenkamp = { minLat: -32.05, maxLat: -31.85, minLon: -59.25, maxLon: -58.95 };
  const precomputedViewboxMeta = {
    viewboxStr: viewboxStringFromBBox(bboxHasenkamp),
    bbox: bboxHasenkamp,
  };

  function mockFetchQueue(queue) {
    let i = 0;
    globalThis.fetch = vi.fn(async () => {
      const body = i < queue.length ? queue[i++] : [];
      return { ok: true, json: async () => body };
    });
  }

  beforeEach(async () => {
    process.env.NOMINATIM_THROTTLE_MS_FOR_TESTS = "0";
    vi.resetModules();
    ({ geocodeCalleNumeroLocalidadArgentina } = await import("../services/nominatimClient.js"));
  });

  afterEach(() => {
    delete process.env.NOMINATIM_THROTTLE_MS_FOR_TESTS;
    delete process.env.NOMINATIM_HOUSE_PARITY_MAX_STEPS;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("(a) viewbox precomputado + structured calle+número en la localidad → coordenadas", async () => {
    const goodHit = {
      lat: "-31.95",
      lon: "-59.10",
      display_name: "San Martín 100, Hasenkamp, Entre Ríos, Argentina",
      address: {
        road: "San Martín",
        house_number: "100",
        city: "Hasenkamp",
        state: "Entre Ríos",
      },
    };
    mockFetchQueue([[goodHit]]);

    const r = await geocodeCalleNumeroLocalidadArgentina("Hasenkamp", "San Martín", "100", {
      catalogStrict: true,
      precomputedViewboxMeta,
    });

    expect(r).not.toBeNull();
    expect(r.lat).toBeCloseTo(-31.95, 4);
    expect(r.lng).toBeCloseTo(-59.1, 4);
    expect(r.audit?.source).toBe("structured_exact");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("(b) número inexistente: structured vacío en el exacto y acierto en misma paridad (729)", async () => {
    process.env.NOMINATIM_HOUSE_PARITY_MAX_STEPS = "8";
    const hit729 = {
      lat: "-31.96",
      lon: "-59.11",
      display_name: "San Martín 729, Hasenkamp, Argentina",
      address: { road: "San Martín", house_number: "729", city: "Hasenkamp" },
    };
    mockFetchQueue([[], [hit729]]);

    const r = await geocodeCalleNumeroLocalidadArgentina("Hasenkamp", "San Martín", "731", {
      catalogStrict: true,
      precomputedViewboxMeta,
    });

    expect(r).not.toBeNull();
    expect(r.audit?.approximate).toBe(true);
    expect(r.audit?.usedHouseNumber).toBe(729);
    expect(r.audit?.source).toBe("structured_parity_fallback");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("(c) catalogStrict: candidato fuera del viewbox no se usa; resultado null", async () => {
    process.env.NOMINATIM_HOUSE_PARITY_MAX_STEPS = "0";
    const outsideBBox = {
      lat: "-30.00",
      lon: "-58.00",
      display_name: "San Martín 731, Hasenkamp, Argentina",
      address: { road: "San Martín", house_number: "731", city: "Hasenkamp" },
    };
    mockFetchQueue([
      [outsideBBox],
      [],
      [],
      [],
      [],
    ]);

    const r = await geocodeCalleNumeroLocalidadArgentina("Hasenkamp", "San Martín", "731", {
      catalogStrict: true,
      precomputedViewboxMeta,
    });

    expect(r).toBeNull();
    expect(globalThis.fetch.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
