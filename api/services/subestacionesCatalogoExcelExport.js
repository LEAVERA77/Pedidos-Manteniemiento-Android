/**
 * Export subestaciones_catalogo → Excel.
 * made by leavera77
 */

import XLSX from "xlsx";

const EXPORT_HEADERS = [
  "id",
  "tenant_id",
  "codigo",
  "nombre",
  "subestacion",
  "distribuidor_codigo",
  "capacidad_kva",
  "clientes_conectados",
  "barrio",
  "alimentador",
  "localidad",
  "created_at",
  "updated_at",
];

/**
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Buffer}
 */
export function buildSubestacionesCatalogoExcelBuffer(rows) {
  const data = (rows || []).map((r) => ({
    id: r.id ?? "",
    tenant_id: r.tenant_id ?? "",
    codigo: r.codigo ?? "",
    nombre: r.nombre ?? "",
    subestacion: r.subestacion ?? "",
    distribuidor_codigo: r.distribuidor_codigo ?? "",
    capacidad_kva: r.capacidad_kva ?? "",
    clientes_conectados: r.clientes_conectados ?? "",
    barrio: r.barrio ?? "",
    alimentador: r.alimentador ?? "",
    localidad: r.localidad ?? "",
    created_at: r.created_at ?? "",
    updated_at: r.updated_at ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: EXPORT_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "subestaciones");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
