const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

const SYSTEM_PROMPT = [
  "Eres un analista senior de gestión de servicios públicos en Argentina.",
  "Se te dará un JSON con datos reales de reclamos (top vecinos, barrios, tipos, repetidos), métricas operativas (totales, cierres, tiempos, SLA), snapshots históricos de KPIs si existen, y datos de satisfacción del vecino vía WhatsApp (estrellas 1-5, porcentaje, tendencia).",
  "Tu tarea es devolver un JSON válido (sin markdown, sin texto extra) con esta estructura exacta:",
  '{',
  '  "seccion_kpis": [',
  '    { "nombre": "Nombre legible", "valor": 72.5, "unidad": "porcentaje|horas|cantidad|indice", "explicacion": "Qué significa este valor en 1 oración", "tendencia": "mejora|estable|empeora", "recomendacion": "Acción concreta sugerida en 1 oración" }',
  '  ],',
  '  "recomendacion_reclamos": "2-3 oraciones accionables sobre los reclamos, mencionando barrios/vecinos/tipos concretos si los datos lo permiten",',
  '  "satisfaccion_ia": {',
  '    "explicacion": "1-2 oraciones explicando el nivel de satisfacción actual del vecino basándose en el porcentaje y las estrellas recibidas",',
  '    "recomendacion": "1-2 oraciones con acciones concretas si la satisfacción es baja o media, o refuerzo positivo si es alta",',
  '    "alerta": false',
  '  },',
  '  "resumen_ejecutivo": "1 párrafo breve (3-5 oraciones) resumiendo el estado general de la gestión con prioridades, incluyendo satisfacción del vecino"',
  '}',
  "Reglas:",
  "- seccion_kpis debe tener entre 4 y 8 items basados en las métricas reales recibidas.",
  "- tendencia se basa en comparación con snapshots históricos si existen; si no hay historia, usá 'estable'.",
  "- satisfaccion_ia: si porcentaje > 80 → alerta false, mensaje positivo. Si 50-80 → alerta false, sugerir mejoras. Si < 50 → alerta true, urgente revisar. Si no hay datos de satisfacción (promedio_estrellas null o cantidad 0), devolvé explicacion indicando que no hay valoraciones en el período y recomendacion sugiriendo incentivar a los vecinos a calificar, con alerta false.",
  "- No inventes datos: basate solo en lo que recibís.",
  "- Respondé SOLO con el JSON, sin texto antes ni después.",
].join("\n");

/**
 * @param {{ datos: object }} opts - dataset unificado (reclamos + metricas + snapshots)
 * @returns {Promise<{ ok: boolean, informe_ia?: object, error?: string }>}
 */
export async function generarInformeConGroq({ datos }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: true, informe_ia: null };
  }

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(datos) },
    ],
    temperature: 0.3,
    max_tokens: 1800,
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
      console.error("[groq-generar-informe] HTTP", resp.status, detail.slice(0, 300));
      return { ok: true, informe_ia: null };
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const cleaned = raw.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj === "object") return { ok: true, informe_ia: obj };
    } catch { /* parse failed */ }
    return { ok: true, informe_ia: null };
  } catch (err) {
    console.error("[groq-generar-informe] fetch error:", err?.message || err);
    return { ok: true, informe_ia: null };
  }
}
