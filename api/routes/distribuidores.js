import express from "express";
import multer from "multer";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query, withTransaction } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { mergeDistribuidoresSaidiFromExcelBuffer } from "../services/distribuidoresSaidiExcelMerge.js";
import {
  mergeDistribuidoresCatalogoFromExcelBuffer,
  darDeBajaDistribuidoresCatalogoPorCodigos,
} from "../services/distribuidoresCatalogoExcelMerge.js";
import {
  buildDistribuidoresCatalogoExcelBuffer,
  fetchDistribuidoresCatalogoExportRows,
} from "../services/distribuidoresCatalogoExcelExport.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authWithTenantHost);

async function distribuidoresTieneTenantId() {
  return tableHasColumn("distribuidores", "tenant_id");
}

router.get("/", async (req, res) => {
  const tid = req.tenantId;
  if (await distribuidoresTieneTenantId()) {
    const r = await query("SELECT * FROM distribuidores WHERE tenant_id = $1 ORDER BY codigo", [tid]);
    return res.json(r.rows);
  }
  const r = await query("SELECT * FROM distribuidores ORDER BY codigo");
  res.json(r.rows);
});

router.post("/", adminOnly, async (req, res) => {
  const { codigo, nombre, tension, localidad } = req.body;
  const cod = String(codigo || "").trim().toUpperCase();
  const tenantId = req.tenantId;
  if (await distribuidoresTieneTenantId()) {
    const loc =
      localidad != null && String(localidad).trim() !== "" ? String(localidad).trim() : null;
    const ex = await query(
      `SELECT id FROM distribuidores WHERE UPPER(TRIM(codigo)) = $1 AND tenant_id = $2 LIMIT 1`,
      [cod, tenantId]
    );
    if (ex.rows.length) {
      const id = ex.rows[0].id;
      const r = await query(
        `UPDATE distribuidores
         SET nombre = COALESCE($2,nombre),
             tension = COALESCE($3,tension),
             localidad = COALESCE($4,localidad),
             activo = TRUE
         WHERE id = $1 AND tenant_id = $5
         RETURNING *`,
        [id, nombre || null, tension || null, loc, tenantId]
      );
      return res.status(200).json(r.rows[0]);
    }
    const r = await query(
      `INSERT INTO distribuidores(codigo, nombre, tension, localidad, activo, tenant_id)
       VALUES($1,$2,$3,$4,TRUE,$5)
       RETURNING *`,
      [cod, nombre || null, tension || null, loc, tenantId]
    );
    return res.status(201).json(r.rows[0]);
  }
  const r = await query(
    `INSERT INTO distribuidores(codigo, nombre, tension, localidad, activo)
     VALUES($1,$2,$3,$4,TRUE)
     ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension, localidad = EXCLUDED.localidad
     RETURNING *`,
    [cod, nombre || null, tension || null, localidad != null && String(localidad).trim() !== "" ? String(localidad).trim() : null]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, tension, localidad, activo } = req.body;
  const hasLocalidad = Object.prototype.hasOwnProperty.call(req.body, "localidad");
  const localidadVal =
    hasLocalidad && localidad != null && String(localidad).trim() !== "" ? String(localidad).trim() : null;
  const tenantId = req.tenantId;
  let r;
  if (await distribuidoresTieneTenantId()) {
    r = await query(
      `UPDATE distribuidores
       SET nombre = COALESCE($2,nombre),
           tension = COALESCE($3,tension),
           localidad = CASE WHEN $6::boolean THEN $4::text ELSE localidad END,
           activo = COALESCE($5,activo)
       WHERE id = $1 AND tenant_id = $7 RETURNING *`,
      [id, nombre ?? null, tension ?? null, localidadVal, activo ?? null, hasLocalidad, tenantId]
    );
  } else {
    r = await query(
      `UPDATE distribuidores
       SET nombre = COALESCE($2,nombre),
           tension = COALESCE($3,tension),
           localidad = CASE WHEN $6::boolean THEN $4::text ELSE localidad END,
           activo = COALESCE($5,activo)
       WHERE id = $1 RETURNING *`,
      [id, nombre ?? null, tension ?? null, localidadVal, activo ?? null, hasLocalidad]
    );
  }
  if (!r.rows.length) return res.status(404).json({ error: "Distribuidor no encontrado" });
  res.json(r.rows[0]);
});

router.delete("/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const tenantId = req.tenantId;
  if (await distribuidoresTieneTenantId()) {
    await query("UPDATE distribuidores SET activo = FALSE WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
  } else {
    await query("UPDATE distribuidores SET activo = FALSE WHERE id = $1", [id]);
  }
  res.json({ ok: true });
});

router.post("/import-excel", adminOnly, upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Archivo requerido (file)" });
    const tenantId = req.tenantId;
    const flags = {
      hasTenantId: await distribuidoresTieneTenantId(),
      hasLocalidad: await tableHasColumn("distribuidores", "localidad"),
    };
    let out;
    await withTransaction(async (client) => {
      out = await mergeDistribuidoresCatalogoFromExcelBuffer(req.file.buffer, tenantId, client, flags);
    });
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: "No se pudo importar Excel", detail: error.message });
  }
});

router.post("/dar-de-baja-codigos", adminOnly, async (req, res) => {
  try {
    const codigos = Array.isArray(req.body?.codigos) ? req.body.codigos : [];
    if (!codigos.length) return res.status(400).json({ error: "Indicá al menos un código en codigos[]" });
    const flags = {
      hasTenantId: await distribuidoresTieneTenantId(),
      hasLocalidad: await tableHasColumn("distribuidores", "localidad"),
    };
    let out;
    await withTransaction(async (client) => {
      out = await darDeBajaDistribuidoresCatalogoPorCodigos(req.tenantId, codigos, client, flags);
    });
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: "No se pudo dar de baja", detail: error.message });
  }
});

router.get("/export", adminOnly, async (req, res) => {
  try {
    const { rows, colNames } = await fetchDistribuidoresCatalogoExportRows(req.tenantId);
    const buf = buildDistribuidoresCatalogoExcelBuffer(rows, colNames);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="distribuidores_${day}.xlsx"`);
    res.send(buf);
  } catch (error) {
    res.status(500).json({ error: "No se pudo exportar distribuidores", detail: error.message });
  }
});

router.post("/import-saidi-excel", adminOnly, upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Archivo requerido (file)" });
    const hasTid = await distribuidoresTieneTenantId();
    const hasTrafos = await tableHasColumn("distribuidores", "trafos");
    const hasKva = await tableHasColumn("distribuidores", "kva_saidi");
    const hasCli = await tableHasColumn("distribuidores", "clientes_saidi");
    if (!hasTid) {
      return res.status(400).json({ error: "La tabla distribuidores no tiene tenant_id; no se puede importar." });
    }
    if (!hasTrafos || !hasKva || !hasCli) {
      return res.status(503).json({
        error: "Faltan columnas en Neon",
        hint: "Ejecutá en la base la migración api/db/migrations/distribuidores_saidi_metrics.sql (trafos, kva_saidi, clientes_saidi).",
      });
    }
    const tenantId = req.tenantId;
    let out;
    await withTransaction(async (client) => {
      out = await mergeDistribuidoresSaidiFromExcelBuffer(req.file.buffer, tenantId, client, {
        hasTenantId: true,
        hasTrafos,
        hasKva,
        hasCli,
      });
    });
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: "No se pudo importar Excel SAIDI/SAIFI", detail: error.message });
  }
});

export default router;
