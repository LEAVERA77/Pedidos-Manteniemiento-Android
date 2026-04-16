import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../db/neon.js", () => ({
  query: vi.fn(),
}));

vi.mock("../utils/tenantUser.js", () => ({
  getUserTenantId: vi.fn(async (userId) => (Number(userId) === 1 ? 1 : 2)),
}));

import { query } from "../db/neon.js";
import { createHttpApp } from "../httpApp.js";

function tokenForUser(userId, tenantId) {
  return jwt.sign({ userId, tenant_id: tenantId }, process.env.JWT_SECRET || "dev_secret", { expiresIn: "1h" });
}

describe("Integración — aislamiento tenant/business", () => {
  beforeEach(() => {
    const st = {
      users: {
        1: { id: 1, email: "a1@test.com", nombre: "A1", rol: "admin", activo: true, tenant_id: 1 },
        2: { id: 2, email: "a2@test.com", nombre: "A2", rol: "admin", activo: true, tenant_id: 2 },
      },
      clients: {
        1: { id: 1, tipo: "cooperativa_electrica", active_business_type: "electricidad", activo: true },
        2: { id: 2, tipo: "cooperativa_electrica", active_business_type: "electricidad", activo: true },
      },
      tenantBusinesses: [
        { tenant_id: 1, business_type: "electricidad", active: true },
        { tenant_id: 1, business_type: "agua", active: true },
        { tenant_id: 2, business_type: "electricidad", active: true },
      ],
      tenantActive: {
        1: "electricidad",
        2: "electricidad",
      },
      pedidos: [
        { id: 11, tenant_id: 1, business_type: "electricidad" },
        { id: 12, tenant_id: 1, business_type: "agua" },
        { id: 21, tenant_id: 2, business_type: "electricidad" },
      ],
    };

    vi.mocked(query).mockImplementation(async (sql, params = []) => {
      const q = String(sql);
      if (q.includes("information_schema.columns")) {
        const t = String(params?.[0] || "");
        const c = String(params?.[1] || "");
        if (t === "clientes" && c === "active_business_type") return { rows: [{ ok: 1 }] };
        if (t === "pedidos" && c === "business_type") return { rows: [{ ok: 1 }] };
        if (t === "tenant_businesses" && c === "business_type") return { rows: [{ ok: 1 }] };
        if (t === "tenant_active_business" && c === "active_business_type") return { rows: [{ ok: 1 }] };
        if (q.includes("table_name = 'usuarios'")) {
          return { rows: [{ column_name: "tenant_id" }, { column_name: "business_type" }] };
        }
        if (q.includes("table_name = 'tenant_businesses'")) return { rows: [{ ok: 1 }] };
        if (q.includes("table_name = 'tenant_active_business'")) return { rows: [{ ok: 1 }] };
        if (q.includes("table_name = 'clientes'") && q.includes("active_business_type")) return { rows: [{ ok: 1 }] };
        if (q.includes("table_name = 'pedidos'") && q.includes("business_type")) return { rows: [{ ok: 1 }] };
        return { rows: [] };
      }
      if (q.includes("FROM usuarios WHERE id = $1 LIMIT 1")) {
        const u = st.users[Number(params[0])];
        return { rows: u ? [u] : [] };
      }
      if (q.includes("FROM usuarios WHERE id = $1 AND activo = TRUE LIMIT 1")) {
        const u = st.users[Number(params[0])];
        return { rows: u && u.activo ? [u] : [] };
      }
      if (q.includes("SELECT tipo, active_business_type FROM clientes WHERE id = $1 LIMIT 1")) {
        const c = st.clients[Number(params[0])];
        return { rows: c ? [{ tipo: c.tipo, active_business_type: c.active_business_type }] : [] };
      }
      if (q.includes("FROM tenant_businesses") && q.includes("business_type = $2") && q.includes("active = TRUE")) {
        const ok = st.tenantBusinesses.some(
          (x) => x.tenant_id === Number(params[0]) && x.business_type === String(params[1]) && x.active === true
        );
        return { rows: ok ? [{ ok: 1 }] : [] };
      }
      if (q.includes("FROM tenant_businesses") && q.includes("ORDER BY business_type")) {
        return {
          rows: st.tenantBusinesses
            .filter((x) => x.tenant_id === Number(params[0]))
            .map((x) => ({ business_type: x.business_type, active: x.active, created_at: new Date().toISOString() })),
        };
      }
      if (q.includes("INSERT INTO tenant_active_business")) {
        st.tenantActive[Number(params[0])] = String(params[1]);
        return { rows: [] };
      }
      if (q.includes("tenant_active_business") && q.includes("active_business_type")) {
        return { rows: st.tenantActive[Number(params[0])] ? [{ active_business_type: st.tenantActive[Number(params[0])] }] : [] };
      }
      if (q.includes("UPDATE clientes SET active_business_type = $2")) {
        const c = st.clients[Number(params[0])];
        if (!c) return { rows: [] };
        c.active_business_type = String(params[1]);
        return { rows: [{ id: c.id, active_business_type: c.active_business_type, tipo: c.tipo }] };
      }
      if (q.includes("INSERT INTO tenant_business_audit")) return { rows: [] };
      if (q.includes("SELECT COUNT(*)::int AS c FROM pedidos")) {
        const tid = Number(params[0]);
        const bt = String(params[1] || "");
        return { rows: [{ c: st.pedidos.filter((p) => p.tenant_id === tid && p.business_type === bt).length }] };
      }
      if (q.includes("SELECT id, nombre FROM clientes WHERE id = $1 LIMIT 1")) {
        const c = st.clients[Number(params[0])];
        return { rows: c ? [{ id: c.id, nombre: `Tenant ${c.id}` }] : [] };
      }
      if (q.includes("SELECT id FROM tenant_businesses WHERE tenant_id = $1 AND business_type = $2 LIMIT 1")) {
        const ok = st.tenantBusinesses.some((x) => x.tenant_id === Number(params[0]) && x.business_type === String(params[1]));
        return { rows: ok ? [{ id: 1 }] : [] };
      }
      if (q.includes("INSERT INTO tenant_businesses")) {
        const tid = Number(params[0]);
        const bt = String(params[1]);
        if (!st.tenantBusinesses.some((x) => x.tenant_id === tid && x.business_type === bt)) {
          st.tenantBusinesses.push({ tenant_id: tid, business_type: bt, active: true });
        }
        return { rows: [] };
      }
      if (q.includes("SELECT COUNT(*)::int AS c FROM socios_catalogo")) return { rows: [{ c: 0 }] };
      if (q.includes("SELECT COUNT(*)::int AS c FROM usuarios")) return { rows: [{ c: 1 }] };
      return { rows: [] };
    });
  });

  it("tenant A electricidad no ve tenant B electricidad en business list", async () => {
    const app = createHttpApp();
    const resA = await request(app)
      .get("/api/tenant/businesses")
      .set("Authorization", `Bearer ${tokenForUser(1, 1)}`)
      .expect(200);
    expect(resA.body.tenant_id).toBe(1);
    expect(resA.body.businesses.every((b) => ["electricidad", "agua"].includes(b.business_type))).toBe(true);
  });

  it("tenant A cambia a agua y luego vuelve a electricidad (restore)", async () => {
    const app = createHttpApp();
    await request(app)
      .post("/api/tenant/switch-business")
      .set("Authorization", `Bearer ${tokenForUser(1, 1)}`)
      .send({ business_type: "agua" })
      .expect(200);
    const listAgua = await request(app)
      .get("/api/tenant/businesses")
      .set("Authorization", `Bearer ${tokenForUser(1, 1)}`)
      .expect(200);
    expect(listAgua.body.active_business_type).toBe("agua");

    await request(app)
      .post("/api/tenant/switch-business")
      .set("Authorization", `Bearer ${tokenForUser(1, 1)}`)
      .send({ business_type: "electricidad" })
      .expect(200);
    const listElec = await request(app)
      .get("/api/tenant/businesses")
      .set("Authorization", `Bearer ${tokenForUser(1, 1)}`)
      .expect(200);
    expect(listElec.body.active_business_type).toBe("electricidad");
  });

  it("wizard crea combinación nueva y queda activa para el tenant", async () => {
    const app = createHttpApp();
    const res = await request(app)
      .post("/api/setup/wizard")
      .set("Authorization", `Bearer ${tokenForUser(2, 2)}`)
      .send({ business_type: "agua", tenant_nombre: "Tenant 2" })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.business_type).toBe("agua");
  });
});
