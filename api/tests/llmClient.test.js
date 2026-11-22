import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callLlmChatCompletions,
  GEMINI_OPENAI_URL,
  GEMINI_DEFAULT_MODEL,
  OPENROUTER_OPENAI_URL,
  GROQ_OPENAI_URL,
  resolveLlmProviders,
  hasLlmConfigured,
} from "../services/llmClient.js";

const ENV_KEYS = [
  "AI_API_KEY",
  "AI_API_URL",
  "AI_MODEL",
  "IA_API_KEY",
  "IA_API_URL",
  "IA_MODEL",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_KEY",
  "GEMINI_API_URL",
  "GEMINI_MODEL",
  "GEMINI_REASONING_EFFORT",
  "OPENROUTER_API_KEY",
  "OPENROUTER_API_URL",
  "OPENROUTER_MODEL",
  "GROQ_API_KEY",
  "GROQ_API_URL",
  "GROQ_MODEL",
  "AI_FALLBACK_KEY",
  "AI_FALLBACK_URL",
  "AI_FALLBACK_MODEL",
];

describe("llmClient multi-proveedor (Gemini 3.x/4.x / OpenRouter / HF Space / Groq)", () => {
  const originalFetch = globalThis.fetch;
  const savedEnv = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("reporta sin configurar cuando no hay ninguna clave", async () => {
    expect(hasLlmConfigured()).toBe(false);
    const res = await callLlmChatCompletions({
      messages: [{ role: "user", content: "hola" }],
    });
    expect(res.ok).toBe(false);
    expect(res.missingKey).toBe(true);
    expect(res.error).toMatch(/GEMINI_API_KEY/);
  });

  it("usa gemini-3.5-flash-lite por defecto con reasoning_effort='minimal' y margen de max_tokens", async () => {
    process.env.GEMINI_API_KEY = "AIzaSyTestFakeKeyForUnitTestsOnly12345";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    });

    const res = await callLlmChatCompletions({
      messages: [{ role: "user", content: "test" }],
      temperature: 0,
      max_tokens: 100,
    });

    expect(res.ok).toBe(true);
    expect(res.providerName).toBe("gemini");
    expect(res.model).toBe(GEMINI_DEFAULT_MODEL);
    expect(res.content).toBe('{"ok":true}');

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(GEMINI_OPENAI_URL);
    expect(opts.headers.Authorization).toBe("Bearer AIzaSyTestFakeKeyForUnitTestsOnly12345");
    const parsedBody = JSON.parse(opts.body);
    expect(parsedBody.model).toBe("gemini-3.5-flash-lite");
    expect(parsedBody.reasoning_effort).toBe("minimal");
    expect(parsedBody.max_tokens).toBeGreaterThanOrEqual(600);
  });

  it("autodetecta Gemini y cascada de modelos incluso si se pega AIza... en GROQ_API_KEY", () => {
    process.env.GROQ_API_KEY = "AIzaSyDropInKeyInGroqEnvVar0000001";
    const providers = resolveLlmProviders();
    expect(providers.length).toBeGreaterThanOrEqual(3);
    expect(providers[0].name).toBe("gemini");
    expect(providers[0].url).toBe(GEMINI_OPENAI_URL);
    expect(providers[0].model).toBe("gemini-3.5-flash-lite");
    expect(providers[1].model).toBe("gemini-3.8-flash");
  });

  it("hace fallback automático entre modelos Gemini y luego a OpenRouter si hay 404/429", async () => {
    process.env.GEMINI_API_KEY = "AIzaSyPrimaryQuotaExceededKey0001";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-fallback-key-0002";

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "quota exceeded",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Respuesta desde respaldo OpenRouter" } }],
        }),
      });

    const res = await callLlmChatCompletions({
      messages: [{ role: "user", content: "hola" }],
      max_tokens: 150,
    });

    expect(res.ok).toBe(true);
    expect(res.providerName).toBe("openrouter");
    expect(res.content).toBe("Respuesta desde respaldo OpenRouter");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch.mock.calls[0][0]).toBe(GEMINI_OPENAI_URL);
    expect(globalThis.fetch.mock.calls[1][0]).toBe(OPENROUTER_OPENAI_URL);
  });

  it("mantiene compatibilidad con GROQ_API_KEY (gsk_...) para tests y despliegues legacy", () => {
    process.env.GROQ_API_KEY = "gsk_legacy_key_999";
    const providers = resolveLlmProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("groq");
    expect(providers[0].url).toBe(GROQ_OPENAI_URL);
    expect(providers[0].model).toBe("llama-3.3-70b-versatile");
  });
});
