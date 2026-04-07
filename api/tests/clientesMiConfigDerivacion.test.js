import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createHttpApp } from "../httpApp.js";
import { signToken } from "../middleware/auth.js";
import { query } from "../db/neon.js";

vi.mock("../db/neon.js", () => ({
  query: vi.fn(),
}));

vi.mock("../utils/tenantUser.js", () => ({
  getUserTenantId: vi.fn().mockResolvedValue(1),
}));

describe("PUT /api/clientes/mi-configuracion — derivacion_reclamos", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  function adminBearer() {
    return signToken({ userId: 42, tenant_id: 1 });
  }

  it("400 si whatsapp inválido", async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ id: 42, email: "a@b.c", nombre: "Admin", rol: "admin", activo: true }],
    });
    const app = createHttpApp();
    const res = await request(app)
      .put("/api/clientes/mi-configuracion")
      .set("Authorization", `Bearer ${adminBearer()}`)
      .send({
        configuracion: {
          derivacion_reclamos: { cooperativa_agua: { nombre: "X", whatsapp: "+99" } },
        },
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error || "").toLowerCase()).toContain("derivacion");
  });

  it("200 envía JSON validado al UPDATE", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ id: 42, email: "a@b.c", nombre: "Admin", rol: "admin", activo: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            nombre: "Coop",
            tipo: "cooperativa_electrica",
            configuracion: {
              marca_publicada_admin: true,
              derivacion_reclamos: {
                cooperativa_agua: { nombre: "Agua", whatsapp: "+543411223344" },
              },
            },
          },
        ],
      });
    const app = createHttpApp();
    const res = await request(app)
      .put("/api/clientes/mi-configuracion")
      .set("Authorization", `Bearer ${adminBearer()}`)
      .send({
        configuracion: {
          derivacion_reclamos: {
            empresa_energia: { nombre: "Otra red", whatsapp: "+5493415000111" },
          },
        },
      });
    expect(res.status).toBe(200);
    const updateCall = vi.mocked(query).mock.calls.find((c) => String(c[0] || "").includes("UPDATE clientes"));
    expect(updateCall).toBeTruthy();
    const params = updateCall[1];
    const cfgJson = JSON.parse(params[3]);
    expect(cfgJson.derivacion_reclamos.empresa_energia.whatsapp).toBe("+5493415000111");
  });
});
