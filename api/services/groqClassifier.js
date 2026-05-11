import { TIPOS_RECLAMO_POR_RUBRO, normalizarRubroCliente } from "./tiposReclamo.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

function buildSystemPrompt(tiposValidos) {
  return [
    "Eres un clasificador de reclamos vecinales para una empresa de servicios públicos en Argentina.",
    "Se te proporcionará el texto libre de un reclamo enviado por un vecino.",
    "Tu tarea es devolver un JSON con exactamente estas claves:",
    '  tipo: el tipo de reclamo más probable de la siguiente lista:',
    `    ${JSON.stringify(tiposValidos)}`,
    '  direccion: solo el nombre de la calle (sin número), o null si no se menciona.',
    '  numero_puerta: el número de puerta/altura mencionado (ej: "769", "500"), o "" si no hay.',
    '  prioridad: "Alta", "Media" o "Baja" según la urgencia percibida del reclamo.',
    '  resumen: una frase corta (máximo 60 caracteres) que resuma el problema.',
    '  nombre_vecino: nombre del reclamante si se menciona (ej: "Carlos Franco"), o "" si no hay.',
    '  localidad: nombre propio de la ciudad/localidad mencionada, limpio de prefijos institucionales, o "" si no se menciona.',
    "",
    "Reglas:",
    '- Si no podés determinar el tipo con confianza, usá "Otros".',
    '- Si no hay dirección explícita, devolvé direccion: null.',
    '- numero_puerta: extraer de "Urquiza 769" → "769", "San Martín al 500" → "500". Si no hay, "".',
    '- nombre_vecino: extraer de "vecino Carlos Franco", "el señor Juan Pérez", "de parte de José". Si no hay, "".',
    '- localidad: SIEMPRE quitar prefijos como "Municipio de", "Cooperativa de Agua de", "Cooperativa Eléctrica de". Ej: "Municipio de María Grande" → "María Grande".',
    '- Si no podés evaluar la urgencia, usá prioridad "Media".',
    "- Respondé SOLO con el JSON, sin texto adicional, sin markdown.",
  ].join("\n");
}

function parseGroqResponse(text) {
  const trimmed = String(text || "").trim();
  const cleaned = trimmed.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const obj = JSON.parse(cleaned);
    return {
      tipo: String(obj.tipo || "Otros"),
      direccion: obj.direccion != null ? String(obj.direccion).trim() || null : null,
      numero_puerta: String(obj.numero_puerta || "").trim(),
      prioridad: ["Alta", "Media", "Baja"].includes(obj.prioridad) ? obj.prioridad : "Media",
      resumen: String(obj.resumen || "").slice(0, 120) || null,
      nombre_vecino: String(obj.nombre_vecino || "").trim(),
      localidad: limpiarNombreLocalidad(String(obj.localidad || "").trim()),
    };
  } catch {
    return { tipo: "Otros", direccion: null, numero_puerta: "", prioridad: "Media", resumen: null, nombre_vecino: "", localidad: "" };
  }
}

function limpiarNombreLocalidad(raw) {
  if (!raw) return "";
  return raw
    .replace(/^(municipio|cooperativa)\s+(de\s+agua\s+de|eléctrica\s+de|electrica\s+de|de)\s+/i, "")
    .trim();
}

/**
 * Clasifica un texto de reclamo usando Groq Cloud API.
 * @param {{ texto: string, tipoNegocio: string }} opts
 * @returns {Promise<{ ok: boolean, clasificacion?: object, error?: string }>}
 */
export async function clasificarReclamoConGroq({ texto, tipoNegocio }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, error: "GROQ_API_KEY no configurada en el servidor" };
  }
  const textoTrim = String(texto || "").trim();
  if (!textoTrim) {
    return { ok: false, error: "Texto del reclamo vacío" };
  }
  const rubro = normalizarRubroCliente(tipoNegocio);
  const tiposValidos = rubro && TIPOS_RECLAMO_POR_RUBRO[rubro]
    ? TIPOS_RECLAMO_POR_RUBRO[rubro]
    : [...new Set(Object.values(TIPOS_RECLAMO_POR_RUBRO).flat())];

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(tiposValidos) },
      { role: "user", content: textoTrim },
    ],
    temperature: 0,
    max_tokens: 200,
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
      console.error("[groq-classifier] HTTP", resp.status, detail.slice(0, 300));
      return { ok: false, error: `Groq API respondió ${resp.status}` };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const clasificacion = parseGroqResponse(content);
    if (!tiposValidos.includes(clasificacion.tipo)) {
      clasificacion.tipo = "Otros";
    }
    return { ok: true, clasificacion };
  } catch (err) {
    console.error("[groq-classifier] fetch error:", err?.message || err);
    return { ok: false, error: "Error de red al contactar Groq" };
  }
}
