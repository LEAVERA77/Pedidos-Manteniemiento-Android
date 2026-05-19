/**
 * Herramienta de cambio de tenant: solo rol técnico (soporte GestorNova).
 * Admin: #mt abre/cierra panel de pedidos, no wizard de tenant.
 * Login sin sesión: sin marca de tenant ajena (caché localStorage).
 * made by leavera77
 */

/** @param {() => string} rolApp */
export function esRolTecnicoSoporteGn(rolApp) {
  const r = String(typeof rolApp === 'function' ? rolApp() : rolApp || '').toLowerCase().trim();
  return r === 'tecnico' || r === 'técnico';
}

/**
 * @param {{
 *   rolApp: () => string,
 *   esAdmin: () => boolean,
 *   togglePanel: () => void,
 *   abrirWizardTenant: () => void | Promise<void>,
 * }} deps
 */
export async function abrirHerramientaTenantSegunRol(deps) {
  const { rolApp, esAdmin, togglePanel, abrirWizardTenant } = deps;
  if (esRolTecnicoSoporteGn(rolApp)) {
    if (typeof abrirWizardTenant === 'function') await abrirWizardTenant();
    return;
  }
  if (typeof togglePanel === 'function') togglePanel();
  if (esAdmin?.() && typeof window.toast === 'function') {
    window.toast(
      'El cambio de tenant operativo es solo para usuarios técnico de soporte (clave GESTORNOVA_TECHNICIAN_TENANT_KEY).',
      'info',
    );
  }
}

/** Oculta el botón magic del onboarding (#gw) que abría el wizard de tenant sin rol. */
export function ocultarAsistenteMagicOnboarding() {
  try {
    document.querySelectorAll('#gw .gn-btn-asistente-tl').forEach((el) => {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    });
  } catch (_) {}
}

/**
 * Sin sesión JWT: no aplicar logo/nombre de otro tenant desde localStorage en login.
 * @param {{ sesionCompleta: () => boolean, pintarGenerica: () => void, hydrateOriginal: () => void }} o
 */
export function hydrateBrandingLoginSinTenantAjeno(o) {
  if (o.sesionCompleta()) {
    o.hydrateOriginal();
    return;
  }
  try {
    if (typeof o.pintarGenerica === 'function') o.pintarGenerica();
  } catch (_) {}
}

import { fetchAuthLoginApi } from './auth-login-api-body.js';

/**
 * @param {{ apiUrl: (p: string) => string }} ctx
 */
export async function loginApiJwtConMustChange(ctx, email, password) {
  const em = String(email || '').trim();
  const pw = String(password || '');
  if (!em || !pw) return null;
  try {
    const { resp, data } = await fetchAuthLoginApi(em, pw, ctx.apiUrl, fetch);
    if (resp.status === 403 && data?.code === 'must_change_password') {
      return { must_change_password: true, user_id: data.user_id, user: data };
    }
    if (!resp.ok || !data?.token) return null;
    return data;
  } catch (e) {
    if (e && e.name === 'AbortError') console.warn('[login] API JWT timeout');
    return null;
  }
}

/** @param {{ rolApp: () => string }} deps */
export function actualizarBotonMtSegunRol(deps) {
  const mtBtn = document.getElementById('mt');
  if (!mtBtn) return;
  if (esRolTecnicoSoporteGn(deps.rolApp)) {
    mtBtn.innerHTML = '<i class="fas fa-list"></i>';
    mtBtn.title = 'Cambiar tenant operativo (técnico soporte — clave del servidor)';
    return;
  }
  mtBtn.innerHTML = '<i class="fas fa-list"></i>';
  mtBtn.title = 'Panel de pedidos';
}

export function initGnTenantSoloTecnicoUI(deps) {
  ocultarAsistenteMagicOnboarding();
  window.__gnAbrirHerramientaTenantSegunRol = () => abrirHerramientaTenantSegunRol(deps);
}
