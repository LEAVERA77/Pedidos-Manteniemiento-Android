/**
 * Toggle de alto contraste en pantalla de login (#ls). Persiste en localStorage.
 * made by leavera77
 */

const LS_KEY = 'pmg_gn_login_alto_contraste';
const CLASS_HC = 'gn-login-alto-contraste';

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
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle(CLASS_HC, !!activo);
    const btn = document.getElementById('gn-login-alto-contraste-btn');
    if (btn) {
        btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
        btn.title = activo
            ? 'Desactivar modo de alto contraste'
            : 'Activar modo de alto contraste (mejor lectura)';
    }
}

function montarBotonAltoContraste() {
    const ls = document.getElementById('ls');
    if (!ls || document.getElementById('gn-login-alto-contraste-btn')) return;

    let host = document.getElementById('gn-login-accesibilidad');
    if (!host) {
        host = document.createElement('div');
        host.id = 'gn-login-accesibilidad';
        host.className = 'gn-login-accesibilidad';
        const extra = document.querySelector('#ls .gn-login-extra-links');
        const trust = document.getElementById('gn-trust-footer-login-wrap');
        if (trust) trust.insertAdjacentElement('afterend', host);
        else if (extra) extra.insertAdjacentElement('afterend', host);
        else document.querySelector('#ls .lc')?.appendChild(host);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'gn-login-alto-contraste-btn';
    btn.className = 'gn-login-alto-contraste-btn';
    btn.innerHTML =
        '<i class="fas fa-circle-half-stroke" aria-hidden="true"></i> Alto contraste';
    btn.addEventListener('click', () => {
        const next = !document.documentElement.classList.contains(CLASS_HC);
        guardarAltoContraste(next);
        aplicarAltoContraste(next);
    });
    host.appendChild(btn);
}

export function initGnLoginAltoContraste() {
    if (typeof document === 'undefined') return;
    const boot = () => {
        montarBotonAltoContraste();
        aplicarAltoContraste(leerAltoContrasteActivo());
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
    try {
        window.addEventListener('gestornova-app-ready', () => {
            montarBotonAltoContraste();
            aplicarAltoContraste(leerAltoContrasteActivo());
        });
    } catch (_) {}
}

initGnLoginAltoContraste();
