/**
 * Aviso antes del cierre por inactividad (15 min, misma clave que app.js).
 * No implementa un segundo logout: solo extiende pmg_last_activity_ts.
 * made by leavera77
 */

const PMG_LAST_ACTIVITY_TS_KEY = 'pmg_last_activity_ts';
const SESION_INACTIVIDAD_MAX_MS = 15 * 60 * 1000;
const AVISO_ANTES_MS = 2 * 60 * 1000;
const POLL_MS = 30 * 1000;

const MODAL_ID = 'gn-modal-idle-warning';
let _avisoMostrado = false;

function haySesionActiva() {
  try {
    return !!(window.app && window.app.u);
  } catch (_) {
    return false;
  }
}

function leerUltimaActividad() {
  try {
    const raw = localStorage.getItem(PMG_LAST_ACTIVITY_TS_KEY);
    const t = parseInt(raw, 10);
    return Number.isFinite(t) && t > 0 ? t : null;
  } catch (_) {
    return null;
  }
}

function extenderSesionActividad() {
  try {
    localStorage.setItem(PMG_LAST_ACTIVITY_TS_KEY, String(Date.now()));
  } catch (_) {}
  _avisoMostrado = false;
  cerrarModalIdle();
}

function ensureIdleModal() {
  if (document.getElementById(MODAL_ID)) return;
  const html = `
<div id="${MODAL_ID}" class="mo" style="z-index:2070" role="alertdialog" aria-modal="true">
  <div class="md" style="max-width:min(92vw,22rem)">
    <div class="mh"><h3><i class="fas fa-clock"></i> Sesión por vencer</h3></div>
    <div class="mb gn-idle-modal-bd">
      <p>Por seguridad, tu sesión se cerrará en breve por inactividad.</p>
      <div class="gn-idle-modal-actions">
        <button type="button" class="bp" id="gn-idle-extend-btn"><i class="fas fa-check"></i> Seguir conectado</button>
      </div>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('gn-idle-extend-btn')?.addEventListener('click', () => extenderSesionActividad());
}

function abrirModalIdle() {
  ensureIdleModal();
  document.getElementById(MODAL_ID)?.classList.add('active');
}

function cerrarModalIdle() {
  document.getElementById(MODAL_ID)?.classList.remove('active');
}

function revisarInactividad() {
  if (!haySesionActiva()) {
    _avisoMostrado = false;
    cerrarModalIdle();
    return;
  }
  const ultima = leerUltimaActividad();
  if (ultima == null) return;

  const transcurrido = Date.now() - ultima;
  const restante = SESION_INACTIVIDAD_MAX_MS - transcurrido;

  if (restante <= 0) {
    cerrarModalIdle();
    _avisoMostrado = false;
    return;
  }

  if (restante <= AVISO_ANTES_MS) {
    if (!_avisoMostrado) {
      _avisoMostrado = true;
      abrirModalIdle();
    }
  } else {
    _avisoMostrado = false;
    cerrarModalIdle();
  }
}

function initGnSessionIdleWarning() {
  ensureIdleModal();
  setInterval(revisarInactividad, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revisarInactividad();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGnSessionIdleWarning, { once: true });
  } else initGnSessionIdleWarning();
}
