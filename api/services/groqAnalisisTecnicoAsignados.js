const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

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
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: true, recomendacion_ia: null };
  }

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(resumen) },
    ],
    temperature: 0.25,
    max_tokens: 650,
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
      console.error("[groq-analisis-tecnico-asignados] HTTP", resp.status, detail.slice(0, 300));
      return { ok: true, recomendacion_ia: null };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return { ok: true, recomendacion_ia: content.trim() || null };
  } catch (err) {
    console.error("[groq-analisis-tecnico-asignados] fetch error:", err?.message || err);
    return { ok: true, recomendacion_ia: null };
  }
}
