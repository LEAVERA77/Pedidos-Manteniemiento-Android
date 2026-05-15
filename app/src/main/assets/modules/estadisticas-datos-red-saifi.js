/**
 * Denominadores SAIDI/SAIFI con datos de infraestructura (tabla distribuidores_red vía API).
 * made by leavera77
 */

/**
 * @param {string} raw
 * @returns {string}
 */
export function codigoDistribuidorDesdeTextoPedido(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const up = s.toUpperCase();
  const idx = up.indexOf(" - ");
  if (idx >= 0) return s.slice(0, idx).trim().toUpperCase().replace(/\s+/g, "");
  const tok = s.split(/\s+/)[0];
  return String(tok || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   asegurarJwtApiRest?: () => Promise<void>;
 * }} d
 * @returns {Promise<{ disponible: boolean; datos: Record<string, { trafos: number; kva: number; clientes: number }> } | null>}
 */
export async function fetchDatosRedParaEstadisticas(d) {
  try {
    await d.asegurarJwtApiRest?.();
    const tok = d.getApiToken?.();
    if (!tok) return null;
    const url = String(d.apiUrl("/api/estadisticas/datos-red") || "").replace(/\/+$/, "");
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return null;
    return {
      disponible: !!j.disponible && j.datos && typeof j.datos === "object",
      datos: j.datos && typeof j.datos === "object" ? j.datos : {},
    };
  } catch (_) {
    return null;
  }
}

/**
 * Mapa código distribuidor → cantidad de socios (columna Dist. / distribuidor_codigo en Neon).
 * @param {Array<{ dist_raw?: string; n?: unknown }>} rows
 * @returns {Record<string, number>}
 */
export function buildMapaSociosPorCodigoDistribuidor(rows) {
  /** @type {Record<string, number>} */
  const map = {};
  for (const row of rows || []) {
    const code = codigoDistribuidorDesdeTextoPedido(row.dist_raw);
    if (!code) continue;
    const n = parseInt(row.n || 0, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    map[code] = (map[code] || 0) + n;
  }
  return map;
}

/**
 * Denominador SAIFI/SAIFI (usuarios servidos), prioridad Argentina coop. eléctrica:
 * 1) clientes en Red Eléctrica (distribuidores_red) por distribuidor afectado;
 * 2) socios activos en socios_catalogo por columna Dist. (distribuidor_codigo);
 * 3) total socios activos del tenant.
 *
 * @param {{
 *   datosPack: { disponible: boolean; datos: Record<string, { clientes?: number }> } | null;
 *   distRawRows: Array<{ dist_raw?: string }>;
 *   nSociosCat: number;
 *   sociosPorCodigo?: Record<string, number>;
 * }} p
 */
export function denominadorClientesConfiabilidad(p) {
  const nCat = Math.max(1, Number(p.nSociosCat) || 1);
  const codes = new Set();
  for (const row of p.distRawRows || []) {
    const c = codigoDistribuidorDesdeTextoPedido(row.dist_raw);
    if (c) codes.add(c);
  }

  const pack = p.datosPack;
  if (pack && pack.disponible !== false && pack.datos && Object.keys(pack.datos).length && codes.size) {
    const datos = pack.datos;
    let sum = 0;
    let faltantes = 0;
    for (const c of codes) {
      const cl = Number(datos[c]?.clientes);
      if (Number.isFinite(cl) && cl > 0) sum += cl;
      else faltantes++;
    }
    if (sum >= 1) {
      return {
        n: Math.max(1, sum),
        fuente: "red",
        parcial: faltantes > 0,
        sinDatosRed: false,
      };
    }
  }

  const sociosMap = p.sociosPorCodigo || {};
  if (codes.size && Object.keys(sociosMap).length) {
    let sumSoc = 0;
    let faltSoc = 0;
    for (const c of codes) {
      const n = Number(sociosMap[c]);
      if (Number.isFinite(n) && n > 0) sumSoc += n;
      else faltSoc++;
    }
    if (sumSoc >= 1) {
      return {
        n: Math.max(1, sumSoc),
        fuente: "socios_catalogo",
        parcial: faltSoc > 0,
        sinDatosRed: !pack || !pack.disponible,
      };
    }
  }

  const sinRed = !pack || pack.disponible === false || !pack.datos || !Object.keys(pack.datos || {}).length;
  return { n: nCat, fuente: "catalogo", parcial: !!codes.size, sinDatosRed: sinRed };
}
