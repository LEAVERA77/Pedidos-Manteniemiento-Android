/**
 * Botón Ingresar (#lb) antes de que app.js asigne __gnEjecutarLogin (Pages / WebView).
 * Espera la carga; aviso visible si falla red, módulo o caché del SW.
 * made by leavera77
 */

const WAIT_MS = 45000;
const POLL_MS = 80;

function habilitarLbLoginTemprano() {
    const b = document.getElementById('lb');
    if (!b) return;
    b.disabled = false;
    try {
        b.removeAttribute('disabled');
    } catch (_) {}
}

function bloquearSubmitNativoLogin() {
    const f = document.getElementById('lf');
    if (!f || f.dataset.gnLoginSubmitCapture === '1') return;
    f.dataset.gnLoginSubmitCapture = '1';
    f.addEventListener(
        'submit',
        (ev) => {
            ev.preventDefault();
        },
        true
    );
}

function mostrarAvisoLogin(msg) {
    let el = document.getElementById('gn-login-carga-aviso');
    if (!el) {
        el = document.createElement('p');
        el.id = 'gn-login-carga-aviso';
        el.setAttribute('role', 'alert');
        el.style.cssText =
            'margin:.5rem 0 0;font-size:.78rem;color:#b45309;line-height:1.35;max-width:22rem';
        const lf = document.getElementById('lf');
        if (lf) lf.appendChild(el);
    }
    el.textContent = String(msg || '');
}

function quitarAvisoLogin() {
    try {
        document.getElementById('gn-login-carga-aviso')?.remove();
    } catch (_) {}
}

function esperarLoginHandler() {
    return new Promise((resolve) => {
        if (typeof window.__gnEjecutarLogin === 'function') {
            resolve(window.__gnEjecutarLogin);
            return;
        }
        const t0 = Date.now();
        const tick = () => {
            if (typeof window.__gnEjecutarLogin === 'function') {
                resolve(window.__gnEjecutarLogin);
                return;
            }
            if (Date.now() - t0 >= WAIT_MS) {
                resolve(null);
                return;
            }
            setTimeout(tick, POLL_MS);
        };
        tick();
    });
}

function registrarBridgeClickIngresar() {
    const lb = document.getElementById('lb');
    if (!lb || lb.dataset.gnLbLoginBridgeRegistrado === '1') return;
    lb.dataset.gnLbLoginBridgeRegistrado = '1';
    lb.addEventListener('click', async (ev) => {
        try {
            ev.preventDefault();
        } catch (_) {}
        if (typeof window.__gnEjecutarLogin === 'function') {
            return window.__gnEjecutarLogin(ev);
        }
        const prevHtml = lb.innerHTML;
        mostrarAvisoLogin('Cargando aplicación…');
        lb.disabled = true;
        const fn = await esperarLoginHandler();
        lb.disabled = false;
        if (!prevHtml || lb.innerHTML === prevHtml) {
            lb.innerHTML = prevHtml || '<i class="fas fa-sign-in-alt"></i> Ingresar';
        }
        if (typeof fn === 'function') {
            quitarAvisoLogin();
            return fn(ev);
        }
        mostrarAvisoLogin(
            'No se pudo cargar el sistema. Recargá la página (Ctrl+F5 o recarga forzada) y probá de nuevo.'
        );
        try {
            console.warn(
                '[GN] Ingresar: app.js aún no cargó (red, error de módulo o caché vieja del SW)'
            );
        } catch (_) {}
    });
}

function wireModuleLoadErrors() {
    window.addEventListener(
        'error',
        (e) => {
            const f = String(e.filename || e.target?.src || '');
            if (!/\.js(\?|$)/i.test(f) && !/\/modules\//.test(f) && !/\/js\//.test(f)) return;
            mostrarAvisoLogin(
                'Error al cargar la aplicación. Recargá sin caché (Ctrl+Shift+R) o cerrá la pestaña y volvé a entrar.'
            );
        },
        true
    );
    window.addEventListener('unhandledrejection', (e) => {
        const r = e?.reason;
        const msg =
            r && typeof r === 'object' && r.message
                ? String(r.message)
                : String(r || '');
        if (
            /Failed to fetch/i.test(msg) ||
            /Loading module/i.test(msg) ||
            /Importing a module/i.test(msg) ||
            /error loading/i.test(msg)
        ) {
            mostrarAvisoLogin(
                'Error de red o módulo al cargar. Recargá la página (recarga forzada si sigue igual).'
            );
        }
    });
}

export function initGnLoginIngresarBridge() {
    habilitarLbLoginTemprano();
    bloquearSubmitNativoLogin();
    wireModuleLoadErrors();
    registrarBridgeClickIngresar();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGnLoginIngresarBridge, { once: true });
    } else {
        initGnLoginIngresarBridge();
    }
}
