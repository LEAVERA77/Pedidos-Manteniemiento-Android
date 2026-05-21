import { describe, it, expect } from "vitest";
import {
  construirInferenciaUbicacionDesdeReverse,
  esInferenciaUbicacionSuficienteParaConfirmar,
  msgConfirmarUbicacionGpsInferida,
} from "../services/whatsapp-bot-gps-ubicacion.js";

describe("whatsapp-bot-gps-ubicacion", () => {
  it("construye inferencia desde reverse OSM", () => {
    const rev = {
      displayName: "Av. San Martín 100, Hasenkamp, Entre Ríos, Argentina",
      address: {
        road: "Avenida San Martín",
        house_number: "100",
        city: "Hasenkamp",
        state: "Entre Ríos",
      },
    };
    const inf = construirInferenciaUbicacionDesdeReverse(rev, -31.5, -59.4, (s) =>
      s.includes("Entre") ? "Entre Ríos" : null
    );
    expect(inf?.ciudad).toBe("Hasenkamp");
    expect(inf?.calle).toMatch(/San Martín/i);
    expect(inf?.numero).toBe("100");
    expect(esInferenciaUbicacionSuficienteParaConfirmar(inf)).toBe(true);
  });

  it("mensaje confirmación incluye opciones 1 y 2", () => {
    const msg = msgConfirmarUbicacionGpsInferida({
      displayName: "Calle Falsa 123",
      ciudad: "Rosario",
      calle: "Calle Falsa",
      numero: "123",
      provincia: "Santa Fe",
      lat: -32.9,
      lng: -60.6,
    });
    expect(msg).toMatch(/\*1\*/);
    expect(msg).toMatch(/\*2\*/);
    expect(msg).toMatch(/Rosario/i);
  });

  it("rechaza inferencia sin ciudad", () => {
    expect(esInferenciaUbicacionSuficienteParaConfirmar({ ciudad: "", calle: "X", lat: 1, lng: 2 })).toBe(false);
  });
});
