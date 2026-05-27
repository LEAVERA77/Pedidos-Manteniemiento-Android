/**
 * Pie de confianza colapsable: términos, privacidad, estado (sin agrandar app.js).
 * made by leavera77
 */

import { abrirTerminosGestorNova, abrirPrivacidadGestorNova } from './gn-terminos-privacidad.js';

const GN_WEB_VERSION_LABEL = '2.0';
const FOOTER_PANEL_ID = 'gn-trust-footer-panel';
const FOOTER_LOGIN_ID = 'gn-trust-footer-login';
const LS_COLLAPSED = 'pmg_gn_trust_footer_collapsed';

function leerColapsadoPorDefecto() {
    try {
        const v = localStorage.getItem(LS_COLLAPSED);
        if (v === '0') return false;
        if (v === '1') return true;
    } catch (_) {}
    return true;
}

function guardarColapsado(colapsado) {
    try {
        localStorage.setItem(LS_COLLAPSED, colapsado ? '1' : '0');
    } catch (_) {}
}

function staticPageHref(fileName) {
    try {
        const path = window.location.pathname || '/';
        const base = path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '/');
        return `${base}${fileName}`.replace(/\/+/g, '/').replace(/^(https?:\/[^/]+)\/\//, '$1/');
    } catch (_) {
        return fileName;
    }
}

function footerLinksHtml() {
    const status = staticPageHref('status.html');
    const seguridad = staticPageHref('seguridad.html');
    return `
<div class="gn-trust-footer-links" role="navigation" aria-label="Información legal y estado">
  <button type="button" class="gn-trust-pill" data-gn-open-terms><i class="fas fa-file-contract" aria-hidden="true"></i> Términos</button>
  <button type="button" class="gn-trust-pill" data-gn-open-privacy><i class="fas fa-user-shield" aria-hidden="true"></i> Privacidad</button>
  <a class="gn-trust-pill gn-trust-pill--link" href="${status}"><i class="fas fa-heartbeat" aria-hidden="true"></i> Estado</a>
  <a class="gn-trust-pill gn-trust-pill--link" href="${seguridad}"><i class="fas fa-shield-alt" aria-hidden="true"></i> Seguridad</a>
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

function setFooterExpanded(wrap, expanded) {
    const body = wrap.querySelector('.gn-trust-footer');
    const toggle = wrap.querySelector('.gn-trust-footer-toggle');
    if (!body || !toggle) return;
    body.classList.toggle('gn-trust-footer--hidden', !expanded);
    wrap.classList.toggle('gn-trust-footer-wrap--open', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    guardarColapsado(!expanded);
}

function buildCollapsibleFooter({ id, extraClass, variant }) {
    const wrap = document.createElement('div');
    wrap.className = `gn-trust-footer-wrap gn-trust-footer-wrap--${variant}`;
    wrap.id = `${id}-wrap`;

    const expanded = !leerColapsadoPorDefecto();

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'gn-trust-footer-toggle';
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.innerHTML =
        '<i class="fas fa-circle-info" aria-hidden="true"></i> ' +
        '<span class="gn-trust-footer-toggle-txt">Legal y estado del servicio</span>' +
        '<i class="fas fa-chevron-down gn-trust-footer-chevron" aria-hidden="true"></i>';

    const body = document.createElement('div');
    body.className = `gn-trust-footer ${extraClass || ''}`.trim();
    body.id = id;
    if (!expanded) body.classList.add('gn-trust-footer--hidden');

    const versionLine =
        variant === 'panel'
            ? `<span class="gn-trust-footer-version">GestorNova · v${GN_WEB_VERSION_LABEL}</span>`
            : '';
    body.innerHTML = versionLine + footerLinksHtml();
    wireFooterLinks(body);

    toggle.addEventListener('click', () => {
        const willExpand = body.classList.contains('gn-trust-footer--hidden');
        setFooterExpanded(wrap, willExpand);
    });

    if (expanded) wrap.classList.add('gn-trust-footer-wrap--open');

    wrap.append(toggle, body);
    return wrap;
}

function ensureLoginFooter() {
    if (document.getElementById(`${FOOTER_LOGIN_ID}-wrap`)) return;
    const ver = document.getElementById('app-version');
    const extra = document.querySelector('.gn-login-extra-links');
    const wrap = buildCollapsibleFooter({
        id: FOOTER_LOGIN_ID,
        extraClass: 'gn-trust-footer--login',
        variant: 'login',
    });
    if (extra) extra.before(wrap);
    else if (ver) ver.insertAdjacentElement('afterend', wrap);
    else document.querySelector('#ls .lc')?.appendChild(wrap);
}

function ensurePanelFooter() {
    const ms = document.getElementById('ms');
    if (!ms || document.getElementById(`${FOOTER_PANEL_ID}-wrap`)) return;
    const wrap = buildCollapsibleFooter({
        id: FOOTER_PANEL_ID,
        extraClass: 'gn-trust-footer--panel',
        variant: 'panel',
    });
    ms.appendChild(wrap);
}

function syncPanelFooterVisibility() {
    const ms = document.getElementById('ms');
    const foot = document.getElementById(`${FOOTER_PANEL_ID}-wrap`);
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
