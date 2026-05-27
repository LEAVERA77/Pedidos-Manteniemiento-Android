/**
 * Groq: interpretar consulta libre de búsqueda global de pedidos.
 * made by leavera77
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

function parseJsonGroq(text) {
  const trimmed = String(text || "").trim();
  const cleaned = trimmed.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * @param {string} q
 * @returns {Promise<{ ok: boolean, terminos?: string[], telefono?: string, nis?: string, hint?: string, error?: string }>}
 */
export async function interpretarBusquedaPedidosGroq(q) {
  const apiKey = getApiKey();
  const texto = String(q || "").trim().slice(0, 120);
  if (!apiKey || texto.length < 3) {
    return { ok: false, error: "GROQ no disponible" };
  }

  const body = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: [
          "Sos un asistente de búsqueda de reclamos/pedidos en Argentina.",
          "El usuario escribe una consulta corta (nombre, dirección, NIS, medidor, teléfono, número).",
          'Respondé SOLO JSON: {"terminos":["..."],"telefono":"","nis":"","medidor":"","hint":"frase corta opcional"}',
          "terminos: 1-5 palabras clave normalizadas (sin tildes), sin artículos.",
          "Si detectás teléfono o NIS, ponelos en sus campos y también en terminos si aplica.",
          "No inventes datos que no estén en la consulta.",
        ].join("\n"),
      },
      { role: "user", content: texto },
    ],
    temperature: 0.15,
    max_tokens: 180,
  };

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4500),
    });
    if (!resp.ok) {
      return { ok: false, error: "Groq HTTP " + resp.status };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const obj = parseJsonGroq(content);
    if (!obj || typeof obj !== "object") {
      return { ok: false, error: "parse" };
    }
    const terminos = Array.isArray(obj.terminos)
      ? obj.terminos.map((t) => String(t || "").trim()).filter((t) => t.length >= 2).slice(0, 6)
      : [];
    return {
      ok: true,
      terminos,
      telefono: String(obj.telefono || "").trim(),
      nis: String(obj.nis || "").trim(),
      medidor: String(obj.medidor || "").trim(),
      hint: String(obj.hint || "").trim().slice(0, 120) || null,
    };
  } catch (err) {
    return { ok: false, error: err?.message || "fetch" };
  }
}
