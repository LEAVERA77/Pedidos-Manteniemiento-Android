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
import {
  resolveRubroClienteParaExportSocios,
  buildSociosVistaExportSelectPlan,
  sociosVistaExportCellValue,
  buildSociosExportOrderByKey,
} from "../services/sociosCatalogoExportVistaAdmin.js";

const router = express.Router();

/**
 * GET /api/socios/exportar
 * Por defecto: Excel (.xlsx) **vista admin** (mismas columnas que la tabla en pantalla por rubro + tenant).
 * `?completo=1`: todas las columnas físicas de `socios_catalogo` (respaldo técnico).
 */
router.get("/exportar", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const authTid = Number(req.tenantId);
    const claimed = Number(req.query?.tenant_id);
    if (Number.isFinite(claimed) && claimed > 0 && Number.isFinite(authTid) && authTid > 0 && claimed !== authTid) {
      console.warn("[socios/exportar] tenant_id en query distinto de sesión API", { claimed, authTid });
      return res.status(409).json({
        ok: false,
        error:
          "El tenant indicado no coincide con la sesión del servidor. Recargá la página o volvé a iniciar sesión.",
        tenant_sesion: authTid,
        tenant_solicitado: claimed,
      });
    }

    const { where, params } = await sociosCatalogoWhereForApi(req);
    const modoCompleto = String(req.query?.completo || "").trim() === "1";

    let headerLabels;
    let sqlColNames;
    let orderCol;

    if (modoCompleto) {
      sqlColNames = await listSociosCatalogoColumnNamesOrdered();
      if (!sqlColNames.length) {
        return res.status(404).json({ ok: false, error: "Tabla socios_catalogo no encontrada o sin columnas" });
      }
      headerLabels = sqlColNames;
      orderCol = sqlColNames.includes("id") ? quoteIdentSociosCol("id") : quoteIdentSociosCol(sqlColNames[0]);
    } else {
      const rubro = await resolveRubroClienteParaExportSocios(req);
      const plan = await buildSociosVistaExportSelectPlan(rubro);
      sqlColNames = [...plan.keys];
      const abt =
        req?.businessTypeFilterEnabled && req?.activeBusinessType
          ? String(req.activeBusinessType).trim().toLowerCase()
          : "";
      if (plan.allTableCols.has("business_type") && (abt === "electricidad" || abt === "agua" || abt === "municipio")) {
        if (!sqlColNames.includes("business_type")) sqlColNames.push("business_type");
      }
      headerLabels = [...plan.labels];
      if (sqlColNames.length > plan.labels.length && sqlColNames[sqlColNames.length - 1] === "business_type") {
        headerLabels.push("business_type");
      }
      orderCol = buildSociosExportOrderByKey(plan.keys);
    }

    const selectList = sqlColNames.map(quoteIdentSociosCol).join(", ");
    const sql = `SELECT ${selectList} FROM socios_catalogo${where} ORDER BY ${orderCol} ASC NULLS LAST`;
    const result = await query(sql, params);

    let rows = result.rows || [];
    if (sqlColNames.includes("tenant_id") && Number.isFinite(authTid) && authTid > 0) {
      const out = rows.filter((row) => Number(row.tenant_id) === authTid);
      if (out.length < rows.length) {
        console.warn("[socios/exportar] se descartaron filas con tenant_id distinto al de sesión", {
          authTid,
          descartadas: rows.length - out.length,
        });
      }
      rows = out;
    }

    const abt =
      req?.businessTypeFilterEnabled && req?.activeBusinessType
        ? String(req.activeBusinessType).trim().toLowerCase()
        : "";
    if (
      !modoCompleto &&
      sqlColNames.includes("business_type") &&
      (abt === "electricidad" || abt === "agua" || abt === "municipio")
    ) {
      const n0 = rows.length;
      rows = rows.filter((row) => {
        const b = String(row.business_type ?? "")
          .trim()
          .toLowerCase();
        return !b || b === abt;
      });
      if (rows.length < n0) {
        console.warn("[socios/exportar] filas descartadas por business_type distinto a la línea activa", {
          abt,
          n: n0 - rows.length,
        });
      }
    }

    if (!modoCompleto && sqlColNames.includes("business_type")) {
      const wi = sqlColNames.indexOf("business_type");
      if (wi >= 0) {
        sqlColNames = sqlColNames.filter((_, j) => j !== wi);
        headerLabels = headerLabels.filter((_, j) => j !== wi);
        rows = rows.map((row) => {
          const copy = { ...row };
          delete copy.business_type;
          return copy;
        });
      }
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "GestorNova";
    wb.created = new Date();

    const ws = wb.addWorksheet("Socios");

    ws.addRow(headerLabels);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };

    for (const row of rows) {
      if (modoCompleto) {
        ws.addRow(sqlColNames.map((k) => stringifySociosExportCell(row[k])));
      } else {
        ws.addRow(sqlColNames.map((k) => sociosVistaExportCellValue(k, row[k])));
      }
    }

    sqlColNames.forEach((name, i) => {
      const col = ws.getColumn(i + 1);
      const lab = headerLabels[i] || name;
      col.width = Math.min(48, Math.max(10, String(lab).length + 4));
    });

    const fecha = new Date().toISOString().slice(0, 10);
    const tidPart = Number.isFinite(authTid) && authTid > 0 ? `_t${authTid}` : "";
    const suf = modoCompleto ? "_completo" : "_vista";
    const filename = `socios_catalogo${suf}${tidPart}_${fecha}.xlsx`;

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
