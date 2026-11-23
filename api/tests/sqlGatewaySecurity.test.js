import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mockQuery = vi.fn();
const mockEnviarCorreo = vi.fn(async () => "OK");
let resetState;

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
import { emailjsServidorConfigurado } from "../services/emailjsEnvioServidor.js";

describe("Seguridad — Gateway SQL centralizado (/api/sql) y recuperación de contraseña por API", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnviarCorreo.mockReset();
    mockEnviarCorreo.mockResolvedValue("OK");
    resetState = { token: null, active: true, admin: true, expired: false };

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
      if (s.startsWith("UPDATE usuarios SET reset_token = $1")) {
        resetState.token = params[0];
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith("UPDATE usuarios SET reset_token = NULL")) {
        if (params[0] === 1 && resetState.token === params[1]) resetState.token = null;
        return { rows: [] };
      }
      if (s.startsWith("UPDATE usuarios SET password_hash = $1")) {
        if (params[1] === 1 && params[2] === resetState.token && resetState.active && resetState.admin && !resetState.expired) {
          resetState.token = null;
          return { rows: [{ id: 1 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
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

  it("un técnico no accede a usuarios, padrón, estadísticas ni modifica configuración aun con clave de soporte", async () => {
    const prev = process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY;
    process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY = "clave-de-prueba";
    try {
      const app = createHttpApp();
      const token = signToken({ userId: 2, tenant_id: 1, rol: "admin" }); // El rol válido viene de BD.
      for (const [method, url, body] of [
        ["get", "/api/usuarios", null],
        ["post", "/api/usuarios", { usuario: "nuevo", password: "clave" }],
        ["post", "/api/usuarios/1/clave-provisoria", {}],
        ["put", "/api/clientes/mi-configuracion", { nombre: "Alterado" }],
        ["post", "/api/setup/wizard", {}],
        ["get", "/api/padron-pedido/buscar-nombre?q=Garcia", null],
        ["get", "/api/admin/socios-catalogo", null],
        ["get", "/api/socios/exportar", null],
        ["get", "/api/estadisticas/resumen", null],
        ["post", "/api/ia/sugerir-kpis", {}],
      ]) {
        const r = request(app)[method](url).set("Authorization", `Bearer ${token}`)
          .set("X-GestorNova-Technician-Key", "clave-de-prueba");
        if (body) r.send(body);
        await r.expect(403);
      }
    } finally {
      if (prev === undefined) delete process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY;
      else process.env.GESTORNOVA_TECHNICIAN_TENANT_KEY = prev;
    }
  });

  it("no permite a un administrador crear usuarios en otro tenant", async () => {
    const app = createHttpApp();
    const token = signToken({ userId: 1, tenant_id: 1 });
    await request(app).post("/api/usuarios").set("Authorization", `Bearer ${token}`)
      .send({ usuario: "intruso", password: "clave", rol: "admin", tenant_id: 2 }).expect(403);
    expect(mockQuery.mock.calls.some(([sql]) => /^INSERT INTO usuarios/i.test(String(sql).trim()))).toBe(false);
  });

  it("no permite al solicitante desviar el código de recuperación a otro correo", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/auth/password-reset/request").send({
      usuario: "admin_segui", tenant_id: 1, email_destino: "atacante@example.net",
      emailjs: { publicKey: "ajena", serviceId: "ajena", templateId: "ajena" },
    });
    expect(res.status).toBe(403);
    expect(mockEnviarCorreo).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE usuarios SET reset_token"))).toBe(false);
  });

  it("no usa el tenant 1 por defecto si el usuario no tiene tenant válido", async () => {
    const original = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(async (sql, params) => {
      if (String(sql).includes("FROM usuarios WHERE activo = TRUE") && String(sql).includes("LOWER(TRIM(COALESCE(email")) {
        return { rows: [{ id: 1, email: "admin_segui", nombre: "Admin Segui", rol: "admin", tid: null }] };
      }
      return original(sql, params);
    });
    const res = await request(createHttpApp()).post("/api/auth/password-reset/request")
      .send({ usuario: "admin_segui", tenant_id: 1 });
    expect(res.status).toBe(503);
    expect(mockEnviarCorreo).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE usuarios SET reset_token"))).toBe(false);
  });

  it("no modifica el código si EmailJS no está configurado en el servidor", async () => {
    vi.mocked(emailjsServidorConfigurado).mockReturnValueOnce(false);
    const res = await request(createHttpApp()).post("/api/auth/password-reset/request")
      .send({ usuario: "admin_segui", tenant_id: 1 });
    expect(res.status).toBe(503);
    expect(mockEnviarCorreo).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE usuarios SET reset_token"))).toBe(false);
  });

  it("ignora la configuración de EmailJS aportada por el solicitante", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/auth/password-reset/request").send({
      usuario: "admin_segui", tenant_id: 1, email_destino: "contacto@coopsegui.com.ar",
      emailjs: { publicKey: "ajena", serviceId: "ajena", templateId: "ajena" },
    });
    expect(res.status).toBe(200);
    expect(mockEnviarCorreo).toHaveBeenCalledTimes(1);
    const [params, config] = mockEnviarCorreo.mock.calls[0];
    expect(params.to_email).toBe("contacto@coopsegui.com.ar");
    expect(config.publicKey).toBeUndefined();
    expect(config.serviceId).toBeUndefined();
    expect(config.templateId).not.toBe("ajena");
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
      codigo: mockEnviarCorreo.mock.calls[0][0].token,
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
  it("almacena solo HMAC y consume el código una sola vez en confirmaciones concurrentes", async () => {
    const app = createHttpApp();
    await request(app).post("/api/auth/password-reset/request").send({ usuario: "admin_segui", tenant_id: 1 }).expect(200);
    const code = mockEnviarCorreo.mock.calls[0][0].token;
    expect(resetState.token).toMatch(/^hmac-v1:[0-9a-f]{64}$/);
    expect(resetState.token).not.toContain(code);
    const body = { user_id: 1, codigo: code, nueva_password: "ClaveSegura2026" };
    const results = await Promise.all([
      request(app).post("/api/auth/password-reset/confirm").send(body),
      request(app).post("/api/auth/password-reset/confirm").send(body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const sql = mockQuery.mock.calls.find(([q]) => String(q).includes("UPDATE usuarios SET password_hash = $1"))[0];
    expect(sql).toMatch(/reset_token = \$3/);
    expect(sql).toMatch(/reset_expiry > NOW\(\)/);
    expect(sql).toMatch(/activo = TRUE/);
    expect(sql).toMatch(/'admin', 'administrador'/);
  });

  it.each(["expired", "inactive", "not_admin"])("rechaza código con cuenta %s", async (state) => {
    const app = createHttpApp();
    await request(app).post("/api/auth/password-reset/request").send({ usuario: "admin_segui", tenant_id: 1 }).expect(200);
    const code = mockEnviarCorreo.mock.calls[0][0].token;
    if (state === "expired") resetState.expired = true;
    if (state === "inactive") resetState.active = false;
    if (state === "not_admin") resetState.admin = false;
    await request(app).post("/api/auth/password-reset/confirm").send({ user_id: 1, codigo: code, nueva_password: "ClaveSegura2026" }).expect(400);
  });

  it("rechaza otra cuenta, código antiguo en texto plano y falta de identificador", async () => {
    const app = createHttpApp();
    await request(app).post("/api/auth/password-reset/request").send({ usuario: "admin_segui", tenant_id: 1 }).expect(200);
    const code = mockEnviarCorreo.mock.calls[0][0].token;
    const body = { user_id: 2, codigo: code, nueva_password: "ClaveSegura2026" };
    await request(app).post("/api/auth/password-reset/confirm").send(body).expect(400);
    await request(app).post("/api/auth/password-reset/confirm").send({ ...body, user_id: undefined, usuario: "admin_segui" }).expect(400);
    resetState.token = code;
    await request(app).post("/api/auth/password-reset/confirm").send({ ...body, user_id: 1 }).expect(400);
  });

  it("invalida el desafío si falla el envío sin exponer el error del proveedor", async () => {
    mockEnviarCorreo.mockRejectedValueOnce(new Error("detalle sensible del proveedor"));
    const res = await request(createHttpApp()).post("/api/auth/password-reset/request").send({ usuario: "admin_segui", tenant_id: 1 });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("detalle sensible");
    expect(resetState.token).toBeNull();
  });

});
