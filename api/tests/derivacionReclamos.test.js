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

  it("buildDerivacionExternaMensaje incluye A:, pedido, Maps si hay lat/lng y observaciones", () => {
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
      nombreEmpresaDestino: "Gas SA",
      textoObservacionesTecnico: "Corresponde a red de gas.",
    });
    expect(t).toMatch(/^A: Gas SA/m);
    expect(t).toContain("N° 99");
    expect(t).toContain("ref. interna id 12");
    expect(t).toContain("maps?q=");
    expect(t).toContain("Abrí en Maps:");
    expect(t).toContain("Cooperativa Demo");
    expect(t).toContain("vuestra empresa");
    expect(t).toContain("Corresponde a red de gas.");
    expect(t).toContain("Gracias por su atención.");
  });

  it("buildDerivacionExternaMensaje trata 0,0 como sin GPS (fallback a dirección)", () => {
    const t = buildDerivacionExternaMensaje({
      nombreTenant: "Coop",
      pedido: {
        id: 3,
        numero_pedido: 3,
        tipo_trabajo: "T",
        descripcion: "D",
        prioridad: "Media",
        estado: "En ejecución",
        cliente_calle: "San Martín",
        cliente_numero_puerta: "50",
        cliente_localidad: "Cerrito",
        lat: 0,
        lng: 0,
      },
      nombreEmpresaDestino: "Tercero",
      textoObservacionesTecnico: "Obs.",
    });
    expect(t).toContain("Sin coordenadas GPS registradas en el sistema");
    expect(t).toContain("San Martín");
    expect(t).not.toMatch(/maps\?q=0,0/);
  });

  it("buildDerivacionExternaMensaje sin GPS usa dirección y aclaración sin coordenadas", () => {
    const t = buildDerivacionExternaMensaje({
      nombreTenant: "Municipio X",
      pedido: {
        id: 1,
        numero_pedido: 1,
        tipo_trabajo: "T",
        descripcion: "D",
        prioridad: "Media",
        estado: "En ejecución",
        cliente_calle: "Ruta 11",
        cliente_numero_puerta: "km 20",
        cliente_localidad: "",
        lat: null,
        lng: null,
      },
      nombreEmpresaDestino: "Fibra Norte",
      textoObservacionesTecnico: "Poste inclinado de telefonía a cargo de terceros.",
    });
    expect(t).toContain("Sin coordenadas GPS registradas en el sistema");
    expect(t).toContain("Ruta 11");
    expect(t).toContain("Municipio X le informa");
  });
});
