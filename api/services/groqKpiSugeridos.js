const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

const SYSTEM_PROMPT = [
  "Eres un asesor de gestión de servicios públicos en Argentina.",
  "Se te dará un JSON con métricas reales calculadas para un período determinado.",
  "Tu tarea es devolver un JSON válido (sin markdown, sin texto extra) con esta estructura:",
  '[ { "metrica": "clave_interna", "nombre": "Nombre legible", "valor": 72.5, "unidad": "porcentaje|horas|cantidad|indice", "interpretacion": "Qué significa este valor", "alerta": true/false } ]',
  "Reglas:",
  "- Si el valor indica un problema, poné alerta: true.",
  "- La interpretación debe ser breve (1 oración) y accionable.",
  "- Devolvé entre 3 y 6 KPIs.",
  "- Respondé SOLO con el JSON array, sin texto antes ni después.",
].join("\n");

/**
 * @param {{ metricas: object }} opts
 * @returns {Promise<{ ok: boolean, kpis_ia?: Array, error?: string }>}
 */
export async function sugerirKpisConGroq({ metricas }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: true, kpis_ia: null };
  }

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(metricas) },
    ],
    temperature: 0.2,
    max_tokens: 800,
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
      console.error("[groq-kpi-sugeridos] HTTP", resp.status, detail.slice(0, 300));
      return { ok: true, kpis_ia: null };
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const cleaned = raw.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      const arr = JSON.parse(cleaned);
      if (Array.isArray(arr)) return { ok: true, kpis_ia: arr };
    } catch { /* parse failed */ }
    return { ok: true, kpis_ia: null };
  } catch (err) {
    console.error("[groq-kpi-sugeridos] fetch error:", err?.message || err);
    return { ok: true, kpis_ia: null };
  }
}
