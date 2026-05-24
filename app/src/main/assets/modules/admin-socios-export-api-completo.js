/**
 * Descarga Excel completo de socios_catalogo (todas las columnas Neon) vía API.
 * made by leavera77
 */

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   toast: (msg: string, type?: string) => void;
 *   toastError?: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 */
export async function descargarSociosExcelCompletoApi(d) {
  const tok = d.getApiToken?.();
  if (!tok) {
    d.toast("Iniciá sesión con API (token) para exportar", "error");
    return;
  }
  const base = String(d.apiUrl("/api/socios/exportar") || "").replace(/\/+$/, "");
  const url = `${base}?completo=1`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${r.status}`);
    }
    const blob = await r.blob();
    const day = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `socios_catalogo_completo_${day}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    d.toast("Excel completo de socios descargado", "success");
  } catch (e) {
    const msg = e?.message || String(e);
    if (typeof d.toastError === "function") d.toastError("socios-export-api", e, "No se pudo descargar:");
    else d.toast(msg, "error");
  }
}
