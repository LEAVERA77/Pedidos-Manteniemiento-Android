import { describe, it, expect } from "vitest";
import { parseStarRating01a5 } from "../utils/parseStarRating01a5.js";

describe("parseStarRating01a5", () => {
  it("parses digits", () => {
    expect(parseStarRating01a5("5")).toBe(5);
    expect(parseStarRating01a5("1")).toBe(1);
  });
  it("parses spanish words", () => {
    expect(parseStarRating01a5("cinco")).toBe(5);
    expect(parseStarRating01a5("Cuatro")).toBe(4);
  });
  it("parses star emojis by count", () => {
    expect(parseStarRating01a5("⭐⭐⭐")).toBe(3);
  });
  it("returns null for invalid", () => {
    expect(parseStarRating01a5("hola")).toBeNull();
    expect(parseStarRating01a5("8")).toBeNull();
  });
});
