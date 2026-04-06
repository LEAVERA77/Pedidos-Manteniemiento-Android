import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query, withTransaction } from "../db/neon.js";
import { getUserTenantId } from "../utils/tenantUser.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
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

async function lookupDistribuidorIdByCodigo(codigo) {
  const c = String(codigo || "").trim().toUpperCase();
  if (!c) return null;
  const r = await query(`SELECT id FROM distribuidores WHERE UPPER(TRIM(codigo)) = $1 LIMIT 1`, [c]);
  return r.rows[0]?.id ?? null;
}

function cellStr(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function cellNum(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

router.get("/transformadores", async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const r = await query(
      `SELECT t.id, t.tenant_id, t.codigo, t.nombre, t.capacidad_kva, t.clientes_conectados, t.barrio_texto,
              t.distribuidor_id, t.alimentador, t.latitud, t.longitud, t.activo, t.created_at,
              d.codigo AS distribuidor_codigo, d.nombre AS distribuidor_nombre
       FROM infra_transformadores t
       LEFT JOIN distribuidores d ON d.id = t.distribuidor_id
       WHERE t.tenant_id = $1 AND t.activo = TRUE
       ORDER BY t.codigo ASC`,
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

/** Suma kVA y socios de todos los trafos activos del tenant bajo cada distribuidor. */
router.get("/resumen-por-distribuidor", async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const r = await query(
      `SELECT d.id AS distribuidor_id, d.codigo, d.nombre,
              COALESCE(SUM(t.capacidad_kva), 0)::bigint AS total_kva,
              COALESCE(SUM(t.clientes_conectados), 0)::bigint AS total_clientes,
              COUNT(t.id)::int AS cant_transformadores
       FROM infra_transformadores t
       INNER JOIN distribuidores d ON d.id = t.distribuidor_id
       WHERE t.tenant_id = $1 AND t.activo = TRUE AND t.distribuidor_id IS NOT NULL
       GROUP BY d.id, d.codigo, d.nombre
       ORDER BY d.codigo ASC`,
      [tid]
    );
    return res.json(r.rows);
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo calcular resumen", detail: error.message });
  }
});

router.get("/resumen-por-alimentador", async (req, res) => {
  try {
    const tid = await getUserTenantId(req.user.id);
    const did = Number(req.query.distribuidor_id);
    if (!Number.isFinite(did) || did <= 0) {
      return res.status(400).json({ error: "distribuidor_id query requerido" });
    }
    const r = await query(
      `SELECT TRIM(t.alimentador) AS alimentador,
              COALESCE(SUM(t.capacidad_kva), 0)::bigint AS total_kva,
              COALESCE(SUM(t.clientes_conectados), 0)::bigint AS total_clientes,
              COUNT(t.id)::int AS cant_transformadores
       FROM infra_transformadores t
       WHERE t.tenant_id = $1 AND t.distribuidor_id = $2 AND t.activo = TRUE
         AND t.alimentador IS NOT NULL AND TRIM(t.alimentador) <> ''
       GROUP BY TRIM(t.alimentador)
       ORDER BY TRIM(t.alimentador) ASC`,
      [tid, did]
    );
    return res.json(r.rows);
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo listar alimentadores", detail: error.message });
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
    let distribuidor_id =
      req.body?.distribuidor_id != null && req.body.distribuidor_id !== ""
        ? Number(req.body.distribuidor_id)
        : null;
    if (!Number.isFinite(distribuidor_id) || distribuidor_id <= 0) distribuidor_id = null;
    if (!distribuidor_id && req.body?.distribuidor_codigo) {
      distribuidor_id = await lookupDistribuidorIdByCodigo(req.body.distribuidor_codigo);
    }
    const alimentador =
      req.body?.alimentador != null && String(req.body.alimentador).trim() !== ""
        ? String(req.body.alimentador).trim()
        : null;
    const latitud =
      req.body?.latitud != null && req.body.latitud !== "" ? Number(req.body.latitud) : null;
    const longitud =
      req.body?.longitud != null && req.body.longitud !== "" ? Number(req.body.longitud) : null;

    const r = await query(
      `INSERT INTO infra_transformadores
        (tenant_id, codigo, nombre, capacidad_kva, clientes_conectados, barrio_texto,
         distribuidor_id, alimentador, latitud, longitud, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)
       ON CONFLICT (tenant_id, codigo) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         capacidad_kva = EXCLUDED.capacidad_kva,
         clientes_conectados = EXCLUDED.clientes_conectados,
         barrio_texto = EXCLUDED.barrio_texto,
         distribuidor_id = EXCLUDED.distribuidor_id,
         alimentador = EXCLUDED.alimentador,
         latitud = EXCLUDED.latitud,
         longitud = EXCLUDED.longitud,
         activo = TRUE
       RETURNING *`,
      [
        tid,
        codigo,
        nombre,
        Number.isFinite(capacidad_kva) ? capacidad_kva : null,
        clientes_conectados,
        barrio_texto,
        distribuidor_id,
        alimentador,
        Number.isFinite(latitud) ? latitud : null,
        Number.isFinite(longitud) ? longitud : null,
      ]
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
    let distribuidor_id = undefined;
    if (req.body?.distribuidor_id !== undefined) {
      const raw = req.body.distribuidor_id;
      if (raw === null || raw === "") distribuidor_id = null;
      else {
        const d = Number(raw);
        distribuidor_id = Number.isFinite(d) && d > 0 ? d : null;
      }
    }
    if (distribuidor_id === undefined && req.body?.distribuidor_codigo !== undefined) {
      distribuidor_id = await lookupDistribuidorIdByCodigo(req.body.distribuidor_codigo);
    }
    const alimentador =
      req.body?.alimentador !== undefined
        ? String(req.body.alimentador || "").trim() || null
        : undefined;
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
         distribuidor_id = COALESCE($7, distribuidor_id),
         alimentador = COALESCE($8, alimentador),
         latitud = COALESCE($9, latitud),
         longitud = COALESCE($10, longitud),
         activo = COALESCE($11, activo)
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tid,
        nombre ?? null,
        capacidad_kva !== undefined && Number.isFinite(capacidad_kva) ? capacidad_kva : null,
        clientes_conectados ?? null,
        barrio_texto ?? null,
        distribuidor_id ?? null,
        alimentador ?? null,
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

/** Excel: codigo | nombre | capacidad_kva (o kva) | clientes_conectados (o socios) | barrio (opc.) | distribuidor_codigo (opc.) | alimentador (opc.) */
router.post("/transformadores/import-excel", adminOnly, upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Archivo requerido (file)" });
    const tid = await getUserTenantId(req.user.id);
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    let ok = 0;
    let err = 0;
    await withTransaction(async (client) => {
      for (const raw of rows) {
        const row = {};
        for (const [k, v] of Object.entries(raw)) {
          row[String(k).trim().toLowerCase().replace(/\s+/g, "_")] = v;
        }
        const codigo = cellStr(row, "codigo", "código", "code").toUpperCase();
        if (!codigo) continue;
        const nombre = cellStr(row, "nombre", "name") || null;
        const kva = cellNum(row, "capacidad_kva", "kva", "potencia_kva");
        const socios = cellNum(row, "clientes_conectados", "socios", "clientes");
        const clientes_conectados = socios != null ? Math.max(0, Math.floor(socios)) : 0;
        const barrio = cellStr(row, "barrio", "barrio_texto") || null;
        const distCod = cellStr(row, "distribuidor_codigo", "distribuidor", "dist_codigo");
        let distribuidor_id = null;
        if (distCod) {
          const r0 = await client.query(`SELECT id FROM distribuidores WHERE UPPER(TRIM(codigo)) = $1 LIMIT 1`, [
            distCod.toUpperCase(),
          ]);
          distribuidor_id = r0.rows[0]?.id ?? null;
        }
        const alimentador = cellStr(row, "alimentador", "alim", "feeder") || null;
        try {
          await client.query(
            `INSERT INTO infra_transformadores
              (tenant_id, codigo, nombre, capacidad_kva, clientes_conectados, barrio_texto, distribuidor_id, alimentador, activo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
             ON CONFLICT (tenant_id, codigo) DO UPDATE SET
               nombre = EXCLUDED.nombre,
               capacidad_kva = EXCLUDED.capacidad_kva,
               clientes_conectados = EXCLUDED.clientes_conectados,
               barrio_texto = EXCLUDED.barrio_texto,
               distribuidor_id = EXCLUDED.distribuidor_id,
               alimentador = EXCLUDED.alimentador,
               activo = TRUE`,
            [
              tid,
              codigo,
              nombre,
              kva != null && Number.isFinite(kva) ? Math.floor(kva) : null,
              clientes_conectados,
              barrio,
              distribuidor_id,
              alimentador,
            ]
          );
          ok += 1;
        } catch {
          err += 1;
        }
      }
    });
    return res.json({ ok: true, importados: ok, errores: err });
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo importar Excel", detail: error.message });
  }
});

/** Solo actualiza distribuidor_id y alimentador por código de trafo. Columnas: codigo | distribuidor_codigo | alimentador (opc.) */
router.post("/transformadores/import-excel-asignacion", adminOnly, upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Archivo requerido (file)" });
    const tid = await getUserTenantId(req.user.id);
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    let ok = 0;
    let err = 0;
    await withTransaction(async (client) => {
      for (const raw of rows) {
        const row = {};
        for (const [k, v] of Object.entries(raw)) {
          row[String(k).trim().toLowerCase().replace(/\s+/g, "_")] = v;
        }
        const codigo = cellStr(row, "codigo", "código", "code").toUpperCase();
        if (!codigo) continue;
        const distCod = cellStr(row, "distribuidor_codigo", "distribuidor", "dist_codigo");
        let distribuidor_id = null;
        if (distCod) {
          const r0 = await client.query(`SELECT id FROM distribuidores WHERE UPPER(TRIM(codigo)) = $1 LIMIT 1`, [
            distCod.toUpperCase(),
          ]);
          distribuidor_id = r0.rows[0]?.id ?? null;
        }
        const alimentador = cellStr(row, "alimentador", "alim", "feeder") || null;
        const r1 = await client.query(
          `UPDATE infra_transformadores SET distribuidor_id = $3, alimentador = $4
           WHERE tenant_id = $1 AND UPPER(TRIM(codigo)) = $2 AND activo = TRUE`,
          [tid, codigo, distribuidor_id, alimentador]
        );
        if (r1.rowCount) ok += 1;
        else err += 1;
      }
    });
    return res.json({ ok: true, actualizados: ok, sin_coincidencia: err });
  } catch (error) {
    try {
      badTable(error);
    } catch (e) {
      if (e.statusCode === 503) return res.status(503).json({ error: e.message });
    }
    return res.status(500).json({ error: "No se pudo importar asignación", detail: error.message });
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
