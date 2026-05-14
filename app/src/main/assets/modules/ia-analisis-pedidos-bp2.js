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

function esAdminPanel() {
  return typeof window.esAdmin === 'function' && window.esAdmin();
}

function esTecnicoPanel() {
  return typeof window.esTecnicoOSupervisor === 'function' && window.esTecnicoOSupervisor();
}

function tituloAnalisisIaBp2() {
  if (esAdminPanel()) return 'Analizar pedidos visibles con IA';
  if (esTecnicoPanel()) return 'IA: prioridades y ruta sobre tus pedidos asignados (sin pendientes)';
  return 'Analizar pedidos visibles con IA';
}

function haversineKm(la1, lo1, la2, lo2) {
  const r = 6371;
  const dLat = ((la2 - la1) * Math.PI) / 180;
  const dLon = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

function horasDesdeIso(fechaIso) {
  if (!fechaIso) return 0;
  const diff = Date.now() - new Date(fechaIso).getTime();
  return Math.max(0, diff / 3600000);
}

function leerUltimaUbicacionLs() {
  try {
    const raw = localStorage.getItem('ultima_ubicacion');
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && Number.isFinite(Number(j.lat)) && Number.isFinite(Number(j.lon))) {
      return { lat: Number(j.lat), lon: Number(j.lon) };
    }
  } catch (_) {}
  return null;
}

function leerVerTodosPedidosTecnicoLocal() {
  if (!esTecnicoPanel()) return false;
  try {
    const chk = document.getElementById('toggle-ver-todos-pedidos');
    if (chk && chk.checked) return true;
    const sel = document.getElementById('sel-android-pedidos-scope');
    if (sel && sel.value === 'todos') return true;
  } catch (_) {}
  try {
    return localStorage.getItem('pmg_tecnico_ver_todos') === '1';
  } catch (_) {
    return false;
  }
}

function uidTecnicoActualNum() {
  const u = window.app?.u;
  if (!u) return null;
  const keys = ['id', 'userId', 'user_id', 'usuario_id'];
  for (const k of keys) {
    const raw = u[k];
    if (raw == null || raw === '') continue;
    const n = parseInt(String(raw).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Id de sesión como string (útil si `parseInt(id)` falla pero `tai` coincide como texto). */
function uidTecnicoActualStr() {
  const u = window.app?.u;
  if (!u) return '';
  const keys = ['id', 'userId', 'user_id', 'usuario_id'];
  for (const k of keys) {
    const raw = u[k];
    if (raw == null || raw === '') continue;
    const s = String(raw).trim();
    if (s) return s;
  }
  return '';
}

function taiNumPedido(p) {
  if (!p) return null;
  if (p.tai != null && p.tai !== '') {
    const t = parseInt(String(p.tai).trim(), 10);
    if (Number.isFinite(t)) return t;
  }
  const alt =
    p.tecnico_asignado_id ??
    p.tecnicoAsignadoId ??
    p.TECNICO_ASIGNADO_ID ??
    p.tecnico_asignado;
  if (alt != null && alt !== '') {
    const t = parseInt(String(alt).trim(), 10);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** Con «Ver todos», el pedido debe ser del técnico actual (tai vs id numérico o texto). */
function taiCoincideConTecnicoLogueado(p) {
  const uid = uidTecnicoActualNum();
  if (uid != null) {
    const t = taiNumPedido(p);
    return t != null && t === uid;
  }
  const idStr = uidTecnicoActualStr();
  if (!idStr) return false;
  const tRaw = p.tai ?? p.tecnico_asignado_id ?? p.tecnicoAsignadoId ?? p.tecnico_asignado;
  if (tRaw == null || tRaw === '') return false;
  if (String(tRaw).trim() === idStr) return true;
  const tn = parseInt(String(tRaw).trim(), 10);
  const un = parseInt(idStr, 10);
  return Number.isFinite(tn) && Number.isFinite(un) && tn === un;
}

/** Misma semántica que el panel (norm + legacy `estado` crudo). */
function esAsignadoOEnEjecucionUi(p) {
  if (!p) return false;
  const raw = p.es != null && String(p.es).trim() !== '' ? p.es : p.estado;
  try {
    if (typeof window.normalizarEstadoPedidoUi === 'function') {
      const e = window.normalizarEstadoPedidoUi(raw);
      return e === 'Asignado' || e === 'En ejecución';
    }
  } catch (_) {}
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'asignado' || s === 'en ejecución' || s === 'en ejecucion';
}

/**
 * Pedidos Asignado / En ejecución del técnico logueado.
 * Fuente: `pedidosVisiblesEnUI()` (misma base que el panel #pl: rubro, derivados, etc.).
 * Sin «Todos»: Neon ya limitó `app.p` al técnico — no hace falta cruzar tai.
 * Con «Todos»: filtrar por técnico asignado = usuario actual (numérico o string).
 */
function pedidosAsignadosAMi() {
  const visFn = typeof window.pedidosVisiblesEnUI === 'function' ? window.pedidosVisiblesEnUI : null;
  const raw = visFn ? visFn() : Array.isArray(window.app?.p) ? window.app.p : [];
  const verTodos = leerVerTodosPedidosTecnicoLocal();
  return raw.filter((p) => {
    if (!esAsignadoOEnEjecucionUi(p)) return false;
    if (!verTodos) return true;
    return taiCoincideConTecnicoLogueado(p);
  });
}

/**
 * Resumen solo asignados al técnico + distancias (GPS último conocido y pares entre pedidos con coords).
 */
function construirResumenTecnicoAndroidParaApi() {
  const list = pedidosAsignadosAMi();
  const pos = leerUltimaUbicacionLs();
  const coordsFn = typeof window.coordsEfectivasPedidoMapa === 'function' ? window.coordsEfectivasPedidoMapa : null;
  const pedidos_asignados = list.map((p) => {
    let km = null;
    let tiene = false;
    let la = null;
    let ln = null;
    if (coordsFn) {
      const c = coordsFn(p);
      la = c.la;
      ln = c.ln;
      tiene = Number.isFinite(la) && Number.isFinite(ln);
      if (tiene && pos) km = haversineKm(pos.lat, pos.lon, la, ln);
    }
    const hd = horasDesdeIso(p.f);
    const puntaje =
      typeof window._gnCalcularPuntajeBp2 === 'function'
        ? Math.round(window._gnCalcularPuntajeBp2(p) * 100) / 100
        : null;
    return {
      np: p.np,
      prioridad: p.pr,
      estado: p.es,
      tipo: p.tt,
      horas_abierto: Math.round(hd * 10) / 10,
      km_desde_gps: km != null ? Math.round(km * 100) / 100 : null,
      tiene_coord: tiene,
      direccion_resumen: String(p.dis || '').slice(0, 200),
      puntaje_urgencia: puntaje,
    };
  });
  const distancias_pares = [];
  const n = list.length;
  if (coordsFn && n >= 2 && n <= 14) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ca = coordsFn(list[i]);
        const cb = coordsFn(list[j]);
        if (
          Number.isFinite(ca.la) &&
          Number.isFinite(ca.ln) &&
          Number.isFinite(cb.la) &&
          Number.isFinite(cb.ln)
        ) {
          distancias_pares.push({
            de_np: list[i].np,
            a_np: list[j].np,
            km: Math.round(haversineKm(ca.la, ca.ln, cb.la, cb.ln) * 100) / 100,
          });
        }
      }
    }
  }
  return {
    modo: 'tecnico_asignados_panel',
    posicion_tecnico_wgs84: pos ? { lat: pos.lat, lon: pos.lon } : null,
    cantidad: pedidos_asignados.length,
    pedidos_asignados,
    distancias_pares: distancias_pares.slice(0, 42),
  };
}

function renderResumenTecnicoAsignados(pack) {
  const n = pack.cantidad || 0;
  let h = '';
  h += `<div style="font-size:.84rem;color:#475569;margin-bottom:.6rem">`;
  h += `<strong>${n}</strong> pedido(s) <strong>asignados a vos</strong> (Pendientes no entran en este análisis)`;
  h += '</div>';
  if (pack.posicion_tecnico_wgs84) {
    h += `<div style="font-size:.76rem;color:#64748b;margin-bottom:.45rem">Última posición conocida (GPS): lat ${esc(String(pack.posicion_tecnico_wgs84.lat))}, lon ${esc(String(pack.posicion_tecnico_wgs84.lon))}</div>`;
  } else {
    h += '<div style="font-size:.76rem;color:#92400e;margin-bottom:.45rem">Sin posición GPS reciente en el dispositivo: las distancias pueden faltar.</div>';
  }
  h +=
    '<div style="font-size:.72rem;color:#64748b;margin:.35rem 0 .5rem">Distancias en línea recta (WGS84). Nominatim geocodifica direcciones; no calcula rutas de navegación calle a calle.</div>';
  if (n && Array.isArray(pack.pedidos_asignados)) {
    h += '<table style="width:100%;font-size:.76rem;border-collapse:collapse;margin-top:.35rem">';
    h += '<tr style="border-bottom:1px solid #e2e8f0;text-align:left"><th style="padding:.2rem">#</th><th style="padding:.2rem">Pr.</th><th style="padding:.2rem">h</th><th style="padding:.2rem">Punt.</th><th style="padding:.2rem">km GPS</th></tr>';
    for (const row of pack.pedidos_asignados.slice(0, 12)) {
      h += `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:.2rem">${esc(String(row.np ?? ''))}</td><td style="padding:.2rem">${esc(String(row.prioridad ?? ''))}</td><td style="padding:.2rem;text-align:right">${row.horas_abierto != null ? esc(String(row.horas_abierto)) : '—'}</td><td style="padding:.2rem;text-align:right">${row.puntaje_urgencia != null ? esc(String(row.puntaje_urgencia)) : '—'}</td><td style="padding:.2rem;text-align:right">${row.km_desde_gps != null ? esc(String(row.km_desde_gps)) : '—'}</td></tr>`;
    }
    if (n > 12) h += `<tr><td colspan="5" style="padding:.25rem;color:#64748b">… y ${n - 12} más</td></tr>`;
    h += '</table>';
  }
  return h;
}

/* ── Panel flotante ─────────────────────────────────────── */

const PANEL_ID = 'gn-ia-bp2-float';

function esIaBp2LayoutAndroid() {
  try {
    return document.documentElement.classList.contains('gn-android-webview');
  } catch (_) {
    return false;
  }
}

function getOrCreatePanel() {
  let p = document.getElementById(PANEL_ID);
  const wantAndroid = esIaBp2LayoutAndroid();
  if (p) {
    const isAndroid = p.classList.contains('gn-ia-bp2--android-root');
    if (wantAndroid !== isAndroid) {
      try {
        p.remove();
      } catch (_) {}
      p = null;
    }
  }
  if (p) return p;

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

  const body = document.createElement('div');
  body.id = 'gn-ia-bp2-float-body';
  body.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding:.65rem;font-size:.82rem;line-height:1.5;-webkit-overflow-scrolling:touch';

  p = document.createElement('div');
  p.id = PANEL_ID;

  if (wantAndroid) {
    p.className = 'gn-ia-bp2--android-root';
    p.style.display = 'none';
    const rootClose = () => {
      p.style.display = 'none';
    };
    actions.appendChild(mkBtn('fa-times', 'Cerrar', rootClose));
    hd.appendChild(actions);
    if (wantAndroid) hd.style.cursor = 'default';
    const inner = document.createElement('div');
    inner.className = 'gn-ia-bp2-float-card';
    inner.appendChild(hd);
    inner.appendChild(body);
    p.appendChild(inner);
    document.body.appendChild(p);
    return p;
  }

  p.style.cssText =
    'position:fixed;width:min(380px,calc(100vw - 1rem));max-height:min(72vh,560px);display:none;flex-direction:column;' +
    'background:#fff;border-radius:.75rem;box-shadow:0 14px 44px rgba(15,23,42,.3);border:1px solid var(--bo);' +
    'z-index:10060;overflow:hidden;top:4.5rem;right:.5rem;color:var(--td,#1e293b)';
  actions.appendChild(mkBtn('fa-times', 'Cerrar', () => {
    p.style.display = 'none';
  }));
  hd.appendChild(actions);
  p.appendChild(hd);
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
  try {
    if (esIaBp2LayoutAndroid() && typeof window.gnBumpOverlayElement === 'function') window.gnBumpOverlayElement(panel);
  } catch (_) {}

  const techFlujoAsignados = !esAdminPanel() && esTecnicoPanel();

  body.innerHTML =
    '<div style="padding:.5rem;text-align:center;color:#7c3aed"><i class="fas fa-spinner fa-spin"></i> Analizando…</div>';

  let localHtml = '';
  let packTec = null;
  if (techFlujoAsignados) {
    packTec = construirResumenTecnicoAndroidParaApi();
    localHtml = renderResumenTecnicoAsignados(packTec);
  } else {
    localHtml = renderResumenLocal(resumenPedidosVisibles());
  }

  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    let iaHtml = '';
    if (techFlujoAsignados) {
      const url =
        typeof window.apiUrl === 'function'
          ? window.apiUrl('/api/ia/analizar-asignados-tecnico')
          : '/api/ia/analizar-asignados-tecnico';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resumen: packTec }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.ok && data.recomendacion_ia) {
        iaHtml =
          '<div style="margin-top:.65rem;padding:.55rem;background:linear-gradient(135deg,#faf5ff,#f5f3ff);border-radius:.45rem;border:1px solid #ddd6fe">' +
          '<div style="font-size:.8rem;font-weight:700;color:#6d28d9;margin-bottom:.3rem"><i class="fas fa-lightbulb" style="color:#a78bfa"></i> Recomendacion IA (tus asignados)</div>' +
          `<div style="font-size:.8rem;line-height:1.55;color:#1e1b4b;white-space:pre-wrap">${esc(data.recomendacion_ia)}</div>` +
          '</div>';
      } else if (!resp.ok) {
        iaHtml =
          '<div style="margin-top:.5rem;padding:.4rem;background:#fef2f2;border:1px solid #fca5a5;border-radius:.35rem;font-size:.78rem;color:#991b1b">' +
          esc(data.error || `Error ${resp.status} al consultar la IA.`) +
          '</div>';
      }
    } else {
      const url =
        typeof window.apiUrl === 'function' ? window.apiUrl('/api/ia/analizar-reclamos') : '/api/ia/analizar-reclamos';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo_negocio: tipoNegocio(), periodo_dias: 30 }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.ok && data.recomendacion_ia) {
        iaHtml =
          '<div style="margin-top:.65rem;padding:.55rem;background:linear-gradient(135deg,#faf5ff,#f5f3ff);border-radius:.45rem;border:1px solid #ddd6fe">' +
          '<div style="font-size:.8rem;font-weight:700;color:#6d28d9;margin-bottom:.3rem"><i class="fas fa-lightbulb" style="color:#a78bfa"></i> Recomendacion IA</div>' +
          `<div style="font-size:.8rem;line-height:1.55;color:#1e1b4b;white-space:pre-wrap">${esc(data.recomendacion_ia)}</div>` +
          '</div>';
      }
    }

    body.innerHTML = localHtml + iaHtml;
  } catch (err) {
    console.error('[ia-bp2]', err);
    body.innerHTML =
      localHtml +
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
  btn.title = tituloAnalisisIaBp2();
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
