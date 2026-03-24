import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query, withTransaction } from "../db/neon.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authMiddleware, adminOnly);

router.get("/", async (req, res) => {
  const limit = Number(req.query.limit || 300);
  const r = await query("SELECT * FROM clientes_finales ORDER BY id DESC LIMIT $1", [limit]);
  res.json(r.rows);
});

router.get("/buscar", async (req, res) => {
  const nis = String(req.query.nis || "").trim();
  const medidor = String(req.query.medidor || "").trim();
  if (!nis && !medidor) return res.status(400).json({ error: "nis o medidor requerido" });
  const params = [];
  const where = [];
  if (nis) {
    params.push(nis);
    where.push(`nis = $${params.length}`);
  }
  if (medidor) {
    params.push(medidor);
    where.push(`medidor = $${params.length}`);
  }
  const r = await query(`SELECT * FROM clientes_finales WHERE ${where.join(" OR ")} LIMIT 200`, params);
  res.json(r.rows);
});

router.get("/:id/historial", async (req, res) => {
  const rcf = await query("SELECT nis, medidor FROM clientes_finales WHERE id = $1 LIMIT 1", [Number(req.params.id)]);
  if (!rcf.rows.length) return res.status(404).json({ error: "Cliente final no encontrado" });
  const { nis, medidor } = rcf.rows[0];
  const params = [];
  const where = [];
  if (nis) {
    params.push(nis);
    where.push(`nis = $${params.length}`);
  }
  if (medidor) {
    params.push(medidor);
    where.push(`medidor = $${params.length}`);
  }
  if (!where.length) return res.json([]);
  const r = await query(`SELECT * FROM pedidos WHERE ${where.join(" OR ")} ORDER BY fecha_creacion DESC`, params);
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  const d = req.body || {};
  const r = await query(
    `INSERT INTO clientes_finales(
      cliente_id, tipo, numero_cliente, nombre, apellido, telefono, email, calle, numero_puerta, barrio, localidad,
      latitud, longitud, nis, medidor, metadata, activo, fecha_registro
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
      $12,$13,$14,$15,$16::jsonb,COALESCE($17,TRUE),NOW()
    ) RETURNING *`,
    [
      d.cliente_id,
      d.tipo || "socio",
      d.numero_cliente || null,
      d.nombre || null,
      d.apellido || null,
      d.telefono || null,
      d.email || null,
      d.calle || null,
      d.numero_puerta || null,
      d.barrio || null,
      d.localidad || null,
      d.latitud ?? null,
      d.longitud ?? null,
      d.nis || null,
      d.medidor || null,
      JSON.stringify(d.metadata || {}),
      d.activo ?? true,
    ]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const d = req.body || {};
  const r = await query(
    `UPDATE clientes_finales SET
      tipo = COALESCE($2,tipo),
      numero_cliente = COALESCE($3,numero_cliente),
      nombre = COALESCE($4,nombre),
      apellido = COALESCE($5,apellido),
      telefono = COALESCE($6,telefono),
      email = COALESCE($7,email),
      calle = COALESCE($8,calle),
      numero_puerta = COALESCE($9,numero_puerta),
      barrio = COALESCE($10,barrio),
      localidad = COALESCE($11,localidad),
      latitud = COALESCE($12,latitud),
      longitud = COALESCE($13,longitud),
      nis = COALESCE($14,nis),
      medidor = COALESCE($15,medidor),
      metadata = COALESCE($16::jsonb,metadata),
      activo = COALESCE($17,activo)
     WHERE id = $1 RETURNING *`,
    [
      id,
      d.tipo ?? null,
      d.numero_cliente ?? null,
      d.nombre ?? null,
      d.apellido ?? null,
      d.telefono ?? null,
      d.email ?? null,
      d.calle ?? null,
      d.numero_puerta ?? null,
      d.barrio ?? null,
      d.localidad ?? null,
      d.latitud ?? null,
      d.longitud ?? null,
      d.nis ?? null,
      d.medidor ?? null,
      d.metadata ? JSON.stringify(d.metadata) : null,
      d.activo ?? null,
    ]
  );
  if (!r.rows.length) return res.status(404).json({ error: "Cliente final no encontrado" });
  res.json(r.rows[0]);
});

router.delete("/:id", async (req, res) => {
  await query("UPDATE clientes_finales SET activo = FALSE WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

router.post("/import-excel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Archivo requerido (file)" });
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    let ok = 0;
    await withTransaction(async (client) => {
      for (const row of rows) {
        await client.query(
          `INSERT INTO clientes_finales(cliente_id, tipo, numero_cliente, nombre, apellido, telefono, email, nis, medidor, activo, fecha_registro)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,NOW())`,
          [
            row.cliente_id || req.body.cliente_id,
            row.tipo || "socio",
            row.numero_cliente || null,
            row.nombre || null,
            row.apellido || null,
            row.telefono || null,
            row.email || null,
            row.nis || null,
            row.medidor || null,
          ]
        );
        ok += 1;
      }
    });
    res.json({ ok: true, importados: ok });
  } catch (error) {
    res.status(500).json({ error: "No se pudo importar Excel", detail: error.message });
  }
});

export default router;

