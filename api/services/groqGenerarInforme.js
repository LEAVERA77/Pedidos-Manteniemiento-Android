const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

const SYSTEM_PROMPT_BASE = [
  "Eres un analista senior de gestión de servicios públicos en Argentina.",
  "Se te dará un JSON con datos reales: analisis con top_vecinos, top_barrios (valores del campo distribuidor del reclamo; su significado depende del rubro en metricas.tipo_negocio), top_tipos, repetidos; métricas operativas; snapshots históricos de KPIs si existen; y satisfacción vía WhatsApp (estrellas 1-5, porcentaje, tendencia).",
  "Tu tarea es devolver un JSON válido (sin markdown, sin texto extra) con esta estructura exacta:",
  "{",
  '  "seccion_kpis": [',
  '    { "nombre": "Nombre legible", "valor": 72.5, "unidad": "porcentaje|horas|cantidad|indice", "explicacion": "Qué significa este valor en 1 oración", "tendencia": "mejora|estable|empeora", "recomendacion": "Acción concreta sugerida en 1 oración" }',
  "  ],",
  '  "recomendacion_reclamos": "2-3 oraciones accionables sobre los reclamos, citando tipos y las entidades que figuren en el JSON (clientes, distribuidor/zona o barrio según rubro)",',
  '  "satisfaccion_ia": {',
  '    "explicacion": "1-2 oraciones explicando el nivel de satisfacción actual según porcentaje y estrellas",',
  '    "recomendacion": "1-2 oraciones con acciones concretas si la satisfacción es baja o media, o refuerzo positivo si es alta",',
  '    "alerta": false',
  "  },",
  '  "resumen_ejecutivo": "1 párrafo breve (3-5 oraciones) resumiendo el estado general de la gestión con prioridades, incluyendo satisfacción del usuario"',
  "}",
  "Reglas:",
  "- seccion_kpis debe tener entre 4 y 8 items basados en las métricas reales recibidas.",
  "- tendencia se basa en comparación con snapshots históricos si existen; si no hay historia, usá 'estable'.",
  "- satisfaccion_ia: si porcentaje > 80 → alerta false, mensaje positivo. Si 50-80 → alerta false, sugerir mejoras. Si < 50 → alerta true, urgente revisar. Si no hay datos de satisfacción (promedio_estrellas null o cantidad 0), devolvé explicacion indicando que no hay valoraciones en el período y recomendacion sugiriendo incentivar a calificar al usuario atendido, con alerta false.",
  "- No inventes datos: basate solo en lo que recibís.",
  "- Respondé SOLO con el JSON, sin texto antes ni después.",
].join("\n");

const COOP_ELECTRICA_INFORME_APPEND = [
  "Rubro cooperativa eléctrica (metricas.tipo_negocio = cooperativa_electrica): top_barrios son DISTRIBUIDORES / zonas de red eléctrica (alineados al código Dist. del catálogo de socios cuando se usa en operación), no barrios urbanos.",
  "En recomendacion_reclamos, resumen_ejecutivo y satisfaccion_ia usá 'socio' o 'usuario del suministro' en lugar de 'vecino' salvo cita literal de datos.",
  "Podés mencionar que las métricas de confiabilidad tipo SAIFI/SAIDI en el panel del tenant suelen estimarse a partir de reclamos de red y denominadores de catálogo/Red Eléctrica solo como contexto cualitativo, sin inventar cifras que no estén en el JSON.",
].join("\n");

function buildSystemPromptInforme(datos) {
  const tipo = String(datos?.metricas?.tipo_negocio || "").trim();
  if (tipo === "cooperativa_electrica") {
    return `${SYSTEM_PROMPT_BASE}\n\n${COOP_ELECTRICA_INFORME_APPEND}`;
  }
  return SYSTEM_PROMPT_BASE;
}

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
      { role: "system", content: buildSystemPromptInforme(datos) },
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
