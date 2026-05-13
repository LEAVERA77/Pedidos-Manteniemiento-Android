import express from "express";
import ExcelJS from "exceljs";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { sociosCatalogoWhereForApi } from "../utils/sociosCatalogScope.js";
import {
  listSociosCatalogoColumnNamesOrdered,
  quoteIdentSociosCol,
  stringifySociosExportCell,
} from "../services/sociosCatalogoExportColumnas.js";

const router = express.Router();

/**
 * GET /api/socios/exportar
 * Excel (.xlsx): **todas** las columnas existentes en `socios_catalogo` (orden BD), acotado al tenant de sesión
 * (y línea de negocio activa si aplica). Copia fiel para respaldo / restauración.
 */
router.get("/exportar", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const { where, params } = await sociosCatalogoWhereForApi(req);

    const colNames = await listSociosCatalogoColumnNamesOrdered();
    if (!colNames.length) {
      return res.status(404).json({ ok: false, error: "Tabla socios_catalogo no encontrada o sin columnas" });
    }

    const selectList = colNames.map(quoteIdentSociosCol).join(", ");
    const orderCol = colNames.includes("id") ? quoteIdentSociosCol("id") : quoteIdentSociosCol(colNames[0]);
    const sql = `SELECT ${selectList} FROM socios_catalogo${where} ORDER BY ${orderCol} ASC NULLS LAST`;
    const result = await query(sql, params);

    const wb = new ExcelJS.Workbook();
    wb.creator = "GestorNova";
    wb.created = new Date();

    const ws = wb.addWorksheet("Socios");

    ws.addRow(colNames);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };

    for (const row of result.rows) {
      ws.addRow(colNames.map((k) => stringifySociosExportCell(row[k])));
    }

    colNames.forEach((name, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(48, Math.max(10, String(name).length + 4));
    });

    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `socios_catalogo_completo_${fecha}.xlsx`;

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
