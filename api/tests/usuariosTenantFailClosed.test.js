import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({ col: null, tenant: 1, query: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  authWithTenantHost: [(_req, _res, next) => { _req.user = { id: 1, rol: "admin" }; _req.tenantId = state.tenant; next(); }],
  adminOnly: (_req, _res, next) => next(),
}));
vi.mock("../utils/tenantScope.js", () => ({
  usuariosTenantColumnName: async () => state.col,
  tableHasColumn: async () => false,
}));
vi.mock("../db/neon.js", () => ({ query: (...args) => state.query(...args) }));
import router from "../routes/usuarios.js";

function app() { const a = express(); a.use(express.json()); a.use("/usuarios", router); return a; }
describe("usuarios: aislamiento falla cerrado", () => {
  it("no lista, crea ni modifica sin columna de tenant", async () => {
    state.col = null; state.tenant = 1; state.query.mockClear();
    await request(app()).get("/usuarios").expect(503);
    await request(app()).post("/usuarios").send({ usuario: "a", password: "clave" }).expect(503);
    await request(app()).put("/usuarios/7").send({ rol: "admin" }).expect(503);
    expect(state.query).not.toHaveBeenCalled();
  });
  it("no consulta usuarios si falta la identidad del tenant", async () => {
    state.col = "tenant_id"; state.tenant = null; state.query.mockClear();
    await request(app()).get("/usuarios").expect(503);
    expect(state.query).not.toHaveBeenCalled();
  });
});
