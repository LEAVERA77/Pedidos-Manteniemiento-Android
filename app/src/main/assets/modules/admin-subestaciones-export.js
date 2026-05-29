/**
 * Descarga Excel completo de subestaciones_catalogo (API).
 * made by leavera77
 */

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   toast: (msg: string, type?: string) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 */
export async function descargarExcelSubestacionesCompleto(d) {
  const tok = d.getApiToken?.();
  if (!tok) {
    d.toast("Iniciá sesión con API (token) para exportar", "error");
    return;
  }
  const url = String(d.apiUrl("/api/admin/subestaciones-catalogo/export") || "").replace(/\/+$/, "");
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const msg = [j.error, j.hint, j.detail].filter(Boolean).join(" — ");
      throw new Error(msg || `HTTP ${r.status}`);
    }
    const blob = await r.blob();
    const disp = r.headers.get("Content-Disposition") || "";
    const m = /filename="?([^";]+)"?/i.exec(disp);
    const day = new Date().toISOString().slice(0, 10);
    const name = m?.[1] || `subestaciones_catalogo_${day}.xlsx`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    d.toast("Excel de subestaciones descargado", "success");
  } catch (e) {
    d.toastError("admin-subestaciones-export", e, "No se pudo descargar:");
  }
}
