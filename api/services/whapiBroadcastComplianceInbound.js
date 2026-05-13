/**
 * Webhook Whapi: STOP / ALTA en socios_catalogo + métricas + respuesta al vecino.
 * Solo con WHATSAPP_PROVIDER=whapi y columna acepta_avisos migrada.
 * made by leavera77
 */
import { resolveTenantIdByMetaPhoneNumberId } from "./metaTenantWhatsapp.js";
import { forEachWhapiInboundUserText } from "./whapiWebhookAdapter.js";
import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import {
  getTenantConfiguracionForWhatsappAreas,
  normalizeArgentinaMobileWithTenantAreaConfig,
} from "../utils/whatsappArAreaConfig.js";
import { sendTenantWhatsAppText } from "./whatsappService.js";
import { bumpBroadcastReplies, bumpBroadcastStops } from "./broadcastReplyMetrics.js";
import { getWhatsappProviderRaw } from "../utils/whatsappBroadcastPacing.js";

function normalizeKeywordInput(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "")
    .trim();
}

/** @returns {'stop'|'optin'|'other'} */
export function classifyBroadcastKeywordReply(normalized) {
  if (!normalized) return "other";
  if (normalized.includes("stop")) return "stop";
  if (normalized.includes("baja") || normalized.includes("darmebaja")) return "stop";
  if (normalized.includes("dejar")) return "stop";
  if (normalized === "no" || normalized.startsWith("noquiero")) return "stop";

  if (normalized === "si" || normalized.includes("alta") || normalized.startsWith("siquiero")) return "optin";
  return "other";
}

async function findSociosIdsByWaDigits(tenantId, waDigits) {
  const hasTs = await tableHasColumn("socios_catalogo", "tenant_id");
  const hasAcepta = await tableHasColumn("socios_catalogo", "acepta_avisos");
  if (!hasTs || !hasAcepta) return [];

  const cfg = await getTenantConfiguracionForWhatsappAreas(tenantId);
  const target = normalizeArgentinaMobileWithTenantAreaConfig(waDigits, cfg, null);
  if (!target || target.length < 10) return [];

  const hasLocS = await tableHasColumn("socios_catalogo", "localidad");
  const r = await query(
    hasLocS
      ? `SELECT id, telefono, NULLIF(TRIM(COALESCE(localidad::text, '')), '') AS loc
         FROM socios_catalogo WHERE tenant_id = $1 AND COALESCE(activo, TRUE)`
      : `SELECT id, telefono, NULL::text AS loc FROM socios_catalogo WHERE tenant_id = $1 AND COALESCE(activo, TRUE)`,
    [tenantId]
  );
  const ids = [];
  for (const row of r.rows || []) {
    const n = normalizeArgentinaMobileWithTenantAreaConfig(row.telefono, cfg, row.loc || null);
    if (n === target) ids.push(row.id);
  }
  return ids;
}

/**
 * @param {object} rawWhapi Cuerpo JSON Whapi (messages, channel_id)
 */
export async function processWhapiBroadcastComplianceMessages(rawWhapi) {
  if (getWhatsappProviderRaw() !== "whapi") return;
  if (!(await tableHasColumn("socios_catalogo", "acepta_avisos"))) return;

  const channelId = String(rawWhapi?.channel_id ?? rawWhapi?.channel?.id ?? "").trim();
  if (!channelId) return;

  let tenantId = await resolveTenantIdByMetaPhoneNumberId(channelId);
  if (tenantId == null) {
    const fb = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
    tenantId = Number.isFinite(fb) ? fb : 1;
  }
  if (!Number.isFinite(tenantId) || tenantId <= 0) return;

  const batch = [];
  forEachWhapiInboundUserText(rawWhapi, (x) => batch.push(x));

  for (const { digits, text } of batch) {
    const norm = normalizeKeywordInput(text);
    const kind = classifyBroadcastKeywordReply(norm);
    try {
      if (kind === "other") {
        if (norm.length >= 6) {
          await bumpBroadcastReplies(tenantId, 1);
        }
        continue;
      }

      const ids = await findSociosIdsByWaDigits(tenantId, digits);
      if (!ids.length) {
        console.log("[whapi-broadcast-compliance] sin socio catálogo para WA", {
          tenantId,
          tail: digits.slice(-4),
        });
        continue;
      }

      if (kind === "stop") {
        await query(`UPDATE socios_catalogo SET acepta_avisos = FALSE WHERE tenant_id = $1 AND id = ANY($2::int[])`, [
          tenantId,
          ids,
        ]);
        await bumpBroadcastStops(tenantId, 1);
        await sendTenantWhatsAppText({
          tenantId,
          toDigits: digits,
          bodyText:
            "Listo: te dimos de baja de avisos masivos por WhatsApp. Si fue un error, respondé ALTA.",
          pedidoId: null,
          logContext: "broadcast_opt_stop",
        });
      } else if (kind === "optin") {
        await query(`UPDATE socios_catalogo SET acepta_avisos = TRUE WHERE tenant_id = $1 AND id = ANY($2::int[])`, [
          tenantId,
          ids,
        ]);
        await sendTenantWhatsAppText({
          tenantId,
          toDigits: digits,
          bodyText: "Listo: volvés a estar habilitado para recibir avisos masivos.",
          pedidoId: null,
          logContext: "broadcast_opt_in",
        });
      }
    } catch (e) {
      console.error("[whapi-broadcast-compliance]", e?.message || e);
    }
  }
}
