import { callLlmChatCompletions, hasLlmConfigured } from "./llmClient.js";

const SYSTEM_PROMPT = [
  "Eres asistente de planificación de ruta para un técnico de servicios en Argentina.",
  "Recibís solo un JSON con pedidos YA ASIGNADOS a ese técnico (estados Asignado o En ejecución).",
  "No uses ni inventes pedidos pendientes sin asignar.",
  "Si hay posición GPS del técnico y coordenadas de pedidos, interpretá distancias aproximadas en km (línea recta WGS84, no ruta de calle).",
  "Si hay puntaje_urgencia (misma escala que el panel) y km_desde_gps, usalos para ordenar sugerencias.",
  "Priorizá: urgencia por prioridad declarada, tiempo abierto, criticidad del tipo, proximidad entre pedidos.",
  "Respondé en español, máximo 3 párrafos cortos, accionables (orden sugerido de visita, alertas).",
  "No inventes datos que no figuren en el JSON.",
].join("\n");

/**
 * @param {{ resumen: object }} opts
 * @returns {Promise<{ ok: boolean, recomendacion_ia?: string | null, error?: string }>}
 */
export async function analizarAsignadosTecnicoConGroq({ resumen }) {
  if (!hasLlmConfigured()) {
    return { ok: true, recomendacion_ia: null };
  }

  const llm = await callLlmChatCompletions({
    tag: "ia-analisis-tecnico-asignados",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(resumen) },
    ],
    temperature: 0.25,
    max_tokens: 650,
  });
  if (!llm.ok) {
    return { ok: true, recomendacion_ia: null };
  }
  return { ok: true, recomendacion_ia: (llm.content || "").trim() || null };
}
