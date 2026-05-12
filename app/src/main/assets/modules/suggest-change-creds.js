/**
 * Sugiere cambio de usuario/contraseña si se inició sesión con credenciales por defecto (admin/admin).
 * El flag default_creds_changed se persiste en el servidor (clientes.configuracion) desde PATCH /me
 * y también al descartar. No depende de localStorage.
 * made by leavera77
 */

let _shown = false;

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
      <span style="font-weight:700;font-size:.95rem">Cambiar credenciales</span>
    </div>
    <div style="padding:1rem 1.1rem;font-size:.84rem;color:#1e293b;line-height:1.55">
      <p style="margin:0 0 .65rem">Estás usando el usuario y contraseña por defecto (<strong>admin / admin</strong>). Por seguridad, te recomendamos cambiarlos ahora.</p>
      <div style="display:flex;flex-direction:column;gap:.45rem">
        <div><label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:.15rem">Nuevo usuario</label>
          <input id="gn-creds-new-user" type="text" placeholder="Ej. juan.perez" style="width:100%;padding:.4rem .55rem;border:1px solid #d1d5db;border-radius:.35rem;font-size:.82rem" autocomplete="username"></div>
        <div><label style="font-size:.78rem;font-weight:600;display:block;margin-bottom:.15rem">Nueva contraseña</label>
          <input id="gn-creds-new-pass" type="password" placeholder="Mínimo 4 caracteres" style="width:100%;padding:.4rem .55rem;border:1px solid #d1d5db;border-radius:.35rem;font-size:.82rem" autocomplete="new-password"></div>
        <div id="gn-creds-error" style="font-size:.76rem;color:#dc2626;display:none"></div>
      </div>
    </div>
    <div style="padding:.65rem 1.1rem;display:flex;justify-content:flex-end;gap:.5rem;border-top:1px solid #e5e7eb">
      <button type="button" id="gn-creds-later" style="background:transparent;border:1px solid #d1d5db;border-radius:.35rem;padding:.4rem .85rem;font-size:.8rem;cursor:pointer;color:#475569">Más tarde</button>
      <button type="button" id="gn-creds-save" style="background:#f59e0b;color:#fff;border:none;border-radius:.35rem;padding:.4rem .85rem;font-size:.8rem;font-weight:600;cursor:pointer">Guardar</button>
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
  const err = document.getElementById('gn-creds-error');
  if (!user && !pass) {
    if (err) { err.textContent = 'Completá al menos un campo.'; err.style.display = 'block'; }
    return;
  }
  if (pass && pass.length < 4) {
    if (err) { err.textContent = 'La contraseña debe tener al menos 4 caracteres.'; err.style.display = 'block'; }
    return;
  }

  const token = _token();
  if (!token) return;

  try {
    const body = { password_actual: 'admin' };
    if (user) body.usuario = user;
    if (pass) body.password_nueva = pass;

    const r = await fetch(_apiUrl('/api/auth/me'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) {
      if (err) { err.textContent = d.error || 'Error al guardar.'; err.style.display = 'block'; }
      return;
    }
    document.getElementById('gn-creds-suggest-overlay')?.remove();
    const nuevoUser = user || 'admin';
    if (typeof window.toast === 'function') {
      window.toast(`Credenciales actualizadas. Ingresá con: ${nuevoUser}`, 'success');
    }
    setTimeout(() => { try { window.location.reload(); } catch (_) {} }, 2200);
  } catch (e) {
    if (err) { err.textContent = 'Error de conexión.'; err.style.display = 'block'; }
  }
}

async function dismiss() {
  await _marcarEnServidor();
  document.getElementById('gn-creds-suggest-overlay')?.remove();
}

if (typeof window !== 'undefined') {
  window._gnCheckDefaultCreds = checkAndSuggestCredentialsChange;
}

export function checkAndSuggestCredentialsChange(loginResponse) {
  if (_shown) return;
  if (!loginResponse?.is_default_credentials) return;

  _shown = true;
  setTimeout(() => {
    const modal = buildModal();
    document.body.appendChild(modal);
    document.getElementById('gn-creds-save')?.addEventListener('click', guardarCreds);
    document.getElementById('gn-creds-later')?.addEventListener('click', dismiss);
    document.getElementById('gn-creds-new-user')?.focus();
  }, 1500);
}
