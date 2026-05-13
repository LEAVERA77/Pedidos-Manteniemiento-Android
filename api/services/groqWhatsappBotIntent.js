/**
 * Clasificación de intención del vecino en el bot WhatsApp (texto libre, idle).
 * made by leavera77
 */

import { normalizarRubroCliente } from "./tiposReclamo.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const INTENCIONES = [
  "identificador_cuenta_mis_pedidos",
  "estado_seguimiento_whatsapp",
  "orientacion_chat",
  "menu_cargar_reclamo",
];

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

function descripcionRubroParaPrompt(tipoCliente) {
  const r = normalizarRubroCliente(tipoCliente);
  if (r === "municipio") {
    return "Rubro: municipio u organismo local. Para consultar reclamos por padrón suele usarse ID vecino o dato del catálogo municipal.";
  }
  if (r === "cooperativa_agua") {
    return "Rubro: cooperativa de agua o saneamiento. Suele usarse número de socio o medidor.";
  }
  if (r === "cooperativa_electrica") {
    return "Rubro: cooperativa eléctrica. Suele usarse NIS o número de medidor.";
  }
  return "Rubro: servicio público o cooperativa (genérico). Los datos de cuenta pueden variar según la entidad.";
}

function buildSystemPrompt() {
  return [
    "Sos un clasificador de intenciones para un bot de WhatsApp de reclamos en Argentina.",
    "Recibirás un mensaje breve del ciudadano y el contexto del tipo de entidad.",
    "",
    "Debés responder SOLO un JSON con una clave:",
    `  "intencion": una de estas cuatro cadenas EXACTAS (sin comillas extra, sin markdown):`,
    `  "${INTENCIONES[0]}"`,
    `  "${INTENCIONES[1]}"`,
    `  "${INTENCIONES[2]}"`,
    `  "${INTENCIONES[3]}"`,
    "",
    "Significado:",
    `- "${INTENCIONES[0]}": quiere ver sus reclamos vigentes (no cerrados) y está alineado a consultar con dato de cuenta del padrón (NIS, medidor, ID vecino, número de socio, etc.) o pide explícitamente listado "mis reclamos" vinculado a ese tipo de dato.`,
    `- "${INTENCIONES[1]}": pregunta por estado, avance, cómo va, qué pasó, seguimiento, reclamos pendientes o abiertos en sentido general, sin dejar listo un identificador de cuenta; también frases tipo "mis reclamos", "mis pedidos", "qué tengo pendiente" si suena a seguimiento general (el sistema puede responder con lo asociado al mismo número de WhatsApp).`,
    `- "${INTENCIONES[2]}": hace preguntas de uso (cómo cargo, no entiendo el menú, qué número elijo, escribió con errores pero pide ayuda), saludo con duda, consulta general que no sea seguimiento de un pedido ni dato de cuenta.`,
    `- "${INTENCIONES[3]}": quiere explícitamente iniciar un reclamo nuevo (elige tipo, dice "quiero reclamar", "nuevo reclamo", tema irrelevante sin pedir ayuda ni seguimiento) o texto tan corto/vago que lo más seguro es mostrarle el menú de tipos.`,
    "",
    "Reglas:",
    "- Si hay duda entre las dos primeras y el mensaje es muy genérico tipo solo 'mis reclamos' o 'mis pedidos', preferí estado_seguimiento_whatsapp.",
    "- Si menciona NIS, medidor, ID vecino, número de socio o similar para consultar, preferí identificador_cuenta_mis_pedidos.",
    "- Si pide ayuda para usar el bot o no sabe cómo seguir, preferí orientacion_chat antes que menu_cargar_reclamo.",
    "- Nunca inventes otra intención: solo las cuatro cadenas permitidas.",
    "- Respondé SOLO el JSON, sin texto adicional.",
  ].join("\n");
}

function parseIntencion(text) {
  const trimmed = String(text || "").trim();
  const cleaned = trimmed.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const obj = JSON.parse(cleaned);
    const i = String(obj.intencion || "").trim();
    if (INTENCIONES.includes(i)) return i;
  } catch (_) {}
  return null;
}

/**
 * @param {{ texto: string, tipoCliente?: string|null, nombreEntidad?: string }} opts
 * @returns {Promise<{ ok: boolean, intencion?: string, error?: string }>}
 */
export async function inferirIntencionBotWhatsappGroq(opts) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, error: "GROQ_API_KEY no configurada" };
  }
  const texto = String(opts?.texto || "").trim();
  if (texto.length < 2) {
    return { ok: false, error: "texto vacío" };
  }
  const rubroTxt = descripcionRubroParaPrompt(opts?.tipoCliente);
  const nom = String(opts?.nombreEntidad || "").trim();
  const userBlock = [
    rubroTxt,
    nom ? `Nombre visible de la entidad: ${nom}.` : "",
    "",
    "Mensaje del ciudadano:",
    texto.slice(0, 800),
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userBlock },
    ],
    temperature: 0,
    max_tokens: 100,
  };

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("[groq-wa-intent] HTTP", resp.status, detail.slice(0, 200));
      return { ok: false, error: `Groq ${resp.status}` };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const intencion = parseIntencion(content);
    if (!intencion) {
      console.warn("[groq-wa-intent] parse falló", content.slice(0, 120));
      return { ok: false, error: "parse" };
    }
    return { ok: true, intencion };
  } catch (e) {
    console.error("[groq-wa-intent]", e?.message || e);
    return { ok: false, error: "red" };
  }
}
