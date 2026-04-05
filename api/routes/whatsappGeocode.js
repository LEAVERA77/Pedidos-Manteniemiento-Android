import express from "express";
import { geocodeAddressArgentina, reverseGeocodeArgentina } from "../services/nominatimClient.js";

const router = express.Router();

const cache = new Map();
const TTL_MS = 3600000;
const MAX_CACHE = 500;

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    cache.delete(key);
    return null;
  }
  return e.val;
}

function cacheSet(key, val) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { val, exp: Date.now() + TTL_MS });
}

function allowInternal(req) {
  const secret = String(process.env.WHATSAPP_GEOCODE_SECRET || "").trim();
  if (!secret) return false;
  const h = String(req.headers["x-internal-token"] || "").trim();
  return h === secret;
}

/**
 * POST /api/whatsapp/geocode
 * Body: { query: "calle 1, ciudad" } o { lat, lng } para reverse.
 * Requiere header X-Internal-Token igual a WHATSAPP_GEOCODE_SECRET (si está definido).
 */
router.post("/geocode", async (req, res) => {
  if (!allowInternal(req)) {
    return res.status(401).json({ error: "Token interno requerido" });
  }
  try {
    const body = req.body || {};
    if (body.lat != null && body.lng != null) {
      const la = Number(body.lat);
      const lo = Number(body.lng);
      const ck = `r:${la.toFixed(5)},${lo.toFixed(5)}`;
      let hit = cacheGet(ck);
      if (!hit) {
        hit = await reverseGeocodeArgentina(la, lo);
        if (hit) cacheSet(ck, hit);
      }
      return res.json({ ok: true, reverse: hit });
    }
    const query = String(body.query || "").trim();
    if (query.length < 3) {
      return res.status(400).json({ error: "query demasiado corto" });
    }
    const ck = `f:${query.toLowerCase().slice(0, 200)}`;
    let hit = cacheGet(ck);
    if (!hit) {
      hit = await geocodeAddressArgentina(query);
      if (hit) cacheSet(ck, hit);
    }
    if (!hit) return res.json({ ok: true, forward: null });
    return res.json({
      ok: true,
      forward: {
        lat: hit.lat,
        lng: hit.lng,
        display_name: hit.displayName,
        ...(hit.barrio ? { barrio: hit.barrio } : {}),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "geocode_error", detail: error.message });
  }
});

export default router;
