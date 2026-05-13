/**
 * Boton "Ordenar por prioridad IA" en toolbar de pedidos (#bp2).
 * Calcula puntaje de urgencia y reordena la lista de pendientes en tiempo real.
 * made by leavera77
 */

let _wired = false;
let _priorizacionActiva = false;
let _refreshTimer = null;
const REFRESH_INTERVAL_MS = 30_000;

const PESO_HORAS = 2;
const PESO_PRIORIDAD = 3;
const PESO_TIPO_CRITICO = 5;

const TIPOS_CRITICOS = new Set([
  'corte de energía', 'corte de agua', 'fuga de gas', 'emergencia',
  'poste caído', 'cable caído', 'inundación', 'derrumbe',
  'orden público', 'vandalismo', 'violencia de género',
]);

function prioridadNumero(pr) {
  const p = String(pr || '').toLowerCase();
  if (p === 'alta' || p === 'urgente' || p === 'crítica') return 3;
  if (p === 'baja') return 1;
  return 2;
}

function horasDesde(fechaIso) {
  if (!fechaIso) return 0;
  const diff = Date.now() - new Date(fechaIso).getTime();
  return Math.max(0, diff / 3600000);
}

function esTipoCritico(tipo) {
  if (!tipo) return false;
  const t = String(tipo).toLowerCase().trim();
  for (const c of TIPOS_CRITICOS) {
    if (t.includes(c)) return true;
  }
  return false;
}

function calcularPuntaje(p) {
  const horas = horasDesde(p.f);
  const prio = prioridadNumero(p.pr);
  const critico = esTipoCritico(p.tt) ? 1 : 0;
  return (horas * PESO_HORAS) + (prio * PESO_PRIORIDAD) + (critico * PESO_TIPO_CRITICO);
}

function _startRefresh() {
  _stopRefresh();
  _refreshTimer = setInterval(() => {
    if (!_priorizacionActiva) { _stopRefresh(); return; }
    if (typeof window.render === 'function') window.render();
  }, REFRESH_INTERVAL_MS);
}

function _stopRefresh() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

function tituloPriorizarIdle() {
  try {
    if (typeof window.esAdmin === 'function' && window.esAdmin()) {
      return 'Ordenar pedidos pendientes por prioridad IA';
    }
    if (typeof window.esTecnicoOSupervisor === 'function' && window.esTecnicoOSupervisor()) {
      return 'Ordenar asignados/en ejecución: prioridad y más antiguos primero';
    }
  } catch (_) {}
  return 'Ordenar pedidos pendientes por prioridad IA';
}

function togglePriorizacion() {
  _priorizacionActiva = !_priorizacionActiva;
  const btn = document.getElementById('btn-ia-priorizar-bp2');
  if (btn) {
    btn.style.background = _priorizacionActiva ? '#059669' : '#7c3aed';
    btn.title = _priorizacionActiva
      ? 'Priorización IA activa — se actualiza cada 30 s (click para desactivar)'
      : tituloPriorizarIdle();
  }
  if (_priorizacionActiva) _startRefresh();
  else _stopRefresh();
  if (typeof window.render === 'function') window.render();
}

if (typeof window !== 'undefined') {
  window._gnPriorizarPedidosBp2 = function (pedidos) {
    if (!_priorizacionActiva || !Array.isArray(pedidos)) return pedidos;
    const tab = window.app?.tab;
    const adm = typeof window.esAdmin === 'function' && window.esAdmin();
    const tec = typeof window.esTecnicoOSupervisor === 'function' && window.esTecnicoOSupervisor();
    if (adm) {
      if (tab !== 'p') return pedidos;
      return [...pedidos].sort((a, b) => calcularPuntaje(b) - calcularPuntaje(a));
    }
    if (tec) {
      const isOpen = (p) => {
        if (!p) return false;
        const raw = p.es != null && String(p.es).trim() !== '' ? p.es : p.estado;
        try {
          if (typeof window !== 'undefined' && typeof window.normalizarEstadoPedidoUi === 'function') {
            const e = window.normalizarEstadoPedidoUi(raw);
            return e === 'Asignado' || e === 'En ejecución';
          }
        } catch (_) {}
        const s = String(raw ?? '').trim().toLowerCase();
        return s === 'asignado' || s === 'en ejecución' || s === 'en ejecucion';
      };
      const asg = pedidos.filter(isOpen);
      const rest = pedidos.filter((p) => !isOpen(p));
      if (!asg.length) return pedidos;
      const sorted = [...asg].sort((a, b) => {
        const sb = calcularPuntaje(b);
        const sa = calcularPuntaje(a);
        if (sb !== sa) return sb - sa;
        const ta = a.f ? new Date(a.f).getTime() : 0;
        const tb = b.f ? new Date(b.f).getTime() : 0;
        return ta - tb;
      });
      return [...sorted, ...rest];
    }
    return pedidos;
  };
  window._gnPriorizacionActiva = () => _priorizacionActiva;
  window._gnCalcularPuntajeBp2 = calcularPuntaje;
}

function initPriorizacion() {
  if (_wired) return;
  const toolbar = document.querySelector('.gn-bp2-toolbar');
  if (!toolbar || document.getElementById('btn-ia-priorizar-bp2')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-ia-priorizar-bp2';
  btn.title = tituloPriorizarIdle();
  btn.innerHTML = '<i class="fas fa-sort-amount-down"></i>';
  btn.style.cssText =
    'background:#7c3aed;color:#fff;border:none;border-radius:.35rem;width:28px;height:28px;' +
    'display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:.82rem;flex-shrink:0';
  btn.addEventListener('click', togglePriorizacion);

  const iaBp2 = document.getElementById('btn-ia-bp2');
  if (iaBp2) toolbar.insertBefore(btn, iaBp2);
  else {
    const spacer = toolbar.querySelector('.gn-bp2-toolbar-spacer');
    if (spacer) toolbar.insertBefore(btn, spacer.nextSibling);
    else toolbar.appendChild(btn);
  }

  _wired = true;
}

export { initPriorizacion, calcularPuntaje };
