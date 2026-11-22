import { query } from "../db/neon.js";
import { getWhatsappBotActiveTarget } from "./whatsappBotTargetStore.js";
import { loadTenantBusinessContext } from "../utils/businessScope.js";
import {
  normalizeBusinessTypeInput,
  rubroNormToBusinessType,
  businessTypeToRubroParaTipos,
} from "./businessType.js";
import { normalizarRubroCliente } from "./tiposReclamo.js";

async function buildTargetForTenantId(tidRaw, source, preferredBt = null, activeTarget = null) {
  const tid = Number(tidRaw);
  if (!Number.isFinite(tid) || tid < 1) return null;

  const pref =
    normalizeBusinessTypeInput(preferredBt) ||
    (activeTarget && Number(activeTarget.tenantId) === Math.trunc(tid)
      ? normalizeBusinessTypeInput(activeTarget.businessType)
      : null);

  let row = null;
  try {
    const r = await query(
      `SELECT id, nombre, tipo, activo FROM clientes WHERE id = $1 LIMIT 1`,
      [Math.trunc(tid)]
    );
    row = r?.rows?.[0] || null;
  } catch (_) {
    row = null;
  }
  if (row && row.activo === false) return null;

  let bt = pref;
  if (!bt) {
    try {
      const bctx = await loadTenantBusinessContext(Math.trunc(tid));
      bt = normalizeBusinessTypeInput(bctx?.activeBusinessType);
    } catch (_) {}
  }
  if (!bt && row?.tipo) {
    bt = rubroNormToBusinessType(normalizarRubroCliente(row.tipo));
  }
  if (!bt) bt = "electricidad";

  return {
    tenantId: Math.trunc(tid),
    businessType: bt,
    rubro: businessTypeToRubroParaTipos(bt),
    tenantNombre: row?.nombre ? String(row.nombre).trim() : null,
    source,
  };
}

async function queryMetaOrWhapiChannelTenant(pid) {
  try {
    const r = await query(
      `SELECT id FROM clientes
       WHERE COALESCE(activo, TRUE) = TRUE
         AND (
           (configuracion->>'meta_phone_id') = $1
           OR (configuracion->>'meta_phone_number_id') = $1
         )
       LIMIT 1`,
      [pid]
    );
    const fromMeta = r?.rows?.[0]?.id;
    if (fromMeta != null) return { tenantId: Number(fromMeta), channelKind: "meta_phone_id" };
  } catch (_) {}

  try {
    const rWhapiCh = await query(
      `SELECT id FROM clientes
       WHERE COALESCE(activo, TRUE) = TRUE AND whapi_channel_id = $1
       LIMIT 1`,
      [pid]
    );
    const fromWhapi = rWhapiCh?.rows?.[0]?.id;
    if (fromWhapi != null) return { tenantId: Number(fromWhapi), channelKind: "whapi_channel_id" };
  } catch (_) {}

  return null;
}

/**
 * Resuelve `{ tenantId, businessType, rubro, tenantNombre, locked, source }` para el bot de WhatsApp.
 *
 * - Si se eligió/bloqueó explícitamente un `tenant_id` en el QR de Baileys (`locked: true`), tiene máxima prioridad.
 * - En proveedores de línea única / QR (`baileys`, `waha`, `evolution` o `phoneNumberId === "baileys-bot"`):
 *   usa primero `whatsapp_bot_active_target` en Neon (`configuracion`), luego `BAILEYS_TENANT_ID`, luego `clientes.id = 1` activo.
 */
export async function resolveWhatsappBotTarget(phoneNumberId) {
  const pid = String(phoneNumberId || "").trim();
  const prov = String(process.env.WHATSAPP_PROVIDER || "")
    .toLowerCase()
    .trim();

  const activeTarget = await getWhatsappBotActiveTarget();
  if (activeTarget?.locked) {
    return {
      tenantId: activeTarget.tenantId,
      businessType: activeTarget.businessType,
      rubro: activeTarget.rubro,
      tenantNombre: activeTarget.tenantNombre,
      locked: true,
      source: `active_target:${activeTarget.source}`,
    };
  }

  const forceEnv =
    String(process.env.WHATSAPP_BOT_FORCE_ENV_TENANT || "")
      .trim()
      .toLowerCase() === "true";
  if (forceEnv) {
    const forcedTid = Number(
      process.env.BAILEYS_TENANT_ID || process.env.WHATSAPP_BOT_TENANT_ID || 0
    );
    if (Number.isFinite(forcedTid) && forcedTid >= 1) {
      return await buildTargetForTenantId(forcedTid, "forced_env");
    }
  }

  const isSharedQrProvider =
    prov === "baileys" ||
    prov === "waha" ||
    prov === "evolution" ||
    pid === "baileys-bot";

  if (isSharedQrProvider) {
    if (activeTarget) {
      return {
        tenantId: activeTarget.tenantId,
        businessType: activeTarget.businessType,
        rubro: activeTarget.rubro,
        tenantNombre: activeTarget.tenantNombre,
        locked: Boolean(activeTarget.locked),
        source: `active_target:${activeTarget.source}`,
      };
    }

    const baileysTid = Number(process.env.BAILEYS_TENANT_ID || 0);
    if (Number.isFinite(baileysTid) && baileysTid >= 1) {
      const t = await buildTargetForTenantId(baileysTid, "env_baileys_tenant_id");
      if (t) return t;
    }

    try {
      const rActive = await query(
        `SELECT id FROM clientes WHERE COALESCE(activo, TRUE) = TRUE ORDER BY (CASE WHEN id = 1 THEN 0 ELSE 1 END), id ASC LIMIT 1`
      );
      const activeId = rActive?.rows?.[0]?.id;
      if (activeId != null) {
        const t = await buildTargetForTenantId(activeId, "default_active_cliente");
        if (t) return t;
      }
    } catch (_) {}

    const legacyTid = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
    const fallbackTid = Number.isFinite(legacyTid) && legacyTid >= 1 ? legacyTid : 1;
    return await buildTargetForTenantId(fallbackTid, "fallback_default");
  }

  if (!pid) {
    if (activeTarget) {
      return {
        tenantId: activeTarget.tenantId,
        businessType: activeTarget.businessType,
        rubro: activeTarget.rubro,
        tenantNombre: activeTarget.tenantNombre,
        source: `active_target:${activeTarget.source}`,
      };
    }
    return null;
  }

  const envMetaPid = String(process.env.META_PHONE_NUMBER_ID || "").trim();
  const envWhapiCh = String(process.env.WHAPI_CHANNEL_ID || "").trim();
  const isGlobalSharedEnvLine =
    (envMetaPid && pid === envMetaPid) || (envWhapiCh && pid === envWhapiCh);

  if (!isGlobalSharedEnvLine) {
    const dedicated = await queryMetaOrWhapiChannelTenant(pid);
    if (dedicated) {
      return await buildTargetForTenantId(
        dedicated.tenantId,
        `db_${dedicated.channelKind}`,
        null,
        activeTarget
      );
    }
  }

  if (activeTarget) {
    return {
      tenantId: activeTarget.tenantId,
      businessType: activeTarget.businessType,
      rubro: activeTarget.rubro,
      tenantNombre: activeTarget.tenantNombre,
      source: `active_target:${activeTarget.source}`,
    };
  }

  const channelMatch = await queryMetaOrWhapiChannelTenant(pid);
  if (channelMatch) {
    return await buildTargetForTenantId(
      channelMatch.tenantId,
      `db_${channelMatch.channelKind}`
    );
  }

  if (prov === "whapi" && envWhapiCh && pid === envWhapiCh) {
    const tid = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
    return await buildTargetForTenantId(Number.isFinite(tid) && tid >= 1 ? tid : 1, "env_whapi_channel");
  }

  if (envMetaPid && pid === envMetaPid) {
    const tid = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
    return await buildTargetForTenantId(Number.isFinite(tid) && tid >= 1 ? tid : 1, "env_meta_phone_id");
  }

  return null;
}

/**
 * Compatibilidad con callers que esperan solo `tenant_id` numérico.
 */
export async function resolveTenantIdByMetaPhoneNumberId(phoneNumberId) {
  const pid = String(phoneNumberId || "").trim();
  const prov = String(process.env.WHATSAPP_PROVIDER || "")
    .toLowerCase()
    .trim();
  if (!pid && prov !== "baileys" && prov !== "waha" && prov !== "evolution") {
    return null;
  }
  const target = await resolveWhatsappBotTarget(pid);
  return target?.tenantId ?? null;
}
