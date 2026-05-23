/**
 * Pestaña admin «Red Eléctrica»: import Excel → distribuidores_red (API Node).
 * made by leavera77
 */

import { importarExcelRedElectricaConConfirmacion } from "./admin-red-electrica-import-flow.js";

/** @type {boolean} */
let _bound = false;

function escCell(s) {
  return String(s != null ? s : "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   toast: (msg: string, type?: string, ms?: number) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 */
export function initAdminRedElectricaInfra(d) {
  if (_bound) return;

  const btn = document.getElementById("admin-red-electrica-btn");
  const inp = document.getElementById("admin-red-electrica-file");
  const out = document.getElementById("admin-red-electrica-result");
  const ref = document.getElementById("admin-red-electrica-refresh");
  if (!btn || !inp) return;

  _bound = true;

  btn.addEventListener("click", async () => {
    const f = inp.files && inp.files[0];
    if (!f) {
      d.toast("Elegí un archivo Excel (.xlsx o .xls)", "warning");
      return;
    }
    const tok = d.getApiToken?.();
    if (!tok) {
      d.toast("Iniciá sesión con API (token) para importar", "error");
      return;
    }
    btn.disabled = true;
    try {
      await importarExcelRedElectricaConConfirmacion(d, f, out);
    } catch (e) {
      d.toastError("admin-red-electrica", e, "No se pudo importar");
      if (out) out.textContent = String(e && e.message ? e.message : e);
    } finally {
      btn.disabled = false;
    }
  });

  if (ref) {
    ref.addEventListener("click", () => {
      void cargarListaRedElectricaInfra(d);
    });
  }
}

/**
 * @param {{ getApiToken: () => string | null | undefined; apiUrl: (p: string) => string; toast?: (m: string, t?: string) => void }} d
 */
export async function cargarListaRedElectricaInfra(d) {
  const tb = document.getElementById("admin-red-electrica-tbody");
  if (!tb) return;
  const tok = d.getApiToken?.();
  if (!tok) {
    tb.innerHTML =
      '<tr><td colspan="8" style="color:var(--tl);font-size:.78rem">Iniciá sesión con API para ver la tabla.</td></tr>';
    return;
  }
  tb.innerHTML =
    '<tr><td colspan="8" style="color:var(--tl);font-size:.78rem"><i class="fas fa-circle-notch fa-spin"></i> Cargando…</td></tr>';
  try {
    const url = String(d.apiUrl("/api/admin/red-electrica") || "").replace(/\/+$/, "");
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = [j.error, j.hint].filter(Boolean).join(" — ") || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    const rows = j.rows || [];
    if (!rows.length) {
      tb.innerHTML =
        '<tr><td colspan="8" style="color:var(--tl);font-size:.78rem">Sin filas. Importá un Excel o revisá la migración en Neon.</td></tr>';
      return;
    }
    tb.innerHTML = rows
      .map(
        (row) =>
          `<tr>
  <td>${escCell(row.codigo)}</td>
  <td>${escCell(row.nombre)}</td>
  <td>${escCell(row.localidad)}</td>
  <td style="text-align:right">${escCell(row.nivel_tension)}</td>
  <td style="text-align:right">${escCell(row.trafos)}</td>
  <td style="text-align:right">${escCell(row.kva)}</td>
  <td style="text-align:right">${escCell(row.clientes)}</td>
  <td style="font-size:.72rem;color:var(--tl)">${escCell(row.updated_at || row.updatedAt || "")}</td>
</tr>`
      )
      .join("");
    try {
      window.dispatchEvent(new CustomEvent("gn-red-electrica-actualizada"));
    } catch (_) {}
    try {
      if (typeof window.cargarDistribuidores === "function") void window.cargarDistribuidores();
    } catch (_) {}
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="8" style="color:var(--re);font-size:.78rem">${escCell(String(e && e.message ? e.message : e))}</td></tr>`;
    try {
      d.toast?.(String(e && e.message ? e.message : e), "warning");
    } catch (_) {}
  }
}

/**
 * Pestaña «Red Eléctrica»: visible en cooperativa eléctrica aunque el admin oculte
 * catálogo Distribuidores / métricas SAIDI (cfg `ocultar_modulos_redes`), porque acá se carga infra para estadísticas.
 * @param {{ esCooperativaElectricaRubro: () => boolean }} d
 */
export function syncAdminRedElectricaTabVisibility(d) {
  const tab = document.getElementById("admin-tab-red-electrica");
  if (!tab) return;
  const show = typeof d.esCooperativaElectricaRubro === "function" && d.esCooperativaElectricaRubro();
  tab.style.display = show ? "" : "none";
}
