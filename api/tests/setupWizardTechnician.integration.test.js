import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../db/neon.js", () => {
  const query = vi.fn();
  return { query, pool: {}, withTransaction: async (fn) => fn({ query }) };
});

vi.mock("../utils/tenantUser.js", () => ({
  getUserTenantId: vi.fn(async () => 2),
}));

import { query } from "../db/neon.js";
import { createHttpApp } from "../httpApp.js";

function tokenAdmin(userId, tenantId) {
  return jwt.sign({ userId, tenant_id: tenantId }, process.env.JWT_SECRET || "dev_secret", { expiresIn: "1h" });
}

describe("Setup wizard — técnico tenant", () => {
  const prevKey = process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY;

  beforeEach(() => {
    process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY = "clave_tecnico_test";
    vi.mocked(query).mockImplementation(async (sql, params = []) => {
      const q = String(sql);
      if (q.includes("SELECT id, email, nombre, rol, activo FROM usuarios WHERE id = $1 LIMIT 1")) {
        return { rows: [{ id: Number(params[0]), email: "a@t.com", nombre: "Admin", rol: "admin", activo: true }] };
      }
      if (q.includes("information_schema.columns") && q.includes("usuarios")) {
        return { rows: [{ column_name: "tenant_id" }] };
      }
      if (q.includes("lower(trim(coalesce(email,''))) AS e")) {
        return { rows: [{ e: "a@t.com" }] };
      }
      if (q.includes("FROM clientes WHERE id = $1") && q.includes("nombre")) {
        return { rows: [{ id: 7, nombre: "Coop X" }] };
      }
      if (q.includes("FROM usuarios") && q.includes("tenant_id = $1") && q.includes("id <> $2")) {
        return { rows: [] };
      }
      if (q.includes("UPDATE usuarios") && q.includes("SET") && q.includes("WHERE")) {
        return { rows: [], rowCount: 3 };
      }
      if (q.includes("::int AS tid FROM usuarios WHERE id =")) {
        return { rows: [{ tid: Number(params[0]) === 1 ? 7 : 2 }] };
      }
      if (q.includes("FROM clientes") && q.includes("ORDER BY id ASC")) {
        return { rows: [{ id: 1, nombre: "A", tipo: "cooperativa_electrica", activo: true }] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY = prevKey;
    vi.restoreAllMocks();
  });

  it("403 sin clave o clave incorrecta", async () => {
    const app = createHttpApp();
    await request(app)
      .get("/api/setup/technician/tenants")
      .set("Authorization", `Bearer ${tokenAdmin(1, 2)}`)
      .expect(403);
    await request(app)
      .get("/api/setup/technician/tenants")
      .set("Authorization", `Bearer ${tokenAdmin(1, 2)}`)
      .set("X-GestorNova-Technician-Key", "mala")
      .expect(403);
  });

  it("200 lista clientes con clave correcta", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .get("/api/setup/technician/tenants")
      .set("Authorization", `Bearer ${tokenAdmin(1, 2)}`)
      .set("X-GestorNova-Technician-Key", "clave_tecnico_test")
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.clientes.length).toBeGreaterThanOrEqual(1);
  });

  it("200 attach tenant devuelve token", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/setup/technician/attach-tenant")
      .set("Authorization", `Bearer ${tokenAdmin(1, 2)}`)
      .set("Content-Type", "application/json")
      .set("X-GestorNova-Technician-Key", "clave_tecnico_test")
      .send({ tenant_id: 7 })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tenant_id).toBe(7);
    expect(res.body.usuarios_actualizados).toBe(3);
    expect(res.body.token).toBeTruthy();
    const dec = jwt.verify(res.body.token, process.env.JWT_SECRET || "dev_secret");
    expect(dec.tenant_id).toBe(7);
  });
});
