/**
 * Capa de caché híbrida L1 (LRU en memoria) + L2 (Redis opcional vía REDIS_URL)
 * con Singleflight (coalescing de consultas concurrentes) e invalidación automática
 * por tabla ante mutaciones (INSERT / UPDATE / DELETE / DDL / transacciones).
 *
 * Objetivo: reducir drásticamente el consumo de `network transfer` hacia Neon PostgreSQL
 * sin sacrificar consistencia tras escrituras ni aislamiento multitenant.
 *
 * made by leavera77
 */

import crypto from "node:crypto";
import { createClient as createRedisClient } from "redis";

const DEFAULT_MAX_L1_ENTRIES = Math.max(50, Number(process.env.NEON_CACHE_MAX_ENTRIES) || 600);
const DEFAULT_MAX_L1_BYTES = Math.max(
  2 * 1024 * 1024,
  (Number(process.env.NEON_CACHE_MAX_MB) || 32) * 1024 * 1024
);
const MAX_SINGLE_ENTRY_BYTES = Math.max(
  128 * 1024,
  (Number(process.env.NEON_CACHE_MAX_ITEM_KB) || 2048) * 1024
);

const REDIS_KEY_PREFIX = process.env.NEON_CACHE_REDIS_PREFIX || "gn:neonq:v1:";

const SCHEMA_TTL_SEC = Math.max(60, Number(process.env.NEON_CACHE_TTL_SCHEMA_SEC) || 1800);
const GEO_STATIC_TTL_SEC = Math.max(60, Number(process.env.NEON_CACHE_TTL_GEO_SEC) || 900);
const CATALOG_TTL_SEC = Math.max(30, Number(process.env.NEON_CACHE_TTL_CATALOG_SEC) || 300);
const USERS_TTL_SEC = Math.max(5, Number(process.env.NEON_CACHE_TTL_USERS_SEC) || 20);
const OPERATIONAL_TTL_SEC = Math.max(3, Number(process.env.NEON_CACHE_TTL_OPERATIONAL_SEC) || 10);
const DEFAULT_SELECT_TTL_SEC = Math.max(5, Number(process.env.NEON_CACHE_TTL_DEFAULT_SEC) || 15);

const GEO_STATIC_TABLES = new Set([
  "localidades_argentinas",
  "codigos_area_argentina",
  "calles_normalizadas",
  "calles_geometrias",
  "correcciones_direcciones",
]);

const CATALOG_TABLES = new Set([
  "clientes",
  "configuracion",
  "tipos_reclamo",
  "distribuidores",
  "subestaciones_catalogo",
  "socios_catalogo",
  "tenant_localidades",
  "app_update_config",
]);

const OPERATIONAL_TABLES = new Set([
  "pedidos",
  "incidencias",
  "notificaciones_movil",
  "whatsapp_notificaciones",
  "operacion_audit_log",
  "kpi_snapshots",
  "geocod_wa_operaciones",
  "ubicaciones_usuarios",
  "clientes_finales",
  "pedido_contador",
]);

const NEVER_CACHE_TABLES = new Set([
  "admin_login_otp",
  "baileys_auth_state",
  "baileys_media_cache",
]);

const VOLATILE_OR_SENSITIVE_RE =
  /\b(NEXTVAL|SETVAL|CURRVAL|RANDOM\s*\(|GEN_RANDOM_UUID\s*\(|PG_SLEEP|TXID_CURRENT|PG_CURRENT_XACT_ID|FOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)|RETURNING|password_hash|reset_token|admin_login_otp|baileys_auth_state)\b/i;

const WRITE_INSIDE_CTE_RE = /\b(INSERT\s+INTO|UPDATE\s+[A-Za-z0-9_."]+|DELETE\s+FROM)\b/i;

/** @type {Map<string, { payloadJson: string, byteLength: number, expiresAt: number, tables: string[] }>} */
const l1Map = new Map();
/** @type {Map<string, Set<string>>} */
const tableToL1Keys = new Map();
/** @type {Map<string, number>} */
const localTableVersions = new Map();
/** @type {Map<string, Promise<{ result: any, source: string }>>} */
const inFlightQueries = new Map();

let l1TotalBytes = 0;

const stats = {
  l1Hits: 0,
  l2Hits: 0,
  coalescedHits: 0,
  misses: 0,
  bypasses: 0,
  invalidations: 0,
  redisErrors: 0,
  estimatedBytesSaved: 0,
};

let redisClient = null;
let redisReady = false;
let redisInitAttempted = false;
let injectedTestRedis = null;

function isCacheEnabled() {
  if (process.env.NEON_QUERY_CACHE_ENABLED === "false" || process.env.NEON_QUERY_CACHE_ENABLED === "0") {
    return false;
  }
  if (process.env.VITEST && process.env.NEON_QUERY_CACHE_ENABLE_IN_TESTS !== "1") {
    return false;
  }
  return true;
}

function resolveRedisUrl() {
  return String(
    process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || process.env.KV_URL || ""
  ).trim();
}

async function getActiveRedis() {
  if (injectedTestRedis) return injectedTestRedis;
  const url = resolveRedisUrl();
  if (!url) return null;
  if (redisReady && redisClient) return redisClient;
  if (redisInitAttempted) return null;

  redisInitAttempted = true;
  try {
    const client = createRedisClient({
      url,
      socket: {
        connectTimeout: 4000,
        reconnectStrategy: (retries) => {
          if (retries > 6) return new Error("Redis max reconnect attempts reached");
          return Math.min(retries * 400, 3000);
        },
      },
    });
    client.on("error", () => {
      stats.redisErrors += 1;
      redisReady = false;
    });
    client.on("ready", () => {
      redisReady = true;
    });
    await client.connect();
    redisClient = client;
    redisReady = true;
    return redisClient;
  } catch (_) {
    stats.redisErrors += 1;
    redisReady = false;
    return null;
  }
}

/**
 * Elimina comentarios y literales simples para analizar verbos y tablas SQL de forma segura.
 */
export function stripSqlLiteralsForCache(rawSql) {
  const s = String(rawSql || "");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const next = s[i + 1];
    if (ch === "-" && next === "-") {
      i += 2;
      while (i < s.length && s[i] !== "\n") i++;
      out += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    if (ch === "'") {
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (s[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      out += " '' ";
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/\s+/g, " ").trim();
}

function cleanIdentifier(ident) {
  const raw = String(ident || "")
    .replace(/"/g, "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("information_schema.") || raw.startsWith("pg_catalog.")) {
    return "__schema__";
  }
  const parts = raw.split(".");
  return parts[parts.length - 1] || "";
}

/**
 * Extrae las tablas leídas o mutadas de una sentencia SQL limpia (sin literales).
 */
export function extractSqlTables(strippedSql) {
  const tables = new Set();
  if (/\b(information_schema|pg_catalog|pg_tables|pg_class|pg_attribute|to_regclass)\b/i.test(strippedSql)) {
    tables.add("__schema__");
  }

  const patterns = [
    /\bFROM\s+([A-Za-z0-9_."]+)/gi,
    /\bJOIN\s+([A-Za-z0-9_."]+)/gi,
    /\bINSERT\s+INTO\s+([A-Za-z0-9_."]+)/gi,
    /\bUPDATE\s+([A-Za-z0-9_."]+)/gi,
    /\bDELETE\s+FROM\s+([A-Za-z0-9_."]+)/gi,
    /\bTRUNCATE(?:\s+TABLE)?\s+([A-Za-z0-9_."]+)/gi,
    /\bALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+([A-Za-z0-9_."]+)/gi,
    /\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([A-Za-z0-9_."]+)/gi,
  ];

  const sqlStopwords = new Set([
    "select",
    "unnest",
    "jsonb_array_elements",
    "json_array_elements",
    "jsonb_each",
    "lateral",
    "only",
    "values",
    "generate_series",
  ]);

  for (const re of patterns) {
    let m;
    while ((m = re.exec(strippedSql)) !== null) {
      const tbl = cleanIdentifier(m[1]);
      if (tbl && !sqlStopwords.has(tbl) && !tbl.startsWith("(")) {
        tables.add(tbl);
      }
    }
  }
  return Array.from(tables).sort();
}

/**
 * Clasifica si una consulta es cacheable y calcula su TTL óptimo según las tablas involucradas.
 */
export function classifySqlForCache(rawSql) {
  const stripped = stripSqlLiteralsForCache(rawSql);
  if (!stripped) {
    return { cacheable: false, isMutation: false, tables: [], ttlSec: 0 };
  }

  const firstVerb = (stripped.split(" ")[0] || "").toUpperCase();
  const tables = extractSqlTables(stripped);

  const isDdl = firstVerb === "ALTER" || firstVerb === "CREATE" || firstVerb === "DROP" || firstVerb === "TRUNCATE";
  if (isDdl) {
    const mutated = tables.includes("__schema__") ? tables : [...tables, "__schema__"];
    return { cacheable: false, isMutation: true, tables: mutated, ttlSec: 0 };
  }

  if (firstVerb === "INSERT" || firstVerb === "UPDATE" || firstVerb === "DELETE") {
    return { cacheable: false, isMutation: true, tables, ttlSec: 0 };
  }

  if (firstVerb === "WITH" && WRITE_INSIDE_CTE_RE.test(stripped)) {
    return { cacheable: false, isMutation: true, tables, ttlSec: 0 };
  }

  if (firstVerb !== "SELECT" && firstVerb !== "WITH") {
    return { cacheable: false, isMutation: false, tables, ttlSec: 0 };
  }

  if (/^SELECT\s+1(\s+AS\s+[A-Za-z0-9_]+)?\s*;?$/i.test(stripped)) {
    return { cacheable: false, isMutation: false, tables: [], ttlSec: 0 };
  }

  if (VOLATILE_OR_SENSITIVE_RE.test(stripped)) {
    return { cacheable: false, isMutation: false, tables, ttlSec: 0 };
  }

  for (const t of tables) {
    if (NEVER_CACHE_TABLES.has(t)) {
      return { cacheable: false, isMutation: false, tables, ttlSec: 0 };
    }
  }

  // Calcular el TTL mínimo entre todas las tablas consultadas (la más volátil manda)
  if (tables.length === 0) {
    return { cacheable: true, isMutation: false, tables: ["__misc__"], ttlSec: DEFAULT_SELECT_TTL_SEC };
  }

  let ttlSec = Infinity;
  for (const t of tables) {
    if (t === "__schema__") {
      ttlSec = Math.min(ttlSec, SCHEMA_TTL_SEC);
    } else if (OPERATIONAL_TABLES.has(t)) {
      ttlSec = Math.min(ttlSec, OPERATIONAL_TTL_SEC);
    } else if (t === "usuarios") {
      ttlSec = Math.min(ttlSec, USERS_TTL_SEC);
    } else if (CATALOG_TABLES.has(t)) {
      ttlSec = Math.min(ttlSec, CATALOG_TTL_SEC);
    } else if (GEO_STATIC_TABLES.has(t)) {
      ttlSec = Math.min(ttlSec, GEO_STATIC_TTL_SEC);
    } else {
      ttlSec = Math.min(ttlSec, DEFAULT_SELECT_TTL_SEC);
    }
  }

  return {
    cacheable: true,
    isMutation: false,
    tables,
    ttlSec: Number.isFinite(ttlSec) ? ttlSec : DEFAULT_SELECT_TTL_SEC,
  };
}

function evictOneFromL1(key) {
  const existing = l1Map.get(key);
  if (!existing) return;
  l1Map.delete(key);
  l1TotalBytes = Math.max(0, l1TotalBytes - existing.byteLength);
  for (const t of existing.tables) {
    const s = tableToL1Keys.get(t);
    if (s) {
      s.delete(key);
      if (s.size === 0) tableToL1Keys.delete(t);
    }
  }
}

function putInL1(key, payloadJson, tables, ttlSec) {
  const byteLength = Buffer.byteLength(payloadJson, "utf8");
  if (byteLength > MAX_SINGLE_ENTRY_BYTES) return;

  if (l1Map.has(key)) {
    evictOneFromL1(key);
  }
  while (
    l1Map.size >= DEFAULT_MAX_L1_ENTRIES ||
    (l1TotalBytes + byteLength > DEFAULT_MAX_L1_BYTES && l1Map.size > 0)
  ) {
    const oldestKey = l1Map.keys().next().value;
    if (!oldestKey) break;
    evictOneFromL1(oldestKey);
  }

  l1Map.set(key, {
    payloadJson,
    byteLength,
    expiresAt: Date.now() + ttlSec * 1000,
    tables,
  });
  l1TotalBytes += byteLength;

  for (const t of tables) {
    let setForTable = tableToL1Keys.get(t);
    if (!setForTable) {
      setForTable = new Set();
      tableToL1Keys.set(t, setForTable);
    }
    setForTable.add(key);
  }
}

function getFromL1(key) {
  const entry = l1Map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    evictOneFromL1(key);
    return null;
  }
  // Promover posición LRU
  l1Map.delete(key);
  l1Map.set(key, entry);
  return entry;
}

async function resolveVersionStamp(tables, redis) {
  if (!tables.length) return "0";
  if (redis) {
    try {
      const verKeys = tables.map((t) => `${REDIS_KEY_PREFIX}ver:${t}`);
      const vals = await redis.mGet(verKeys);
      return tables
        .map((t, idx) => `${t}=${vals?.[idx] ?? localTableVersions.get(t) ?? 0}`)
        .join(",");
    } catch (_) {
      stats.redisErrors += 1;
    }
  }
  return tables.map((t) => `${t}=${localTableVersions.get(t) ?? 0}`).join(",");
}

function buildCacheKey(normalizedSql, params, scopeKey, versionStamp) {
  const h = crypto
    .createHash("sha256")
    .update(scopeKey || "")
    .update("\0")
    .update(versionStamp)
    .update("\0")
    .update(normalizedSql)
    .update("\0")
    .update(JSON.stringify(params || []))
    .digest("hex")
    .slice(0, 40);
  return `${REDIS_KEY_PREFIX}q:${h}`;
}

function serializePgResult(res) {
  return JSON.stringify({
    rows: Array.isArray(res?.rows) ? res.rows : [],
    rowCount: res?.rowCount ?? (Array.isArray(res?.rows) ? res.rows.length : 0),
    command: res?.command || "SELECT",
    fields: Array.isArray(res?.fields) ? res.fields.map((f) => ({ name: f.name })) : [],
  });
}

function deserializePgResult(payloadJson) {
  const parsed = JSON.parse(payloadJson);
  return {
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    rowCount: parsed.rowCount ?? 0,
    command: parsed.command || "SELECT",
    fields: Array.isArray(parsed.fields) ? parsed.fields : [],
  };
}

/**
 * Invalida inmediatamente todas las entradas asociadas a las tablas indicadas en L1 y L2 (Redis).
 */
export async function invalidateCachedTables(tables) {
  const list = Array.from(new Set((tables || []).filter(Boolean)));
  if (!list.length) return;
  stats.invalidations += 1;

  for (const t of list) {
    localTableVersions.set(t, (localTableVersions.get(t) || 0) + 1);
    const keys = tableToL1Keys.get(t);
    if (keys) {
      for (const k of Array.from(keys)) {
        evictOneFromL1(k);
      }
    }
  }

  const redis = await getActiveRedis();
  if (redis) {
    try {
      await Promise.all(list.map((t) => redis.incr(`${REDIS_KEY_PREFIX}ver:${t}`)));
    } catch (_) {
      stats.redisErrors += 1;
    }
  }
}

/**
 * Ejecuta una consulta SQL pasando por caché L1 + L2 (Redis) + Singleflight si es un SELECT seguro,
 * o invalida automáticamente las tablas afectadas si es una escritura/DDL.
 *
 * @param {string} sqlText
 * @param {any[]} params
 * @param {(sql: string, params: any[]) => Promise<any>} executor
 * @param {{ scopeKey?: string, bypassCache?: boolean }} [options]
 * @returns {Promise<{ result: any, cacheStatus: 'HIT-L1' | 'HIT-L2' | 'HIT-COALESCED' | 'MISS' | 'BYPASS' }>}
 */
export async function executeCachedDbQueryWithMeta(sqlText, params, executor, options = {}) {
  const text = String(sqlText || "");
  if (!isCacheEnabled()) {
    const result = await executor(text, params);
    return { result, cacheStatus: "BYPASS" };
  }

  const info = classifySqlForCache(text);
  if (info.isMutation) {
    const result = await executor(text, params);
    if (info.tables.length > 0) {
      await invalidateCachedTables(info.tables);
    }
    stats.bypasses += 1;
    return { result, cacheStatus: "BYPASS" };
  }

  if (!info.cacheable || options.bypassCache) {
    stats.bypasses += 1;
    const result = await executor(text, params);
    return { result, cacheStatus: "BYPASS" };
  }

  const normalizedSql = text.trim().replace(/\s+/g, " ");
  const redis = await getActiveRedis();
  const versionStamp = await resolveVersionStamp(info.tables, redis);
  const key = buildCacheKey(normalizedSql, params, options.scopeKey || "", versionStamp);

  // 1. L1 Memory LRU
  const l1Hit = getFromL1(key);
  if (l1Hit) {
    stats.l1Hits += 1;
    stats.estimatedBytesSaved += l1Hit.byteLength;
    return { result: deserializePgResult(l1Hit.payloadJson), cacheStatus: "HIT-L1" };
  }

  // 2. L2 Redis
  if (redis) {
    try {
      const l2Json = await redis.get(key);
      if (l2Json) {
        const byteLen = Buffer.byteLength(l2Json, "utf8");
        putInL1(key, l2Json, info.tables, info.ttlSec);
        stats.l2Hits += 1;
        stats.estimatedBytesSaved += byteLen;
        return { result: deserializePgResult(l2Json), cacheStatus: "HIT-L2" };
      }
    } catch (_) {
      stats.redisErrors += 1;
    }
  }

  // 3. Singleflight Coalescing (evita estampidas concurrentes hacia Neon)
  const existingFlight = inFlightQueries.get(key);
  if (existingFlight) {
    const payloadJson = await existingFlight;
    stats.coalescedHits += 1;
    stats.estimatedBytesSaved += Buffer.byteLength(payloadJson, "utf8");
    return { result: deserializePgResult(payloadJson), cacheStatus: "HIT-COALESCED" };
  }

  const flightPromise = (async () => {
    const freshResult = await executor(text, params);
    const payloadJson = serializePgResult(freshResult);
    const byteLen = Buffer.byteLength(payloadJson, "utf8");

    if (byteLen <= MAX_SINGLE_ENTRY_BYTES) {
      putInL1(key, payloadJson, info.tables, info.ttlSec);
      if (redis) {
        try {
          await redis.set(key, payloadJson, { EX: info.ttlSec });
        } catch (_) {
          stats.redisErrors += 1;
        }
      }
    }
    return payloadJson;
  })();

  inFlightQueries.set(key, flightPromise);
  try {
    const payloadJson = await flightPromise;
    stats.misses += 1;
    return { result: deserializePgResult(payloadJson), cacheStatus: "MISS" };
  } finally {
    inFlightQueries.delete(key);
  }
}

export async function executeCachedDbQuery(sqlText, params, executor, options = {}) {
  const { result } = await executeCachedDbQueryWithMeta(sqlText, params, executor, options);
  return result;
}

export function clearNeonQueryCacheL1() {
  l1Map.clear();
  tableToL1Keys.clear();
  localTableVersions.clear();
  inFlightQueries.clear();
  l1TotalBytes = 0;
}

export function resetNeonQueryCacheStats() {
  stats.l1Hits = 0;
  stats.l2Hits = 0;
  stats.coalescedHits = 0;
  stats.misses = 0;
  stats.bypasses = 0;
  stats.invalidations = 0;
  stats.redisErrors = 0;
  stats.estimatedBytesSaved = 0;
}

export function setNeonCacheRedisClientForTests(mockClient) {
  injectedTestRedis = mockClient || null;
}

export function getNeonQueryCacheStats() {
  const totalLookups = stats.l1Hits + stats.l2Hits + stats.coalescedHits + stats.misses;
  const hitCount = stats.l1Hits + stats.l2Hits + stats.coalescedHits;
  return {
    enabled: isCacheEnabled(),
    redisConfigured: Boolean(resolveRedisUrl() || injectedTestRedis),
    redisConnected: Boolean(injectedTestRedis || (redisClient && redisReady)),
    entriesL1: l1Map.size,
    bytesL1: l1TotalBytes,
    maxEntriesL1: DEFAULT_MAX_L1_ENTRIES,
    maxBytesL1: DEFAULT_MAX_L1_BYTES,
    hitRatePct: totalLookups > 0 ? Number(((hitCount / totalLookups) * 100).toFixed(2)) : 0,
    ...stats,
  };
}
