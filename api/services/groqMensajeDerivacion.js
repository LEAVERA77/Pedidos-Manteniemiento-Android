/**
 * Genera un mensaje profesional de derivación a terceros usando Groq LLM.
 * made by leavera77
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

function buildSystemPrompt(destinatario) {
  return `Eres un asistente que redacta mensajes formales y profesionales para derivar reclamos municipales a entidades externas en Argentina.

El mensaje se enviará por WhatsApp al ${destinatario}. Debe ser:
- Claro, conciso y profesional
- Incluir emojis informativos (📍📋📝⚠️) para estructurar visualmente
- Dirigido respetuosamente al destinatario
- Incluir todos los datos relevantes del reclamo
- Terminar con un saludo cordial

Formato esperado (adaptar según el tipo de destinatario):
- Para Policía: tono más urgente, mencionar "incidente" o "situación"
- Para Cooperativas de servicio: tono formal, mencionar "reclamo" o "reporte"

Responde SOLO con el texto del mensaje, sin explicaciones adicionales ni markdown.`;
}

export async function generarMensajeDerivacionConGroq({ destinatario, tipo_reclamo, direccion, barrio, descripcion, prioridad, telefono_contacto, nombre_tenant }) {
  const key = getApiKey();
  if (!key) throw new Error("GROQ_API_KEY no configurada");

  const partes = [];
  if (tipo_reclamo) partes.push(`Tipo de reclamo: ${tipo_reclamo}`);
  if (direccion) partes.push(`Dirección: ${direccion}`);
  if (barrio) partes.push(`Barrio/Zona: ${barrio}`);
  if (descripcion) partes.push(`Descripción del reclamo: ${descripcion}`);
  if (prioridad) partes.push(`Prioridad: ${prioridad}`);
  if (telefono_contacto) partes.push(`Teléfono de contacto del municipio/ente: ${telefono_contacto}`);
  if (nombre_tenant) partes.push(`Entidad que deriva: ${nombre_tenant}`);

  const userMsg = `Generá un mensaje de derivación para: ${destinatario}

Datos del reclamo:
${partes.join("\n")}

El mensaje debe estar listo para enviar por WhatsApp. No uses markdown ni formato de código.`;

  const resp = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(destinatario) },
        { role: "user", content: userMsg },
      ],
      temperature: 0.6,
      max_tokens: 600,
    }),
  });

  if (!resp.ok) {
    const e = await resp.text().catch(() => "");
    throw new Error(`Groq HTTP ${resp.status}: ${e.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq devolvió respuesta vacía");
  return text;
}
