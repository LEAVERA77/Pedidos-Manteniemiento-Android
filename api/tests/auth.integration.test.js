import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

vi.mock("../db/neon.js", () => ({
  query: vi.fn(),
}));

vi.mock("../utils/tenantUser.js", () => ({
  getUserTenantId: vi.fn().mockResolvedValue(1),
}));

import { query } from "../db/neon.js";
import { getUserTenantId } from "../utils/tenantUser.js";
import { createHttpApp } from "../httpApp.js";

describe("Integración — POST /api/auth/login", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it("400 si faltan email o contraseña", async () => {
    const app = createHttpApp();
    const res = await request(app).post("/api/auth/login").send({}).expect(400);
    expect(res.body.error).toMatch(/requeridos/i);
  });

  it("401 si el usuario no existe", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] });
    const app = createHttpApp();
    await request(app)
      .post("/api/auth/login")
      .send({ email: "noexiste@test.com", password: "x" })
      .expect(401);
  });

  it("403 si el usuario está inactivo", async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          email: "in@activo.com",
          nombre: "In",
          rol: "tecnico",
          password_hash: "x",
          activo: false,
        },
      ],
    });
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "in@activo.com", password: "x" })
      .expect(403);
    expect(res.body.error).toMatch(/inactivo/i);
  });

  it("200 con contraseña en texto plano (compatibilidad)", async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: 42,
          email: "admin@test.com",
          nombre: "Admin",
          rol: "admin",
          password_hash: "miClavePlana",
          activo: true,
        },
      ],
    });
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "miClavePlana" })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ id: 42, email: "admin@test.com", rol: "admin", tenant_id: 1 });
  });

  it("200 con bcrypt", async () => {
    const hash = await bcrypt.hash("Secreta1!", 4);
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          email: "bcrypt@test.com",
          nombre: "B",
          rol: "supervisor",
          password_hash: hash,
          activo: true,
        },
      ],
    });
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "bcrypt@test.com", password: "Secreta1!" })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.rol).toBe("supervisor");
    expect(res.body.user.tenant_id).toBe(1);
  });
});

describe("GET /api/auth/tenant-operativo", () => {
  it("200 devuelve tenant_id desde getUserTenantId (BD)", async () => {
    vi.mocked(getUserTenantId).mockReset();
    vi.mocked(getUserTenantId).mockResolvedValue(88);
    const hash = await bcrypt.hash("pwTenantOp", 4);
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: 501,
          email: "tenantop@test.com",
          nombre: "Top",
          rol: "admin",
          password_hash: hash,
          activo: true,
        },
      ],
    });
    const app = createHttpApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "tenantop@test.com", password: "pwTenantOp" })
      .expect(200);
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: 501,
          email: "tenantop@test.com",
          nombre: "Top",
          rol: "admin",
          activo: true,
        },
      ],
    });
    const res = await request(app)
      .get("/api/auth/tenant-operativo")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(res.body).toMatchObject({ tenant_id: 88, user_id: 501 });
    vi.mocked(getUserTenantId).mockReset();
    vi.mocked(getUserTenantId).mockResolvedValue(1);
  });
});
