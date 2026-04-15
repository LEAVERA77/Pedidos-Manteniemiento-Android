/**
 * Direcciones: memorización de coordenadas manuales (tabla correcciones_direcciones).
 * POST /corregir — mismo upsert que PUT /api/pedidos/:id/coords-manual, sin fila de pedido.
 * made by leavera77
 */

import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { upsertCorreccionOperadorDesdePedido } from "../services/correccionesDirecciones.js";

const router = express.Router();
router.use(authWithTenantHost);

/**
 * Body: { calle, numero?, ciudad | localidad, lat, lng, provincia? }
 * tenantId sale del JWT (no hace falta tenantId en body).
 */
router.post("/corregir", adminOnly, async (req, res) => {
  try {
    const calle = String(req.body?.calle || "").trim();
    const ciudad = String(req.body?.ciudad || req.body?.localidad || "").trim();
    const numero = req.body?.numero != null ? String(req.body.numero).trim() : "";
    const prov =
      req.body?.provincia != null && String(req.body.provincia).trim()
        ? String(req.body.provincia).trim()
        : null;
    const la = Number(req.body?.lat);
    const ln = Number(req.body?.lng ?? req.body?.lon);
    if (!calle || !ciudad) {
      return res.status(400).json({ error: "calle y ciudad (o localidad) requeridos" });
    }
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      return res.status(400).json({ error: "lat y lng numéricos requeridos" });
    }
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) {
      return res.status(400).json({ error: "coordenadas fuera de rango WGS84" });
    }
    if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) {
      return res.status(400).json({ error: "No se aceptan coordenadas 0,0" });
    }

    const pedidoLike = {
      cliente_calle: calle,
      cliente_numero_puerta: numero || null,
      cliente_localidad: ciudad,
      provincia: prov,
    };

    const out = await upsertCorreccionOperadorDesdePedido({
      tenantId: Number(req.tenantId),
      pedido: pedidoLike,
      lat: la,
      lng: ln,
      usuarioId: req.user?.id ?? null,
    });

    if (!out.ok) {
      return res.status(400).json({
        ok: false,
        error: out.reason || "no_guardado",
        detail: out,
      });
    }

    return res.json({
      ok: true,
      id: out.id,
      updated: !!out.updated,
      message: "Ubicación guardada para futuros pedidos con la misma dirección.",
    });
  } catch (e) {
    console.error("[direcciones/corregir]", e);
    return res.status(500).json({ error: "Error al guardar corrección", detail: String(e?.message || e) });
  }
});

export default router;
