import { describe, it, expect } from "vitest";
import {
  mensajePedirNombrePersonaEstatico,
  mensajeOpcionalIdentificadorConsejoIa,
  mensajeIntroDescripcionReclamoEstatico,
  mensajeNombreSinCoincidenciaPadron,
  extraerApellidoProbableBusquedaNombre,
} from "../services/whatsapp-bot-microcopy.js";

describe("whatsapp-bot-microcopy", () => {
  it("mensaje pedir nombre menciona apellido para coop eléctrica", () => {
    const m = mensajePedirNombrePersonaEstatico({ tipo: "cooperativa_electrica" });
    expect(m).toMatch(/apellido/i);
    expect(m).toMatch(/NIS|padrón/i);
  });

  it("extraerApellidoProbable toma última palabra", () => {
    expect(extraerApellidoProbableBusquedaNombre("María González")).toBe("González");
    expect(extraerApellidoProbableBusquedaNombre("Ana")).toBeNull();
  });

  it("mensaje sin coincidencia sugiere apellido si hay varias palabras", () => {
    const m = mensajeNombreSinCoincidenciaPadron("Juan Perez");
    expect(m).toMatch(/apellido/i);
    expect(m).toMatch(/Perez/i);
  });

  it("consejo identificador para municipio", () => {
    const c = mensajeOpcionalIdentificadorConsejoIa({ tipo: "municipio" });
    expect(c).toMatch(/\*no\*/);
    expect(c).toMatch(/apellido/i);
  });

  it("intro descripción Otros incluye límite", () => {
    const d = mensajeIntroDescripcionReclamoEstatico("Otros", 250);
    expect(d).toMatch(/250/);
  });
});
