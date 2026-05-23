import express from "express";
import { authWithTenantHost, adminOrTecnicoIncidencias } from "../middleware/auth.js";
import { normalizarRubroCliente } from "../services/businessType.js";
import { query } from "../db/neon.js";
import { buscarPadronPorIdentificador, buscarPadronPorNombre } from "../services/padronBusquedaPedido.js";

const router = express.Router();

router.use(authWithTenantHost, adminOrTecnicoIncidencias);

/**
 * GET /api/padron-pedido/buscar-identificador?q=NIS|medidor|socio
 */
router.get("/buscar-identificador", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ ok: false, error: "Ingresá al menos 2 caracteres" });
    }
    const limit = Math.min(15, Math.max(1, Number(req.query.limit) || 12));
    const { matches } = await buscarPadronPorIdentificador(req.tenantId, q, limit);
    return res.json({ ok: true, matches });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Error en búsqueda" });
  }
});

/**
 * GET /api/padron-pedido/buscar-nombre?q=apellido
 */
router.get("/buscar-nombre", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ ok: false, error: "Ingresá al menos 2 caracteres" });
    }
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 15));
    let rubro = null;
    try {
      const r0 = await query(`SELECT tipo FROM clientes WHERE id = $1 LIMIT 1`, [req.tenantId]);
      rubro = normalizarRubroCliente(r0.rows?.[0]?.tipo);
    } catch (_) {}
    const { matches } = await buscarPadronPorNombre(req.tenantId, q, { rubro, limit });
    return res.json({ ok: true, matches });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Error en búsqueda" });
  }
});

export default router;
