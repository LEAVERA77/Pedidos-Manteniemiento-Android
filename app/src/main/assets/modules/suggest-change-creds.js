/**
 * Tras login: credenciales por defecto (admin/admin sin marcar en servidor) obligan a definir nueva clave
 * (misma política mínima que el resto del panel). `must_change_password` lo cubre el modal nativo de la app.
 * El flag default_creds_changed se persiste vía PATCH /me (servidor actualiza clientes.configuración).
 * made by leavera77
 */

import { validarParPasswordNuevoConfirmacionGestornova } from './password-policy-gestornova.js';

let _shown = false;
/** @type {string} */
let _passwordActualLogin = '';

function buildModal() {
  const overlay = document.createElement('div');
  overlay.id = 'gn-creds-suggest-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483644;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;animation:fadeIn .25s';

  const card = document.createElement('div');
  card.style.cssText =
    'background:#fff;border-radius:.75rem;max-width:420px;width:92%;box-shadow:0 12px 40px rgba(0,0,0,.22);overflow:hidden';

  card.innerHTML = `
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:.85rem 1.1rem;display:flex;align-items:center;gap:.5rem">
      <i class="fas fa-shield-alt" style="font-size:1.2rem"></i>
      <span style="font-weight:700;font-size:.95rem">Cambio de contraseña obligatorio</span>
    </div>
    <div style="padding:1rem 1.1rem;font-size:.84rem;color:#1e293b;line-height:1.55">
      <p style="margin:0 0 .65rem">Es el <strong>primer acceso</strong> con la contraseña inicial de este tenant. Por seguridad, definí una contraseña nueva antes de continuar (mismas reglas que en Admin → Contraseña).</p>
      <div style="display:flex;flex-direction:column;gap:.45rem">
        <div><label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:.15rem">Nuevo usuario (opcional)</label>
          <input id="gn-creds-new-user" type="text" placeholder="Dejar vacío para mantener el actual" style="width:100%;padding:.4rem .55rem;border:1px solid #d1d5db;border-radius:.35rem;font-size:.82rem" autocomplete="username"></div>
        <div><label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:.15rem">Nueva contraseña</label>
          <input id="gn-creds-new-pass" type="password" placeholder="Mínimo 4 caracteres" style="width:100%;padding:.4rem .55rem;border:1px solid #d1d5db;border-radius:.35rem;font-size:.82rem" autocomplete="new-password"></div>
        <div><label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:.15rem">Repetir contraseña</label>
          <input id="gn-creds-new-pass2" type="password" placeholder="Igual que arriba" style="width:100%;padding:.4rem .55rem;border:1px solid #d1d5db;border-radius:.35rem;font-size:.82rem" autocomplete="new-password"></div>
        <div id="gn-creds-error" style="font-size:.76rem;color:#dc2626;display:none"></div>
      </div>
    </div>
    <div style="padding:.65rem 1.1rem;display:flex;justify-content:flex-end;gap:.5rem;border-top:1px solid #e5e7eb">
      <button type="button" id="gn-creds-save" style="background:#f59e0b;color:#fff;border:none;border-radius:.35rem;padding:.4rem .85rem;font-size:.8rem;font-weight:600;cursor:pointer">Guardar y continuar</button>
    </div>`;

  overlay.appendChild(card);
  return overlay;
}

function _apiUrl(path) {
  return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}
function _token() {
  return typeof window.getApiToken === 'function' ? window.getApiToken() : null;
}

async function _marcarEnServidor() {
  try {
    const tok = _token();
    if (!tok) return;
    await fetch(_apiUrl('/api/clientes/mi-configuracion'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ configuracion: { default_creds_changed: true } }),
    });
  } catch (_) {}
}

async function guardarCreds() {
  const user = (document.getElementById('gn-creds-new-user')?.value || '').trim();
  const pass = (document.getElementById('gn-creds-new-pass')?.value || '').trim();
  const pass2 = (document.getElementById('gn-creds-new-pass2')?.value || '').trim();
  const err = document.getElementById('gn-creds-error');
  const v = validarParPasswordNuevoConfirmacionGestornova(pass, pass2);
  if (!v.ok) {
    if (err) {
      err.textContent = v.error;
      err.style.display = 'block';
    }
    return;
  }
  if (v.skipped) {
    if (err) {
      err.textContent = 'Debés completar la nueva contraseña y la confirmación.';
      err.style.display = 'block';
    }
    return;
  }
  const nueva = v.nueva;
  if (nueva === _passwordActualLogin) {
    if (err) {
      err.textContent = 'La nueva contraseña debe ser distinta de la actual.';
      err.style.display = 'block';
    }
    return;
  }

  const token = _token();
  if (!token) return;

  try {
    const body = { password_actual: _passwordActualLogin };
    if (user) body.usuario = user;
    body.password_nueva = nueva;

    const r = await fetch(_apiUrl('/api/auth/me'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) {
      if (err) {
        err.textContent = d.error || 'Error al guardar.';
        err.style.display = 'block';
      }
      return;
    }
    await _marcarEnServidor();
    document.getElementById('gn-creds-suggest-overlay')?.remove();
    const nuevoUser = user || (d.user && d.user.email) || 'admin';
    if (typeof window.toast === 'function') {
      window.toast(`Credenciales actualizadas. Ingresá con: ${nuevoUser}`, 'success');
    }
    setTimeout(() => {
      try {
        window.location.reload();
      } catch (_) {}
    }, 2200);
  } catch (e) {
    if (err) {
      err.textContent = 'Error de conexión.';
      err.style.display = 'block';
    }
  }
}

if (typeof window !== 'undefined') {
  window._gnCheckDefaultCreds = checkAndSuggestCredentialsChange;
}

/**
 * @param {object} loginResponse — JSON de POST /api/auth/login
 * @param {string} [passwordActual] — contraseña usada en el formulario (requerida para PATCH /me)
 */
export function checkAndSuggestCredentialsChange(loginResponse, passwordActual = '') {
  if (_shown) return;
  if (loginResponse?.must_change_password) return;
  if (!loginResponse?.is_default_credentials) return;

  const pa = String(passwordActual || '').trim();
  if (!pa) return;

  _shown = true;
  _passwordActualLogin = pa;
  setTimeout(() => {
    const modal = buildModal();
    document.body.appendChild(modal);
    document.getElementById('gn-creds-save')?.addEventListener('click', guardarCreds);
    document.getElementById('gn-creds-new-pass')?.focus();
  }, 1500);
}
