/**
 * Import Excel subestaciones: inserta/actualiza; bajas con confirmación por transformador.
 * made by leavera77
 */

import { cargarListaSubestacionesInfra } from "./admin-subestaciones-infra.js";
import {
  mostrarPanelResultadoImportacion,
  lineasResumenSubestacionesCatalogo,
} from "./admin-import-result-panel.js";

function numFallback(a, b) {
  const v = a != null ? a : b;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {{ codigo?: string, nombre?: string, subestacion?: string|null }} row
 */
function etiquetaTrafoSubestaciones(row) {
  const cod = String(row.codigo || "").trim();
  const nom = String(row.nombre || "").trim();
  const sub = String(row.subestacion || "").trim();
  let s = cod;
  if (nom && nom !== cod) s += ` — ${nom}`;
  if (sub) s += ` (${sub})`;
  return s || cod || "—";
}

/**
 * @param {Array<{ codigo?: string, nombre?: string, subestacion?: string|null }>} ausentes
 * @returns {Promise<string[]>}
 */
export async function confirmarBajasSubestacionesAusentes(ausentes) {
  const paraBaja = [];
  if (!ausentes?.length) return paraBaja;
  for (let i = 0; i < ausentes.length; i++) {
    const row = ausentes[i];
    const etiqueta = etiquetaTrafoSubestaciones(row);
    const ok = window.confirm(
      `${etiqueta}\n\nNo figura en el Excel que importaste (${i + 1} de ${ausentes.length}).\n\n` +
        `¿Confirmás que fue dado de baja y querés quitarlo del catálogo de transformadores?\n\n` +
        `Aceptar = dar de baja y eliminar de la lista\n` +
        `Cancelar = conservarlo en la base`
    );
    if (ok) paraBaja.push(String(row.codigo || "").trim());
  }
  return paraBaja.filter(Boolean);
}

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   toast: (msg: string, type?: string) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 * @param {string[]} codigos
 */
async function apiDarDeBajaSubestaciones(d, codigos) {
  const tok = d.getApiToken?.();
  if (!tok) throw new Error("Sin token de sesión");
  const url = String(d.apiUrl("/api/admin/subestaciones/dar-de-baja") || "").replace(/\/+$/, "");
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ codigos }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = [j.error, j.hint, j.detail].filter(Boolean).join(" — ");
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return j;
}

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   toast: (msg: string, type?: string) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 * @param {File} file
 * @param {HTMLElement|null} out
 */
export async function importarExcelSubestacionesConConfirmacion(d, file, out) {
  const tok = d.getApiToken?.();
  if (!tok) {
    d.toast("Iniciá sesión con API (token) para importar", "error");
    return;
  }
  const fd = new FormData();
  fd.append("file", file, file.name);
  if (out) {
    mostrarPanelResultadoImportacion(out, {
      titulo: "Importando subestaciones…",
      lineas: ["Leyendo el archivo y actualizando transformadores en Neon."],
      tipo: "info",
    });
  }
  const url = String(d.apiUrl("/api/admin/importar-subestaciones") || "").replace(/\/+$/, "");
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
  const ins = numFallback(j.insertados, j.inserted);
  const act = numFallback(j.actualizados, j.updated);
  const unc = numFallback(j.sin_cambios, j.unchanged);
  const ausentes = Array.isArray(j.ausentes_en_excel) ? j.ausentes_en_excel : [];

  let eliminados = 0;
  if (ausentes.length) {
    d.toast(
      `Excel aplicado (+${ins} nuevos, ${act} actualizados). ${ausentes.length} transformador(es) no están en el archivo: confirmá si fueron dados de baja.`,
      "info",
      7000
    );
    const codigosBaja = await confirmarBajasSubestacionesAusentes(ausentes);
    if (codigosBaja.length) {
      try {
        const baja = await apiDarDeBajaSubestaciones(d, codigosBaja);
        eliminados = numFallback(baja.eliminados, 0);
        if (eliminados > 0) {
          d.toast(`Se dieron de baja ${eliminados} transformador(es) del catálogo.`, "success");
        }
      } catch (e) {
        d.toastError("admin-subestaciones-baja", e, "No se pudieron dar de baja:");
      }
    } else {
      d.toast("Los transformadores ausentes en el Excel se conservaron en la base.", "info", 4500);
    }
  }

  const totalReportado = numFallback(j.total, j.total_excel_filas);
  const totalInferido = totalReportado > 0 ? totalReportado : ins + act + unc;
  let toastMsg;
  if (ausentes.length && eliminados === 0 && ins === 0 && act === 0 && unc > 0) {
    toastMsg = `Subestaciones: sin cambios en filas del Excel; se conservaron ${ausentes.length} transformador(es) que no estaban en el archivo.`;
  } else if (ins === 0 && act === 0 && unc > 0 && !ausentes.length) {
    toastMsg =
      totalInferido > 0 && unc >= totalInferido
        ? `Subestaciones: las filas del Excel ya coinciden con la base (${unc} sin cambios).`
        : `Subestaciones: +0 nuevos, 0 actualizados, ${unc} sin cambios.`;
  } else {
    const bajaTxt = eliminados > 0 ? `, ${eliminados} dado(s) de baja` : "";
    const conservTxt =
      ausentes.length && eliminados < ausentes.length
        ? `; ${ausentes.length - eliminados} conservado(s) (no estaban en el Excel)`
        : "";
    toastMsg = `Subestaciones: +${ins} nuevos, ${act} actualizados, ${unc} sin cambios${bajaTxt}${conservTxt}.`;
  }
  d.toast(toastMsg, "success", ins + act === 0 && unc > 0 && !eliminados ? 8500 : 5500);

  if (out) {
    const res = lineasResumenSubestacionesCatalogo(j, {
      eliminados,
      ausentes: ausentes.length,
      archivo: file.name,
    });
    mostrarPanelResultadoImportacion(out, {
      titulo: "Subestaciones — importación lista",
      lineas: res.lineas,
      detalle: res.detalle,
      tipo: res.tipo,
    });
  }

  await cargarListaSubestacionesInfra(d);
  try {
    window.dispatchEvent(new CustomEvent("gn-subestaciones-actualizada"));
  } catch (_) {}
  try {
    if (typeof window.cargarDistribuidores === "function") void window.cargarDistribuidores();
  } catch (_) {}
}
