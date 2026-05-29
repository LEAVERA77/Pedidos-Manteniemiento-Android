/**
 * Pestaña admin «Subestaciones»: import Excel → subestaciones_catalogo (API Node).
 * made by leavera77
 */

import { importarExcelSubestacionesConConfirmacion } from "./admin-subestaciones-import-flow.js";
import { descargarExcelSubestacionesCompleto } from "./admin-subestaciones-export.js";
import { mostrarPanelResultadoImportacion } from "./admin-import-result-panel.js";

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
export function initAdminSubestacionesInfra(d) {
  if (_bound) return;
  const btnImp = document.getElementById("admin-subestaciones-btn-import");
  const btnExp = document.getElementById("admin-subestaciones-btn-export");
  const inp = document.getElementById("admin-subestaciones-file");
  const out = document.getElementById("admin-subestaciones-result");
  const ref = document.getElementById("admin-subestaciones-refresh");
  const status = document.getElementById("admin-subestaciones-file-status");
  if (!btnImp || !inp) return;
  _bound = true;

  const setStatus = (msg) => {
    if (status) status.textContent = msg || "";
  };

  const runImport = async (f) => {
    if (!f) {
      d.toast("Elegí un archivo Excel (.xlsx o .xls)", "warning");
      return;
    }
    const tok = d.getApiToken?.();
    if (!tok) {
      d.toast("Iniciá sesión con API (token) para importar", "error");
      return;
    }
    btnImp.disabled = true;
    try {
      await importarExcelSubestacionesConConfirmacion(d, f, out);
      setStatus(f.name ? `Último: ${f.name}` : "");
    } catch (e) {
      d.toastError("admin-subestaciones", e, "No se pudo importar");
      if (out) {
        mostrarPanelResultadoImportacion(out, {
          titulo: "No se pudo importar",
          lineas: [String(e && e.message ? e.message : e)],
          tipo: "error",
        });
      }
    } finally {
      btnImp.disabled = false;
    }
  };

  inp.addEventListener("change", async () => {
    const f = inp.files?.[0];
    if (!f) {
      setStatus("");
      return;
    }
    setStatus(`Archivo: ${f.name}`);
    const ok = window.confirm(
      `¿Importar "${f.name}" a Neon?\n\nSe actualizan transformadores existentes, se agregan nuevos y, si falta algún código en el Excel, te preguntamos si darlo de baja.`
    );
    if (ok) await runImport(f);
  });

  btnImp.addEventListener("click", async () => {
    const f = inp.files?.[0];
    if (!f) {
      d.toast("Elegí un archivo Excel primero", "warning");
      inp.click();
      return;
    }
    await runImport(f);
  });

  if (btnExp) {
    btnExp.addEventListener("click", () => descargarExcelSubestacionesCompleto(d));
  }

  if (ref) {
    ref.addEventListener("click", () => {
      void cargarListaSubestacionesInfra(d);
    });
  }
}

/**
 * @param {{ getApiToken: () => string | null | undefined; apiUrl: (p: string) => string; toast?: (m: string, t?: string) => void }} d
 */
export async function cargarListaSubestacionesInfra(d) {
  const tb = document.getElementById("admin-subestaciones-tbody");
  if (!tb) return;
  const tok = d.getApiToken?.();
  if (!tok) {
    tb.innerHTML =
      '<tr><td colspan="9" style="color:var(--tl);font-size:.78rem">Iniciá sesión con API para ver la tabla.</td></tr>';
    return;
  }
  tb.innerHTML =
    '<tr><td colspan="9" style="color:var(--tl);font-size:.78rem"><i class="fas fa-circle-notch fa-spin"></i> Cargando…</td></tr>';
  try {
    const url = String(d.apiUrl("/api/admin/subestaciones-catalogo") || "").replace(/\/+$/, "");
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = [j.error, j.hint].filter(Boolean).join(" — ") || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    const rows = j.rows || [];
    if (!rows.length) {
      tb.innerHTML =
        '<tr><td colspan="9" style="color:var(--tl);font-size:.78rem">Sin filas. Importá un Excel o ejecutá la migración en Neon.</td></tr>';
      return;
    }
    tb.innerHTML = rows
      .map(
        (row) =>
          `<tr>
  <td>${escCell(row.codigo)}</td>
  <td>${escCell(row.nombre)}</td>
  <td>${escCell(row.subestacion)}</td>
  <td>${escCell(row.distribuidor_codigo)}</td>
  <td style="text-align:right">${escCell(row.capacidad_kva)}</td>
  <td style="text-align:right">${escCell(row.clientes_conectados)}</td>
  <td>${escCell(row.barrio)}</td>
  <td>${escCell(row.alimentador)}</td>
  <td style="font-size:.72rem;color:var(--tl)">${escCell(row.updated_at || row.updatedAt || "")}</td>
</tr>`
      )
      .join("");
    try {
      window.dispatchEvent(new CustomEvent("gn-subestaciones-actualizada"));
    } catch (_) {}
    try {
      if (typeof window.cargarDistribuidores === "function") void window.cargarDistribuidores();
    } catch (_) {}
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="9" style="color:var(--re);font-size:.78rem">${escCell(String(e && e.message ? e.message : e))}</td></tr>`;
    try {
      d.toast?.(String(e && e.message ? e.message : e), "warning");
    } catch (_) {}
  }
}

/**
 * @param {{ esCooperativaElectricaRubro: () => boolean }} d
 */
export function syncAdminSubestacionesTabVisibility(d) {
  const tab = document.getElementById("admin-tab-subestaciones");
  if (!tab) return;
  const show = typeof d.esCooperativaElectricaRubro === "function" && d.esCooperativaElectricaRubro();
  tab.style.display = show ? "" : "none";
}
