/**
 * Admin: catálogo Subestaciones (transformadores) → subestaciones_catalogo.
 * made by leavera77
 */

import express from "express";
import multer from "multer";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query, withTransaction } from "../db/neon.js";
import {
  mergeSubestacionesCatalogoFromExcelBuffer,
  eliminarSubestacionesCatalogoPorCodigos,
} from "../services/subestacionesCatalogoExcelMerge.js";
import { buildSubestacionesCatalogoExcelBuffer } from "../services/subestacionesCatalogoExcelExport.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authWithTenantHost);

async function tablaSubestacionesCatalogoExiste() {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subestaciones_catalogo' LIMIT 1`
  );
  return (r.rows || []).length > 0;
}

router.post("/importar-subestaciones", adminOnly, upload.single("file"), async (req, res) => {
  try {
    if (!(await tablaSubestacionesCatalogoExiste())) {
      return res.status(503).json({
        error: "Tabla subestaciones_catalogo no existe",
        hint: "Ejecutá en Neon: api/db/migrations/subestaciones_catalogo.sql",
      });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: "Archivo requerido (campo file)" });
    const tenantId = req.tenantId;
    let out;
    await withTransaction(async (client) => {
      out = await mergeSubestacionesCatalogoFromExcelBuffer(req.file.buffer, tenantId, client);
    });
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: "No se pudo importar subestaciones", detail: error.message });
  }
});

router.post("/subestaciones/dar-de-baja", adminOnly, async (req, res) => {
  try {
    if (!(await tablaSubestacionesCatalogoExiste())) {
      return res.status(503).json({
        error: "Tabla subestaciones_catalogo no existe",
        hint: "Ejecutá en Neon: api/db/migrations/subestaciones_catalogo.sql",
      });
    }
    const codigos = Array.isArray(req.body?.codigos) ? req.body.codigos : [];
    if (!codigos.length) {
      return res.status(400).json({ error: "Indicá al menos un código en codigos[]" });
    }
    let out;
    await withTransaction(async (client) => {
      out = await eliminarSubestacionesCatalogoPorCodigos(req.tenantId, codigos, client);
    });
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: "No se pudo dar de baja transformador", detail: error.message });
  }
});

router.get("/subestaciones-catalogo", adminOnly, async (req, res) => {
  try {
    if (!(await tablaSubestacionesCatalogoExiste())) {
      return res.status(503).json({
        error: "Tabla subestaciones_catalogo no existe",
        hint: "Ejecutá en Neon: api/db/migrations/subestaciones_catalogo.sql",
      });
    }
    const r = await query(
      `SELECT id, codigo, nombre, subestacion, distribuidor_codigo, capacidad_kva, clientes_conectados,
              barrio, alimentador, localidad, created_at, updated_at
       FROM subestaciones_catalogo WHERE tenant_id = $1 ORDER BY codigo`,
      [req.tenantId]
    );
    res.json({ rows: r.rows || [] });
  } catch (error) {
    res.status(500).json({ error: "No se pudo listar subestaciones", detail: error.message });
  }
});

router.get("/subestaciones-catalogo/export", adminOnly, async (req, res) => {
  try {
    if (!(await tablaSubestacionesCatalogoExiste())) {
      return res.status(503).json({
        error: "Tabla subestaciones_catalogo no existe",
        hint: "Ejecutá en Neon: api/db/migrations/subestaciones_catalogo.sql",
      });
    }
    const r = await query(
      `SELECT id, tenant_id, codigo, nombre, subestacion, distribuidor_codigo, capacidad_kva, clientes_conectados,
              barrio, alimentador, localidad, created_at, updated_at
       FROM subestaciones_catalogo WHERE tenant_id = $1 ORDER BY codigo`,
      [req.tenantId]
    );
    const buf = buildSubestacionesCatalogoExcelBuffer(r.rows || []);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="subestaciones_catalogo_${day}.xlsx"`);
    res.send(buf);
  } catch (error) {
    res.status(500).json({ error: "No se pudo exportar subestaciones", detail: error.message });
  }
});

export default router;
