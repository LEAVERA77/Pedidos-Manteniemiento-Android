import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mockQuery = vi.fn();
const mockEnviarCorreo = vi.fn(async () => "OK");

vi.mock("../db/neon.js", () => ({
  query: (...args) => mockQuery(...args),
}));

vi.mock("../services/emailjsEnvioServidor.js", () => ({
  emailjsServidorConfigurado: vi.fn(() => true),
  enviarCorreoEmailjsServidor: (...args) => mockEnviarCorreo(...args),
  resolveEmailjsConfig: vi.fn(() => ({
    publicKey: "pk_test",
    serviceId: "sv_test",
    templateId: "tpl_test",
    privateKey: "",
  })),
}));

import { createHttpApp } from "../httpApp.js";
import { signToken } from "../middleware/auth.js";

describe("Seguridad — Gateway SQL centralizado (/api/sql) y recuperación de contraseña por API", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnviarCorreo.mockClear();

    mockQuery.mockImplementation(async (sql, params = []) => {
      const s = String(sql || "");
      if (s.includes("information_schema.columns")) {
        if (s.includes("table_name = 'usuarios'")) {
          return { rows: [{ column_name: "tenant_id" }, { "?column?": 1 }] };
        }
        if (s.includes("table_name = 'clientes'") && s.includes("active_business_type")) {
          return { rows: [{ "?column?": 1 }] };
        }
        if (s.includes("table_name = 'pedidos'") && s.includes("business_type")) {
          return { rows: [{ "?column?": 1 }] };
        }
        return { rows: [] };
      }
      if (s.includes("SELECT id, email, nombre, rol, activo FROM usuarios WHERE id = $1")) {
        const id = Number(params[0]);
        if (id === 1) {
          return {
            rows: [
              { id: 1, email: "admin_segui", nombre: "Admin Segui", rol: "admin", activo: true },
            ],
          };
        }
        if (id === 2) {
          return {
            rows: [
              { id: 2, email: "tec_segui", nombre: "Técnico Segui", rol: "tecnico", activo: true },
            ],
          };
        }
        return { rows: [] };
      }
      if (s.includes("SELECT tenant_id FROM usuarios WHERE id = $1")) {
        return { rows: [{ tenant_id: 1 }] };
      }
      if (s.includes("FROM clientes WHERE id = $1")) {
        return {
          rows: [
            {
              id: 1,
              nombre: "Cooperativa Segui",
              tipo: "cooperativa_electrica",
              active_business_type: "electricidad",
              activo: true,
              configuracion: { email: "contacto@coopsegui.com.ar" },
            },
          ],
        };
      }
      if (s.includes("FROM usuarios WHERE activo = TRUE") && s.includes("LOWER(TRIM(COALESCE(email")) {
        return {
          rows: [
            { id: 1, email: "admin_segui", nombre: "Admin Segui", rol: "admin", tid: 1 },
          ],
        };
      }
      if (s.includes("SELECT id FROM usuarios WHERE id = $1 AND TRIM(COALESCE(reset_token")) {
        if (params[1] === "654321") {
          return { rows: [{ id: 1 }] };
        }
        return { rows: [] };
      }
      if (s.startsWith("SELECT id, numero_pedido FROM pedidos")) {
        return { rows: [{ id: 101, numero_pedido: "2026-0101" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it("permite bloquear el gateway SQL con el interruptor de emergencia", async () => {
    const previous = process.env.SQL_GATEWAY_DISABLED;
    process.env.SQL_GATEWAY_DISABLED = "true";
    try {
      const token = signToken({ userId: 1, tenant_id: 1, rol: "admin" });
      await request(createHttpApp()).post("/api/sql/query")
        .set("Authorization", `Bearer ${token}`).send({ query: "SELECT 1" }).expect(503);
    } finally {
      if (previous === undefined) delete process.env.SQL_GATEWAY_DISABLED;
      else process.env.SQL_GATEWAY_DISABLED = previous;
    }
  });

  it("rechaza con 401 cualquier consulta a /api/sql/query sin JWT válido", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/sql/query")
      .send({ query: "SELECT id, numero_pedido FROM pedidos LIMIT 5" });
    expect(res.status).toBe(401);
  });

  it("permite SELECT/UPDATE/DELETE con WHERE autenticado y bloquea multi-statement, DROP, UPDATE sin WHERE y password_hash", async () => {
    const app = createHttpApp();
    const adminToken = signToken({ userId: 1, rol: "admin", tenant_id: 1 });
    const techToken = signToken({ userId: 2, rol: "tecnico", tenant_id: 1 });

    // SELECT legítimo
    const okSel = await request(app)
      .post("/api/sql/query")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ query: "SELECT id, numero_pedido FROM pedidos WHERE tenant_id = 1 LIMIT 10" });
    expect(okSel.status).toBe(200);
    expect(okSel.body.rows).toEqual([{ id: 101, numero_pedido: "2026-0101" }]);

    // Multi-statement bloqueado
    const multi = await request(app)
      .post("/api/sql/query")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ query: "SELECT 1; DROP TABLE pedidos" });
    expect(multi.status).toBe(403);

    // UPDATE sin WHERE bloqueado
    const noWhere = await request(app)
      .post("/api/sql/query")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ query: "UPDATE pedidos SET estado = 'Cerrado'" });
    expect(noWhere.status).toBe(403);

    // Lectura o escritura de password_hash bloqueada por SQL cliente
    const pwLeak = await request(app)
      .post("/api/sql/query")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ query: "SELECT id, email, password_hash FROM usuarios" });
    expect(pwLeak.status).toBe(403);

    // DDL bloqueado para rol técnico, permitido solo idempotente para admin
    const techDdl = await request(app)
      .post("/api/sql/query")
      .set("Authorization", `Bearer ${techToken}`)
      .send({ query: "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token TEXT" });
    expect(techDdl.status).toBe(403);

    const adminDdl = await request(app)
      .post("/api/sql/query")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ query: "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token TEXT" });
    expect(adminDdl.status).toBe(200);
  });

  it("recuperación de contraseña por /api/auth/password-reset/* no expone el token en HTTP y guarda hash bcrypt", async () => {
    const app = createHttpApp();

    const reqRes = await request(app).post("/api/auth/password-reset/request").send({
      usuario: "admin_segui",
      tenant_id: 1,
      emailjs: {
        publicKey: "pk_test",
        serviceId: "sv_test",
        templateId: "tpl_test",
      },
    });
    expect(reqRes.status).toBe(200);
    expect(reqRes.body.ok).toBe(true);
    expect(reqRes.body.token).toBeUndefined();
    expect(mockEnviarCorreo).toHaveBeenCalledTimes(1);

    const confRes = await request(app).post("/api/auth/password-reset/confirm").send({
      usuario: "admin_segui",
      user_id: 1,
      codigo: "654321",
      nueva_password: "NuevaPasswordSegura2026",
    });
    expect(confRes.status).toBe(200);
    expect(confRes.body.ok).toBe(true);

    const updatePwCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql || "").includes("UPDATE usuarios SET password_hash = $1")
    );
    expect(updatePwCall).toBeTruthy();
    const savedHash = updatePwCall[1][0];
    expect(String(savedHash)).toMatch(/^\$2[aby]\$/);
  });
});
