/**
 * Listado de tenants solo con clave técnico.
 * Router montado en httpApp ANTES de setupWizard para no depender del orden interno del otro router.
 */
import express from "express";
import { query } from "../db/neon.js";
import { requireTechnicianTenantKey } from "../middleware/technicianTenantKey.js";
import { technicianCompletarSetupInicialSave } from "../services/technicianCompletarSetupInicialSave.js";

const router = express.Router();

/** Misma sanitización que PUT /clientes/mi-configuración para operador técnico. */
function sanitizeBodyTechnicianMiConfig(raw) {
  const body = { ...(raw || {}) };
  const allowTop = new Set([
    "nombre",
    "tipo",
    "latitud",
    "longitud",
    "logo_url",
    "configuracion",
    "active_business_type",
  ]);
  for (const k of Object.keys(body)) {
    if (!allowTop.has(k)) delete body[k];
  }
  const cfgIn = body.configuracion;
  if (cfgIn && typeof cfgIn === "object" && !Array.isArray(cfgIn)) {
    const allowCfg = new Set([
      "setup_wizard_completado",
      "marca_publicada_admin",
      "abrir_wizard_recuperacion",
      "provincia",
      "state",
      "provincia_nominatim",
    ]);
    for (const k of Object.keys(cfgIn)) {
      if (!allowCfg.has(k)) delete cfgIn[k];
    }
  } else {
    delete body.configuracion;
  }
  return body;
}

router.get("/technician/tenants", requireTechnicianTenantKey, async (req, res) => {
  try {
    const r = await query(
      `SELECT id, nombre, tipo, COALESCE(activo, TRUE) AS activo
       FROM clientes
       ORDER BY id ASC
       LIMIT 500`
    );
    return res.json({ ok: true, clientes: r.rows || [] });
  } catch (e) {
    console.error("[setup/technician/tenants]", e);
    return res.status(500).json({ error: "No se pudo listar clientes", detail: e.message });
  }
});

/**
 * Completar setup inicial sin JWT (solo X-GestorNova-Technician-Key + tenant_id en cuerpo).
 * Usado desde el wizard antes del login cuando ya se listó y eligió un tenant.
 */
router.post("/technician/completar-setup-inicial", requireTechnicianTenantKey, async (req, res) => {
  try {
    const raw = req.body || {};
    const tenantId = Number(raw.tenant_id);
    if (!Number.isFinite(tenantId) || tenantId < 1) {
      return res.status(400).json({ error: "tenant_id inválido o faltante" });
    }
    const body = sanitizeBodyTechnicianMiConfig(raw);
    const nombre = body.nombre;
    const tipo = body.tipo;
    const lat = body.latitud;
    const lng = body.longitud;
    if (!nombre || String(nombre).trim() === "") {
      return res.status(400).json({ error: "nombre requerido" });
    }
    if (!tipo || String(tipo).trim() === "") {
      return res.status(400).json({ error: "tipo requerido" });
    }
    const la = lat != null ? Number(lat) : NaN;
    const lo = lng != null ? Number(lng) : NaN;
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      return res.status(400).json({ error: "latitud y longitud válidas requeridas" });
    }
    body.latitud = la;
    body.longitud = lo;

    const { cliente } = await technicianCompletarSetupInicialSave(tenantId, body);
    return res.json({ ok: true, tenant_id: tenantId, cliente });
  } catch (e) {
    if (e.status && e.json) {
      return res.status(e.status).json(e.json);
    }
    console.error("[setup/technician/completar-setup-inicial]", e);
    return res.status(500).json({ error: "No se pudo guardar la configuración inicial", detail: e.message });
  }
});

export default router;
