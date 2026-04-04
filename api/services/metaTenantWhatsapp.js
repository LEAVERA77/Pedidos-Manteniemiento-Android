import { query } from "../db/neon.js";

/**
 * Resuelve clientes.id (tenant) a partir del Phone number ID de Meta
 * que viene en value.metadata.phone_number_id en el webhook.
 *
 * Orden:
 * 1) clientes.configuracion->>'meta_phone_id' coincide con el ID recibido
 * 2) Si no hay fila pero META_PHONE_NUMBER_ID (env) coincide → WHATSAPP_BOT_TENANT_ID
 * 3) null (el caller puede usar WHATSAPP_BOT_TENANT_ID como respaldo legacy)
 */
export async function resolveTenantIdByMetaPhoneNumberId(phoneNumberId) {
  const pid = String(phoneNumberId || "").trim();
  if (!pid) return null;

  const r = await query(
    `SELECT id FROM clientes
     WHERE activo = TRUE
       AND (
         (configuracion->>'meta_phone_id') = $1
         OR (configuracion->>'meta_phone_number_id') = $1
       )
     LIMIT 1`,
    [pid]
  );
  const fromDb = r.rows?.[0]?.id;
  if (fromDb != null) return Number(fromDb);

  const envPid = String(process.env.META_PHONE_NUMBER_ID || "").trim();
  if (envPid && pid === envPid) {
    const tid = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
    return Number.isFinite(tid) ? tid : 1;
  }

  return null;
}
