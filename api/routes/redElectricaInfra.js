/**
 * Admin: carga Excel infraestructura eléctrica → tabla distribuidores_red (Neon).
 * made by leavera77
 */

import express from "express";
import multer from "multer";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query, withTransaction } from "../db/neon.js";
import {
  mergeDistribuidoresRedFromExcelBuffer,
  eliminarDistribuidoresRedPorCodigos,
} from "../services/distribuidoresRedElectricaExcelMerge.js";
import { buildDistribuidoresRedExcelBuffer } from "../services/distribuidoresRedElectricaExcelExport.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authWithTenantHost);

async function tablaDistribuidoresRedExiste() {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'distribuidores_red' LIMIT 1`
  );
  return (r.rows || []).length > 0;
}

router.post("/importar-red-electrica", adminOnly, upload.single("file"), async (req, res) => {
  try {
    if (!(await tablaDistribuidoresRedExiste())) {
      return res.status(503).json({
        error: "Tabla distribuidores_red no existe",
        hint: "Ejecutá en Neon: api/db/migrations/distribuidores_red.sql",
      });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: "Archivo requerido (campo file)" });
    const tenantId = req.tenantId;
    let out;
    await withTransaction(async (client) => {
      out = await mergeDistribuidoresRedFromExcelBuffer(req.file.buffer, tenantId, client);
    });
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: "No se pudo importar red eléctrica", detail: error.message });
  }
});

router.post("/red-electrica/dar-de-baja", adminOnly, async (req, res) => {
  try {
    if (!(await tablaDistribuidoresRedExiste())) {
      return res.status(503).json({
        error: "Tabla distribuidores_red no existe",
        hint: "Ejecutá en Neon: api/db/migrations/distribuidores_red.sql",
      });
    }
    const codigos = Array.isArray(req.body?.codigos) ? req.body.codigos : [];
    if (!codigos.length) {
      return res.status(400).json({ error: "Indicá al menos un código en codigos[]" });
    }
    let out;
    await withTransaction(async (client) => {
      out = await eliminarDistribuidoresRedPorCodigos(req.tenantId, codigos, client);
    });
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: "No se pudo dar de baja en red eléctrica", detail: error.message });
  }
});

router.get("/red-electrica", adminOnly, async (req, res) => {
  try {
    if (!(await tablaDistribuidoresRedExiste())) {
      return res.status(503).json({
        error: "Tabla distribuidores_red no existe",
        hint: "Ejecutá en Neon: api/db/migrations/distribuidores_red.sql",
      });
    }
    const r = await query(
      `SELECT id, codigo, nombre, localidad, nivel_tension, COALESCE(nivel_tension_kv_decimal, FALSE) AS nivel_tension_kv_decimal, trafos, kva, clientes, created_at, updated_at
       FROM distribuidores_red WHERE tenant_id = $1 ORDER BY codigo`,
      [req.tenantId]
    );
    res.json({ rows: r.rows || [] });
  } catch (error) {
    res.status(500).json({ error: "No se pudo listar red eléctrica", detail: error.message });
  }
});

router.get("/red-electrica/export", adminOnly, async (req, res) => {
  try {
    if (!(await tablaDistribuidoresRedExiste())) {
      return res.status(503).json({
        error: "Tabla distribuidores_red no existe",
        hint: "Ejecutá en Neon: api/db/migrations/distribuidores_red.sql",
      });
    }
    const r = await query(
      `SELECT id, tenant_id, codigo, nombre, localidad, nivel_tension, COALESCE(nivel_tension_kv_decimal, FALSE) AS nivel_tension_kv_decimal, trafos, kva, clientes, created_at, updated_at
       FROM distribuidores_red WHERE tenant_id = $1 ORDER BY codigo`,
      [req.tenantId]
    );
    const buf = buildDistribuidoresRedExcelBuffer(r.rows || []);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="distribuidores_red_${day}.xlsx"`);
    res.send(buf);
  } catch (error) {
    res.status(500).json({ error: "No se pudo exportar red eléctrica", detail: error.message });
  }
});

export default router;
