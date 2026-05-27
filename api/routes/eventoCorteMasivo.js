/**
 * Evento de corte masivo (tormenta / sector): preview + incidencia + asignación técnico.
 * made by leavera77
 */
import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import {
  listarCatalogosEventoCorte,
  buscarPedidosEventoCorte,
  ejecutarEventoCorteMasivo,
} from "../services/eventoCorteMasivo.js";

const router = express.Router();
router.use(authWithTenantHost);
router.use(adminOnly);

router.get("/catalogos", async (req, res) => {
  try {
    const data = await listarCatalogosEventoCorte(req);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: "No se pudieron cargar catálogos", detail: error.message });
  }
});

router.post("/vista-previa", async (req, res) => {
  try {
    const result = await buscarPedidosEventoCorte(req, {
      tipo: req.body?.tipo,
      valor: req.body?.valor ?? req.body?.codigo,
      solo_sin_incidencia: req.body?.solo_sin_incidencia,
    });
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "No se pudo generar vista previa", detail: error.message });
  }
});

router.post("/ejecutar", async (req, res) => {
  try {
    const result = await ejecutarEventoCorteMasivo(req, req.body || {});
    if (!result.ok) {
      const payload = { error: result.error };
      if (result.detail) payload.detail = result.detail;
      return res.status(result.status || 400).json(payload);
    }
    return res.status(result.status || 201).json(result);
  } catch (error) {
    return res.status(500).json({ error: "No se pudo ejecutar evento", detail: error.message });
  }
});

export default router;
