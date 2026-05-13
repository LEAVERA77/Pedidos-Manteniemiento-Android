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
  const tendBg = kpi.tendencia === 'mejora' ? '#f0fdf4' : kpi.tendencia === 'empeora' ? '#fef2f2' : '#f8fafc';
  return `<div style="padding:.85rem 1rem;background:#fff;border:1px solid #e2e8f0;border-radius:.6rem;border-left:5px solid ${tendColor};margin-bottom:.75rem;box-shadow:0 1px 3px rgba(0,0,0,.04)">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.4rem;margin-bottom:.45rem">
      <div style="font-weight:700;font-size:.92rem;color:#1e1b4b;line-height:1.3">${esc(kpi.nombre || '')}</div>
      <div style="font-size:1.1rem;font-weight:800;color:${tendColor}">${esc(String(kpi.valor ?? ''))} <span style="font-size:.78rem;font-weight:500;color:#64748b">${esc(kpi.unidad || '')}</span></div>
    </div>
    ${kpi.explicacion ? `<div style="font-size:.84rem;color:#334155;margin-bottom:.45rem;line-height:1.55;padding:.4rem .55rem;background:#f8fafc;border-radius:.35rem">${esc(kpi.explicacion)}</div>` : ''}
    <div style="display:flex;align-items:center;gap:.7rem;flex-wrap:wrap">
      <div style="font-size:.78rem;color:${tendColor};font-weight:600;padding:.2rem .5rem;background:${tendBg};border-radius:.25rem"><i class="fas ${tendIcon}"></i> Tendencia: ${esc(kpi.tendencia || 'estable')}</div>
      ${kpi.recomendacion ? `<div style="font-size:.8rem;color:#6d28d9;line-height:1.45"><i class="fas fa-lightbulb" style="color:#a78bfa"></i> ${esc(kpi.recomendacion)}</div>` : ''}
    </div>
  </div>`;
}

function renderEstrellas(promedio) {
  const n = Math.round(promedio || 0);
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
  return s;
}

function renderSatisfaccion(data) {
  const sat = data.satisfaccion || {};
  const ia = (data.informe_ia || {}).satisfaccion_ia || {};
  const prom = sat.promedio_estrellas;
  const pct = sat.porcentaje;
  const cant = sat.cantidad_respuestas || 0;
  const tend = sat.tendencia || 'estable';
  const pctPrev = sat.periodo_anterior_porcentaje;
  const alertaIa = ia.alerta;

  const tendColor = tend === 'mejora' ? '#059669' : tend === 'empeora' ? '#dc2626' : '#64748b';
  const tendIcon = tend === 'mejora' ? 'fa-arrow-up' : tend === 'empeora' ? 'fa-arrow-down' : 'fa-minus';
  const borderColor = alertaIa ? '#dc2626' : pct != null && pct < 50 ? '#f59e0b' : '#25d366';

  let h = `<div style="margin-bottom:1.2rem">`;
  h += `<div style="font-size:.95rem;font-weight:700;color:#1e3a8a;margin-bottom:.6rem;padding-bottom:.3rem;border-bottom:2px solid #bbf7d0"><i class="fab fa-whatsapp" style="color:#25d366"></i> Valoración WhatsApp del Vecino</div>`;

  if (prom == null || cant === 0) {
    h += `<div style="padding:.6rem;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;font-size:.8rem;color:#64748b">Sin valoraciones recibidas en el período.</div>`;
  } else {
    h += `<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.5rem">`;
    h += `<div style="flex:1;min-width:120px;padding:.55rem;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;text-align:center">
      <div style="font-size:1.3rem;color:#f59e0b;letter-spacing:2px">${renderEstrellas(prom)}</div>
      <div style="font-size:1.1rem;font-weight:800;color:#1e1b4b">${prom} / 5</div>
      <div style="font-size:.7rem;color:#64748b">Promedio</div>
    </div>`;
    h += `<div style="flex:1;min-width:100px;padding:.55rem;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;text-align:center">
      <div style="font-size:1.1rem;font-weight:800;color:${borderColor}">${pct}%</div>
      <div style="font-size:.7rem;color:#64748b">Satisfacción</div>
    </div>`;
    h += `<div style="flex:1;min-width:100px;padding:.55rem;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;text-align:center">
      <div style="font-size:1.1rem;font-weight:800;color:#1e1b4b">${cant}</div>
      <div style="font-size:.7rem;color:#64748b">Respuestas</div>
    </div>`;
    h += `<div style="flex:1;min-width:100px;padding:.55rem;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;text-align:center">
      <div style="font-size:.85rem;font-weight:700;color:${tendColor}"><i class="fas ${tendIcon}"></i> ${esc(tend)}</div>
      <div style="font-size:.7rem;color:#64748b">Tendencia${pctPrev != null ? ` (ant: ${pctPrev}%)` : ''}</div>
    </div>`;
    h += `</div>`;
  }

  if (ia.explicacion) {
    h += `<div style="padding:.65rem .8rem;background:${alertaIa ? '#fef2f2' : '#f0fdf4'};border-radius:.45rem;border:1px solid ${alertaIa ? '#fca5a5' : '#bbf7d0'};margin-bottom:.45rem">
      <div style="font-size:.84rem;font-weight:700;color:${alertaIa ? '#dc2626' : '#059669'};margin-bottom:.25rem">${alertaIa ? '<i class="fas fa-exclamation-triangle"></i> Alerta' : '<i class="fas fa-check-circle"></i> Análisis'} IA</div>
      <div style="font-size:.84rem;line-height:1.55;color:#1e293b">${esc(ia.explicacion)}</div>
    </div>`;
  }
  if (ia.recomendacion) {
    h += `<div style="padding:.55rem .75rem;background:linear-gradient(135deg,#faf5ff,#f5f3ff);border:1px solid #ddd6fe;border-radius:.45rem">
      <div style="font-size:.82rem;line-height:1.5;color:#6d28d9"><i class="fas fa-lightbulb" style="color:#a78bfa"></i> ${esc(ia.recomendacion)}</div>
    </div>`;
  }

  h += '</div>';
  return h;
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
  html += '<div style="margin-bottom:1.2rem">';
  html += `<div style="font-size:.95rem;font-weight:700;color:#1e3a8a;margin-bottom:.55rem;padding-bottom:.3rem;border-bottom:2px solid #dbeafe"><i class="fas fa-chart-bar"></i> Análisis de Reclamos — últimos ${a.periodo_dias || 30} días</div>`;
  html += `<div style="font-size:.8rem;color:#475569;margin-bottom:.6rem;line-height:1.5">Total: ${m.total_reclamos || 0} · Cerrados: ${m.cerrados || 0} · Pendientes: ${m.pendientes || 0} · En ejecución: ${m.en_ejecucion || 0} · Cierre: ${m.pct_cierre || 0}% · T.prom: ${m.horas_promedio_cierre != null ? m.horas_promedio_cierre + 'h' : '—'}</div>`;
  html += renderTabla('Top vecinos con más reclamos', a.top_vecinos, 'cliente_nombre', 'Vecino');
  html += renderTabla('Top barrios / zonas', a.top_barrios, 'distribuidor', 'Barrio / zona');
  html += renderTabla('Tipos más frecuentes', a.top_tipos, 'tipo_trabajo', 'Tipo de trabajo');
  html += renderRepetidos(a.repetidos);
  if (ia.recomendacion_reclamos) {
    html += `<div style="padding:.7rem .85rem;background:linear-gradient(135deg,#faf5ff,#f5f3ff);border-radius:.5rem;border:1px solid #ddd6fe;margin-top:.6rem">
      <div style="font-size:.84rem;font-weight:700;color:#6d28d9;margin-bottom:.35rem"><i class="fas fa-lightbulb" style="color:#a78bfa"></i> Recomendación IA</div>
      <div style="font-size:.84rem;line-height:1.6;color:#1e1b4b;white-space:pre-wrap">${esc(ia.recomendacion_reclamos)}</div>
    </div>`;
  }
  html += '</div>';

  // Sección 2: KPIs
  if (kpis.length) {
    html += '<div style="margin-bottom:1.2rem">';
    html += '<div style="font-size:.95rem;font-weight:700;color:#1e3a8a;margin-bottom:.6rem;padding-bottom:.3rem;border-bottom:2px solid #dbeafe"><i class="fas fa-tachometer-alt"></i> KPIs con análisis IA</div>';
    kpis.forEach(k => { html += renderKpiCard(k); });
    html += '</div>';
  }

  // Sección 3: Valoración WhatsApp
  html += renderSatisfaccion(data);

  // Sección 4: Resumen ejecutivo
  if (ia.resumen_ejecutivo) {
    html += `<div style="padding:.85rem 1rem;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #93c5fd;border-radius:.6rem;box-shadow:0 1px 4px rgba(30,64,175,.08)">
      <div style="font-size:.95rem;font-weight:700;color:#1e40af;margin-bottom:.45rem;padding-bottom:.25rem;border-bottom:1px solid #bfdbfe"><i class="fas fa-clipboard-list"></i> Resumen Ejecutivo</div>
      <div style="font-size:.88rem;line-height:1.65;color:#1e293b;white-space:pre-wrap">${esc(ia.resumen_ejecutivo)}</div>
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

    container.onclick = (e) => {
      const btn = e.target.closest('button[id^="ia-informe-btn-"]');
      if (!btn) return;
      if (btn.id === 'ia-informe-btn-pdf') void exportarPdf();
      else if (btn.id === 'ia-informe-btn-print') void imprimirInforme();
      else if (btn.id === 'ia-informe-btn-email') void mostrarModalEmail();
    };

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

function _pdfBuildDoc() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return null;
  return new jsPDF({ unit: 'mm', format: 'a4' });
}

function _pdfEstrellas(pdf, x, yC, promedio) {
  const n = Math.round(promedio || 0);
  const r = 1.8;
  const gap = 5;
  for (let i = 0; i < 5; i++) {
    const cx = x + i * gap + r;
    if (i < n) {
      pdf.setFillColor(245, 158, 11);
      pdf.circle(cx, yC, r, 'F');
    } else {
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.25);
      pdf.circle(cx, yC, r, 'S');
    }
  }
  return x + 5 * gap + r + 2;
}

async function exportarPdf() {
  if (!_lastData) return;
  const pdf = _pdfBuildDoc();
  if (!pdf) {
    if (typeof window.toast === 'function') window.toast('jsPDF no disponible.', 'error');
    return;
  }

  try {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ML = 16;
    const MR = 16;
    const MB = 18;
    const contentW = pageW - ML - MR;
    const empresa = nombreEmpresa();
    const fecha = fechaHoy();
    let pageNum = 1;

    let y = await pdfEncabezadoEmpresaBloque(pdf, ML, pageW, 10, {
      variante: 'kpi',
      lineaContexto: `Informe de Gestion IA -- ${fecha}`,
    });

    const a = _lastData.analisis || {};
    const m = _lastData.metricas || {};
    const ia = _lastData.informe_ia || {};
    const kpis = ia.seccion_kpis || [];

    function pageFooter() {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setCharSpace(0);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Generado por GestorNova  --  ${empresa}`, ML, pageH - 8);
      pdf.text(`Pagina ${pageNum}`, pageW - MR, pageH - 8, { align: 'right' });
    }

    function checkPage(need) {
      if (y + need > pageH - MB) {
        pageFooter();
        pdf.addPage();
        pageNum++;
        y = 14;
      }
    }

    function setFont(style, size, color) {
      pdf.setFont('helvetica', style);
      pdf.setFontSize(size);
      pdf.setCharSpace(0);
      pdf.setTextColor(...color);
    }

    function pdfText(text, opts) {
      const o = opts || {};
      const style = o.bold && o.italic ? 'bolditalic' : o.bold ? 'bold' : o.italic ? 'italic' : 'normal';
      const sz = o.size || 9;
      const color = o.color || [30, 41, 59];
      const indent = o.indent || 0;
      const effW = contentW - indent;
      setFont(style, sz, color);
      const raw = String(text ?? '')
        .replace(/[\u200b\ufeff\u200c\u200d\u2060]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const lines = pdf.splitTextToSize(raw, effW);
      const lineH = sz * 0.42;
      checkPage(lines.length * lineH + 2);
      for (let i = 0; i < lines.length; i++) {
        pdf.text(lines[i], ML + indent, y);
        y += lineH;
      }
      y += (o.gap != null ? o.gap : 2);
    }

    function pdfSectionTitle(text) {
      checkPage(14);
      y += 3;
      pdf.setFillColor(30, 58, 138);
      pdf.rect(ML, y, contentW, 0.6, 'F');
      y += 4;
      setFont('bold', 12, [30, 58, 138]);
      pdf.text(text, ML, y);
      y += 6;
    }

    function pdfSubTitle(text) {
      checkPage(8);
      setFont('bold', 9.5, [30, 58, 138]);
      pdf.text(text, ML + 2, y);
      y += 4.5;
    }

    function pdfAiBlock(label, text, color, bgColor) {
      checkPage(12);
      const rawT = String(text || '')
        .replace(/[\u200b\ufeff\u200c\u200d\u2060]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      setFont('normal', 8.5, color);
      pdf.setCharSpace(0);
      const lines = pdf.splitTextToSize(rawT, contentW - 10);
      const blockH = lines.length * 3.8 + 6;
      checkPage(blockH + 2);
      pdf.setFillColor(...bgColor);
      pdf.roundedRect(ML + 2, y - 1, contentW - 4, blockH, 1.5, 1.5, 'F');
      y += 2;
      if (label) {
        setFont('bold', 8, color);
        pdf.text(label, ML + 5, y);
        y += 3.5;
      }
      setFont('normal', 8.5, [30, 41, 59]);
      for (const line of lines) {
        pdf.text(line, ML + 5, y);
        y += 3.8;
      }
      y += 3;
    }

    // -- Seccion 1: Reclamos --
    pdfSectionTitle(`Analisis de Reclamos -- ultimos ${a.periodo_dias || 30} dias`);

    const stats = [
      `Total: ${m.total_reclamos || 0}`,
      `Cerrados: ${m.cerrados || 0}`,
      `Pendientes: ${m.pendientes || 0}`,
      `En ejecucion: ${m.en_ejecucion || 0}`,
      `Cierre: ${m.pct_cierre || 0}%`,
      `T.prom: ${m.horas_promedio_cierre != null ? m.horas_promedio_cierre + 'h' : '--'}`,
    ].join('   |   ');
    pdfText(stats, { size: 8.5, color: [71, 85, 105], gap: 4 });

    function pdfTabla(titulo, rows, colKey) {
      if (!rows || !rows.length) return;
      pdfSubTitle(titulo);
      const colW = 14;
      for (const r of rows) {
        const val = r.total || r.count || r.cantidad || r.veces || 0;
        checkPage(5);
        setFont('normal', 8.5, [51, 65, 85]);
        pdf.text(String(r[colKey] || '--'), ML + 6, y);
        setFont('bold', 8.5, [30, 41, 59]);
        pdf.text(String(val), ML + contentW - colW, y, { align: 'right' });
        y += 4;
      }
      y += 2;
    }

    pdfTabla('Top vecinos', a.top_vecinos, 'cliente_nombre');
    pdfTabla('Tipos mas frecuentes', a.top_tipos, 'tipo_trabajo');
    pdfTabla('Top barrios / zonas', a.top_barrios, 'distribuidor');

    if (a.repetidos?.length) {
      pdfSubTitle('Reclamos repetidos');
      for (const r of a.repetidos) {
        checkPage(5);
        setFont('normal', 8.5, [51, 65, 85]);
        pdf.text(`${r.cliente_nombre || '--'}  /  ${r.tipo_trabajo || '--'}`, ML + 6, y);
        setFont('bold', 8.5, [30, 41, 59]);
        pdf.text(`${r.veces || 0}x`, ML + contentW - 14, y, { align: 'right' });
        y += 4;
      }
      y += 2;
    }

    if (ia.recomendacion_reclamos) {
      pdfAiBlock('Recomendacion IA', ia.recomendacion_reclamos, [109, 40, 217], [250, 245, 255]);
    }

    // -- Seccion 2: KPIs --
    if (kpis.length) {
      pdfSectionTitle('KPIs con analisis IA');
      for (const k of kpis) {
        checkPage(22);
        const tendLabel = k.tendencia === 'mejora' ? 'mejora' : k.tendencia === 'empeora' ? 'empeora' : 'estable';
        const tendColor = k.tendencia === 'mejora' ? [5, 150, 105] : k.tendencia === 'empeora' ? [220, 38, 38] : [100, 116, 139];

        setFont('bold', 9.5, [30, 27, 75]);
        pdf.text(`${k.nombre || '--'}:  ${k.valor ?? ''} ${k.unidad || ''}`, ML + 2, y);
        setFont('bold', 8, tendColor);
        pdf.text(`[${tendLabel}]`, ML + contentW - 14, y, { align: 'right' });
        y += 4.5;

        if (k.explicacion) {
          pdfText(k.explicacion, { size: 8.5, color: [51, 65, 85], indent: 4, gap: 1.5 });
        }
        if (k.recomendacion) {
          pdfText(k.recomendacion, { size: 8, italic: true, color: [109, 40, 217], indent: 4, gap: 3 });
        }
        y += 1;
      }
    }

    // -- Seccion 3: Valoracion WhatsApp --
    const sat = _lastData.satisfaccion || {};
    const satIa = ia.satisfaccion_ia || {};
    pdfSectionTitle('Valoracion WhatsApp del Vecino');
    if (sat.promedio_estrellas == null || (sat.cantidad_respuestas || 0) === 0) {
      pdfText('Sin valoraciones recibidas en el periodo.', { size: 9, color: [100, 116, 139], gap: 4 });
    } else {
      checkPage(18);
      const starEndX = _pdfEstrellas(pdf, ML + 2, y + 1, sat.promedio_estrellas);
      setFont('bold', 14, [30, 41, 59]);
      pdf.text(`${sat.promedio_estrellas} / 5`, starEndX + 2, y + 2.5);
      y += 8;
      pdfText(`Satisfaccion: ${sat.porcentaje}%   |   Respuestas: ${sat.cantidad_respuestas}   |   Tendencia: ${sat.tendencia || 'estable'}${sat.periodo_anterior_porcentaje != null ? '  (anterior: ' + sat.periodo_anterior_porcentaje + '%)' : ''}`, { size: 8.5, color: [71, 85, 105], gap: 3 });
    }
    if (satIa.explicacion) {
      const alerta = satIa.alerta;
      pdfAiBlock(
        alerta ? 'Alerta IA' : 'Analisis IA',
        satIa.explicacion,
        alerta ? [220, 38, 38] : [5, 120, 85],
        alerta ? [254, 242, 242] : [240, 253, 244],
      );
    }
    if (satIa.recomendacion) {
      pdfAiBlock(null, satIa.recomendacion, [109, 40, 217], [250, 245, 255]);
    }

    // -- Seccion 4: Resumen ejecutivo --
    if (ia.resumen_ejecutivo) {
      pdfSectionTitle('Resumen Ejecutivo');
      pdfText(ia.resumen_ejecutivo, { size: 9, color: [30, 41, 59], gap: 4 });
    }

    // -- Footer ultima pagina --
    pageFooter();

    const tenant = String(window.EMPRESA_CFG?.slug || empresa).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `informe-gestion-${tenant}-${fecha.replace(/\//g, '-')}.pdf`;
    pdf.save(filename);
    if (typeof window.toast === 'function') window.toast('PDF descargado.', 'success');
    return { pdf, filename };
  } catch (err) {
    console.error('[ia-informe-pdf]', err);
    if (typeof window.toast === 'function') window.toast('Error al generar PDF.', 'error');
    return null;
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

  // Sección Valoración WhatsApp
  const sat = _lastData.satisfaccion || {};
  const satIa = (ia.satisfaccion_ia) || {};
  body += '<h2 style="font-size:12px;color:#1e3a8a;margin:.7rem 0 .3rem">Valoración WhatsApp del Vecino</h2>';
  if (sat.promedio_estrellas == null || (sat.cantidad_respuestas || 0) === 0) {
    body += '<p style="font-size:9px;color:#64748b;margin:0 0 .4rem">Sin valoraciones recibidas en el período.</p>';
  } else {
    body += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:.4rem">`;
    body += `<div style="flex:1;min-width:80px;padding:5px;background:#fff;border:1px solid #e2e8f0;border-radius:4px;text-align:center"><div style="font-size:14px;color:#f59e0b;letter-spacing:1px">${renderEstrellas(sat.promedio_estrellas)}</div><div style="font-size:11px;font-weight:800">${sat.promedio_estrellas} / 5</div><div style="font-size:7px;color:#64748b">Promedio</div></div>`;
    body += `<div style="flex:1;min-width:60px;padding:5px;background:#fff;border:1px solid #e2e8f0;border-radius:4px;text-align:center"><div style="font-size:11px;font-weight:800;color:#25d366">${sat.porcentaje}%</div><div style="font-size:7px;color:#64748b">Satisfacción</div></div>`;
    body += `<div style="flex:1;min-width:60px;padding:5px;background:#fff;border:1px solid #e2e8f0;border-radius:4px;text-align:center"><div style="font-size:11px;font-weight:800">${sat.cantidad_respuestas}</div><div style="font-size:7px;color:#64748b">Respuestas</div></div>`;
    const tc2 = sat.tendencia === 'mejora' ? '#059669' : sat.tendencia === 'empeora' ? '#dc2626' : '#64748b';
    body += `<div style="flex:1;min-width:60px;padding:5px;background:#fff;border:1px solid #e2e8f0;border-radius:4px;text-align:center"><div style="font-size:10px;font-weight:700;color:${tc2}">${esc(sat.tendencia || 'estable')}</div><div style="font-size:7px;color:#64748b">Tendencia${sat.periodo_anterior_porcentaje != null ? ` (ant: ${sat.periodo_anterior_porcentaje}%)` : ''}</div></div>`;
    body += '</div>';
  }
  if (satIa.explicacion) {
    const bgSat = satIa.alerta ? '#fef2f2' : '#f0fdf4';
    const bdSat = satIa.alerta ? '#fca5a5' : '#bbf7d0';
    const clSat = satIa.alerta ? '#dc2626' : '#059669';
    body += `<div style="padding:5px;background:${bgSat};border:1px solid ${bdSat};border-radius:4px;margin-bottom:.3rem"><p style="font-size:9px;font-weight:600;color:${clSat};margin:0 0 2px">${satIa.alerta ? '⚠ Alerta IA' : '✓ Análisis IA'}</p><p style="font-size:9px;margin:0">${esc(satIa.explicacion)}</p></div>`;
  }
  if (satIa.recomendacion) {
    body += `<div style="padding:4px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:4px"><p style="font-size:8px;color:#7c3aed;margin:0">→ ${esc(satIa.recomendacion)}</p></div>`;
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

/* ── Enviar por email ── */

function _buildPlainTextInforme() {
  if (!_lastData) return '';
  const ia = _lastData.informe_ia || {};
  const m = _lastData.metricas || {};
  const sat = _lastData.satisfaccion || {};
  let t = `Informe de Gestion -- ${nombreEmpresa()} -- ${fechaHoy()}\n\n`;
  t += `Total: ${m.total_reclamos || 0} | Cerrados: ${m.cerrados || 0} | Pendientes: ${m.pendientes || 0} | Cierre: ${m.pct_cierre || 0}%\n`;
  if (m.horas_promedio_cierre != null) t += `Tiempo promedio cierre: ${m.horas_promedio_cierre}h\n`;
  if (sat.promedio_estrellas != null && sat.cantidad_respuestas > 0) {
    t += `\nSatisfaccion vecino: ${sat.promedio_estrellas}/5 (${sat.porcentaje}%) -- ${sat.cantidad_respuestas} respuestas\n`;
  }
  if (ia.resumen_ejecutivo) t += `\nResumen ejecutivo:\n${ia.resumen_ejecutivo}\n`;
  if (ia.recomendacion_reclamos) t += `\nRecomendacion IA:\n${ia.recomendacion_reclamos}\n`;
  t += '\n--\nGenerado por GestorNova';
  return t;
}

function mostrarModalEmail() {
  if (!_lastData) {
    if (typeof window.toast === 'function') window.toast('Genera el informe primero.', 'error');
    return;
  }
  if (document.getElementById('ia-informe-email-overlay')) return;

  const empresa = nombreEmpresa();
  const fecha = fechaHoy();
  const asuntoDefault = `Informe de Gestion -- ${empresa} -- ${fecha}`;

  const overlay = document.createElement('div');
  overlay.id = 'ia-informe-email-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483646;display:flex;align-items:center;justify-content:center';

  overlay.innerHTML = `<div style="background:#fff;border-radius:.75rem;padding:1.4rem 1.5rem;width:min(92vw,440px);box-shadow:0 12px 40px rgba(0,0,0,.25);position:relative;z-index:2147483647">
    <button type="button" id="ia-informe-email-close-x" style="position:absolute;top:.6rem;right:.7rem;background:none;border:none;font-size:1.1rem;cursor:pointer;color:#94a3b8;line-height:1" title="Cerrar">&times;</button>
    <div style="font-size:.95rem;font-weight:700;color:#1e3a8a;margin-bottom:.8rem"><i class="fas fa-envelope"></i> Enviar Informe por Email</div>
    <label style="font-size:.78rem;color:#475569;display:block;margin-bottom:.2rem">Destinatario</label>
    <input id="ia-informe-email-to" type="email" placeholder="email@ejemplo.com" style="width:100%;padding:.45rem .6rem;border:1px solid #cbd5e1;border-radius:.4rem;font-size:.82rem;box-sizing:border-box;margin-bottom:.55rem"/>
    <label style="font-size:.78rem;color:#475569;display:block;margin-bottom:.2rem">Asunto</label>
    <input id="ia-informe-email-subject" type="text" value="${esc(asuntoDefault)}" style="width:100%;padding:.45rem .6rem;border:1px solid #cbd5e1;border-radius:.4rem;font-size:.82rem;box-sizing:border-box;margin-bottom:.65rem"/>
    <p style="font-size:.72rem;color:#64748b;margin:0 0 .6rem;line-height:1.4">Se descargara el PDF y se abrira tu cliente de correo para adjuntarlo.</p>
    <div style="display:flex;gap:.5rem;justify-content:flex-end">
      <button type="button" id="ia-informe-email-cancel" class="btn-sm" style="padding:.4rem .8rem;font-size:.78rem">Cancelar</button>
      <button type="button" id="ia-informe-email-send" class="btn-sm primary" style="padding:.4rem .8rem;font-size:.78rem;background:#9333ea;border-color:#9333ea"><i class="fas fa-paper-plane"></i> Enviar</button>
    </div>
    <div id="ia-informe-email-msg" style="font-size:.75rem;margin-top:.4rem;color:#64748b"></div>
  </div>`;

  document.body.appendChild(overlay);

  function cerrarModal() { overlay.remove(); document.removeEventListener('keydown', onEsc); }
  function onEsc(e) { if (e.key === 'Escape') cerrarModal(); }
  document.addEventListener('keydown', onEsc);

  overlay.querySelector('#ia-informe-email-close-x').addEventListener('click', cerrarModal);
  overlay.querySelector('#ia-informe-email-cancel').addEventListener('click', cerrarModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarModal(); });
  overlay.querySelector('#ia-informe-email-send').addEventListener('click', () => void enviarEmail(overlay, cerrarModal));

  overlay.querySelector('#ia-informe-email-to').focus();
}

async function enviarEmail(overlay, cerrarModal) {
  const close = typeof cerrarModal === 'function' ? cerrarModal : () => overlay.remove();
  const toInput = overlay.querySelector('#ia-informe-email-to');
  const subjectInput = overlay.querySelector('#ia-informe-email-subject');
  const msgDiv = overlay.querySelector('#ia-informe-email-msg');
  const sendBtn = overlay.querySelector('#ia-informe-email-send');
  const toEmail = (toInput?.value || '').trim();
  const subject = (subjectInput?.value || '').trim();

  if (!toEmail || !toEmail.includes('@')) {
    if (msgDiv) { msgDiv.textContent = 'Ingresa un email valido.'; msgDiv.style.color = '#dc2626'; }
    return;
  }

  sendBtn.disabled = true;
  sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando PDF…';
  if (msgDiv) { msgDiv.textContent = ''; msgDiv.style.color = '#64748b'; }

  try {
    const result = await exportarPdf();
    if (result && typeof window.toast === 'function') {
      window.toast('PDF descargado. Adjuntalo al email.', 'info');
    }

    const plain = _buildPlainTextInforme();
    const body = plain + '\n\n(El PDF del informe se descargo a tu carpeta de descargas. Adjuntalo a este email.)';
    const url = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;

    setTimeout(close, 600);
  } catch (err) {
    console.error('[ia-informe-email]', err);
    if (msgDiv) { msgDiv.textContent = 'Error al preparar el email. Intenta descargar el PDF manualmente.'; msgDiv.style.color = '#dc2626'; }
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
  }
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

if (typeof window !== 'undefined') {
  window._gnInitBotonInformeUnificado = initBotonInformeUnificado;
  window._gnGenerarInformeIA = generarInforme;
}
