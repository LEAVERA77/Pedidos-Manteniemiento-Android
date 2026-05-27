/**
 * Resumen de salud para panel admin (API, BD, Nominatim, deploy).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { pingNominatimHealth } from "./nominatimHealthPing.js";

/**
 * @returns {Promise<Record<string, unknown>>}
 */
export async function buildAdminSistemaSalud() {
  const t0 = Date.now();
  let dbOk = false;
  let dbError = null;
  try {
    await query("SELECT 1");
    dbOk = true;
  } catch (e) {
    dbError = String(e?.message || e);
  }
  const dbMs = Date.now() - t0;

  const nominatim = await pingNominatimHealth();
  const nomOk =
    nominatim.disable_nominatim === true
      ? true
      : nominatim.nominatim_reachable === true;

  return {
    ok: dbOk && nomOk,
    checked_at: new Date().toISOString(),
    api: { ok: true, latency_ms: 0 },
    db: { ok: dbOk, latency_ms: dbMs, error: dbError },
    nominatim: {
      ok: nomOk,
      disabled: !!nominatim.disable_nominatim,
      reachable: nominatim.nominatim_reachable,
      latency_ms: nominatim.nominatim_latency_ms ?? null,
      http_status: nominatim.nominatim_http_status ?? null,
      base: nominatim.nominatim_effective_base ?? null,
      error: nominatim.nominatim_error ?? null,
    },
    deploy: {
      gitCommit:
        process.env.RENDER_GIT_COMMIT ||
        process.env.GIT_COMMIT ||
        process.env.SOURCE_VERSION ||
        null,
      node: process.version,
    },
  };
}
