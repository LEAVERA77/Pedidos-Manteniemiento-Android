/**
 * HTTP a Overpass con reintentos ante 429/503 y backoff exponencial.
 * Documentación uso fair: https://wiki.openstreetmap.org/wiki/Overpass_API
 * made by leavera77
 */

export function getOverpassInterpreterUrl() {
  return String(process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter").replace(/\/+$/, "");
}

export function overpassFetchTimeoutMs() {
  const v = parseInt(String(process.env.OVERPASS_TIMEOUT_MS || "10000"), 10);
  return Number.isFinite(v) && v >= 3000 && v <= 120000 ? v : 10000;
}

/** Pausa entre consultas consecutivas (p. ej. variantes de nombre de calle). Default 2s. */
export function overpassGapBetweenQueriesMs() {
  const v = parseInt(String(process.env.OVERPASS_GAP_BETWEEN_QUERIES_MS || "2000"), 10);
  return Number.isFinite(v) && v >= 0 && v <= 120000 ? v : 2000;
}

function maxRetriesEnv() {
  const v = parseInt(String(process.env.OVERPASS_MAX_RETRIES || "5"), 10);
  return Number.isFinite(v) && v >= 1 && v <= 12 ? v : 5;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST `data=...` al interpreter. Reintenta 429 y 503 con backoff (2s, 4s, 8s… cap 120s).
 * @param {string} query
 * @param {{ label?: string }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, data?: object, bodyText?: string }>}
 */
export async function postOverpassInterpreter(query, opts = {}) {
  const url = getOverpassInterpreterUrl();
  const label = opts.label != null ? String(opts.label) : "";
  const maxAttempts = maxRetriesEnv();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), overpassFetchTimeoutMs());
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: ac.signal,
      });
      clearTimeout(t);

      const retryable = response.status === 429 || response.status === 503 || response.status === 502 || response.status === 504;
      if (retryable) {
        const retryAfter = response.headers.get("Retry-After");
        const sec = retryAfter && /^\d+$/.test(retryAfter) ? parseInt(retryAfter, 10) : null;
        const backoff = sec != null && sec > 0 ? Math.min(120000, sec * 1000) : Math.min(120000, 1000 * Math.pow(2, attempt));
        const kind = response.status === 429 ? "rate limit (429)" : "servidor ocupado / timeout";
        console.warn(
          `[Overpass] HTTP ${response.status}${label ? ` (${label})` : ""} — ${kind}. Esperando ${Math.round(backoff / 1000)}s antes de reintentar (${attempt}/${maxAttempts}).`
        );
        if (attempt >= maxAttempts) {
          return { ok: false, status: response.status };
        }
        await sleep(backoff);
        continue;
      }

      if (!response.ok) {
        const txt = await response.text().catch(() => "");
        console.warn(`[Overpass] HTTP ${response.status}${label ? ` (${label})` : ""}`, txt ? txt.slice(0, 200) : "");
        return { ok: false, status: response.status, bodyText: txt };
      }

      const data = await response.json().catch(() => null);
      return { ok: true, status: response.status, data: data || {} };
    } catch (e) {
      clearTimeout(t);
      const msg = String(e?.message || e);
      const isAbort = /abort/i.test(msg);
      console.warn(`[Overpass] fetch error${label ? ` (${label})` : ""}:`, msg);
      if (attempt >= maxAttempts) {
        return { ok: false, status: 0 };
      }
      const backoff = Math.min(60000, 2000 * Math.pow(2, attempt - 1));
      await sleep(isAbort ? backoff : Math.min(backoff, 8000));
    }
  }
  return { ok: false, status: 0 };
}
