/**
 * Export Excel socios alineado a la tabla admin (rubro + tenant), no dump de todas las columnas físicas.
 * Paridad conceptual con `modules/socios-catalogo-export-vista.js` (mantener columnas/labels coherentes).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import {
  businessTypeToRubroParaTipos,
  normalizeBusinessTypeInput,
} from "./businessType.js";
import { listSociosCatalogoColumnNamesOrdered, quoteIdentSociosCol } from "./sociosCatalogoExportColumnas.js";

/** @returns {'cooperativa_electrica'|'cooperativa_agua'|'municipio'} */
export async function resolveRubroClienteParaExportSocios(req) {
  if (req?.businessTypeFilterEnabled && req?.activeBusinessType) {
    return businessTypeToRubroParaTipos(req.activeBusinessType);
  }
  const tid = Number(req?.tenantId);
  if (!Number.isFinite(tid) || tid < 1) return "cooperativa_electrica";
  try {
    const r = await query(`SELECT tipo FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
    const bt = normalizeBusinessTypeInput(r.rows?.[0]?.tipo);
    return businessTypeToRubroParaTipos(bt || "electricidad");
  } catch {
    return "cooperativa_electrica";
  }
}

/**
 * @param {'cooperativa_electrica'|'cooperativa_agua'|'municipio'} rubro
 * @returns {{ keys: string[], labels: string[] }}
 */
export function sociosVistaAdminExportSpec(rubro) {
  if (rubro === "municipio") {
    return {
      keys: [
        "nis_medidor",
        "nombre",
        "localidad",
        "provincia",
        "codigo_postal",
        "barrio",
        "calle",
        "numero",
        "telefono",
        "latitud",
        "longitud",
        "activo",
      ],
      labels: [
        "ID vecino",
        "Nombre",
        "Localidad",
        "Provincia",
        "Cód. postal",
        "Barrio",
        "Calle",
        "Nº",
        "Tel.",
        "Lat (WGS84)",
        "Lon (WGS84)",
        "Estado",
      ],
    };
  }
  if (rubro === "cooperativa_agua") {
    return {
      keys: [
        "nis_medidor",
        "nis",
        "medidor",
        "nombre",
        "localidad",
        "provincia",
        "codigo_postal",
        "barrio",
        "calle",
        "numero",
        "telefono",
        "distribuidor_codigo",
        "latitud",
        "longitud",
        "activo",
      ],
      labels: [
        "NIS/Medidor",
        "NIS",
        "Medidor",
        "Nombre",
        "Localidad",
        "Provincia",
        "Cód. postal",
        "Barrio",
        "Calle",
        "Nº",
        "Tel.",
        "Dist.",
        "Lat (WGS84)",
        "Lon (WGS84)",
        "Estado",
      ],
    };
  }
  return {
    keys: [
      "nis_medidor",
      "nis",
      "medidor",
      "nombre",
      "localidad",
      "provincia",
      "codigo_postal",
      "barrio",
      "calle",
      "numero",
      "telefono",
      "distribuidor_codigo",
      "tipo_tarifa",
      "urbano_rural",
      "transformador",
      "tipo_conexion",
      "fases",
      "latitud",
      "longitud",
      "activo",
    ],
    labels: [
      "NIS/Medidor",
      "NIS",
      "Medidor",
      "Nombre",
      "Localidad",
      "Provincia",
      "Cód. postal",
      "Barrio",
      "Calle",
      "Nº",
      "Tel.",
      "Dist.",
      "Tarifa",
      "U/R",
      "Transf.",
      "Conex.",
      "Fases",
      "Lat (WGS84)",
      "Lon (WGS84)",
      "Estado",
    ],
  };
}

export function formatSociosActivoCelda(v) {
  if (v === false || v === 0 || String(v).toLowerCase() === "false") return "Baja";
  return "Activo";
}

/**
 * @param {'cooperativa_electrica'|'cooperativa_agua'|'municipio'} rubro
 * @returns {Promise<{ keys: string[], labels: string[], allTableCols: Set<string> }>}
 */
export async function buildSociosVistaExportSelectPlan(rubro) {
  const spec = sociosVistaAdminExportSpec(rubro);
  const allList = await listSociosCatalogoColumnNamesOrdered();
  const allTableCols = new Set(allList);
  const pairs = [];
  for (let i = 0; i < spec.keys.length; i++) {
    const k = spec.keys[i];
    if (allTableCols.has(k)) pairs.push({ key: k, label: spec.labels[i] });
  }
  return {
    keys: pairs.map((p) => p.key),
    labels: pairs.map((p) => p.label),
    allTableCols,
  };
}

export function sociosVistaExportCellValue(key, raw) {
  if (key === "activo") return formatSociosActivoCelda(raw);
  if (raw == null) return "";
  if (typeof raw === "object") {
    if (raw instanceof Date) return raw.toISOString();
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  if (typeof raw === "boolean") return raw ? "true" : "false";
  return raw;
}

export function buildSociosExportOrderByKey(keys) {
  if (keys.includes("nis_medidor")) return quoteIdentSociosCol("nis_medidor");
  if (keys.includes("id")) return quoteIdentSociosCol("id");
  return quoteIdentSociosCol(keys[0]);
}
