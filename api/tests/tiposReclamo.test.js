import { describe, it, expect } from "vitest";
import {
  normalizarRubroCliente,
  normalizarPrioridadPedido,
  prioridadPredeterminadaPorTipoTrabajo,
  tipoTrabajoPermitidoParaNuevoPedido,
  tipoReclamoRequiereNisYCliente,
  tipoReclamoElectricoPideSuministroWhatsapp,
  tiposReclamoParaClienteTipo,
} from "../services/tiposReclamo.js";

describe("tiposReclamo — rubro", () => {
  it("normaliza municipio", () => {
    expect(normalizarRubroCliente("Municipio")).toBe("municipio");
  });

  it("normaliza cooperativa eléctrica (variantes)", () => {
    expect(normalizarRubroCliente("cooperativa_electrica")).toBe("cooperativa_electrica");
    expect(normalizarRubroCliente("Cooperativa Electrica")).toBe("cooperativa_electrica");
  });

  it("devuelve null para rubro desconocido", () => {
    expect(normalizarRubroCliente("xyz")).toBeNull();
  });
});

describe("tiposReclamo — prioridad", () => {
  it("respeta prioridad válida explícita", () => {
    expect(normalizarPrioridadPedido("Alta", "Corte de Energía")).toBe("Alta");
  });

  it("usa prioridad del tipo si la enviada no es válida", () => {
    expect(normalizarPrioridadPedido("", "Corte de Energía")).toBe("Alta");
    expect(normalizarPrioridadPedido("Rara", "Corte de Energía")).toBe("Alta");
  });

  it("prioridadPredeterminadaPorTipoTrabajo: factibilidad → Baja", () => {
    expect(prioridadPredeterminadaPorTipoTrabajo("Pedido de factibilidad (nuevo servicio)")).toBe("Baja");
  });
});

describe("tiposReclamo — permisos y reglas", () => {
  it("tipoTrabajoPermitidoParaNuevoPedido: eléctrico incluye Corte de Energía", () => {
    expect(tipoTrabajoPermitidoParaNuevoPedido("Corte de Energía", "cooperativa_electrica")).toBe(true);
  });

  it("tipoTrabajoPermitidoParaNuevoPedido: rechaza tipo vacío", () => {
    expect(tipoTrabajoPermitidoParaNuevoPedido("", "cooperativa_electrica")).toBe(false);
  });

  it("tipoReclamoRequiereNisYCliente: factibilidad sí", () => {
    expect(tipoReclamoRequiereNisYCliente("Pedido de factibilidad (nuevo servicio)")).toBe(true);
  });

  it("tipoReclamoElectricoPideSuministroWhatsapp: factibilidad sí", () => {
    expect(tipoReclamoElectricoPideSuministroWhatsapp("Pedido de factibilidad (nuevo servicio)")).toBe(true);
  });

  it("tiposReclamoParaClienteTipo: municipio incluye Otros", () => {
    const tipos = tiposReclamoParaClienteTipo("municipio");
    expect(tipos).toContain("Otros");
  });

  it("Obstrucción de Cloaca solo en municipio (no en cooperativa_agua)", () => {
    expect(tiposReclamoParaClienteTipo("cooperativa_agua")).not.toContain("Obstrucción de Cloaca");
    expect(tiposReclamoParaClienteTipo("municipio")).toContain("Obstrucción de Cloaca");
  });
});
