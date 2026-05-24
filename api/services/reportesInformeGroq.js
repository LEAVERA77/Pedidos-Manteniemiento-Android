/**
 * Análisis breve para informes por email (Groq).
 * made by leavera77
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

/**
 * @param {{ stats: object, frecuencia: string, nombreEmpresa?: string }} opts
 * @returns {Promise<string|null>}
 */
export async function analisisBreveInformeEmail({ stats, frecuencia, nombreEmpresa }) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) return null;

  const etiqueta =
    frecuencia === "semanal"
      ? "semanal (últimos 7 días)"
      : frecuencia === "mensual"
        ? "mensual (último mes)"
        : "diario (últimas 24 horas)";

  const prompt = [
    `Redactá un análisis operativo breve en español (Argentina) para un email de informe ${etiqueta}.`,
    `Empresa: ${nombreEmpresa || "GestorNova"}.`,
    `Datos: total=${stats.total}, pendientes=${stats.pendientes}, en ejecución=${stats.en_ejecucion}, cerrados=${stats.cerrados}.`,
    "Máximo 4 oraciones, tono profesional, sin markdown, sin saludo ni despedida.",
    "Incluí una observación y una recomendación concreta según los números.",
  ].join(" ");

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "Sos analista de operaciones de servicios públicos. Respondé solo con el párrafo solicitado, en español claro.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.35,
        max_tokens: 280,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const txt = String(data?.choices?.[0]?.message?.content || "").trim();
    return txt || null;
  } catch {
    return null;
  }
}
