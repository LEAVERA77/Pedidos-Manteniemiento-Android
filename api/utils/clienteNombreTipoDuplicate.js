/**
 * Buscar cliente por nombre normalizado + rubro (tipo o active_business_type).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { tableHasColumn } from "./tenantScope.js";
import { normalizeCompanyNameKey } from "./tenantIdentity.js";
import { normalizarRubroCliente } from "../services/tiposReclamo.js";
import { businessTypeToRubroParaTipos } from "../services/businessType.js";

/**
 * @param {Record<string, unknown>} row
 * @param {boolean} hasAbt
 * @returns {string | null}
 */
export function rubroEfectivoClienteRow(row, hasAbt) {
  const fromTipo = normalizarRubroCliente(row?.tipo);
  if (fromTipo) return fromTipo;
  if (hasAbt && row?.active_business_type) {
    return businessTypeToRubroParaTipos(row.active_business_type);
  }
  return null;
}

/**
 * @param {unknown} configuracion
 * @returns {boolean}
 */
export function isTenantSetupIncompleto(configuracion) {
  if (configuracion == null) return true;
  let cfg = configuracion;
  if (typeof cfg === "string") {
    try {
      cfg = JSON.parse(cfg);
    } catch {
      return true;
    }
  }
  if (!cfg || typeof cfg !== "object") return true;
  return !cfg.setup_wizard_completado;
}

/**
 * @param {string} nombreRaw
 * @param {string} tipoDb rubro normalizado (municipio | cooperativa_electrica | cooperativa_agua)
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function findClienteByNombreAndRubro(nombreRaw, tipoDb) {
  const nombreKey = normalizeCompanyNameKey(nombreRaw);
  const rubroTarget = String(tipoDb || "").trim();
  if (!nombreKey || nombreKey.length < 2 || !rubroTarget) return null;

  const hasAbt = await tableHasColumn("clientes", "active_business_type");
  const r = await query(
    `SELECT id, nombre, tipo, configuracion, activo
            ${hasAbt ? ", active_business_type" : ""}
     FROM clientes
     WHERE COALESCE(activo, TRUE)
       AND lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = $1`,
    [nombreKey]
  );
  for (const row of r.rows || []) {
    if (rubroEfectivoClienteRow(row, hasAbt) === rubroTarget) return row;
  }
  return null;
}
