/**
 * Webhook Evolution API (y similares).
 * Configurar en Evolution: URL POST → /api/webhooks/whatsapp/evolution
 *
 * WAHA: POST → /api/webhooks/whatsapp/waha
 *   Docker: WHATSAPP_HOOK_URL=http://host.docker.internal:<PORT>/api/webhooks/whatsapp/waha?token=...
 *   <PORT> = mismo que en api/.env (PORT). Token = WHATSAPP_WEBHOOK_TOKEN
 *
 * Whapi.cloud: POST → /api/webhooks/whatsapp/whapi
 *   URL pública: https://<host>/api/webhooks/whatsapp/whapi (opcional ?token=WHATSAPP_WEBHOOK_TOKEN)
 *   Alias: POST /api/webhooks/whapi/message (mismo cuerpo y auth).
 *   Auth: query token, Bearer WHATSAPP_WEBHOOK_TOKEN, Bearer WHAPI_API_KEY, X-Api-Key, o WHAPI_WEBHOOK_SECRET (header X-Whapi-Webhook-Secret o Bearer).
 *
 * Variables sugeridas (.env):
 *   WHATSAPP_WEBHOOK_TOKEN=secreto-largo-compartido-con-evolution
 *
 * TODO Fase 2:
 *   - Validar firma/HMAC si Evolution lo expone en tu versión
 *   - Parsear payload real (texto, botones, media)
 *   - Avanzar whatsapp_bot_sessions + crear pedido vía servicio interno
 */
import express from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import {
  handleInboundMetaWhatsAppPayload,
  clearWhatsappBotSessions,
} from "../services/whatsappBotMeta.js";
import {
  resolveTenantIdByMetaPhoneNumberId,
  resolveWhatsappBotTarget,
} from "../services/metaTenantWhatsapp.js";
import {
  listActiveTenantsForWhatsappSelector,
  selectWhatsappBotTenantFromBaileysQr,
  businessTypeLabelEs,
} from "../services/whatsappBotTargetStore.js";
import { logWhatsappMensajeRecibido } from "../services/whatsappNotificacionesLog.js";
import { wahaWebhookToMetaShapedPayload } from "../services/wahaWebhookAdapter.js";
import {
  getBaileysQrDataUrl,
  getBaileysStatus,
  startBaileys,
  resetBaileysSessionAndReconnect,
} from "../services/baileysWhatsapp.js";
import { whapiWebhookToMetaShapedPayload } from "../services/whapiWebhookAdapter.js";
import { processWhapiBroadcastComplianceMessages } from "../services/whapiBroadcastComplianceInbound.js";

const router = express.Router();

/** Resumen sin PII masivo: tipos, from_me, orígenes y preview de texto (Whapi). */
/** Fuerza value.metadata.phone_number_id = channel_id real para multitenant Whapi (el adaptador puede usar WHAPI_META_PHONE_NUMBER_ID). */
function applyWhapiChannelIdToMetaShapedPayload(metaShaped, channelId) {
  const ch = String(channelId || "").trim();
  if (!ch || !metaShaped || typeof metaShaped !== "object") return;
  const entries = Array.isArray(metaShaped.entry) ? metaShaped.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (value && typeof value === "object" && value.metadata && typeof value.metadata === "object") {
        value.metadata.phone_number_id = ch;
      }
    }
  }
}

function readPhoneNumberIdFromMetaShaped(metaShaped) {
  const entries = Array.isArray(metaShaped?.entry) ? metaShaped.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const pid = change?.value?.metadata?.phone_number_id;
      const s = String(pid ?? "").trim();
      if (s) return s;
    }
  }
  return "";
}

function summarizeWhapiMessagesForLog(body) {
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  return msgs.slice(0, 8).map((m) => ({
    type: m?.type,
    from_me: m?.from_me,
    from: String(m?.from || "").replace(/\D/g, "").slice(0, 16),
    chat_id: String(m?.chat_id || "").slice(0, 36),
    text_preview:
      m?.text && typeof m.text === "object" && m.text.body != null
        ? String(m.text.body).slice(0, 72)
        : null,
  }));
}

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: "unauthorized" });
}

function checkWebhookToken(req) {
  const token = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!token) return true;
  const hdr = req.get("authorization") || "";
  const q = req.query.token;
  return hdr === `Bearer ${token}` || q === token;
}

/**
 * Whapi: Bearer (case-insensitive), ?token=, X-Api-Key, o cuerpo con channel_id = WHAPI_CHANNEL_ID.
 */
function checkWhapiWebhookToken(req) {
  const hookSecret = String(process.env.WHAPI_WEBHOOK_SECRET || "").trim();
  const hookHdr = String(req.get("x-whapi-webhook-secret") || "").trim();
  const shared = String(process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  const apiKey = String(process.env.WHAPI_API_KEY || "").trim();
  const hdrRaw = String(req.get("authorization") || "").trim();
  const q = req.query?.token;
  const xApi = String(req.get("x-api-key") || "").trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(hdrRaw);
  const bearerToken = bearer ? bearer[1].trim() : "";

  if (hookSecret && (hookHdr === hookSecret || bearerToken === hookSecret)) return true;

  if (!shared) return true;
  if (bearerToken === shared || q === shared) return true;
  if (apiKey && bearerToken === apiKey) return true;
  if (apiKey && xApi === apiKey) return true;
  if (shared && xApi === shared) return true;

  const expectCh = String(process.env.WHAPI_CHANNEL_ID || "").trim();
  const bodyCh = String(req.body?.channel_id || "").trim();
  if (expectCh && bodyCh === expectCh) return true;

  return false;
}

/** Whapi (y prueba en navegador): GET sin POST no recibe webhooks; responde 200 para verificar deploy. */
router.get("/whapi", (req, res) => {
  res.json({
    ok: true,
    path: "POST /api/webhooks/whatsapp/whapi",
    path_alias: "POST /api/webhooks/whapi/message",
    hint:
      "Whapi.cloud usa POST. Auth: ?token=, Bearer WHATSAPP_WEBHOOK_TOKEN, Bearer WHAPI_API_KEY, o WHAPI_WEBHOOK_SECRET (X-Whapi-Webhook-Secret / Bearer).",
  });
});

router.post("/waha", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    if (!checkWebhookToken(req)) {
      return unauthorized(res);
    }

    const body = req.body || {};
    const metaShaped = wahaWebhookToMetaShapedPayload(body);
    if (!metaShaped) {
      return res.json({ ok: true, skipped: true });
    }

    res.json({ ok: true, received: true });

    setImmediate(() => {
      processWahaInboundAsync(metaShaped, body).catch((e) =>
        console.error("[webhook-waha] async", e)
      );
    });
  } catch (e) {
    console.error("[webhook-waha]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export async function handleWhapiCloudWebhookPost(req, res) {
  try {
    const body = req.body || {};
    if (!checkWhapiWebhookToken(req)) {
      return unauthorized(res);
    }

    const dbgFull = ["1", "true", "yes"].includes(String(process.env.WHATSAPP_WEBHOOK_DEBUG || "").trim().toLowerCase());
    if (dbgFull) {
      try {
        const raw = JSON.stringify(body);
        console.log("[webhook-whapi] DEBUG body (truncado)", raw.length > 14000 ? raw.slice(0, 14000) + "…" : raw);
      } catch (e) {
        console.log("[webhook-whapi] DEBUG body (no serializable)", e?.message || e);
      }
    }

    const metaShaped = whapiWebhookToMetaShapedPayload(body);
    const ev = body.event;
    console.log("[webhook-whapi] POST", {
      event_type: ev?.type,
      event_event: ev?.event,
      channel_id: body.channel_id,
      msg_count: Array.isArray(body.messages) ? body.messages.length : 0,
      messages_preview: summarizeWhapiMessagesForLog(body),
      adapted_to_bot: !!metaShaped,
    });

    if (!metaShaped) {
      console.log("[webhook-whapi] adapter null (sin texto útil para bot); igual se procesa STOP/warm-up si aplica)", {
        hasMessages: Array.isArray(body.messages) ? body.messages.length : 0,
        eventType: ev?.type,
        eventEvent: ev?.event,
        channel_id: body.channel_id,
      });
    }

    res.json({ ok: true, received: true });

    setImmediate(() => {
      processWhapiInboundAsync(metaShaped, body).catch((e) =>
        console.error("[webhook-whapi] async", e)
      );
    });
  } catch (e) {
    console.error("[webhook-whapi]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

router.post("/whapi", express.json({ limit: "2mb" }), handleWhapiCloudWebhookPost);

async function processWhapiInboundAsync(metaShaped, rawWhapi) {
  try {
    await processWhapiBroadcastComplianceMessages(rawWhapi).catch((e) =>
      console.error("[webhook-whapi] broadcast-compliance", e)
    );

    const channelId = String(rawWhapi?.channel_id ?? rawWhapi?.channel?.id ?? "").trim();
    applyWhapiChannelIdToMetaShapedPayload(metaShaped, channelId);
    const effectivePid = channelId || readPhoneNumberIdFromMetaShaped(metaShaped);
    if (effectivePid) {
      const resolvedProbe = await resolveTenantIdByMetaPhoneNumberId(effectivePid);
      const fallbackTid = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
      if (channelId) {
        if (resolvedProbe != null) {
          console.log(`[Whapi] channel_id ${channelId} → tenant ${resolvedProbe}`);
        } else {
          console.log(`[Whapi] channel_id no mapeado (${channelId}), usando fallback: ${fallbackTid}`);
        }
      }
    }

    const entries = Array.isArray(metaShaped?.entry) ? metaShaped.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          const waId = String(msg?.from || "").replace(/\D/g, "");
          const text = String(msg?.text?.body || "").trim();
          if (waId && text) {
            try {
              await logWhatsappMensajeRecibido(waId, text);
            } catch (e) {
              console.error("[webhook-whapi] log recibido DB", e.message);
            }
          }
        }
      }
    }
    if (metaShaped) {
      await handleInboundMetaWhatsAppPayload(metaShaped);
      console.log("[webhook-whapi] handleInboundMetaWhatsAppPayload terminó OK");
    }
  } catch (e) {
    console.error("[webhook-whapi] bot", e);
  }
}

async function processWahaInboundAsync(metaShaped, rawWaha) {
  try {
    const entries = Array.isArray(metaShaped?.entry) ? metaShaped.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          const waId = String(msg?.from || "").replace(/\D/g, "");
          const text = String(msg?.text?.body || "").trim();
          if (waId && text) {
            try {
              await logWhatsappMensajeRecibido(waId, text);
            } catch (e) {
              console.error("[webhook-waha] log recibido DB", e.message);
            }
          }
        }
      }
    }
    await handleInboundMetaWhatsAppPayload(metaShaped);
  } catch (e) {
    console.error("[webhook-waha] bot", e);
  }
}

router.post("/evolution", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const token = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (token) {
      const hdr = req.get("authorization") || "";
      const q = req.query.token;
      if (hdr !== `Bearer ${token}` && q !== token) {
        return unauthorized(res);
      }
    }

    const body = req.body || {};
    // Log mínimo para depuración (no loguear datos sensibles en prod)
    console.log("[webhook-whatsapp] event keys:", Object.keys(body));

    // Ejemplo: registrar evento crudo (opcional, descomentar si querés auditoría)
    // await query(
    //   `INSERT INTO webhook_event_log (origen, payload, created_at) VALUES ($1, $2::jsonb, NOW())`,
    //   ["evolution", JSON.stringify(body)]
    // );

    return res.json({ ok: true, received: true });
  } catch (e) {
    console.error("[webhook-whatsapp]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractBaileysToken(req) {
  const fromQuery = String(req.query?.token || "").trim();
  if (fromQuery) return fromQuery;
  const fromBody = String(req.body?.token || "").trim();
  if (fromBody) return fromBody;
  const auth = String(req.headers?.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

function checkBaileysTokenAuthorized(req) {
  // La clave del proveedor de webhooks no debe permitir cambiar el tenant ni escanear QR.
  const expected = String(process.env.WHATSAPP_LINK_TOKEN || "").trim();
  const webhookToken = String(process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  const provided = extractBaileysToken(req);
  if (expected.length < 32 || expected.length > 512 || (webhookToken && expected === webhookToken)) {
    return { ok: false, token: "" };
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return { ok: a.length === b.length && crypto.timingSafeEqual(a, b), token: provided };
}

function wantsJsonResponse(req) {
  if (req.is && req.is("application/json")) return true;
  const accept = String(req.headers?.accept || "").toLowerCase();
  return accept.includes("application/json") && !accept.includes("text/html");
}

async function buildBaileysBotTargetSnapshot() {
  try {
    const resolved = await resolveWhatsappBotTarget("baileys-bot");
    if (!resolved) return null;
    return {
      tenant_id: resolved.tenantId,
      tenant_nombre: resolved.tenantNombre || `Tenant #${resolved.tenantId}`,
      business_type: resolved.businessType,
      rubro: resolved.rubro,
      rubro_label: businessTypeLabelEs(resolved.businessType),
      locked: Boolean(resolved.locked),
      source: resolved.source,
    };
  } catch (_) {
    return null;
  }
}

// El límite general excluye webhooks; proteger por separado los intentos de vinculación.
const baileysLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.VITEST === "true" ? 50000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { ok: false, error: "Demasiados intentos. Esperá antes de volver a intentar." },
});
router.use("/baileys", (req, res, next) => req.path === "/status" ? next() : baileysLinkLimiter(req, res, next));

// Los QR y la clave de vinculación son sensibles: nunca cachearlos ni filtrarlos por Referer.
router.use("/baileys", (req, res, next) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" });
  if (req.method === "POST" && req.get("origin")) {
    try {
      if (new URL(req.get("origin")).host !== req.get("host")) return res.sendStatus(403);
    } catch (_) { return res.sendStatus(403); }
  }
  return next();
});

router.get("/baileys/status", async (req, res) => {
  const auth = checkBaileysTokenAuthorized(req);
  if (!auth.ok) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const st = getBaileysStatus();
  const qrDataUrl = st.status === "connected" ? null : getBaileysQrDataUrl() || null;
  const botTarget = await buildBaileysBotTargetSnapshot();
  return res.json({ ok: true, ...st, qrDataUrl, botTarget });
});

router.post("/baileys/select-tenant", async (req, res) => {
  const auth = checkBaileysTokenAuthorized(req);
  if (!auth.ok) {
    if (wantsJsonResponse(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    return res.status(401).send("Unauthorized: falta token válido");
  }

  const rawTid = req.body?.tenant_id ?? req.body?.tenantId ?? req.query?.tenant_id;
  const tid = Number(rawTid);
  if (!Number.isFinite(tid) || tid < 1) {
    if (wantsJsonResponse(req)) {
      return res.status(400).json({ ok: false, error: "tenant_id inválido (debe ser un número mayor o igual a 1)" });
    }
    const tokenQs = auth.token ? `&token=${encodeURIComponent(auth.token)}` : "";
    return res.redirect(303, `/api/webhooks/whatsapp/baileys/qr?err=invalid_id${tokenQs}`);
  }

  const confirmedTid = String(req.body?.confirm_tenant_id ?? "").trim();
  if (!Number.isSafeInteger(tid) || confirmedTid !== String(tid)) {
    return res.status(400).json({ ok: false, error: "Confirmá el mismo ID de tenant antes de vincular." });
  }
  const rawBt = req.body?.business_type ?? req.body?.businessType ?? "auto";
  let selected;
  try {
    selected = await selectWhatsappBotTenantFromBaileysQr({
      tenantId: tid,
      businessType: rawBt,
    });
  } catch (e) {
    console.error("[baileys] error al persistir vinculación", e?.message || e);
    return res.status(503).json({ ok: false, error: "No se pudo guardar la vinculación; intentá de nuevo." });
  }

  if (!selected) {
    if (wantsJsonResponse(req)) {
      return res.status(404).json({
        ok: false,
        error: `No existe un cliente/tenant activo con tenant_id=${Math.trunc(tid)}`,
      });
    }
    const tokenQs = auth.token ? `&token=${encodeURIComponent(auth.token)}` : "";
    return res.redirect(
      303,
      `/api/webhooks/whatsapp/baileys/qr?err=not_found&attempted_id=${encodeURIComponent(String(Math.trunc(tid)))}${tokenQs}`
    );
  }

  clearWhatsappBotSessions();

  const st = getBaileysStatus();
  if (st.status === "disconnected") {
    startBaileys().catch(() => {});
  }

  const botTarget = {
    tenant_id: selected.tenantId,
    tenant_nombre: selected.tenantNombre,
    business_type: selected.businessType,
    rubro: selected.rubro,
    rubro_label: businessTypeLabelEs(selected.businessType),
    locked: Boolean(selected.locked),
    source: selected.source,
  };

  if (wantsJsonResponse(req)) {
    return res.json({ ok: true, status: getBaileysStatus().status, botTarget });
  }

  const tokenQs = auth.token ? `&token=${encodeURIComponent(auth.token)}` : "";
  return res.redirect(303, `/api/webhooks/whatsapp/baileys/qr?saved=1${tokenQs}`);
});

router.post("/baileys/reset-session", async (req, res) => {
  const auth = checkBaileysTokenAuthorized(req);
  if (!auth.ok) {
    if (wantsJsonResponse(req)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    return res.status(401).send("Unauthorized: falta token válido");
  }

  // Reiniciar la sesión no debe cambiar silenciosamente el tenant vinculado.

  clearWhatsappBotSessions();
  const nextStatus = await resetBaileysSessionAndReconnect();
  const botTarget = await buildBaileysBotTargetSnapshot();

  if (wantsJsonResponse(req)) {
    return res.json({ ok: true, ...nextStatus, botTarget });
  }

  const tokenQs = auth.token ? `&token=${encodeURIComponent(auth.token)}` : "";
  return res.redirect(303, `/api/webhooks/whatsapp/baileys/qr?reset=1${tokenQs}`);
});

router.get("/baileys/qr", async (req, res) => {
  const auth = checkBaileysTokenAuthorized(req);
  if (!auth.ok) {
    return res.status(401).send("Unauthorized: falta ?token= correcto");
  }

  const urlTid = Number(req.query?.tenant_id);
  // GET no puede modificar la asociación ni reiniciar conversaciones.
  if (String(req.query?.apply || "").trim() === "1") {
    return res.status(405).send("Usá el formulario POST con confirmación para vincular el tenant.");
  }

  const tenants = await listActiveTenantsForWhatsappSelector();
  const botTarget = await buildBaileysBotTargetSnapshot();

  const defaultTid =
    Number.isFinite(urlTid) && urlTid >= 1
      ? Math.trunc(urlTid)
      : botTarget?.tenant_id || tenants[0]?.tenantId || 1;

  const isConfirmedForQr =
    Boolean(botTarget?.locked) ||
    String(req.query?.saved || "") === "1" ||
    String(req.query?.reset || "") === "1";

  const st = getBaileysStatus();
  if (st.status === "disconnected" && isConfirmedForQr) {
    startBaileys().catch(() => {});
  }
  const qr = st.status === "connected" ? null : getBaileysQrDataUrl();

  const savedFlag = String(req.query?.saved || "") === "1";
  const resetFlag = String(req.query?.reset || "") === "1";
  const errCode = String(req.query?.err || "").trim();
  const attemptedId = String(req.query?.attempted_id || "").trim();

  const tenantsJsonForClient = JSON.stringify(tenants).replace(/</g, "\\u003c");
  const initialStateJson = JSON.stringify({
    status: st.status,
    hasQr: Boolean(qr),
    qrDataUrl: qr || null,
    sessionId: st.sessionId,
    isConfirmedForQr,
    botTarget,
    token: auth.token || "",
  }).replace(/</g, "\\u003c");

  const optionsHtml = tenants
    .map((t) => {
      const sel = t.tenantId === defaultTid ? " selected" : "";
      return `<option value="${t.tenantId}" data-bt="${escapeHtml(t.businessType)}" data-nombre="${escapeHtml(t.nombre)}" data-rubro="${escapeHtml(t.rubroLabel)}"${sel}>#${t.tenantId} — ${escapeHtml(t.nombre)} (${escapeHtml(t.rubroLabel)} · ${escapeHtml(t.businessType)})</option>`;
    })
    .join("");

  let alertHtml = "";
  if (savedFlag && botTarget) {
    alertHtml = `<div id="flash-msg" class="alert alert-ok">✅ WhatsApp fijado correctamente al <strong>Tenant #${botTarget.tenant_id} — ${escapeHtml(botTarget.tenant_nombre)}</strong> (<code>${escapeHtml(botTarget.rubro_label)}</code> · <code>${escapeHtml(botTarget.business_type)}</code>). Las conversaciones en curso fueron reiniciadas para usar este negocio de inmediato.</div>`;
  } else if (resetFlag) {
    alertHtml = `<div id="flash-msg" class="alert alert-info">🔄 Sesión de WhatsApp reiniciada. Elegí/confirmá el <strong>tenant_id</strong> y escaneá el nuevo código QR abajo.</div>`;
  } else if (errCode === "not_found") {
    alertHtml = `<div id="flash-msg" class="alert alert-err">⚠️ No se encontró ningún tenant activo con <code>tenant_id = ${escapeHtml(attemptedId)}</code> en la tabla <code>clientes</code>. Revisá la lista de negocios disponibles abajo.</div>`;
  } else if (errCode === "invalid_id") {
    alertHtml = `<div id="flash-msg" class="alert alert-err">⚠️ Ingresá un número de <code>tenant_id</code> válido (mayor o igual a 1).</div>`;
  }

  const currentBannerHtml = botTarget
    ? `<div id="active-target-banner" class="target-banner ${botTarget.locked ? "locked" : ""}">
        <div class="target-badge">${botTarget.locked ? "🔒 Destino fijado en Baileys" : "ℹ️ Destino actual detectado"}</div>
        <div class="target-main">
          Tenant <strong>#${botTarget.tenant_id}</strong> — <strong>${escapeHtml(botTarget.tenant_nombre)}</strong>
        </div>
        <div class="target-sub">
          Tipo de negocio: <strong>${escapeHtml(botTarget.rubro_label)}</strong> (<code>${escapeHtml(botTarget.business_type)}</code> / <code>${escapeHtml(botTarget.rubro)}</code>)
        </div>
      </div>`
    : "";

  return res.status(200).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vincular WhatsApp (Baileys) — Selección de Tenant</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 16px 48px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
    }
    .wrap { max-width: 680px; margin: 0 auto; }
    h1 { font-size: 1.45rem; margin: 0 0 6px; color: #0f172a; }
    .subtitle { margin: 0 0 18px; color: #475569; font-size: 0.95rem; }
    .card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 18px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
    }
    .step-title {
      font-size: 1.05rem;
      font-weight: 700;
      margin: 0 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step-num {
      display: inline-flex;
      width: 26px;
      height: 26px;
      border-radius: 999px;
      background: #2563eb;
      color: #fff;
      font-size: 0.85rem;
      font-weight: 700;
      align-items: center;
      justify-content: center;
    }
    .target-banner {
      background: #f8fafc;
      border: 1px solid #94a3b8;
      border-left: 5px solid #2563eb;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 18px;
    }
    .target-banner.locked {
      background: #ecfdf5;
      border-color: #6ee7b7;
      border-left-color: #059669;
    }
    .target-badge {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #047857;
      margin-bottom: 4px;
    }
    .target-banner:not(.locked) .target-badge { color: #1d4ed8; }
    .target-main { font-size: 1.1rem; margin-bottom: 3px; }
    .target-sub { font-size: 0.9rem; color: #334155; }
    .alert {
      border-radius: 10px;
      padding: 12px 15px;
      margin-bottom: 16px;
      font-size: 0.93rem;
      line-height: 1.4;
    }
    .alert-ok { background: #dcfce7; border: 1px solid #86efac; color: #14532d; }
    .alert-info { background: #dbeafe; border: 1px solid #93c5fd; color: #1e3a8a; }
    .alert-err { background: #fee2e2; border: 1px solid #fca5a5; color: #7f1d1d; }
    .grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    @media (max-width: 560px) {
      .grid { grid-template-columns: 1fr; }
    }
    label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: #334155;
      margin-bottom: 5px;
    }
    input[type="number"], select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      font-size: 0.98rem;
      background: #fff;
      color: #0f172a;
    }
    input[type="number"]:focus, select:focus {
      outline: 2px solid #2563eb;
      border-color: #2563eb;
    }
    .preview-box {
      background: #f8fafc;
      border: 1px dashed #94a3b8;
      border-radius: 8px;
      padding: 11px 14px;
      margin: 12px 0 14px;
      font-size: 0.92rem;
      color: #1e293b;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 11px 18px;
      border-radius: 8px;
      border: none;
      font-size: 0.96rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-primary { background: #16a34a; color: #ffffff; width: 100%; }
    .btn-primary:hover { background: #15803d; }
    .btn-danger {
      background: #fff1f2;
      color: #be123c;
      border: 1px solid #fda4af;
      margin-top: 14px;
      font-size: 0.88rem;
      padding: 9px 14px;
    }
    .btn-danger:hover { background: #ffe4e6; }
    .qr-area { text-align: center; padding: 10px 0 4px; }
    .qr-img {
      width: 280px;
      height: 280px;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 8px;
      background: #fff;
      margin: 10px auto;
      display: block;
    }
    .status-pill {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .st-connected { background: #dcfce7; color: #15803d; }
    .st-qr { background: #fef9c3; color: #854d0e; }
    .st-wait { background: #e2e8f0; color: #334155; }
    code {
      background: rgba(15, 23, 42, 0.07);
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 0.88em;
    }
    .hint { font-size: 0.85rem; color: #64748b; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>📱 WhatsApp Baileys — Selección de Negocio y QR</h1>
    <p class="subtitle">Elegí qué <code>tenant_id</code> (negocio y rubro) va a atender este WhatsApp antes o después de vincular el código QR.</p>

    ${alertHtml}
    ${currentBannerHtml}

    <div class="card">
      <div class="step-title">
        <span class="step-num">1</span>
        <span>Elegir <code>tenant_id</code> y tipo de negocio para WhatsApp</span>
      </div>

      <form id="tenant-form" method="POST" action="/api/webhooks/whatsapp/baileys/select-tenant">
        <input type="hidden" name="token" value="${escapeHtml(auth.token)}" />

        <div class="grid">
          <div>
            <label for="tenant_id_input">Tenant ID (número)</label>
            <input
              id="tenant_id_input"
              name="tenant_id"
              type="number"
              min="1"
              step="1"
              required
              value="${escapeHtml(defaultTid)}"
            />
          </div>

          <div>
            <label for="tenant_select">Negocios activos en base de datos</label>
            <select id="tenant_select">
              ${optionsHtml || `<option value="${escapeHtml(defaultTid)}">#${escapeHtml(defaultTid)}</option>`}
            </select>
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label for="confirm_tenant_id">Confirmá escribiendo nuevamente el ID del tenant</label>
          <input id="confirm_tenant_id" name="confirm_tenant_id" type="number" min="1" step="1" required autocomplete="off" />
        </div>
        <div style="margin-bottom: 12px;">
          <label for="business_type_select">Tipo de negocio (rubro del bot)</label>
          <select id="business_type_select" name="business_type">
            <option value="auto" selected>Automático según el tenant elegido (recomendado)</option>
            <option value="electricidad">Cooperativa Eléctrica (electricidad)</option>
            <option value="agua">Cooperativa de Agua (agua)</option>
            <option value="municipio">Municipio (municipio)</option>
          </select>
        </div>

        <div id="tenant-preview" class="preview-box">
          Cargando vista previa del tenant...
        </div>

        <button type="submit" class="btn btn-primary" id="save-tenant-btn">
          ✅ Confirmar y fijar este Tenant para WhatsApp
        </button>
      </form>
    </div>

    <div class="card">
      <div class="step-title">
        <span class="step-num">2</span>
        <span>Estado de sesión y código QR de WhatsApp</span>
      </div>

      <div id="qr-panel" class="qr-area"></div>

      <div style="text-align: center;">
        <form
          id="reset-form"
          method="POST"
          action="/api/webhooks/whatsapp/baileys/reset-session"
          onsubmit="return confirm('¿Cerrar la sesión actual de WhatsApp y generar un nuevo código QR?');"
        >
          <input type="hidden" name="token" value="${escapeHtml(auth.token)}" />
          <input type="hidden" name="tenant_id" id="reset_tenant_id" value="${escapeHtml(defaultTid)}" />
          <button type="submit" class="btn btn-danger">
            🔄 Cerrar sesión WhatsApp actual y generar nuevo QR
          </button>
        </form>
      </div>
    </div>
  </div>

  <script>
    (function () {
      var TENANTS = ${tenantsJsonForClient};
      var STATE = ${initialStateJson};
      // Eliminar el secreto de la barra de direcciones y del historial visible.
      try { var url = new URL(location.href); url.searchParams.delete("token"); history.replaceState(null, "", url); } catch (_) {}

      var tidInput = document.getElementById("tenant_id_input");
      var tidSelect = document.getElementById("tenant_select");
      var btSelect = document.getElementById("business_type_select");
      var resetTidInput = document.getElementById("reset_tenant_id");
      var previewEl = document.getElementById("tenant-preview");
      var qrPanel = document.getElementById("qr-panel");

      function esc(s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      function findTenant(id) {
        var n = Number(id);
        for (var i = 0; i < TENANTS.length; i++) {
          if (Number(TENANTS[i].tenantId) === n) return TENANTS[i];
        }
        return null;
      }

      function labelBt(bt) {
        if (bt === "agua") return "Cooperativa de Agua (agua)";
        if (bt === "municipio") return "Municipio (municipio)";
        return "Cooperativa Eléctrica (electricidad)";
      }

      function updatePreview() {
        var val = Number(tidInput.value);
        if (resetTidInput && Number.isFinite(val) && val >= 1) {
          resetTidInput.value = String(Math.trunc(val));
        }
        var found = findTenant(val);
        var chosenBt = btSelect.value;
        if (found) {
          tidSelect.value = String(found.tenantId);
          var effectiveBt = chosenBt === "auto" ? found.businessType : chosenBt;
          previewEl.innerHTML =
            "<strong>Seleccionado:</strong> Tenant <strong>#" +
            found.tenantId +
            " — " +
            esc(found.nombre) +
            "</strong><br/><span>Rubro que usará el menú de WhatsApp: <strong>" +
            esc(labelBt(effectiveBt)) +
            "</strong></span>";
        } else if (Number.isFinite(val) && val >= 1) {
          previewEl.innerHTML =
            "⚠️ El <code>tenant_id = " +
            Math.trunc(val) +
            "</code> no figura en la lista cargada. Verificá el número en el selector.";
        } else {
          previewEl.innerHTML = "Ingresá un número de <code>tenant_id</code> válido.";
        }
      }

      tidInput.addEventListener("input", updatePreview);
      tidSelect.addEventListener("change", function () {
        tidInput.value = tidSelect.value;
        updatePreview();
      });
      btSelect.addEventListener("change", updatePreview);
      updatePreview();

      function renderQrPanel() {
        var st = STATE.status;
        var bt = STATE.botTarget;
        var targetLine = bt
          ? "<p style='margin:8px 0 4px'>Apuntando a: <strong>Tenant #" +
            bt.tenant_id +
            " — " +
            esc(bt.tenant_nombre) +
            "</strong> (<code>" +
            esc(bt.rubro_label) +
            "</code> · <code>" +
            esc(bt.business_type) +
            "</code>)</p>"
          : "";

        if (st === "connected") {
          qrPanel.innerHTML =
            "<div class='status-pill st-connected'>🟢 WhatsApp conectado con Baileys</div>" +
            targetLine +
            "<p class='hint'>Sesión: <code>" +
            esc(STATE.sessionId) +
            "</code>. Podés cambiar de <code>tenant_id</code> arriba en cualquier momento y tocar <strong>Confirmar y fijar este Tenant</strong> sin necesidad de volver a escanear el QR.</p>";
          return;
        }

        if (!STATE.isConfirmedForQr) {
          qrPanel.innerHTML =
            "<div class='status-pill st-wait'>⏳ Paso previo requerido</div>" +
            "<p style='margin:8px 0'>Primero elegí arriba el número de <strong>tenant_id</strong> (por ejemplo <code>1</code>) y hacé clic en <strong>Confirmar y fijar este Tenant para WhatsApp</strong> para mostrar el código QR.</p>";
          return;
        }

        if (STATE.qrDataUrl) {
          qrPanel.innerHTML =
            "<div class='status-pill st-qr'>📷 Escaneá el código QR con WhatsApp</div>" +
            targetLine +
            "<img class='qr-img' src='" +
            esc(STATE.qrDataUrl) +
            "' alt='QR WhatsApp Baileys' />" +
            "<p class='hint'>En tu teléfono: <strong>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</strong></p>";
          return;
        }

        qrPanel.innerHTML =
          "<div class='status-pill st-wait'>⏳ Generando código QR (" +
          esc(st) +
          ")...</div>" +
          targetLine +
          "<p class='hint'>Aguardá unos segundos; el código QR aparecerá automáticamente aquí sin recargar la página.</p>";
      }

      renderQrPanel();

      function pollStatus() {
        fetch("/api/webhooks/whatsapp/baileys/status", {
          headers: { Accept: "application/json", Authorization: "Bearer " + STATE.token },
          cache: "no-store",
        })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (data) {
            if (!data || !data.ok) return;
            STATE.status = data.status;
            STATE.qrDataUrl = data.qrDataUrl || null;
            if (data.botTarget) {
              STATE.botTarget = data.botTarget;
              if (data.botTarget.locked) {
                STATE.isConfirmedForQr = true;
              }
            }
            renderQrPanel();
          })
          .catch(function () {});
      }

      setInterval(pollStatus, 3000);
    })();
  </script>
</body>
</html>`);
});

export default router;
