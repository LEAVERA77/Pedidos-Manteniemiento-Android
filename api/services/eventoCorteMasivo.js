/**
 * Evento de corte masivo: reclamos abiertos por transformador o distribuidor.
 * made by leavera77
 */
import { query, withTransaction } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn, tableHasColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";
import { sociosCatalogoWhereForApi } from "../utils/sociosCatalogScope.js";

const ESTADOS_ABIERTOS = ["Pendiente", "Asignado", "En ejecución"];

function normKey(s) {
  return String(s || "")
    .trim()
    .toUpperCase();
}

async function tableExists(name) {
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [name]
    );
    return r.rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function incidenciasDisponibles() {
  return (await tableExists("incidencias")) && (await tableHasColumn("pedidos", "incidencia_id"));
}

/**
 * @param {import('express').Request} req
 */
export async function listarCatalogosEventoCorte(req) {
  const tid = req.tenantId;
  const transformadores = [];
  const distribuidores = [];

  try {
    const { where, params } = await sociosCatalogoWhereForApi(req);
    if (where) {
      const r = await query(
        `SELECT TRIM(transformador) AS valor, COUNT(*)::int AS socios
         FROM socios_catalogo${where}
           AND TRIM(COALESCE(transformador::text, '')) <> ''
         GROUP BY TRIM(transformador)
         ORDER BY TRIM(transformador) ASC
         LIMIT 2500`,
        params
      );
      for (const row of r.rows) {
        const v = String(row.valor || "").trim();
        if (!v) continue;
        transformadores.push({ valor: v, socios: Number(row.socios) || 0, origen: "socios" });
      }
    }
  } catch (_) {}

  const hasT = await pedidosTableHasTenantIdColumn();
  const pParams = hasT ? [tid] : [];
  const bt = await pushPedidoBusinessFilter(req, pParams);
  const pWhere = hasT
    ? `WHERE tenant_id = $1 AND TRIM(COALESCE(trafo::text, '')) <> ''${bt}`
    : `WHERE TRIM(COALESCE(trafo::text, '')) <> ''${bt}`;
  try {
    const pr = await query(
      `SELECT DISTINCT TRIM(trafo) AS valor FROM pedidos ${pWhere} ORDER BY 1 LIMIT 800`,
      pParams
    );
    const seen = new Set(transformadores.map((x) => normKey(x.valor)));
    for (const row of pr.rows) {
      const v = String(row.valor || "").trim();
      if (!v || seen.has(normKey(v))) continue;
      seen.add(normKey(v));
      transformadores.push({ valor: v, socios: null, origen: "pedidos" });
    }
  } catch (_) {}

  transformadores.sort((a, b) => a.valor.localeCompare(b.valor, "es"));

  if (await tableExists("distribuidores_red")) {
    try {
      const dr = await query(
        `SELECT codigo, nombre, trafos, clientes
         FROM distribuidores_red WHERE tenant_id = $1 ORDER BY codigo`,
        [tid]
      );
      for (const row of dr.rows) {
        distribuidores.push({
          codigo: String(row.codigo || "").trim(),
          nombre: String(row.nombre || "").trim(),
          trafos: row.trafos ?? null,
          clientes: row.clientes ?? null,
        });
      }
    } catch (_) {}
  }

  if (!distribuidores.length) {
    try {
      const pr = await query(
        hasT
          ? `SELECT DISTINCT TRIM(distribuidor) AS codigo FROM pedidos
             WHERE tenant_id = $1 AND TRIM(COALESCE(distribuidor::text, '')) <> ''${bt}
             ORDER BY 1 LIMIT 400`
          : `SELECT DISTINCT TRIM(distribuidor) AS codigo FROM pedidos
             WHERE TRIM(COALESCE(distribuidor::text, '')) <> ''${bt}
             ORDER BY 1 LIMIT 400`,
        pParams
      );
      for (const row of pr.rows) {
        const c = String(row.codigo || "").trim();
        if (c) distribuidores.push({ codigo: c, nombre: "", trafos: null, clientes: null });
      }
    } catch (_) {}
  }

  return { transformadores, distribuidores };
}

/**
 * Coincidencia pedido ↔ socio por NIS / medidor / nis_medidor.
 */
function sqlMatchPedidoSocio(pAlias, scAlias) {
  return `(
    (NULLIF(TRIM(${pAlias}.nis_medidor::text), '') IS NOT NULL
      AND UPPER(TRIM(${scAlias}.nis_medidor::text)) = UPPER(TRIM(${pAlias}.nis_medidor::text)))
    OR (NULLIF(TRIM(${pAlias}.nis::text), '') IS NOT NULL
      AND NULLIF(TRIM(${pAlias}.medidor::text), '') IS NOT NULL
      AND UPPER(TRIM(${scAlias}.nis::text)) = UPPER(TRIM(${pAlias}.nis::text))
      AND UPPER(TRIM(${scAlias}.medidor::text)) = UPPER(TRIM(${pAlias}.medidor::text)))
    OR (NULLIF(TRIM(${pAlias}.nis::text), '') IS NOT NULL
      AND UPPER(TRIM(${scAlias}.nis::text)) = UPPER(TRIM(${pAlias}.nis::text))
      AND (NULLIF(TRIM(${pAlias}.medidor::text), '') IS NULL OR TRIM(${pAlias}.medidor::text) = ''))
    OR (NULLIF(TRIM(${pAlias}.medidor::text), '') IS NOT NULL
      AND UPPER(TRIM(${scAlias}.medidor::text)) = UPPER(TRIM(${pAlias}.medidor::text))
      AND (NULLIF(TRIM(${pAlias}.nis::text), '') IS NULL OR TRIM(${pAlias}.nis::text) = ''))
  )`;
}

/**
 * @param {import('express').Request} req
 * @param {{ tipo: string, valor: string, solo_sin_incidencia?: boolean }} opts
 */
export async function buscarPedidosEventoCorte(req, opts) {
  const tipo = String(opts?.tipo || "").trim().toLowerCase();
  const valor = String(opts?.valor || "").trim();
  const soloSinInc = opts?.solo_sin_incidencia !== false;
  if (!["transformador", "distribuidor"].includes(tipo)) {
    return { ok: false, status: 400, error: "tipo debe ser transformador o distribuidor" };
  }
  if (!valor) return { ok: false, status: 400, error: "valor es obligatorio" };

  const hasT = await pedidosTableHasTenantIdColumn();
  const params = hasT ? [req.tenantId] : [];
  const estadoStart = params.length + 1;
  params.push(...ESTADOS_ABIERTOS);
  const estadosPlaceholders = ESTADOS_ABIERTOS.map((_, i) => `$${estadoStart + i}`).join(", ");
  const valorIdx = params.length + 1;
  params.push(valor);
  const bt = await pushPedidoBusinessFilter(req, params);
  const valorNorm = normKey(valor);

  let matchSql = "";
  if (tipo === "transformador") {
    matchSql = `(
      UPPER(TRIM(COALESCE(p.trafo::text, ''))) = UPPER(TRIM($${valorIdx}))
      OR EXISTS (
        SELECT 1 FROM socios_catalogo sc
        WHERE UPPER(TRIM(COALESCE(sc.transformador::text, ''))) = UPPER(TRIM($${valorIdx}))
          ${hasT ? `AND sc.tenant_id = p.tenant_id` : ""}
          AND ${sqlMatchPedidoSocio("p", "sc")}
      )
    )`;
  } else {
    matchSql = `(
      UPPER(TRIM(COALESCE(p.distribuidor::text, ''))) = UPPER(TRIM($${valorIdx}))
      OR UPPER(TRIM(COALESCE(p.distribuidor::text, ''))) LIKE UPPER(TRIM($${valorIdx})) || ' %'
      OR UPPER(TRIM(COALESCE(p.distribuidor::text, ''))) LIKE UPPER(TRIM($${valorIdx})) || '-%'
      OR EXISTS (
        SELECT 1 FROM socios_catalogo sc
        WHERE UPPER(TRIM(COALESCE(sc.distribuidor_codigo::text, ''))) = UPPER(TRIM($${valorIdx}))
          ${hasT ? `AND sc.tenant_id = p.tenant_id` : ""}
          AND ${sqlMatchPedidoSocio("p", "sc")}
      )
    )`;
  }

  const incFilter = soloSinInc ? " AND p.incidencia_id IS NULL" : "";
  const tenantSql = hasT ? `p.tenant_id = $1` : "TRUE";

  const sql = `
    SELECT p.id, p.numero_pedido, p.estado, p.cliente, p.distribuidor, p.trafo, p.incidencia_id,
           p.tecnico_asignado_id, p.fecha_creacion
    FROM pedidos p
    WHERE ${tenantSql}
      AND p.estado IN (${estadosPlaceholders})
      ${bt.replace(/\bbusiness_type\b/g, "p.business_type")}
      ${incFilter}
      AND ${matchSql}
    ORDER BY p.fecha_creacion DESC
    LIMIT 500`;

  const r = await query(sql, params);
  const pedidos = r.rows.map((row) => ({
    id: row.id,
    numero_pedido: row.numero_pedido,
    estado: row.estado,
    cliente: row.cliente,
    distribuidor: row.distribuidor,
    trafo: row.trafo,
    incidencia_id: row.incidencia_id,
    tecnico_asignado_id: row.tecnico_asignado_id,
  }));

  return {
    ok: true,
    tipo,
    valor,
    valor_norm: valorNorm,
    total: pedidos.length,
    pedidos,
    truncado: pedidos.length >= 500,
  };
}

/**
 * @param {import('express').Request} req
 * @param {{ tipo: string, valor: string, tecnico_asignado_id: number, nombre?: string, solo_sin_incidencia?: boolean, pedido_ids?: number[] }} body
 */
export async function ejecutarEventoCorteMasivo(req, body) {
  if (!(await incidenciasDisponibles())) {
    return {
      ok: false,
      status: 503,
      error: "Incidencias no disponibles en BD",
      detail: "Ejecutá docs/NEON_incidencias.sql en Neon",
    };
  }

  const preview = await buscarPedidosEventoCorte(req, {
    tipo: body.tipo,
    valor: body.valor,
    solo_sin_incidencia: body.solo_sin_incidencia !== false,
  });
  if (!preview.ok) return { ok: false, status: preview.status, error: preview.error };

  let ids = preview.pedidos.map((p) => p.id);
  if (Array.isArray(body.pedido_ids) && body.pedido_ids.length) {
    const allow = new Set(ids);
    ids = body.pedido_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0 && allow.has(n));
  }
  if (!ids.length) {
    return { ok: false, status: 400, error: "No hay reclamos abiertos para agrupar con ese criterio" };
  }

  const tecnicoId = Number(body.tecnico_asignado_id);
  if (!Number.isFinite(tecnicoId) || tecnicoId < 1) {
    return { ok: false, status: 400, error: "tecnico_asignado_id es obligatorio" };
  }

  const tipo = preview.tipo;
  const valor = preview.valor;
  const criterio = tipo === "transformador" ? "transformador" : "distribuidor";
  let nombre = String(body.nombre || "").trim().slice(0, 200);
  if (!nombre) {
    const pref = tipo === "transformador" ? "Corte masivo — Trafo" : "Corte masivo — Dist.";
    nombre = `${pref} ${valor}`.slice(0, 200);
  }

  const { usuariosTenantColumnName } = await import("../utils/tenantScope.js");
  const ucol = await usuariosTenantColumnName();
  const ru = ucol
    ? await query(
        `SELECT id FROM usuarios WHERE id = $1 AND ${ucol} = $2 AND activo = TRUE LIMIT 1`,
        [tecnicoId, req.tenantId]
      )
    : await query("SELECT id FROM usuarios WHERE id = $1 AND activo = TRUE LIMIT 1", [tecnicoId]);
  if (!ru.rows.length) return { ok: false, status: 400, error: "Técnico inválido o inactivo" };

  const hasT = await pedidosTableHasTenantIdColumn();
  const uniq = [...new Set(ids)];

  try {
    const result = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO incidencias (tenant_id, nombre, criterio_agrupacion, valor_criterio, usuario_creador_id, estado)
         VALUES ($1,$2,$3,$4,$5,'abierta')
         RETURNING *`,
        [req.tenantId, nombre, criterio, valor, req.user.id]
      );
      const inc = ins.rows[0];
      const incId = inc.id;

      for (const pid of uniq) {
        const params = [incId, pid, req.tenantId];
        const bt = await pushPedidoBusinessFilter(req, params);
        const sql = hasT
          ? `UPDATE pedidos SET incidencia_id = $1 WHERE id = $2 AND tenant_id = $3${bt}`
          : `UPDATE pedidos SET incidencia_id = $1 WHERE id = $2${bt}`;
        const up = await client.query(sql, params);
        if (up.rowCount === 0) throw new Error("No se pudo asociar pedido " + pid);
      }

      let asignados = 0;
      for (const pid of uniq) {
        const params = hasT
          ? [pid, tecnicoId, req.user.id, req.tenantId]
          : [pid, tecnicoId, req.user.id];
        const bt = await pushPedidoBusinessFilter(req, params);
        const sql = hasT
          ? `UPDATE pedidos
             SET tecnico_asignado_id = $2, fecha_asignacion = NOW(), asignado_por_id = $3
             WHERE id = $1 AND tenant_id = $4${bt}`
          : `UPDATE pedidos
             SET tecnico_asignado_id = $2, fecha_asignacion = NOW(), asignado_por_id = $3
             WHERE id = $1${bt}`;
        const up = await client.query(sql, params);
        if (up.rowCount > 0) asignados += 1;
      }

      return { incidencia: inc, pedidos_asociados: uniq.length, pedidos_asignados: asignados };
    });

    return { ok: true, status: 201, ...result };
  } catch (error) {
    return { ok: false, status: 500, error: "No se pudo ejecutar el evento de corte", detail: error.message };
  }
}
