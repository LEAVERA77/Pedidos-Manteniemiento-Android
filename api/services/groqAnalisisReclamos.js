const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

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
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: true, recomendacion_ia: null };
  }

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(resumen) },
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
