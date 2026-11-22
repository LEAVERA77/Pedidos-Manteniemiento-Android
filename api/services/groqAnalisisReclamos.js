import { callLlmChatCompletions, hasLlmConfigured } from "./llmClient.js";

const SYSTEM_PROMPT_BASE = [
  "Eres un analista de datos de servicios públicos en Argentina.",
  "Se te dará un resumen numérico con las métricas reales de reclamos de un período.",
  "Tu tarea es generar recomendaciones accionables en español (máximo 3 párrafos cortos).",
  "Sé concreto: mencioná tipos de reclamo y las entidades que figuren en los datos (nombres en top_vecinos, valores en top_barrios según el rubro, repetidos).",
  "No inventes datos: basate solo en lo que recibís.",
  "Terminá con una prioridad sugerida de acción (qué atender primero).",
].join("\n");

const COOP_ELECTRICA_EXTRA = [
  "Rubro cooperativa eléctrica (tipo_negocio cooperativa_electrica): top_barrios lista DISTRIBUIDORES / zonas de red eléctrica, no barrios urbanos.",
  "Los nombres en top_vecinos suelen ser socios o titulares del suministro; hablá de socios/usuarios, no de 'vecinos' salvo que el dato lo sugiera.",
  "Priorizá acciones por distribuidor (zona de red) y por tipo de trabajo recurrente.",
].join("\n");

function buildSystemPrompt(resumen) {
  const tipo = String(resumen?.tipo_negocio || "").trim();
  if (tipo === "cooperativa_electrica") {
    return `${SYSTEM_PROMPT_BASE}\n\n${COOP_ELECTRICA_EXTRA}`;
  }
  return SYSTEM_PROMPT_BASE;
}

/**
 * Envía un resumen de métricas a Groq y recibe recomendaciones en lenguaje natural.
 * Si GROQ_API_KEY está vacía, devuelve ok:true sin recomendación.
 * @param {{ resumen: object }} opts
 * @returns {Promise<{ ok: boolean, recomendacion_ia?: string, error?: string }>}
 */
export async function analizarReclamosConGroq({ resumen }) {
  if (!hasLlmConfigured()) {
    return { ok: true, recomendacion_ia: null };
  }

  const llm = await callLlmChatCompletions({
    tag: "ia-analisis-reclamos",
    messages: [
      { role: "system", content: buildSystemPrompt(resumen) },
      { role: "user", content: JSON.stringify(resumen) },
    ],
    temperature: 0.3,
    max_tokens: 600,
  });
  if (!llm.ok) {
    return { ok: true, recomendacion_ia: null };
  }
  return { ok: true, recomendacion_ia: (llm.content || "").trim() || null };
}
