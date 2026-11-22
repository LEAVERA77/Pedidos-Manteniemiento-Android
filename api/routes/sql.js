import express from "express";
import { query as dbQuery } from "../db/neon.js";
import { authWithTenantHost } from "../middleware/auth.js";

const router = express.Router();
router.use(authWithTenantHost);

const MAX_SQL_LENGTH = 100_000;

/**
 * Reemplaza comentarios SQL y literales de texto por espacios para inspeccionar
 * la estructura real de la sentencia sin falsos positivos ni bypass por comillas.
 */
export function stripSqlCommentsAndLiterals(rawSql) {
  const s = String(rawSql || "");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const next = s[i + 1];
    // Comentario de línea --
    if (ch === "-" && next === "-") {
      i += 2;
      while (i < s.length && s[i] !== "\n") i++;
      out += " ";
      continue;
    }
    // Comentario de bloque /* ... */
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    // Literal de comilla simple '...' (con escape '')
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
    // Dollar-quoted string ($tag$...$tag$) -> bloquear directamente
    if (ch === "$") {
      const m = s.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        return { stripped: out, hasDollarQuote: true };
      }
    }
    out += ch;
    i++;
  }
  return { stripped: out, hasDollarQuote: false };
}

const FORBIDDEN_STRUCTURAL_PATTERNS = [
  /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|COLUMN|FUNCTION|TRIGGER|ROLE|USER)\b/i,
  /\bTRUNCATE\b/i,
  /\b(GRANT|REVOKE)\b/i,
  /\bCOPY\b/i,
  /\b(CALL|DO|PREPARE|EXECUTE|DEALLOCATE|LISTEN|NOTIFY)\b/i,
  /\bSET\s+(ROLE|SESSION\s+AUTHORIZATION)\b/i,
  /\bALTER\s+(SYSTEM|ROLE|USER|DATABASE|SCHEMA)\b/i,
  /\bCREATE\s+(ROLE|USER|DATABASE|EXTENSION|FUNCTION|TRIGGER)\b/i,
  /\b(pg_shadow|pg_authid|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink)\b/i,
];

const SENSITIVE_CREDENTIAL_COLUMNS_RE = /\b(password_hash|reset_token)\b/i;

/**
 * Valida que la consulta enviada por el cliente autenticado sea una única sentencia permitida.
 * @param {unknown} rawSql
 * @param {string} [userRol]
 * @returns {{ ok: true, normalizedSql: string } | { ok: false, status: number, error: string }}
 */
export function validateClientSqlQuery(rawSql, userRol = "") {
  if (!rawSql || typeof rawSql !== "string") {
    return { ok: false, status: 400, error: "Query no proporcionada o inválida" };
  }
  const trimmed = rawSql.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "Query vacía" };
  }
  if (trimmed.length > MAX_SQL_LENGTH) {
    return { ok: false, status: 413, error: "Query excede el tamaño máximo permitido" };
  }

  const { stripped, hasDollarQuote } = stripSqlCommentsAndLiterals(trimmed);
  if (hasDollarQuote) {
    return { ok: false, status: 403, error: "Bloques dollar-quoted no permitidos" };
  }

  const cleanNoTrailingSemi = stripped.trim().replace(/;+\s*$/, "").trim();
  if (!cleanNoTrailingSemi) {
    return { ok: false, status: 400, error: "Query vacía" };
  }
  if (cleanNoTrailingSemi.includes(";")) {
    return { ok: false, status: 403, error: "Multi-statement SQL no permitido" };
  }

  for (const pat of FORBIDDEN_STRUCTURAL_PATTERNS) {
    if (pat.test(cleanNoTrailingSemi)) {
      return { ok: false, status: 403, error: "Operación o columna sensible no permitida por SQL cliente" };
    }
  }

  const firstToken = (cleanNoTrailingSemi.split(/\s+/)[0] || "").toUpperCase();
  const isAdmin =
    String(userRol || "").trim().toLowerCase() === "admin" ||
    String(userRol || "").trim().toLowerCase() === "administrador";

  if (firstToken !== "ALTER" && SENSITIVE_CREDENTIAL_COLUMNS_RE.test(cleanNoTrailingSemi)) {
    return {
      ok: false,
      status: 403,
      error: "Operación o columna sensible de credenciales no permitida por SQL cliente",
    };
  }

  if (firstToken === "SELECT" || firstToken === "WITH" || firstToken === "INSERT") {
    return { ok: true, normalizedSql: trimmed.replace(/;+\s*$/, "") };
  }

  if (firstToken === "UPDATE" || firstToken === "DELETE") {
    if (!/\bWHERE\b/i.test(cleanNoTrailingSemi)) {
      return { ok: false, status: 403, error: `${firstToken} sin cláusula WHERE no permitido` };
    }
    if (/\bWHERE\s+(1\s*=\s*1|TRUE)\s*$/i.test(cleanNoTrailingSemi)) {
      return { ok: false, status: 403, error: `${firstToken} masivo sin filtro real no permitido` };
    }
    return { ok: true, normalizedSql: trimmed.replace(/;+\s*$/, "") };
  }

  if (firstToken === "CREATE" || firstToken === "ALTER") {
    if (!isAdmin) {
      return { ok: false, status: 403, error: "DDL reservado exclusivamente a administradores" };
    }
    const isSafeCreate = /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+[A-Za-z0-9_]+/i.test(
      cleanNoTrailingSemi
    );
    const isSafeAlterAdd =
      /^ALTER\s+TABLE\s+[A-Za-z0-9_]+\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+[A-Za-z0-9_]+/i.test(
        cleanNoTrailingSemi
      );
    const isSafeAlterDropNotNull =
      /^ALTER\s+TABLE\s+pedidos\s+ALTER\s+COLUMN\s+distribuidor\s+DROP\s+NOT\s+NULL$/i.test(
        cleanNoTrailingSemi
      );
    if (!isSafeCreate && !isSafeAlterAdd && !isSafeAlterDropNotNull) {
      return { ok: false, status: 403, error: "Sentencia DDL no permitida desde cliente" };
    }
    return { ok: true, normalizedSql: trimmed.replace(/;+\s*$/, "") };
  }

  return { ok: false, status: 403, error: `Operación SQL no permitida: ${firstToken}` };
}

router.post("/query", async (req, res) => {
  const check = validateClientSqlQuery(req.body?.query, req.user?.rol);
  if (!check.ok) {
    return res.status(check.status).json({ error: check.error });
  }

  const startTime = Date.now();
  const scopeKey = `t:${req.tenantId ?? 0}:r:${String(req.user?.rol || "").toLowerCase()}`;
  const bypassCache = Boolean(req.body?.noCache);

  try {
    const result = await dbQuery(check.normalizedSql, [], { scopeKey, bypassCache });
    const cacheStatus = result?._cacheStatus || "BYPASS";
    res.set("X-Neon-Cache", cacheStatus);
    return res.json({
      rows: result.rows || [],
      rowCount: result.rowCount ?? (result.rows ? result.rows.length : 0),
      command: result.command || null,
      fields: Array.isArray(result.fields) ? result.fields.map((f) => ({ name: f.name })) : [],
      cache: cacheStatus,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error al ejecutar consulta",
      details: error.message,
    });
  }
});

router.post("/location", async (req, res) => {
  const check = validateClientSqlQuery(req.body?.query, req.user?.rol);
  if (!check.ok) {
    return res.status(check.status).json({ error: check.error });
  }
  const { stripped } = stripSqlCommentsAndLiterals(check.normalizedSql);
  if (!/\bubicaciones_usuarios\b/i.test(stripped)) {
    return res.status(403).json({ error: "Operación solo permitida sobre ubicaciones_usuarios" });
  }
  const scopeKey = `t:${req.tenantId ?? 0}:loc`;
  try {
    const result = await dbQuery(check.normalizedSql, [], {
      scopeKey,
      bypassCache: Boolean(req.body?.noCache),
    });
    const cacheStatus = result?._cacheStatus || "BYPASS";
    res.set("X-Neon-Cache", cacheStatus);
    return res.json({
      rows: result.rows || [],
      rowCount: result.rowCount ?? 0,
      cache: cacheStatus,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error en consulta de ubicación",
      details: error.message,
    });
  }
});

export default router;
