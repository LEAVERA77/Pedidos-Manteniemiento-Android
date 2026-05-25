/**
 * Export distribuidores_red → Excel (todas las columnas de la tabla).
 * made by leavera77
 */

import XLSX from "xlsx";
import { formatNivelTensionKvFromDb } from "../utils/nivelTensionKv.js";

const EXPORT_HEADERS = [
  "id",
  "tenant_id",
  "codigo",
  "nombre",
  "localidad",
  "nivel_tension",
  "trafos",
  "kva",
  "clientes",
  "created_at",
  "updated_at",
];

/**
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Buffer}
 */
export function buildDistribuidoresRedExcelBuffer(rows) {
  const data = (rows || []).map((r) => ({
    id: r.id ?? "",
    tenant_id: r.tenant_id ?? "",
    codigo: r.codigo ?? "",
    nombre: r.nombre ?? "",
    localidad: r.localidad ?? "",
    nivel_tension: formatNivelTensionKvFromDb(r.nivel_tension, !!r.nivel_tension_kv_decimal),
    trafos: r.trafos ?? "",
    kva: r.kva ?? "",
    clientes: r.clientes ?? "",
    created_at: r.created_at ?? "",
    updated_at: r.updated_at ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: EXPORT_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "distribuidores_red");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
