import express from "express";
import bcrypt from "bcryptjs";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import { tableHasColumn, usuariosTenantColumnName } from "../utils/tenantScope.js";

const router = express.Router();
router.use(authWithTenantHost, adminOnly);

router.get("/", async (_req, res) => {
  const col = await usuariosTenantColumnName();
  const r = col
    ? await query(
        `SELECT id, email, nombre, rol, activo, telefono, whatsapp_notificaciones FROM usuarios WHERE ${col} = $1 ORDER BY id`,
        [_req.tenantId]
      )
    : await query("SELECT id, email, nombre, rol, activo, telefono, whatsapp_notificaciones FROM usuarios ORDER BY id");
  res.json(r.rows);
});

router.get("/tecnicos", async (_req, res) => {
  const col = await usuariosTenantColumnName();
  const r = col
    ? await query(
        "SELECT id, email, nombre, rol, activo, telefono FROM usuarios WHERE rol IN ('tecnico','supervisor') AND activo = TRUE AND " +
          col +
          " = $1 ORDER BY nombre",
        [_req.tenantId]
      )
    : await query(
        "SELECT id, email, nombre, rol, activo, telefono FROM usuarios WHERE rol IN ('tecnico','supervisor') AND activo = TRUE ORDER BY nombre"
      );
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  try {
    const loginTrim = String(req.body?.usuario || req.body?.email || "").trim();
    const { nombre, rol = "tecnico", password, telefono } = req.body || {};
    if (!loginTrim || !password) return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    const hash = await bcrypt.hash(String(password), 10);
    const rolOperador = String(req.user?.rol || "").toLowerCase();
    const bodyTid = Number(req.body?.tenant_id);
    let insertTenantId = req.tenantId;
    if (
      (rolOperador === "admin" || rolOperador === "administrador") &&
      Number.isFinite(bodyTid) &&
      bodyTid > 0
    ) {
      insertTenantId = bodyTid;
    }
    const col = await usuariosTenantColumnName();
    const hasBt = await tableHasColumn("usuarios", "business_type");
    const rolL = String(rol || "").toLowerCase();
    let btVal = null;
    if (hasBt && rolL !== "admin" && rolL !== "administrador") {
      if (!col) {
        return res.status(400).json({
          error: "No se puede fijar línea de negocio: falta tenant_id/cliente_id en usuarios",
        });
      }
      const rC = await query(`SELECT active_business_type, tipo FROM clientes WHERE id = $1 LIMIT 1`, [insertTenantId]);
      const row = rC.rows?.[0];
      let bt = String(row?.active_business_type || "").trim().toLowerCase();
      if (bt !== "electricidad" && bt !== "agua" && bt !== "municipio") {
        const t = String(row?.tipo || "").toLowerCase();
        bt =
          t.includes("agua") || t.includes("cooperativa_agua")
            ? "agua"
            : t.includes("municipio")
              ? "municipio"
              : "electricidad";
      }
      btVal = bt;
    }
    const tel = telefono != null && String(telefono).trim() !== "" ? String(telefono).trim() : null;
    const hasTw = await tableHasColumn("usuarios", "telefono_whatsapp");

    if (!col) {
      if (hasBt && btVal != null) {
        const r = await query(
          `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, business_type)
           VALUES ($1,$2,$3,$4,TRUE,$5) RETURNING id, email, nombre, rol, activo`,
          [loginTrim, nombre || null, rol, hash, btVal]
        );
        return res.status(201).json(r.rows[0]);
      }
      const r = await query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo)
         VALUES ($1,$2,$3,$4,TRUE) RETURNING id, email, nombre, rol, activo`,
        [loginTrim, nombre || null, rol, hash]
      );
      return res.status(201).json(r.rows[0]);
    }

    if (hasBt && btVal != null) {
      if (hasTw && tel) {
        const r = await query(
          `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, business_type, telefono, telefono_whatsapp, whatsapp_notificaciones)
           VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7,$7,TRUE) RETURNING id, email, nombre, rol, activo`,
          [loginTrim, nombre || null, rol, hash, insertTenantId, btVal, tel]
        );
        return res.status(201).json(r.rows[0]);
      }
      const r = await query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, business_type)
         VALUES ($1,$2,$3,$4,TRUE,$5,$6) RETURNING id, email, nombre, rol, activo`,
        [loginTrim, nombre || null, rol, hash, insertTenantId, btVal]
      );
      return res.status(201).json(r.rows[0]);
    }

    if (hasTw && tel) {
      const r = await query(
        `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col}, telefono, telefono_whatsapp, whatsapp_notificaciones)
         VALUES ($1,$2,$3,$4,TRUE,$5,$6,$6,TRUE) RETURNING id, email, nombre, rol, activo`,
        [loginTrim, nombre || null, rol, hash, insertTenantId, tel]
      );
      return res.status(201).json(r.rows[0]);
    }
    const r = await query(
      `INSERT INTO usuarios (email, nombre, rol, password_hash, activo, ${col})
       VALUES ($1,$2,$3,$4,TRUE,$5) RETURNING id, email, nombre, rol, activo`,
      [loginTrim, nombre || null, rol, hash, insertTenantId]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    const msg = String(error?.message || error || "");
    if (/unique|duplicate key/i.test(msg)) {
      return res.status(409).json({ error: "Ese nombre de usuario ya existe", detail: msg });
    }
    res.status(500).json({ error: "No se pudo crear usuario", detail: msg });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, rol, telefono, whatsapp_notificaciones } = req.body;
    const col = await usuariosTenantColumnName();
    const r = col
      ? await query(
          `UPDATE usuarios
       SET nombre = COALESCE($2,nombre),
           rol = COALESCE($3,rol),
           telefono = COALESCE($4,telefono),
           whatsapp_notificaciones = COALESCE($5,whatsapp_notificaciones)
       WHERE id = $1 AND ${col} = $6
       RETURNING id, email, nombre, rol, activo, telefono, whatsapp_notificaciones`,
          [id, nombre ?? null, rol ?? null, telefono ?? null, whatsapp_notificaciones ?? null, req.tenantId]
        )
      : await query(
          `UPDATE usuarios
       SET nombre = COALESCE($2,nombre),
           rol = COALESCE($3,rol),
           telefono = COALESCE($4,telefono),
           whatsapp_notificaciones = COALESCE($5,whatsapp_notificaciones)
       WHERE id = $1
       RETURNING id, email, nombre, rol, activo, telefono, whatsapp_notificaciones`,
          [id, nombre ?? null, rol ?? null, telefono ?? null, whatsapp_notificaciones ?? null]
        );
    if (!r.rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(r.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "No se pudo actualizar usuario", detail: error.message });
  }
});

router.put("/:id/toggle-activo", async (req, res) => {
  const id = Number(req.params.id);
  const col = await usuariosTenantColumnName();
  const r = col
    ? await query(
        `UPDATE usuarios SET activo = NOT activo WHERE id = $1 AND ${col} = $2 RETURNING id, email, activo`,
        [id, req.tenantId]
      )
    : await query("UPDATE usuarios SET activo = NOT activo WHERE id = $1 RETURNING id, email, activo", [id]);
  if (!r.rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(r.rows[0]);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });
  const col = await usuariosTenantColumnName();
  const r = col
    ? await query(`UPDATE usuarios SET activo = FALSE WHERE id = $1 AND ${col} = $2 RETURNING id`, [id, req.tenantId])
    : await query("UPDATE usuarios SET activo = FALSE WHERE id = $1 RETURNING id", [id]);
  if (!r.rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json({ ok: true });
});

export default router;
