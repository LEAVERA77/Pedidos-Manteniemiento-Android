import { describe, it, expect } from "vitest";
import {
  sanitizeDerivacionReclamosForStore,
  isValidWhatsappInternational,
  derivacionReclamosDesdeConfig,
  normalizeDerivacionSlotList,
  resolverContactoDerivacion,
  buildDerivacionExternaMensaje,
} from "../utils/derivacionReclamos.js";

describe("derivacionReclamos utils", () => {
  it("sanitize acepta slots válidos (clásicos)", () => {
    const s = sanitizeDerivacionReclamosForStore({
      empresa_energia: { nombre: "EDEA", whatsapp: "+5493415000111" },
      cooperativa_agua: { nombre: "Coope Agua" },
    });
    expect(s.empresa_energia.whatsapp).toBe("+5493415000111");
    expect(s.cooperativa_agua.nombre).toBe("Coope Agua");
    expect(s.cooperativa_agua.whatsapp).toBeUndefined();
  });

  it("sanitize acepta gas, telefonía e listas internet/TV", () => {
    const s = sanitizeDerivacionReclamosForStore({
      empresa_gas_natural: { nombre: "Gas Norte", whatsapp: "+5493415000222" },
      empresa_telefonia: { whatsapp: "+5493415000333" },
      empresa_internet: [
        { nombre: "Fibra A", whatsapp: "+5493415000444" },
        { nombre: "Fibra B", whatsapp: "+5493415000555" },
      ],
      empresa_tv_cable: [{ nombre: "Cable Sur", whatsapp: "+5493415000666" }],
    });
    expect(s.empresa_gas_natural.whatsapp).toBe("+5493415000222");
    expect(s.empresa_telefonia.whatsapp).toBe("+5493415000333");
    expect(Array.isArray(s.empresa_internet)).toBe(true);
    expect(s.empresa_internet).toHaveLength(2);
    expect(s.empresa_tv_cable).toHaveLength(1);
  });

  it("sanitize rechaza whatsapp inválido en lista", () => {
    expect(() =>
      sanitizeDerivacionReclamosForStore({
        empresa_internet: [{ nombre: "X", whatsapp: "5411" }],
      })
    ).toThrow();
  });

  it("normalizeDerivacionSlotList omite vacíos y respeta máximo", () => {
    const list = normalizeDerivacionSlotList([
      {},
      { nombre: "A", whatsapp: "+5491111111111" },
      { nombre: "", whatsapp: "" },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].whatsapp).toBe("+5491111111111");
  });

  it("sanitize rechaza whatsapp inválido (slot simple)", () => {
    expect(() =>
      sanitizeDerivacionReclamosForStore({
        cooperativa_agua: { nombre: "X", whatsapp: "5411" },
      })
    ).toThrow();
  });

  it("isValidWhatsappInternational", () => {
    expect(isValidWhatsappInternational("")).toBe(true);
    expect(isValidWhatsappInternational("+543434123456")).toBe(true);
    expect(isValidWhatsappInternational("+12")).toBe(false);
  });

  it("derivacionReclamosDesdeConfig omite slots corruptos", () => {
    const d = derivacionReclamosDesdeConfig({
      derivacion_reclamos: {
        empresa_energia: { nombre: "OK", whatsapp: "+5498765432100" },
        cooperativa_agua: { whatsapp: "mal" },
        empresa_internet: [{ whatsapp: "+5498765432101" }, { whatsapp: "bad" }],
      },
    });
    expect(d.empresa_energia).toBeTruthy();
    expect(d.cooperativa_agua).toBeUndefined();
    expect(d.empresa_internet).toHaveLength(1);
  });

  it("resolverContactoDerivacion lista y simple", () => {
    const dr = {
      empresa_gas_natural: { nombre: "Gas", whatsapp: "+5493415000111" },
      empresa_internet: [{ nombre: "I1", whatsapp: "+5493415000222" }],
    };
    const a = resolverContactoDerivacion(dr, "empresa_gas_natural", null);
    expect(a.error).toBeUndefined();
    expect(a.whatsapp).toMatch(/^\+/);
    const b = resolverContactoDerivacion(dr, "empresa_internet", 0);
    expect(b.nombre).toBe("I1");
    const c = resolverContactoDerivacion(dr, "empresa_internet", 9);
    expect(c.error).toBeTruthy();
  });

  it("buildDerivacionExternaMensaje incluye pedido y maps si hay lat/lng", () => {
    const t = buildDerivacionExternaMensaje({
      nombreTenant: "Cooperativa Demo",
      pedido: {
        id: 12,
        numero_pedido: 99,
        tipo_trabajo: "Sin luz",
        descripcion: "Corte",
        prioridad: "Alta",
        estado: "Asignado",
        cliente_calle: "Mitre",
        cliente_numero_puerta: "100",
        cliente_localidad: "Rosario",
        cliente_nombre: "Juan Pérez",
        telefono_contacto: "+5493416000000",
        lat: "-32.95",
        lng: "-60.65",
      },
      destinoEtiqueta: "Gas natural",
      contactoNombre: "Gas SA",
      motivo: "Corresponde a red de gas",
    });
    expect(t).toContain("#99");
    expect(t).toContain("maps?q=");
    expect(t).toContain("Cooperativa Demo");
    expect(t).toContain("Corresponde a red de gas");
  });

  it("buildDerivacionExternaMensaje sin GPS usa texto de dirección", () => {
    const t = buildDerivacionExternaMensaje({
      nombreTenant: "X",
      pedido: {
        id: 1,
        numero_pedido: 1,
        tipo_trabajo: "T",
        descripcion: "D",
        prioridad: "Media",
        estado: "En ejecución",
        cliente_direccion: "Ruta 11 km 20",
        lat: null,
        lng: null,
      },
      destinoEtiqueta: "Internet",
      contactoNombre: "",
      motivo: "",
    });
    expect(t).toContain("sin coordenadas");
    expect(t).toContain("Ruta 11");
  });
});
