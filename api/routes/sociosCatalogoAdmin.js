/**
 * Admin: listado rápido de socios_catalogo (mismo patrón que GET /api/admin/red-electrica).
 * made by leavera77
 */
import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { listSociosCatalogoAdmin } from "../services/sociosCatalogoAdminList.js";

const router = express.Router();
router.use(authWithTenantHost);

router.get("/socios-catalogo", adminOnly, async (req, res) => {
  try {
    const out = await listSociosCatalogoAdmin(req);
    res.json(out);
  } catch (error) {
    res.status(500).json({
      error: "No se pudo listar socios del catálogo",
      detail: error.message,
    });
  }
});

export default router;
