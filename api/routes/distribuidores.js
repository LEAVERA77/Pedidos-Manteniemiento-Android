import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query, withTransaction } from "../db/neon.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const r = await query("SELECT * FROM distribuidores ORDER BY codigo");
  res.json(r.rows);
});

router.post("/", adminOnly, async (req, res) => {
  const { codigo, nombre, tension } = req.body;
  const r = await query(
    `INSERT INTO distribuidores(codigo, nombre, tension, activo)
     VALUES($1,$2,$3,TRUE)
     ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension
     RETURNING *`,
    [String(codigo || "").trim().toUpperCase(), nombre || null, tension || null]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, tension, activo } = req.body;
  const r = await query(
    `UPDATE distribuidores
     SET nombre = COALESCE($2,nombre), tension = COALESCE($3,tension), activo = COALESCE($4,activo)
     WHERE id = $1 RETURNING *`,
    [id, nombre ?? null, tension ?? null, activo ?? null]
  );
  if (!r.rows.length) return res.status(404).json({ error: "Distribuidor no encontrado" });
  res.json(r.rows[0]);
});

router.delete("/:id", adminOnly, async (req, res) => {
  await query("UPDATE distribuidores SET activo = FALSE WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

router.post("/import-excel", adminOnly, upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "Archivo requerido (file)" });
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    let ok = 0;
    await withTransaction(async (client) => {
      for (const row of rows) {
        const codigo = String(row.codigo || "").trim().toUpperCase();
        if (!codigo) continue;
        await client.query(
          `INSERT INTO distribuidores(codigo, nombre, tension, activo)
           VALUES($1,$2,$3,TRUE)
           ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension`,
          [codigo, row.nombre || null, row.tension || null]
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

