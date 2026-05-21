/**
 * Listado admin Socios/NIS vía API (mismo patrón que admin-red-electrica-infra).
 * Fallback Neon directo si no hay token.
 * made by leavera77
 */
import { fetchSociosCatalogoListadoAdmin } from './socios-catalogo-listado-fetch.js';

/**
 * @param {{
 *   getApiToken?: () => string | null | undefined;
 *   apiUrl?: (p: string) => string;
 *   toast?: (m: string, t?: string) => void;
 *   ensureDeps: () => Promise<void>;
 *   pintarFilas: (rows: unknown[], extraKeys: string[]) => void;
 *   spinnerHtml: (sub?: string) => string;
 *   esc: (v: unknown) => string;
 *   sqlSimple?: (q: string) => Promise<{ rows?: unknown[] }>;
 *   sqlSimpleSelectAllPages?: (sel: string, ord: string) => Promise<{ rows?: unknown[] }>;
 *   tenantIdActual: () => number | string;
 *   empresaCfg?: () => object;
 * }} d
 */
export async function cargarListaSociosAdminRapido(d) {
    const cont = document.getElementById('lista-socios-admin');
    if (!cont) return;
    await d.ensureDeps();
    cont.innerHTML = d.spinnerHtml('');

    const tok = d.getApiToken?.();
    if (tok && d.apiUrl) {
        try {
            const url = String(d.apiUrl('/api/admin/socios-catalogo') || '').replace(/\/+$/, '');
            const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
                const msg = [j.error, j.hint, j.detail].filter(Boolean).join(' — ') || `HTTP ${r.status}`;
                throw new Error(msg);
            }
            d.pintarFilas(j.rows || [], j.extraKeys || []);
            return;
        } catch (e) {
            try {
                d.toast?.(`API socios: ${String(e?.message || e)}. Usando Neon…`, 'warning');
            } catch (_) {}
        }
    }

    if (typeof d.sqlSimple !== 'function') {
        throw new Error(
            tok
                ? 'No se pudo cargar socios por API y no hay conexión Neon en el navegador.'
                : 'Iniciá sesión con API o Neon para ver el catálogo de socios.'
        );
    }
    const { rows, extraKeys } = await fetchSociosCatalogoListadoAdmin({
        sqlSimple: d.sqlSimple,
        sqlSimpleSelectAllPages:
            d.sqlSimpleSelectAllPages ||
            (async (sel, ord) => {
                const r = await d.sqlSimple(`${sel} ${ord}`);
                return { rows: r.rows || [] };
            }),
        esc: d.esc,
        tenantIdActual: d.tenantIdActual,
        empresaCfg: typeof d.empresaCfg === 'function' ? d.empresaCfg() : d.empresaCfg,
        onProgress: (msg) => {
            cont.innerHTML = d.spinnerHtml(msg);
        },
    });
    d.pintarFilas(rows, extraKeys);
}
