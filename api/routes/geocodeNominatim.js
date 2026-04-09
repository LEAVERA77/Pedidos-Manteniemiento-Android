/**
 * Proxy Nominatim para el panel web (GitHub Pages no puede fetch directo a openstreetmap.org por CORS).
 * made by leavera77
 */
import express from "express";
import { authWithTenantHost } from "../middleware/auth.js";
import { nominatimProxySearch, nominatimProxyReverseRaw } from "../services/nominatimClient.js";

const router = express.Router();
router.use(authWithTenantHost);

router.post("/nominatim/search", async (req, res) => {
  try {
    const params =
      req.body?.params && typeof req.body.params === "object" && !Array.isArray(req.body.params)
        ? req.body.params
        : req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? req.body
          : {};
    const results = await nominatimProxySearch(params);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/nominatim/reverse", async (req, res) => {
  try {
    const hit = await nominatimProxyReverseRaw(req.body || {});
    res.json({ ok: true, result: hit });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("lat_lon")) {
      return res.status(400).json({ ok: false, error: msg });
    }
    res.status(502).json({ ok: false, error: msg });
  }
});

export default router;
