const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

const SYSTEM_PROMPT = [
  "Eres un analista senior de gestión de servicios públicos en Argentina.",
  "Se te dará un JSON array con KPIs guardados (metrica, valor_numero, unidad, periodo_inicio, periodo_fin).",
  "Tu tarea es devolver un JSON object donde cada clave es el nombre exacto de la métrica recibida y el valor es un objeto con:",
  '{ "explicacion": "1-2 oraciones: qué mide este indicador y qué significa el valor actual para la gestión", "recomendacion": "1 oración: acción concreta sugerida" }',
  "Reglas:",
  "- Usá las claves exactas de 'metrica' que recibiste como keys del objeto de respuesta.",
  "- Si el valor es un porcentaje > 85%, destacalo positivamente. Si < 50%, señalá que requiere atención.",
  "- Si es tiempo (horas), < 24h es bueno, > 48h requiere atención.",
  "- Adaptá el lenguaje al tipo de negocio recibido (municipio, cooperativa eléctrica, cooperativa de agua).",
  "- Escribí explicacion y recomendacion en prosa normal: sin espacios entre cada letra, sin listas con un carácter por línea, sin signos de exclamación repetidos.",
  "- No inventes datos; basate solo en lo que recibís.",
  "- Respondé SOLO con el JSON, sin texto antes ni después, sin markdown.",
].join("\n");

/**
 * @param {{ kpis: Array, tipo_negocio: string }} opts
 * @returns {Promise<{ ok: boolean, explicaciones?: object, error?: string }>}
 */
export async function explicarKpisConGroq({ kpis, tipo_negocio }) {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: true, explicaciones: null };
  if (!kpis || !kpis.length) return { ok: true, explicaciones: {} };

  const payload = { tipo_negocio, kpis };

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.25,
    max_tokens: 1200,
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
      console.error("[groq-explicar-kpis] HTTP", resp.status, detail.slice(0, 300));
      return { ok: true, explicaciones: null };
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const cleaned = raw.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return { ok: true, explicaciones: obj };
    } catch { /* parse failed */ }
    return { ok: true, explicaciones: null };
  } catch (err) {
    console.error("[groq-explicar-kpis] fetch error:", err?.message || err);
    return { ok: true, explicaciones: null };
  }
}
