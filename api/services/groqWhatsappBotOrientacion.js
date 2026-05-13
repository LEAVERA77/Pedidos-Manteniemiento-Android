/**
 * Respuestas conversacionales del bot WhatsApp (orientación al vecino).
 * made by leavera77
 */

import { normalizarRubroCliente } from "./tiposReclamo.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

function etiquetaRubro(tipoCliente) {
  const r = normalizarRubroCliente(tipoCliente);
  if (r === "municipio") return "municipio / reclamos vecinales (alumbrado, baches, tránsito, etc.)";
  if (r === "cooperativa_agua") return "cooperativa de agua o saneamiento";
  if (r === "cooperativa_electrica") return "cooperativa eléctrica";
  return "servicio público o cooperativa";
}

function limpiarSalidaModelo(s) {
  let t = String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u200b\ufeff\u200c\u200d]/g, "")
    .trim();
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[!?]{2,}/g, (m) => m[0]);
  t = t.replace(/([!?])\1+/g, "$1");
  return t.slice(0, 3500);
}

/**
 * @param {{ texto: string, nombreEntidad?: string, tipoCliente?: string|null, tiposReclamoResumen?: string }} opts
 * @returns {Promise<{ ok: boolean, mensaje?: string, error?: string }>}
 */
export async function generarRespuestaOrientacionWhatsappGroq(opts) {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "GROQ_API_KEY no configurada" };
  const texto = String(opts?.texto || "").trim();
  if (texto.length < 2) return { ok: false, error: "vacío" };

  const ent = String(opts?.nombreEntidad || "la entidad").trim() || "la entidad";
  const rubro = etiquetaRubro(opts?.tipoCliente);
  const tipos = String(opts?.tiposReclamoResumen || "").trim().slice(0, 2800);

  const system = [
    "Sos el asistente virtual de WhatsApp de un servicio público o cooperativa en Argentina.",
    "El vecino escribió algo que no encaja en un menú fijo: puede estar confundido, con errores de tipeo o haciendo preguntas generales.",
    "Tu tarea: responder en español rioplatense, tono cordial y breve (máximo unas 8 líneas cortas).",
    "Indicá de forma concreta:",
    "- Cómo iniciar un reclamo nuevo (elegir el número del 1 al N según el tipo, o pedir *menú* para ver la lista).",
    "- Que puede usar *0* o la opción «Mis reclamos» para consultar reclamos vigentes con su dato de cuenta cuando corresponda.",
    "- Que puede escribir *menú* en cualquier momento para volver al inicio.",
    "Contexto del negocio: " + rubro + ". Nombre visible: " + ent + ".",
    tipos ? "Tipos de reclamo disponibles (referencia, no repitas la lista entera salvo que ayude):\n" + tipos : "",
    "Reglas estrictas:",
    "- No inventes números de teléfono ni horarios que no estén en el mensaje del usuario.",
    "- No uses signos de exclamación ni de interrogación repetidos ni al final de cada frase.",
    "- No uses emojis salvo uno opcional al inicio o al cierre.",
    "- No uses markdown con asteriscos dobles; podés usar *palabra* solo si hace falta para énfasis mínimo.",
    "- Si no entendés el mensaje, invitá a reformular o a escribir *menú*.",
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: texto.slice(0, 900) },
    ],
    temperature: 0.35,
    max_tokens: 420,
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
      console.error("[groq-wa-orientacion] HTTP", resp.status, detail.slice(0, 200));
      return { ok: false, error: `Groq ${resp.status}` };
    }
    const data = await resp.json();
    const content = limpiarSalidaModelo(data?.choices?.[0]?.message?.content || "");
    if (!content) return { ok: false, error: "vacío modelo" };
    return { ok: true, mensaje: content };
  } catch (e) {
    console.error("[groq-wa-orientacion]", e?.message || e);
    return { ok: false, error: "red" };
  }
}
