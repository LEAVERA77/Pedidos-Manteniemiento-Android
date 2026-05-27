/**
 * GET /api/pedidos/buscar-global — ILIKE + Levenshtein + Groq opcional.
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";
import { interpretarBusquedaPedidosGroq } from "./groqBusquedaPedidos.js";
import {
  rankearPedidosBusquedaGlobal,
  tokensBusquedaGlobal,
  normalizarTextoFuzzy,
} from "./pedidosBuscarGlobalFuzzy.js";

const SELECT_COLS = `id, numero_pedido, estado, nis, medidor, cliente_nombre, cliente_direccion,
              telefono_contacto, fecha_creacion, lat, lng`;

function escLike(q) {
  return `%${String(q || "").replace(/[%_\\]/g, "")}%`;
}

/**
 * @param {import('express').Request} req
 * @param {string[]} terminos
 * @param {number} sqlLimit
 */
async function sqlBuscarPorTerminos(req, terminos, sqlLimit) {
  const params = [];
  const hasTb = await pedidosTableHasTenantIdColumn();
  let tsql = "";
  if (hasTb) {
    params.push(req.tenantId);
    tsql = ` AND tenant_id = $${params.length}`;
  }
  const bt = await pushPedidoBusinessFilter(req, params);

  const orParts = [];
  for (const term of terminos) {
    const like = escLike(term);
    params.push(like);
    const p = `$${params.length}`;
    orParts.push(
      `cliente_nombre ILIKE ${p}`,
      `COALESCE(cliente, '') ILIKE ${p}`,
      `cliente_direccion ILIKE ${p}`,
      `COALESCE(nis::text, '') ILIKE ${p}`,
      `COALESCE(medidor::text, '') ILIKE ${p}`,
      `COALESCE(nis_medidor::text, '') ILIKE ${p}`,
      `COALESCE(telefono_contacto::text, '') ILIKE ${p}`,
      `COALESCE(numero_pedido::text, '') ILIKE ${p}`
    );
  }
  const qJoin = terminos.join(" ");
  if (/^\d+$/.test(qJoin)) {
    params.push(Number(qJoin));
    orParts.push(`id = $${params.length}`);
  }

  if (!orParts.length) return [];

  const r = await query(
    `SELECT ${SELECT_COLS}
       FROM pedidos
       WHERE (${orParts.join(" OR ")})${tsql}${bt}
       ORDER BY fecha_creacion DESC
       LIMIT ${Math.min(sqlLimit, 120)}`,
    params
  );
  return r.rows || [];
}

/**
 * @param {import('express').Request} req
 * @param {number} poolLimit
 */
async function sqlPoolRecienteParaFuzzy(req, poolLimit) {
  const params = [];
  const hasTb = await pedidosTableHasTenantIdColumn();
  let tsql = "";
  if (hasTb) {
    params.push(req.tenantId);
    tsql = ` AND tenant_id = $${params.length}`;
  }
  const bt = await pushPedidoBusinessFilter(req, params);
  const r = await query(
    `SELECT ${SELECT_COLS}
       FROM pedidos
       WHERE 1=1${tsql}${bt}
       ORDER BY fecha_creacion DESC
       LIMIT ${Math.min(poolLimit, 500)}`,
    params
  );
  return r.rows || [];
}

function dedupePorId(rows) {
  const m = new Map();
  for (const row of rows || []) {
    if (row?.id != null) m.set(row.id, row);
  }
  return [...m.values()];
}

/**
 * @param {import('express').Request} req
 * @param {{ q: string, limit: number }} opts
 */
export async function ejecutarBuscarPedidosGlobal(req, { q, limit }) {
  const terminosIniciales = tokensBusquedaGlobal(q);
  const terminosSet = new Set(terminosIniciales);
  terminosSet.add(normalizarTextoFuzzy(q));
  if (q.length >= 2) terminosSet.add(q.trim().toLowerCase());

  let sugerenciaIa = null;
  let modo = "ilike+levenshtein";

  let candidatos = await sqlBuscarPorTerminos(req, [...terminosSet].filter(Boolean), 90);
  let rankeados = rankearPedidosBusquedaGlobal(q, candidatos);

  if (rankeados.length < Math.min(limit, 5)) {
    const pool = await sqlPoolRecienteParaFuzzy(req, 450);
    candidatos = dedupePorId([...candidatos, ...pool]);
    rankeados = rankearPedidosBusquedaGlobal(q, candidatos);
    if (rankeados.length > candidatos.length) modo = "pool+levenshtein";
  }

  const usarGroq =
    rankeados.length < 3 &&
    (String(q).includes(" ") || String(q).length >= 10);
  if (usarGroq) {
    const groq = await interpretarBusquedaPedidosGroq(q);
    if (groq.ok) {
      if (groq.hint) sugerenciaIa = groq.hint;
      for (const t of groq.terminos || []) terminosSet.add(normalizarTextoFuzzy(t));
      if (groq.telefono) terminosSet.add(normalizarTextoFuzzy(groq.telefono));
      if (groq.nis) terminosSet.add(normalizarTextoFuzzy(groq.nis));
      if (groq.medidor) terminosSet.add(normalizarTextoFuzzy(groq.medidor));
      const extra = await sqlBuscarPorTerminos(req, [...terminosSet].filter((t) => t.length >= 2), 90);
      candidatos = dedupePorId([...candidatos, ...extra]);
      rankeados = rankearPedidosBusquedaGlobal(q, candidatos);
      if (groq.terminos?.length) modo = "groq+levenshtein";
    }
  }

  return {
    resultados: rankeados.slice(0, limit),
    q,
    sugerencia_ia: sugerenciaIa,
    modo,
  };
}
