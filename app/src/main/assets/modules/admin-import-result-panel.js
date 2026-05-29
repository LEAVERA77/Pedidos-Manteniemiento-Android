/**
 * Panel legible de resultado de importación Excel (cerrar manualmente).
 * made by leavera77
 */

/**
 * @param {HTMLElement | string | null} host
 * @param {{
 *   titulo?: string,
 *   lineas?: string[],
 *   detalle?: string,
 *   tipo?: 'ok' | 'info' | 'warn' | 'error',
 * }} opts
 */
export function mostrarPanelResultadoImportacion(host, opts = {}) {
  const el =
    typeof host === 'string' ? document.getElementById(host) : host;
  if (!el) return;

  const tipo = opts.tipo || 'ok';
  const border =
    tipo === 'error'
      ? 'var(--re,#dc2626)'
      : tipo === 'warn'
        ? '#d97706'
        : tipo === 'info'
          ? '#2563eb'
          : '#059669';
  const bg =
    tipo === 'error'
      ? '#fef2f2'
      : tipo === 'warn'
        ? '#fffbeb'
        : '#f0fdf4';

  const titulo = opts.titulo || 'Resultado de la importación';
  const lineas = Array.isArray(opts.lineas) ? opts.lineas.filter(Boolean) : [];
  const detalle = opts.detalle ? String(opts.detalle) : '';

  el.innerHTML = '';
  el.style.display = 'block';
  el.style.margin = el.style.margin || '0 0 .75rem';
  el.style.padding = '0';
  el.style.border = 'none';
  el.style.background = 'transparent';
  el.style.maxHeight = 'none';
  el.style.overflow = 'visible';

  const box = document.createElement('div');
  box.className = 'gn-import-result-panel';
  box.style.cssText = `border:1px solid ${border};background:${bg};border-radius:.5rem;padding:.65rem .75rem;font-size:.82rem;line-height:1.45;color:var(--bd,#1e293b)`;

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.35rem';
  const h = document.createElement('strong');
  h.style.fontSize = '.88rem';
  h.textContent = titulo;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-sm';
  btn.style.cssText = 'flex-shrink:0;padding:.2rem .45rem;font-size:.72rem;background:var(--bg,#fff);border:1px solid var(--bo,#cbd5e1)';
  btn.textContent = 'Cerrar';
  btn.setAttribute('aria-label', 'Cerrar resumen de importación');
  btn.addEventListener('click', () => ocultarPanelResultadoImportacion(el));
  head.appendChild(h);
  head.appendChild(btn);
  box.appendChild(head);

  if (lineas.length) {
    const ul = document.createElement('ul');
    ul.style.cssText = 'margin:0;padding-left:1.15rem';
    for (const ln of lineas) {
      const li = document.createElement('li');
      li.style.marginBottom = '.15rem';
      li.textContent = ln;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  if (detalle) {
    const p = document.createElement('p');
    p.style.cssText = 'margin:.45rem 0 0;font-size:.76rem;color:var(--tm,#64748b)';
    p.textContent = detalle;
    box.appendChild(p);
  }

  el.appendChild(box);
}

/**
 * @param {HTMLElement | string | null} host
 */
export function ocultarPanelResultadoImportacion(host) {
  const el =
    typeof host === 'string' ? document.getElementById(host) : host;
  if (!el) return;
  el.innerHTML = '';
  el.style.display = 'none';
}

/**
 * @param {Record<string, unknown>} j
 * @param {{ eliminados?: number, ausentes?: number, archivo?: string }} extra
 */
export function lineasResumenRedElectrica(j, extra = {}) {
  const ins = Number(j.insertados) || 0;
  const act = Number(j.actualizados) || 0;
  const unc = Number(j.sin_cambios) || 0;
  const total = Number(j.total) || Number(j.total_excel_filas) || 0;
  const err = Array.isArray(j.errores) ? j.errores.length : 0;
  const elim = Number(extra.eliminados) || Number(j.eliminados) || 0;
  const ausentes = Number(extra.ausentes) ?? (Array.isArray(j.ausentes_en_excel) ? j.ausentes_en_excel.length : 0);
  const lineas = [
    `${ins} distribuidor(es) nuevo(s)`,
    `${act} actualizado(s)`,
    `${unc} sin cambios (ya coincidían con la base)`,
  ];
  if (total > 0) lineas.push(`${total} fila(s) válidas en el Excel`);
  if (elim > 0) lineas.push(`${elim} dado(s) de baja en la tabla de red (no estaban en el archivo)`);
  else if (ausentes > 0 && elim === 0)
    lineas.push(`${ausentes} en la base no venían en el Excel (se conservaron)`);
  if (err > 0) lineas.push(`${err} fila(s) con error en el archivo`);
  const detalle = extra.archivo ? `Archivo: ${extra.archivo}` : '';
  return { lineas, detalle, tipo: err && !ins && !act ? 'warn' : 'ok' };
}

/**
 * @param {Record<string, unknown>} j
 * @param {{ eliminados?: number, ausentes?: number, archivo?: string }} extra
 */
export function lineasResumenSubestacionesCatalogo(j, extra = {}) {
  const ins = Number(j.insertados) || 0;
  const act = Number(j.actualizados) || 0;
  const unc = Number(j.sin_cambios) || 0;
  const total = Number(j.total) || Number(j.total_excel_filas) || 0;
  const err = Array.isArray(j.errores) ? j.errores.length : 0;
  const elim = Number(extra.eliminados) || Number(j.eliminados) || 0;
  const ausentes = Number(extra.ausentes) ?? (Array.isArray(j.ausentes_en_excel) ? j.ausentes_en_excel.length : 0);
  const lineas = [
    `${ins} transformador(es) nuevo(s)`,
    `${act} actualizado(s)`,
    `${unc} sin cambios (ya coincidían con la base)`,
  ];
  if (total > 0) lineas.push(`${total} fila(s) válidas en el Excel`);
  if (elim > 0) lineas.push(`${elim} dado(s) de baja en el catálogo (no estaban en el archivo)`);
  else if (ausentes > 0 && elim === 0)
    lineas.push(`${ausentes} en la base no venían en el Excel (se conservaron)`);
  if (err > 0) lineas.push(`${err} fila(s) con error en el archivo`);
  const detalle = extra.archivo ? `Archivo: ${extra.archivo}` : '';
  return { lineas, detalle, tipo: err && !ins && !act ? 'warn' : 'ok' };
}

/**
 * @param {{
 *   nuevos?: number,
 *   actualizados?: number,
 *   sinCambios?: number,
 *   eliminados?: number,
 *   omitidosImport?: number,
 *   errores?: number,
 *   omitidasFilas?: number,
 *   duplicadasArchivo?: number,
 *   cpInferidos?: number,
 *   canceloEliminar?: boolean,
 *   pendientesEliminar?: number,
 *   archivo?: string,
 * }} r
 */
export function lineasResumenSociosImport(r) {
  const lineas = [];
  if (r.nuevos) lineas.push(`${r.nuevos} socio(s) nuevo(s) en el catálogo`);
  if (r.actualizados != null && r.actualizados > 0) lineas.push(`${r.actualizados} fila(s) del Excel aplicadas al catálogo`);
  if (r.sinCambios) lineas.push(`${r.sinCambios} ya estaban actualizados`);
  if (r.eliminados) lineas.push(`${r.eliminados} socio(s) quitados de la base (no estaban en el Excel)`);
  else if (r.canceloEliminar && r.pendientesEliminar)
    lineas.push(`${r.pendientesEliminar} socio(s) no están en el Excel (no se eliminaron: cancelaste)`);
  else if (r.pendientesEliminar === 0 && !r.eliminados)
    lineas.push('Ningún socio de la base quedó fuera del Excel');
  if (r.duplicadasArchivo) lineas.push(`${r.duplicadasArchivo} fila(s) duplicadas en el archivo (se usó la última)`);
  if (r.omitidasFilas) lineas.push(`${r.omitidasFilas} fila(s) omitidas por datos incompletos`);
  if (r.errores) lineas.push(`${r.errores} fila(s) con error al guardar`);
  if (r.cpInferidos) lineas.push(`${r.cpInferidos} código(s) postal(es) inferidos con Nominatim`);
  if (!lineas.length) lineas.push('Importación finalizada sin cambios detectados');
  const detalle = r.archivo ? `Archivo: ${r.archivo}` : '';
  const tipo = r.errores && !r.nuevos && !r.actualizados ? 'error' : r.omitidasFilas || r.canceloEliminar ? 'warn' : 'ok';
  return { lineas, detalle, tipo };
}
