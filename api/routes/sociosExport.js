import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";

const router = express.Router();

/**
 * GET /api/socios/exportar
 * Devuelve CSV con NIS, nombre, dirección, teléfono de socios del tenant.
 */
router.get("/exportar", authWithTenantHost, adminOnly, async (req, res) => {
  try {
    const hasTenant = await tableHasColumn("socios_catalogo", "tenant_id");
    const params = hasTenant ? [req.tenantId] : [];
    const where = hasTenant ? "WHERE tenant_id = $1" : "";

    const cols = [
      "nis_medidor",
      "nombre",
      "direccion",
      "telefono",
      "localidad",
      "medidor",
    ];

    const existing = [];
    for (const c of cols) {
      if (await tableHasColumn("socios_catalogo", c)) existing.push(c);
    }

    if (!existing.length) {
      return res.status(404).json({ ok: false, error: "Tabla socios_catalogo sin columnas exportables" });
    }

    const sql = `SELECT ${existing.join(", ")} FROM socios_catalogo ${where} ORDER BY nombre ASC NULLS LAST`;
    const result = await query(sql, params);

    const BOM = "\uFEFF";
    const header = existing.join(";");
    const rows = result.rows.map((row) =>
      existing.map((col) => {
        const v = row[col];
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
      }).join(";")
    );

    const csv = BOM + header + "\n" + rows.join("\n");

    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `socios_${fecha}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    console.error("[socios/exportar]", error);
    return res.status(500).json({ ok: false, error: "Error al exportar socios" });
  }
});

export default router;
