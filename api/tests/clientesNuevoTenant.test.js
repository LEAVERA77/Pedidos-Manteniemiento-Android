import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

vi.mock("../db/neon.js", () => {
  const query = vi.fn();
  const withTransaction = vi.fn(async (fn) => {
    const client = { query };
    return fn(client);
  });
  return { query, withTransaction };
});

import { query, withTransaction } from "../db/neon.js";
import { createHttpApp } from "../httpApp.js";

function mockNeonForNuevoTenant({ clienteId = 21, dupNombre = false, emailTaken = false } = {}) {
  vi.mocked(query).mockImplementation(async (sql, params = []) => {
    const q = String(sql);
    if (q.includes("information_schema.columns") && q.includes("table_name = $1") && params[0] === "clientes" && params[1] === "active_business_type") {
      return { rows: [{ ok: 1 }] };
    }
    if (q.includes("information_schema.columns") && q.includes("table_name = 'usuarios'") && q.includes("column_name")) {
      return {
        rows: [{ column_name: "tenant_id" }, { column_name: "business_type" }, { column_name: "telefono_whatsapp" }],
      };
    }
    if (q.includes("information_schema.columns") && params[0] === "usuarios" && params[1] === "business_type") {
      return { rows: [{ ok: 1 }] };
    }
    if (q.includes("information_schema.columns") && params[0] === "usuarios" && params[1] === "telefono_whatsapp") {
      return { rows: [{ ok: 1 }] };
    }
    if (q.includes("lower(trim(nombre))")) {
      return dupNombre ? { rows: [{ id: 1 }] } : { rows: [] };
    }
    return { rows: [] };
  });

  vi.mocked(withTransaction).mockImplementation(async (fn) => {
    const client = {
      query: async (sql, params = []) => {
        const q = String(sql);
        if (q.includes("INSERT INTO clientes") && q.includes("active_business_type")) {
          return {
            rows: [
              {
                id: clienteId,
                nombre: params[0],
                tipo: params[1],
                active_business_type: params[2],
                activo: true,
              },
            ],
          };
        }
        if (q.includes("INSERT INTO clientes") && !q.includes("active_business_type")) {
          return {
            rows: [{ id: clienteId, nombre: params[0], tipo: params[1], activo: true }],
          };
        }
        if (q.includes("SELECT 1 FROM usuarios WHERE LOWER(TRIM(email))")) {
          return emailTaken ? { rows: [{ ok: 1 }] } : { rows: [] };
        }
        if (q.includes("INSERT INTO usuarios")) {
          return { rows: [{ id: 999 }] };
        }
        return { rows: [] };
      },
    };
    return fn(client);
  });
}

describe("POST /api/clientes/nuevo", () => {
  const prevKey = process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY;
  let app;

  beforeEach(() => {
    process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY = "clave_tecnico_nuevo_tenant";
    app = createHttpApp();
  });

  afterEach(() => {
    process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY = prevKey;
    vi.clearAllMocks();
  });

  it("403 sin clave técnica", async () => {
    const res = await request(app).post("/api/clientes/nuevo").send({ nombre: "X", tipo: "municipio" });
    expect(res.status).toBe(403);
  });

  it("201 con X-GestorNova-Technician-Key y admin_creado", async () => {
    mockNeonForNuevoTenant({ clienteId: 21 });
    const res = await request(app)
      .post("/api/clientes/nuevo")
      .set("X-GestorNova-Technician-Key", "clave_tecnico_nuevo_tenant")
      .send({ nombre: "Cooperativa Nueva", tipo: "cooperativa_electrica" });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.cliente.id).toBe(21);
    expect(res.body.cliente.tipo).toBe("cooperativa_electrica");
    expect(res.body.admin_creado).toBeTruthy();
    expect(res.body.admin_creado.usuario).toMatch(/^admin_cooperativa_nueva/);
    expect(res.body.admin_creado.password).toMatch(/cooperativanueva\d{4}$/);
    expect(res.body.admin_creado.nombre).toContain("Cooperativa Nueva");
  });

  it("201 con header alias x-tech-key", async () => {
    mockNeonForNuevoTenant({ clienteId: 22 });
    const res = await request(app)
      .post("/api/clientes/nuevo")
      .set("x-tech-key", "clave_tecnico_nuevo_tenant")
      .send({ nombre: "Muni Test", tipo: "municipio" });
    expect(res.status).toBe(201);
    expect(res.body.cliente.id).toBe(22);
    expect(res.body.admin_creado?.usuario).toMatch(/^admin_muni_test/);
  });

  it("sufijo numérico en login si el email ya existe", async () => {
    let emailChecks = 0;
    vi.mocked(query).mockImplementation(async (sql, params = []) => {
      const q = String(sql);
      if (q.includes("information_schema.columns") && q.includes("table_name = $1") && params[0] === "clientes" && params[1] === "active_business_type") {
        return { rows: [{ ok: 1 }] };
      }
      if (q.includes("information_schema.columns") && q.includes("table_name = 'usuarios'")) {
        return { rows: [{ column_name: "tenant_id" }, { column_name: "business_type" }] };
      }
      if (q.includes("information_schema.columns") && params[0] === "usuarios" && params[1] === "business_type") {
        return { rows: [{ ok: 1 }] };
      }
      if (q.includes("information_schema.columns") && params[0] === "usuarios" && params[1] === "telefono_whatsapp") {
        return { rows: [] };
      }
      if (q.includes("lower(trim(nombre))")) return { rows: [] };
      return { rows: [] };
    });
    vi.mocked(withTransaction).mockImplementation(async (fn) => {
      const client = {
        query: async (sql, params = []) => {
          const q = String(sql);
          if (q.includes("INSERT INTO clientes")) {
            return { rows: [{ id: 40, nombre: params[0], tipo: params[1], active_business_type: params[2], activo: true }] };
          }
          if (q.includes("SELECT 1 FROM usuarios WHERE LOWER(TRIM(email))")) {
            emailChecks += 1;
            const login = String(params[0] || "");
            if (login === "admin_pajarito") return { rows: [{ ok: 1 }] };
            return { rows: [] };
          }
          if (q.includes("INSERT INTO usuarios")) {
            return { rows: [{ id: 1 }] };
          }
          return { rows: [] };
        },
      };
      return fn(client);
    });
    const res = await request(app)
      .post("/api/clientes/nuevo")
      .set("X-GestorNova-Technician-Key", "clave_tecnico_nuevo_tenant")
      .send({ nombre: "El Pajarito", tipo: "cooperativa_electrica" });
    expect(res.status).toBe(201);
    expect(res.body.admin_creado.usuario).toBe("admin_pajarito2");
    expect(emailChecks).toBeGreaterThanOrEqual(2);
  });
});
