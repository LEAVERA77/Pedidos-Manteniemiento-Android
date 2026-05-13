/**
 * Carga diferida de módulos IA y UI opcional (menos parse/ejecución en arranque del técnico / WebView).
 * Dispara con requestIdleCallback (fallback 2s) o al primer gesto sobre #pm / panel admin.
 * made by leavera77
 */

let _loaded = false;
/** @type {Promise<void> | null} */
let _loading = null;

function detachUserIntent(listeners) {
    try {
        document.removeEventListener('mousedown', listeners.down, true);
        document.removeEventListener('touchstart', listeners.touch, true);
    } catch (_) {}
}

async function loadOptionalUIModules() {
    if (_loaded) return;
    if (_loading) return _loading;

    _loading = (async () => {
        try {
            const [
                bp2,
                prio,
                sugerir,
                dup,
                anal,
                kpi,
                inf,
                deriv,
                img,
            ] = await Promise.all([
                import('./ia-analisis-pedidos-bp2.js'),
                import('./ia-priorizacion-bp2.js'),
                import('./ia-sugerir-reclamo.js'),
                import('./ia-duplicados-pedido.js'),
                import('./ia-analisis-reclamos.js'),
                import('./ia-kpi-sugeridos.js'),
                import('./ia-informe-unificado.js'),
                import('./ia-derivacion-mensaje.js'),
                import('./android-image-share.js'),
            ]);

            bp2.initBp2IA?.();
            prio.initPriorizacion?.();
            sugerir.initIASugerirReclamo?.();
            dup.hookCrearPedido?.();
            anal.initBotonAnalizarIA?.();
            kpi.initBotonSugerirKpis?.();
            inf.initBotonInformeUnificado?.();
            void deriv;
            img.initAndroidImageShare?.();

            _loaded = true;
        } catch (e) {
            console.warn('[gn-lazy-optional-ui-bootstrap]', e);
        } finally {
            _loading = null;
        }
    })();

    return _loading;
}

function gnInstallLazyOptionalUIBootstrap() {
    if (typeof document === 'undefined') return;

    function onUserIntent(/** @type {EventTarget | null} */ raw) {
        try {
            let el = raw instanceof Element ? raw : null;
            if (!el && raw && /** @type {any} */ (raw).parentElement) {
                el = /** @type {Element} */ (/** @type {any} */ (raw).parentElement);
            }
            if (!el || typeof el.closest !== 'function') return;
            if (
                el.closest('#pm') ||
                el.closest('#admin-panel') ||
                el.closest('.admin-tab') ||
                el.closest('#dm') ||
                el.closest('#dmc') ||
                el.closest('#ia-generar-derivacion')
            ) {
                detachUserIntent(listeners);
                void loadOptionalUIModules();
            }
        } catch (_) {}
    }

    const listeners = {
        down: /** @param {MouseEvent} ev */ (ev) => onUserIntent(ev.target),
        touch: /** @param {TouchEvent} ev */ (ev) => onUserIntent(ev.targetTouches?.[0]?.target || null),
    };

    document.addEventListener('mousedown', listeners.down, true);
    document.addEventListener('touchstart', listeners.touch, true);

    const kick = () => {
        void loadOptionalUIModules().then(() => {
            if (_loaded) detachUserIntent(listeners);
        });
    };

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => kick(), { timeout: 4000 });
    } else {
        setTimeout(kick, 2000);
    }
}

gnInstallLazyOptionalUIBootstrap();
