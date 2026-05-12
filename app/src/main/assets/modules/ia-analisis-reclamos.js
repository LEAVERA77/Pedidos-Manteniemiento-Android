/**
 * Botón "Analizar con IA" en Vecinos y Estadísticas (admin).
 * Llama a POST /api/ia/analizar-reclamos y renderiza resultados.
 * made by leavera77
 */

let _wiredSocios = false;
let _wiredEstadisticas = false;

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

function buildBtn(id) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.className = 'btn-sm primary';
  btn.style.cssText = 'padding:.55rem 1.1rem;font-weight:600;background:#7c3aed;border-color:#7c3aed;white-space:nowrap';
  btn.innerHTML = '<i class="fas fa-brain"></i> Analizar con IA';
  btn.addEventListener('click', () => void analizarConIA(id));
  return btn;
}

function renderTabla(titulo, rows, colKey, colLabel) {
  if (!rows || !rows.length) return '';
  let html = `<div style="margin-bottom:.75rem"><strong style="font-size:.82rem">${esc(titulo)}</strong>`;
  html += '<table style="width:100%;margin-top:.3rem;font-size:.8rem;border-collapse:collapse">';
  html += `<tr style="background:#f1f5f9"><th style="text-align:left;padding:.25rem .4rem">${esc(colLabel)}</th><th style="text-align:right;padding:.25rem .4rem">Cantidad</th></tr>`;
  for (const r of rows) {
    html += `<tr style="border-bottom:1px solid #e2e8f0">`;
    html += `<td style="padding:.25rem .4rem">${esc(r[colKey] || '')}</td>`;
    html += `<td style="text-align:right;padding:.25rem .4rem;font-weight:600">${r.count || r.cantidad || 0}</td></tr>`;
  }
  html += '</table></div>';
  return html;
}

function renderRepetidos(rows) {
  if (!rows || !rows.length) return '';
  let html = '<div style="margin-bottom:.75rem"><strong style="font-size:.82rem">Reclamos repetidos (mismo vecino, mismo tipo)</strong>';
  html += '<table style="width:100%;margin-top:.3rem;font-size:.8rem;border-collapse:collapse">';
  html += '<tr style="background:#fef3c7"><th style="text-align:left;padding:.25rem .4rem">Vecino</th><th style="text-align:left;padding:.25rem .4rem">Tipo</th><th style="text-align:right;padding:.25rem .4rem">Veces</th></tr>';
  for (const r of rows) {
    html += `<tr style="border-bottom:1px solid #e2e8f0">`;
    html += `<td style="padding:.25rem .4rem">${esc(r.cliente_nombre || '')}</td>`;
    html += `<td style="padding:.25rem .4rem">${esc(r.tipo_trabajo || '')}</td>`;
    html += `<td style="text-align:right;padding:.25rem .4rem;font-weight:600">${r.veces || 0}</td></tr>`;
  }
  html += '</table></div>';
  return html;
}

function getOrCreateOutput(btnId) {
  if (btnId === 'btn-ia-analizar-reclamos') {
    return document.getElementById('historial-apellido-result');
  }
  let c = document.getElementById('ia-analisis-est-output');
  if (!c) {
    c = document.createElement('div');
    c.id = 'ia-analisis-est-output';
    c.style.cssText = 'margin-top:.75rem;max-height:min(50vh,420px);overflow-y:auto';
    const sec = document.getElementById('admin-estadisticas');
    if (sec) {
      const firstBar = sec.querySelector('div[style*="display:flex"]');
      if (firstBar && firstBar.nextSibling) {
        sec.insertBefore(c, firstBar.nextSibling);
      } else {
        sec.insertBefore(c, sec.children[1] || null);
      }
    }
  }
  return c;
}

async function analizarConIA(btnId) {
  const btn = document.getElementById(btnId);
  const out = getOrCreateOutput(btnId);
  if (!btn || !out) return;

  const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
  if (!token) {
    if (typeof window.toast === 'function') window.toast('Sesión no disponible. Recargá la página.', 'error');
    return;
  }

  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando…';

  try {
    const url = typeof window.apiUrl === 'function' ? window.apiUrl('/api/ia/analizar-reclamos') : '/api/ia/analizar-reclamos';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tipo_negocio: tipoNegocioActual(), periodo_dias: 30 }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      if (typeof window.toast === 'function') window.toast(data.error || 'Error al analizar reclamos.', 'warning');
      return;
    }

    const a = data.analisis || {};
    let html = '<div style="padding:.65rem;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border:1px solid #c4b5fd;border-radius:.5rem;margin-top:.5rem">';
    html += `<div style="font-size:.85rem;font-weight:700;color:#5b21b6;margin-bottom:.5rem"><i class="fas fa-brain"></i> Análisis IA — últimos ${a.periodo_dias || 30} días</div>`;

    html += renderTabla('Top vecinos con más reclamos', a.top_vecinos, 'cliente_nombre', 'Vecino');
    html += renderTabla('Top barrios / zonas', a.top_barrios, 'distribuidor', 'Barrio / zona');
    html += renderTabla('Tipos más frecuentes', a.top_tipos, 'tipo_trabajo', 'Tipo de trabajo');
    html += renderRepetidos(a.repetidos);

    if (data.recomendacion_ia) {
      html += '<div style="margin-top:.65rem;padding:.6rem;background:#fff;border-radius:.4rem;border:1px solid #ddd6fe">';
      html += '<div style="font-size:.78rem;font-weight:600;color:#7c3aed;margin-bottom:.3rem"><i class="fas fa-lightbulb"></i> Recomendación IA</div>';
      html += `<div style="font-size:.8rem;line-height:1.5;color:#1e1b4b;white-space:pre-wrap">${esc(data.recomendacion_ia)}</div>`;
      html += '</div>';
    }

    html += '</div>';
    out.innerHTML = html;
  } catch (err) {
    console.error('[ia-analisis-reclamos]', err);
    if (typeof window.toast === 'function') window.toast('Error de red al consultar la IA.', 'warning');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

export function initBotonAnalizarIA() {
  if (!window.esAdmin || !window.esAdmin()) return;

  if (!_wiredSocios) {
    const wrap = document.getElementById('socios-nis-busqueda-wrap');
    if (wrap && !document.getElementById('btn-ia-analizar-reclamos')) {
      const row = wrap.querySelector('div[style*="display:flex"]');
      if (row) row.appendChild(buildBtn('btn-ia-analizar-reclamos'));
      else wrap.appendChild(buildBtn('btn-ia-analizar-reclamos'));
      _wiredSocios = true;
    }
  }

  if (!_wiredEstadisticas) {
    const sec = document.getElementById('admin-estadisticas');
    if (sec && !document.getElementById('btn-ia-analizar-est')) {
      const barCtrl = sec.querySelector('div[style*="display:flex"]');
      if (barCtrl) barCtrl.appendChild(buildBtn('btn-ia-analizar-est'));
      else sec.insertBefore(buildBtn('btn-ia-analizar-est'), sec.firstChild);
      _wiredEstadisticas = true;
    }
  }
}

if (typeof window !== 'undefined') window._gnInitBotonAnalizarIA = initBotonAnalizarIA;

(function autoInit() {
  if (typeof document === 'undefined') return;
  function tryInit() {
    if (_wiredSocios && _wiredEstadisticas) return;
    initBotonAnalizarIA();
    if (!_wiredSocios || !_wiredEstadisticas) setTimeout(tryInit, 2000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 500));
  } else {
    setTimeout(tryInit, 500);
  }
})();
