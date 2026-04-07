import express from "express";
import { query } from "../db/neon.js";
import { authWithTenantHost } from "../middleware/auth.js";
import { getUserTenantId } from "../utils/tenantUser.js";
import {
  getUbicacionCentralFromTable,
  setUbicacionCentralInTable,
} from "../services/configuracionStore.js";

const router = express.Router();

async function ubicacionDesdeClientesRow(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const r = await query(
    `SELECT nombre, configuracion FROM clientes WHERE id = $1 AND activo = TRUE LIMIT 1`,
    [tid]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  let cfg = row.configuracion;
  if (typeof cfg === "string") {
    try {
      cfg = JSON.parse(cfg);
    } catch (_) {
      cfg = {};
    }
  }
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const lat = Number(c.lat_base);
  const lng = Number(c.lng_base);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    zoom: 13,
    nombre: String(row.nombre || "").trim(),
  };
}

/**
 * Resuelve ubicación central: tabla `configuracion` primero, luego `clientes.configuracion`.
 */
export async function resolveUbicacionCentralPublic(tenantId) {
  const fromTab = await getUbicacionCentralFromTable(tenantId);
  if (fromTab) return fromTab;
  return ubicacionDesdeClientesRow(tenantId);
}

/**
 * GET /api/config/ubicacion-central
 * - Con Bearer: tenant del usuario.
 * - Sin Bearer: query `tenant_id` (entero ≥ 1) para la app embebida / WebView.
 */
router.get("/ubicacion-central", async (req, res) => {
  try {
    let tid = null;
    const auth = String(req.headers.authorization || "");
    if (auth.startsWith("Bearer ")) {
      try {
        const jwt = (await import("jsonwebtoken")).default;
        const secret = process.env.JWT_SECRET || "dev_secret";
        const token = auth.slice(7);
        const decoded = jwt.verify(token, secret);
        if (decoded?.userId) {
          tid = await getUserTenantId(decoded.userId);
          if (decoded.tenant_id != null && Number.isFinite(Number(decoded.tenant_id))) {
            if (Number(decoded.tenant_id) !== Number(tid)) {
              return res.status(403).json({ error: "Token no válido para este tenant" });
            }
          }
        }
      } catch (_) {
        /* seguir con tenant_id query */
      }
    }
    if (tid == null) {
      tid = Number(req.query.tenant_id);
    }
    if (!Number.isFinite(tid) || tid < 1) {
      return res.status(400).json({ error: "tenant_id requerido o token inválido" });
    }
    const u = await resolveUbicacionCentralPublic(tid);
    if (!u) {
      return res.status(404).json({ error: "ubicacion_central_no_configurada", tenant_id: tid });
    }
    return res.json({
      lat: u.lat,
      lng: u.lng,
      zoom: u.zoom,
      nombre: u.nombre || "",
      tenant_id: tid,
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo leer ubicación central", detail: error.message });
  }
});

router.put("/ubicacion-central", authWithTenantHost, async (req, res) => {
  try {
    const rol = String(req.user.rol || "").toLowerCase();
    if (rol !== "admin" && rol !== "administrador") {
      return res.status(403).json({ error: "Requiere rol administrador" });
    }
    const tenantId = req.tenantId;
    const body = req.body || {};
    const lat = body.lat;
    const lng = body.lng;
    const zoom = body.zoom;
    const nombre = body.nombre;
    const saved = await setUbicacionCentralInTable(tenantId, { lat, lng, zoom, nombre });
    const cfgMerge = {
      lat_base: saved.lat,
      lng_base: saved.lng,
    };
    await query(
      `UPDATE clientes
       SET configuracion = COALESCE(configuracion, '{}'::jsonb) || $2::jsonb,
           fecha_actualizacion = NOW()
       WHERE id = $1`,
      [tenantId, JSON.stringify(cfgMerge)]
    );
    return res.json({
      ok: true,
      tenant_id: tenantId,
      lat: saved.lat,
      lng: saved.lng,
      zoom: saved.zoom,
      nombre: saved.nombre,
    });
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg === "lat_lng_invalidos" || msg === "tenant_invalido") {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: "No se pudo guardar ubicación central", detail: error.message });
  }
});

export default router;
