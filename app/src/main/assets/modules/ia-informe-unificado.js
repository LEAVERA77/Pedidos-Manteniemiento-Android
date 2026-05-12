/**
 * Informe Unificado IA: reclamos + KPIs exportable (PDF, Imprimir, Email).
 * Botón en pestaña Estadísticas del admin.
 * made by leavera77
 */

import { pdfEncabezadoEmpresaBloque } from './empresa-encabezado-pdf.js';

let _wired = false;

function tipoNegocioActual() {
  const t = String(window.EMPRESA_CFG?.tipo || '').trim().toLowerCase();
  if (t === 'municipio') return 'municipio';
  if (t.includes('agua')) return 'cooperativa_agua';
  if (t.includes('electric')) return 'cooperativa_electrica';
  return 'municipio';
}

function esc(s) {
  const d = document.createElement('span');
  d.textContent = s;
  return d.innerHTML;
}

function nombreEmpresa() {
  return String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ── Botón ── */

function buildBtn() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-ia-informe-unificado';
  btn.className = 'btn-sm primary';
  btn.style.cssText = 'padding:.45rem .9rem;font-weight:600;background:#7c3aed;border-color:#7c3aed;white-space:nowrap;margin-left:.5rem';
  btn.innerHTML = '<i class="fas fa-file-alt"></i> Generar Informe IA';
  btn.addEventListener('click', () => void generarInforme());
  return btn;
}

/* ── Renderizado de secciones HTML ── */

function renderTabla(titulo, rows, colKey, colLabel) {
  if (!rows || !rows.length) return '';
  let h = `<div style="margin-bottom:.75rem"><strong style="font-size:.82rem">${esc(titulo)}</strong>`;
  h += '<table style="width:100%;margin-top:.3rem;font-size:.8rem;border-collapse:collapse">';
  h += `<tr style="background:#f1f5f9"><th style="text-align:left;padding:.25rem .4rem">${esc(colLabel)}</th><th style="text-align:right;padding:.25rem .4rem">Cantidad</th></tr>`;
  for (const r of rows) {
    const val = r.total || r.count || r.cantidad || r.veces || 0;
    h += `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:.25rem .4rem">${esc(r[colKey] || '')}</td><td style="text-align:right;padding:.25rem .4rem;font-weight:600">${val}</td></tr>`;
  }
  h += '</table></div>';
  return h;
}

function renderRepetidos(rows) {
  if (!rows || !rows.length) return '';
  let h = '<div style="margin-bottom:.75rem"><strong style="font-size:.82rem">Reclamos repetidos (mismo vecino, mismo tipo)</strong>';
  h += '<table style="width:100%;margin-top:.3rem;font-size:.8rem;border-collapse:collapse">';
  h += '<tr style="background:#fef3c7"><th style="text-align:left;padding:.25rem .4rem">Vecino</th><th style="text-align:left;padding:.25rem .4rem">Tipo</th><th style="text-align:right;padding:.25rem .4rem">Veces</th></tr>';
  for (const r of rows) {
    h += `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:.25rem .4rem">${esc(r.cliente_nombre || '')}</td><td style="padding:.25rem .4rem">${esc(r.tipo_trabajo || '')}</td><td style="text-align:right;padding:.25rem .4rem;font-weight:600">${r.veces || 0}</td></tr>`;
  }
  h += '</table></div>';
  return h;
}

function renderKpiCard(kpi) {
  const tendColor = kpi.tendencia === 'mejora' ? '#059669' : kpi.tendencia === 'empeora' ? '#dc2626' : '#64748b';
  const tendIcon = kpi.tendencia === 'mejora' ? 'fa-arrow-up' : kpi.tendencia === 'empeora' ? 'fa-arrow-down' : 'fa-minus';
  return `<div style="padding:.65rem;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;border-left:4px solid ${tendColor};margin-bottom:.55rem">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.3rem">
      <div style="font-weight:700;font-size:.83rem;color:#1e1b4b">${esc(kpi.nombre || '')}</div>
      <div style="font-size:1rem;font-weight:800;color:${tendColor}">${esc(String(kpi.valor ?? ''))} <span style="font-size:.72rem;font-weight:400;color:#64748b">${esc(kpi.unidad || '')}</span></div>
    </div>
    ${kpi.explicacion ? `<div style="font-size:.76rem;color:#475569;margin-top:.3rem;line-height:1.35">${esc(kpi.explicacion)}</div>` : ''}
    <div style="margin-top:.25rem;font-size:.72rem;color:${tendColor};font-weight:600"><i class="fas ${tendIcon}"></i> Tendencia: ${esc(kpi.tendencia || 'estable')}</div>
    ${kpi.recomendacion ? `<div style="font-size:.72rem;color:#7c3aed;margin-top:.2rem"><i class="fas fa-lightbulb"></i> ${esc(kpi.recomendacion)}</div>` : ''}
  </div>`;
}

function renderInforme(data) {
  const a = data.analisis || {};
  const m = data.metricas || {};
  const ia = data.informe_ia || {};
  const kpis = ia.seccion_kpis || [];

  let html = '';

  // Barra de acciones
  html += `<div id="ia-informe-acciones" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">
    <button type="button" id="ia-informe-btn-pdf" class="btn-sm primary" style="padding:.4rem .8rem;font-size:.78rem;background:#1e40af;border-color:#1e40af"><i class="fas fa-file-pdf"></i> Exportar PDF</button>
    <button type="button" id="ia-informe-btn-print" class="btn-sm primary" style="padding:.4rem .8rem;font-size:.78rem;background:#0f766e;border-color:#0f766e"><i class="fas fa-print"></i> Imprimir</button>
    <button type="button" id="ia-informe-btn-email" class="btn-sm primary" style="padding:.4rem .8rem;font-size:.78rem;background:#9333ea;border-color:#9333ea"><i class="fas fa-envelope"></i> Enviar por email</button>
  </div>`;

  // Sección 1: Reclamos
  html += '<div style="margin-bottom:1rem">';
  html += `<div style="font-size:.88rem;font-weight:700;color:#1e3a8a;margin-bottom:.5rem"><i class="fas fa-chart-bar"></i> Análisis de Reclamos — últimos ${a.periodo_dias || 30} días</div>`;
  html += `<div style="font-size:.75rem;color:#64748b;margin-bottom:.5rem">Total: ${m.total_reclamos || 0} · Cerrados: ${m.cerrados || 0} · Pendientes: ${m.pendientes || 0} · En ejecución: ${m.en_ejecucion || 0} · Cierre: ${m.pct_cierre || 0}% · T.prom: ${m.horas_promedio_cierre != null ? m.horas_promedio_cierre + 'h' : '—'}</div>`;
  html += renderTabla('Top vecinos con más reclamos', a.top_vecinos, 'cliente_nombre', 'Vecino');
  html += renderTabla('Top barrios / zonas', a.top_barrios, 'distribuidor', 'Barrio / zona');
  html += renderTabla('Tipos más frecuentes', a.top_tipos, 'tipo_trabajo', 'Tipo de trabajo');
  html += renderRepetidos(a.repetidos);
  if (ia.recomendacion_reclamos) {
    html += `<div style="padding:.55rem;background:#fff;border-radius:.4rem;border:1px solid #ddd6fe;margin-top:.4rem">
      <div style="font-size:.76rem;font-weight:600;color:#7c3aed;margin-bottom:.2rem"><i class="fas fa-lightbulb"></i> Recomendación IA</div>
      <div style="font-size:.78rem;line-height:1.45;color:#1e1b4b;white-space:pre-wrap">${esc(ia.recomendacion_reclamos)}</div>
    </div>`;
  }
  html += '</div>';

  // Sección 2: KPIs
  if (kpis.length) {
    html += '<div style="margin-bottom:1rem">';
    html += '<div style="font-size:.88rem;font-weight:700;color:#1e3a8a;margin-bottom:.5rem"><i class="fas fa-tachometer-alt"></i> KPIs con análisis IA</div>';
    kpis.forEach(k => { html += renderKpiCard(k); });
    html += '</div>';
  }

  // Sección 3: Resumen ejecutivo
  if (ia.resumen_ejecutivo) {
    html += `<div style="padding:.65rem;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #93c5fd;border-radius:.5rem">
      <div style="font-size:.85rem;font-weight:700;color:#1e40af;margin-bottom:.3rem"><i class="fas fa-clipboard-list"></i> Resumen Ejecutivo</div>
      <div style="font-size:.8rem;line-height:1.5;color:#1e293b;white-space:pre-wrap">${esc(ia.resumen_ejecutivo)}</div>
    </div>`;
  }

  return html;
}

/* ── Contenedor ── */

let _lastData = null;

function getOrCreateContainer() {
  let c = document.getElementById('ia-informe-unificado-output');
  if (!c) {
    c = document.createElement('div');
    c.id = 'ia-informe-unificado-output';
    c.style.cssText = 'padding:.75rem;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border:1px solid #c4b5fd;border-radius:.5rem;margin-top:.75rem;max-height:min(65vh,600px);overflow-y:auto';
    const sec = document.getElementById('admin-estadisticas');
    if (sec) {
      const firstBar = sec.querySelector('div[style*="display:flex"]');
      if (firstBar && firstBar.nextSibling) sec.insertBefore(c, firstBar.nextSibling);
      else sec.insertBefore(c, sec.children[1] || null);
    }
  }
  return c;
}

/* ── Flujo principal ── */

async function generarInforme() {
  const btn = document.getElementById('btn-ia-informe-unificado');
  if (!btn) return;

  const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
  if (!token) {
    if (typeof window.toast === 'function') window.toast('Sesión no disponible. Recargá la página.', 'error');
    return;
  }

  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando informe…';

  try {
    const url = typeof window.apiUrl === 'function' ? window.apiUrl('/api/ia/generar-informe') : '/api/ia/generar-informe';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tipo_negocio: tipoNegocioActual(), periodo_dias: 30 }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      if (typeof window.toast === 'function') window.toast(data.error || 'Error al generar informe.', 'warning');
      return;
    }

    _lastData = data;
    const container = getOrCreateContainer();
    container.innerHTML = renderInforme(data);

    document.getElementById('ia-informe-btn-pdf')?.addEventListener('click', () => void exportarPdf());
    document.getElementById('ia-informe-btn-print')?.addEventListener('click', () => void imprimirInforme());
    document.getElementById('ia-informe-btn-email')?.addEventListener('click', () => void mostrarModalEmail());

    if (typeof window.toast === 'function') window.toast('Informe generado correctamente.', 'success');
  } catch (err) {
    console.error('[ia-informe-unificado]', err);
    if (typeof window.toast === 'function') window.toast('Error de red al generar informe.', 'warning');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

/* ── Exportar PDF (jsPDF) ── */

async function exportarPdf() {
  if (!_lastData) return;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    if (typeof window.toast === 'function') window.toast('jsPDF no disponible.', 'error');
    return;
  }

  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 14;
    const maxW = pageW - 2 * margin;
    const empresa = nombreEmpresa();
    const fecha = fechaHoy();

    let y = await pdfEncabezadoEmpresaBloque(pdf, margin, pageW, 10, {
      variante: 'kpi',
      lineaContexto: `Informe de Gestión IA — ${fecha}`,
    });

    const a = _lastData.analisis || {};
    const m = _lastData.metricas || {};
    const ia = _lastData.informe_ia || {};
    const kpis = ia.seccion_kpis || [];

    function checkPage(need) {
      if (y + need > pageH - 15) {
        pdf.addPage();
        y = 15;
      }
    }

    function pdfText(text, opts) {
      const o = opts || {};
      pdf.setFont('helvetica', o.bold ? 'bold' : 'normal');
      pdf.setFontSize(o.size || 8);
      pdf.setTextColor(...(o.color || [30, 41, 59]));
      const lines = pdf.splitTextToSize(text, maxW);
      const lineH = (o.size || 8) * 0.42;
      checkPage(lines.length * lineH + 2);
      pdf.text(lines, margin, y);
      y += lines.length * lineH + (o.gap || 2);
    }

    // Sección reclamos
    pdfText(`Análisis de Reclamos — últimos ${a.periodo_dias || 30} días`, { bold: true, size: 10, color: [30, 58, 138], gap: 3 });
    pdfText(`Total: ${m.total_reclamos || 0} | Cerrados: ${m.cerrados || 0} | Pendientes: ${m.pendientes || 0} | En ejecución: ${m.en_ejecucion || 0} | Cierre: ${m.pct_cierre || 0}% | T.prom: ${m.horas_promedio_cierre != null ? m.horas_promedio_cierre + 'h' : '—'}`, { size: 7.5, color: [71, 85, 105] });

    function pdfTabla(titulo, rows, colKey) {
      if (!rows || !rows.length) return;
      checkPage(8);
      pdfText(titulo, { bold: true, size: 8.5, color: [30, 58, 138], gap: 1.5 });
      for (const r of rows) {
        const val = r.total || r.count || r.cantidad || r.veces || 0;
        checkPage(4);
        pdfText(`  ${r[colKey] || '—'}: ${val}`, { size: 7.5, gap: 1 });
      }
      y += 1.5;
    }

    pdfTabla('Top vecinos', a.top_vecinos, 'cliente_nombre');
    pdfTabla('Top barrios / zonas', a.top_barrios, 'distribuidor');
    pdfTabla('Tipos más frecuentes', a.top_tipos, 'tipo_trabajo');

    if (a.repetidos?.length) {
      checkPage(8);
      pdfText('Reclamos repetidos', { bold: true, size: 8.5, color: [30, 58, 138], gap: 1.5 });
      for (const r of a.repetidos) {
        checkPage(4);
        pdfText(`  ${r.cliente_nombre || '—'} / ${r.tipo_trabajo || '—'}: ${r.veces || 0} veces`, { size: 7.5, gap: 1 });
      }
      y += 1.5;
    }

    if (ia.recomendacion_reclamos) {
      pdfText('Recomendación IA:', { bold: true, size: 8, color: [124, 58, 237], gap: 1 });
      pdfText(ia.recomendacion_reclamos, { size: 7.5, gap: 3 });
    }

    // Sección KPIs
    if (kpis.length) {
      checkPage(10);
      pdfText('KPIs con análisis IA', { bold: true, size: 10, color: [30, 58, 138], gap: 3 });
      for (const k of kpis) {
        checkPage(14);
        pdfText(`${k.nombre || '—'}: ${k.valor ?? ''} ${k.unidad || ''}  [${k.tendencia || 'estable'}]`, { bold: true, size: 8, gap: 1 });
        if (k.explicacion) pdfText(k.explicacion, { size: 7.5, color: [71, 85, 105], gap: 1 });
        if (k.recomendacion) pdfText(`→ ${k.recomendacion}`, { size: 7.2, color: [124, 58, 237], gap: 2 });
      }
    }

    // Resumen ejecutivo
    if (ia.resumen_ejecutivo) {
      checkPage(12);
      pdfText('Resumen Ejecutivo', { bold: true, size: 10, color: [30, 58, 138], gap: 2 });
      pdfText(ia.resumen_ejecutivo, { size: 8, gap: 3 });
    }

    // Pie
    checkPage(8);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageW - margin, y);
    y += 3;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Generado por GestorNova — https://leavera77.github.io/Pedidos-MG/', margin, y);

    const tenant = String(window.EMPRESA_CFG?.slug || empresa).replace(/[^a-zA-Z0-9_-]/g, '_');
    pdf.save(`informe-gestion-${tenant}-${fecha.replace(/\//g, '-')}.pdf`);
    if (typeof window.toast === 'function') window.toast('PDF descargado.', 'success');
  } catch (err) {
    console.error('[ia-informe-pdf]', err);
    if (typeof window.toast === 'function') window.toast('Error al generar PDF.', 'error');
  }
}

/* ── Imprimir (window.open) ── */

function construirHtmlInformeCompleto() {
  if (!_lastData) return '';
  const a = _lastData.analisis || {};
  const m = _lastData.metricas || {};
  const ia = _lastData.informe_ia || {};
  const kpis = ia.seccion_kpis || [];
  const empresa = nombreEmpresa();
  const fecha = fechaHoy();
  const ec = window.EMPRESA_CFG || {};
  const dom = String(ec.calle || '').trim();
  const tel = String(ec.telefono_contacto || ec.telefono || '').trim();
  const mail = String(ec.email_contacto || ec.email || '').trim();

  let body = '';
  body += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">`;
  body += `<div><div style="font-size:15px;font-weight:800;color:#1e3a8a">${esc(empresa)}</div>`;
  if (dom) body += `<div style="font-size:9px;color:#475569;margin-top:2px">${esc(dom)}</div>`;
  if (tel) body += `<div style="font-size:9px;color:#475569">Tel: ${esc(tel)}</div>`;
  if (mail) body += `<div style="font-size:9px;color:#475569">Email: ${esc(mail)}</div>`;
  body += `<div style="font-size:9px;color:#64748b;margin-top:3px">Informe de Gestión IA — ${esc(fecha)}</div>`;
  body += `</div></div>`;

  body += `<h2 style="font-size:12px;color:#1e3a8a;margin:.6rem 0 .3rem">Análisis de Reclamos — últimos ${a.periodo_dias || 30} días</h2>`;
  body += `<p style="font-size:9px;color:#475569;margin:0 0 .4rem">Total: ${m.total_reclamos || 0} · Cerrados: ${m.cerrados || 0} · Pendientes: ${m.pendientes || 0} · Cierre: ${m.pct_cierre || 0}% · T.prom: ${m.horas_promedio_cierre != null ? m.horas_promedio_cierre + 'h' : '—'}</p>`;

  function printTabla(titulo, rows, colKey, colLabel) {
    if (!rows?.length) return '';
    let t = `<p style="font-size:10px;font-weight:700;margin:.4rem 0 .15rem">${esc(titulo)}</p>`;
    t += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:.4rem">';
    t += `<tr style="background:#f1f5f9"><th style="text-align:left;padding:2px 4px;border:1px solid #e2e8f0">${esc(colLabel)}</th><th style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0">Cant.</th></tr>`;
    for (const r of rows) {
      const v = r.total || r.count || r.cantidad || r.veces || 0;
      t += `<tr><td style="padding:2px 4px;border:1px solid #e2e8f0">${esc(r[colKey] || '')}</td><td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;font-weight:600">${v}</td></tr>`;
    }
    t += '</table>';
    return t;
  }

  body += printTabla('Top vecinos', a.top_vecinos, 'cliente_nombre', 'Vecino');
  body += printTabla('Top barrios / zonas', a.top_barrios, 'distribuidor', 'Barrio / zona');
  body += printTabla('Tipos más frecuentes', a.top_tipos, 'tipo_trabajo', 'Tipo de trabajo');

  if (a.repetidos?.length) {
    body += '<p style="font-size:10px;font-weight:700;margin:.4rem 0 .15rem">Reclamos repetidos</p>';
    body += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:.4rem">';
    body += '<tr style="background:#fef3c7"><th style="text-align:left;padding:2px 4px;border:1px solid #e2e8f0">Vecino</th><th style="text-align:left;padding:2px 4px;border:1px solid #e2e8f0">Tipo</th><th style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0">Veces</th></tr>';
    for (const r of a.repetidos) {
      body += `<tr><td style="padding:2px 4px;border:1px solid #e2e8f0">${esc(r.cliente_nombre || '')}</td><td style="padding:2px 4px;border:1px solid #e2e8f0">${esc(r.tipo_trabajo || '')}</td><td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;font-weight:600">${r.veces || 0}</td></tr>`;
    }
    body += '</table>';
  }

  if (ia.recomendacion_reclamos) {
    body += `<div style="padding:6px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:4px;margin:.4rem 0"><p style="font-size:9px;font-weight:600;color:#7c3aed;margin:0 0 2px"><i>Recomendación IA</i></p><p style="font-size:9px;margin:0;white-space:pre-wrap">${esc(ia.recomendacion_reclamos)}</p></div>`;
  }

  if (kpis.length) {
    body += '<h2 style="font-size:12px;color:#1e3a8a;margin:.7rem 0 .3rem">KPIs con análisis IA</h2>';
    for (const k of kpis) {
      const tc = k.tendencia === 'mejora' ? '#059669' : k.tendencia === 'empeora' ? '#dc2626' : '#64748b';
      body += `<div style="padding:5px;border-left:3px solid ${tc};margin-bottom:.4rem;background:#fff;border:1px solid #e2e8f0;border-radius:4px">`;
      body += `<div style="font-size:10px;font-weight:700;color:#1e1b4b">${esc(k.nombre || '')} <span style="color:${tc}">${esc(String(k.valor ?? ''))} ${esc(k.unidad || '')} [${esc(k.tendencia || 'estable')}]</span></div>`;
      if (k.explicacion) body += `<div style="font-size:8px;color:#475569;margin-top:2px">${esc(k.explicacion)}</div>`;
      if (k.recomendacion) body += `<div style="font-size:8px;color:#7c3aed;margin-top:1px">→ ${esc(k.recomendacion)}</div>`;
      body += '</div>';
    }
  }

  if (ia.resumen_ejecutivo) {
    body += `<div style="padding:8px;background:#eff6ff;border:1px solid #93c5fd;border-radius:5px;margin-top:.6rem"><p style="font-size:11px;font-weight:700;color:#1e40af;margin:0 0 4px">Resumen Ejecutivo</p><p style="font-size:9px;margin:0;line-height:1.5;white-space:pre-wrap">${esc(ia.resumen_ejecutivo)}</p></div>`;
  }

  body += `<p style="margin-top:.8rem;font-size:7px;color:#94a3b8">Generado por GestorNova — https://leavera77.github.io/Pedidos-MG/</p>`;
  return body;
}

function imprimirInforme() {
  if (!_lastData) return;
  const w = window.open('', '_blank');
  if (!w) {
    if (typeof window.toast === 'function') window.toast('Permití ventanas emergentes para imprimir.', 'error');
    return;
  }
  const titulo = `${nombreEmpresa()} — Informe de Gestión IA — ${fechaHoy()}`;
  const css = '@page{size:A4 portrait;margin:10mm}body{font-family:system-ui,Segoe UI,sans-serif;padding:.4rem;max-width:190mm;margin:0 auto;color:#1e293b}table{border-collapse:collapse;width:100%}';
  w.document.write(`<html><head><title>${esc(titulo)}</title><style>${css}</style></head><body>${construirHtmlInformeCompleto()}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (_) {} }, 500);
}

/* ── Enviar por email (EmailJS) ── */

function mostrarModalEmail() {
  if (!_lastData) return;
  if (document.getElementById('ia-informe-email-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'ia-informe-email-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';

  const empresa = nombreEmpresa();
  const fecha = fechaHoy();
  const asuntoDefault = `Informe de Gestión — ${empresa} — ${fecha}`;

  overlay.innerHTML = `<div style="background:#fff;border-radius:.6rem;padding:1.2rem;width:min(92vw,420px);box-shadow:0 8px 30px rgba(0,0,0,.18)">
    <div style="font-size:.92rem;font-weight:700;color:#1e3a8a;margin-bottom:.7rem"><i class="fas fa-envelope"></i> Enviar Informe por Email</div>
    <label style="font-size:.78rem;color:#475569;display:block;margin-bottom:.2rem">Destinatario</label>
    <input id="ia-informe-email-to" type="email" placeholder="email@ejemplo.com" style="width:100%;padding:.45rem .6rem;border:1px solid #cbd5e1;border-radius:.35rem;font-size:.82rem;box-sizing:border-box;margin-bottom:.55rem"/>
    <label style="font-size:.78rem;color:#475569;display:block;margin-bottom:.2rem">Asunto</label>
    <input id="ia-informe-email-subject" type="text" value="${esc(asuntoDefault)}" style="width:100%;padding:.45rem .6rem;border:1px solid #cbd5e1;border-radius:.35rem;font-size:.82rem;box-sizing:border-box;margin-bottom:.65rem"/>
    <div style="display:flex;gap:.5rem;justify-content:flex-end">
      <button type="button" id="ia-informe-email-cancel" class="btn-sm" style="padding:.4rem .8rem;font-size:.78rem">Cancelar</button>
      <button type="button" id="ia-informe-email-send" class="btn-sm primary" style="padding:.4rem .8rem;font-size:.78rem;background:#9333ea;border-color:#9333ea"><i class="fas fa-paper-plane"></i> Enviar</button>
    </div>
    <div id="ia-informe-email-msg" style="font-size:.75rem;margin-top:.4rem;color:#64748b"></div>
  </div>`;

  document.body.appendChild(overlay);

  document.getElementById('ia-informe-email-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('ia-informe-email-send').addEventListener('click', () => void enviarEmail(overlay));
}

async function enviarEmail(overlay) {
  const toInput = document.getElementById('ia-informe-email-to');
  const subjectInput = document.getElementById('ia-informe-email-subject');
  const msgDiv = document.getElementById('ia-informe-email-msg');
  const sendBtn = document.getElementById('ia-informe-email-send');
  const toEmail = (toInput?.value || '').trim();
  const subject = (subjectInput?.value || '').trim();

  if (!toEmail || !toEmail.includes('@')) {
    if (msgDiv) { msgDiv.textContent = 'Ingresá un email válido.'; msgDiv.style.color = '#dc2626'; }
    return;
  }

  const cfg = window.APP_CONFIG?.emailjs;
  if (!cfg?.publicKey || !cfg?.serviceId || !cfg?.templateId) {
    fallbackMailto(toEmail, subject);
    overlay?.remove();
    return;
  }

  sendBtn.disabled = true;
  sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';
  if (msgDiv) { msgDiv.textContent = ''; msgDiv.style.color = '#64748b'; }

  try {
    if (typeof window.emailjs === 'undefined') {
      fallbackMailto(toEmail, subject);
      overlay?.remove();
      return;
    }

    await window.emailjs.send(cfg.serviceId, cfg.templateId, {
      to_email: toEmail,
      subject: subject,
      html_body: construirHtmlInformeCompleto(),
    });

    if (typeof window.toast === 'function') window.toast('Email enviado correctamente.', 'success');
    overlay?.remove();
  } catch (err) {
    console.error('[ia-informe-email]', err);
    if (msgDiv) { msgDiv.textContent = 'Error al enviar. Intentando con mailto…'; msgDiv.style.color = '#dc2626'; }
    setTimeout(() => {
      fallbackMailto(toEmail, subject);
      overlay?.remove();
    }, 1200);
  }
}

function fallbackMailto(to, subject) {
  if (!_lastData) return;
  const ia = _lastData.informe_ia || {};
  const m = _lastData.metricas || {};
  let plain = `Informe de Gestión — ${nombreEmpresa()}\n\n`;
  plain += `Total: ${m.total_reclamos || 0} | Cerrados: ${m.cerrados || 0} | Cierre: ${m.pct_cierre || 0}%\n`;
  if (ia.resumen_ejecutivo) plain += `\nResumen: ${ia.resumen_ejecutivo}\n`;
  if (ia.recomendacion_reclamos) plain += `\nRecomendación: ${ia.recomendacion_reclamos}\n`;
  plain += '\nGenerado por GestorNova';
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plain)}`;
  window.open(url, '_self');
}

/* ── Init ── */

export function initBotonInformeUnificado() {
  if (_wired) return;
  const sec = document.getElementById('admin-estadisticas');
  if (!sec) return;
  if (!window.esAdmin || !window.esAdmin()) return;
  _wired = true;

  if (document.getElementById('btn-ia-informe-unificado')) return;

  const barCtrl = sec.querySelector('div[style*="display:flex"]');
  if (barCtrl) barCtrl.appendChild(buildBtn());
  else sec.insertBefore(buildBtn(), sec.firstChild);
}

if (typeof window !== 'undefined') window._gnInitBotonInformeUnificado = initBotonInformeUnificado;

(function autoInit() {
  if (typeof document === 'undefined') return;
  function tryInit() {
    if (_wired) return;
    initBotonInformeUnificado();
    if (!_wired) setTimeout(tryInit, 2000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 500));
  } else {
    setTimeout(tryInit, 500);
  }
})();
