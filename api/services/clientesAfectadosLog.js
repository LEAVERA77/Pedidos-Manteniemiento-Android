import { query } from "../db/neon.js";
import { getUserTenantId } from "../utils/tenantUser.js";

const METODOS = new Set(["transformador", "zona", "rango", "manual"]);

/**
 * Calcula cantidad y campos para INSERT en clientes_afectados_log.
 * @returns {{ ok: true, row: object } | { ok: false, status: number, error: string }}
 */
export async function buildClientesAfectadosPayload(pedido, userId, body) {
  const metodo = String(body?.metodo || "").toLowerCase();
  if (!METODOS.has(metodo)) {
    return { ok: false, status: 400, error: "metodo debe ser transformador, zona, rango o manual" };
  }

  const tid =
    pedido.tenant_id != null && Number.isFinite(Number(pedido.tenant_id))
      ? Number(pedido.tenant_id)
      : await getUserTenantId(userId);

  let transformador_id = null;
  let zona_id = null;
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
    return { ok: false, status: 400, error: "La cantidad de clientes afectados debe ser mayor a 0" };
  }

  return {
    ok: true,
    row: {
      pedido_id: pedido.id,
      tenant_id: tid,
      metodo,
      transformador_id,
      zona_id,
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
      (pedido_id, tenant_id, metodo, transformador_id, zona_id, medidor_desde, medidor_hasta,
       cantidad_clientes, es_estimado, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      row.pedido_id,
      row.tenant_id,
      row.metodo,
      row.transformador_id,
      row.zona_id,
      row.medidor_desde,
      row.medidor_hasta,
      row.cantidad_clientes,
      row.es_estimado,
      row.usuario_id,
    ]
  );
  return r.rows[0];
}
