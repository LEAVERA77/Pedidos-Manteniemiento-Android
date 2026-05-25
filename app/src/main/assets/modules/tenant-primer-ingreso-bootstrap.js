/**
 * Primer ingreso del admin bootstrap (must_change_password): usuario, nombre visible y contraseña.
 * Tras guardar → cierre de sesión y login con credenciales nuevas (una vez).
 * made by leavera77
 */

import { validarParPasswordNuevoConfirmacionGestornova } from './password-policy-gestornova.js';
import { setAuthLoginTenantHint } from './auth-login-api-body.js';
import { eliminarUsuarioOfflinePorEmail } from '../offline.js';

const RELOGIN_MSG_KEY = 'gn_tenant_primer_relogin_msg';

function apiUrl(path) {
  return typeof window !== 'undefined' && typeof window.apiUrl === 'function' ? window.apiUrl(path) : String(path || '');
}

function toast(msg, type) {
  if (typeof window.toast === 'function') window.toast(msg, type);
}

function _esUsuarioLoginValido(s) {
  const t = String(s || '').trim();
  return t.length >= 2 && t.length <= 120 && !/\s/.test(t);
}

/** @param {object} [pend] */
export function abrirModalPrimerIngresoBootstrap(pend) {
  const modal = document.getElementById('modal-forzar-cambio-pw');
  if (!modal) return;
  const wrapUser = document.getElementById('forzar-cambio-pw-wrap-usuario');
  const wrapNom = document.getElementById('forzar-cambio-pw-wrap-nombre');
  const inUser = document.getElementById('forzar-cambio-pw-usuario');
  const inNom = document.getElementById('forzar-cambio-pw-nombre');
  const intro = document.getElementById('forzar-cambio-pw-intro');
  const esPrimera = !!(pend?.primeraContrasenaApi || pend?.u?.must_change_password);
  if (wrapUser) wrapUser.style.display = esPrimera ? '' : 'none';
  if (wrapNom) wrapNom.style.display = esPrimera ? '' : 'none';
  if (inUser && pend?.u?.email) inUser.value = String(pend.u.email).trim();
  if (inNom && pend?.u?.nombre) inNom.value = String(pend.u.nombre).trim();
  if (intro && esPrimera) {
    intro.textContent =
      'Es el primer acceso del administrador de este tenant. Definí tu usuario de login, tu nombre visible y una contraseña nueva (mínimo 4 caracteres). Después vas a volver a iniciar sesión una sola vez con esos datos.';
  } else if (intro) {
    intro.textContent =
      'Tu cuenta tiene una contraseña que debe cambiarse antes de continuar. Elegí una contraseña nueva distinta de la actual (mínimo 4 caracteres).';
  }
  modal.classList.add('active');
  (esPrimera ? inUser : document.getElementById('forzar-cambio-pw-nueva'))?.focus();
}

export function cerrarSesionTrasPrimerIngreso({ usuario, tenantId } = {}) {
  try {
    if (tenantId && Number.isFinite(Number(tenantId))) {
      sessionStorage.setItem('pmg_login_tenant_hint', String(tenantId));
    }
  } catch (_) {}
  try {
    sessionStorage.setItem(
      RELOGIN_MSG_KEY,
      'Credenciales actualizadas. Ingresá con el usuario y la contraseña que acabás de definir.'
    );
  } catch (_) {}
  if (typeof window.__gnCerrarSesionTrasPrimerIngreso === 'function') {
    window.__gnCerrarSesionTrasPrimerIngreso(usuario);
    return;
  }
  try {
    localStorage.removeItem('pmg');
    localStorage.removeItem('pmg_api_token');
  } catch (_) {}
  const emEl = document.getElementById('em');
  if (emEl && usuario) emEl.value = String(usuario).trim();
  document.getElementById('ls')?.classList.add('active');
  document.getElementById('ms')?.classList.remove('active');
}

export function aplicarMensajeReloginPendienteEnLogin() {
  try {
    const msg = sessionStorage.getItem(RELOGIN_MSG_KEY);
    if (!msg) return;
    sessionStorage.removeItem(RELOGIN_MSG_KEY);
    const le = document.getElementById('le');
    if (le) le.textContent = msg;
    toast(msg, 'info');
  } catch (_) {}
}

export async function confirmarCambioPasswordObligatorioAndroid() {
  const pend = window._pendingAndroidPasswordChange;
  const msg = document.getElementById('forzar-cambio-pw-msg');
  if (!pend || !pend.u || !pend.passwordActual) {
    if (msg) msg.textContent = 'Sesión inválida. Volvé a iniciar sesión.';
    return;
  }
  const n1 = document.getElementById('forzar-cambio-pw-nueva')?.value || '';
  const n2 = document.getElementById('forzar-cambio-pw-nueva2')?.value || '';
  const v = validarParPasswordNuevoConfirmacionGestornova(n1, n2);
  if (!v.ok) {
    if (msg) msg.textContent = v.error;
    return;
  }
  if (v.skipped) {
    if (msg) msg.textContent = 'Completá ambos campos de contraseña.';
    return;
  }
  const n1t = v.nueva;
  if (n1t === pend.passwordActual) {
    if (msg) msg.textContent = 'La nueva contraseña debe ser distinta de la provisional.';
    return;
  }

  const esPrimeraApi = !!pend.primeraContrasenaApi;
  const nuevoUsuario = String(document.getElementById('forzar-cambio-pw-usuario')?.value || '').trim();
  const nombreVisible = String(document.getElementById('forzar-cambio-pw-nombre')?.value || '').trim();

  if (esPrimeraApi) {
    if (!_esUsuarioLoginValido(nuevoUsuario)) {
      if (msg) msg.textContent = 'Indicá un usuario de login válido (2–120 caracteres, sin espacios).';
      return;
    }
    if (nombreVisible.length < 2) {
      if (msg) msg.textContent = 'Indicá el nombre visible del administrador (mínimo 2 caracteres).';
      return;
    }
  }

  try {
    if (esPrimeraApi) {
      const resp = await fetch(apiUrl('/api/auth/cambiar-primera-contrasena'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: pend.u.id,
          password_actual: pend.passwordActual,
          nueva_password: n1t,
          confirmar_password: n1t,
          nuevo_usuario: nuevoUsuario,
          nombre: nombreVisible,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (msg) msg.textContent = data.error || data.detail || 'No se pudo actualizar las credenciales.';
        return;
      }
      const loginUser = String(data.user?.email || nuevoUsuario).trim().toLowerCase();
      if (!loginUser) {
        if (msg) msg.textContent = 'El servidor no devolvió el usuario de login. Reintentá o contactá soporte.';
        return;
      }
      document.getElementById('modal-forzar-cambio-pw')?.classList.remove('active');
      ['forzar-cambio-pw-nueva', 'forzar-cambio-pw-nueva2', 'forzar-cambio-pw-usuario', 'forzar-cambio-pw-nombre'].forEach(
        (id) => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        }
      );
      if (msg) msg.textContent = '';
      delete window._pendingAndroidPasswordChange;
      try {
        eliminarUsuarioOfflinePorEmail(pend.u?.email);
        eliminarUsuarioOfflinePorEmail(nuevoUsuario);
        eliminarUsuarioOfflinePorEmail(loginUser);
      } catch (_) {}
      const tid = Number(data.user?.tenant_id ?? pend.u?.tenant_id);
      if (Number.isFinite(tid) && tid > 0) setAuthLoginTenantHint(tid);
      try {
        sessionStorage.setItem(
          RELOGIN_MSG_KEY,
          `Credenciales guardadas. Ingresá con usuario «${loginUser}» y la contraseña que acabás de definir (texto plano, no un código $2a$).`
        );
      } catch (_) {}
      cerrarSesionTrasPrimerIngreso({ usuario: loginUser, tenantId: tid });
      toast(`Listo. Ingresá con usuario «${loginUser}» y tu contraseña nueva.`, 'success');
      return;
    }

    const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : '';
    const base = typeof window.getApiBaseUrl === 'function' ? window.getApiBaseUrl() : '';
    if (tok && base) {
      const resp = await fetch(apiUrl('/api/auth/me'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          usuario: pend.u.email,
          nombre: pend.u.nombre,
          password_actual: pend.passwordActual,
          password_nueva: n1t,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (msg) msg.textContent = data.error || data.detail || 'No se pudo actualizar la contraseña.';
        return;
      }
    } else if (typeof window.sqlSimple === 'function' && typeof window.esc === 'function') {
      const r = await window.sqlSimple(
        `UPDATE usuarios SET password_hash = ${window.esc(n1t)}, must_change_password = FALSE, reset_token = NULL, reset_expiry = NULL
         WHERE id = ${window.esc(pend.u.id)} AND password_hash = ${window.esc(pend.passwordActual)}
         RETURNING id`
      );
      if (!(r.rows || []).length) {
        if (msg) msg.textContent = 'No se pudo actualizar (revisá la clave actual).';
        return;
      }
    } else {
      if (msg) msg.textContent = 'Sin conexión con la API.';
      return;
    }

    document.getElementById('modal-forzar-cambio-pw')?.classList.remove('active');
    ['forzar-cambio-pw-nueva', 'forzar-cambio-pw-nueva2'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (msg) msg.textContent = '';
    const u = { ...pend.u, must_change_password: false };
    delete window._pendingAndroidPasswordChange;
    if (typeof window.guardarUsuarioOffline === 'function') window.guardarUsuarioOffline(u, n1t);
    if (typeof window.loginApiJwt === 'function') await window.loginApiJwt(u.email, n1t);
    if (typeof window.entrarConUsuario === 'function') window.entrarConUsuario(u, false);
    toast('Contraseña actualizada. Bienvenido ' + u.nombre, 'success');
  } catch (e) {
    if (typeof window.logErrorWeb === 'function') window.logErrorWeb('cambio-pw-bootstrap', e);
    if (msg) {
      msg.textContent =
        typeof window.mensajeErrorUsuario === 'function' ? window.mensajeErrorUsuario(e) : String(e?.message || e);
    }
  }
}

export function initTenantPrimerIngresoBootstrap() {
  window.confirmarCambioPasswordObligatorioAndroid = confirmarCambioPasswordObligatorioAndroid;
  window.__gnAbrirModalPrimerIngresoBootstrap = abrirModalPrimerIngresoBootstrap;
  aplicarMensajeReloginPendienteEnLogin();
}
