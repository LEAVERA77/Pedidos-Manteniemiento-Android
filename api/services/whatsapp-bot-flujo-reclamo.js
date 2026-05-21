/**
 * Pasos del flujo de carga de reclamo (evitar que "1"/"2" disparen el menú de tipos).
 * made by leavera77
 */

/** Pasos donde un dígito suelto NO es elección del menú principal de tipos. */
export const WHATSAPP_PASOS_FLUJO_RECLAMO = new Set([
  "awaiting_desc",
  "awaiting_identificacion_modo",
  "awaiting_nombre_persona",
  "awaiting_catalogo_nombre_confirm",
  "awaiting_catalogo_nombre_elegir",
  "awaiting_opcional_id",
  "awaiting_nis_whatsapp",
  "awaiting_addr_solo_direccion",
  "awaiting_addr_provincia",
  "awaiting_addr_ciudad",
  "awaiting_addr_calle",
  "awaiting_addr_numero",
  "awaiting_gps_ubicacion_confirmar",
  "awaiting_suministro_conexion",
  "awaiting_suministro_fases",
  "awaiting_factibilidad_post_gps",
  "awaiting_municipio_transito_subtipo",
  "awaiting_municipio_orden_publico_subtipo",
  "awaiting_wa_foto_opcional",
  "awaiting_wa_foto_upload",
  "awaiting_confirmar_resumen",
  "awaiting_mis_reclamos_id",
  "awaiting_mis_reclamos_nombre_pick",
  "awaiting_mis_reclamos_operador",
  "awaiting_mis_reclamos_si_operador",
  "finalizing_pedido",
]);

/**
 * @param {object|null|undefined} sess
 * @returns {boolean}
 */
export function enFlujoReclamoWhatsapp(sess) {
  if (!sess) return false;
  if (sess.step === "human_chat") return false;
  if (sess.step && WHATSAPP_PASOS_FLUJO_RECLAMO.has(sess.step)) return true;
  if (sess.step === "idle") return false;
  const tipo = String(sess.tipo || "").trim();
  const desc = String(sess.descripcion || "").trim();
  if (tipo && desc.length >= 2) return true;
  return false;
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
export function esTextoSoloDigitoMenu(raw) {
  return /^\d{1,3}$/.test(String(raw || "").trim());
}
