/**
 * Inicialización diferida del panel admin: export estadísticas, CSV tipo,
 * bindings de derivaciones en config, panel históricos. Evita descargar/parsear
 * estos módulos en sesión técnico hasta la primera apertura de admin.
 * made by leavera77
 */

let _done = false;
/** @type {Promise<void> | null} */
let _inFlight = null;

/**
 * @param {import('./admin-socios.js')} sociosMod
 * @param {Record<string, unknown>} ctx
 */
function bindAdminSociosModule(sociosMod, ctx) {
    sociosMod.initAdminSocios({
        sociosCatalogoTieneTenantId: ctx.sociosCatalogoTieneTenantId,
        sociosCatalogoTieneDatosExtra: ctx.sociosCatalogoTieneDatosExtra,
        sqlSimple: ctx.sqlSimple,
        sqlSimpleSelectAllPages: ctx.sqlSimpleSelectAllPages,
        tenantIdActual: ctx.tenantIdActual,
        normalizarRubroEmpresa: ctx.normalizarRubroEmpresa,
        esMunicipioRubro: ctx.esMunicipioRubro,
        esAdmin: ctx.esAdmin,
        getApiToken: ctx.getApiToken,
        apiUrl: ctx.apiUrl,
        toast: ctx.toast,
        toastError: ctx.toastError,
        mostrarOverlayImportacion: ctx.mostrarOverlayImportacion,
        actualizarOverlayImportacion: ctx.actualizarOverlayImportacion,
        ocultarOverlayImportacion: ctx.ocultarOverlayImportacion,
        nominatimFetchSearch: ctx.nominatimFetchSearch,
    });
}

/**
 * Solo módulo socios (sin cargar históricos/export/derivaciones). Para pestaña Socios al abrir.
 * @param {() => Record<string, unknown>} getDeps
 */
export async function ensureAdminSociosInitializedFast(getDeps) {
    const sociosMod = await import('./admin-socios.js');
    if (sociosMod.isAdminSociosInitialized()) return;
    const ctx = typeof getDeps === 'function' ? getDeps() : {};
    try {
        bindAdminSociosModule(sociosMod, ctx);
    } catch (e) {
        console.warn('[admin-deferred] init socios fast', e);
    }
    if (!sociosMod.isAdminSociosInitialized()) {
        throw new Error('No se pudo inicializar el módulo socios');
    }
}

export async function ensureAdminSociosInitialized(getDeps) {
    const sociosMod = await import('./admin-socios.js');
    if (sociosMod.isAdminSociosInitialized()) return;
    await ensureAdminSociosInitializedFast(getDeps);
    if (sociosMod.isAdminSociosInitialized()) return;
    await ensureAdminPanelDeferredBindings(getDeps);
    if (sociosMod.isAdminSociosInitialized()) return;
    const ctx = typeof getDeps === 'function' ? getDeps() : {};
    try {
        bindAdminSociosModule(sociosMod, ctx);
    } catch (e) {
        console.warn('[admin-deferred] init socios (retry)', e);
    }
    if (!sociosMod.isAdminSociosInitialized()) {
        throw new Error('No se pudo inicializar el módulo socios');
    }
}

/**
 * @param {() => Record<string, unknown>} getDeps - debe devolver refs actuales (toast, sqlSimple, …)
 */
/**
 * Históricos admin: garantiza init del panel y dispara carga (evita carrera con import diferido).
 * @param {() => Record<string, unknown>} getDeps
 */
export async function ensureAdminHistoricosTabReady(getDeps) {
    await ensureAdminPanelDeferredBindings(getDeps);
    if (typeof window.__gnAdminTabHistoricos === 'function') {
        window.__gnAdminTabHistoricos();
    }
}

export async function ensureAdminPanelDeferredBindings(getDeps) {
    if (_done) return;
    if (_inFlight) {
        await _inFlight;
        return;
    }
    _inFlight = (async () => {
        let ctx = {};
        try {
            ctx = typeof getDeps === 'function' ? getDeps() : {};
        } catch (e) {
            console.warn('[admin-deferred] getDeps', e);
            throw e;
        }
        const [estCsv, exportStats, deriv, historicos, saidiDist, sociosMod, redInfra, subInfra, subHook] = await Promise.all([
            import('./est-csv-tipo-filtro.js'),
            import('./export-pedidos-admin-stats.js'),
            import('./derivaciones-reclamos-admin.js'),
            import('./admin-historicos.js'),
            import('./admin-saidi-distrib-excel.js'),
            import('./admin-socios.js'),
            import('./admin-red-electrica-infra.js'),
            import('./admin-subestaciones-infra.js'),
            import('./admin-subestaciones-tab-hook.js'),
        ]);
        try {
            estCsv.initEstCsvTipoAutocomplete();
        } catch (_) {}
        try {
            exportStats.initExportPedidosAdminStats({
                esAdmin: ctx.esAdmin,
                toast: ctx.toast,
                toastError: ctx.toastError,
                gnCerrarModalPedidoDetalleSiAbierto: ctx.gnCerrarModalPedidoDetalleSiAbierto,
                neonOk: ctx.neonOk,
                sqlReady: ctx.sqlReady,
                modoOffline: ctx.modoOffline,
                sqlSimple: ctx.sqlSimple,
                pedidosFiltroTenantSql: ctx.pedidosFiltroTenantSql,
                resolveCondicionFechaPedidosStats: ctx.resolveCondicionFechaPedidosStats,
                appendTipoTrabajoFilterToWhere: estCsv.appendTipoTrabajoFilterToWhere,
                esc: ctx.esc,
                tenantIdActual: ctx.tenantIdActual,
            });
        } catch (_) {}
        try {
            deriv.initDerivacionesReclamosAdminBindings({
                normalizarWhatsappInternacionalDesdeInput: ctx.normalizarWhatsappInternacionalDesdeInput,
                toast: ctx.toast,
                setDerivacionesInlineError: ctx.setDerivacionesInlineError,
                onUiRefresh: ctx.actualizarBotonesWhatsappDerivacionesUi,
            });
        } catch (_) {}
        try {
            historicos.initAdminHistoricosPanel({
                toast: ctx.toast,
                refrescarPedidos: ctx.refrescarPedidos,
                cerrarAdminPanel: ctx.cerrarAdminPanel,
                sqlSimple: ctx.sqlSimple,
                neonOk: ctx.neonOk,
            });
        } catch (_) {}
        try {
            saidiDist.initAdminSaidiDistribExcel({
                toast: ctx.toast,
                toastError: ctx.toastError,
                getApiToken: ctx.getApiToken,
                apiUrl: ctx.apiUrl,
                esCooperativaElectricaRubro: ctx.esCooperativaElectricaRubro,
                debeOcultarTabDistribuidoresAdmin: ctx.debeOcultarTabDistribuidoresAdmin,
            });
        } catch (_) {}
        try {
            bindAdminSociosModule(sociosMod, ctx);
        } catch (e) {
            console.warn('[admin-deferred] init socios', e);
        }
        try {
            redInfra.initAdminRedElectricaInfra({
                getApiToken: ctx.getApiToken,
                apiUrl: ctx.apiUrl,
                toast: ctx.toast,
                toastError: ctx.toastError,
            });
        } catch (_) {}
        try {
            subInfra.initAdminSubestacionesInfra({
                getApiToken: ctx.getApiToken,
                apiUrl: ctx.apiUrl,
                toast: ctx.toast,
                toastError: ctx.toastError,
            });
        } catch (_) {}
        try {
            subHook.installAdminSubestacionesTabHook();
        } catch (_) {}
        try {
            const estStat = await import('./admin-estadisticas-stat-cards-ui.js');
            estStat.initEstadisticasStatCardsUi(estStat.buildEstadisticasStatCardsDeps(ctx));
        } catch (e) {
            console.warn('[admin-deferred] init estadisticas stat cards', e);
        }
        try {
            const distUi = await import('./admin-distribuidores-catalogo-ui.js');
            distUi.initAdminDistribuidoresCatalogoUi({
                getApiToken: ctx.getApiToken,
                apiUrl: ctx.apiUrl,
                toast: ctx.toast,
                toastError: ctx.toastError,
                esMunicipioRubro: ctx.esMunicipioRubro,
                esCooperativaAguaRubro: ctx.esCooperativaAguaRubro,
                mostrarOverlayImportacion: ctx.mostrarOverlayImportacion,
                actualizarOverlayImportacion: ctx.actualizarOverlayImportacion,
                ocultarOverlayImportacion: ctx.ocultarOverlayImportacion,
                cargarListaDistribuidoresAdmin: ctx.cargarListaDistribuidoresAdmin,
                cargarDistribuidores: ctx.cargarDistribuidores,
            });
        } catch (e) {
            console.warn('[admin-deferred] init distribuidores catalogo', e);
        }
        if (!sociosMod.isAdminSociosInitialized()) {
            throw new Error(
                'No se pudo inicializar el catálogo de socios (admin). Recargá la página o abrí Admin → Socios de nuevo.'
            );
        }
        _done = true;
    })()
        .catch((e) => {
            _inFlight = null;
            throw e;
        })
        .finally(() => {
            if (_done) _inFlight = null;
        });
    await _inFlight;
}

/**
 * Export Excel admin: garantiza inits diferidos y delega en el módulo de export.
 * @param {() => Record<string, unknown>} getDeps
 */
export async function exportarPedidosExcelAdminDeferred(getDeps) {
    await ensureAdminPanelDeferredBindings(getDeps);
    const { exportarPedidosExcelAdmin } = await import('./export-pedidos-admin-stats.js');
    return exportarPedidosExcelAdmin();
}
