import express from "express";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";

const router = express.Router();
router.use(authMiddleware, adminOnly);

router.get("/", async (_req, res) => {
  const r = await query("SELECT * FROM clientes ORDER BY id DESC");
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  try {
    const { nombre, tipo, plan = "basico", configuracion = {}, activo = true } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: "nombre y tipo requeridos" });
    const r = await query(
      `INSERT INTO clientes(nombre, tipo, plan, activo, configuracion, fecha_registro, fecha_actualizacion)
       VALUES($1,$2,$3,$4,$5::jsonb,NOW(),NOW()) RETURNING *`,
      [nombre, tipo, plan, !!activo, JSON.stringify(configuracion || {})]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "No se pudo crear cliente", detail: error.message });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, tipo, plan, activo, configuracion } = req.body;
  const r = await query(
    `UPDATE clientes
     SET nombre = COALESCE($2,nombre),
         tipo = COALESCE($3,tipo),
         plan = COALESCE($4,plan),
         activo = COALESCE($5,activo),
         configuracion = COALESCE($6::jsonb,configuracion),
         fecha_actualizacion = NOW()
     WHERE id = $1 RETURNING *`,
    [id, nombre ?? null, tipo ?? null, plan ?? null, activo ?? null, configuracion ? JSON.stringify(configuracion) : null]
  );
  if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado" });
  res.json(r.rows[0]);
});

router.delete("/:id", async (req, res) => {
  await query("UPDATE clientes SET activo = FALSE, fecha_actualizacion = NOW() WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;

