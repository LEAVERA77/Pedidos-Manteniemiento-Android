/**
 * Descarga Excel completo de distribuidores_red (API).
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
export async function descargarExcelRedElectricaCompleto(d) {
  const tok = d.getApiToken?.();
  if (!tok) {
    d.toast("Iniciá sesión con API (token) para exportar", "error");
    return;
  }
  const url = String(d.apiUrl("/api/admin/red-electrica/export") || "").replace(/\/+$/, "");
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
    const name = m?.[1] || `distribuidores_red_${day}.xlsx`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    d.toast("Excel de red eléctrica descargado", "success");
  } catch (e) {
    d.toastError("admin-red-electrica-export", e, "No se pudo descargar:");
  }
}
