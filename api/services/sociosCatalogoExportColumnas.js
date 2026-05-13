/**
 * Columnas reales de `socios_catalogo` en Neon (orden ordinal) para export fiel a la tabla.
 * made by leavera77
 */

import { query } from "../db/neon.js";

/** @param {string} name */
export function quoteIdentSociosCol(name) {
  const s = String(name || "").trim();
  if (!s) return '""';
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * @returns {Promise<string[]>}
 */
export async function listSociosCatalogoColumnNamesOrdered() {
  const r = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'socios_catalogo'
     ORDER BY ordinal_position`
  );
  return (r.rows || []).map((row) => String(row.column_name || "").trim()).filter(Boolean);
}

/** @param {unknown} v */
export function stringifySociosExportCell(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString();
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  return v;
}
