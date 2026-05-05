/**
 * Incidencias: agrupación de pedidos (multi-rubro).
 * made by leavera77
 */
import express from "express";
import { query, withTransaction } from "../db/neon.js";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { pedidosTableHasTenantIdColumn, tableHasColumn } from "../utils/tenantScope.js";
import { pushPedidoBusinessFilter } from "../utils/businessScope.js";
import { splitUrls } from "../utils/helpers.js";

const router = express.Router();
router.use(authWithTenantHost);

async function incidenciasFeatureAvailable() {
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'incidencias' LIMIT 1`
    );
    return r.rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function pedidosTieneIncidenciaColumn() {
  return tableHasColumn("pedidos", "incidencia_id");
}

async function assertPedidosRowsBelongTenant(ids, req) {
  const hasT = await pedidosTableHasTenantIdColumn();
  const uniq = [...new Set(ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!uniq.length) return { ok: false, error: "Sin pedidos válidos" };
  const params = hasT ? [uniq, req.tenantId] : [uniq];
  const bt = await pushPedidoBusinessFilter(req, params);
  const sql = hasT
    ? `SELECT id FROM pedidos WHERE id = ANY($1::int[]) AND tenant_id = $2${bt}`
    : `SELECT id FROM pedidos WHERE id = ANY($1::int[])${bt}`;
  const r = await query(sql, params);
  const got = new Set(r.rows.map((x) => x.id));
  if (got.size !== uniq.length) {
    return { ok: false, error: "Algún pedido no existe o no pertenece a tu empresa" };
  }
  return { ok: true };
}

/** Mapa pedido_id → incidencia_id para badges en el cliente */
router.get("/pedido-map", async (req, res) => {
  try {
    if (!(await incidenciasFeatureAvailable()) || !(await pedidosTieneIncidenciaColumn())) {
      return res.json({ map: {} });
    }
    const hasT = await pedidosTableHasTenantIdColumn();
    const params = hasT ? [req.tenantId] : [];
    const bt = await pushPedidoBusinessFilter(req, params);
    const sql = hasT
      ? `SELECT id, incidencia_id FROM pedidos WHERE tenant_id = $1 AND incidencia_id IS NOT NULL${bt}`
      : `SELECT id, incidencia_id FROM pedidos WHERE incidencia_id IS NOT NULL${bt}`;
    const r = await query(sql, params);
    const map = {};
    for (const row of r.rows) {
      map[String(row.id)] = row.incidencia_id;
    }
    return res.json({ map });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo cargar mapa de incidencias", detail: error.message });
  }
});

router.post("/", adminOnly, async (req, res) => {
  try {
    if (!(await incidenciasFeatureAvailable()) || !(await pedidosTieneIncidenciaColumn())) {
      return res.status(503).json({
        error: "Incidencias no disponibles en BD",
        detail: "Ejecutá docs/NEON_incidencias.sql en Neon",
      });
    }
    const pedido_ids = Array.isArray(req.body?.pedido_ids) ? req.body.pedido_ids : [];
    const criterio = String(req.body?.criterio_agrupacion || req.body?.criterio || "").trim().slice(0, 50);
    const valor = String(req.body?.valor_criterio || req.body?.valor || "").trim().slice(0, 200);
    let nombre = String(req.body?.nombre || "").trim().slice(0, 200);
    if (pedido_ids.length < 2) {
      return res.status(400).json({ error: "Seleccioná al menos 2 pedidos" });
    }
    if (!criterio || !valor) {
      return res.status(400).json({ error: "Criterio y valor de agrupación son obligatorios" });
    }
    const chk = await assertPedidosRowsBelongTenant(pedido_ids, req);
    if (!chk.ok) return res.status(400).json({ error: chk.error });
    if (!nombre) {
      nombre = `${criterio}: ${valor}`.slice(0, 200);
    }

    const ids = [...new Set(pedido_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
    const row = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO incidencias (tenant_id, nombre, criterio_agrupacion, valor_criterio, usuario_creador_id, estado)
         VALUES ($1,$2,$3,$4,$5,'abierta')
         RETURNING *`,
        [req.tenantId, nombre, criterio, valor, req.user.id]
      );
      const inc = ins.rows[0];
      const incId = inc.id;
      const hasT = await pedidosTableHasTenantIdColumn();
      for (const pid of ids) {
        const params = [incId, pid, req.tenantId];
        const bt = await pushPedidoBusinessFilter(req, params);
        const sql = hasT
          ? `UPDATE pedidos SET incidencia_id = $1 WHERE id = $2 AND tenant_id = $3${bt}`
          : `UPDATE pedidos SET incidencia_id = $1 WHERE id = $2${bt}`;
        const up = await client.query(sql, params);
        if (up.rowCount === 0) throw new Error("No se pudo asociar pedido " + pid);
      }
      return inc;
    });

    return res.status(201).json({
      ...row,
      pedidos_asociados: ids.length,
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo crear incidencia", detail: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!(await incidenciasFeatureAvailable()) || !(await pedidosTieneIncidenciaColumn())) {
      return res.status(503).json({ error: "Incidencias no disponibles en BD" });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
    const hasT = await pedidosTableHasTenantIdColumn();
    const params = hasT ? [id, req.tenantId] : [id];
    const ir = await query(
      hasT
        ? `SELECT * FROM incidencias WHERE id = $1 AND tenant_id = $2 LIMIT 1`
        : `SELECT * FROM incidencias WHERE id = $1 LIMIT 1`,
      params
    );
    if (!ir.rows.length) return res.status(404).json({ error: "Incidencia no encontrada" });

    const pparams = hasT ? [id, req.tenantId] : [id];
    const bt = await pushPedidoBusinessFilter(req, pparams);
    const psql = hasT
      ? `SELECT * FROM pedidos WHERE incidencia_id = $1 AND tenant_id = $2${bt} ORDER BY fecha_creacion DESC`
      : `SELECT * FROM pedidos WHERE incidencia_id = $1${bt} ORDER BY fecha_creacion DESC`;
    const pr = await query(psql, pparams);
    const pedidos = pr.rows.map((p) => ({ ...p, fotos: splitUrls(p.foto_urls) }));

    const cerrados = pedidos.filter((p) => String(p.estado || "").trim() === "Cerrado").length;
    return res.json({
      incidencia: ir.rows[0],
      pedidos,
      progreso: { cerrados, total: pedidos.length },
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo cargar incidencia", detail: error.message });
  }
});

router.put("/:id", adminOnly, async (req, res) => {
  try {
    if (!(await incidenciasFeatureAvailable())) {
      return res.status(503).json({ error: "Incidencias no disponibles en BD" });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: "id inválido" });
    const hasT = await pedidosTableHasTenantIdColumn();
    const params0 = hasT ? [id, req.tenantId] : [id];
    const chk = await query(
      hasT ? `SELECT id FROM incidencias WHERE id = $1 AND tenant_id = $2` : `SELECT id FROM incidencias WHERE id = $1`,
      params0
    );
    if (!chk.rows.length) return res.status(404).json({ error: "Incidencia no encontrada" });

    const nombre = req.body?.nombre != null ? String(req.body.nombre).trim().slice(0, 200) : null;
    const estado = req.body?.estado != null ? String(req.body.estado).trim().slice(0, 30) : null;
    const sets = [];
    const params = [];
    let i = 1;
    if (nombre !== null && nombre !== "") {
      sets.push(`nombre = $${i++}`);
      params.push(nombre);
    }
    if (estado !== null && estado !== "") {
      sets.push(`estado = $${i++}`);
      params.push(estado);
    }
    const estadoNorm = estado !== null && estado !== "" ? String(estado).trim().toLowerCase() : "";
    if (estadoNorm === "cerrada") {
      if (await tableHasColumn("incidencias", "fecha_cierre")) {
        sets.push(`fecha_cierre = COALESCE(fecha_cierre, NOW())`);
      }
      if (await tableHasColumn("incidencias", "usuario_cierre_id")) {
        sets.push(`usuario_cierre_id = COALESCE(usuario_cierre_id, $${i++})`);
        params.push(req.user.id);
      }
    }
    if (!sets.length) return res.status(400).json({ error: "Nada para actualizar" });
    params.push(id);
    if (hasT) params.push(req.tenantId);
    const sql = `UPDATE incidencias SET ${sets.join(", ")} WHERE id = $${i++}${hasT ? ` AND tenant_id = $${i++}` : ""} RETURNING *`;
    const r = await query(sql, params);
    return res.json(r.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar incidencia", detail: error.message });
  }
});

router.post("/:id/desasociar", adminOnly, async (req, res) => {
  try {
    if (!(await incidenciasFeatureAvailable()) || !(await pedidosTieneIncidenciaColumn())) {
      return res.status(503).json({ error: "Incidencias no disponibles en BD" });
    }
    const incId = Number(req.params.id);
    const pedidoId = Number(req.body?.pedido_id);
    if (!Number.isFinite(incId) || incId < 1) return res.status(400).json({ error: "id inválido" });
    if (!Number.isFinite(pedidoId) || pedidoId < 1) return res.status(400).json({ error: "pedido_id inválido" });

    const hasT = await pedidosTableHasTenantIdColumn();
    const params = hasT ? [null, pedidoId, incId, req.tenantId] : [null, pedidoId, incId];
    const bt = await pushPedidoBusinessFilter(req, params);
    const sql = hasT
      ? `UPDATE pedidos SET incidencia_id = $1 WHERE id = $2 AND incidencia_id = $3 AND tenant_id = $4${bt} RETURNING id`
      : `UPDATE pedidos SET incidencia_id = $1 WHERE id = $2 AND incidencia_id = $3${bt} RETURNING id`;
    const r = await query(sql, params);
    if (!r.rows.length) return res.status(404).json({ error: "Pedido no encontrado o no pertenece a la incidencia" });
    return res.json({ ok: true, pedido_id: pedidoId });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo desasociar", detail: error.message });
  }
});

export default router;
