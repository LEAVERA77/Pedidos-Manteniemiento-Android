import express from "express";
import { authWithTenantHost, adminOnly } from "../middleware/auth.js";
import { nominatimProxySearch } from "../services/nominatimClient.js";

const router = express.Router();
router.use(authWithTenantHost, adminOnly);

router.get("/search/cities", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ error: "q requerido (min 2)" });
    const hits = await nominatimProxySearch({
      q: `${q}, Argentina`,
      countrycodes: "ar",
      addressdetails: 1,
      limit: 12,
    });
    const out = [];
    const seen = new Set();
    for (const h of hits || []) {
      const a = h?.address || {};
      const ciudad = String(a.city || a.town || a.village || a.municipality || "").trim();
      const provincia = String(a.state || "").trim();
      if (!ciudad) continue;
      const key = `${ciudad.toLowerCase()}|${provincia.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ciudad, provincia });
    }
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: "No se pudo buscar ciudades", detail: e.message });
  }
});

router.get("/search/streets", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const city = String(req.query.city || "").trim();
    if (q.length < 2 || city.length < 2) {
      return res.status(400).json({ error: "q y city requeridos (min 2)" });
    }
    const hits = await nominatimProxySearch({
      q: `${q}, ${city}, Argentina`,
      countrycodes: "ar",
      addressdetails: 1,
      limit: 25,
    });
    const out = [];
    const seen = new Set();
    for (const h of hits || []) {
      const a = h?.address || {};
      const road = String(a.road || a.pedestrian || a.residential || "").trim();
      if (!road) continue;
      const k = road.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(road);
    }
    return res.json(out.slice(0, 20));
  } catch (e) {
    return res.status(500).json({ error: "No se pudo buscar calles", detail: e.message });
  }
});

router.get("/search/neighborhoods", async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();
    if (city.length < 2) return res.status(400).json({ error: "city requerido (min 2)" });
    const hits = await nominatimProxySearch({
      q: city,
      countrycodes: "ar",
      addressdetails: 1,
      limit: 40,
    });
    const out = [];
    const seen = new Set();
    for (const h of hits || []) {
      const a = h?.address || {};
      const b = String(a.neighbourhood || a.suburb || a.quarter || "").trim();
      if (!b) continue;
      const k = b.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
    return res.json(out.slice(0, 30));
  } catch (e) {
    return res.status(500).json({ error: "No se pudo buscar barrios", detail: e.message });
  }
});

export default router;
