import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../db/neon.js", () => ({
  query: vi.fn(async (text) => {
    const t = String(text || "").trim();
    if (t.startsWith("SELECT 1")) return { rows: [{ "?column?": 1 }] };
    return { rows: [] };
  }),
}));

import { createHttpApp } from "../httpApp.js";

describe("API smoke", () => {
  it("GET /health responde ok y expone X-Request-Id", async () => {
    const app = createHttpApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe("pedidosmg-api");
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(String(res.headers["x-request-id"]).length).toBeGreaterThan(10);
  });

  it("GET /health/db usa Neon (mock)", async () => {
    const app = createHttpApp();
    const res = await request(app).get("/health/db").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe("ok");
  });

  it("respeta X-Request-Id entrante", async () => {
    const app = createHttpApp();
    const id = "test-req-id-12345678";
    const res = await request(app).get("/health").set("X-Request-Id", id).expect(200);
    expect(res.headers["x-request-id"]).toBe(id);
  });
});
