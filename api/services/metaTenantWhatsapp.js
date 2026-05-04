import { query } from "../db/neon.js";

/**
 * Resuelve clientes.id (tenant) a partir del Phone number ID de Meta
 * que viene en value.metadata.phone_number_id en el webhook.
 *
 * Orden:
 * 1) clientes.configuracion->>'meta_phone_id' coincide con el ID recibido
 * 2) clientes.whapi_channel_id = ID (Whapi: channel_id del webhook en metadata.phone_number_id)
 * 3) Si WHATSAPP_PROVIDER=whapi y pid === WHAPI_CHANNEL_ID (env) → WHATSAPP_BOT_TENANT_ID
 * 4) Si pid === META_PHONE_NUMBER_ID (env) → WHATSAPP_BOT_TENANT_ID
 * 5) null (el caller usa WHATSAPP_BOT_TENANT_ID como respaldo legacy)
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

  const rWhapiCh = await query(
    `SELECT id FROM clientes
     WHERE activo = TRUE AND whapi_channel_id = $1
     LIMIT 1`,
    [pid]
  );
  const fromWhapiChannel = rWhapiCh.rows?.[0]?.id;
  if (fromWhapiChannel != null) return Number(fromWhapiChannel);

  const prov = String(process.env.WHATSAPP_PROVIDER || "").toLowerCase().trim();
  const whapiCh = String(process.env.WHAPI_CHANNEL_ID || "").trim();
  if (prov === "whapi" && whapiCh && pid === whapiCh) {
    const tid = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
    return Number.isFinite(tid) ? tid : 1;
  }

  const envPid = String(process.env.META_PHONE_NUMBER_ID || "").trim();
  if (envPid && pid === envPid) {
    const tid = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
    return Number.isFinite(tid) ? tid : 1;
  }

  return null;
}
