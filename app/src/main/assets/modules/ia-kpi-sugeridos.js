/**
 * Botón "Sugerir KPIs con IA" en la pestaña KPI (admin).
 * Llama a POST /api/ia/sugerir-kpis y renderiza cards con opción de guardar
 * cada KPI en kpi_snapshots (vía sqlSimple expuesto en window._gnSqlSimple).
 * made by leavera77
 */

let _wired = false;

function tipoNegocioActual() {
  const t = String(window.EMPRESA_CFG?.tipo || '').trim().toLowerCase();
  if (t === 'municipio') return 'municipio';
  if (t.includes('agua')) return 'cooperativa_agua';
  if (t.includes('electric')) return 'cooperativa_electrica';
  return 'municipio';
}

function escHtml(s) {
  const d = document.createElement('span');
  d.textContent = s;
  return d.innerHTML;
}

function tid() {
  if (typeof window._gnTenantId === 'function') {
    const n = window._gnTenantId();
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function buildBtn() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-ia-sugerir-kpis';
  btn.className = 'btn-sm primary';
  btn.style.cssText = 'padding:.45rem .9rem;font-weight:600;background:#7c3aed;border-color:#7c3aed;white-space:nowrap;margin-left:.5rem';
  btn.innerHTML = '<i class="fas fa-brain"></i> Sugerir KPIs con IA';
  btn.addEventListener('click', () => void sugerirKpis());
  return btn;
}

function renderBarrios(barrios) {
  if (!barrios || !barrios.length) return '';
  const lbl = typeof window.etiquetaZonaPedido === 'function' ? window.etiquetaZonaPedido() : 'Barrio / Zona';
  let h = `<div style="margin-bottom:.85rem;padding:.65rem;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;border-left:4px solid #7c3aed">`;
  h += `<div style="font-weight:700;font-size:.84rem;color:#1e1b4b;margin-bottom:.45rem"><i class="fas fa-map-marked-alt" style="color:#7c3aed"></i> Reclamos por ${escHtml(lbl)}</div>`;
  h += '<table style="width:100%;font-size:.78rem;border-collapse:collapse">';
  h += `<tr style="background:#f1f5f9"><th style="text-align:left;padding:.25rem .35rem">${escHtml(lbl)}</th><th style="text-align:right;padding:.25rem .35rem">Total</th><th style="text-align:right;padding:.25rem .35rem">Pend.</th><th style="text-align:right;padding:.25rem .35rem">T.cierre</th><th style="text-align:left;padding:.25rem .35rem">Tipo principal</th></tr>`;
  for (const b of barrios) {
    const tipoPrin = b.top_tipos && b.top_tipos.length ? b.top_tipos[0].tipo : '—';
    const horasLbl = b.horas_prom != null ? `${b.horas_prom}h` : '—';
    const pendColor = b.pendientes > 3 ? 'color:#dc2626;font-weight:700' : '';
    h += `<tr style="border-bottom:1px solid #e2e8f0">`;
    h += `<td style="padding:.25rem .35rem;font-weight:600">${escHtml(b.zona)}</td>`;
    h += `<td style="text-align:right;padding:.25rem .35rem;font-weight:600">${b.total}</td>`;
    h += `<td style="text-align:right;padding:.25rem .35rem;${pendColor}">${b.pendientes}</td>`;
    h += `<td style="text-align:right;padding:.25rem .35rem">${horasLbl}</td>`;
    h += `<td style="padding:.25rem .35rem;font-size:.74rem;color:#475569">${escHtml(tipoPrin)}</td>`;
    h += `</tr>`;
  }
  h += '</table></div>';
  return h;
}

function renderCard(kpi, idx) {
  const alertBorder = kpi.alerta ? 'border-left:4px solid #ef4444' : 'border-left:4px solid #22c55e';
  return `<div class="ia-kpi-card" data-idx="${idx}" style="padding:.75rem;background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;${alertBorder};margin-bottom:.65rem">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.3rem">
      <div style="font-weight:700;font-size:.85rem;color:#1e1b4b">${escHtml(kpi.nombre || kpi.metrica)}</div>
      <div style="font-size:1.1rem;font-weight:800;color:${kpi.alerta ? '#dc2626' : '#059669'}">${escHtml(String(kpi.valor ?? ''))} <span style="font-size:.72rem;font-weight:400;color:#64748b">${escHtml(kpi.unidad || '')}</span></div>
    </div>
    ${kpi.interpretacion ? `<div style="font-size:.78rem;color:#475569;margin-top:.35rem;line-height:1.4">${escHtml(kpi.interpretacion)}</div>` : ''}
    ${kpi.alerta ? '<div style="margin-top:.3rem;font-size:.72rem;color:#dc2626;font-weight:600"><i class="fas fa-exclamation-triangle"></i> Requiere atención</div>' : ''}
    <button type="button" class="btn-sm primary ia-kpi-guardar-btn" data-kpi-idx="${idx}" style="margin-top:.5rem;padding:.35rem .75rem;font-size:.76rem;background:#059669;border-color:#059669"><i class="fas fa-save"></i> Guardar este KPI</button>
  </div>`;
}

async function guardarKpiCard(kpi) {
  const sqlSimple = window._gnSqlSimple;
  const escSql = window._gnEsc;
  if (typeof sqlSimple !== 'function' || typeof escSql !== 'function') {
    if (typeof window.toast === 'function') window.toast('Neon no disponible para guardar.', 'error');
    return false;
  }
  const t = tid();
  if (!t) {
    if (typeof window.toast === 'function') window.toast('Sin tenant activo.', 'error');
    return false;
  }
  let uid = 'NULL';
  try {
    const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
    if (tok) {
      const pl = JSON.parse(atob(tok.split('.')[1]));
      const n = Number(pl.userId ?? pl.sub);
      if (Number.isFinite(n) && n > 0) uid = escSql(n);
    }
  } catch (_) {}
  const rawMetrica = String(kpi.metrica || kpi.nombre || '').slice(0, 80);
  const metrica = rawMetrica.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '');
  const unidad = String(kpi.unidad || '').slice(0, 32);
  const valor = Number(kpi.valor) || 0;
  const desde = kpi.periodo_inicio || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const hasta = kpi.periodo_fin || new Date().toISOString().slice(0, 10);
  const notas = String(kpi.interpretacion || kpi.nombre || '').slice(0, 300);

  try {
    await sqlSimple(
      `INSERT INTO kpi_snapshots (tenant_id, metrica, periodo_inicio, periodo_fin, valor_numero, valor_json, unidad, fuente, notas, created_by_usuario_id)
       VALUES (${escSql(t)}, ${escSql(metrica)}, ${escSql(desde)}::date, ${escSql(hasta)}::date, ${escSql(valor)}, '{}'::jsonb, ${escSql(unidad)}, ${escSql('computed_batch')}, ${escSql(notas)}, ${uid})`
    );
    return true;
  } catch (e) {
    console.error('[ia-kpi-sugeridos] save error', e);
    return false;
  }
}

let _lastKpis = [];

async function sugerirKpis() {
  const btn = document.getElementById('btn-ia-sugerir-kpis');
  if (!btn) return;

  const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
  if (!token) {
    if (typeof window.toast === 'function') window.toast('Sesión no disponible. Recargá la página.', 'error');
    return;
  }

  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando IA…';

  try {
    const url = typeof window.apiUrl === 'function' ? window.apiUrl('/api/ia/sugerir-kpis') : '/api/ia/sugerir-kpis';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tipo_negocio: tipoNegocioActual(), periodo_dias: 30 }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      if (typeof window.toast === 'function') window.toast(data.error || 'Error al sugerir KPIs.', 'warning');
      return;
    }

    const kpis = data.kpis || [];
    _lastKpis = kpis;

    const container = document.getElementById('ia-kpi-sugeridos-container') || crearContainer();
    if (!kpis.length) {
      container.innerHTML = '<div style="padding:.6rem;font-size:.82rem;color:#64748b">La IA no generó KPIs. Intentá más tarde.</div>';
      return;
    }

    let html = '<div style="font-size:.85rem;font-weight:700;color:#5b21b6;margin-bottom:.5rem"><i class="fas fa-brain"></i> KPIs sugeridos por IA — últimos 30 días</div>';
    if (data.metricas) {
      html += `<div style="font-size:.75rem;color:#64748b;margin-bottom:.65rem">Total reclamos: ${data.metricas.total_reclamos || 0} · Cerrados: ${data.metricas.cerrados || 0} · Tiempo prom. cierre: ${data.metricas.horas_promedio_cierre != null ? data.metricas.horas_promedio_cierre + 'h' : '—'}</div>`;
    }
    if (data.barrios && data.barrios.length) {
      html += renderBarrios(data.barrios);
    }
    kpis.forEach((k, i) => { html += renderCard(k, i); });
    container.innerHTML = html;

    container.querySelectorAll('.ia-kpi-guardar-btn').forEach((b) => {
      b.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const idx = Number(btn.dataset.kpiIdx);
        const kpi = _lastKpis[idx];
        if (!kpi) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
        const ok = await guardarKpiCard(kpi);
        if (ok) {
          btn.innerHTML = '<i class="fas fa-check"></i> Guardado';
          btn.style.background = '#16a34a';
          if (typeof window.toast === 'function') window.toast(`KPI "${kpi.nombre || kpi.metrica}" guardado.`, 'success');
          if (typeof window.cargarKpiSnapshotsAdmin === 'function') window.cargarKpiSnapshotsAdmin();
          if (document.getElementById('ia-informe-unificado-output') && typeof window._gnGenerarInformeIA === 'function') {
            window._gnGenerarInformeIA();
          }
        } else {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-save"></i> Guardar este KPI';
          if (typeof window.toast === 'function') window.toast('No se pudo guardar el KPI.', 'error');
        }
      });
    });
  } catch (err) {
    console.error('[ia-kpi-sugeridos]', err);
    if (typeof window.toast === 'function') window.toast('Error de red al consultar la IA.', 'warning');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

function crearContainer() {
  const c = document.createElement('div');
  c.id = 'ia-kpi-sugeridos-container';
  c.style.cssText = 'padding:.75rem;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border:1px solid #c4b5fd;border-radius:.5rem;margin-bottom:1rem';
  const lista = document.getElementById('kpi-snapshots-lista');
  if (lista) {
    lista.parentNode.insertBefore(c, lista);
  } else {
    const sec = document.getElementById('admin-kpi');
    if (sec) sec.appendChild(c);
  }
  return c;
}

export function initBotonSugerirKpis() {
  if (_wired) return;
  const sec = document.getElementById('admin-kpi');
  if (!sec) return;
  if (!window.esAdmin || !window.esAdmin()) return;
  _wired = true;

  if (document.getElementById('btn-ia-sugerir-kpis')) return;

  const refrescar = document.getElementById('kpi-btn-refrescar');
  if (refrescar && refrescar.parentNode) {
    refrescar.parentNode.insertBefore(buildBtn(), refrescar.nextSibling);
  } else {
    sec.insertBefore(buildBtn(), sec.firstChild);
  }
}

if (typeof window !== 'undefined') window._gnInitBotonSugerirKpis = initBotonSugerirKpis;

(function autoInit() {
  if (typeof document === 'undefined') return;
  function tryInit() {
    if (_wired) return;
    initBotonSugerirKpis();
    if (!_wired) setTimeout(tryInit, 2000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 500));
  } else {
    setTimeout(tryInit, 500);
  }
})();
