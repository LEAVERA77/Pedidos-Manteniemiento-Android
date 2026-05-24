/**
 * Import/export catálogo distribuidores / ramales / barrios vía API (fusionar, baja lógica).
 * made by leavera77
 */

/**
 * @param {Array<{ codigo?: string, nombre?: string, localidad?: string|null }>} ausentes
 * @param {string} etiquetaSing
 */
async function confirmarBajasCatalogoAusentes(ausentes, etiquetaSing) {
  const paraBaja = [];
  if (!ausentes?.length) return paraBaja;
  for (let i = 0; i < ausentes.length; i++) {
    const row = ausentes[i];
    const cod = String(row.codigo || "").trim();
    const nom = String(row.nombre || "").trim();
    const ok = window.confirm(
      `${cod}${nom ? ` — ${nom}` : ""}\n\nNo figura en el Excel (${i + 1} de ${ausentes.length}).\n\n` +
        `¿Confirmás que fue dado de baja?\n\nAceptar = marcar inactivo (no se borra de Neon)\nCancelar = conservarlo activo`
    );
    if (ok) paraBaja.push(cod);
  }
  return paraBaja.filter(Boolean);
}

function numFallback(a, b) {
  const v = a != null ? a : b;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function etiquetaZona(d) {
  if (typeof d.esMunicipioRubro === "function" && d.esMunicipioRubro()) return "barrio";
  if (typeof d.esCooperativaAguaRubro === "function" && d.esCooperativaAguaRubro()) return "ramal";
  return "distribuidor";
}

/**
 * @param {{
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: (path: string) => string;
 *   toast: (msg: string, type?: string, ms?: number) => void;
 *   toastError: (tag: string, err: unknown, pref?: string) => void;
 *   esMunicipioRubro?: () => boolean;
 *   esCooperativaAguaRubro?: () => boolean;
 *   mostrarOverlayImportacion?: (msg: string) => void;
 *   actualizarOverlayImportacion?: (msg: string) => void;
 *   ocultarOverlayImportacion?: () => void;
 *   cargarListaDistribuidoresAdmin?: () => void | Promise<void>;
 *   cargarDistribuidores?: () => void | Promise<void>;
 * }} d
 * @param {string[]} codigos
 */
async function apiDarDeBajaDistribuidoresCatalogo(d, codigos) {
  const tok = d.getApiToken?.();
  if (!tok) throw new Error("Sin token de sesión");
  const url = String(d.apiUrl("/api/distribuidores/dar-de-baja-codigos") || "").replace(/\/+$/, "");
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
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
 * @param {Parameters<typeof importarExcelDistribuidoresCatalogo>[1]} d
 * @param {File} file
 */
async function importarArchivoDistribuidoresCatalogo(d, file) {
  const tok = d.getApiToken?.();
  if (!tok) {
    d.toast("Iniciá sesión con API (token) para importar", "error");
    return;
  }
  const fd = new FormData();
  fd.append("file", file, file.name);
  d.mostrarOverlayImportacion?.(`Importando catálogo (fusionar con Neon)…`);
  const url = String(d.apiUrl("/api/distribuidores/import-excel") || "").replace(/\/+$/, "");
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

  const ins = numFallback(j.insertados, j.importados);
  const act = numFallback(j.actualizados, 0);
  const unc = numFallback(j.sin_cambios, 0);
  const ausentes = Array.isArray(j.ausentes_en_excel) ? j.ausentes_en_excel : [];

  let dadosDeBaja = 0;
  if (ausentes.length) {
    d.toast(
      `Excel aplicado. ${ausentes.length} ${etiquetaZona(d)}(s) no están en el archivo: confirmá si fueron dados de baja (quedan inactivos, no se borran).`,
      "info",
      7000
    );
    const codigosBaja = await confirmarBajasCatalogoAusentes(ausentes, etiquetaZona(d));
    if (codigosBaja.length) {
      try {
        const baja = await apiDarDeBajaDistribuidoresCatalogo(d, codigosBaja);
        dadosDeBaja = numFallback(baja.dados_de_baja, 0);
        if (dadosDeBaja > 0) {
          d.toast(`${dadosDeBaja} ${etiquetaZona(d)}(s) marcados inactivos (baja lógica).`, "success");
        }
      } catch (e) {
        d.toastError("distribuidores-baja", e, "No se pudieron dar de baja:");
      }
    } else {
      d.toast(`Se conservaron en la base los ${etiquetaZona(d)}s ausentes del Excel.`, "info", 4500);
    }
  }

  d.toast(
    `Catálogo: +${ins} nuevos, ${act} actualizados, ${unc} sin cambios` +
      (dadosDeBaja ? `, ${dadosDeBaja} baja lógica` : "") +
      ".",
    "success",
    5500
  );
  await d.cargarListaDistribuidoresAdmin?.();
  await d.cargarDistribuidores?.();
}

/**
 * @param {Event} event
 * @param {Parameters<typeof importarArchivoDistribuidoresCatalogo>[0]} d
 */
export async function importarExcelDistribuidoresCatalogo(event, d) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    await importarArchivoDistribuidoresCatalogo(d, file);
  } catch (e) {
    d.toastError("import-distribuidores", e, "Error al importar:");
  } finally {
    d.ocultarOverlayImportacion?.();
    try {
      if (event?.target) event.target.value = "";
    } catch (_) {}
  }
}

/**
 * @param {Parameters<typeof importarArchivoDistribuidoresCatalogo>[0]} d
 */
export async function descargarExcelDistribuidoresCatalogo(d) {
  const tok = d.getApiToken?.();
  if (!tok) {
    d.toast("Iniciá sesión con API (token) para exportar", "error");
    return;
  }
  const url = String(d.apiUrl("/api/distribuidores/export") || "").replace(/\/+$/, "");
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error([j.error, j.detail].filter(Boolean).join(" — ") || `HTTP ${r.status}`);
    }
    const blob = await r.blob();
    const day = new Date().toISOString().slice(0, 10);
    const z = etiquetaZona(d);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${z}s_${day}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    d.toast("Excel del catálogo descargado", "success");
  } catch (e) {
    d.toastError("distribuidores-export", e, "No se pudo descargar:");
  }
}
