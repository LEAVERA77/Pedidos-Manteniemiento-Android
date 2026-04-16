/**
 * Proxy Nominatim para el panel web + caché BD (menos 502 por rate limit; respuesta stale si OSM falla).
 * made by leavera77
 */
import express from "express";
import { authWithTenantHost } from "../middleware/auth.js";
import {
  nominatimHeaders,
  nominatimProxySearch,
  nominatimProxyReverseRaw,
  throttleIntervalMs,
  getNominatimBaseUrl,
} from "../services/nominatimClient.js";
import {
  ensureGeocodeNominatimCacheTable,
  cacheKeySearch,
  cacheKeyReverse,
  geocodeCacheGet,
  geocodeCacheSet,
} from "../services/geocodeNominatimCache.js";

const router = express.Router();

/** Detalle de fallo de `fetch` (Node/undici suele envolver el errno en `cause`). */
function fetchFailureDetail(e) {
  const err = e && typeof e === "object" ? e : {};
  const c = err.cause && typeof err.cause === "object" ? err.cause : null;
  return {
    message: String(err.message || e),
    code: err.code || c?.code || null,
    syscall: c?.syscall || null,
    errno: typeof c?.errno === "number" ? c.errno : null,
    address: c?.address || null,
    port: c?.port != null ? c.port : null,
  };
}

/**
 * Salud del geocode (sin auth): DISABLE_NOMINATIM + ping directo a OSM Nominatim.
 * GET /api/geocode/health
 */
router.get("/health", async (_req, res) => {
  const disabled =
    process.env.DISABLE_NOMINATIM === "1" || process.env.DISABLE_NOMINATIM === "true";
  const throttleMs = throttleIntervalMs();
  const base = {
    ok: true,
    disable_nominatim: disabled,
    nominatim_throttle_ms_nominal: throttleMs,
    nominatim_user_agent_set: Boolean(
      process.env.NOMINATIM_USER_AGENT || process.env.NOMINATIM_FROM_EMAIL || process.env.NOMINATIM_FROM
    ),
    note:
      "OSM no expone estado de rate limit por request; se respeta throttle local en nominatimClient.",
  };
  if (disabled) {
    return res.json({
      ...base,
      nominatim_reachable: null,
      nominatim_status: "skipped",
    });
  }
  const baseUrl = getNominatimBaseUrl();
  const url = `${baseUrl}/search?format=json&q=Rosario%20Argentina&limit=1`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: nominatimHeaders() });
    const ms = Date.now() - t0;
    const ok = r.ok;
    let sampleCount = null;
    if (ok) {
      try {
        const j = await r.json();
        sampleCount = Array.isArray(j) ? j.length : null;
      } catch (_) {
        sampleCount = null;
      }
    }
    return res.json({
      ...base,
      nominatim_effective_base: baseUrl,
      nominatim_reachable: ok,
      nominatim_http_status: r.status,
      nominatim_latency_ms: ms,
      nominatim_sample_results: sampleCount,
    });
  } catch (e) {
    const detail = fetchFailureDetail(e);
    return res.json({
      ...base,
      ok: false,
      nominatim_effective_base: baseUrl,
      nominatim_reachable: false,
      nominatim_error: String(e?.message || e),
      nominatim_fetch_detail: detail,
    });
  }
});

router.use(authWithTenantHost);

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cacheFresh(createdAt) {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && Date.now() - t < CACHE_TTL_MS;
}

router.post("/nominatim/search", async (req, res) => {
  try {
    await ensureGeocodeNominatimCacheTable();
    const params =
      req.body?.params && typeof req.body.params === "object" && !Array.isArray(req.body.params)
        ? req.body.params
        : req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? req.body
          : {};
    const key = cacheKeySearch(params);
    const hit = await geocodeCacheGet(key);
    if (hit && cacheFresh(hit.createdAt) && Array.isArray(hit.payload)) {
      return res.json({ ok: true, results: hit.payload, cached: true });
    }
    try {
      const results = await nominatimProxySearch(params);
      await geocodeCacheSet(key, "search", results);
      return res.json({ ok: true, results, cached: false });
    } catch (e) {
      const msg = String(e?.message || e);
      const qHint = String(params.q || params.street || "").trim().slice(0, 100);
      console.warn("[geocode-proxy] nominatim search upstream", msg, qHint ? `q≈${qHint}` : `key=${key}`);
      if (hit && Array.isArray(hit.payload)) {
        return res.json({
          ok: true,
          results: hit.payload,
          stale: true,
          stale_reason: "upstream_error_or_rate_limit_use_cached_payload",
          warning: msg,
        });
      }
      return res.status(503).json({ ok: false, error: msg, results: [] });
    }
  } catch (e) {
    console.error("[geocode-proxy] search", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/nominatim/reverse", async (req, res) => {
  try {
    await ensureGeocodeNominatimCacheTable();
    const body = req.body || {};
    const la = Number(body.lat);
    const lo = Number(body.lon ?? body.lng);
    const zoom = body.zoom != null ? String(body.zoom) : "8";
    const key = cacheKeyReverse(la, lo, zoom);
    if (key) {
      const hit = await geocodeCacheGet(key);
      if (hit && cacheFresh(hit.createdAt) && hit.payload && typeof hit.payload === "object") {
        return res.json({ ok: true, result: hit.payload, cached: true });
      }
    }
    try {
      const hit = await nominatimProxyReverseRaw(body);
      if (key) await geocodeCacheSet(key, "reverse", hit);
      return res.json({ ok: true, result: hit, cached: false });
    } catch (e) {
      const msg = String(e?.message || e);
      console.warn("[geocode-proxy] nominatim reverse upstream", msg);
      if (key) {
        const staleHit = await geocodeCacheGet(key);
        if (staleHit?.payload && typeof staleHit.payload === "object") {
          return res.json({
            ok: true,
            result: staleHit.payload,
            stale: true,
            stale_reason: "upstream_error_or_rate_limit_use_cached_payload",
            warning: msg,
          });
        }
      }
      if (msg.includes("lat_lon")) {
        return res.status(400).json({ ok: false, error: msg });
      }
      return res.status(503).json({ ok: false, error: msg });
    }
  } catch (e) {
    console.error("[geocode-proxy] reverse", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
