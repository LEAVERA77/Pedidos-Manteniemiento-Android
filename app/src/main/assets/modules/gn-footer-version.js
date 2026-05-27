/**
 * Pie de confianza: versión web, términos, privacidad, estado del servicio.
 * made by leavera77
 */

import { abrirTerminosGestorNova, abrirPrivacidadGestorNova } from './gn-terminos-privacidad.js';

const GN_WEB_VERSION_LABEL = '2.0';

const FOOTER_PANEL_ID = 'gn-trust-footer-panel';

/** Ruta relativa válida en Pages (/Pedidos-MG/) y en WebView file:// */
function statusPageHref() {
    try {
        const path = window.location.pathname || '/';
        const base = path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '/');
        return `${base}status.html`.replace(/\/+/g, '/').replace(/^(https?:\/[^/]+)\/\//, '$1/');
    } catch (_) {
        return 'status.html';
    }
}

function footerLinksHtml() {
    const status = statusPageHref();
    return `
<div class="gn-trust-footer-links" role="navigation" aria-label="Información legal y estado">
  <button type="button" class="gn-trust-pill" data-gn-open-terms><i class="fas fa-file-contract" aria-hidden="true"></i> Términos</button>
  <button type="button" class="gn-trust-pill" data-gn-open-privacy><i class="fas fa-user-shield" aria-hidden="true"></i> Privacidad</button>
  <a class="gn-trust-pill gn-trust-pill--link" href="${status}"><i class="fas fa-heartbeat" aria-hidden="true"></i> Estado del servicio</a>
</div>`;
}

function wireFooterLinks(root) {
    if (!root) return;
    root.querySelector('[data-gn-open-terms]')?.addEventListener('click', (e) => {
        e.preventDefault();
        abrirTerminosGestorNova();
    });
    root.querySelector('[data-gn-open-privacy]')?.addEventListener('click', (e) => {
        e.preventDefault();
        abrirPrivacidadGestorNova();
    });
}

function buildFooterBlock(extraClass) {
    const div = document.createElement('div');
    div.className = `gn-trust-footer ${extraClass || ''}`.trim();
    div.innerHTML = `<span class="gn-trust-footer-version">GestorNova · versión web ${GN_WEB_VERSION_LABEL}</span>${footerLinksHtml()}`;
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
