import express from "express";
import ExcelJS from "exceljs";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";

const router = express.Router();

const COL_LABELS = {
  nis_medidor: "NIS / Medidor",
  nombre: "Nombre",
  direccion: "Dirección",
  telefono: "Teléfono",
  localidad: "Localidad",
  medidor: "Medidor",
};

/**
 * GET /api/socios/exportar
 * Devuelve archivo Excel (.xlsx) con los socios del tenant.
 */
router.get("/exportar", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const hasTenant = await tableHasColumn("socios_catalogo", "tenant_id");
    const params = hasTenant ? [req.tenantId] : [];
    const where = hasTenant ? "WHERE tenant_id = $1" : "";

    const cols = ["nis_medidor", "nombre", "direccion", "telefono", "localidad", "medidor"];
    const existing = [];
    for (const c of cols) {
      if (await tableHasColumn("socios_catalogo", c)) existing.push(c);
    }

    if (!existing.length) {
      return res.status(404).json({ ok: false, error: "Tabla socios_catalogo sin columnas exportables" });
    }

    const sql = `SELECT ${existing.join(", ")} FROM socios_catalogo ${where} ORDER BY nombre ASC NULLS LAST`;
    const result = await query(sql, params);

    const wb = new ExcelJS.Workbook();
    wb.creator = "GestorNova";
    wb.created = new Date();

    const ws = wb.addWorksheet("Socios");

    ws.columns = existing.map((col) => ({
      header: COL_LABELS[col] || col,
      key: col,
      width: col === "nombre" || col === "direccion" ? 30 : 18,
    }));

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    for (const row of result.rows) {
      ws.addRow(existing.map((col) => row[col] ?? ""));
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `socios_${fecha}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("[socios/exportar]", error);
    return res.status(500).json({ ok: false, error: "Error al exportar socios" });
  }
});

export default router;
