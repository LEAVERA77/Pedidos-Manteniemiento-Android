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
 * @param {() => Record<string, unknown>} getDeps - debe devolver refs actuales (toast, sqlSimple, …)
 */
export async function ensureAdminPanelDeferredBindings(getDeps) {
    if (_done) return;
    if (_inFlight) {
        await _inFlight;
        return;
    }
    _inFlight = (async () => {
        const ctx = typeof getDeps === 'function' ? getDeps() : {};
        const [estCsv, exportStats, deriv, historicos, saidiDist] = await Promise.all([
            import('./est-csv-tipo-filtro.js'),
            import('./export-pedidos-admin-stats.js'),
            import('./derivaciones-reclamos-admin.js'),
            import('./admin-historicos.js'),
            import('./admin-saidi-distrib-excel.js'),
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
            saidiDist.initAdminSaidiDistribExcelBindings({
                toast: ctx.toast,
                toastError: ctx.toastError,
                getApiBaseUrl: ctx.getApiBaseUrl,
                getApiToken: ctx.getApiToken,
                cargarListaDistribuidoresAdmin: ctx.cargarListaDistribuidoresAdmin,
            });
        } catch (_) {}
        _done = true;
    })();
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
