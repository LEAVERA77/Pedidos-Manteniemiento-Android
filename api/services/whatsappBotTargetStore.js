import { query } from "../db/neon.js";
import { getConfiguracion, setConfiguracion } from "./configuracionStore.js";
import {
  normalizeBusinessTypeInput,
  rubroNormToBusinessType,
  businessTypeToRubroParaTipos,
} from "./businessType.js";
import { normalizarRubroCliente } from "./tiposReclamo.js";
import { loadTenantBusinessContext } from "../utils/businessScope.js";

export const WHATSAPP_BOT_ACTIVE_TARGET_KEY = "whatsapp_bot_active_target";

const READ_CACHE_TTL_MS = 2000;
const WRITE_SAME_TARGET_DEDUP_MS = 30000;

let _cachedTarget = undefined; // undefined = uninitialized, null = none, object = resolved target
let _cachedAtMs = 0;
let _lastPersistedSig = "";
let _lastPersistedAtMs = 0;
const _changeListeners = new Set();

export function registerOnWhatsappBotTargetChanged(listener) {
  if (typeof listener === "function") {
    _changeListeners.add(listener);
  }
}

function targetSignature(t) {
  if (!t) return "";
  return `${t.tenantId}|${t.businessType}|${t.rubro}|${t.locked ? "1" : "0"}`;
}

export function __resetWhatsappBotTargetCacheForTests() {
  _cachedTarget = undefined;
  _cachedAtMs = 0;
  _lastPersistedSig = "";
  _lastPersistedAtMs = 0;
}

export function peekWhatsappBotActiveTarget() {
  return _cachedTarget && typeof _cachedTarget === "object" ? { ..._cachedTarget } : null;
}

export function businessTypeLabelEs(bt) {
  const norm = normalizeBusinessTypeInput(bt);
  if (norm === "agua") return "Cooperativa de Agua";
  if (norm === "municipio") return "Municipio";
  return "Cooperativa Eléctrica";
}

export async function listActiveTenantsForWhatsappSelector() {
  let rows = [];
  try {
    const r = await query(
      `SELECT id, nombre, tipo, active_business_type, COALESCE(activo, TRUE) AS activo
       FROM clientes
       WHERE COALESCE(activo, TRUE) = TRUE
       ORDER BY id ASC
       LIMIT 500`
    );
    rows = r?.rows || [];
  } catch (_) {
    try {
      const rFallback = await query(
        `SELECT id, nombre, tipo, COALESCE(activo, TRUE) AS activo
         FROM clientes
         WHERE COALESCE(activo, TRUE) = TRUE
         ORDER BY id ASC
         LIMIT 500`
      );
      rows = rFallback?.rows || [];
    } catch (_e2) {
      rows = [];
    }
  }

  return rows.map((row) => {
    const tid = Number(row.id);
    const abt = normalizeBusinessTypeInput(row.active_business_type);
    const bt = abt || rubroNormToBusinessType(normalizarRubroCliente(row.tipo));
    const rubro = businessTypeToRubroParaTipos(bt);
    return {
      tenantId: tid,
      nombre: String(row.nombre || "").trim() || `Tenant #${tid}`,
      businessType: bt,
      rubro,
      rubroLabel: businessTypeLabelEs(bt),
      tipoRaw: row.tipo != null ? String(row.tipo).trim() : rubro,
    };
  });
}

export async function selectWhatsappBotTenantFromBaileysQr(params = {}) {
  const tid = Number(params?.tenantId ?? params?.tenant_id);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const rawBt = String(params?.businessType ?? params?.business_type ?? "")
    .trim()
    .toLowerCase();
  const preferredBt =
    rawBt && rawBt !== "auto" ? normalizeBusinessTypeInput(rawBt) : null;

  // No devolver el destino previo como si el ID solicitado se hubiese vinculado.
  if (!Number.isSafeInteger(tid) || !(await resolveTenantMetadata(tid, preferredBt))) return null;
  return await syncWhatsappBotActiveTarget({
    tenantId: tid,
    businessType: preferredBt,
    source: "baileys_qr_selector",
    force: true,
    locked: true,
  });
}

async function resolveTenantMetadata(tenantId, preferredBusinessType = null) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;

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
  if (!row || row.activo === false) return null;

  const prefBt = normalizeBusinessTypeInput(preferredBusinessType);
  let effectiveBt = prefBt;
  if (!effectiveBt) {
    try {
      const bctx = await loadTenantBusinessContext(Number(row.id));
      effectiveBt = normalizeBusinessTypeInput(bctx?.activeBusinessType);
    } catch (_) {}
  }
  if (!effectiveBt) {
    effectiveBt = rubroNormToBusinessType(normalizarRubroCliente(row.tipo));
  }
  const effectiveRubro = businessTypeToRubroParaTipos(effectiveBt);

  return {
    tenantId: Number(row.id),
    tenantNombre: String(row.nombre || "").trim() || `Tenant #${row.id}`,
    businessType: effectiveBt,
    rubro: effectiveRubro,
    tipoClienteRaw: row.tipo != null ? String(row.tipo).trim() : effectiveRubro,
  };
}

/**
 * Lee el target activo del bot WhatsApp (`tenant_id` + `business_type` + `rubro`)
 * desde la tabla `configuracion` (con caché corta de 2s para absorber escrituras desde Web/Android).
 *
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<{
 *   tenantId: number,
 *   businessType: 'electricidad'|'agua'|'municipio',
 *   rubro: 'cooperativa_electrica'|'cooperativa_agua'|'municipio',
 *   tenantNombre: string,
 *   locked: boolean,
 *   source: string,
 *   updatedByUserId: number|null,
 *   updatedAt: string|null
 * } | null>}
 */
export async function getWhatsappBotActiveTarget(opts = {}) {
  const now = Date.now();
  if (!opts?.forceRefresh && _cachedTarget !== undefined && now - _cachedAtMs < READ_CACHE_TTL_MS) {
    return _cachedTarget ? { ..._cachedTarget } : null;
  }

  let raw = null;
  try {
    if (typeof getConfiguracion === "function") {
      raw = await getConfiguracion(WHATSAPP_BOT_ACTIVE_TARGET_KEY);
    }
  } catch (_) {
    raw = null;
  }
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (_) {
      raw = null;
    }
  }
  if (!raw || typeof raw !== "object") {
    _cachedTarget = null;
    _cachedAtMs = now;
    return null;
  }

  const tid = Number(raw.tenant_id ?? raw.tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    _cachedTarget = null;
    _cachedAtMs = now;
    return null;
  }

  const rawBt =
    normalizeBusinessTypeInput(raw.business_type ?? raw.businessType) ||
    (raw.rubro ? rubroNormToBusinessType(normalizarRubroCliente(raw.rubro)) : null);

  const meta = await resolveTenantMetadata(tid, rawBt);
  if (!meta) {
    _cachedTarget = null;
    _cachedAtMs = now;
    return null;
  }

  const resolved = {
    tenantId: meta.tenantId,
    businessType: meta.businessType,
    rubro: meta.rubro,
    tenantNombre: meta.tenantNombre,
    locked: raw.locked === true,
    source: raw.source != null ? String(raw.source) : "configuracion",
    updatedByUserId:
      raw.updated_by_user_id != null && Number.isFinite(Number(raw.updated_by_user_id))
        ? Number(raw.updated_by_user_id)
        : null,
    updatedAt: raw.updated_at != null ? String(raw.updated_at) : null,
  };

  _cachedTarget = resolved;
  _cachedAtMs = now;
  return { ...resolved };
}

/**
 * Sincroniza a qué `tenant_id` y `business_type` apunta el bot de WhatsApp.
 * Se invoca automáticamente en login, restauración de sesión (`mi-configuracion` / `tenant-operativo`),
 * cambio de negocio (`switch-business`), wizard y cambio de tenant técnico, o explícitamente por API.
 *
 * @param {{
 *   tenantId: number,
 *   businessType?: string|null,
 *   source?: string,
 *   userId?: number|null,
 *   force?: boolean,
 *   locked?: boolean
 * }} params
 */
export async function syncWhatsappBotActiveTarget(params = {}) {
  const tid = Number(params?.tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;

  const envLocked =
    String(process.env.WHATSAPP_BOT_TARGET_LOCKED || "")
      .trim()
      .toLowerCase() === "true";
  if (envLocked && !params?.force) {
    return await getWhatsappBotActiveTarget();
  }

  const current = await getWhatsappBotActiveTarget();
  if (current?.locked && !params?.force && params?.locked !== false) {
    return current;
  }

  const meta = await resolveTenantMetadata(tid, params?.businessType ?? null);
  if (!meta) return current;

  const nextLocked =
    typeof params?.locked === "boolean" ? params.locked : Boolean(current?.locked && params?.force !== true);

  const candidate = {
    tenantId: meta.tenantId,
    businessType: meta.businessType,
    rubro: meta.rubro,
    tenantNombre: meta.tenantNombre,
    locked: nextLocked,
    source: String(params?.source || "sync"),
    updatedByUserId:
      params?.userId != null && Number.isFinite(Number(params.userId)) ? Number(params.userId) : null,
    updatedAt: new Date().toISOString(),
  };

  const sig = targetSignature(candidate);
  const now = Date.now();
  if (
    !params?.force &&
    typeof params?.locked !== "boolean" &&
    sig === _lastPersistedSig &&
    now - _lastPersistedAtMs < WRITE_SAME_TARGET_DEDUP_MS
  ) {
    _cachedTarget = candidate;
    _cachedAtMs = now;
    return { ...candidate };
  }

  const changed =
    !current ||
    current.tenantId !== candidate.tenantId ||
    current.businessType !== candidate.businessType ||
    current.rubro !== candidate.rubro ||
    current.locked !== candidate.locked;

  try {
    if (typeof setConfiguracion === "function") {
      await setConfiguracion(WHATSAPP_BOT_ACTIVE_TARGET_KEY, {
        tenant_id: candidate.tenantId,
        business_type: candidate.businessType,
        rubro: candidate.rubro,
        tenant_nombre: candidate.tenantNombre,
        locked: candidate.locked,
        source: candidate.source,
        updated_by_user_id: candidate.updatedByUserId,
        updated_at: candidate.updatedAt,
      });
    }
    _cachedTarget = candidate;
    _cachedAtMs = now;
    _lastPersistedSig = sig;
    _lastPersistedAtMs = now;
    if (changed) {
      for (const fn of _changeListeners) {
        try {
          fn(candidate);
        } catch (_) {}
      }
      console.log(
        `[whatsapp-bot-target] Bot WhatsApp apuntando a tenant_id=${candidate.tenantId} (${candidate.tenantNombre}) | business_type=${candidate.businessType} (${candidate.rubro}) [source=${candidate.source}${candidate.locked ? ", locked=true" : ""}]`
      );
    }
  } catch (e) {
    console.warn("[whatsapp-bot-target] No se pudo persistir target activo:", e?.message || e);
    if (params?.force) throw e; // Nunca confirmar una vinculación que no quedó en la base.
    _cachedTarget = candidate;
    _cachedAtMs = now;
  }

  return { ...candidate };
}

/**
 * Inicializa el target del bot solo si todavía no existe ninguno válido en BD/caché.
 */
export async function ensureWhatsappBotActiveTargetSeeded(params = {}) {
  if (_cachedTarget && typeof _cachedTarget === "object") {
    return { ..._cachedTarget };
  }
  const existing = await getWhatsappBotActiveTarget();
  if (existing) return existing;
  return await syncWhatsappBotActiveTarget({
    tenantId: params?.tenantId,
    businessType: params?.businessType ?? null,
    source: params?.source || "seed",
    userId: params?.userId ?? null,
  });
}
