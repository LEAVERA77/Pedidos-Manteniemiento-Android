/**
 * UI admin: distribuidores / ramales / barrios — import/export API.
 * made by leavera77
 */

import {
  importarExcelDistribuidoresCatalogo,
  descargarExcelDistribuidoresCatalogo,
} from "./admin-distribuidores-catalogo-import.js";

/** @type {boolean} */
let _bound = false;

/**
 * @param {Parameters<typeof importarExcelDistribuidoresCatalogo>[1]} d
 */
export function initAdminDistribuidoresCatalogoUi(d) {
  if (_bound) return;
  _bound = true;

  const inp = document.getElementById("input-excel-dist");
  const btnImp = document.getElementById("admin-distribuidores-btn-import");
  const btnExp = document.getElementById("admin-distribuidores-btn-export");
  const status = document.getElementById("admin-distribuidores-file-status");

  const setStatus = (msg) => {
    if (status) status.textContent = msg || "";
  };

  const runImport = async (file) => {
    if (!file) {
      d.toast?.("Elegí un archivo Excel (.xlsx o .xls)", "warning");
      return;
    }
    const tok = d.getApiToken?.();
    if (!tok) {
      d.toast?.("Iniciá sesión con API (token) para importar", "error");
      return;
    }
    await importarExcelDistribuidoresCatalogo({ target: { files: [file], value: "" } }, d);
    setStatus(file.name ? `Último: ${file.name}` : "");
  };

  if (inp) {
    inp.addEventListener("change", async () => {
      const f = inp.files?.[0];
      if (!f) {
        setStatus("");
        return;
      }
      setStatus(`Archivo: ${f.name}`);
      const ok = window.confirm(
        `¿Importar "${f.name}" a Neon?\n\nSe fusionará con el catálogo (actualiza existentes y agrega nuevos). No se borra nada sin tu confirmación.`
      );
      if (ok) await runImport(f);
    });
  }

  if (btnImp) {
    btnImp.addEventListener("click", async () => {
      const f = inp?.files?.[0];
      if (!f) {
        d.toast?.("Elegí un archivo Excel primero", "warning");
        inp?.click();
        return;
      }
      await runImport(f);
    });
  }

  if (btnExp) {
    btnExp.addEventListener("click", () => descargarExcelDistribuidoresCatalogo(d));
  }

  if (typeof window !== "undefined") {
    window.importarExcelDistribuidores = (ev) => importarExcelDistribuidoresCatalogo(ev, d);
  }
}
