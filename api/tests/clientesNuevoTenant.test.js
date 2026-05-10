import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

vi.mock("../db/neon.js", () => ({ query: vi.fn() }));

import { query } from "../db/neon.js";
import { createHttpApp } from "../httpApp.js";

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

  it("201 con X-GestorNova-Technician-Key", async () => {
    vi.mocked(query).mockImplementation(async (sql, params = []) => {
      const q = String(sql);
      if (q.includes("information_schema.columns") && params[0] === "clientes" && params[1] === "active_business_type") {
        return { rows: [{ ok: 1 }] };
      }
      if (q.includes("lower(trim(nombre))")) return { rows: [] };
      if (q.includes("INSERT INTO clientes") && q.includes("active_business_type")) {
        return {
          rows: [
            {
              id: 21,
              nombre: params[0],
              tipo: params[1],
              active_business_type: params[2],
              activo: true,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const res = await request(app)
      .post("/api/clientes/nuevo")
      .set("X-GestorNova-Technician-Key", "clave_tecnico_nuevo_tenant")
      .send({ nombre: "Cooperativa Nueva", tipo: "cooperativa_electrica" });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.cliente.id).toBe(21);
    expect(res.body.cliente.tipo).toBe("cooperativa_electrica");
  });

  it("201 con header alias x-tech-key", async () => {
    vi.mocked(query).mockImplementation(async (sql, params = []) => {
      const q = String(sql);
      if (q.includes("information_schema.columns") && params[0] === "clientes" && params[1] === "active_business_type") {
        return { rows: [{ ok: 1 }] };
      }
      if (q.includes("lower(trim(nombre))")) return { rows: [] };
      if (q.includes("INSERT INTO clientes")) {
        return {
          rows: [{ id: 22, nombre: params[0], tipo: params[1], active_business_type: params[2], activo: true }],
        };
      }
      return { rows: [] };
    });
    const res = await request(app)
      .post("/api/clientes/nuevo")
      .set("x-tech-key", "clave_tecnico_nuevo_tenant")
      .send({ nombre: "Muni Test", tipo: "municipio" });
    expect(res.status).toBe(201);
    expect(res.body.cliente.id).toBe(22);
  });
});
