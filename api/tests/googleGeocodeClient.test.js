import { describe, it, expect } from "vitest";
import {
  googleComponentsIncludeLocalidad,
  googleComponentsRouteMatches,
  googleStreetNumberMatches,
  googleLocationTypeRank,
  shouldAcceptGoogleGeocodeForBot,
} from "../services/googleGeocodeClient.js";

describe("googleGeocodeClient — helpers", () => {
  it("googleLocationTypeRank", () => {
    expect(googleLocationTypeRank("ROOFTOP")).toBe(4);
    expect(googleLocationTypeRank("RANGE_INTERPOLATED")).toBe(3);
    expect(googleLocationTypeRank("APPROXIMATE")).toBe(1);
  });

  it("googleComponentsIncludeLocalidad", () => {
    const comps = [
      { long_name: "315", types: ["street_number"] },
      { long_name: "Sarmiento", types: ["route"] },
      { long_name: "Hasenkamp", types: ["locality", "political"] },
    ];
    expect(googleComponentsIncludeLocalidad(comps, "Hasenkamp")).toBe(true);
    expect(googleComponentsIncludeLocalidad(comps, "Rosario")).toBe(false);
  });

  it("googleComponentsRouteMatches", () => {
    const comps = [{ long_name: "Sarmiento", types: ["route"] }];
    expect(googleComponentsRouteMatches(comps, "Av. Sarmiento")).toBe(true);
    expect(googleComponentsRouteMatches(comps, "Mitre")).toBe(false);
  });

  it("googleStreetNumberMatches", () => {
    const comps = [{ long_name: "315", types: ["street_number"] }];
    expect(googleStreetNumberMatches(comps, "315")).toBe(true);
    expect(googleStreetNumberMatches(comps, "316")).toBe(false);
    expect(googleStreetNumberMatches(comps, "0")).toBe(true);
  });
});

describe("shouldAcceptGoogleGeocodeForBot", () => {
  const base = {
    geometry: {
      location: { lat: -31.51, lng: -59.84 },
      location_type: "ROOFTOP",
    },
    types: ["street_address"],
    address_components: [
      { long_name: "315", types: ["street_number"] },
      { long_name: "Sarmiento", types: ["route"] },
      { long_name: "Hasenkamp", types: ["locality", "political"] },
    ],
  };

  it("acepta ROOFTOP + calle/número/localidad", () => {
    expect(
      shouldAcceptGoogleGeocodeForBot(base, {
        localidad: "Hasenkamp",
        calle: "Sarmiento",
        numero: "315",
      })
    ).toBe(true);
  });

  it("rechaza partial_match sin ROOFTOP", () => {
    expect(
      shouldAcceptGoogleGeocodeForBot(
        { ...base, partial_match: true, geometry: { ...base.geometry, location_type: "RANGE_INTERPOLATED" } },
        { localidad: "Hasenkamp", calle: "Sarmiento", numero: "315" }
      )
    ).toBe(false);
  });

  it("rechaza APPROXIMATE", () => {
    expect(
      shouldAcceptGoogleGeocodeForBot(
        { ...base, geometry: { ...base.geometry, location_type: "APPROXIMATE" } },
        { localidad: "Hasenkamp", calle: "Sarmiento", numero: "315" }
      )
    ).toBe(false);
  });

  it("rechaza homónimo de localidad", () => {
    expect(
      shouldAcceptGoogleGeocodeForBot(base, {
        localidad: "Rosario",
        calle: "Sarmiento",
        numero: "315",
      })
    ).toBe(false);
  });
});
