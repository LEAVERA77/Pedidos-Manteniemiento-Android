import { query } from "../db/neon.js";
import {
  metaSendWhatsAppText,
  sendWhatsAppInteractiveList,
  decodeWhatsAppListRowId,
} from "./metaWhatsapp.js";
import { logWhatsappMensajeEnviado } from "./whatsappNotificacionesLog.js";
import { crearPedidoDesdeWhatsappBot } from "./pedidoWhatsappBot.js";
import { tiposReclamoParaClienteTipo } from "./tiposReclamo.js";
import { resolveTenantIdByMetaPhoneNumberId } from "./metaTenantWhatsapp.js";

const sessions = new Map();

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
  return {
    id: row.id,
    nombre: row.nombre,
    tipo: row.tipo,
    lat: c.lat_base != null ? Number(c.lat_base) : null,
    lng: c.lng_base != null ? Number(c.lng_base) : null,
    tipos: tiposReclamoParaClienteTipo(row.tipo),
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

async function reply(phoneDigits, text) {
  const r = await metaSendWhatsAppText(phoneDigits, text);
  try {
    await logWhatsappMensajeEnviado(phoneDigits, text, r.ok);
  } catch (e) {
    console.error("[whatsapp-bot-meta] log enviado", e.message);
  }
  if (!r.ok) {
    console.error("[whatsapp-bot-meta] send failed", {
      ok: r.ok,
      error: r.error,
      status: r.status,
      graph: r.graph ? (r.graph.error || r.graph) : undefined
    });
  } else {
    console.log("[webhook-meta-whatsapp] outbound_sent", { to: String(phoneDigits || "").replace(/\D/g, "").slice(0, 4) + "…", ok: true });
  }
  return r;
}

async function replyListaTiposReclamo(phoneDigits, ctx) {
  const bodyText = `Elegí el tipo que mejor describe tu reclamo:`;
  const r = await sendWhatsAppInteractiveList(phoneDigits, {
    bodyText,
    buttonText: "Ver tipos",
    sectionTitle: "Tipos de reclamo",
    tipos: ctx.tipos,
  });
  const logTxt = r.ok ? `[lista interactiva] ${ctx.tipos.length} tipos (${ctx.nombre || "tenant"})` : `[lista interactiva] error`;
  try {
    await logWhatsappMensajeEnviado(phoneDigits, logTxt, r.ok);
  } catch (e) {
    console.error("[whatsapp-bot-meta] log enviado", e.message);
  }
  if (!r.ok) {
    console.error("[whatsapp-bot-meta] lista interactiva falló, menú texto", r.graph || r.error);
    await reply(phoneDigits, menuTextoNumerado(ctx));
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
        const fromNorm = from.replace(/\D/g, "");
        const cMatch = contacts.find((c) => String(c?.wa_id || "").replace(/\D/g, "") === fromNorm);
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
              await reply(fromNorm, "No pudimos leer tu elección. Escribí *menú* para empezar de nuevo.");
            }
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
          await reply(fromNorm, "Ocurrió un error. Intentá más tarde o contactá a la oficina.");
        }
      }
    }
  }
}

async function processListReplySelection({ fromRaw, listRowId, phoneNumberId, contactName }) {
  const phone = String(fromRaw || "").replace(/\D/g, "");
  const botOff = process.env.WHATSAPP_BOT_ENABLED === "0" || process.env.WHATSAPP_BOT_ENABLED === "false";
  if (botOff) return;

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);
  const ctx = await loadTenantBotContext(tid);
  if (!ctx) {
    await reply(phone, "Servicio no configurado. Contactá al administrador.");
    return;
  }
  const tipo = decodeWhatsAppListRowId(listRowId);
  if (!tipo || !ctx.tipos.includes(tipo)) {
    await reply(phone, "Opción no válida. Escribí *menú* para ver las opciones.");
    return;
  }
  sessions.set(sk, {
    step: "awaiting_desc",
    tipo,
    tenantId: tid,
    tipoCliente: ctx.tipo,
    contactName: contactName || null,
  });
  await reply(
    phone,
    `Elegiste: *${tipo}*.\n\nAhora escribí una *breve descripción* del problema (una o varias líneas).`
  );
}

async function processInboundText({ fromRaw, text, phoneNumberId, contactName }) {
  const phone = String(fromRaw || "").replace(/\D/g, "");
  const botOff = process.env.WHATSAPP_BOT_ENABLED === "0" || process.env.WHATSAPP_BOT_ENABLED === "false";

  const resolvedTid = await resolveTenantIdByMetaPhoneNumberId(phoneNumberId);
  const tid = resolvedTid ?? botTenantId();
  const sk = sessionKey(phone, tid);

  if (/\bhola\b/i.test(String(text || "").trim())) {
    console.log("[whatsapp-bot-meta] hola detectado", { phone, text: String(text || "").slice(0, 120), tenant: tid });
    sessions.delete(sk);
    const ctx = await loadTenantBotContext(tid);
    const nombre = ctx?.nombre || "GestorNova";
    if (botOff) {
      await reply(
        phone,
        `Bienvenido al centro de atención de *${nombre}*. El asistente automático está desactivado.`
      );
      return;
    }
    if (!ctx) {
      await reply(phone, `Bienvenido al centro de atención de *${nombre}*. Estamos completando la configuración del servicio.`);
      return;
    }
    await reply(phone, textoBienvenidaYAyuda(ctx));
    return;
  }

  if (botOff) return;

  const ctx = await loadTenantBotContext(tid);
  if (!ctx) {
    await reply(phone, "Servicio no configurado. Contactá al administrador.");
    return;
  }

  const lower = text.toLowerCase().trim();
  if (lower === "menú" || lower === "menu" || lower === "0") {
    sessions.delete(sk);
    await reply(phone, textoBienvenidaYAyuda(ctx));
    return;
  }

  let sess = sessions.get(sk);

  if (!sess || sess.step === "idle") {
    if (esPedidoCargarReclamo(text)) {
      await replyListaTiposReclamo(phone, ctx);
      return;
    }
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < 1 || n > ctx.tipos.length) {
      await reply(
        phone,
        `Opción no válida. Escribí *Cargar reclamo* para ver la lista, un número del *1* al *${ctx.tipos.length}*, o *menú* para ayuda.`
      );
      return;
    }
    const tipoSel = ctx.tipos[n - 1];
    sessions.set(sk, {
      step: "awaiting_desc",
      tipo: tipoSel,
      tenantId: tid,
      tipoCliente: ctx.tipo,
      contactName: contactName || null,
    });
    await reply(
      phone,
      `Elegiste: *${tipoSel}*.\n\nAhora escribí una *breve descripción* del problema (una o varias líneas).`
    );
    return;
  }

  if (sess.step === "awaiting_desc") {
    if (/^\d+$/.test(text) && parseInt(text, 10) >= 0 && parseInt(text, 10) <= ctx.tipos.length) {
      sessions.delete(sk);
      await reply(phone, "Reiniciamos.\n\n" + textoBienvenidaYAyuda(ctx));
      return;
    }
    const desc = text;
    if (desc.length < 4) {
      await reply(phone, "La descripción es muy corta. Contanos un poco más del problema.");
      return;
    }
    try {
      const pedido = await crearPedidoDesdeWhatsappBot({
        tenantId: sess.tenantId,
        tipoCliente: sess.tipoCliente,
        tipoTrabajo: sess.tipo,
        descripcion: desc,
        telefonoContacto: phone,
        lat: Number.isFinite(ctx.lat) ? ctx.lat : null,
        lng: Number.isFinite(ctx.lng) ? ctx.lng : null,
        contactName: sess.contactName || contactName || null,
      });
      sessions.delete(sk);
      await reply(
        phone,
        `✅ *Pedido registrado*\n\nNúmero: *${pedido.numero_pedido}*\nTipo: ${sess.tipo}\n\nGracias. Te contactaremos si hace falta más información.`
      );
    } catch (e) {
      const m = String(e?.message || "");
      sessions.delete(sk);
      if (m === "sin_usuario_admin_tenant") {
        await reply(phone, "No hay un usuario administrador asignado al servicio. Avisá a la cooperativa/municipio.");
      } else {
        await reply(phone, "No pudimos registrar el pedido. Intentá de nuevo o llamá a la oficina.");
      }
    }
    return;
  }
}
