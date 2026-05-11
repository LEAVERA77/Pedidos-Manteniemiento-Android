import express from "express";
import { authWithTenantHost } from "../middleware/auth.js";
import { clasificarReclamoConGroq } from "../services/groqClassifier.js";

const router = express.Router();

/**
 * POST /api/ia/clasificar-reclamo
 * Body: { texto, tipo_negocio }
 * Requiere autenticación (admin o técnico del tenant).
 */
router.post("/clasificar-reclamo", authWithTenantHost, async (req, res) => {
  try {
    const texto = String(req.body?.texto || "").trim();
    const tipoNegocio = String(req.body?.tipo_negocio || "").trim();
    if (!texto) {
      return res.status(400).json({ ok: false, error: "texto es requerido" });
    }
    if (!tipoNegocio) {
      return res.status(400).json({ ok: false, error: "tipo_negocio es requerido" });
    }
    const result = await clasificarReclamoConGroq({ texto, tipoNegocio });
    if (!result.ok) {
      return res.status(502).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error("[ia/clasificar-reclamo]", error);
    return res.status(500).json({ ok: false, error: "Error interno al clasificar reclamo" });
  }
});

export default router;
