/**
 * Pobla #trafo-pedido desde subestaciones_catalogo (carga manual mapa/oficina).
 * Con NIS/padrón socio, pedido-nuevo-aplicar-padron sigue usando transformador del socio.
 * made by leavera77
 */

const DATALIST_ID = "ped-trafo-subestaciones-datalist";

/**
 * @param {{
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   sqlSimpleSelectAllPages?: (q: string, order?: string) => Promise<{ rows?: Record<string, unknown>[] }>;
 *   esc?: (v: unknown) => string;
 *   tenantIdActual?: () => number;
 *   getApiToken?: () => string | null | undefined;
 *   apiUrl?: (p: string) => string;
 * }} deps
 */
async function tablaSubestacionesCatalogoExiste(deps) {
  try {
    const r = await deps.sqlSimple(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subestaciones_catalogo' LIMIT 1`
    );
    return !!(r.rows && r.rows.length);
  } catch (_) {
    return false;
  }
}

async function sqlWhereSubestacionesTenant(deps) {
  if (typeof deps.esc !== "function" || typeof deps.tenantIdActual !== "function") return "";
  const tid = deps.tenantIdActual();
  if (!Number.isFinite(Number(tid)) || Number(tid) <= 0) return "";
  return ` AND tenant_id = ${deps.esc(tid)}`;
}

/**
 * @param {Array<{ codigo: string, label?: string }>} items
 */
export function renderTrafoPedidoDatalistSubestaciones(items) {
  const inp = document.getElementById("trafo-pedido");
  if (!inp) return;
  let dl = document.getElementById(DATALIST_ID);
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = DATALIST_ID;
    inp.closest(".fg")?.appendChild(dl) || inp.parentElement?.appendChild(dl);
  }
  dl.innerHTML = "";
  for (const it of items) {
    const o = document.createElement("option");
    o.value = it.codigo;
    if (it.label && it.label !== it.codigo) o.label = it.label;
    dl.appendChild(o);
  }
  if (items.length) inp.setAttribute("list", DATALIST_ID);
  else inp.removeAttribute("list");
}

/**
 * @param {{
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   sqlSimpleSelectAllPages?: (q: string, order?: string) => Promise<{ rows?: Record<string, unknown>[] }>;
 *   esc?: (v: unknown) => string;
 *   tenantIdActual?: () => number;
 *   getApiToken?: () => string | null | undefined;
 *   apiUrl?: (p: string) => string;
 * }} deps
 * @returns {Promise<Array<{ codigo: string, label: string }>>}
 */
export async function fetchTrafosSubestacionesCatalogo(deps) {
  if (!(await tablaSubestacionesCatalogoExiste(deps))) {
    return fetchTrafosSubestacionesViaApi(deps);
  }
  try {
    const wf = await sqlWhereSubestacionesTenant(deps);
    const q = `SELECT codigo, nombre, subestacion FROM subestaciones_catalogo WHERE 1=1${wf}`;
    const r = deps.sqlSimpleSelectAllPages
      ? await deps.sqlSimpleSelectAllPages(q, "ORDER BY codigo")
      : await deps.sqlSimple(`${q} ORDER BY codigo LIMIT 3000`);
    const out = [];
    const seen = new Set();
    for (const row of r.rows || []) {
      const cod = String(row.codigo || "").trim();
      if (!cod) continue;
      const k = cod.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const nom = String(row.nombre || "").trim();
      const sub = String(row.subestacion || "").trim();
      let label = cod;
      if (nom && nom !== cod) label = `${cod} — ${nom}`;
      if (sub) label += ` (${sub})`;
      out.push({ codigo: cod, label });
    }
    if (out.length) return out;
  } catch (e) {
    console.warn("[pedido-trafo-subestaciones] sql", e?.message || e);
  }
  return fetchTrafosSubestacionesViaApi(deps);
}

async function fetchTrafosSubestacionesViaApi(deps) {
  const tok = deps.getApiToken?.();
  const apiUrl = deps.apiUrl;
  if (!tok || typeof apiUrl !== "function") return [];
  try {
    const url = String(apiUrl("/api/admin/subestaciones-catalogo") || "").replace(/\/+$/, "");
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return [];
    const out = [];
    const seen = new Set();
    for (const row of j.rows || []) {
      const cod = String(row.codigo || "").trim();
      if (!cod) continue;
      const k = cod.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const nom = String(row.nombre || "").trim();
      out.push({ codigo: cod, label: nom && nom !== cod ? `${cod} — ${nom}` : cod });
    }
    return out;
  } catch (_) {
    return [];
  }
}

/**
 * @param {{
 *   esCooperativaElectricaRubro: () => boolean;
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   sqlSimpleSelectAllPages?: (q: string, order?: string) => Promise<{ rows?: Record<string, unknown>[] }>;
 *   esc?: (v: unknown) => string;
 *   tenantIdActual?: () => number;
 *   getApiToken?: () => string | null | undefined;
 *   apiUrl?: (p: string) => string;
 * }} deps
 */
export async function cargarTrafoPedidoDesdeSubestacionesCatalogo(deps) {
  if (!deps.esCooperativaElectricaRubro()) {
    renderTrafoPedidoDatalistSubestaciones([]);
    return [];
  }
  const items = await fetchTrafosSubestacionesCatalogo(deps);
  renderTrafoPedidoDatalistSubestaciones(items);
  return items.map((x) => x.codigo);
}
