import express from "express";
import ExcelJS from "exceljs";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { sociosCatalogoWhereForApi } from "../utils/sociosCatalogScope.js";

const router = express.Router();

const ALL_COLS = [
  { key: "nis_medidor", label: "NIS / Medidor", width: 16 },
  { key: "medidor", label: "Medidor", width: 14 },
  { key: "nombre", label: "Nombre", width: 28 },
  { key: "localidad", label: "Localidad", width: 18 },
  { key: "provincia", label: "Provincia", width: 16 },
  { key: "codigo_postal", label: "Cód. postal", width: 10 },
  { key: "barrio", label: "Barrio", width: 16 },
  { key: "calle", label: "Calle", width: 24 },
  { key: "numero", label: "Nº", width: 8 },
  { key: "telefono", label: "Teléfono", width: 16 },
  { key: "lat", label: "Lat", width: 12 },
  { key: "lng", label: "Lon", width: 12 },
  { key: "activo", label: "Estado", width: 10 },
  { key: "distribuidor", label: "Distribuidor", width: 16 },
  { key: "datos_extra", label: "Datos extra", width: 30 },
];

/**
 * GET /api/socios/exportar
 * Excel (.xlsx) del catálogo acotado al tenant de sesión (y línea de negocio activa si aplica en BD), paridad con el listado admin.
 */
router.get("/exportar", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const { where, params } = await sociosCatalogoWhereForApi(req);

    const existing = [];
    for (const c of ALL_COLS) {
      if (await tableHasColumn("socios_catalogo", c.key)) existing.push(c);
    }

    if (!existing.length) {
      return res.status(404).json({ ok: false, error: "Tabla socios_catalogo sin columnas exportables" });
    }

    const selectCols = existing.map((c) => c.key).join(", ");
    const sql = `SELECT ${selectCols} FROM socios_catalogo${where} ORDER BY nombre ASC NULLS LAST`;
    const result = await query(sql, params);

    const wb = new ExcelJS.Workbook();
    wb.creator = "GestorNova";
    wb.created = new Date();

    const ws = wb.addWorksheet("Socios");

    ws.columns = existing.map((c) => ({
      header: c.label,
      key: c.key,
      width: c.width,
    }));

    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };

    for (const row of result.rows) {
      const values = existing.map((c) => {
        if (c.key === "activo") {
          return row[c.key] === false ? "Inactivo" : "Activo";
        }
        if (c.key === "datos_extra" && row[c.key] && typeof row[c.key] === "object") {
          return JSON.stringify(row[c.key]);
        }
        return row[c.key] ?? "";
      });
      ws.addRow(values);
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
