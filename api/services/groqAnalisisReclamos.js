const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

const SYSTEM_PROMPT = [
  "Eres un analista de datos de servicios públicos en Argentina.",
  "Se te dará un resumen numérico con las métricas reales de reclamos de un período.",
  "Tu tarea es generar recomendaciones accionables en español (máximo 3 párrafos cortos).",
  "Sé concreto: mencioná barrios, tipos de reclamo y vecinos si los datos lo permiten.",
  "No inventes datos: basate solo en lo que recibís.",
  "Terminá con una prioridad sugerida de acción (qué atender primero).",
].join("\n");

/**
 * Envía un resumen de métricas a Groq y recibe recomendaciones en lenguaje natural.
 * Si GROQ_API_KEY está vacía, devuelve ok:true sin recomendación.
 * @param {{ resumen: object }} opts
 * @returns {Promise<{ ok: boolean, recomendacion_ia?: string, error?: string }>}
 */
export async function analizarReclamosConGroq({ resumen }) {
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
    temperature: 0.3,
    max_tokens: 600,
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
      console.error("[groq-analisis-reclamos] HTTP", resp.status, detail.slice(0, 300));
      return { ok: true, recomendacion_ia: null };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return { ok: true, recomendacion_ia: content.trim() || null };
  } catch (err) {
    console.error("[groq-analisis-reclamos] fetch error:", err?.message || err);
    return { ok: true, recomendacion_ia: null };
  }
}
