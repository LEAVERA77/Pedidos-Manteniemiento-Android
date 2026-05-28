/**
 * Toggle de alto contraste en pantalla de login (#ls). Persiste en localStorage.
 * WebView: clase en html + data-gn-alto-contraste en #ls (más fiable que solo html).
 * made by leavera77
 */

const LS_KEY = 'pmg_gn_login_alto_contraste';
const CLASS_HC = 'gn-login-alto-contraste';
const CLASS_LS_ACTIVE = 'gn-login-alto-contraste-active';

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
    if (!lc || document.getElementById('gn-login-alto-contraste-btn')) return;

    let host = document.getElementById('gn-login-accesibilidad');
    if (!host) {
        host = document.createElement('div');
        host.id = 'gn-login-accesibilidad';
        host.className = 'gn-login-accesibilidad';
        const extra = lc.querySelector('.gn-login-extra-links');
        if (extra) extra.insertAdjacentElement('afterend', host);
        else lc.appendChild(host);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'gn-login-alto-contraste-btn';
    btn.className = 'gn-login-alto-contraste-btn';
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML =
        '<i class="fas fa-circle-half-stroke" aria-hidden="true"></i> Alto contraste';
    btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const next = !(
            document.documentElement.classList.contains(CLASS_HC) ||
            document.getElementById('ls')?.dataset.gnAltoContraste === '1'
        );
        guardarAltoContraste(next);
        aplicarAltoContraste(next);
    });
    host.appendChild(btn);
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
