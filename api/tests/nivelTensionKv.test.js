import { describe, it, expect } from "vitest";
import { parseNivelTensionExcelToDb, formatNivelTensionKvFromDb } from "../utils/nivelTensionKv.js";

describe("nivelTensionKv", () => {
  it("importa decimal solo si viene en Excel", () => {
    expect(parseNivelTensionExcelToDb("13.2")).toBe(13.2);
    expect(parseNivelTensionExcelToDb("13,2")).toBe(13.2);
  });

  it("importa enteros sin convertir a décimas", () => {
    expect(parseNivelTensionExcelToDb("33")).toBe(33);
    expect(parseNivelTensionExcelToDb("132")).toBe(132);
  });

  it("muestra sin punto si es entero", () => {
    expect(formatNivelTensionKvFromDb(33)).toBe("33");
    expect(formatNivelTensionKvFromDb(132)).toBe("132");
  });

  it("muestra con punto si hay decimales", () => {
    expect(formatNivelTensionKvFromDb(13.2)).toBe("13.2");
  });
});
