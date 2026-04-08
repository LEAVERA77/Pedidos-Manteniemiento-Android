import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isGeocodePlausibleForLocalityAnchor,
  maxMetersFromLocalityAnchorForBot,
  haversineMeters,
} from "../services/nominatimClient.js";

describe("maxMetersFromLocalityAnchorForBot", () => {
  const prev = process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY;

  afterEach(() => {
    if (prev === undefined) delete process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY;
    else process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY = prev;
  });

  it("default ~22 km", () => {
    delete process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY;
    expect(maxMetersFromLocalityAnchorForBot()).toBe(22000);
  });

  it("clamps to 5–200 km", () => {
    process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY = "3";
    expect(maxMetersFromLocalityAnchorForBot()).toBe(5000);
    process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY = "250";
    expect(maxMetersFromLocalityAnchorForBot()).toBe(200000);
  });
});

describe("isGeocodePlausibleForLocalityAnchor", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY;
  });

  const hasenkamp = { lat: -31.509706, lng: -59.836891 };
  const cerritoWrong = { lat: -31.581991, lng: -60.076385 };

  it("sin ancla → acepta (no aplica tope)", () => {
    expect(isGeocodePlausibleForLocalityAnchor(cerritoWrong.lat, cerritoWrong.lng, null)).toBe(true);
    expect(isGeocodePlausibleForLocalityAnchor(cerritoWrong.lat, cerritoWrong.lng, undefined)).toBe(true);
  });

  it("Hasenkamp vs pin erróneo tipo Cerrito → fuera de radio (default 22 km)", () => {
    const d = haversineMeters(hasenkamp.lat, hasenkamp.lng, cerritoWrong.lat, cerritoWrong.lng);
    expect(d).toBeGreaterThan(22000);
    expect(isGeocodePlausibleForLocalityAnchor(cerritoWrong.lat, cerritoWrong.lng, hasenkamp)).toBe(false);
  });

  it("punto cercano al ancla → plausible", () => {
    const near = { lat: -31.51, lng: -59.84 };
    expect(isGeocodePlausibleForLocalityAnchor(near.lat, near.lng, hasenkamp)).toBe(true);
  });

  it("homónimo lejano: Rosario Santa Fe vs Santa Fe capital (orden de magnitud)", () => {
    process.env.WHATSAPP_GEOCODE_MAX_KM_FROM_LOCALITY = "45";
    const rosario = { lat: -32.944242, lng: -60.650538 };
    const santaFeCapital = { lat: -31.633981, lng: -60.698555 };
    const d = haversineMeters(rosario.lat, rosario.lng, santaFeCapital.lat, santaFeCapital.lng);
    expect(d).toBeGreaterThan(100000);
    expect(isGeocodePlausibleForLocalityAnchor(santaFeCapital.lat, santaFeCapital.lng, rosario)).toBe(false);
  });
});
