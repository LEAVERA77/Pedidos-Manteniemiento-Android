/**
 * Flujo demo tormenta → evento corte masivo:
 * - buscar reclamos abiertos por transformador / distribuidor
 * - crear incidencia + asociar + asignar técnico
 * - encolar notificación móvil para el técnico (app Android)
 * made by leavera77
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const withTransactionMock = vi.fn();
const enqueueCorteMasivoMock = vi.fn();

vi.mock("../db/neon.js", () => ({
  query: (...a) => queryMock(...a),
  withTransaction: (...a) => withTransactionMock(...a),
}));

vi.mock("../utils/tenantScope.js", () => ({
  pedidosTableHasTenantIdColumn: async () => true,
  tableHasColumn: async () => true,
  usuariosTenantColumnName: async () => "tenant_id",
}));

vi.mock("../utils/businessScope.js", () => ({
  pushPedidoBusinessFilter: async () => "",
}));

vi.mock("../utils/sociosCatalogScope.js", () => ({
  sociosCatalogoWhereForApi: async () => ({ sql: "", params: [] }),
}));

vi.mock("../services/notificacionesMovilEnqueue.js", () => ({
  enqueueNotificacionCorteMasivoParaTecnico: (...a) => enqueueCorteMasivoMock(...a),
}));

const { buscarPedidosEventoCorte, ejecutarEventoCorteMasivo } = await import(
  "../services/eventoCorteMasivo.js"
);

const REQ = { tenantId: 7, user: { id: 99, rol: "admin" } };

const PEDIDOS_TRAFO = [
  { id: 1, numero_pedido: "P-001", estado: "Pendiente", cliente: "Socio A", distribuidor: "D1", trafo: "T-101", incidencia_id: null, tecnico_asignado_id: null, fecha_creacion: "2026-06-10" },
  { id: 2, numero_pedido: "P-002", estado: "Pendiente", cliente: "Socio B", distribuidor: "D1", trafo: "T-101", incidencia_id: null, tecnico_asignado_id: null, fecha_creacion: "2026-06-10" },
  { id: 3, numero_pedido: "P-003", estado: "Asignado", cliente: "Socio C", distribuidor: "D1", trafo: "T-101", incidencia_id: null, tecnico_asignado_id: 5, fecha_creacion: "2026-06-10" },
];

beforeEach(() => {
  queryMock.mockReset();
  withTransactionMock.mockReset();
  enqueueCorteMasivoMock.mockReset();
});

function mockQueryDispatcher({ pedidos }) {
  queryMock.mockImplementation(async (sql) => {
    const s = String(sql);
    if (s.includes("information_schema.tables")) return { rows: [{ 1: 1 }] };
    if (s.includes("FROM usuarios")) return { rows: [{ id: 5 }] };
    if (s.includes("FROM pedidos p")) return { rows: pedidos };
    return { rows: [] };
  });
}

describe("buscarPedidosEventoCorte", () => {
  it("agrupa por transformador (match p.trafo o socio del padrón)", async () => {
    mockQueryDispatcher({ pedidos: PEDIDOS_TRAFO });
    const r = await buscarPedidosEventoCorte(REQ, { tipo: "transformador", valor: "T-101" });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(3);
    expect(r.pedidos.map((p) => p.id)).toEqual([1, 2, 3]);
    const sqlUsed = queryMock.mock.calls.find((c) => String(c[0]).includes("FROM pedidos p"))[0];
    expect(sqlUsed).toContain("p.trafo");
    expect(sqlUsed).toContain("socios_catalogo");
    expect(sqlUsed).toContain("incidencia_id IS NULL");
  });

  it("agrupa por distribuidor", async () => {
    mockQueryDispatcher({ pedidos: PEDIDOS_TRAFO });
    const r = await buscarPedidosEventoCorte(REQ, { tipo: "distribuidor", valor: "D1" });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(3);
    const sqlUsed = queryMock.mock.calls.find((c) => String(c[0]).includes("FROM pedidos p"))[0];
    expect(sqlUsed).toContain("p.distribuidor");
  });

  it("rechaza tipo inválido", async () => {
    const r = await buscarPedidosEventoCorte(REQ, { tipo: "barrio", valor: "X" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
});

describe("ejecutarEventoCorteMasivo", () => {
  it("crea incidencia, asocia y asigna todos los pedidos, y notifica al técnico Android", async () => {
    mockQueryDispatcher({ pedidos: PEDIDOS_TRAFO });

    const clientQuery = vi.fn(async (sql) => {
      const s = String(sql);
      if (s.includes("INSERT INTO incidencias")) {
        return { rows: [{ id: 42, nombre: "Corte masivo — Trafo T-101", estado: "abierta" }] };
      }
      if (s.includes("UPDATE pedidos")) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    withTransactionMock.mockImplementation(async (fn) => fn({ query: clientQuery }));

    const r = await ejecutarEventoCorteMasivo(REQ, {
      tipo: "transformador",
      valor: "T-101",
      tecnico_asignado_id: 5,
    });

    expect(r.ok).toBe(true);
    expect(r.status).toBe(201);
    expect(r.incidencia.id).toBe(42);
    expect(r.pedidos_asociados).toBe(3);
    expect(r.pedidos_asignados).toBe(3);

    const incidenciaInsert = clientQuery.mock.calls.find((c) => String(c[0]).includes("INSERT INTO incidencias"));
    expect(incidenciaInsert[1]).toEqual([7, "Corte masivo — Trafo T-101", "transformador", "T-101", 99]);

    const asociaciones = clientQuery.mock.calls.filter((c) => String(c[0]).includes("SET incidencia_id"));
    expect(asociaciones).toHaveLength(3);
    const asignaciones = clientQuery.mock.calls.filter((c) => String(c[0]).includes("tecnico_asignado_id"));
    expect(asignaciones).toHaveLength(3);

    // La notificación al técnico se encola en setImmediate (no bloqueante)
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(enqueueCorteMasivoMock).toHaveBeenCalledTimes(1);
    expect(enqueueCorteMasivoMock.mock.calls[0][0]).toMatchObject({
      tecnicoUsuarioId: 5,
      incidenciaId: 42,
      totalPedidos: 3,
      asignadoPorUsuarioId: 99,
    });
  });

  it("falla claro si no hay reclamos abiertos para el criterio", async () => {
    mockQueryDispatcher({ pedidos: [] });
    const r = await ejecutarEventoCorteMasivo(REQ, {
      tipo: "transformador",
      valor: "T-XXX",
      tecnico_asignado_id: 5,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(enqueueCorteMasivoMock).not.toHaveBeenCalled();
  });

  it("rechaza técnico inválido sin crear incidencia", async () => {
    queryMock.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes("information_schema.tables")) return { rows: [{ 1: 1 }] };
      if (s.includes("FROM usuarios")) return { rows: [] };
      if (s.includes("FROM pedidos p")) return { rows: PEDIDOS_TRAFO };
      return { rows: [] };
    });
    const r = await ejecutarEventoCorteMasivo(REQ, {
      tipo: "transformador",
      valor: "T-101",
      tecnico_asignado_id: 12345,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(withTransactionMock).not.toHaveBeenCalled();
  });
});
