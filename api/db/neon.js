import pg from "pg";
import { normalizePgConnectionString } from "./pgSslUrl.js";
import {
  classifySqlForCache,
  executeCachedDbQueryWithMeta,
  invalidateCachedTables,
} from "../services/neonQueryCache.js";

const { Pool } = pg;

const rawConnectionString = process.env.DB_CONNECTION || process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error("Falta DB_CONNECTION o DATABASE_URL en variables de entorno");
}

const connectionString = normalizePgConnectionString(rawConnectionString);
const needsSsl =
  connectionString.includes("neon.tech") ||
  /[?&]sslmode=(require|prefer|verify-ca|verify-full|no-verify)/i.test(connectionString);

export const pool = new Pool({
  connectionString,
  max: Math.max(4, Number(process.env.PG_POOL_MAX) || 12),
  idleTimeoutMillis: Math.max(5000, Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000),
  ...(needsSsl && !/[?&]sslmode=/i.test(connectionString)
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

export { normalizePgConnectionString };

/**
 * Ejecución directa contra el Pool de PostgreSQL sin capa de caché intermedia.
 */
export async function rawQuery(text, params = []) {
  return pool.query(text, params);
}

/**
 * Ejecución estándar con caché híbrida L1 (LRU) + L2 (Redis opcional) + Singleflight
 * e invalidación automática por tabla tras mutaciones.
 */
export async function query(text, params = [], options = {}) {
  const { result, cacheStatus } = await executeCachedDbQueryWithMeta(
    text,
    params,
    (t, p) => pool.query(t, p),
    options
  );
  if (result && typeof result === "object") {
    Object.defineProperty(result, "_cacheStatus", {
      value: cacheStatus,
      enumerable: false,
      configurable: true,
    });
  }
  return result;
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  const mutatedTables = new Set();
  const origQuery = client.query.bind(client);

  const trackedClient = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "query") {
        return async (qText, ...rest) => {
          const sqlStr =
            typeof qText === "string"
              ? qText
              : qText && typeof qText.text === "string"
                ? qText.text
                : "";
          if (sqlStr) {
            const info = classifySqlForCache(sqlStr);
            if (info.isMutation) {
              for (const tbl of info.tables) mutatedTables.add(tbl);
            }
          }
          return origQuery(qText, ...rest);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === "function" ? val.bind(target) : val;
    },
  });

  try {
    await origQuery("BEGIN");
    const result = await fn(trackedClient);
    await origQuery("COMMIT");
    if (mutatedTables.size > 0) {
      await invalidateCachedTables(Array.from(mutatedTables));
    }
    return result;
  } catch (error) {
    await origQuery("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
