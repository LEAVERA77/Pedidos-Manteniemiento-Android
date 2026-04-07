import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { query } from "../db/neon.js";
import {
  TIPOS_RECLAMO_LEGACY,
  tiposReclamoParaClienteTipo,
  normalizarRubroCliente,
} from "../services/tiposReclamo.js";
import { setUbicacionCentralInTable } from "../services/configuracionStore.js";

const router = express.Router();

router.get("/mi-configuracion", authWithTenantHost, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const r = await query(
      `SELECT id, nombre, tipo, plan, configuracion, activo, fecha_registro, fecha_actualizacion, barrio
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

router.put("/mi-configuracion", authWithTenantHost, async (req, res) => {
  try {
    const rol = String(req.user.rol || "").toLowerCase();
    if (rol !== "admin" && rol !== "administrador") {
      return res.status(403).json({ error: "Requiere rol administrador" });
    }

    const tenantId = req.tenantId;
    const body = req.body || {};
    const { nombre, tipo, latitud, longitud, configuracion = {} } = body;
    const logo_url = Object.prototype.hasOwnProperty.call(body, "logo_url") ? body.logo_url : undefined;
    const barrioIn = Object.prototype.hasOwnProperty.call(body, "barrio") ? body.barrio : undefined;

    let tipoDb = null;
    if (tipo !== undefined && tipo !== null && String(tipo).trim() !== "") {
      const norm = normalizarRubroCliente(tipo);
      if (!norm) {
        return res.status(400).json({
          error: "Tipo de cliente no reconocido",
          detail: String(tipo),
          tipos_sugeridos: ["municipio", "cooperativa_electrica", "cooperativa_agua", "cooperativa", "empresa"],
        });
      }
      tipoDb = norm;
    }

    const cfgJson = {
      ...(typeof configuracion === "object" && configuracion ? configuracion : {}),
      ...(latitud != null ? { lat_base: latitud } : {}),
      ...(longitud != null ? { lng_base: longitud } : {}),
    };
    if (Object.prototype.hasOwnProperty.call(body, "logo_url")) {
      const v = logo_url;
      cfgJson.logo_url = v === "" || v == null ? null : String(v);
    }

    const params = [tenantId, nombre ?? null, tipoDb, JSON.stringify(cfgJson)];
    let sqlBarrio = "";
    if (barrioIn !== undefined) {
      const bv = barrioIn === null || barrioIn === "" ? null : String(barrioIn).trim();
      params.push(bv);
      sqlBarrio = `, barrio = $${params.length}`;
    }

    const r = await query(
      `UPDATE clientes
       SET nombre = COALESCE($2, nombre),
           tipo = COALESCE($3, tipo),
           configuracion = COALESCE(configuracion, '{}'::jsonb) || $4::jsonb
           ${sqlBarrio},
           fecha_actualizacion = NOW()
       WHERE id = $1
       RETURNING *`,
      params
    );
    if (!r.rows.length) return res.status(404).json({ error: "Cliente no encontrado", tenant_id: tenantId });
    const row = r.rows[0];
    let cfgMerged = row.configuracion;
    if (typeof cfgMerged === "string") {
      try {
        cfgMerged = JSON.parse(cfgMerged);
      } catch (_) {
        cfgMerged = {};
      }
    }
    const cM = cfgMerged && typeof cfgMerged === "object" ? cfgMerged : {};
    const la = cM.lat_base != null ? Number(cM.lat_base) : null;
    const lo = cM.lng_base != null ? Number(cM.lng_base) : null;
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      try {
        const z = cM.zoom_mapa != null ? Number(cM.zoom_mapa) : 13;
        await setUbicacionCentralInTable(tenantId, {
          lat: la,
          lng: lo,
          zoom: Number.isFinite(z) && z > 0 ? z : 13,
          nombre: row.nombre,
        });
      } catch (e) {
        console.warn("[clientes] sync ubicacion configuracion tabla", e?.message || e);
      }
    }
    return res.json({ ok: true, tenant_id: tenantId, cliente: row });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo actualizar configuración", detail: error.message });
  }
});

router.get("/tipos-reclamo", authWithTenantHost, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const r = await query(`SELECT tipo FROM clientes WHERE id = $1 LIMIT 1`, [tenantId]);
    const tipoCliente = r.rows?.[0]?.tipo ?? null;
    return res.json({
      tenant_id: tenantId,
      tipo_cliente: tipoCliente,
      tipos: tiposReclamoParaClienteTipo(tipoCliente),
      legacy_tipos: TIPOS_RECLAMO_LEGACY,
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudieron obtener tipos de reclamo", detail: error.message });
  }
});

router.use(authWithTenantHost, adminOnly);

router.get("/", async (req, res) => {
  const r = await query("SELECT * FROM clientes WHERE id = $1 LIMIT 1", [req.tenantId]);
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  try {
    const secret = String(process.env.PLATFORM_TENANT_SIGNUP_SECRET || "").trim();
    const hdr = String(req.headers["x-platform-signup"] || "").trim();
    if (!secret || hdr !== secret) {
      return res.status(403).json({
        error: "Alta de nuevos tenants deshabilitada desde la API",
        hint: "Definí PLATFORM_TENANT_SIGNUP_SECRET y enviá X-Platform-Signup, o creá la fila en Neon.",
      });
    }
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
  if (id !== Number(req.tenantId)) {
    return res.status(403).json({ error: "Solo podés modificar el tenant de tu sesión" });
  }
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
  const id = Number(req.params.id);
  if (id !== Number(req.tenantId)) {
    return res.status(403).json({ error: "Solo podés dar de baja el tenant de tu sesión" });
  }
  await query("UPDATE clientes SET activo = FALSE, fecha_actualizacion = NOW() WHERE id = $1", [id]);
  res.json({ ok: true });
});

export default router;
