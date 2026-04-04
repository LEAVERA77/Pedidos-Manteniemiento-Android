import { query } from "../db/neon.js";
import {
  sendWhatsAppInteractiveListWithCredentials,
  decodeWhatsAppListRowId,
  normalizeWhatsAppRecipientForMeta,
} from "./metaWhatsapp.js";
import { logWhatsappMensajeEnviado } from "./whatsappNotificacionesLog.js";
import {
  getWhatsAppCredentialsByMetaPhoneNumberId,
  getWhatsAppCredentialsForTenant,
  sendBotWhatsAppText,
  sendTenantWhatsAppText,
} from "./whatsappService.js";
import { crearPedidoDesdeWhatsappBot } from "./pedidoWhatsappBot.js";
import { buscarIdentidadParaReclamoWhatsApp } from "./whatsappReclamanteLookup.js";
import { tiposReclamoParaClienteTipo } from "./tiposReclamo.js";
import { resolveTenantIdByMetaPhoneNumberId } from "./metaTenantWhatsapp.js";
import { tryConsumeClienteOpinionReply } from "./whatsappClienteOpinion.js";
import { geocodeAddressArgentina, reverseGeocodeArgentina } from "./nominatimClient.js";
import {
  humanChatOpenOrGetSession,
  humanChatQueueSnapshot,
  humanChatAppendInbound,
  humanChatCloseBySessionId,
} from "./whatsappHumanChat.js";

const sessions = new Map();

/** Tras la descripción: pedir pin GPS o texto de dirección (flujo bot). */
const MSG_SOLICITAR_UBICACION =
  "Por favor, enviá tu *ubicación actual* usando el botón *Adjuntar* (📎) → *Ubicación* en WhatsApp.\n\n" +
  "Si no podés compartir GPS, escribí la *dirección o referencia* del lugar (calle, ciudad, barrio).";

const MSG_OPCIONAL_IDENTIFICADOR =
  "Si tenés *NIS*, *medidor*, *número de socio* o *ID de usuario* del sistema, escribilo en un mensaje (así podemos completar tu *nombre* desde la base).\n\n" +
  "Si no tenés esos datos, podés escribir tu *nombre completo* o una *dirección / referencia* (calle, barrio, ciudad).\n\n" +
  "Si preferís seguir sin identificación, escribí *no* o *siguiente*.";

const BLOQUEO_RECLAMOS_MSG_DEFAULT =
  "Por el momento no podemos registrar reclamos por WhatsApp. Pedimos disculpas; comunicate por los canales habituales de la empresa.";

function resolveWhatsappBloqueoReclamos(cfgObj) {
  const c = cfgObj && typeof cfgObj === "object" ? cfgObj : {};
  const envOn =
    process.env.WHATSAPP_BLOQUEO_RECLAMOS === "1" ||
    process.env.WHATSAPP_BLOQUEO_RECLAMOS === "true";
  const tenantOn =
    c.whatsapp_bloqueo_reclamos === true ||
    c.whatsapp_bloqueo_reclamos === "true" ||
    c.whatsapp_bloqueo_reclamos === 1 ||
    c.whatsapp_bloqueo_reclamos === "1";
  const mensaje = String(c.whatsapp_bloqueo_mensaje || process.env.WHATSAPP_BLOQUEO_MENSAJE || "").trim();
  return {
    active: envOn || tenantOn,
    mensaje: mensaje || BLOQUEO_RECLAMOS_MSG_DEFAULT,
  };
}

/** Texto libre aceptable como nombre o referencia (no lookup en base). */
function esIdentificacionLibreRazonable(texto) {
  const t = String(texto || "").trim();
  if (t.length < 3 || t.length > 500) return false;
  if (!/[\p{L}\p{N}]/u.test(t)) return false;
  const sinEsp = t.replace(/\s/g, "");
  if (sinEsp.length < 2) return false;
  return true;
}

/** Si conviene usar el texto como contactName del pedido (evita pisar con direcciones muy numéricas). */
function pareceNombreParaContactoWhatsapp(texto) {
  const t = String(texto || "").trim();
  if (t.length < 2 || t.length > 120) return false;
  const digitCount = (t.match(/\d/g) || []).length;
  if (digitCount > 5) return false;
  return /[\p{L}]{2,}/u.test(t);
}

function botTenantId() {
  return Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
}

function sessionKey(phoneDigits, tenantId) {
  return `${String(phoneDigits || "").replace(/\D/g, "")}:${Number(tenantId)}`;
}

function normCfg(cfg) {
  if (!cfg || typeof cfg !== "object") return {};
  return cfg;
}

async function loadTenantBotContext(tenantId) {
  const r = await query(
    `SELECT id, nombre, tipo, configuracion FROM clientes WHERE id = $1 AND activo = TRUE LIMIT 1`,
    [tenantId]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  let cfg = row.configuracion;
  if (typeof cfg === "string") {
    try {
      cfg = JSON.parse(cfg);
    } catch (_) {
      cfg = {};
    }
  }
  const c = normCfg(cfg);
  const bloqueo = resolveWhatsappBloqueoReclamos(c);
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    lat: c.lat_base != null ? Number(c.lat_base) : null,
    lng: c.lng_base != null ? Number(c.lng_base) : null,
    tipos: tiposReclamoParaClienteTipo(row.tipo),
    whatsappBloqueoReclamos: bloqueo.active,
    whatsappBloqueoMensaje: bloqueo.mensaje,
  };
}

function textoBienvenidaYAyuda(ctx) {
  const n = ctx.nombre || "nuestro servicio";
  const max = ctx.tipos?.length || 0;
  return (
    `Bienvenido al centro de atención de *${n}*.\n\n` +
    `Para ver los tipos de reclamo, escribí *Cargar reclamo* (te enviaremos una lista en el chat).\n\n` +
    (max
      ? `Si preferís, escribí solo el *número* del *1* al *${max}* según esta guía:\n\n${ctx.tipos.map((t, i) => `${i + 1}) ${t}`).join("\n")}\n\n`
      : "") +
    `Enviá *menú* o *0* para repetir este mensaje.`
  );
}

/** Menú solo texto (respaldo si la lista interactiva falla o clientes antiguos). */
function menuTextoNumerado(ctx) {
  const lineas = [
    `📋 *${ctx.nombre || "Pedidos"}*`,
    "",
    "Escribí el *número* de tu reclamo:",
    "",
  ];
  ctx.tipos.forEach((t, i) => {
    lineas.push(`${i + 1}) ${t}`);
  });
  lineas.push("");
  lineas.push("O escribí *Cargar reclamo* para abrir la lista.");
  return lineas.join("\n");
}

function esPedidoCargarReclamo(text) {
  const n = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (/\bcargar\s+reclamo\b/.test(n)) return true;
  if (/\bnuevo\s+reclamo\b/.test(n)) return true;
  if (/\bquiero\s+(hacer\s+)?(un\s+)?reclamo\b/.test(n)) return true;
  if (n === "reclamo" || n === "lista" || n === "tipos") return true;
  return false;
}

/** Resuelve tenant para enviar con el mismo número/token que recibió el webhook (multitenant). */
async function tenantIdForWebhook(phoneNumberId) {
  const resolved = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  return resolved != null && Number.isFinite(Number(resolved)) ? Number(resolved) : botTenantId();
}

async function reply(phoneDigits, text, tenantId, webhookPhoneNumberId = null) {
  const tid =
    tenantId != null && Number.isFinite(Number(tenantId)) && Number(tenantId) >= 1
      ? Number(tenantId)
      : botTenantId();
  const wpid = webhookPhoneNumberId != null ? String(webhookPhoneNumberId).trim() : "";
  const r = wpid
    ? await sendBotWhatsAppText({
        tenantId: tid,
        webhookPhoneNumberId: wpid,
        toDigits: phoneDigits,
        bodyText: text,
        logContext: "whatsapp_bot_meta",
      })
    : await sendTenantWhatsAppText({
        tenantId: tid,
        toDigits: phoneDigits,
        bodyText: text,
        logContext: "whatsapp_bot_meta",
      });
  if (!r.ok) {
    console.error("[whatsapp-bot-meta] send failed", {
      tenantId: tid,
      error: r.error,
      graph: r.graph?.error || r.graph,
    });
  } else {
    console.log("[webhook-meta-whatsapp] outbound_sent", {
      to: String(phoneDigits || "").replace(/\D/g, "").slice(0, 4) + "…",
      ok: true,
      tenantId: tid,
    });
  }
  return r;
}

const TIPO_RECLAMO_OTROS = "Otros";

async function iniciarFlujoOtrosHumano(phone, tid, wpid, contactName, ctx) {
  const sk = sessionKey(phone, tid);
  try {
    const { id: sessionDbId, isNew } = await humanChatOpenOrGetSession(tid, phone, contactName);
    const snap = await humanChatQueueSnapshot(tid, sessionDbId);
    sessions.set(sk, {
      step: "human_chat",
      humanChatSessionId: sessionDbId,
      tenantId: tid,
      tipoCliente: ctx.tipo,
      contactName: contactName || null,
      phoneNumberId: wpid,
      humanChatFirstAcked: !isNew,
    });
    let body;
    if (snap.otherActive) {
      body =
        `En este momento otro cliente está en *atención* con un representante.\n\n` +
        `Estás en *lista de espera* (lugar aproximado en la cola: *${snap.position}* de *${snap.totalOpen}*).\n\n` +
        `Podés escribir tu *consulta* igualmente; quedará registrada y te atenderemos en orden.`;
    } else if (snap.position > 1) {
      body =
        `Elegiste *Otros*: te derivamos a un *representante humano*.\n\n` +
        `Hay *${snap.position - 1}* persona(s) antes que vos en la cola. Un representante te atenderá a la brevedad.\n\n` +
        `Escribí tu *mensaje* por acá. Para volver al *menú automático*, escribí *menú*, *salir* o *fin*.`;
    } else {
      body =
        `Elegiste *Otros*: te derivamos a un *representante humano*.\n\n` +
        `Escribí tu *consulta* o pregunta por este chat; te responderemos a la brevedad.\n\n` +
        `Para volver al *menú automático*, escribí *menú*, *salir* o *fin*.`;
    }
    await reply(phone, body, tid, wpid);
  } catch (e) {
    console.error("[whatsapp-bot-meta] iniciarFlujoOtrosHumano", e);
    await reply(
      phone,
      "No pudimos iniciar el chat con un representante. Intentá más tarde o escribí *menú*.",
      tid,
      wpid
    );
  }
}

/**
 * Extrae lat/lng del mensaje Cloud API tipo `location` (msg.location).
 * @returns {{ lat: number, lng: number } | null}
 */
export function extractLocationFromMetaMessage(msg) {
  if (!msg || String(msg.type || "") !== "location") return null;
  const loc = msg.location || {};
  const la = Number(loc.latitude);
  const lo = Number(loc.longitude);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lng: lo };
}

async function finalizePedidoFromSession(phone, sess, contactName) {
  const sk = sessionKey(phone, sess.tenantId);
  let descripcionFinal = String(sess.descripcion || "").trim();
  if (!descripcionFinal) {
    sessions.delete(sk);
    await reply(
      phone,
      "Faltan datos del pedido. Escribí *menú* para empezar de nuevo.",
      sess.tenantId,
      sess.phoneNumberId
    );
    return;
  }
  if (sess.direccionTexto && String(sess.direccionTexto).trim()) {
    descripcionFinal += `\n\nUbicación indicada por el usuario: ${String(sess.direccionTexto).trim()}`;
  }
  if (sess.identificacionLibreTexto && String(sess.identificacionLibreTexto).trim()) {
    descripcionFinal += `\n\nIdentificación / referencia proporcionada por el usuario: ${String(sess.identificacionLibreTexto).trim()}`;
  }
  const latN = sess.lat != null && Number.isFinite(Number(sess.lat)) ? Number(sess.lat) : null;
  const lngN = sess.lng != null && Number.isFinite(Number(sess.lng)) ? Number(sess.lng) : null;
  try {
    const pedido = await crearPedidoDesdeWhatsappBot({
      tenantId: sess.tenantId,
      tipoCliente: sess.tipoCliente,
      tipoTrabajo: sess.tipo,
      descripcion: descripcionFinal,
      telefonoContacto: phone,
      lat: latN,
      lng: lngN,
      contactName: sess.contactName || contactName || null,
      nis: sess.nisParaPedido ?? null,
      medidor: sess.medidorParaPedido ?? null,
      nisMedidor: sess.nisMedidorParaPedido ?? null,
    });
    sessions.delete(sk);
    await reply(
      phone,
      `Su reclamo N° *${pedido.numero_pedido}* ha sido cargado con éxito.\n\nTipo: *${sess.tipo}*\n\nGracias por contactarnos.`,
      sess.tenantId,
      sess.phoneNumberId
    );
  } catch (e) {
    const m = String(e?.message || "");
    sessions.delete(sk);
    if (m === "sin_usuario_admin_tenant" || m === "sin_usuario_para_pedido_whatsapp") {
      await reply(
        phone,
        "No pudimos asociar el reclamo a un usuario del sistema (falta personal cargado o configuración). Avisá a la cooperativa/municipio.",
        sess.tenantId,
        sess.phoneNumberId
      );
    } else {
      await reply(
        phone,
        "No pudimos registrar el pedido. Intentá de nuevo o llamá a la oficina.",
        sess.tenantId,
        sess.phoneNumberId
      );
    }
  }
}

/** Cloud API: máximo 10 filas en una lista interactiva. */
const MAX_WHATSAPP_LIST_ROWS = 10;

async function replyListaTiposReclamo(phoneDigits, ctx, phoneNumberIdWebhook) {
  if (ctx.whatsappBloqueoReclamos) {
    await reply(phoneDigits, ctx.whatsappBloqueoMensaje, ctx.id, phoneNumberIdWebhook);
    return { ok: true, blocked: true };
  }
  const bodyText = `Elegí el tipo que mejor describe tu reclamo:`;
  const pid = String(phoneNumberIdWebhook || "").trim();
  let accessToken = "";
  let graphPid = pid;
  if (pid) {
    const byPid = await getWhatsAppCredentialsByMetaPhoneNumberId(pid);
    accessToken = String(byPid.accessToken || "").trim();
  }
  if (!accessToken || !graphPid) {
    const creds = await getWhatsAppCredentialsForTenant(ctx.id);
    accessToken = String(creds.accessToken || "").trim();
    graphPid = pid || String(creds.phoneNumberId || "").trim();
  }
  if (!accessToken || !graphPid) {
    console.error("[whatsapp-bot-meta] lista interactiva: sin credenciales Meta");
    await reply(phoneDigits, menuTextoNumerado(ctx), ctx.id, pid || null);
    return { ok: false, error: "missing_meta_credentials" };
  }
  if (ctx.tipos.length > MAX_WHATSAPP_LIST_ROWS) {
    console.warn("[whatsapp-bot-meta] demasiados tipos para lista WA, usando menú numerado", {
      n: ctx.tipos.length,
      tenantId: ctx.id,
    });
    await reply(
      phoneDigits,
      menuTextoNumerado(ctx) + "\n\n_(Hay muchas opciones: escribí el número del 1 al " + ctx.tipos.length + ".)_",
      ctx.id,
      pid || null
    );
    return { ok: true, skippedInteractive: true };
  }
  const r = await sendWhatsAppInteractiveListWithCredentials(
    phoneDigits,
    {
      bodyText,
      buttonText: "Ver tipos",
      sectionTitle: "Tipos de reclamo",
      tipos: ctx.tipos,
    },
    { accessToken, phoneNumberId: graphPid }
  );
  const logTxt = r.ok ? `[lista interactiva] ${ctx.tipos.length} tipos (${ctx.nombre || "tenant"})` : `[lista interactiva] error`;
  try {
    await logWhatsappMensajeEnviado(phoneDigits, logTxt, r.ok);
  } catch (e) {
    console.error("[whatsapp-bot-meta] log enviado", e.message);
  }
  if (!r.ok) {
    console.error("[whatsapp-bot-meta] lista interactiva falló, menú texto", r.graph || r.error);
    await reply(phoneDigits, menuTextoNumerado(ctx), ctx.id, pid || null);
  } else {
    console.log("[webhook-meta-whatsapp] outbound_list", { to: String(phoneDigits || "").replace(/\D/g, "").slice(0, 4) + "…", ok: true });
  }
  return r;
}

export async function handleInboundMetaWhatsAppPayload(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const phoneNumberId = value?.metadata?.phone_number_id ?? null;
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      for (const msg of messages) {
        const from = String(msg?.from || "");
        if (!from) continue;
        const fromNorm = normalizeWhatsAppRecipientForMeta(from.replace(/\D/g, ""));
        const cMatch = contacts.find(
          (c) =>
            normalizeWhatsAppRecipientForMeta(String(c?.wa_id || "").replace(/\D/g, "")) === fromNorm
        );
        const contactName = cMatch?.profile?.name || contacts[0]?.profile?.name || null;

        if (msg?.type === "interactive") {
          const ir = msg.interactive;
          if (ir?.type === "list_reply") {
            const rowId = ir?.list_reply?.id;
            try {
              await processListReplySelection({
                fromRaw: from,
                listRowId: rowId,
                phoneNumberId,
                contactName,
              });
            } catch (e) {
              console.error("[whatsapp-bot-meta] list_reply error", e);
              await reply(
                fromNorm,
                "No pudimos leer tu elección. Escribí *menú* para empezar de nuevo.",
                await tenantIdForWebhook(phoneNumberId),
                phoneNumberId
              );
            }
          } else if (ir?.type === "button_reply") {
            const title = String(ir?.button_reply?.title || "").trim();
            try {
              await processInboundText({
                fromRaw: from,
                text: title || "menú",
                phoneNumberId,
                contactName,
              });
            } catch (e) {
              console.error("[whatsapp-bot-meta] button_reply error", e);
            }
          }
          continue;
        }

        if (msg?.type === "location") {
          const coords = extractLocationFromMetaMessage(msg);
          try {
            if (coords) {
              await processInboundLocation({
                fromRaw: from,
                lat: coords.lat,
                lng: coords.lng,
                phoneNumberId,
                contactName,
              });
            } else {
              await reply(
                fromNorm,
                "No pudimos leer las coordenadas. Enviá de nuevo con *Adjuntar* → *Ubicación*, o escribí una dirección.",
                await tenantIdForWebhook(phoneNumberId),
                phoneNumberId
              );
            }
          } catch (e) {
            console.error("[whatsapp-bot-meta] location error", e);
            await reply(
              fromNorm,
              "Error al procesar la ubicación. Intentá de nuevo o escribí *menú*.",
              await tenantIdForWebhook(phoneNumberId),
              phoneNumberId
            );
          }
          continue;
        }

        if (msg?.type !== "text") continue;
        const text = String(msg?.text?.body || "").trim();
        if (!text) continue;
        try {
          await processInboundText({
            fromRaw: from,
            text,
            phoneNumberId,
            contactName,
          });
        } catch (e) {
          console.error("[whatsapp-bot-meta] process error", e);
          await reply(
            fromNorm,
            "Ocurrió un error. Intentá más tarde o contactá a la oficina.",
            await tenantIdForWebhook(phoneNumberId),
            phoneNumberId
          );
        }
      }
    }
  }
}

async function processInboundLocation({ fromRaw, lat, lng, phoneNumberId, contactName }) {
  const phone = normalizeWhatsAppRecipientForMeta(String(fromRaw || "").replace(/\D/g, ""));
  const botOff = process.env.WHATSAPP_BOT_ENABLED === "0" || process.env.WHATSAPP_BOT_ENABLED === "false";
  if (botOff) return;

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);
  const sess = sessions.get(sk);

  if (sess && sess.step === "human_chat") {
    await reply(
      phone,
      "Para el chat con un representante alcanza con escribir tu *consulta* en texto. Si querés enviar ubicación, hacelo en un mensaje de texto (calle, ciudad).",
      tid,
      phoneNumberId
    );
    return;
  }

  if (!sess || sess.step !== "awaiting_location") {
    await reply(phone, "Ahora no estamos esperando una ubicación. Escribí *menú* para ver las opciones.", tid, phoneNumberId);
    return;
  }

  const ctxOk = await loadTenantBotContext(tid);
  if (!ctxOk) {
    sessions.delete(sk);
    await reply(phone, "Servicio no configurado. Contactá al administrador.", tid, phoneNumberId);
    return;
  }

  sess.lat = lat;
  sess.lng = lng;
  sess.direccionTexto = null;
  try {
    const rev = await reverseGeocodeArgentina(lat, lng);
    if (rev?.displayName) sess.direccionTexto = rev.displayName;
  } catch (_) {}
  if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
  sessions.set(sk, sess);
  await finalizePedidoFromSession(phone, sess, contactName);
}

async function processListReplySelection({ fromRaw, listRowId, phoneNumberId, contactName }) {
  const phone = normalizeWhatsAppRecipientForMeta(String(fromRaw || "").replace(/\D/g, ""));
  const botOff = process.env.WHATSAPP_BOT_ENABLED === "0" || process.env.WHATSAPP_BOT_ENABLED === "false";
  if (botOff) return;

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);
  const ctx = await loadTenantBotContext(tid);
  if (!ctx) {
    await reply(phone, "Servicio no configurado. Contactá al administrador.", tid, phoneNumberId);
    return;
  }
  const tipo = decodeWhatsAppListRowId(listRowId);
  if (!tipo || !ctx.tipos.includes(tipo)) {
    await reply(phone, "Opción no válida. Escribí *menú* para ver las opciones.", tid, phoneNumberId);
    return;
  }
  if (tipo !== TIPO_RECLAMO_OTROS && ctx.whatsappBloqueoReclamos) {
    await reply(phone, ctx.whatsappBloqueoMensaje, tid, phoneNumberId);
    return;
  }
  const wpid = phoneNumberId ? String(phoneNumberId).trim() : null;
  if (tipo === TIPO_RECLAMO_OTROS) {
    await iniciarFlujoOtrosHumano(phone, tid, wpid, contactName, ctx);
    return;
  }
  sessions.set(sk, {
    step: "awaiting_desc",
    tipo,
    tenantId: tid,
    tipoCliente: ctx.tipo,
    contactName: contactName || null,
    phoneNumberId: wpid,
  });
  await reply(
    phone,
    `Elegiste: *${tipo}*.\n\nAhora escribí una *breve descripción* del problema (una o varias líneas).`,
    tid,
    phoneNumberId
  );
}

async function processInboundText({ fromRaw, text, phoneNumberId, contactName }) {
  const phone = normalizeWhatsAppRecipientForMeta(String(fromRaw || "").replace(/\D/g, ""));
  const botOff = process.env.WHATSAPP_BOT_ENABLED === "0" || process.env.WHATSAPP_BOT_ENABLED === "false";

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);

  try {
    const opinionTry = await tryConsumeClienteOpinionReply({ tenantId: tid, phoneDigits: phone, text });
    if (opinionTry.handled && opinionTry.ack) {
      await reply(phone, opinionTry.ack, tid, phoneNumberId);
      return;
    }
  } catch (e) {
    console.error("[whatsapp-bot-meta] opinion reply", e.message);
  }

  // En chat humano (Otros), "Hola" es mensaje del cliente, no reinicio del menú automático.
  if (/\bhola\b/i.test(String(text || "").trim()) && sessions.get(sk)?.step !== "human_chat") {
    console.log("[whatsapp-bot-meta] hola detectado", { phone, text: String(text || "").slice(0, 120), tenant: tid });
    const prevS = sessions.get(sk);
    if (prevS?.humanChatSessionId) {
      try {
        await humanChatCloseBySessionId(prevS.humanChatSessionId);
      } catch (_) {}
    }
    sessions.delete(sk);
    const ctx = await loadTenantBotContext(tid);
    const nombre = ctx?.nombre || "GestorNova";
    if (botOff) {
      await reply(
        phone,
        `Bienvenido al centro de atención de *${nombre}*. El asistente automático está desactivado.`,
        tid,
        phoneNumberId
      );
      return;
    }
    if (!ctx) {
      await reply(
        phone,
        `Bienvenido al centro de atención de *${nombre}*. Estamos completando la configuración del servicio.`,
        tid,
        phoneNumberId
      );
      return;
    }
    await reply(phone, textoBienvenidaYAyuda(ctx), tid, phoneNumberId);
    return;
  }

  if (botOff) return;

  const ctx = await loadTenantBotContext(tid);
  if (!ctx) {
    await reply(phone, "Servicio no configurado. Contactá al administrador.", tid, phoneNumberId);
    return;
  }

  const lower = text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    lower === "menú" ||
    lower === "menu" ||
    lower === "0" ||
    lower === "inicio" ||
    lower === "volver" ||
    lower === "ayuda"
  ) {
    const prevM = sessions.get(sk);
    if (prevM?.humanChatSessionId) {
      try {
        await humanChatCloseBySessionId(prevM.humanChatSessionId);
      } catch (_) {}
    }
    sessions.delete(sk);
    await reply(phone, textoBienvenidaYAyuda(ctx), tid, phoneNumberId);
    return;
  }

  let sess = sessions.get(sk);
  const wpid = phoneNumberId ? String(phoneNumberId).trim() : null;

  if (sess && sess.step === "awaiting_location") {
    const t = String(text || "").trim();
    if (t.length < 3) {
      await reply(
        phone,
        "Escribí una dirección o referencia más completa, o enviá la *ubicación* con *Adjuntar* → *Ubicación* en WhatsApp.",
        tid,
        phoneNumberId
      );
      return;
    }
    try {
      const geo = await geocodeAddressArgentina(t);
      if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
        sess.direccionTexto = geo.displayName || t;
        sess.lat = geo.lat;
        sess.lng = geo.lng;
        if (phoneNumberId) sess.phoneNumberId = String(phoneNumberId).trim();
        sessions.set(sk, sess);
        await finalizePedidoFromSession(phone, sess, contactName);
        return;
      }
    } catch (e) {
      console.error("[whatsapp-bot-meta] geocode direccion", e?.message || e);
    }
    await reply(
      phone,
      "No pudimos ubicar esa dirección en el mapa. Enviá tu *ubicación actual* con *Adjuntar* (📎) → *Ubicación* (GPS) en WhatsApp.",
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "awaiting_opcional_id") {
    const raw = String(text || "").trim();
    const low = raw.toLowerCase();
    if (/^(no|n|salto|siguiente|omitir|sigue|skip|-|)$/i.test(low) || low === "0") {
      sessions.set(sk, {
        ...sess,
        step: "awaiting_location",
        phoneNumberId: sess.phoneNumberId || wpid,
      });
      await reply(phone, MSG_SOLICITAR_UBICACION, tid, phoneNumberId);
      return;
    }
    const res = await buscarIdentidadParaReclamoWhatsApp(tid, raw);
    if (res.skip) {
      sessions.set(sk, {
        ...sess,
        step: "awaiting_location",
        phoneNumberId: sess.phoneNumberId || wpid,
      });
      await reply(phone, MSG_SOLICITAR_UBICACION, tid, phoneNumberId);
      return;
    }
    if (!res.ok) {
      if (esIdentificacionLibreRazonable(raw)) {
        const next = {
          ...sess,
          step: "awaiting_location",
          identificacionLibreTexto: raw,
          nisParaPedido: null,
          medidorParaPedido: null,
          nisMedidorParaPedido: null,
          phoneNumberId: sess.phoneNumberId || wpid,
        };
        if (pareceNombreParaContactoWhatsapp(raw)) {
          next.contactName = raw;
        }
        sessions.set(sk, next);
        await reply(
          phone,
          "Listo. *Tomamos* tu *nombre o referencia* para este reclamo.\n\n" + MSG_SOLICITAR_UBICACION,
          tid,
          phoneNumberId
        );
        return;
      }
      await reply(
        phone,
        "No encontramos ese dato para este servicio. Revisá el número o escribí *no* para continuar sin datos.",
        tid,
        phoneNumberId
      );
      return;
    }
    const nuevoNombre = res.clienteNombre;
    sessions.set(sk, {
      ...sess,
      step: "awaiting_location",
      contactName: nuevoNombre || sess.contactName,
      nisParaPedido: res.nis ?? null,
      medidorParaPedido: res.medidor ?? null,
      nisMedidorParaPedido: res.nisMedidor ?? null,
      phoneNumberId: sess.phoneNumberId || wpid,
    });
    await reply(
      phone,
      `Listo, registramos a *${nuevoNombre}*.\n\n` + MSG_SOLICITAR_UBICACION,
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess && sess.step === "human_chat") {
    if (lower === "salir" || lower === "fin" || lower === "chau") {
      try {
        await humanChatCloseBySessionId(sess.humanChatSessionId);
      } catch (_) {}
      sessions.delete(sk);
      await reply(
        phone,
        "Cerramos el chat con el representante. Cuando quieras, escribí *menú* para ver las opciones.",
        tid,
        phoneNumberId
      );
      return;
    }
    try {
      await humanChatAppendInbound(sess.humanChatSessionId, text);
    } catch (e) {
      if (e && (e.code === "HUMAN_CHAT_CLOSED" || String(e.message || "").includes("human_chat_session_closed"))) {
        sessions.delete(sk);
        await reply(
          phone,
          "El chat con el representante ya *finalizó*. Escribí *menú* para ver las opciones del asistente.",
          tid,
          phoneNumberId
        );
        return;
      }
      console.error("[whatsapp-bot-meta] human_chat inbound", e);
      await reply(phone, "No pudimos registrar el mensaje. Intentá de nuevo.", tid, phoneNumberId);
      return;
    }
    if (!sess.humanChatFirstAcked) {
      sess.humanChatFirstAcked = true;
      sessions.set(sk, sess);
      await reply(phone, "Recibimos tu mensaje. Un *representante* te responderá a la brevedad.", tid, phoneNumberId);
    }
    return;
  }

  if (!sess || sess.step === "idle") {
    if (esPedidoCargarReclamo(text)) {
      if (ctx.whatsappBloqueoReclamos) {
        await reply(phone, ctx.whatsappBloqueoMensaje, tid, phoneNumberId);
        return;
      }
      await replyListaTiposReclamo(phone, ctx, phoneNumberId);
      return;
    }
    const n = parseInt(text, 10);
    if (Number.isFinite(n) && n >= 1 && n <= ctx.tipos.length) {
      const tipoSel = ctx.tipos[n - 1];
      if (tipoSel === TIPO_RECLAMO_OTROS) {
        await iniciarFlujoOtrosHumano(phone, tid, wpid, contactName, ctx);
        return;
      }
      if (ctx.whatsappBloqueoReclamos) {
        await reply(phone, ctx.whatsappBloqueoMensaje, tid, phoneNumberId);
        return;
      }
      sessions.set(sk, {
        step: "awaiting_desc",
        tipo: tipoSel,
        tenantId: tid,
        tipoCliente: ctx.tipo,
        contactName: contactName || null,
        phoneNumberId: wpid,
      });
      await reply(
        phone,
        `Elegiste: *${tipoSel}*.\n\nAhora escribí una *breve descripción* del problema (una o varias líneas).`,
        tid,
        phoneNumberId
      );
      return;
    }
    await reply(
      phone,
      `No reconocí el mensaje.\n\n` + textoBienvenidaYAyuda(ctx),
      tid,
      phoneNumberId
    );
    return;
  }

  if (sess.step === "awaiting_desc") {
    if (/^\d+$/.test(text) && parseInt(text, 10) >= 0 && parseInt(text, 10) <= ctx.tipos.length) {
      sessions.delete(sk);
      await reply(phone, "Reiniciamos.\n\n" + textoBienvenidaYAyuda(ctx), tid, phoneNumberId);
      return;
    }
    const desc = text;
    if (desc.length < 4) {
      await reply(phone, "La descripción es muy corta. Contanos un poco más del problema.", tid, phoneNumberId);
      return;
    }
    sessions.set(sk, {
      ...sess,
      step: "awaiting_opcional_id",
      descripcion: desc,
      phoneNumberId: sess.phoneNumberId || wpid,
    });
    await reply(phone, MSG_OPCIONAL_IDENTIFICADOR, tid, phoneNumberId);
    return;
  }
}
