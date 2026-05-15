/**
 * Pestaña admin «Métricas SAIDI/SAIFI» (cooperativa eléctrica): import Excel vía API Node.
 * made by leavera77
 */

/** @type {boolean} */
let _bound = false;

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   esCooperativaElectricaRubro: () => boolean;
 *   debeOcultarTabDistribuidoresAdmin: () => boolean;
 *   toast: (msg: string, type?: string, ms?: number) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 */
export function initAdminSaidiDistribExcel(d) {
  if (_bound) return;
  _bound = true;

  const btn = document.getElementById("admin-saidi-excel-btn");
  const inp = document.getElementById("admin-saidi-excel-file");
  const out = document.getElementById("admin-saidi-excel-result");
  if (!btn || !inp) return;

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
    const fd = new FormData();
    fd.append("file", f, f.name);
    btn.disabled = true;
    if (out) {
      out.textContent = "Procesando…";
      out.style.display = "block";
    }
    try {
      const url = String(d.apiUrl("/api/distribuidores/import-saidi-excel") || "").replace(/\/+$/, "");
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = [j.error, j.hint, j.detail].filter(Boolean).join(" — ");
        throw new Error(msg || `HTTP ${r.status}`);
      }
      if (out) out.textContent = JSON.stringify(j, null, 2);
      d.toast(
        `Listo: +${j.inserted || 0} nuevos, ${j.updated || 0} actualizados, ${j.unchanged || 0} sin cambios.`,
        "success",
        5000
      );
      try {
        if (typeof window.cargarListaDistribuidoresAdmin === "function") void window.cargarListaDistribuidoresAdmin();
      } catch (_) {}
      try {
        if (typeof window.cargarDistribuidores === "function") void window.cargarDistribuidores();
      } catch (_) {}
    } catch (e) {
      d.toastError("admin-saidi-excel", e, "No se pudo importar");
      if (out) out.textContent = String(e && e.message ? e.message : e);
    } finally {
      btn.disabled = false;
    }
  });
}

/**
 * @param {{ esCooperativaElectricaRubro: () => boolean; debeOcultarTabDistribuidoresAdmin: () => boolean }} d
 */
export function syncAdminSaidiDistribTabVisibility(d) {
  const tab = document.getElementById("admin-tab-saidi-excel");
  if (!tab) return;
  const show = d.esCooperativaElectricaRubro() && !d.debeOcultarTabDistribuidoresAdmin();
  tab.style.display = show ? "" : "none";
}
