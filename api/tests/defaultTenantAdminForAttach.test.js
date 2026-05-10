import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOrCreateAdminUidForTechnicianAttach,
  defaultAdminEmailForTenant,
} from "../services/defaultTenantAdminForAttach.js";
import { query } from "../db/neon.js";

vi.mock("../db/neon.js", () => ({ query: vi.fn() }));

vi.mock("../utils/tenantScope.js", () => ({
  tableHasColumn: vi.fn(async () => false),
}));

describe("defaultTenantAdminForAttach — attach sin Bearer", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it("inserta solo la cuenta admin+tenant{N}@gestornova.default si no existe", async () => {
    const tid = 5;
    const email = defaultAdminEmailForTenant(tid);
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 701, rol: "admin" }] });

    const out = await getOrCreateAdminUidForTechnicianAttach("tenant_id", tid);
    expect(out).toEqual({ uid: 701, rol: "admin", created: true });
    const allSql = vi.mocked(query).mock.calls.map((c) => String(c[0] || ""));
    expect(allSql.some((s) => s.includes("ORDER BY id ASC"))).toBe(false);
    const ins = vi.mocked(query).mock.calls.find((c) => String(c[0] || "").includes("INSERT INTO usuarios"));
    expect(ins?.[1]).toEqual([tid, email, expect.any(String)]);
  });

  it("reubica la cuenta de respaldo al tenant origen si el email existe en otro tenant", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 88, rol: "admin", cur_tid: 9 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await getOrCreateAdminUidForTechnicianAttach("tenant_id", 5);
    expect(out).toEqual({ uid: 88, rol: "admin", created: false });
    const setTenant = vi.mocked(query).mock.calls.find(
      (c) => String(c[0] || "").includes("UPDATE usuarios SET tenant_id = $1 WHERE id = $2")
    );
    expect(setTenant?.[1]).toEqual([5, 88]);
  });

  it("si la cuenta de respaldo ya está en el tenant origen, solo normaliza rol", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 12, rol: "admin" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await getOrCreateAdminUidForTechnicianAttach("tenant_id", 3);
    expect(out).toEqual({ uid: 12, rol: "admin", created: false });
    expect(vi.mocked(query).mock.calls.length).toBe(2);
  });
});
