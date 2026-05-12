/**
 * Genera mensajes de aviso masivo con IA (Groq / Llama 3.3).
 * made by leavera77
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

function buildBroadcastSystemPrompt(tipoNegocio) {
  const tipoLabel =
    tipoNegocio === "municipio"
      ? "un Municipio"
      : tipoNegocio === "cooperativa_agua"
        ? "una Cooperativa de Agua"
        : tipoNegocio === "cooperativa_electrica"
          ? "una Cooperativa Eléctrica"
          : "una empresa de servicios públicos";

  return [
    `Eres un redactor de comunicados oficiales para ${tipoLabel} en Argentina.`,
    "Se te proporcionará un título breve de un aviso que la entidad desea comunicar a los vecinos/socios por WhatsApp.",
    "Tu tarea es generar un mensaje de WhatsApp claro, conciso y formal pero amigable.",
    "",
    "Reglas:",
    "- Máximo 500 caracteres.",
    "- No uses markdown, HTML ni emojis excesivos. Uno o dos emojis relevantes al inicio están bien.",
    "- Incluí un saludo breve, el cuerpo del aviso y un cierre con disculpas por las molestias si aplica.",
    "- No inventes datos específicos (fechas, horarios, direcciones) que no estén en el título.",
    "- Si el título sugiere una emergencia, incluí recomendaciones de seguridad básicas.",
    "- Terminá con una línea que diga algo como: 'Ante consultas comunicarse al {telefono}'.",
    "- Dejá la palabra {telefono} literal para que el sistema la reemplace.",
    "",
    "Devolvé SOLO el texto del mensaje, sin comillas ni explicación adicional.",
  ].join("\n");
}

/**
 * @param {{ titulo: string, tipo_negocio?: string }} opts
 * @returns {Promise<{ ok: boolean, mensaje?: string, error?: string }>}
 */
export async function generarMensajeBroadcast({ titulo, tipo_negocio }) {
  const key = getApiKey();
  if (!key) return { ok: false, error: "GROQ_API_KEY no configurada" };
  if (!titulo || !titulo.trim()) return { ok: false, error: "Título vacío" };

  const systemPrompt = buildBroadcastSystemPrompt(tipo_negocio || "municipio");

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Título del aviso: "${titulo.trim()}"` },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      return { ok: false, error: `Groq HTTP ${resp.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const mensaje = raw.trim().replace(/^["']|["']$/g, "");

    if (!mensaje) return { ok: false, error: "La IA no generó un mensaje" };
    return { ok: true, mensaje };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
