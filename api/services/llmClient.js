/**
 * Cliente unificado OpenAI-compatible para proveedores de IA (Google Gemini AI Studio,
 * OpenRouter :free, Hugging Face Docker Spaces / Ollama y Groq legacy) con fallback automático.
 *
 * Variables soportadas en Render / entorno:
 *   - GEMINI_API_KEY=AIza...              (Recomendado gratis: Google AI Studio -> gemini-3.5-flash-lite + cascada automática)
 *   - GEMINI_MODEL=gemini-3.5-flash-lite  (Opcional; ej. gemini-3.8-flash, gemini-4-hydrogen)
 *   - OPENROUTER_API_KEY=sk-or-v1-...     (Opcional gratis: OpenRouter -> meta-llama/llama-3.3-70b-instruct:free)
 *   - OPENROUTER_MODEL=...                (Opcional)
 *   - AI_API_URL=https://.../v1/chat/completions  (Opcional: Hugging Face Space Docker / propio)
 *   - AI_API_KEY=...
 *   - AI_MODEL=...
 *   - AI_FALLBACK_URL / AI_FALLBACK_KEY / AI_FALLBACK_MODEL (Respaldo secundario opcional)
 *   - GROQ_API_KEY=...                    (Compatibilidad hacia atrás; autodetecta si se pega AIza... o sk-or-...)
 */

export const GEMINI_OPENAI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_FREE_CASCADE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-4-hydrogen",
  "gemini-2.5-flash-lite",
];

export const OPENROUTER_OPENAI_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export const GROQ_OPENAI_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

function trimEnv(name) {
  return String(process.env[name] || "").trim();
}

/**
 * Autodetecta proveedor cuando solo se suministra una API key (por ejemplo si el admin
 * pega una clave AIza... de Gemini o sk-or-... de OpenRouter dentro de GROQ_API_KEY o AI_API_KEY).
 */
export function inferProviderDefaultsFromKey(apiKey, fallbackKind = "groq") {
  const key = String(apiKey || "").trim();
  if (key.startsWith("AIza")) {
    return {
      name: "gemini",
      label: "Gemini",
      url: GEMINI_OPENAI_URL,
      model: trimEnv("GEMINI_MODEL") || GEMINI_DEFAULT_MODEL,
    };
  }
  if (key.startsWith("sk-or-")) {
    return {
      name: "openrouter",
      label: "OpenRouter",
      url: OPENROUTER_OPENAI_URL,
      model: trimEnv("OPENROUTER_MODEL") || OPENROUTER_DEFAULT_MODEL,
    };
  }
  if (fallbackKind === "custom") {
    return {
      name: "custom",
      label: "AI",
      url: GEMINI_OPENAI_URL,
      model: GEMINI_DEFAULT_MODEL,
    };
  }
  return {
    name: "groq",
    label: "Groq",
    url: trimEnv("GROQ_API_URL") || GROQ_OPENAI_URL,
    model: trimEnv("GROQ_MODEL") || GROQ_DEFAULT_MODEL,
  };
}

function pushGeminiCandidateWithCascade(candidates, apiKey, explicitUrl, explicitModel) {
  const url = explicitUrl || GEMINI_OPENAI_URL;
  if (explicitModel) {
    candidates.push({
      name: "gemini",
      label: "Gemini",
      url,
      apiKey,
      model: explicitModel,
    });
    return;
  }
  for (const model of GEMINI_FREE_CASCADE_MODELS) {
    candidates.push({
      name: "gemini",
      label: "Gemini",
      url,
      apiKey,
      model,
    });
  }
}

/**
 * Devuelve la lista ordenada de proveedores configurados sin duplicados.
 * Prioridad:
 *   1) AI_API_KEY (+ AI_API_URL / AI_MODEL si están definidos)
 *   2) GEMINI_API_KEY (con cascada automática por modelos Free Tier si no se fija GEMINI_MODEL)
 *   3) OPENROUTER_API_KEY
 *   4) GROQ_API_KEY (autodetecta si contiene AIza... o sk-or-...)
 *   5) AI_FALLBACK_KEY (+ AI_FALLBACK_URL / AI_FALLBACK_MODEL)
 */
export function resolveLlmProviders() {
  const candidates = [];

  const aiKey = trimEnv("AI_API_KEY") || trimEnv("IA_API_KEY");
  const aiUrl = trimEnv("AI_API_URL") || trimEnv("IA_API_URL");
  const aiModel = trimEnv("AI_MODEL") || trimEnv("IA_MODEL");
  const explicitGeminiModel = trimEnv("GEMINI_MODEL");

  if (aiKey) {
    const inferred = inferProviderDefaultsFromKey(aiKey, "custom");
    const finalUrl = aiUrl || inferred.url;
    const isGeminiUrl = finalUrl.includes("generativelanguage.googleapis.com");
    const isOpenRouterUrl = finalUrl.includes("openrouter.ai");
    if (isGeminiUrl && !aiModel && !explicitGeminiModel) {
      pushGeminiCandidateWithCascade(candidates, aiKey, finalUrl, "");
    } else {
      candidates.push({
        name: aiUrl ? (isGeminiUrl ? "gemini" : isOpenRouterUrl ? "openrouter" : "custom") : inferred.name,
        label: aiUrl ? (isGeminiUrl ? "Gemini" : isOpenRouterUrl ? "OpenRouter" : "IA") : inferred.label,
        url: finalUrl,
        apiKey: aiKey,
        model: aiModel || explicitGeminiModel || inferred.model,
      });
    }
  }

  const geminiKey =
    trimEnv("GEMINI_API_KEY") || trimEnv("GOOGLE_API_KEY") || trimEnv("GEMINI_KEY");
  if (geminiKey) {
    pushGeminiCandidateWithCascade(
      candidates,
      geminiKey,
      trimEnv("GEMINI_API_URL") || GEMINI_OPENAI_URL,
      explicitGeminiModel || aiModel
    );
  }

  const openRouterKey = trimEnv("OPENROUTER_API_KEY");
  if (openRouterKey) {
    candidates.push({
      name: "openrouter",
      label: "OpenRouter",
      url: trimEnv("OPENROUTER_API_URL") || OPENROUTER_OPENAI_URL,
      apiKey: openRouterKey,
      model: trimEnv("OPENROUTER_MODEL") || OPENROUTER_DEFAULT_MODEL,
    });
  }

  const groqKey = trimEnv("GROQ_API_KEY");
  if (groqKey) {
    const inferred = inferProviderDefaultsFromKey(groqKey, "groq");
    if (inferred.name === "gemini" && !explicitGeminiModel) {
      pushGeminiCandidateWithCascade(candidates, groqKey, inferred.url, "");
    } else {
      candidates.push({
        name: inferred.name,
        label: inferred.label,
        url: inferred.url,
        apiKey: groqKey,
        model: inferred.model,
      });
    }
  }

  const fbKey = trimEnv("AI_FALLBACK_KEY");
  const fbUrl = trimEnv("AI_FALLBACK_URL");
  const fbModel = trimEnv("AI_FALLBACK_MODEL");
  if (fbKey) {
    const inferred = inferProviderDefaultsFromKey(fbKey, "custom");
    candidates.push({
      name: fbUrl ? "fallback" : inferred.name,
      label: fbUrl ? "IA Fallback" : inferred.label,
      url: fbUrl || inferred.url,
      apiKey: fbKey,
      model: fbModel || inferred.model,
    });
  }

  const seen = new Set();
  const unique = [];
  for (const p of candidates) {
    const dedupKey = `${p.url}::${p.model}::${p.apiKey}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    unique.push(p);
  }
  return unique;
}

export function hasLlmConfigured() {
  return resolveLlmProviders().length > 0;
}

function maskKey(k) {
  const s = String(k || "").trim();
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

export function getConfiguredProvidersPublicInfo() {
  return resolveLlmProviders().map((p, idx) => {
    let host = p.url;
    try {
      host = new URL(p.url).host;
    } catch (_) {}
    return {
      orden: idx + 1,
      proveedor: p.name,
      etiqueta: p.label,
      modelo: p.model,
      host,
      clave_mascara: maskKey(p.apiKey),
    };
  });
}

function defaultGeminiReasoningEffort(model) {
  const m = String(model || "").toLowerCase();
  if (m.startsWith("gemini-2.5-flash")) return "none";
  if (m.includes("flash-lite") || m.startsWith("gemini-3.6-flash")) return "minimal";
  return "low";
}

function buildRequestBody(provider, { messages, temperature, max_tokens }) {
  const body = {
    model: provider.model,
    messages,
  };
  if (typeof temperature === "number") {
    body.temperature = temperature;
  }

  const isGeminiEndpoint = provider.url.includes("generativelanguage.googleapis.com");
  if (typeof max_tokens === "number" && max_tokens > 0) {
    // En Gemini 3 y Gemini 4 los tokens internos de razonamiento ("thinking") descuentan de max_tokens;
    // en 2.5 se desactivan con reasoning_effort="none", pero en 3.x/4.x el mínimo es "minimal"/"low",
    // por lo que sumamos margen para que respuestas cortas (bot WhatsApp / JSON) nunca se trunquen.
    const isGemini25Flash = /^gemini-2\.5-flash/i.test(provider.model);
    body.max_tokens =
      isGeminiEndpoint && !isGemini25Flash ? Math.max(max_tokens + 512, 600) : max_tokens;
  }

  if (isGeminiEndpoint) {
    const effort =
      trimEnv("GEMINI_REASONING_EFFORT") || defaultGeminiReasoningEffort(provider.model);
    if (effort !== "auto" && effort !== "omit") {
      body.reasoning_effort = effort;
    }
  }
  return body;
}

/**
 * Ejecuta una consulta Chat Completions contra el proveedor principal y, si falla por
 * cuota/error HTTP o red, intenta automáticamente con los proveedores de respaldo configurados.
 *
 * @param {{
 *   messages: Array<{ role: string, content: string }>,
 *   temperature?: number,
 *   max_tokens?: number,
 *   signal?: AbortSignal,
 *   tag?: string
 * }} opts
 */
export async function callLlmChatCompletions(opts) {
  const providers = resolveLlmProviders();
  if (!providers.length) {
    return {
      ok: false,
      missingKey: true,
      error: "GEMINI_API_KEY / GROQ_API_KEY no configurada en el servidor",
    };
  }

  const tag = opts?.tag || "llm";
  let lastFailure = null;

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    if (opts?.signal?.aborted) {
      return { ok: false, aborted: true, provider: provider.label, error: "timeout" };
    }

    const body = buildRequestBody(provider, opts || {});
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    };
    if (provider.url.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://gestornova.app";
      headers["X-Title"] = "GestorNova";
    }

    try {
      const fetchOpts = {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      };
      if (opts?.signal) {
        fetchOpts.signal = opts.signal;
      }

      const resp = await fetch(provider.url, fetchOpts);
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        console.error(
          `[${tag}] [${provider.name}:${provider.model}] HTTP ${resp.status}`,
          detail.slice(0, 300)
        );
        lastFailure = {
          ok: false,
          provider: provider.label,
          providerName: provider.name,
          model: provider.model,
          status: resp.status,
          detail: detail.slice(0, 300),
          error: `${provider.label} API respondió ${resp.status}`,
        };
        continue;
      }

      const data = await resp.json();
      const content = String(data?.choices?.[0]?.message?.content ?? "");
      return {
        ok: true,
        content,
        provider: provider.label,
        providerName: provider.name,
        model: provider.model,
        status: resp.status,
      };
    } catch (err) {
      if (err?.name === "AbortError" || opts?.signal?.aborted) {
        return {
          ok: false,
          aborted: true,
          provider: provider.label,
          error: "timeout",
        };
      }
      console.error(`[${tag}] [${provider.name}:${provider.model}] fetch error:`, err?.message || err);
      lastFailure = {
        ok: false,
        networkError: true,
        provider: provider.label,
        providerName: provider.name,
        model: provider.model,
        detail: String(err?.message || err).slice(0, 240),
        error: `Error de red al contactar ${provider.label}`,
      };
    }
  }

  return (
    lastFailure || {
      ok: false,
      networkError: true,
      error: "Error de red al contactar IA",
    }
  );
}
