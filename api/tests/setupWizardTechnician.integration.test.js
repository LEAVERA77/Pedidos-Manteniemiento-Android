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
      if (q.includes("UPDATE usuarios") && q.includes("WHERE id = $2")) {
        return { rows: [], rowCount: 1 };
      }
      if (q.includes("::int AS tid FROM usuarios WHERE id =")) {
        return { rows: [{ tid: 7 }] };
      }
      if (q.includes("FROM clientes") && q.includes("ORDER BY id ASC")) {
        return { rows: [{ id: 1, nombre: "A", tipo: "cooperativa_electrica", activo: true }] };
      }
      if (
        q.includes("information_schema.columns") &&
        q.includes("table_name = $1") &&
        q.includes("column_name = $2")
      ) {
        if (params[0] === "clientes" && params[1] === "active_business_type") {
          return { rows: [{ ok: 1 }] };
        }
        if (params[0] === "pedido_contador" && params[1] === "tenant_id") {
          return { rows: [] };
        }
        return { rows: [] };
      }
      if (q.includes("SELECT tipo") && q.includes("FROM clientes WHERE id = $1")) {
        return { rows: [{ tipo: "cooperativa_electrica", active_business_type: "electricidad" }] };
      }
      if (q.includes("UPDATE clientes") && q.includes("configuracion = COALESCE(configuracion")) {
        const cfg = JSON.parse(params[3]);
        return {
          rows: [
            {
              id: Number(params[0]),
              nombre: params[1] || "Coop Guardada",
              tipo: params[2] || "cooperativa_electrica",
              configuracion: { ...cfg },
            },
          ],
        };
      }
      if (q.includes("CREATE TABLE IF NOT EXISTS configuracion")) {
        return { rows: [] };
      }
      if (q.includes("INSERT INTO configuracion") && q.includes("ON CONFLICT")) {
        return { rows: [], rowCount: 1 };
      }
      if (q.includes("AS cur_tid") && q.includes("FROM usuarios") && q.includes("lower(trim")) {
        return { rows: [] };
      }
      if (
        q.includes("SELECT id, rol FROM usuarios") &&
        (q.includes("tenant_id = $1") || q.includes("cliente_id = $1")) &&
        q.includes("lower(trim") &&
        params.length === 2
      ) {
        return { rows: [] };
      }
      if (q.includes("INSERT INTO usuarios") && q.includes("RETURNING id, rol")) {
        return { rows: [{ id: 500, rol: "admin" }] };
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
    await request(app).get("/api/setup/technician/tenants").expect(403);
    await request(app)
      .get("/api/setup/technician/tenants")
      .set("X-GestorNova-Technician-Key", "mala")
      .expect(403);
  });

  it("200 lista clientes solo clave (sin Bearer)", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .get("/api/setup/technician/tenants")
      .set("X-GestorNova-Technician-Key", "clave_tecnico_test")
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.clientes.length).toBeGreaterThanOrEqual(1);
  });

  it("200 lista clientes con clave correcta y Bearer (compat)", async () => {
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
    expect(res.body.usuarios_actualizados).toBe(1);
    expect(res.body.token).toBeTruthy();
    const dec = jwt.verify(res.body.token, process.env.JWT_SECRET || "dev_secret");
    expect(dec.tenant_id).toBe(7);
  });

  it("200 attach solo clave + from_tenant_id (sin Bearer)", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/setup/technician/attach-tenant")
      .set("Content-Type", "application/json")
      .set("X-GestorNova-Technician-Key", "clave_tecnico_test")
      .send({ tenant_id: 7, from_tenant_id: 2 })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tenant_id).toBe(7);
    expect(res.body.token).toBeTruthy();
  });

  it("200 completar setup inicial solo clave (sin Bearer)", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/setup/technician/completar-setup-inicial")
      .set("Content-Type", "application/json")
      .set("X-GestorNova-Technician-Key", "clave_tecnico_test")
      .send({
        tenant_id: 7,
        nombre: "Coop Sur",
        tipo: "cooperativa_electrica",
        latitud: -31.4,
        longitud: -64.2,
        configuracion: {
          setup_wizard_completado: true,
          marca_publicada_admin: true,
          abrir_wizard_recuperacion: false,
        },
      })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tenant_id).toBe(7);
    expect(res.body.cliente?.nombre).toBe("Coop Sur");
    expect(res.body.cliente?.configuracion?.setup_wizard_completado).toBe(true);
  });

  it("400 completar setup sin tenant_id", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/setup/technician/completar-setup-inicial")
      .set("Content-Type", "application/json")
      .set("X-GestorNova-Technician-Key", "clave_tecnico_test")
      .send({
        nombre: "X",
        tipo: "cooperativa_electrica",
        latitud: -31,
        longitud: -64,
      })
      .expect(400);
    expect(String(res.body.error || "")).toMatch(/tenant_id/i);
  });
});
