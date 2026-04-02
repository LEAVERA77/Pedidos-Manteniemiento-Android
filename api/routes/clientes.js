import express from "express";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";

const router = express.Router();

async function getUserTenantId(userId) {
  try {
    const cols = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios'`
    );
    const hasTenant = cols.rows.some((c) => c.column_name === "tenant_id");
    const hasCliente = cols.rows.some((c) => c.column_name === "cliente_id");
    if (!hasTenant && !hasCliente) return 1;

    const sql = hasTenant
      ? "SELECT COALESCE(tenant_id, 1) AS tenant_id FROM usuarios WHERE id = $1 LIMIT 1"
      : "SELECT COALESCE(cliente_id, 1) AS tenant_id FROM usuarios WHERE id = $1 LIMIT 1";
    const r = await query(sql, [userId]);
    return Number(r.rows?.[0]?.tenant_id || 1);
  } catch (_) {
    return 1;
  }
}

router.get("/mi-configuracion", authMiddleware, async (req, res) => {
  try {
    const tenantId = await getUserTenantId(req.user.id);
    const r = await query(
      `SELECT id, nombre, tipo, plan, configuracion, activo, fecha_registro, fecha_actualizacion
       FROM clientes
       WHERE id = $1
       LIMIT 1`,
      [tenantId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado", tenant_id: tenantId });
    return res.json({ tenant_id: tenantId, cliente: r.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo consultar configuración", detail: error.message });
  }
});

router.put("/mi-configuracion", authMiddleware, async (req, res) => {
  try {
    if (req.user.rol !== "admin") return res.status(403).json({ error: "Requiere rol administrador" });

    const tenantId = await getUserTenantId(req.user.id);
    const { nombre, tipo, logo_url, latitud, longitud, configuracion = {} } = req.body || {};
    const cfgJson = {
      ...(configuracion || {}),
      ...(logo_url ? { logo_url } : {}),
      ...(latitud != null ? { lat_base: latitud } : {}),
      ...(longitud != null ? { lng_base: longitud } : {}),
    };

    const r = await query(
      `UPDATE clientes
       SET nombre = COALESCE($2, nombre),
           tipo = COALESCE($3, tipo),
           configuracion = COALESCE(configuracion, '{}'::jsonb) || $4::jsonb,
           fecha_actualizacion = NOW()
       WHERE id = $1
       RETURNING *`,
      [tenantId, nombre ?? null, tipo ?? null, JSON.stringify(cfgJson)]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado", tenant_id: tenantId });
    return res.json({ ok: true, tenant_id: tenantId, cliente: r.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar configuración", detail: error.message });
  }
});

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

