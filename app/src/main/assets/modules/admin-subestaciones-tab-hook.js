/**
 * Enganche adminTab('subestaciones') y orden de pestañas sin inflar app.js.
 * made by leavera77
 */

import { cargarListaSubestacionesInfra } from "./admin-subestaciones-infra.js";

const TAB_ID = "subestaciones";

/** @type {boolean} */
let _hooked = false;

/**
 * Al abrir la pestaña Subestaciones, carga la tabla vía API.
 */
export function installAdminSubestacionesTabHook() {
  if (_hooked || typeof window === "undefined") return;
  const orig = window.adminTab;
  if (typeof orig !== "function") return;

  function wrapped(tab) {
    orig.call(window, tab);
    if (tab !== TAB_ID) return;
    const pre = document.getElementById("admin-subestaciones-result");
    if (pre && !pre.querySelector(".gn-import-result-panel")) pre.style.display = "none";
    void cargarListaSubestacionesInfra({
      getApiToken: () => (typeof window.getApiToken === "function" ? window.getApiToken() : null),
      apiUrl: (p) => (typeof window.apiUrl === "function" ? window.apiUrl(p) : p),
      toast: (m, t) => {
        try {
          if (typeof window.toast === "function") window.toast(m, t);
        } catch (_) {}
      },
    });
  }
  wrapped.__gnSubestacionesHook = true;
  window.adminTab = wrapped;
  _hooked = true;
}
