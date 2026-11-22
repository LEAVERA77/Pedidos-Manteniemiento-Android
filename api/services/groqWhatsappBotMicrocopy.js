/**
 * Líneas breves de ayuda (microcopy) para pasos del bot WhatsApp vía Groq.
 * made by leavera77
 */

import { normalizarRubroCliente } from "./tiposReclamo.js";
import { callLlmChatCompletions, hasLlmConfigured } from "./llmClient.js";

const TIMEOUT_MS = 3500;

function etiquetaRubro(tipoCliente) {
  const r = normalizarRubroCliente(tipoCliente);
  if (r === "municipio") return "municipio";
  if (r === "cooperativa_agua") return "cooperativa de agua";
  if (r === "cooperativa_electrica") return "cooperativa eléctrica";
  return "servicio público";
}

function limpiarLinea(s) {
  let t = String(s || "")
    .replace(/\r\n/g, " ")
    .replace(/[\u200b\ufeff]/g, "")
    .trim();
  t = t.replace(/\s+/g, " ");
  t = t.replace(/[!?]{2,}/g, (m) => m[0]);
  if (t.length > 220) t = t.slice(0, 217) + "…";
  return t;
}

const PROMPTS_PASO = {
  pedir_nombre:
    "El vecino debe indicar nombre del titular. Ya le explicamos que puede usar solo el apellido para ver opciones del padrón. Agregá UNA frase corta y amable (máx 25 palabras) que refuerce eso sin repetir literal el mensaje base.",
  pedir_descripcion:
    "El vecino debe describir el reclamo. Agregá UNA frase que lo invite a ser concreto (qué, dónde, cuándo) sin pedir datos que aún no corresponden.",
  pedir_identificador:
    "El vecino puede enviar NIS/medidor/ID o escribir *no* para seguir sin dato. Agregá UNA frase breve que lo tranquilice si no tiene el número.",
  sin_padron:
    "No hubo coincidencia en el padrón con el nombre que escribió. Agregá UNA frase que sugiera probar solo el apellido, sin dar ejemplos inventados de nombres.",
  confundido_identificacion:
    "El vecino no eligió bien entre opciones 1/2/3 del menú de identificación. Agregá UNA frase clara que repita las opciones en lenguaje simple.",
  ubicacion_gps_confirmar:
    "El vecino recibió una dirección inferida desde la ubicación GPS de su celular y debe confirmar si es correcta. Agregá UNA frase breve que lo invite a revisar el pin en el mapa mentalmente (sin inventar direcciones).",
};

/**
 * @param {{ paso: keyof PROMPTS_PASO, tipoCliente?: string|null, nombreEntidad?: string, contexto?: string }} opts
 * @returns {Promise<{ ok: boolean, linea?: string, error?: string }>}
 */
export async function generarLineaMicrocopyWhatsappGroq(opts) {
  if (!hasLlmConfigured()) return { ok: false, error: "GEMINI_API_KEY / GROQ_API_KEY no configurada" };
  const paso = String(opts?.paso || "").trim();
  const instruccion = PROMPTS_PASO[paso];
  if (!instruccion) return { ok: false, error: "paso inválido" };

  const ent = String(opts?.nombreEntidad || "el servicio").trim() || "el servicio";
  const rubro = etiquetaRubro(opts?.tipoCliente);
  const ctx = String(opts?.contexto || "").trim().slice(0, 400);

  const system = [
    "Sos asistente de WhatsApp de un servicio en Argentina.",
    "Respondé SOLO con una línea de texto (sin comillas, sin lista, sin markdown salvo *énfasis* mínimo).",
    "Tono cordial, rioplatense, sin exclamaciones repetidas ni emojis.",
    "Rubro: " + rubro + ". Entidad: " + ent + ".",
    instruccion,
    ctx ? "Contexto adicional: " + ctx : "",
  ]
    .filter(Boolean)
    .join(" ");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const llm = await callLlmChatCompletions({
      tag: "ia-wa-microcopy",
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Generá la línea de ayuda." },
      ],
      temperature: 0.4,
      max_tokens: 90,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!llm.ok) {
      if (llm.aborted) return { ok: false, error: "timeout" };
      return { ok: false, error: llm.status ? `${llm.provider || "IA"} ${llm.status}` : "red" };
    }
    const linea = limpiarLinea(llm.content || "");
    if (!linea) return { ok: false, error: "vacío" };
    return { ok: true, linea };
  } catch (e) {
    clearTimeout(timer);
    if (e?.name === "AbortError") return { ok: false, error: "timeout" };
    console.error("[ia-wa-microcopy]", e?.message || e);
    return { ok: false, error: "red" };
  }
}

/**
 * @param {{ paso: string, tipoCliente?: string|null, nombreEntidad?: string, contexto?: string }} opts
 */
export async function lineaMicrocopyOpcional(opts) {
  try {
    return await generarLineaMicrocopyWhatsappGroq(opts);
  } catch (e) {
    console.warn("[groq-wa-microcopy]", e?.message || e);
    return { ok: false, error: "excepción" };
  }
}
