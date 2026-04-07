import { describe, it, expect } from "vitest";
import { escapeCsvCell } from "../utils/csvCells.js";

describe("escapeCsvCell", () => {
  it("pasa números y texto simple", () => {
    expect(escapeCsvCell(1)).toBe("1");
    expect(escapeCsvCell("hola")).toBe("hola");
  });

  it("entrecomilla si hay coma o salto", () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('x"y')).toBe('"x""y"');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });

  it("null/undefined → vacío", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
});
