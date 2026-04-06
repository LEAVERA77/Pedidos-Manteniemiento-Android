import express from "express";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { getUserTenantId } from "../utils/tenantUser.js";

const router = express.Router();
router.use(authMiddleware);

function badTable(error) {
  const m = String(error?.message || error || "");
  if (/does not exist|relation .*infra_/i.test(m)) {
    const e = new Error(
      "Faltan tablas de infraestructura. Ejecutá docs/NEON_clientes_afectados_infra.sql en Neon."
    );
    e.statusCode = 503;
    throw e;
  }
  throw error;
}

router.get("/transformadores", async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const r = await query(
      `SELECT id, tenant_id, codigo, nombre, capacidad_kva, clientes_conectados, barrio_texto,
              latitud, longitud, activo, created_at
       FROM infra_transformadores
       WHERE tenant_id = $1 AND activo = TRUE
       ORDER BY codigo ASC`,
      [tid]
    );
    return res.json(r.rows);
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo listar transformadores", detail: error.message });
  }
});

router.post("/transformadores", adminOnly, async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const codigo = String(req.body?.codigo || "").trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: "codigo es requerido" });
    const nombre = req.body?.nombre != null ? String(req.body.nombre).trim() : null;
    const capacidad_kva =
      req.body?.capacidad_kva != null && req.body.capacidad_kva !== ""
        ? Number(req.body.capacidad_kva)
        : null;
    const clientes_conectados = Math.max(0, Number(req.body?.clientes_conectados) || 0);
    const barrio_texto = req.body?.barrio_texto != null ? String(req.body.barrio_texto).trim() : null;
    const latitud =
      req.body?.latitud != null && req.body.latitud !== "" ? Number(req.body.latitud) : null;
    const longitud =
      req.body?.longitud != null && req.body.longitud !== "" ? Number(req.body.longitud) : null;

    const r = await query(
      `INSERT INTO infra_transformadores
        (tenant_id, codigo, nombre, capacidad_kva, clientes_conectados, barrio_texto, latitud, longitud, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
       ON CONFLICT (tenant_id, codigo) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         capacidad_kva = EXCLUDED.capacidad_kva,
         clientes_conectados = EXCLUDED.clientes_conectados,
         barrio_texto = EXCLUDED.barrio_texto,
         latitud = EXCLUDED.latitud,
         longitud = EXCLUDED.longitud,
         activo = TRUE
       RETURNING *`,
      [tid, codigo, nombre, Number.isFinite(capacidad_kva) ? capacidad_kva : null, clientes_conectados, barrio_texto, Number.isFinite(latitud) ? latitud : null, Number.isFinite(longitud) ? longitud : null]
    );
    return res.status(201).json(r.rows[0]);
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo guardar transformador", detail: error.message });
  }
});

router.put("/transformadores/:id", adminOnly, async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const id = Number(req.params.id);
    const chk = await query(
      `SELECT id FROM infra_transformadores WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tid]
    );
    if (!chk.rows.length) return res.status(404).json({ error: "Transformador no encontrado" });

    const nombre = req.body?.nombre !== undefined ? String(req.body.nombre || "").trim() || null : undefined;
    const capacidad_kva =
      req.body?.capacidad_kva !== undefined && req.body.capacidad_kva !== ""
        ? Number(req.body.capacidad_kva)
        : undefined;
    const clientes_conectados =
      req.body?.clientes_conectados !== undefined ? Math.max(0, Number(req.body.clientes_conectados) || 0) : undefined;
    const barrio_texto =
      req.body?.barrio_texto !== undefined ? String(req.body.barrio_texto || "").trim() || null : undefined;
    const latitud =
      req.body?.latitud !== undefined && req.body.latitud !== "" ? Number(req.body.latitud) : undefined;
    const longitud =
      req.body?.longitud !== undefined && req.body.longitud !== "" ? Number(req.body.longitud) : undefined;
    const activo = req.body?.activo !== undefined ? !!req.body.activo : undefined;

    const r = await query(
      `UPDATE infra_transformadores SET
         nombre = COALESCE($3, nombre),
         capacidad_kva = COALESCE($4, capacidad_kva),
         clientes_conectados = COALESCE($5, clientes_conectados),
         barrio_texto = COALESCE($6, barrio_texto),
         latitud = COALESCE($7, latitud),
         longitud = COALESCE($8, longitud),
         activo = COALESCE($9, activo)
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tid,
        nombre ?? null,
        capacidad_kva !== undefined && Number.isFinite(capacidad_kva) ? capacidad_kva : null,
        clientes_conectados ?? null,
        barrio_texto ?? null,
        latitud !== undefined && Number.isFinite(latitud) ? latitud : null,
        longitud !== undefined && Number.isFinite(longitud) ? longitud : null,
        activo ?? null,
      ]
    );
    return res.json(r.rows[0]);
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo actualizar transformador", detail: error.message });
  }
});

router.delete("/transformadores/:id", adminOnly, async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    await query(`UPDATE infra_transformadores SET activo = FALSE WHERE id = $1 AND tenant_id = $2`, [
      Number(req.params.id),
      tid,
    ]);
    return res.json({ ok: true });
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo eliminar transformador", detail: error.message });
  }
});

router.get("/zonas-clientes", async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const r = await query(
      `SELECT id, tenant_id, nombre, clientes_estimados, activo, created_at
       FROM infra_zonas_clientes
       WHERE tenant_id = $1 AND activo = TRUE
       ORDER BY nombre ASC`,
      [tid]
    );
    return res.json(r.rows);
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo listar zonas", detail: error.message });
  }
});

router.post("/zonas-clientes", adminOnly, async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const nombre = String(req.body?.nombre || "").trim();
    if (!nombre) return res.status(400).json({ error: "nombre es requerido" });
    const clientes_estimados = Math.max(0, Number(req.body?.clientes_estimados) || 0);
    const r = await query(
      `INSERT INTO infra_zonas_clientes (tenant_id, nombre, clientes_estimados, activo)
       VALUES ($1,$2,$3,TRUE)
       ON CONFLICT (tenant_id, nombre) DO UPDATE SET
         clientes_estimados = EXCLUDED.clientes_estimados,
         activo = TRUE
       RETURNING *`,
      [tid, nombre, clientes_estimados]
    );
    return res.status(201).json(r.rows[0]);
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo guardar zona", detail: error.message });
  }
});

router.put("/zonas-clientes/:id", adminOnly, async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const id = Number(req.params.id);
    const chk = await query(
      `SELECT id FROM infra_zonas_clientes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tid]
    );
    if (!chk.rows.length) return res.status(404).json({ error: "Zona no encontrada" });
    const nombre = req.body?.nombre !== undefined ? String(req.body.nombre || "").trim() || null : undefined;
    const clientes_estimados =
      req.body?.clientes_estimados !== undefined ? Math.max(0, Number(req.body.clientes_estimados) || 0) : undefined;
    const activo = req.body?.activo !== undefined ? !!req.body.activo : undefined;
    const r = await query(
      `UPDATE infra_zonas_clientes SET
         nombre = COALESCE($3, nombre),
         clientes_estimados = COALESCE($4, clientes_estimados),
         activo = COALESCE($5, activo)
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tid, nombre ?? null, clientes_estimados ?? null, activo ?? null]
    );
    return res.json(r.rows[0]);
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo actualizar zona", detail: error.message });
  }
});

router.delete("/zonas-clientes/:id", adminOnly, async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    await query(`UPDATE infra_zonas_clientes SET activo = FALSE WHERE id = $1 AND tenant_id = $2`, [
      Number(req.params.id),
      tid,
    ]);
    return res.json({ ok: true });
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo eliminar zona", detail: error.message });
  }
});

export default router;
