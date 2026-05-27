/**
 * Pie de confianza: versión web, términos, privacidad, estado del servicio.
 * No reemplaza #app-version en login (android-app-version-ui.js).
 * made by leavera77
 */

import { abrirTerminosGestorNova, abrirPrivacidadGestorNova } from './gn-terminos-privacidad.js';

/** Alineado con GN_VERSION_WEB en app.js */
const GN_WEB_VERSION_LABEL = '2.0';

const FOOTER_PANEL_ID = 'gn-trust-footer-panel';

function statusPageHref() {
  try {
    const base = new URL('.', window.location.href);
    return new URL('status.html', base).href;
  } catch (_) {
    return 'status.html';
  }
}

function footerLinksHtml() {
  const status = statusPageHref();
  return `
<div class="gn-trust-footer-links">
  <button type="button" data-gn-open-terms>Términos</button>
  <button type="button" data-gn-open-privacy>Privacidad</button>
  <a href="${status}" target="_blank" rel="noopener noreferrer">Estado del servicio</a>
</div>`;
}

function wireFooterLinks(root) {
  if (!root) return;
  root.querySelector('[data-gn-open-terms]')?.addEventListener('click', () => abrirTerminosGestorNova());
  root.querySelector('[data-gn-open-privacy]')?.addEventListener('click', () => abrirPrivacidadGestorNova());
}

function buildFooterBlock(extraClass) {
  const div = document.createElement('div');
  div.className = `gn-trust-footer ${extraClass || ''}`.trim();
  div.innerHTML = `<span>GestorNova · versión web ${GN_WEB_VERSION_LABEL}</span>${footerLinksHtml()}`;
  wireFooterLinks(div);
  return div;
}

function ensureLoginFooter() {
  const ver = document.getElementById('app-version');
  if (!ver || document.getElementById('gn-trust-footer-login')) return;
  const block = buildFooterBlock('');
  block.id = 'gn-trust-footer-login';
  ver.insertAdjacentElement('afterend', block);
}

function ensurePanelFooter() {
  const ms = document.getElementById('ms');
  if (!ms || document.getElementById(FOOTER_PANEL_ID)) return;
  const block = buildFooterBlock('gn-trust-footer--panel');
  block.id = FOOTER_PANEL_ID;
  ms.appendChild(block);
}

function syncPanelFooterVisibility() {
  const ms = document.getElementById('ms');
  const foot = document.getElementById(FOOTER_PANEL_ID);
  if (!ms || !foot) return;
  foot.style.display = ms.classList.contains('active') ? '' : 'none';
}

function initGnFooterVersion() {
  ensureLoginFooter();
  ensurePanelFooter();
  syncPanelFooterVisibility();
  const ms = document.getElementById('ms');
  if (ms && typeof MutationObserver !== 'undefined') {
    try {
      const mo = new MutationObserver(() => syncPanelFooterVisibility());
      mo.observe(ms, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGnFooterVersion, { once: true });
  } else initGnFooterVersion();
}
