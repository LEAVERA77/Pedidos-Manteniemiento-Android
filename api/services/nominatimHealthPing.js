/**
 * Ping mínimo a Nominatim (compartido: /api/geocode/health y admin sistema-salud).
 * made by leavera77
 */

import {
  nominatimFetch,
  throttleIntervalMs,
  getNominatimBaseUrl,
} from "./nominatimClient.js";

function fetchFailureDetail(e) {
  const err = e && typeof e === "object" ? e : {};
  const c = err.cause && typeof err.cause === "object" ? err.cause : null;
  return {
    message: String(err.message || e),
    code: err.code || c?.code || null,
  };
}

/**
 * @returns {Promise<Record<string, unknown>>}
 */
export async function pingNominatimHealth() {
  const disabled =
    process.env.DISABLE_NOMINATIM === "1" || process.env.DISABLE_NOMINATIM === "true";
  const base = {
    ok: true,
    disable_nominatim: disabled,
    nominatim_throttle_ms_nominal: throttleIntervalMs(),
    nominatim_user_agent_set: Boolean(
      process.env.NOMINATIM_USER_AGENT ||
        process.env.NOMINATIM_FROM_EMAIL ||
        process.env.NOMINATIM_FROM
    ),
  };
  if (disabled) {
    return {
      ...base,
      nominatim_reachable: null,
      nominatim_status: "skipped",
    };
  }
  const baseUrl = getNominatimBaseUrl();
  const url = `${baseUrl}/search?format=json&q=Rosario%20Argentina&limit=1`;
  const t0 = Date.now();
  try {
    const r = await nominatimFetch(url);
    const ms = Date.now() - t0;
    let sampleCount = null;
    if (r.ok) {
      try {
        const j = await r.json();
        sampleCount = Array.isArray(j) ? j.length : null;
      } catch (_) {
        sampleCount = null;
      }
    }
    return {
      ...base,
      ok: r.ok,
      nominatim_effective_base: baseUrl,
      nominatim_reachable: r.ok,
      nominatim_http_status: r.status,
      nominatim_latency_ms: ms,
      nominatim_sample_results: sampleCount,
    };
  } catch (e) {
    return {
      ...base,
      ok: false,
      nominatim_effective_base: baseUrl,
      nominatim_reachable: false,
      nominatim_error: String(e?.message || e),
      nominatim_fetch_detail: fetchFailureDetail(e),
    };
  }
}
