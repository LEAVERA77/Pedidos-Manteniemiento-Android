/**
 * Infiere el índice (1..N) del tipo de reclamo desde texto libre del vecino (WhatsApp, menú principal).
 * Rubro-agnóstico: la lista de tipos la arma el tenant.
 * made by leavera77
 */

import { normalizarRubroCliente } from "./tiposReclamo.js";
import { callLlmChatCompletions, hasLlmConfigured } from "./llmClient.js";

function rubroContextoPrompt(tipoCliente) {
    const r = normalizarRubroCliente(tipoCliente);
    if (r === "municipio") return "Contexto: municipio / comuna (reclamos urbanos).";
    if (r === "cooperativa_agua") return "Contexto: cooperativa de agua o saneamiento.";
    if (r === "cooperativa_electrica") return "Contexto: cooperativa eléctrica.";
    return "Contexto: entidad de servicios / reclamos al vecino.";
}

function buildSystemPrompt(maxN) {
    return [
        "Sos un clasificador para un bot de WhatsApp de reclamos en Argentina.",
        "Recibirás la lista exacta de tipos de reclamo (número y texto) de UNA entidad y un mensaje del ciudadano.",
        "",
        "Respondé SOLO un JSON (una sola línea, sin markdown) con estas claves:",
        `  "indice": entero entre 1 y ${maxN} que mejor coincida con el problema, o null si no corresponde a ninguno.`,
        '  "confiable": true solo si el mensaje describe con claridad UN problema que encaja en un solo ítem;',
        "            false si es ambiguo, mezcla dos temas distintos, o no alcanza para decidir.",
        '  "intento_descripcion_reclamo": true si el vecino parece estar describiendo un problema concreto',
        "            (rotura, falta de servicio, calle, basura, luz, agua, etc.) para iniciar un reclamo;",
        "            false si es saludo, agradecimiento, consulta de estado («cómo va», «mi pedido»),",
        "            pedido de ayuda con el menú sin describir un problema, spam o texto sin relación.",
        "",
        "Reglas:",
        "- El índice debe ser la fila de la lista (1 = primera). No inventes tipos.",
        "- Si hay duda entre dos tipos, confiable=false. Si no es un relato de problema, intento_descripcion_reclamo=false e indice=null.",
        "- Respondé SOLO el JSON.",
    ].join("\n");
}

/**
 * @param {string} text
 * @param {number} maxN
 * @returns {{ indice: number|null, confiable: boolean, intento_descripcion_reclamo: boolean }|null}
 */
export function parseTipoReclamoGroqJson(text, maxN) {
    const trimmed = String(text || "").trim();
    const cleaned = trimmed.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
        const obj = JSON.parse(cleaned);
        const confiable = !!obj.confiable;
        const intento = obj.intento_descripcion_reclamo === true;
        let indice = null;
        if (obj.indice !== null && obj.indice !== undefined && obj.indice !== "") {
            const n = parseInt(String(obj.indice).trim(), 10);
            if (Number.isFinite(n) && n >= 1 && n <= maxN) indice = n;
        }
        return { indice, confiable, intento_descripcion_reclamo: intento };
    } catch (_) {
        return null;
    }
}

/**
 * @param {{ texto: string, tipos: string[], tipoCliente?: string|null, nombreEntidad?: string }} opts
 * @returns {Promise<{ ok: boolean, indice?: number|null, confiable?: boolean, intento_descripcion_reclamo?: boolean, error?: string }>}
 */
export async function inferirTipoReclamoBotWhatsappGroq(opts) {
    if (!hasLlmConfigured()) {
        return { ok: false, error: "GEMINI_API_KEY / GROQ_API_KEY no configurada" };
    }
    const tipos = Array.isArray(opts?.tipos) ? opts.tipos.map((t) => String(t || "").trim()).filter(Boolean) : [];
    if (!tipos.length) {
        return { ok: false, error: "sin_tipos" };
    }
    const texto = String(opts?.texto || "").trim();
    if (texto.length < 8) {
        return { ok: false, error: "texto_corto" };
    }
    const maxN = tipos.length;
    const lista = tipos.map((t, i) => `${i + 1}) ${t}`).join("\n");
    const nom = String(opts?.nombreEntidad || "").trim();
    const userBlock = [
        rubroContextoPrompt(opts?.tipoCliente),
        nom ? `Entidad: ${nom}.` : "",
        "",
        "LISTA DE TIPOS (no modificar los textos):",
        lista,
        "",
        "MENSAJE DEL VECINO:",
        texto.slice(0, 900),
    ]
        .filter(Boolean)
        .join("\n");

    const llm = await callLlmChatCompletions({
        tag: "ia-wa-tipo-reclamo",
        messages: [
            { role: "system", content: buildSystemPrompt(maxN) },
            { role: "user", content: userBlock },
        ],
        temperature: 0,
        max_tokens: 120,
    });

    if (!llm.ok) {
        return { ok: false, error: llm.status ? `${llm.provider || "IA"} ${llm.status}` : "red" };
    }
    const content = llm.content || "";
    const parsed = parseTipoReclamoGroqJson(content, maxN);
    if (!parsed) {
        console.warn("[ia-wa-tipo-reclamo] parse falló", content.slice(0, 160));
        return { ok: false, error: "parse" };
    }
    return {
        ok: true,
        indice: parsed.indice,
        confiable: parsed.confiable,
        intento_descripcion_reclamo: parsed.intento_descripcion_reclamo,
    };
}
