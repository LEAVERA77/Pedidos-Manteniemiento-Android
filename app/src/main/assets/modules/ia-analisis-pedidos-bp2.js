/**
 * Boton "Analizar con IA" en el panel lateral de pedidos (#bp2).
 * Recopila pedidos visibles del tab activo, llama a POST /api/ia/analizar-reclamos
 * y muestra el resultado en un panel flotante draggable+cerrable.
 * made by leavera77
 */

let _wired = false;

function tipoNegocio() {
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

/* ── Panel flotante ─────────────────────────────────────── */

const PANEL_ID = 'gn-ia-bp2-float';

function getOrCreatePanel() {
  let p = document.getElementById(PANEL_ID);
  if (p) return p;

  p = document.createElement('div');
  p.id = PANEL_ID;
  p.style.cssText =
    'position:fixed;width:min(380px,calc(100vw - 1rem));max-height:min(72vh,560px);display:none;flex-direction:column;' +
    'background:#fff;border-radius:.75rem;box-shadow:0 14px 44px rgba(15,23,42,.3);border:1px solid var(--bo);' +
    'z-index:10060;overflow:hidden;top:4.5rem;right:.5rem;color:var(--td,#1e293b)';

  const hd = document.createElement('div');
  hd.className = 'gn-ia-bp2-float-hd';
  hd.style.cssText =
    'cursor:grab;user-select:none;display:flex;align-items:center;justify-content:space-between;gap:.35rem;' +
    'padding:.5rem .65rem;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;flex-shrink:0;font-size:.88rem;font-weight:600';

  const title = document.createElement('span');
  title.innerHTML = '<i class="fas fa-brain" style="margin-right:.35rem"></i>Analisis IA';
  hd.appendChild(title);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:.15rem';

  const mkBtn = (ico, tip, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = tip;
    b.innerHTML = `<i class="fas ${ico}"></i>`;
    b.style.cssText =
      'background:rgba(255,255,255,.18);border:none;color:#fff;width:30px;height:30px;border-radius:.35rem;cursor:pointer;font-size:.85rem;display:flex;align-items:center;justify-content:center';
    b.addEventListener('click', fn);
    return b;
  };

  actions.appendChild(mkBtn('fa-times', 'Cerrar', () => { p.style.display = 'none'; }));
  hd.appendChild(actions);
  p.appendChild(hd);

  const body = document.createElement('div');
  body.id = 'gn-ia-bp2-float-body';
  body.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding:.65rem;font-size:.82rem;line-height:1.5;-webkit-overflow-scrolling:touch';
  p.appendChild(body);

  document.body.appendChild(p);
  setupDrag(p, hd);
  return p;
}

function setupDrag(panel, handle) {
  let ox = 0, oy = 0, sx = 0, sy = 0, dragging = false;

  const onDown = (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    handle.style.cursor = 'grabbing';
    const ev = e.touches ? e.touches[0] : e;
    ox = ev.clientX;
    oy = ev.clientY;
    const r = panel.getBoundingClientRect();
    sx = r.left;
    sy = r.top;
    e.preventDefault();
  };

  const onMove = (e) => {
    if (!dragging) return;
    const ev = e.touches ? e.touches[0] : e;
    const dx = ev.clientX - ox;
    const dy = ev.clientY - oy;
    panel.style.left = `${sx + dx}px`;
    panel.style.top = `${sy + dy}px`;
    panel.style.right = 'auto';
  };

  const onUp = () => {
    dragging = false;
    handle.style.cursor = 'grab';
  };

  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);
}

/* ── Resumen local de pedidos ──────────────────────────── */

function resumenPedidosVisibles() {
  const pedidos = Array.isArray(window.app?.p) ? window.app.p : [];
  const tab = window.app?.tab || 'p';
  const visFn = typeof window.pedidosVisiblesEnUI === 'function' ? window.pedidosVisiblesEnUI : null;
  const vis = visFn ? visFn() : pedidos;

  const filtered = vis.filter((p) => {
    if (tab === 'p') return p.es === 'Pendiente';
    if (tab === 'a') return p.es === 'Asignado' || p.es === 'En ejecución';
    return p.es === 'Cerrado' || p.es === 'Derivado externo';
  });

  const total = filtered.length;
  const porTipo = {};
  const porBarrio = {};
  const porEstado = {};
  let sumHoras = 0;
  let countCierre = 0;

  for (const p of filtered) {
    const t = p.tt || p.tipo_trabajo || 'Sin tipo';
    porTipo[t] = (porTipo[t] || 0) + 1;
    const b = p.di || p.barrio || p.distribuidor || '';
    if (b) porBarrio[b] = (porBarrio[b] || 0) + 1;
    porEstado[p.es] = (porEstado[p.es] || 0) + 1;
    if (p.es === 'Cerrado' && p.fc && p.fe) {
      const h = (new Date(p.fc) - new Date(p.fe)) / 3600000;
      if (h > 0 && h < 8760) { sumHoras += h; countCierre++; }
    }
  }

  const tabLabel = tab === 'p' ? 'Pendientes' : tab === 'a' ? 'Asignados / En ejecucion' : 'Cerrados';
  return { total, tabLabel, porTipo, porBarrio, porEstado, promHorasCierre: countCierre ? (sumHoras / countCierre) : null, filtered };
}

function renderResumenLocal(r) {
  let h = '';
  h += `<div style="font-size:.84rem;color:#475569;margin-bottom:.6rem">`;
  h += `<strong>${r.total}</strong> pedidos en tab <strong>${esc(r.tabLabel)}</strong>`;
  if (r.promHorasCierre != null) h += ` · T.prom cierre: <strong>${r.promHorasCierre.toFixed(1)}h</strong>`;
  h += '</div>';

  const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const tipos = sortDesc(r.porTipo);
  if (tipos.length) {
    h += '<div style="margin-bottom:.55rem"><strong style="font-size:.8rem">Tipos mas frecuentes</strong>';
    h += '<table style="width:100%;margin-top:.25rem;font-size:.78rem;border-collapse:collapse">';
    for (const [k, v] of tipos) {
      h += `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:.2rem .3rem">${esc(k)}</td><td style="text-align:right;padding:.2rem .3rem;font-weight:600">${v}</td></tr>`;
    }
    h += '</table></div>';
  }

  const barrios = sortDesc(r.porBarrio);
  if (barrios.length) {
    h += '<div style="margin-bottom:.55rem"><strong style="font-size:.8rem">Top barrios / zonas</strong>';
    h += '<table style="width:100%;margin-top:.25rem;font-size:.78rem;border-collapse:collapse">';
    for (const [k, v] of barrios) {
      h += `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:.2rem .3rem">${esc(k)}</td><td style="text-align:right;padding:.2rem .3rem;font-weight:600">${v}</td></tr>`;
    }
    h += '</table></div>';
  }

  return h;
}

/* ── Llamada a la API IA ───────────────────────────────── */

async function analizarPedidosBp2() {
  const btn = document.getElementById('btn-ia-bp2');
  if (!btn) return;

  const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
  if (!token) {
    if (typeof window.toast === 'function') window.toast('Sesion no disponible.', 'error');
    return;
  }

  const panel = getOrCreatePanel();
  const body = document.getElementById('gn-ia-bp2-float-body');
  if (!body) return;

  panel.style.display = 'flex';

  const resumen = resumenPedidosVisibles();
  body.innerHTML =
    '<div style="padding:.5rem;text-align:center;color:#7c3aed"><i class="fas fa-spinner fa-spin"></i> Analizando pedidos…</div>';

  let localHtml = renderResumenLocal(resumen);

  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const url = typeof window.apiUrl === 'function' ? window.apiUrl('/api/ia/analizar-reclamos') : '/api/ia/analizar-reclamos';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tipo_negocio: tipoNegocio(), periodo_dias: 30 }),
    });
    const data = await resp.json().catch(() => ({}));

    let iaHtml = '';
    if (resp.ok && data.ok && data.recomendacion_ia) {
      iaHtml =
        '<div style="margin-top:.65rem;padding:.55rem;background:linear-gradient(135deg,#faf5ff,#f5f3ff);border-radius:.45rem;border:1px solid #ddd6fe">' +
        '<div style="font-size:.8rem;font-weight:700;color:#6d28d9;margin-bottom:.3rem"><i class="fas fa-lightbulb" style="color:#a78bfa"></i> Recomendacion IA</div>' +
        `<div style="font-size:.8rem;line-height:1.55;color:#1e1b4b;white-space:pre-wrap">${esc(data.recomendacion_ia)}</div>` +
        '</div>';
    }

    body.innerHTML = localHtml + iaHtml;
  } catch (err) {
    console.error('[ia-bp2]', err);
    body.innerHTML = localHtml +
      '<div style="margin-top:.5rem;padding:.4rem;background:#fef2f2;border:1px solid #fca5a5;border-radius:.35rem;font-size:.78rem;color:#991b1b">Error de red al consultar la IA.</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

/* ── Inicializacion ────────────────────────────────────── */

function initBp2IA() {
  if (_wired) return;
  const toolbar = document.querySelector('.gn-bp2-toolbar');
  if (!toolbar || document.getElementById('btn-ia-bp2')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-ia-bp2';
  btn.title = 'Analizar pedidos visibles con IA';
  btn.innerHTML = '<i class="fas fa-brain"></i>';
  btn.style.cssText =
    'background:#7c3aed;color:#fff;border:none;border-radius:.35rem;width:28px;height:28px;' +
    'display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:.82rem;flex-shrink:0';
  btn.addEventListener('click', () => void analizarPedidosBp2());

  const spacer = toolbar.querySelector('.gn-bp2-toolbar-spacer');
  if (spacer) toolbar.insertBefore(btn, spacer.nextSibling);
  else toolbar.appendChild(btn);

  _wired = true;
}

export { initBp2IA };

if (typeof window !== 'undefined') window._gnInitBp2IA = initBp2IA;

(function autoInit() {
  if (typeof document === 'undefined') return;
  function tryInit() {
    if (_wired) return;
    initBp2IA();
    if (!_wired) setTimeout(tryInit, 2000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 500));
  } else {
    setTimeout(tryInit, 500);
  }
})();
