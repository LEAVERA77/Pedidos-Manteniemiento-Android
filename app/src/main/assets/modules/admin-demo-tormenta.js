/**
 * Botón demo: simular tormenta (~200 reclamos desde el padrón de socios).
 * made by leavera77
 */

/** @type {boolean} */
let _bound = false;

const LS_KEY_OCULTO = "gn_demo_tormenta_oculto";

/** Oculta el bloque demo si el flag local está activo (botón tenant técnico). */
function aplicarVisibilidadBloqueDemo() {
  try {
    const block = document.getElementById("gn-demo-tormenta-block");
    if (!block) return;
    block.style.display = localStorage.getItem(LS_KEY_OCULTO) === "1" ? "none" : "";
  } catch (_) {}
}

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   toast: (msg: string, type?: string, ms?: number) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 */
export function initAdminDemoTormenta(d) {
  aplicarVisibilidadBloqueDemo();
  if (_bound) return;
  const btn = document.getElementById("admin-demo-tormenta-btn");
  const status = document.getElementById("admin-demo-tormenta-status");
  if (!btn) return;
  _bound = true;

  const setStatus = (msg, esError) => {
    if (!status) return;
    status.textContent = msg || "";
    status.style.color = esError ? "var(--re)" : "var(--tl)";
  };

  btn.addEventListener("click", async () => {
    const tok = d.getApiToken?.();
    if (!tok) {
      d.toast("Iniciá sesión con API (token) para generar la demo", "error");
      return;
    }
    const ok = window.confirm(
      "¿Generar ~200 reclamos de demostración?\n\n" +
        "Simula una tormenta: muchos cortes agrupados por transformador y distribuidor, " +
        "más algunos reclamos sueltos, usando socios reales del padrón.\n\n" +
        "Los pedidos quedan en Pendiente, marcados [DEMO-TORMENTA] en la descripción. " +
        "Podés repetirlo todas las veces que quieras."
    );
    if (!ok) return;
    btn.disabled = true;
    setStatus("Generando reclamos…");
    try {
      const url = String(d.apiUrl("/api/admin/demo/tormenta") || "").replace(/\/+$/, "");
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ total: 200 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) {
        const msg = [j.error, j.detail].filter(Boolean).join(" — ") || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      const nTrafos = Array.isArray(j.trafos) ? j.trafos.length : 0;
      const nDist = Array.isArray(j.distribuidores) ? j.distribuidores.length : 0;
      const resumen = `Tormenta simulada: ${j.creados} reclamos (${nTrafos} trafos, ${nDist} distribuidores, ${j.sueltos || 0} sueltos).`;
      d.toast(resumen, "success", 8000);
      setStatus(resumen);
      try {
        if (typeof window.cargarPedidos === "function") await window.cargarPedidos();
      } catch (_) {}
    } catch (e) {
      d.toastError("admin-demo-tormenta", e, "No se pudo generar la demo:");
      setStatus(String(e?.message || e), true);
    } finally {
      btn.disabled = false;
    }
  });
}
