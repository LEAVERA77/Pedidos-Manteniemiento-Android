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

function pillInner(iconClass, label, compact) {
    if (compact) {
        return `<span class="gn-trust-pill-lbl" aria-hidden="true"><i class="${iconClass}"></i></span>`;
    }
    return `<i class="${iconClass}" aria-hidden="true"></i> ${label}`;
}

function footerLinksHtml({ compact = false } = {}) {
    const status = staticPageHref('status.html');
    const seguridad = staticPageHref('seguridad.html');
    return `
<div class="gn-trust-footer-links${compact ? ' gn-trust-footer-links--compact' : ''}" role="navigation" aria-label="Información legal y estado">
  <span class="gn-trust-footer-version gn-trust-footer-version--inline" title="GestorNova">v${GN_WEB_VERSION_LABEL}</span>
  <button type="button" class="gn-trust-pill" data-gn-open-terms title="Términos de uso">${pillInner('fas fa-file-contract', 'Términos', compact)}</button>
  <button type="button" class="gn-trust-pill" data-gn-open-privacy title="Privacidad">${pillInner('fas fa-user-shield', 'Privacidad', compact)}</button>
  <a class="gn-trust-pill gn-trust-pill--link" href="${status}" title="Estado del servicio">${pillInner('fas fa-heartbeat', 'Estado', compact)}</a>
  <a class="gn-trust-pill gn-trust-pill--link" href="${seguridad}" title="Seguridad">${pillInner('fas fa-shield-alt', 'Seguridad', compact)}</a>
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
    const toggleLabel =
        variant === 'panel' ? 'Legal' : 'Legal y estado del servicio';
    toggle.innerHTML =
        '<i class="fas fa-circle-info" aria-hidden="true"></i> ' +
        `<span class="gn-trust-footer-toggle-txt">${toggleLabel}</span>` +
        '<i class="fas fa-chevron-down gn-trust-footer-chevron" aria-hidden="true"></i>';
    if (variant === 'panel') {
        toggle.title = 'Mostrar u ocultar enlaces legales y estado';
    }

    const body = document.createElement('div');
    body.className = `gn-trust-footer ${extraClass || ''}`.trim();
    body.id = id;
    if (!expanded) body.classList.add('gn-trust-footer--hidden');

    body.innerHTML = footerLinksHtml({ compact: variant === 'panel' });
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
