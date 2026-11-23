import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import pg from "pg";

// Solo entorno local descartable, nunca una base Neon ni un entorno real.
const dsn = process.env.AUTH_TEST_DATABASE_URL || "";
if (dsn) {
  const u = new URL(dsn);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname) || u.pathname !== "/gestornova_security_test") {
    throw new Error("La prueba requiere la base local descartable gestornova_security_test");
  }
}

describe.skipIf(!dsn)("identidad estricta con PostgreSQL real", () => {
  let external;
  let db;
  let app;
  let signToken;
  let createdClients = false;
  let createdUsers = false;
  beforeAll(async () => {
    process.env.DB_CONNECTION = dsn;
    process.env.AUTH_STRICT_TENANT = "true";
    process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS = "1";
    external = new pg.Client({ connectionString: dsn });
    await external.connect();
    await external.query(`CREATE TABLE clientes (id integer PRIMARY KEY, activo boolean)`);
    createdClients = true;
    await external.query(`CREATE TABLE usuarios (id integer PRIMARY KEY, email text, nombre text, rol text, activo boolean, tenant_id integer)`);
    createdUsers = true;
    await external.query(`INSERT INTO clientes VALUES (1,true), (2,true)`);
    await external.query(`INSERT INTO usuarios VALUES (1,'a','A','admin',true,1), (2,'b','B','tecnico',true,2)`);
    db = await import("../db/neon.js");
    const auth = await import("../middleware/auth.js");
    signToken = auth.signToken;
    app = express();
    app.get("/protected", auth.authMiddleware, (req, res) => res.json({ role: req.user.rol, tenant: req.tenantId }));
  });
  afterAll(async () => {
    if (db?.pool) await db.pool.end();
    if (external) {
      if (createdUsers) await external.query("DROP TABLE usuarios");
      if (createdClients) await external.query("DROP TABLE clientes");
      await external.end();
    }
    delete process.env.AUTH_STRICT_TENANT;
    delete process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS;
  });
  it("no reutiliza autorización vieja tras cambios externos y rechaza tenant incorrecto", async () => {
    const token1 = signToken({ userId: 1, tenant_id: 1 });
    const token2 = signToken({ userId: 2, tenant_id: 2, rol: "admin" });
    const get = (t) => request(app).get("/protected").set("Authorization", `Bearer ${t}`);
    expect((await get(token1).expect(200)).body).toEqual({ role: "admin", tenant: 1 });
    expect((await get(token2).expect(200)).body).toEqual({ role: "tecnico", tenant: 2 });
    await get(signToken({ userId: 2, tenant_id: 1 })).expect(401);
    await external.query("UPDATE usuarios SET rol = 'supervisor' WHERE id = 2");
    expect((await get(token2).expect(200)).body.role).toBe("supervisor");
    await external.query("UPDATE clientes SET activo = false WHERE id = 2");
    await get(token2).expect(403);
    await external.query("UPDATE clientes SET activo = true WHERE id = 2");
    await external.query("UPDATE usuarios SET tenant_id = 1 WHERE id = 2");
    await get(token2).expect(401);
    await external.query("UPDATE usuarios SET tenant_id = NULL WHERE id = 2");
    await get(token2).expect(403);
    await external.query("UPDATE usuarios SET activo = false WHERE id = 1");
    await get(token1).expect(401);
  });
});
