import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({ users: {}, columns: ["tenant_id"], failTenant: false, calls: [] }));
vi.mock("../db/neon.js", () => ({
  query: vi.fn(async (sql, params = [], options = {}) => {
    state.calls.push({ sql, params, options });
    if (sql.includes("information_schema.columns")) {
      if (state.failTenant) throw new Error("secreto o detalle interno");
      return { rows: state.columns.map((column_name) => ({ column_name })) };
    }
    if (sql.includes("SELECT id, email, nombre, rol, activo FROM usuarios")) {
      const u = state.users[Number(params[0])];
      return { rows: u ? [{ ...u }] : [] };
    }
    if (sql.includes("FROM usuarios WHERE id = $1") || sql.includes("FROM usuarios u")) {
      const u = state.users[Number(params[0])];
      if (!u || (sql.includes("activo = TRUE") && !u.activo) || (sql.includes("JOIN clientes") && state.inactiveTenants?.includes(u.tenant_id))) return { rows: [] };
      return { rows: [{ tenant_id: sql.includes("SELECT COALESCE(") ? (u.tenant_id ?? 1) : u.tenant_id }] };
    }
    throw new Error("Consulta no esperada");
  }),
}));
import { authMiddleware, signToken } from "../middleware/auth.js";

function app() {
  const a = express();
  a.get("/protected", authMiddleware, (req, res) => res.json({ id: req.user.id, role: req.user.rol, tenant: req.tenantId }));
  return a;
}
const token = (uid, tid, role = "admin") => signToken({ userId: uid, ...(tid === undefined ? {} : { tenant_id: tid }), rol: role });
const get = (tok) => request(app()).get("/protected").set("Authorization", `Bearer ${tok}`);

beforeEach(() => {
  state.users = {
    1: { id: 1, email: "a", nombre: "A", rol: "admin", activo: true, tenant_id: 1 },
    2: { id: 2, email: "b", nombre: "B", rol: "tecnico", activo: true, tenant_id: 2 },
  };
  state.columns = ["tenant_id"];
  state.failTenant = false;
  state.inactiveTenants = [];
  state.calls = [];
  process.env.AUTH_STRICT_TENANT = "true";
});
afterEach(() => { delete process.env.AUTH_STRICT_TENANT; });

describe("autenticación fresca y tenant estricto", () => {
  it("usa entidad y rol reales de cada cuenta, no el rol afirmado en JWT", async () => {
    const a = await get(token(1, 1, "tecnico")).expect(200);
    const b = await get(token(2, 2, "admin")).expect(200);
    expect(a.body).toEqual({ id: 1, role: "admin", tenant: 1 });
    expect(b.body).toEqual({ id: 2, role: "tecnico", tenant: 2 });
    expect(state.calls.length).toBeGreaterThan(0);
    expect(state.calls.every((q) => q.options.bypassCache === true)).toBe(true);
  });
  it("rechaza tenant de otra entidad, nulo, sin claim y usuario desactivado", async () => {
    await get(token(2, 1)).expect(401);
    await get(token(2, undefined)).expect(401);
    await get(token(2, null)).expect(401);
    state.users[2].tenant_id = null;
    await get(token(2, 2)).expect(403);
    state.users[2].tenant_id = 2;
    state.inactiveTenants = [2];
    await get(token(2, 2)).expect(403);
    state.inactiveTenants = [];
    state.users[2].tenant_id = 2;
    state.users[2].activo = false;
    await get(token(2, 2)).expect(401);
  });
  it("un cambio de rol o baja se observa en la siguiente solicitud", async () => {
    const t = token(2, 2, "admin");
    expect((await get(t).expect(200)).body.role).toBe("tecnico");
    state.users[2].rol = "supervisor";
    expect((await get(t).expect(200)).body.role).toBe("supervisor");
    state.users[2].activo = false;
    await get(t).expect(401);
  });
  it("si falta columna o falla la base no asigna entidad 1", async () => {
    state.columns = [];
    await get(token(2, 1)).expect(403);
    state.columns = ["tenant_id"];
    state.failTenant = true;
    const r = await get(token(2, 1)).expect(503);
    expect(JSON.stringify(r.body)).not.toContain("secreto");
  });
  it("modo legado conserva compatibilidad pero verifica identidad sin caché", async () => {
    delete process.env.AUTH_STRICT_TENANT;
    state.users[2].tenant_id = null;
    const r = await get(token(2, 2)).expect(200);
    expect(r.body.tenant).toBe(1);
    expect(state.calls.every((q) => q.options.bypassCache === true)).toBe(true);
  });
});
