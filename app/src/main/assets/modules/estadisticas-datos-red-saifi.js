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
 * @param {{
 *   datosPack: { disponible: boolean; datos: Record<string, { clientes?: number }> } | null;
 *   distRawRows: Array<{ dist_raw?: string }>;
 *   nSociosCat: number;
 * }} p
 */
export function denominadorClientesConfiabilidad(p) {
  const nCat = Math.max(1, Number(p.nSociosCat) || 1);
  const pack = p.datosPack;
  if (!pack || pack.disponible === false || !pack.datos || !Object.keys(pack.datos).length) {
    return { n: nCat, fuente: "catalogo", parcial: false, sinDatosRed: true };
  }
  const datos = pack.datos;
  const codes = new Set();
  for (const row of p.distRawRows || []) {
    const c = codigoDistribuidorDesdeTextoPedido(row.dist_raw);
    if (c) codes.add(c);
  }
  let sum = 0;
  let faltantes = 0;
  for (const c of codes) {
    const cl = Number(datos[c]?.clientes);
    if (Number.isFinite(cl) && cl > 0) sum += cl;
    else faltantes++;
  }
  if (sum < 1) {
    return { n: nCat, fuente: "catalogo", parcial: !!codes.size, sinDatosRed: false };
  }
  return {
    n: Math.max(1, sum),
    fuente: "red",
    parcial: faltantes > 0,
    sinDatosRed: false,
  };
}
