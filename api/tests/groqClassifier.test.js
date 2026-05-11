import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = globalThis.fetch;

describe("clasificarReclamoConGroq", () => {
  let clasificarReclamoConGroq;

  beforeEach(async () => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "gsk_test_key_12345";
    const mod = await import("../services/groqClassifier.js");
    clasificarReclamoConGroq = mod.clasificarReclamoConGroq;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  });

  it("retorna error si GROQ_API_KEY no está configurada", async () => {
    process.env.GROQ_API_KEY = "";
    vi.resetModules();
    const mod = await import("../services/groqClassifier.js");
    const r = await mod.clasificarReclamoConGroq({ texto: "test", tipoNegocio: "municipio" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/GROQ_API_KEY/);
  });

  it("retorna error si texto está vacío", async () => {
    const r = await clasificarReclamoConGroq({ texto: "", tipoNegocio: "municipio" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/vacío/);
  });

  it("clasifica correctamente un reclamo de municipio", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                tipo: "Alumbrado Público",
                direccion: "San Martín 500",
                prioridad: "Alta",
                resumen: "Poste de luz apagado",
              }),
            },
          },
        ],
      }),
    });

    const r = await clasificarReclamoConGroq({
      texto: "Hay un poste apagado en San Martín 500",
      tipoNegocio: "municipio",
    });
    expect(r.ok).toBe(true);
    expect(r.clasificacion.tipo).toBe("Alumbrado Público");
    expect(r.clasificacion.direccion).toBe("San Martín 500");
    expect(r.clasificacion.prioridad).toBe("Alta");
    expect(r.clasificacion.resumen).toBeTruthy();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(opts.headers.Authorization).toBe("Bearer gsk_test_key_12345");
  });

  it("fallback a 'Otros' si el tipo devuelto no está en la lista", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                tipo: "Categoría Inventada",
                direccion: null,
                prioridad: "Baja",
                resumen: "No clasificable",
              }),
            },
          },
        ],
      }),
    });

    const r = await clasificarReclamoConGroq({
      texto: "Algo raro pasó",
      tipoNegocio: "cooperativa_agua",
    });
    expect(r.ok).toBe(true);
    expect(r.clasificacion.tipo).toBe("Otros");
  });

  it("maneja error HTTP de Groq", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const r = await clasificarReclamoConGroq({
      texto: "Caño roto en la esquina",
      tipoNegocio: "cooperativa_agua",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/429/);
  });

  it("maneja respuesta JSON malformada de Groq", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "esto no es json" } }],
      }),
    });

    const r = await clasificarReclamoConGroq({
      texto: "No funciona nada",
      tipoNegocio: "cooperativa_electrica",
    });
    expect(r.ok).toBe(true);
    expect(r.clasificacion.tipo).toBe("Otros");
    expect(r.clasificacion.prioridad).toBe("Media");
  });
});
