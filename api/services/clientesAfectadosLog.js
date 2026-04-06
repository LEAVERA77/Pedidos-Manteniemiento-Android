import { query } from "../db/neon.js";
import { getUserTenantId } from "../utils/tenantUser.js";

const METODOS = new Set(["transformador", "zona", "distribuidor", "alimentador", "rango", "manual"]);

async function sumaPorDistribuidor(tenantId, distribuidorId) {
  const r = await query(
    `SELECT COALESCE(SUM(clientes_conectados), 0)::bigint AS total
     FROM infra_transformadores
     WHERE tenant_id = $1 AND distribuidor_id = $2 AND activo = TRUE`,
    [tenantId, distribuidorId]
  );
  return Math.max(0, Number(r.rows[0]?.total) || 0);
}

async function sumaPorAlimentador(tenantId, distribuidorId, alimentadorRaw) {
  const alim = String(alimentadorRaw || "").trim();
  if (!alim) return 0;
  const r = await query(
    `SELECT COALESCE(SUM(clientes_conectados), 0)::bigint AS total
     FROM infra_transformadores
     WHERE tenant_id = $1 AND distribuidor_id = $2 AND activo = TRUE
       AND TRIM(alimentador) = $3`,
    [tenantId, distribuidorId, alim]
  );
  return Math.max(0, Number(r.rows[0]?.total) || 0);
}

/**
 * @returns {{ ok: true, row: object } | { ok: false, status: number, error: string }}
 */
export async function buildClientesAfectadosPayload(pedido, userId, body) {
  const metodo = String(body?.metodo || "").toLowerCase();
  if (!METODOS.has(metodo)) {
    return {
      ok: false,
      status: 400,
      error: "metodo debe ser transformador, zona, distribuidor, alimentador, rango o manual",
    };
  }

  const tid =
    pedido.tenant_id != null && Number.isFinite(Number(pedido.tenant_id))
      ? Number(pedido.tenant_id)
      : await getUserTenantId(userId);

  let transformador_id = null;
  let zona_id = null;
  let distribuidor_id = null;
  let alimentador = null;
  let medidor_desde = null;
  let medidor_hasta = null;
  let cantidad_clientes = 0;
  let es_estimado = false;

  if (metodo === "transformador") {
    const tidTr = Number(body?.transformador_id);
    if (!Number.isFinite(tidTr) || tidTr <= 0) {
      return { ok: false, status: 400, error: "transformador_id es requerido" };
    }
    const r = await query(
      `SELECT id, clientes_conectados FROM infra_transformadores
       WHERE id = $1 AND tenant_id = $2 AND activo = TRUE LIMIT 1`,
      [tidTr, tid]
    );
    if (!r.rows.length) return { ok: false, status: 400, error: "Transformador inválido" };
    transformador_id = r.rows[0].id;
    cantidad_clientes = Math.max(0, Number(r.rows[0].clientes_conectados) || 0);
    es_estimado = false;
  } else if (metodo === "zona") {
    const zid = Number(body?.zona_id);
    if (!Number.isFinite(zid) || zid <= 0) {
      return { ok: false, status: 400, error: "zona_id es requerido" };
    }
    const r = await query(
      `SELECT id, clientes_estimados FROM infra_zonas_clientes
       WHERE id = $1 AND tenant_id = $2 AND activo = TRUE LIMIT 1`,
      [zid, tid]
    );
    if (!r.rows.length) return { ok: false, status: 400, error: "Zona inválida" };
    zona_id = r.rows[0].id;
    cantidad_clientes = Math.max(0, Number(r.rows[0].clientes_estimados) || 0);
    es_estimado = true;
  } else if (metodo === "distribuidor") {
    const did = Number(body?.distribuidor_id);
    if (!Number.isFinite(did) || did <= 0) {
      return { ok: false, status: 400, error: "distribuidor_id es requerido" };
    }
    const chk = await query(`SELECT id FROM distribuidores WHERE id = $1 LIMIT 1`, [did]);
    if (!chk.rows.length) return { ok: false, status: 400, error: "Distribuidor inválido" };
    distribuidor_id = did;
    cantidad_clientes = await sumaPorDistribuidor(tid, did);
    es_estimado = false;
  } else if (metodo === "alimentador") {
    const did = Number(body?.distribuidor_id);
    if (!Number.isFinite(did) || did <= 0) {
      return { ok: false, status: 400, error: "distribuidor_id es requerido para alimentador" };
    }
    alimentador = String(body?.alimentador || "").trim();
    if (!alimentador) {
      return { ok: false, status: 400, error: "alimentador es requerido (código o nombre)" };
    }
    const chk = await query(`SELECT id FROM distribuidores WHERE id = $1 LIMIT 1`, [did]);
    if (!chk.rows.length) return { ok: false, status: 400, error: "Distribuidor inválido" };
    distribuidor_id = did;
    cantidad_clientes = await sumaPorAlimentador(tid, did, alimentador);
    es_estimado = false;
  } else if (metodo === "rango") {
    medidor_desde = String(body?.medidor_desde || "").trim() || null;
    medidor_hasta = String(body?.medidor_hasta || "").trim() || null;
    if (!medidor_desde || !medidor_hasta) {
      return { ok: false, status: 400, error: "medidor_desde y medidor_hasta son requeridos" };
    }
    const a = Number.parseInt(medidor_desde, 10);
    const b = Number.parseInt(medidor_hasta, 10);
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      cantidad_clientes = b - a + 1;
      es_estimado = false;
    } else {
      const n = Math.max(0, Number(body?.cantidad) || 0);
      if (n <= 0) {
        return {
          ok: false,
          status: 400,
          error: "Para medidores no numéricos indicá cantidad (entero > 0) en el cuerpo",
        };
      }
      cantidad_clientes = n;
      es_estimado = true;
    }
  } else {
    cantidad_clientes = Math.max(0, Number(body?.cantidad) || 0);
    if (cantidad_clientes <= 0) {
      return { ok: false, status: 400, error: "cantidad debe ser un entero mayor a 0" };
    }
    es_estimado = body?.es_estimado !== undefined ? !!body.es_estimado : true;
  }

  if (cantidad_clientes <= 0) {
    return {
      ok: false,
      status: 400,
      error:
        metodo === "distribuidor" || metodo === "alimentador"
          ? "No hay transformadores activos con socios para ese criterio (revisá el catálogo y la migración SQL)."
          : "La cantidad de clientes afectados debe ser mayor a 0",
    };
  }

  return {
    ok: true,
    row: {
      pedido_id: pedido.id,
      tenant_id: tid,
      metodo,
      transformador_id,
      zona_id,
      distribuidor_id,
      alimentador: alimentador || null,
      medidor_desde,
      medidor_hasta,
      cantidad_clientes,
      es_estimado,
      usuario_id: userId,
    },
  };
}

export async function insertClientesAfectadosLog(row) {
  const r = await query(
    `INSERT INTO clientes_afectados_log
      (pedido_id, tenant_id, metodo, transformador_id, zona_id, distribuidor_id, alimentador,
       medidor_desde, medidor_hasta, cantidad_clientes, es_estimado, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      row.pedido_id,
      row.tenant_id,
      row.metodo,
      row.transformador_id,
      row.zona_id,
      row.distribuidor_id,
      row.alimentador,
      row.medidor_desde,
      row.medidor_hasta,
      row.cantidad_clientes,
      row.es_estimado,
      row.usuario_id,
    ]
  );
  return r.rows[0];
}
