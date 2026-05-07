/**
 * Textos WhatsApp para validación de fotos (3 líneas de negocio: municipio, electricidad, agua).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { clientesHasActiveBusinessTypeColumn } from "../utils/businessScope.js";
import { normalizarRubroCliente, rubroNormToBusinessType } from "./businessType.js";

/**
 * @param {number} tenantId
 * @returns {Promise<'electricidad'|'agua'|'municipio'>}
 */
export async function loadActiveBusinessTypeForTenant(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return "electricidad";
  try {
    const hasAbt = await clientesHasActiveBusinessTypeColumn();
    const sel = hasAbt ? "active_business_type, tipo" : "tipo";
    const r = await query(`SELECT ${sel} FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
    const row = r.rows?.[0];
    if (hasAbt) {
      const raw = String(row?.active_business_type || "").trim().toLowerCase();
      if (raw === "municipio" || raw === "agua" || raw === "electricidad") return raw;
    }
    const rub = normalizarRubroCliente(row?.tipo);
    return rubroNormToBusinessType(rub);
  } catch {
    return "electricidad";
  }
}

/** Mensaje al reclamante cuando el admin marca falta de calidad de evidencia. */
export function textoClienteFotoCalidadPendiente(activeBusinessType, numeroPedido) {
  const np = String(numeroPedido || "").trim();
  const ref = np ? `#${np}` : "tu reclamo";
  if (activeBusinessType === "municipio") {
    return `Vecino, tu reclamo ${ref} necesita una foto más clara. ¿Podés enviar otra por acá?`;
  }
  return `Tu reclamo ${ref} necesita una foto más clara. ¿Podés enviar otra por acá?`;
}

/** Confirmación al vecino tras subir nueva foto en estado Evidencia insuficiente. */
export function textoClienteNuevaFotoRecibida() {
  return "✅ Foto recibida. Revisaremos tu reclamo nuevamente.";
}
