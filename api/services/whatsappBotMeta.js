import { query } from "../db/neon.js";
import { metaSendWhatsAppText } from "./metaWhatsapp.js";
import { logWhatsappMensajeEnviado } from "./whatsappNotificacionesLog.js";
import { crearPedidoDesdeWhatsappBot } from "./pedidoWhatsappBot.js";
import { tiposReclamoParaClienteTipo } from "./tiposReclamo.js";

const sessions = new Map();

function botTenantId() {
  return Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
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

function menuTexto(ctx) {
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
  lineas.push("0) Ver este menú de nuevo");
  lineas.push("");
  lineas.push("Escribí *hola* para saludar o *menú* para ver esta lista otra vez.");
  return lineas.join("\n");
}

const MSG_HOLA_GESTORNOVA =
  "¡Bienvenido a GestorNova! Pronto podrás cargar tu reclamo por aquí.";

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

export async function handleInboundMetaWhatsAppPayload(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const msg of messages) {
        if (msg?.type !== "text") continue;
        const from = String(msg?.from || "");
        const text = String(msg?.text?.body || "").trim();
        if (!from || !text) continue;
        try {
          await processInboundText(from, text);
        } catch (e) {
          console.error("[whatsapp-bot-meta] process error", e);
          await reply(from.replace(/\D/g, ""), "Ocurrió un error. Intentá más tarde o contactá a la oficina.");
        }
      }
    }
  }
}

async function processInboundText(fromRaw, text) {
  const phone = String(fromRaw || "").replace(/\D/g, "");
  const botOff = process.env.WHATSAPP_BOT_ENABLED === "0" || process.env.WHATSAPP_BOT_ENABLED === "false";

  if (/\bhola\b/i.test(String(text || "").trim())) {
    console.log("[whatsapp-bot-meta] hola detectado", { phone, text: String(text || '').slice(0, 120) });
    sessions.delete(phone);
    if (botOff) {
      await reply(phone, MSG_HOLA_GESTORNOVA);
      return;
    }
    const tid = botTenantId();
    const ctx = await loadTenantBotContext(tid);
    if (!ctx) {
      await reply(phone, MSG_HOLA_GESTORNOVA);
      return;
    }
    await reply(phone, menuTexto(ctx));
    return;
  }

  if (botOff) return;

  const tid = botTenantId();
  const ctx = await loadTenantBotContext(tid);
  if (!ctx) {
    await reply(phone, "Servicio no configurado. Contactá al administrador.");
    return;
  }

  const lower = text.toLowerCase().trim();
  if (lower === "menú" || lower === "menu" || lower === "0") {
    sessions.delete(phone);
    await reply(phone, menuTexto(ctx));
    return;
  }

  let sess = sessions.get(phone);

  if (!sess || sess.step === "idle") {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < 1 || n > ctx.tipos.length) {
      await reply(
        phone,
        `Opción no válida. Escribí un número del *1* al *${ctx.tipos.length}*, o *menú* para ver la lista completa.`
      );
      return;
    }
    const tipoSel = ctx.tipos[n - 1];
    sessions.set(phone, { step: "awaiting_desc", tipo: tipoSel, tenantId: tid, tipoCliente: ctx.tipo });
    await reply(
      phone,
      `Elegiste: *${tipoSel}*.\n\nAhora escribí una *breve descripción* del problema (una o varias líneas).`
    );
    return;
  }

  if (sess.step === "awaiting_desc") {
    if (/^\d+$/.test(text) && parseInt(text, 10) >= 0 && parseInt(text, 10) <= ctx.tipos.length) {
      sessions.delete(phone);
      await reply(phone, "Reiniciamos. " + menuTexto(ctx));
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
      });
      sessions.delete(phone);
      await reply(
        phone,
        `✅ *Pedido registrado*\n\nNúmero: *${pedido.numero_pedido}*\nTipo: ${sess.tipo}\n\nGracias. Te contactaremos si hace falta más información.`
      );
    } catch (e) {
      const m = String(e?.message || "");
      sessions.delete(phone);
      if (m === "sin_usuario_admin_tenant") {
        await reply(phone, "No hay un usuario administrador asignado al servicio. Avisá a la cooperativa/municipio.");
      } else {
        await reply(phone, "No pudimos registrar el pedido. Intentá de nuevo o llamá a la oficina.");
      }
    }
    return;
  }
}
