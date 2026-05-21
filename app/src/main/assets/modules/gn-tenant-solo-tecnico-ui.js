/**
 * Botón #mt (fa-list): siempre abre cambio de tenant con clave GESTORNOVA_TECHNICIAN_TENANT_KEY.
 * Login sin sesión: sin marca de tenant ajena (caché localStorage).
 * made by leavera77
 */

/** @param {() => string} rolApp */
export function esRolTecnicoSoporteGn(rolApp) {
  const r = String(typeof rolApp === 'function' ? rolApp() : rolApp || '').toLowerCase().trim();
  return r === 'tecnico' || r === 'técnico';
}

/**
 * #mt y `abrirWizardMarcaEmpresaManual`: modal de clave técnica + wizard (cualquier rol con sesión).
 * @param {{ abrirWizardTenant?: () => void | Promise<void> }} deps
 */
export async function abrirBotonMtCambioTenant(deps) {
  const open =
    typeof deps?.abrirWizardTenant === 'function'
      ? deps.abrirWizardTenant
      : typeof window !== 'undefined' && typeof window.gnAbrirWizardTenantUnificado === 'function'
        ? window.gnAbrirWizardTenantUnificado
        : null;
  if (open) {
    await open();
    return;
  }
  try {
    window.toast?.('El asistente de tenant aún no está listo. Recargá la página.', 'error');
  } catch (_) {}
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

const MT_TITLE =
  'Cambiar tenant operativo (clave técnica GESTORNOVA_TECHNICIAN_TENANT_KEY del servidor)';

/** @param {{ rolApp?: () => string }} _deps */
export function actualizarBotonMtSegunRol(_deps) {
  const mtBtn = document.getElementById('mt');
  if (!mtBtn) return;
  mtBtn.innerHTML = '<i class="fas fa-list"></i>';
  mtBtn.title = MT_TITLE;
}

/**
 * @param {{
 *   rolApp: () => string,
 *   esAdmin: () => boolean,
 *   togglePanel: () => void,
 *   abrirWizardTenant: () => void | Promise<void>,
 * }} deps
 */
export function initGnTenantSoloTecnicoUI(deps) {
  ocultarAsistenteMagicOnboarding();
  actualizarBotonMtSegunRol(deps);

  const onMt = () => abrirBotonMtCambioTenant(deps);
  window.__gnAbrirBotonMtTenant = onMt;
  window.abrirWizardMarcaEmpresaManual = onMt;
  window.__gnAbrirHerramientaTenantSegunRol = onMt;

  const mtBtn = document.getElementById('mt');
  if (mtBtn && mtBtn.dataset.gnMtClick !== '1') {
    mtBtn.dataset.gnMtClick = '1';
    mtBtn.addEventListener('click', () => {
      void onMt();
    });
  }
}
