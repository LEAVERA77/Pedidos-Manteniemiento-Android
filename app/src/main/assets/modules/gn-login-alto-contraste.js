/**
 * Toggle de alto contraste en pantalla de login (#ls). Persiste en localStorage.
 * WebView: clase + data-* + hoja de estilo inyectada (más fiable que solo CSS externo).
 * made by leavera77
 */

const LS_KEY = 'pmg_gn_login_alto_contraste';
const CLASS_HC = 'gn-login-alto-contraste';
const CLASS_LS_ACTIVE = 'gn-login-alto-contraste-active';
const HC_STYLE_ID = 'gn-login-hc-runtime-style';

function leerAltoContrasteActivo() {
    try {
        return localStorage.getItem(LS_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function guardarAltoContraste(activo) {
    try {
        localStorage.setItem(LS_KEY, activo ? '1' : '0');
    } catch (_) {}
}

function inyectarHojaAltoContraste(on) {
    let el = document.getElementById(HC_STYLE_ID);
    if (!on) {
        el?.remove();
        return;
    }
    if (!el) {
        el = document.createElement('style');
        el.id = HC_STYLE_ID;
        document.head.appendChild(el);
    }
    el.textContent = `
html.gn-login-alto-contraste #ls,
#ls[data-gn-alto-contraste="1"],
#ls.gn-login-alto-contraste-active {
  background: #000000 !important;
  background-image: none !important;
}
html.gn-login-alto-contraste #ls::before,
html.gn-login-alto-contraste #ls::after,
#ls[data-gn-alto-contraste="1"]::before,
#ls[data-gn-alto-contraste="1"]::after,
#ls.gn-login-alto-contraste-active::before,
#ls.gn-login-alto-contraste-active::after {
  display: none !important;
}
html.gn-login-alto-contraste #ls .lc,
#ls[data-gn-alto-contraste="1"] .lc,
#ls.gn-login-alto-contraste-active .lc {
  background: #ffffff !important;
  border: 4px solid #000000 !important;
  box-shadow: none !important;
}
html.gn-login-alto-contraste #ls .lc h1,
html.gn-login-alto-contraste #ls .lc .sub,
html.gn-login-alto-contraste #ls .lc label,
html.gn-login-alto-contraste #ls .ig input,
html.gn-login-alto-contraste #ls .bp,
#ls[data-gn-alto-contraste="1"] .lc h1,
#ls[data-gn-alto-contraste="1"] .lc .sub,
#ls[data-gn-alto-contraste="1"] .ig input,
#ls[data-gn-alto-contraste="1"] .bp,
#ls.gn-login-alto-contraste-active .lc h1,
#ls.gn-login-alto-contraste-active .lc .sub,
#ls.gn-login-alto-contraste-active .ig input,
#ls.gn-login-alto-contraste-active .bp {
  color: #000000 !important;
  -webkit-text-fill-color: #000000 !important;
}
html.gn-login-alto-contraste #ls .ig input,
#ls[data-gn-alto-contraste="1"] .ig input,
#ls.gn-login-alto-contraste-active .ig input {
  background: #ffffff !important;
  border: 3px solid #000000 !important;
}
html.gn-login-alto-contraste #ls .bp,
#ls[data-gn-alto-contraste="1"] .bp,
#ls.gn-login-alto-contraste-active .bp {
  background: #000000 !important;
  color: #ffffff !important;
}
html.gn-login-alto-contraste #ls .dbs.ok,
#ls[data-gn-alto-contraste="1"] .dbs.ok,
#ls.gn-login-alto-contraste-active .dbs.ok {
  background: #000000 !important;
  color: #ffffff !important;
  border: 2px solid #ffffff !important;
}
html.gn-login-alto-contraste #ls .lc .gn-trust-footer-toggle,
html.gn-login-alto-contraste #ls .lc .gn-trust-pill,
#ls[data-gn-alto-contraste="1"] .lc .gn-trust-footer-toggle,
#ls[data-gn-alto-contraste="1"] .lc .gn-trust-pill,
#ls.gn-login-alto-contraste-active .lc .gn-trust-footer-toggle,
#ls.gn-login-alto-contraste-active .lc .gn-trust-pill {
  background: #ffffff !important;
  color: #000000 !important;
  border: 3px solid #000000 !important;
  -webkit-text-fill-color: #000000 !important;
}
html.gn-login-alto-contraste #ls .gn-login-alto-contraste-btn[aria-pressed="true"],
#ls[data-gn-alto-contraste="1"] .gn-login-alto-contraste-btn[aria-pressed="true"],
#ls.gn-login-alto-contraste-active .gn-login-alto-contraste-btn[aria-pressed="true"] {
  background: #000000 !important;
  color: #fef08a !important;
  border-color: #fef08a !important;
}`;
}

function aplicarAltoContraste(activo) {
    const on = !!activo;
    const root = document.documentElement;
    const body = document.body;
    const ls = document.getElementById('ls');
    if (root) root.classList.toggle(CLASS_HC, on);
    if (body) body.classList.toggle(CLASS_HC, on);
    if (ls) {
        ls.classList.toggle(CLASS_LS_ACTIVE, on);
        ls.dataset.gnAltoContraste = on ? '1' : '0';
    }
    inyectarHojaAltoContraste(on);
    const btn = document.getElementById('gn-login-alto-contraste-btn');
    if (btn) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = on
            ? 'Desactivar modo de alto contraste'
            : 'Activar modo de alto contraste (mejor lectura)';
        btn.setAttribute(
            'aria-label',
            on ? 'Desactivar alto contraste en login' : 'Activar alto contraste en login'
        );
    }
}

function montarBotonAltoContraste() {
    const lc = document.querySelector('#ls .lc');
    if (!lc) return;
    let btn = document.getElementById('gn-login-alto-contraste-btn');
    if (!btn) {
        let host = document.getElementById('gn-login-accesibilidad');
        if (!host) {
            host = document.createElement('div');
            host.id = 'gn-login-accesibilidad';
            host.className = 'gn-login-accesibilidad';
            const extra = lc.querySelector('.gn-login-extra-links');
            if (extra) extra.insertAdjacentElement('afterend', host);
            else lc.appendChild(host);
        }
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'gn-login-alto-contraste-btn';
        btn.className = 'gn-login-alto-contraste-btn';
        btn.setAttribute('aria-pressed', 'false');
        btn.innerHTML =
            '<i class="fas fa-circle-half-stroke" aria-hidden="true"></i> Alto contraste';
        host.appendChild(btn);
    }
    if (btn.dataset.gnHcBound === '1') return;
    btn.dataset.gnHcBound = '1';
    btn.addEventListener(
        'click',
        (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const next = !(
                document.documentElement.classList.contains(CLASS_HC) ||
                document.getElementById('ls')?.dataset.gnAltoContraste === '1'
            );
            guardarAltoContraste(next);
            aplicarAltoContraste(next);
        },
        { capture: true }
    );
}

function bootLoginAltoContraste() {
    montarBotonAltoContraste();
    aplicarAltoContraste(leerAltoContrasteActivo());
}

export function initGnLoginAltoContraste() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootLoginAltoContraste, { once: true });
    } else {
        bootLoginAltoContraste();
    }
    try {
        const mo = new MutationObserver(() => {
            if (document.getElementById('ls')?.classList.contains('active')) {
                montarBotonAltoContraste();
                aplicarAltoContraste(leerAltoContrasteActivo());
            }
        });
        const ls = document.getElementById('ls');
        if (ls) mo.observe(ls, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
    try {
        window.addEventListener('gestornova-app-ready', bootLoginAltoContraste);
    } catch (_) {}
}

initGnLoginAltoContraste();
