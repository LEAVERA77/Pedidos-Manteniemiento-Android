import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifySqlForCache,
  clearNeonQueryCacheL1,
  executeCachedDbQueryWithMeta,
  getNeonQueryCacheStats,
  invalidateCachedTables,
  resetNeonQueryCacheStats,
  setNeonCacheRedisClientForTests,
} from "../services/neonQueryCache.js";

describe("neonQueryCache — L1 LRU + L2 Redis + Singleflight + Table Invalidation", () => {
  const prevEnable = process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS;

  beforeEach(() => {
    process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS = "1";
    clearNeonQueryCacheL1();
    resetNeonQueryCacheStats();
    setNeonCacheRedisClientForTests(null);
  });

  afterEach(() => {
    clearNeonQueryCacheL1();
    setNeonCacheRedisClientForTests(null);
    if (prevEnable === undefined) {
      delete process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS;
    } else {
      process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS = prevEnable;
    }
  });

  it("clasifica correctamente TTL por tipo de tabla y excluye columnas sensibles", () => {
    const schemaInfo = classifySqlForCache(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'pedidos'"
    );
    expect(schemaInfo.cacheable).toBe(true);
    expect(schemaInfo.ttlSec).toBeGreaterThanOrEqual(1800);

    const catInfo = classifySqlForCache(
      "SELECT id, nombre FROM distribuidores WHERE tenant_id = 1"
    );
    expect(catInfo.cacheable).toBe(true);
    expect(catInfo.tables).toContain("distribuidores");
    expect(catInfo.ttlSec).toBe(300);

    const sensitiveInfo = classifySqlForCache(
      "SELECT id, password_hash FROM usuarios WHERE email = 'admin@test.com'"
    );
    expect(sensitiveInfo.cacheable).toBe(false);

    const writeInfo = classifySqlForCache(
      "UPDATE pedidos SET estado = 'Cerrado' WHERE id = 15"
    );
    expect(writeInfo.cacheable).toBe(false);
    expect(writeInfo.isMutation).toBe(true);
    expect(writeInfo.tables).toContain("pedidos");
  });

  it("sirve HIT-L1 sin tocar Neon en lecturas repetidas y protege el objeto en caché contra mutación in-place", async () => {
    const executor = vi.fn().mockResolvedValue({
      rows: [{ id: 10, estado: "Pendiente" }],
      rowCount: 1,
      command: "SELECT",
      fields: [{ name: "id" }, { name: "estado" }],
    });

    const first = await executeCachedDbQueryWithMeta(
      "SELECT id, estado FROM pedidos WHERE tenant_id = 1",
      [],
      executor,
      { scopeKey: "t:1:r:admin" }
    );
    expect(first.cacheStatus).toBe("MISS");
    expect(executor).toHaveBeenCalledTimes(1);

    // Mutar el resultado devuelto no debe alterar el valor almacenado en L1
    first.result.rows[0].estado = "CORRUPTO";

    const second = await executeCachedDbQueryWithMeta(
      "SELECT id, estado FROM pedidos WHERE tenant_id = 1",
      [],
      executor,
      { scopeKey: "t:1:r:admin" }
    );
    expect(second.cacheStatus).toBe("HIT-L1");
    expect(executor).toHaveBeenCalledTimes(1);
    expect(second.result.rows[0].estado).toBe("Pendiente");

    // Otro tenant distinto no comparte la entrada de caché
    const otherTenant = await executeCachedDbQueryWithMeta(
      "SELECT id, estado FROM pedidos WHERE tenant_id = 1",
      [],
      executor,
      { scopeKey: "t:2:r:admin" }
    );
    expect(otherTenant.cacheStatus).toBe("MISS");
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("aplica Singleflight (HIT-COALESCED) ante ráfagas paralelas idénticas e invalida al hacer UPDATE", async () => {
    let calls = 0;
    const executor = vi.fn().mockImplementation(async (sql) => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 25));
      if (sql.startsWith("UPDATE")) {
        return { rows: [], rowCount: 1, command: "UPDATE" };
      }
      return { rows: [{ n: calls }], rowCount: 1, command: "SELECT" };
    });

    const sql = "SELECT COUNT(*) AS n FROM pedidos WHERE tenant_id = 1";
    const batch = await Promise.all(
      Array.from({ length: 6 }, () =>
        executeCachedDbQueryWithMeta(sql, [], executor, { scopeKey: "t:1" })
      )
    );

    expect(executor).toHaveBeenCalledTimes(1);
    const statuses = batch.map((b) => b.cacheStatus);
    expect(statuses.filter((s) => s === "MISS")).toHaveLength(1);
    expect(statuses.filter((s) => s === "HIT-COALESCED")).toHaveLength(5);

    // Ahora ejecutamos un UPDATE sobre `pedidos` -> debe invalidar automáticamente
    await executeCachedDbQueryWithMeta(
      "UPDATE pedidos SET avance = 50 WHERE id = 99",
      [],
      executor,
      { scopeKey: "t:1" }
    );

    const afterWrite = await executeCachedDbQueryWithMeta(sql, [], executor, {
      scopeKey: "t:1",
    });
    expect(afterWrite.cacheStatus).toBe("MISS");
    expect(executor).toHaveBeenCalledTimes(3); // 1 SELECT inicial + 1 UPDATE + 1 SELECT fresco
  });

  it("usa Redis L2 cuando está disponible e invalida versiones de tabla en O(1)", async () => {
    const store = new Map();
    const mockRedis = {
      mGet: vi.fn(async (keys) => keys.map((k) => store.get(k) ?? null)),
      get: vi.fn(async (k) => store.get(k) ?? null),
      set: vi.fn(async (k, v) => {
        store.set(k, v);
        return "OK";
      }),
      incr: vi.fn(async (k) => {
        const next = Number(store.get(k) || 0) + 1;
        store.set(k, String(next));
        return next;
      }),
    };
    setNeonCacheRedisClientForTests(mockRedis);

    const executor = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ codigo: "D1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ codigo: "D1" }, { codigo: "D2" }], rowCount: 2 });

    const sql = "SELECT codigo FROM distribuidores WHERE tenant_id = 1 ORDER BY codigo";

    // Primer llamado llena L1 + Redis L2
    const r1 = await executeCachedDbQueryWithMeta(sql, [], executor, { scopeKey: "t:1" });
    expect(r1.cacheStatus).toBe("MISS");
    expect(mockRedis.set).toHaveBeenCalledTimes(1);

    // Simulamos reinicio de proceso (vaciamos L1 pero Redis conserva datos)
    clearNeonQueryCacheL1();

    const r2 = await executeCachedDbQueryWithMeta(sql, [], executor, { scopeKey: "t:1" });
    expect(r2.cacheStatus).toBe("HIT-L2");
    expect(r2.result.rows).toEqual([{ codigo: "D1" }]);
    expect(executor).toHaveBeenCalledTimes(1);

    // Invalidamos `distribuidores` -> incrementa contador de versión en Redis
    await invalidateCachedTables(["distribuidores"]);
    expect(mockRedis.incr).toHaveBeenCalled();

    const r3 = await executeCachedDbQueryWithMeta(sql, [], executor, { scopeKey: "t:1" });
    expect(r3.cacheStatus).toBe("MISS");
    expect(r3.result.rows).toHaveLength(2);

    const stats = getNeonQueryCacheStats();
    expect(stats.l2Hits).toBe(1);
    expect(stats.redisConnected).toBe(true);
  });
});
