/**
 * Import Excel red eléctrica: solo inserta/actualiza; bajas con confirmación por distribuidor.
 * made by leavera77
 */

import { cargarListaRedElectricaInfra } from "./admin-red-electrica-infra.js";
import {
  mostrarPanelResultadoImportacion,
  lineasResumenRedElectrica,
} from "./admin-import-result-panel.js";

function numFallback(a, b) {
  const v = a != null ? a : b;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {{ codigo?: string, nombre?: string, localidad?: string|null }} row
 */
function etiquetaDistribuidorRed(row) {
  const cod = String(row.codigo || "").trim();
  const nom = String(row.nombre || "").trim();
  const loc = String(row.localidad || "").trim();
  let s = cod;
  if (nom) s += ` — ${nom}`;
  if (loc) s += ` (${loc})`;
  return s || cod || "—";
}

/**
 * Pregunta por cada distribuidor que no vino en el Excel.
 * @param {Array<{ codigo?: string, nombre?: string, localidad?: string|null }>} ausentes
 * @returns {Promise<string[]>} códigos a dar de baja
 */
export async function confirmarBajasDistribuidoresRedAusentes(ausentes) {
  const paraBaja = [];
  if (!ausentes?.length) return paraBaja;

  for (let i = 0; i < ausentes.length; i++) {
    const row = ausentes[i];
    const etiqueta = etiquetaDistribuidorRed(row);
    const ok = window.confirm(
      `${etiqueta}\n\nNo figura en el Excel que importaste (${i + 1} de ${ausentes.length}).\n\n` +
        `¿Confirmás que fue dado de baja y querés quitarlo de la tabla de red eléctrica?\n\n` +
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
 *   toast: (msg: string, type?: string, ms?: number) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 * @param {string[]} codigos
 */
async function apiDarDeBajaDistribuidoresRed(d, codigos) {
  const tok = d.getApiToken?.();
  if (!tok) throw new Error("Sin token de sesión");
  const url = String(d.apiUrl("/api/admin/red-electrica/dar-de-baja") || "").replace(/\/+$/, "");
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
 *   toast: (msg: string, type?: string, ms?: number) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 * }} d
 * @param {File} file
 * @param {HTMLElement|null} out
 */
export async function importarExcelRedElectricaConConfirmacion(d, file, out) {
  const tok = d.getApiToken?.();
  if (!tok) {
    d.toast("Iniciá sesión con API (token) para importar", "error");
    return;
  }
  const fd = new FormData();
  fd.append("file", file, file.name);
  if (out) {
    mostrarPanelResultadoImportacion(out, {
      titulo: "Importando red eléctrica…",
      lineas: ["Leyendo el archivo y actualizando la base en Neon."],
      tipo: "info",
    });
  }
  const url = String(d.apiUrl("/api/admin/importar-red-electrica") || "").replace(/\/+$/, "");
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
      `Excel aplicado (+${ins} nuevos, ${act} actualizados). ${ausentes.length} distribuidor(es) no están en el archivo: confirmá si fueron dados de baja.`,
      "info",
      7000
    );
    const codigosBaja = await confirmarBajasDistribuidoresRedAusentes(ausentes);
    if (codigosBaja.length) {
      try {
        const baja = await apiDarDeBajaDistribuidoresRed(d, codigosBaja);
        eliminados = numFallback(baja.eliminados, 0);
        if (eliminados > 0) {
          d.toast(`Se dieron de baja ${eliminados} distribuidor(es) en la red eléctrica.`, "success");
        }
      } catch (e) {
        d.toastError("admin-red-electrica-baja", e, "No se pudieron dar de baja:");
      }
    } else {
      d.toast("Los distribuidores ausentes en el Excel se conservaron en la base.", "info", 4500);
    }
  }

  const totalReportado = numFallback(j.total, j.total_excel_filas);
  const totalInferido = totalReportado > 0 ? totalReportado : ins + act + unc;
  let toastMsg;
  if (ausentes.length && eliminados === 0 && ins === 0 && act === 0 && unc > 0) {
    toastMsg = `Red eléctrica: sin cambios en filas del Excel; se conservaron ${ausentes.length} distribuidor(es) que no estaban en el archivo.`;
  } else if (ins === 0 && act === 0 && unc > 0 && !ausentes.length) {
    if (totalInferido > 0 && unc >= totalInferido) {
      toastMsg = `Red eléctrica: las filas del Excel ya coinciden con la base (${unc} sin cambios). No se borró ningún registro.`;
    } else {
      toastMsg = `Red eléctrica: +0 nuevos, 0 actualizados, ${unc} sin cambios.`;
    }
  } else {
    const bajaTxt = eliminados > 0 ? `, ${eliminados} dado(s) de baja` : "";
    const conservTxt =
      ausentes.length && eliminados < ausentes.length
        ? `; ${ausentes.length - eliminados} conservado(s) (no estaban en el Excel)`
        : "";
    toastMsg = `Red eléctrica: +${ins} nuevos, ${act} actualizados, ${unc} sin cambios${bajaTxt}${conservTxt}.`;
  }
  d.toast(toastMsg, "success", ins + act === 0 && unc > 0 && !eliminados ? 8500 : 5500);

  if (out) {
    const res = lineasResumenRedElectrica(j, {
      eliminados,
      ausentes: ausentes.length,
      archivo: file.name,
    });
    mostrarPanelResultadoImportacion(out, {
      titulo: "Red eléctrica — importación lista",
      lineas: res.lineas,
      detalle: res.detalle,
      tipo: res.tipo,
    });
  }

  await cargarListaRedElectricaInfra(d);
  try {
    window.dispatchEvent(new CustomEvent("gn-red-electrica-actualizada"));
  } catch (_) {}
  try {
    if (typeof window.cargarDistribuidores === "function") void window.cargarDistribuidores();
  } catch (_) {}
}
