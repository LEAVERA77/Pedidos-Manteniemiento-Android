/**
 * Pobla #di2 desde distribuidores_red (coop. eléctrica) o tabla distribuidores (otros rubros).
 * made by leavera77
 */

/** @param {string|number|null|undefined} t */
export function etiquetaGrupoTensionDi2(t) {
    const s = String(t ?? '').trim();
    if (!s) return 'Sin clasificar';
    const digits = s.replace(/[^\d]/g, '');
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n) || n <= 0) return s;
    return `${n} Kv`;
}

/**
 * @param {{ codigo?: string, nombre?: string, localidad?: string }} row
 */
function etiquetaOpcionDi2(row) {
    const cod = String(row.codigo || '').trim();
    const nom = String(row.nombre || '').trim();
    const loc = String(row.localidad || '').trim();
    let lbl = cod;
    if (nom) lbl = `${cod} - ${nom}`;
    if (loc && nom && norm(loc) !== norm(nom)) lbl += ` (${loc})`;
    return lbl || cod;
}

/** @param {string} s */
function norm(s) {
    return String(s || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/**
 * @param {{
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   tenantIdActual?: () => number;
 *   esc?: (v: unknown) => string;
 * }} deps
 */
async function tablaDistribuidoresRedExiste(deps) {
    try {
        const r = await deps.sqlSimple(
            `SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'distribuidores_red' LIMIT 1`
        );
        return !!(r.rows && r.rows.length);
    } catch (_) {
        return false;
    }
}

/**
 * @param {{
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   tenantIdActual?: () => number;
 *   esc?: (v: unknown) => string;
 * }} deps
 */
async function sqlWhereDistribuidoresRedTenant(deps) {
    if (typeof deps.esc !== 'function' || typeof deps.tenantIdActual !== 'function') return '';
    const tid = deps.tenantIdActual();
    if (!Number.isFinite(Number(tid)) || Number(tid) <= 0) return '';
    try {
        const r = await deps.sqlSimple(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'distribuidores_red' AND column_name = 'tenant_id' LIMIT 1`
        );
        if (!(r.rows && r.rows.length)) return '';
        return ` AND tenant_id = ${deps.esc(tid)}`;
    } catch (_) {
        return '';
    }
}

/**
 * @param {{
 *   sqlSimpleSelectAllPages: (q: string, order?: string) => Promise<{ rows?: Record<string, unknown>[] }>;
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   tenantIdActual?: () => number;
 *   esc?: (v: unknown) => string;
 * }} deps
 * @returns {Promise<Array<{ v: string, l: string, g: string }>>}
 */
export async function fetchFilasDi2DesdeRedElectrica(deps) {
    if (!(await tablaDistribuidoresRedExiste(deps))) return [];
    const wf = await sqlWhereDistribuidoresRedTenant(deps);
    const r = await deps.sqlSimpleSelectAllPages(
        `SELECT codigo, nombre, localidad, nivel_tension FROM distribuidores_red WHERE 1=1${wf}`,
        'ORDER BY nivel_tension NULLS LAST, codigo'
    );
    return (r.rows || []).map((row) => ({
        v: String(row.codigo || '').trim(),
        l: etiquetaOpcionDi2(row),
        g: etiquetaGrupoTensionDi2(row.nivel_tension),
    })).filter((d) => d.v);
}

/**
 * @param {{
 *   sqlSimpleSelectAllPages: (q: string, order?: string) => Promise<{ rows?: Record<string, unknown>[] }>;
 *   sqlWhereDistribuidoresPorTenantOUsadosEnPedidos: () => Promise<string>;
 * }} deps
 */
export async function fetchFilasDi2DesdeDistribuidores(deps) {
    const wf = await deps.sqlWhereDistribuidoresPorTenantOUsadosEnPedidos();
    const r = await deps.sqlSimpleSelectAllPages(
        `SELECT d.codigo, d.nombre, d.tension FROM distribuidores d WHERE d.activo = TRUE${wf}`,
        'ORDER BY d.codigo'
    );
    return (r.rows || []).map((d) => ({
        v: String(d.codigo || '').trim(),
        l: String(d.codigo || '') + ' - ' + String(d.nombre || ''),
        g: etiquetaGrupoTensionDi2(d.tension) || String(d.tension || '').trim() || 'Sin clasificar',
    })).filter((x) => x.v);
}

/**
 * @param {Array<{ v: string, l: string, g: string }>} filas
 * @param {string} etiquetaVacia
 */
export function renderSelectDi2(filas, etiquetaVacia) {
    const sd = document.getElementById('di2');
    if (!sd) return;
    const prev = sd.value;
    sd.innerHTML = `<option value="">${etiquetaVacia}</option>`;
    const grupos = {};
    for (const d of filas) {
        const g = d.g || 'Sin clasificar';
        if (!grupos[g]) grupos[g] = [];
        grupos[g].push(d);
    }
    Object.entries(grupos).forEach(([g, items]) => {
        const og = document.createElement('optgroup');
        og.label = g;
        for (const d of items) {
            const o = document.createElement('option');
            o.value = d.v;
            o.textContent = d.l;
            og.appendChild(o);
        }
        sd.appendChild(og);
    });
    if (prev && filas.some((d) => d.v === prev)) sd.value = prev;
}

/**
 * @param {{
 *   esCooperativaElectricaRubro: () => boolean;
 *   etiquetaZonaPedido: () => string;
 *   sqlSimpleSelectAllPages: (q: string, order?: string) => Promise<{ rows?: Record<string, unknown>[] }>;
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   sqlWhereDistribuidoresPorTenantOUsadosEnPedidos: () => Promise<string>;
 *   tenantIdActual?: () => number;
 *   esc?: (v: unknown) => string;
 * }} deps
 * @returns {Promise<Array<{ v: string, l: string, g: string }>>}
 */
export async function cargarSelectDi2Distribuidores(deps) {
    const lbl = deps.etiquetaZonaPedido();
    const vacio = `— Elegir ${lbl.toLowerCase()} —`;
    const lblEl = document.getElementById('lbl-di2-zona');
    if (lblEl) lblEl.textContent = lbl;

    let filas = [];
    if (deps.esCooperativaElectricaRubro()) {
        filas = await fetchFilasDi2DesdeRedElectrica(deps);
    }
    if (!filas.length) {
        filas = await fetchFilasDi2DesdeDistribuidores(deps);
    }

    renderSelectDi2(filas, vacio);
    return filas;
}
