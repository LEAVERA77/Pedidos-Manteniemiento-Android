import { describe, it, expect } from "vitest";
import XLSX from "../utils/xlsxNode.js";
import ExcelJS from "exceljs";
import express from "express";
import multer from "multer";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("compatibilidad de dependencias de planillas", () => {
  it("SheetJS genera y lee XLSX desde memoria y archivo", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gn-xlsx-"));
    try {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ nis: "12", nombre: "García" }]), "Socios");
      const file = join(dir, "prueba.xlsx");
      XLSX.writeFile(wb, file);
      const data = XLSX.readFile(file);
      expect(XLSX.utils.sheet_to_json(data.Sheets.Socios)).toEqual([{ nis: "12", nombre: "García" }]);
      const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      expect(XLSX.utils.sheet_to_json(XLSX.read(bytes, { type: "buffer" }).Sheets.Socios)[0].nis).toBe("12");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("Multer procesa multipart y aplica el límite de archivo", async () => {
    const app = express();
    app.post("/upload", multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 } }).single("file"),
      (req, res) => res.json({ value: req.file.buffer.toString("utf8") }));
    app.use((err, _req, res, _next) => res.status(413).json({ code: err.code }));
    const ok = await request(app).post("/upload").attach("file", Buffer.from("hola"), "a.txt");
    expect(ok.status).toBe(200);
    expect(ok.body.value).toBe("hola");
    const big = await request(app).post("/upload").attach("file", Buffer.from("123456789"), "b.txt");
    expect(big.status).toBe(413);
    expect(big.body.code).toBe("LIMIT_FILE_SIZE");
  });
  it("ExcelJS escribe y vuelve a abrir un libro con el uuid actualizado", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("datos").addRow(["nombre", "García"]);
    const data = await wb.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(data);
    expect(loaded.getWorksheet("datos").getCell("B1").value).toBe("García");
  });
});
