import {
  OU_KEY,
  offlineQueue,
  offlineSave,
  offlinePedidos,
  offlinePedidosSave,
  enqueueOffline,
  actualizarBadgeOffline,
  guardarUsuarioOffline,
  verificarUsuarioOffline
} from './offline.js';

import './modules/canvas-2d-willread-patch.js';

import {
  resolverTenantIdPostLoginNeon,
  usuarioSesionParaEntrar,
  tenantIdDesdeAppConfig,
  TENANT_ID_MONOTENANT_FALLBACK
} from './modules/tenantResolver.js';
import { preferTenantIdNeonAutoritativo } from './modules/tenantSync.js';
import { resolverTenantOperativoSesion } from './modules/tenantSessionPolicy.js';
import { resolveUsuariosTenantColumnName, resetUsuariosTenantColumnCache } from './modules/tenantNeonUsuario.js';
import {
    stripGestornovaDicePrefix,
    gnDice,
    esc,
    yieldAnimationFrame,
    parsearDmsLatLonFlexible,
    parseDecimalODmsCoord,
    validarWgs84Import
} from './modules/utils.js';
import {
    logErrorWeb,
    mensajeErrorUsuario,
    toastError,
    escHtmlPrint,
    toast,
    gnCerrarModalPedidoDetalleSiAbierto,
} from './modules/ui-utils.js';
import {
    quitarMovil9Tras54Digitos,
    normalizarTelefonoWhatsapp,
    esTelefonoWhatsappValido,
} from './modules/normalizar-telefono.js';
import { pdfEncabezadoEmpresaBloque } from './modules/empresa-encabezado-pdf.js';
import { paramsEmailReset, templateIdEmailReset } from './modules/emailjs-plantilla-unificada.js';
import { construirHtmlEncabezadoInformeEmpresa } from './modules/informe-empresa-html-encabezado.js';
import {
    ESTADO_DONUT_COLORS,
    DONUT_FALLBACK_SEQUENCE,
    CHART_PALETTE_ARRAY,
    datasetsMensualCreadosCerrados
} from './modules/graficos-colores.js';
import {
    construirDerivacionReclamosDesdeFormularioDerivacionesCompleto,
    poblarDerivacionesListasDesdeCfg,
    refreshDerivacionListaWaButtons,
} from './modules/derivaciones-reclamos-admin.js';
import {
    parseWhatsappArAreasPorLocalidadTextarea,
    parseWhatsappArAreaPrefixesInput,
    sincronizarCamposWhatsappArAreaDesdeEmpresaCfg,
    normalizarWhatsappInternacionalDesdeInput,
    actualizarBotonesWhatsappDerivacionesUi,
    bindDerivacionesFormInputsOnce,
    poblarFormDerivacionesDesdeEmpresaCfg,
    digitosWhatsAppDerivacionEmpresaCfg,
    obtenerWaMeUrlDerivacionEmpresaCfg,
    setAdminEmpresaWhatsappDerivacionesDeps,
    wireAbrirWhatsappDerivacionFormWindow,
} from './modules/admin-empresa-whatsapp-derivaciones.js';
import { syncKpiAdminRubroDom } from './modules/kpi-admin-rubro-ui.js';
import { bp2OcultarHistoricosResueltosActivo } from './modules/vaciado-quincenal.js';
import {
    sqlMotivosDesestimacion,
    datasetsTiposTrabajoConDesestimados,
    opcionesChartTiposApilados,
    crearGraficoMotivosDesestimacion,
    insertarCardDesestimadosEnResumen,
    renderBloquePdfDesestimados,
} from './modules/estadisticas-desestimados.js';
import { pintarCaptionsGraficosEstadisticasAdmin } from './modules/estadisticas-chart-captions.js';
import { pedidosBaseMapaSinToolbarBp2, pedidoPasaFiltroRubroSiAsignadoAOperador } from './modules/filtros-checkboxes.js';
import {
    toggleMapaCardSlideoff,
    syncMapSlideTabsFromStorage,
    toggleMapaFiltrosBody,
    toggleMapaCapasOsmBody,
    toggleMapaCoordsConverterBody
} from './modules/filtros-estado.js';
import { etiquetaIdentificadorPedidoLista, tituloResumenReferenciaEstadisticas } from './modules/etiqueta-identificador-pedido.js';
import {
    arrayBufferToBase64,
    escapeCsvCeldaPedidos,
    runExportPedidosExcelCsv,
    splitFechaHoraExportAR
} from './modules/export-excel.js';
import {
    initAdminWizard,
    initSetupWizardBindings,
    mostrarModalConfigInicial,
    primeWizardCoordsFromEp,
    resetWizardLogoBufferForManualOpen,
    setWizardManualContext,
    verificarConfiguracionInicialObligatoria
} from './modules/admin-wizard.js';

import {
    vaciarCoordenadasSociosCatalogo,
    cargarListaSociosAdmin,
    importarExcelSocios,
    mostrarFormatoExcelSocios,
    cerrarModalFormatoExcelSocios,
    descargarPlantillaCsvSociosRubro
} from './modules/admin-socios.js';

import {
    TIPOS_RECLAMO_POR_RUBRO,
    TIPOS_RECLAMO_LEGACY,
    prioridadPredeterminadaPorTipoTrabajoUI,
    rubroCatalogoTiposReclamo,
    tiposReclamoSeleccionables,
    tipoReclamoEsFraudeAnonimo,
    syncChecklistSeguridadCierreLabels,
    textoResumenChecklistSeguridad,
    TIPOS_TRABAJO_DERIVACION_SOLO_AGUA,
    TIPOS_TRABAJO_DERIVACION_SOLO_MUNICIPIO,
} from './modules/catalogoReclamoPorRubro.js';
import {
    afterPedidoGuardadoIntentarWhatsappDerivacionTercero,
    initDerivacionesTercerosNuevoPedido,
    resetDerivacionTerceroNuevoPedidoUI,
    syncDerivacionTerceroNuevoPedidoUI,
    leerTerceroDerivacionNuevoPedidoSiActivo,
    internacionalMasDesdeDigitosOTexto,
} from './modules/derivaciones-terceros.js';
import {
    syncPedidoFormNisYClienteLabels,
    syncPedidoFormZonaDistribuidorLabels,
    etiquetaNisDetalleModalPedido,
    syncHistorialNisBusquedaDom,
} from './modules/pedido-form-labels-rubro.js';
import { postDerivarExternoDesdeAltaNuevoPedido } from './modules/pedido-alta-derivacion-api.js';
import { resolverPedidoParaDerivacionRevisionAdmin } from './modules/derivacion-revision-admin-modal.js';
import { runNeonAppVersionCheckAndroid } from './modules/android-app-update-neon.js';
import {
    ocultarModulosRedesValorParaApi,
    syncAyudaDistribuidoresExcelHint,
    syncOcultarModulosRedesRowVisibility,
} from './modules/admin-distribuidores-formato.js';
import { syncAdminSaidiDistribTabVisibility } from './modules/admin-saidi-distrib-excel.js';
import {
    syncAdminRedElectricaTabVisibility,
    cargarListaRedElectricaInfra,
} from './modules/admin-red-electrica-infra.js';
import { initCommunityBroadcastFab as initGnCommunityBroadcastFab, syncPedidosDockChip } from './modules/gn-panel-docks.js';
import { installBusquedaApellidoHistorial } from './modules/busqueda-apellido.js';
import { installBusquedaDireccionHistorial } from './modules/busqueda-direccion-historial.js';
import { initPedidoNuevoPadronBusqueda, resetPadronNuevoPedidoNisTimers } from './modules/pedido-nuevo-padron-busqueda.js';
import {
    mountPedidoFormularioEnDom,
    initPedidoNuevoOficina,
    resetPedidoNuevoOficinaUi,
    esPedidoNuevoModoOficina,
    syncVisibilidadBotonPedidoOficina,
} from './modules/pedido-nuevo-oficina.js';
import {
    initPedidoNuevoDesdePunto,
    abrirNuevoPedidoDesdePunto,
} from './modules/pedido-nuevo-desde-punto-coords.js';
import { registrarAppGlobal } from './modules/gn-app-global-bridge.js';
import {
    prepararUbicacionSubmitPedidoOficina,
    finalizarPedidoOficinaTrasGuardar,
    asegurarAppSelParaGuardarPedido,
    coordsDesdeAppParaGuardar,
} from './modules/pedido-oficina-guardar-ubicacion.js';
import {
    syncPrioridadConTipoReclamo,
    syncSuministroElectricoUI,
    installPedidoFormularioGlobalHooks,
    tipoReclamoElectricoPideSuministroWhatsapp,
} from './modules/pedido-formulario-global-hooks.js';
import { cargarSelectDi2Distribuidores } from './modules/pedido-di2-distribuidores.js';

try {
    mountPedidoFormularioEnDom();
} catch (_) {}
import { installAdminSociosHistorialPedidos } from './modules/admin-socios-historial-pedidos.js';
import { installAdminSociosBusquedaPadron } from './modules/admin-socios-busqueda-padron.js';
import { installAdminSociosUsarEnPedido } from './modules/admin-socios-usar-en-pedido.js';
import { tsResolucionPedidoMs, GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS } from './modules/gn-fuzzy-texto-levenshtein.js';
import { installPedidoVolverPendiente, syncPedidoVolverPendienteButton } from './modules/pedido-volver-pendiente.js';
import {
  gnMapThrottleOnDetallePedidoOpened,
  gnMapThrottleOnDetallePedidoClosed,
} from './modules/gn-map-throttle-when-modal.js';
import {
    guardarRotacionReclamoDesdeFotoAmpliada,
    installPedidoVerImagenDetalleObserver,
    disconnectPedidoVerImagenDetalleObserver,
} from './modules/pedido-ver-imagen.js';
import {
    initPedidosToolbarFiltrosExclusivos,
    syncPedidosToolbarFiltrosExclusivosFromLs,
} from './js/pedidos-toolbar-filtros-exclusivos.js';

import './modules/login-biometric-android.js';
import './modules/login-android-arranque.js';
import './modules/gn-lazy-optional-ui-bootstrap.js';
import { renderMkPedidosEnMapa } from './modules/map-pedidos-markers.js';

import {
  asegurarDefsProyeccionesARG,
  fajaArgentinaPorLongitud,
  registrarFajaInstalacionSiFalta,
  proyectarCoordPedido,
  tieneProyeccionEmpresaConfigurada,
  leerPreferenciaCoordsDisplayNuevoPedido,
  convertirAInchauspe,
  resolverFajaProyeccion,
  convertirProyectadasARGaWgs84,
  proyectarWgs84AFamiliaFaja,
  PMG_FAMILIAS_PROYECCION_LIST,
  etiquetaFamiliaProyeccionCorta,
  etiquetaFamiliaProyeccionLarga
} from './map.js';
import { generarMenuBot, procesarRespuestaBot } from './modules/bot-menus.js';
import { gnAbrirAsistenteDesdeWizardOLogin } from './modules/gn-asistente-paridad-magic-mt.js';
import { initGnModalZIndexStack, gnForceModalZFront } from './modules/gn-modal-z-index-stack.js';
import { installGnClipboardCopy } from './modules/gn-clipboard-copy.js';
import { gnRequestClearGotoPreviewMarker } from './modules/gn-map-goto-preview-marker.js';
import { gnAndroidCerrarUiEncimaDelMapaParaZoomPedido } from './modules/gn-android-cerrar-ui-para-mapa-zoom.js';
import {
    ensureAdminPanelDeferredBindings,
    ensureAdminHistoricosTabReady,
    exportarPedidosExcelAdminDeferred,
} from './modules/app-admin-panel-deferred.js';
import { gnResetUsuarioNombresMap } from './modules/gn-usuario-nombres.js';
import { setInformesEstadisticasPdfCaptureDeps } from './modules/informes-estadisticas-pdf-capture.js';
import {
    setInformesEstadisticasPrintDeps,
    imprimirInformeConGraficos,
    generarPdfEstadisticasMultipaginaENRE,
} from './modules/informes-estadisticas-print.js';
import {
    gnWaGeoOpsRefresh,
    gnWaGeoOpsStartPoll,
    gnWaGeoOpsStopPoll,
    gnWaGeoOpsBindControlsOnce,
    setGnWaGeoOpsPanelDeps,
} from './modules/gn-wa-geo-ops-panel.js';
import {
    iniciarPollWhatsappHumanChat,
    detenerPollWhatsappHumanChat,
    destruirTodasVentanasWaHc,
    setWhatsappHumanChatAdminDeps,
    wireWhatsappHumanChatAdminWindow,
} from './modules/whatsapp-human-chat-admin.js';
import {
    htmlSolicitudDerivacionCoopElectricaTecnico,
    htmlDerivacionTercerosPedidoDetalle,
    setPedidoDetalleDerivacionHtmlDeps,
} from './modules/pedido-detalle-derivacion-html.js';
import { pedidoDetalleTraerModalAlFrente } from './modules/pedido-detalle-modal-z.js';
import { gnDetalleImgAttrs } from './modules/pedido-detalle-html-helpers.js';
import {
    puedePatchIncrementalDetalle,
} from './modules/pedido-detalle-incremental.js';
import { hydrateDetallePedido } from './modules/pedido-detalle-hydrate.js';
import {
    construirHtmlBloqueOpinionClienteDetalle,
    actualizarHostOpinionClienteDetalleModal,
    construirHtmlOpinionClientePrint,
    setPedidoOpinionClienteUiDeps,
    installPedidoOpinionDescargoUi,
} from './modules/pedido-opinion-cliente-ui.js';
import {
    reverseNominatimNuevoPedidoCore,
    programarReverseNominatimFormularioNuevoPedidoDesdeMapa,
    setPedidoNuevoReverseGeoDeps,
    leerProvinciaCpNuevoPedido,
    enriquecerSociosCatalogoGeoDesdeFormularioNuevoPedido,
    resetPedidoNuevoReverseGeoCache,
} from './modules/pedido-nuevo-reverse-geo.js';
import {
    initGnTenantAccesoTecnicoUnificado,
    clearGnTenantTechSession,
} from './modules/gn-tenant-acceso-tecnico-unificado.js';
import { apiSetupTechnicianFetchTenants } from './modules/setup-technician-api.js';
import {
    initGnTenantSoloTecnicoUI,
    hydrateBrandingLoginSinTenantAjeno,
    actualizarBotonMtSegunRol,
} from './modules/gn-tenant-solo-tecnico-ui.js';
import './modules/gn-tenant-force-sync-android-boot.js';
import './modules/gn-android-shell-perf.js';
import './modules/gn-offline-shell-refresh.js';
import { initAdminCambiarCredenciales } from './modules/admin-cambiar-credenciales.js';
import { initAdminClaveProvisoria } from './modules/admin-clave-provisoria.js';
import {
    initAuthLoginApiTenantResolver,
    beginLoginAttempt,
    endLoginAttempt,
    buildNeonLoginTenantSqlFrag,
    fetchAuthLoginApi,
    clearAuthLoginTenantHint,
} from './modules/auth-login-api-body.js';
import { validarParPasswordNuevoConfirmacionGestornova } from './modules/password-policy-gestornova.js';
import { initTenantPrimerIngresoBootstrap } from './modules/tenant-primer-ingreso-bootstrap.js';
import { shouldSkipNeonPlaintextLoginFallback } from './modules/auth-login-neon-fallback.js';
import {
    debeOcultarTabDistribuidoresAdmin as debeOcultarTabDistribuidoresAdminPolicy,
    syncCooperativaElectricaAdminTabs,
} from './modules/admin-tab-distribuidores-policy.js';
import {
    abrirModalAvancePedido,
    initPedidoAvanceModalUI,
    validarAvanceNoRetrocede,
    aplicarMinimoAvanceEnCamposPedido,
    bodyIniciarEjecucionSinBajarAvance,
    avanceEnteroPedido,
} from './modules/pedido-avance-no-retroceder.js';
import {
    htmlOperativaTop3Section,
    mountPedidoOperativaTop3UI,
    verificarGeocercaAntesIniciarPedido,
} from './modules/pedido-operativa-top3-ui.js';
import {
    initPedidoFotosCampoAndroid,
    solicitarFotosCampoOpcional,
    tomarFotosAvanceTemp,
    resetFotosAvanceSesion,
} from './modules/pedido-fotos-campo-android.js';
import {
    materialesDetalleDebeOmitirRecarga,
    materialesDetalleMarcarEstable,
    materialesDetalleIniciarCarga,
    materialesDetalleFinCarga,
} from './modules/pedido-materiales-detalle-guard.js';
import { pollBannerOpinionClienteMejorado, setOpinionBannerWatermarkIso } from './modules/admin-opinion-banner-realtime.js';
import { registrarFcmTokenSiDisponible } from './modules/fcm-token-registro.js';
import { initGnFeaturesAdminMounts, refrescarRankingSlaEstadisticas } from './modules/gn-features-bootstrap.js';
import {
    registrarOnboardingCompletadoTrasVinculoTenantMtt,
    aplicarMascaraEmpresaAdminTrasCambioTenant,
} from './modules/ocultar-datos-tenant.js';
import { restaurarDatosCompletosTrasCambioTenant } from './modules/restaurar-datos-tenant.js';
import {
    marcarListaSociosPendienteRecarga,
    recargarSociosAdminTrasCambioTenant,
} from './modules/admin-socios-carga-tenant.js';
import { resetSociosCatalogoSchemaCache } from './modules/socios-catalogo-schema-cache.js';
if (typeof window !== 'undefined') {
    window.generarMenuBot = generarMenuBot;
    window.procesarRespuestaBot = procesarRespuestaBot;
    window.gnAbrirAsistenteDesdeWizardOLogin = gnAbrirAsistenteDesdeWizardOLogin;
}
installGnClipboardCopy();

// stripGestornovaDicePrefix, gnDice → modules/utils.js


/** Una sola línea para el formulario de pedido: WGS84 o planas según preferencia y empresa_config. */
function htmlLineaUbicacionFormulario(lat, lng, acc, modoForzado) {
    registrarFajaInstalacionSiFalta(lng);
    const accStr = acc
        ? ` <span style="opacity:.85;font-size:.9em">(±${acc < 1000 ? acc + 'm' : (acc / 1000).toFixed(1) + 'km'})</span>`
        : '';
    const modo = modoForzado != null && modoForzado !== '' ? modoForzado : leerPreferenciaCoordsDisplayNuevoPedido();
    const usarWgs = modo === 'wgs84' || !tieneProyeccionEmpresaConfigurada();
    let compact;
    if (usarWgs) {
        compact = `${Number(lat).toFixed(6).replace('.', ',')}, ${Number(lng).toFixed(6).replace('.', ',')} (WGS84)`;
    } else {
        const pc = proyectarCoordPedido(lat, lng);
        if (pc) {
            compact = `F${pc.z}: ${pc.vx} · ${pc.vy} m`;
        } else {
            const c = convertirAInchauspe(lat, lng);
            const z = fajaArgentinaPorLongitud(lng);
            compact = c.x !== 'Error' ? `F${z}: ${c.x} · ${c.y} m` : `${Number(lat).toFixed(6).replace('.', ',')}, ${Number(lng).toFixed(6).replace('.', ',')} (WGS84)`;
        }
    }
    return `<i class="fas fa-check-circle" style="color:#059669"></i> ${compact}${accStr}`;
}

function syncWrapCoordsDisplayNuevoPedido() {
    const w = document.getElementById('wrap-sel-coords-display');
    const sel = document.getElementById('sel-coords-display');
    if (!w || !sel) return;
    const ok = tieneProyeccionEmpresaConfigurada();
    w.style.display = ok ? '' : 'none';
    if (!ok) return;
    sel.value = leerPreferenciaCoordsDisplayNuevoPedido();
}

function onCambioVisualizacionCoordsNuevoPedido() {
    const sel = document.getElementById('sel-coords-display');
    if (sel) {
        try { localStorage.setItem('pmg_coords_display_pref', sel.value); } catch (_) {}
    }
    refrescarLineaUbicacionModalNuevoPedido();
}
window.onCambioVisualizacionCoordsNuevoPedido = onCambioVisualizacionCoordsNuevoPedido;

function refrescarLineaUbicacionModalNuevoPedido() {
    const pm = document.getElementById('pm');
    if (!pm || !pm.classList.contains('active')) return;
    const li = document.getElementById('li');
    const gi = document.getElementById('gi');
    const ui = document.getElementById('ui');
    if (!li || !gi || !ui || !ui.classList.contains('sel')) return;
    const lat = parseFloat(li.value);
    const lng = parseFloat(gi.value);
    if (!isFinite(lat) || !isFinite(lng)) return;
    const acc = ultimaUbicacion && Math.abs(ultimaUbicacion.lat - lat) < 1e-7 && Math.abs(ultimaUbicacion.lon - lng) < 1e-7
        ? ultimaUbicacion.acc
        : null;
    ui.innerHTML = htmlLineaUbicacionFormulario(lat, lng, acc);
}

function syncCoordModoVisibility() {
    const sel = document.getElementById('cfg-coord-familia');
    const w = document.getElementById('cfg-coord-modo-wrap');
    if (!sel || !w) return;
    w.style.display = sel.value === 'none' ? 'none' : '';
}
window.syncCoordModoVisibility = syncCoordModoVisibility;

let NEON_OK = false;
let _sql = null;
let mapaInicializado = false;
let fotosTemporales = [];
let fotoCierreTemp = null;    
let ultimaUbicacion = null;
let marcadorUbicacion = null;
/** En la app Android: hasta que llegue el primer fix GPS, el primer toque en el mapa fija posición (una vez por sesión). */
let _gpsRecibidoEstaSesion = false;
const MAP_SEED_SESSION_KEY = 'pmg_map_seed_done';
/** Android WebView: el toque en el mapa solo abre «Nuevo pedido» si el usuario armó antes con el botón dedicado. */
const MAP_TAP_NUEVO_PEDIDO_ARMED_KEY = 'pmg_map_tap_nuevo_pedido_armed';
let modoOffline = false;      












async function notificarNeonConectadoParaUpdateCheck() {
    await runNeonAppVersionCheckAndroid({
        sqlSimple,
        isNeonReady: () => !!(NEON_OK && _sql),
        isGestorNovaApp: () =>
            !!(
                window.AndroidConfig &&
                (/GestorNova\//i.test(navigator.userAgent) ||
                    /Nexxo\//i.test(navigator.userAgent) ||
                    window.location.protocol === 'file:')
            ),
    });
}

function setModoOffline(offline) {
    modoOffline = offline;
    const hiddenPref = localStorage.getItem('pmg_offline_banner_hidden') === '1';
    const toggle = document.getElementById('offline-toggle');
    if (toggle) {
        if (esAndroidApp) toggle.className = '';
        else toggle.className = offline ? 'visible' : '';
    }
    const banner = document.getElementById('offline-banner');
    if (banner) {
        if (esAndroidApp) {
            banner.classList.remove('visible');
            banner.classList.add('hidden');
        } else if (offline) {
            banner.classList.add('visible');
            banner.classList.toggle('hidden', hiddenPref);
        } else {
            banner.classList.remove('visible');
            banner.classList.remove('hidden');
        }
    }
    const di = document.getElementById('di');
    if (di) {
        di.className = offline ? 'di er' : 'di ok';
        di.title = offline ? 'Sin conexión — modo offline' : 'Conectado a Neon';
    }
}

// yieldAnimationFrame → modules/utils.js

let _syncWorkerPrepareSeq = 0;
function prepareOfflineQueueInWorker(rawQueue) {
    if (typeof Worker === 'undefined' || !Array.isArray(rawQueue)) return Promise.resolve(rawQueue);
    return new Promise(resolve => {
        const id = ++_syncWorkerPrepareSeq;
        let w;
        const done = (q) => {
            try { w && w.terminate(); } catch (_) {}
            resolve(Array.isArray(q) && q.length ? q : rawQueue);
        };
        const t = setTimeout(() => done(rawQueue), 12000);
        try {
            w = new Worker(new URL('./sync-worker.js', import.meta.url));
        } catch (_) {
            try {
                w = new Worker('sync-worker.js');
            } catch (e2) {
                clearTimeout(t);
                resolve(rawQueue);
                return;
            }
        }
        w.onmessage = (ev) => {
            const d = ev.data || {};
            if (d.id !== id) return;
            clearTimeout(t);
            done(d.ok && Array.isArray(d.queue) ? d.queue : rawQueue);
        };
        w.onerror = () => {
            clearTimeout(t);
            done(rawQueue);
        };
        try {
            w.postMessage({ id, queue: rawQueue });
        } catch (_) {
            clearTimeout(t);
            done(rawQueue);
        }
    });
}

async function sincronizarOffline() {
    let q = offlineQueue();
    if (q.length === 0) { toast('No hay pedidos offline pendientes', 'info'); return; }
    if (!NEON_OK || !_sql) {
        
        toast('Intentando conectar...', 'info');
        const ok = await initNeon();
        if (!ok) { toast('Sin conexión. Reintentá cuando tengas señal.', 'error'); return; }
        NEON_OK = true;
        setModoOffline(false);
    }

    q = await prepareOfflineQueueInWorker(q);

    toast('Sincronizando ' + q.length + ' pedido(s)...', 'info');
    let ok = 0, fail = 0;
    const remaining = [];

    for (let i = 0; i < q.length; i++) {
        const op = q[i];
        await yieldAnimationFrame();
        try {
            if (op.tipo === 'INSERT') {
                await sqlSimple(op.query);
            } else if (op.tipo === 'UPDATE') {
                await sqlSimple(op.query);
            }
            ok++;
        } catch(e) {
            console.error('Sync fallo op:', op._offlineId, e.message);
            remaining.push(op);
            fail++;
        }
    }

    offlineSave(remaining);
    actualizarBadgeOffline();

    if (ok > 0) {
        toast(`✓ ${ok} pedido(s) sincronizado(s)${fail ? ' · ' + fail + ' pendientes' : ''}`, 'success');
        await cargarPedidos(); 
    } else {
        toast('No se pudo sincronizar. Reintentá más tarde.', 'error');
    }
}


window.addEventListener('online', async () => {
    console.log('Navegador: online (verificando conectividad real...)');
    
    const hayRed = await hayInternet();
    if (!hayRed) { console.log('Evento online ignorado — sin red real'); return; }
    
    try {
        const ok = await initNeon();
        if (ok) {
            NEON_OK = true;
            setModoOffline(false);
            await notificarNeonConectadoParaUpdateCheck();
            if (app.u) {
                toast('Conexión restaurada ✓', 'success');
                try {
                    await sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true });
                } catch (_) {}
                const q = offlineQueue();
                if (q.length > 0) setTimeout(sincronizarOffline, 1500);
                else cargarPedidos();
            } else {
                
                const dbs2 = document.getElementById('dbs');
                if (dbs2) {
                    dbs2.className = 'dbs ok';
                    dbs2.innerHTML = '<i class="fas fa-check-circle"></i> Conectado - Neon PostgreSQL';
                }
            }
        }
    } catch(_) {}
});
window.addEventListener('offline', () => {
    console.log('Navegador: offline');
    _netCache = { ok: false, ts: Date.now() }; 
    NEON_OK = false;
    _sql = null;
    setModoOffline(true);
});




async function solicitarPermisos() {
    const resultados = {};
    
    try {
        await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(
                p => { ultimaUbicacion = { lat: p.coords.latitude, lon: p.coords.longitude };
                       try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}
                       registrarFajaInstalacionSiFalta(p.coords.longitude);
                       res(); },
                e => rej(e),
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            )
        );
        resultados.gps = true;
    } catch(_) { resultados.gps = false; }
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof window.AndroidConfig !== 'undefined') {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            stream.getTracks().forEach(t => t.stop());
            resultados.camara = true;
        } catch(_) { resultados.camara = false; }
    }
    return resultados;
}


window.sincronizarOffline = sincronizarOffline;


try {
    const ubicacionGuardada = localStorage.getItem('ultima_ubicacion');
    if (ubicacionGuardada) {
        ultimaUbicacion = JSON.parse(ubicacionGuardada);
    }
} catch(_) {}

// esc → modules/utils.js
// logErrorWeb, mensajeErrorUsuario, toastError, toast → modules/ui-utils.js

async function ejecutarSQLConReintentos(query, params = [], maxIntentos = 3) {
    
    if (modoOffline || !NEON_OK) {
        throw new Error('Sin conexión — modo offline activo');
    }

    let ultimoError;
    let reintentosMostrados = false;
    
    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            if (!_sql) throw new Error('Neon no inicializado');
            
            
            if (intento === 2 && !reintentosMostrados) {
                toast('Reactivando base de datos...', 'info');
                reintentosMostrados = true;
            }
            
            let q = query;
            for (let i = 0; i < params.length; i++) {
                q = q.replace(new RegExp('\\{' + i + '\\}', 'g'), esc(params[i]));
            }
            
            return await _sql(q);
            
        } catch (error) {
            ultimoError = error;
            logErrorWeb(`sql-reintento-${intento}/${maxIntentos}`, error);
            
            if (intento < maxIntentos) {
                
                const espera = Math.pow(2, intento - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, espera));
                
                
                try {
                    if (_sql) await _sql('SELECT 1');
                } catch (_) {}
            }
        }
    }
    
    
    logErrorWeb('sql-reintentos-agotados', ultimoError);
    toast(mensajeErrorUsuario(ultimoError), 'error');
    throw ultimoError;
}


async function sqlSimple(query, params = []) {
    if (!_sql) throw new Error('Neon no inicializado');
    let q = query;
    for (let i = 0; i < params.length; i++)
        q = q.replace(new RegExp('\\{' + i + '\\}', 'g'), esc(params[i]));
    return _sql(q);
}

/** Neon / proxy pueden truncar respuestas grandes: paginar SELECT hasta traer todas las filas. */
const _SQL_PAGE_SIZE = 3500;
async function sqlSimpleSelectAllPages(selectSqlNoTrailingOrder, orderBySql) {
    const order = String(orderBySql || '').trim();
    const all = [];
    let offset = 0;
    const base = String(selectSqlNoTrailingOrder || '').trim();
    for (;;) {
        const q = `${base} ${order} OFFSET ${offset} LIMIT ${_SQL_PAGE_SIZE}`;
        const r = await sqlSimple(q);
        const rows = r.rows || [];
        all.push(...rows);
        if (rows.length < _SQL_PAGE_SIZE) break;
        offset += _SQL_PAGE_SIZE;
    }
    return { rows: all };
}

function mostrarOverlayImportacion(texto) {
    let el = document.getElementById('gn-import-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gn-import-overlay';
        el.className = 'gn-import-overlay';
        document.body.appendChild(el);
    }
    el.innerHTML =
        '<div class="gn-import-overlay-card" role="status" aria-live="polite">' +
        '<div class="gn-import-overlay-spin"><i class="fas fa-circle-notch fa-spin"></i></div>' +
        '<div class="gn-import-overlay-msg"></div></div>';
    const m = el.querySelector('.gn-import-overlay-msg');
    if (m) m.textContent = texto;
    el.style.display = 'flex';
}

function actualizarOverlayImportacion(texto) {
    const el = document.getElementById('gn-import-overlay');
    if (!el || el.style.display === 'none') return;
    const m = el.querySelector('.gn-import-overlay-msg');
    if (m) m.textContent = texto;
}

function ocultarOverlayImportacion() {
    const el = document.getElementById('gn-import-overlay');
    if (el) el.style.display = 'none';
}








let keepAliveInterval  = null;
let keepAliveStartTime = null;
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;  
const SESSION_MAX_MS        = 60 * 60 * 1000;
/** Cierre de sesión por inactividad (última interacción en UI o keep-alive OK). WebView Android / PWA. */
const PMG_LAST_ACTIVITY_TS_KEY = 'pmg_last_activity_ts';
const SESION_INACTIVIDAD_MAX_MS = 15 * 60 * 1000;
let _pmgActividadUltimaEscrituraLs = 0;
/** Releer `usuarios.tenant_id` en Neon con la sesión ya abierta (cambio desde otra sesión / admin web). */
const TENANT_NEON_REVALIDA_MS = 3 * 60 * 1000;
let _lastTenantRevalidaNeonMs = 0;
let _syncCatalogosInterval = null;

function iniciarSyncCatalogos() {
    detenerSyncCatalogos();
    const run = async () => {
        if (!app.u || modoOffline || !NEON_OK || !_sql) return;
        try { await cargarDistribuidores(); } catch (_) {}
    };
    run();
    _syncCatalogosInterval = setInterval(run, 120000);
}

function detenerSyncCatalogos() {
    if (_syncCatalogosInterval) {
        clearInterval(_syncCatalogosInterval);
        _syncCatalogosInterval = null;
    }
}

function registrarActividadSesionUsuario() {
    if (!app?.u) return;
    const now = Date.now();
    if (now - _pmgActividadUltimaEscrituraLs < 8000) return;
    _pmgActividadUltimaEscrituraLs = now;
    try {
        localStorage.setItem(PMG_LAST_ACTIVITY_TS_KEY, String(now));
    } catch (_) {}
}

function sesionSuperaInactividadMaxima() {
    try {
        const raw = localStorage.getItem(PMG_LAST_ACTIVITY_TS_KEY);
        if (raw == null || String(raw).trim() === '') return false;
        const t = parseInt(raw, 10);
        if (!Number.isFinite(t) || t <= 0) return false;
        return Date.now() - t > SESION_INACTIVIDAD_MAX_MS;
    } catch (_) {
        return false;
    }
}

function cerrarSesionPorInactividadSiCorresponde(mensaje) {
    if (!app?.u || !sesionSuperaInactividadMaxima()) return false;
    try {
        toast(mensaje || 'Sesión cerrada por inactividad (más de 15 min). Iniciá sesión de nuevo.', 'info');
    } catch (_) {}
    try {
        ejecutarCerrarSesion();
    } catch (_) {}
    return true;
}

(function bindRegistroActividadSesionGlobal() {
    const marcar = () => registrarActividadSesionUsuario();
    try {
        document.addEventListener('pointerdown', marcar, { passive: true, capture: true });
        document.addEventListener('keydown', marcar, { passive: true, capture: true });
    } catch (_) {}
})();

async function heartbeat() {
    if (!app.u) return;
    if (cerrarSesionPorInactividadSiCorresponde()) return;

    
    if (keepAliveStartTime && Date.now() - keepAliveStartTime >= SESSION_MAX_MS) {
        console.log('Keep-alive: sesión de 1 hora cumplida, cerrando sesión');
        detenerKeepAlive();
        toast('Sesión expirada (1 hora). Por seguridad, ingresá de nuevo.', 'info');
        setTimeout(() => {
            localStorage.removeItem('pmg');
            detenerTracking();
            detenerSyncCatalogos();
            detenerDashboardGerenciaPoll();
            detenerTecnicosMapaPrincipalPoll();
            detenerPollSincroPedidosTecnico();
            app.u = null;
            mapaInicializado = false;
            if (app.map) { app.map.remove(); app.map = null; }
            _marcadoresTecnicosPrincipal = [];
            const btnAdm = document.getElementById('btn-admin');
            if (btnAdm) btnAdm.style.display = 'none';
            const mapDashCard = document.getElementById('mapa-card-dashboard');
            if (mapDashCard) mapDashCard.style.display = 'none';
            document.getElementById('gw')?.classList.remove('active');
            document.getElementById('ls').classList.add('active');
            document.getElementById('ms').classList.remove('active');
            try {
                actualizarVisibilidadBotonTenantTecnicoLogin();
            } catch (_) {}
        }, 3500);
        return;
    }

    try {
        await sqlSimple('SELECT 1');
        registrarActividadSesionUsuario();
        console.log('Keep-alive OK', new Date().toLocaleTimeString('es-AR', {hour12:false}));
        const now = Date.now();
        if (!modoOffline && document.visibilityState === 'visible') {
            const neonListo = NEON_OK && !!_sql;
            const shellAndroid =
                typeof window.AndroidConfig !== 'undefined' ||
                typeof window.AndroidSession !== 'undefined';
            if (
                now - _lastTenantRevalidaNeonMs >= TENANT_NEON_REVALIDA_MS &&
                (neonListo || shellAndroid)
            ) {
                _lastTenantRevalidaNeonMs = now;
                void sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true });
            }
        }
        if (modoOffline) {
            
            NEON_OK = true;
            setModoOffline(false);
            toast('Conexión restaurada ✓', 'success');
            try {
                await sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true });
            } catch (_) {}
            const q = offlineQueue();
            if (q.length > 0) {
                setTimeout(sincronizarOffline, 1500);
            } else {
                cargarPedidos();
            }
        }
    } catch (err) {
        console.warn('Keep-alive: fallo de red:', err.message);
        if (app.u) {
            void (async () => {
                try {
                    if (await hayInternet()) {
                        _sql = null;
                        const reconectado = await initNeon();
                        if (reconectado) {
                            NEON_OK = true;
                            setModoOffline(false);
                            toast('Conexión restaurada ✓', 'success');
                            try {
                                await sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true });
                            } catch (_) {}
                            if (offlineQueue().length > 0) sincronizarOffline();
                            else cargarPedidos();
                            return;
                        }
                    }
                } catch (_) {}
                NEON_OK = false;
                setModoOffline(true);
            })();
        } else {
            NEON_OK = false;
            setModoOffline(true);
        }
    }
}

function iniciarKeepAlive() {
    detenerKeepAlive(); 
    keepAliveStartTime = Date.now();
    keepAliveInterval  = setInterval(heartbeat, KEEPALIVE_INTERVAL_MS);
    console.log('Keep-alive iniciado, sesión máxima 1h');
}

function detenerKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    keepAliveStartTime = null;
    detenerPollNotifMovil();
}



document.addEventListener('visibilitychange', () => {
    if (!document.hidden && app.u) {
        if (cerrarSesionPorInactividadSiCorresponde()) return;
        registrarActividadSesionUsuario();
        console.log('Tab visible: heartbeat preventivo');
        heartbeat();
        window.pollNotificacionesMovil();
        if (!esAdmin() && esTecnicoOSupervisor() && !modoOffline && NEON_OK && _sql) {
            if (!_gnDmTypingFocused()) void cargarPedidos({ silent: true });
        }
    }
});






function conTimeout(promesa, ms, msg) {
    return Promise.race([
        promesa,
        new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'timeout')), ms))
    ]);
}












let _netCache = null;  
const NET_TTL  = 6000; 

async function hayInternet() {
    
    if (_netCache && Date.now() - _netCache.ts < NET_TTL) {
        return _netCache.ok;
    }

    
    
    
    
    // Evitar 1.1.1.1/cdn-cgi/trace: en algunos entornos resuelve mal o devuelve 404 en HEAD y ensucia la consola.
    const pruebas = [
        'https://connectivitycheck.gstatic.com/generate_204',
        'https://captive.apple.com/hotspot-detect.html',
        'https://www.cloudflare.com/cdn-cgi/trace',
    ];

    for (const url of pruebas) {
        try {
            await conTimeout(
                fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' }),
                3500,
                'sin respuesta'
            );
            
            _netCache = { ok: true, ts: Date.now() };
            console.log('[red] OK via', url.split('/')[2]);
            return true;
        } catch(_) {
            
        }
    }

    _netCache = { ok: false, ts: Date.now() };
    console.log('[red] SIN INTERNET — todos los endpoints fallaron');
    return false;
}


window.addEventListener('online',  () => { _netCache = null; });
window.addEventListener('offline', () => { _netCache = { ok: false, ts: Date.now() }; });




async function initNeon() {
    if (!window.APP_CONFIG?.neon?.connectionString) {
        console.warn('[neon] APP_CONFIG no disponible — esperando config.json');
        return false;
    }
    // WebView Android: a veces hayInternet() falla con HTML remoto o file:// aunque Neon sea alcanzable.
    const esWebViewLocal = typeof window.AndroidConfig !== 'undefined';
    const tieneRed = await hayInternet();
    // En HTTPS (p. ej. GitHub Pages) los HEAD no-cors a CDNs de prueba pueden fallar por firewall/DNS
    // aunque Neon y config.json respondan; no bloquear el SDK aquí.
    const navegadorHttps =
        typeof window !== 'undefined' &&
        window.location?.protocol === 'https:' &&
        !esWebViewLocal;
    if (!tieneRed && !esWebViewLocal && !navegadorHttps) {
        console.log('[neon] sin red real — modo offline');
        NEON_OK = false;
        return false;
    }

    const versions = ['0.10.4', '0.9.5', '0.8.0'];
    /** Red móvil / WebView: import y primer SQL a Neon pueden superar 12s; esm.sh a veces tarda más que unpkg. */
    const NEON_IMPORT_MS = 22000;
    const NEON_PING_MS = 32000;
    const NEON_PING_INTENTOS = 3;
    const cdnFactories = [
        (ver) => `https://unpkg.com/@neondatabase/serverless@${ver}/index.mjs`,
        (ver) => `https://cdn.jsdelivr.net/npm/@neondatabase/serverless@${ver}/+esm`,
        (ver) => `https://esm.sh/@neondatabase/serverless@${ver}`,
    ];
    for (const ver of versions) {
        for (const mkUrl of cdnFactories) {
            const sdkUrl = mkUrl(ver);
            try {
                const mod = await conTimeout(
                    import(sdkUrl),
                    NEON_IMPORT_MS,
                    `timeout import SDK ${ver}`
                );
                const { neon, neonConfig } = mod;
                if (neonConfig) {
                    try { neonConfig.fetchEndpoint = host => `https://${host}/sql`; } catch(_){}
                    try { delete neonConfig.fetchConnectionCache; } catch(_){}
                }
                const fn = neon(window.APP_CONFIG.neon.connectionString);
                _sql = async (q) => {
                    const rows = await fn([q]);
                    if (Array.isArray(rows)) return { rows };
                    if (rows && rows.rows) return rows;
                    return { rows: [] };
                };
                let test = null;
                let pingErr = null;
                for (let intento = 0; intento < NEON_PING_INTENTOS; intento++) {
                    if (intento > 0) {
                        await new Promise((r) => setTimeout(r, 450 + intento * 750));
                    }
                    try {
                        test = await conTimeout(_sql('SELECT 1 AS ok'), NEON_PING_MS, 'timeout SELECT 1');
                        if (test && Array.isArray(test.rows)) {
                            pingErr = null;
                            break;
                        }
                        pingErr = new Error('respuesta invalida');
                    } catch (e) {
                        pingErr = e;
                    }
                }
                if (pingErr) throw pingErr;
                if (!test || !Array.isArray(test.rows)) throw new Error('respuesta invalida');
                NEON_OK = true;
                console.log(`[neon] SDK ${ver} OK via ${sdkUrl}`);
                return true;
            } catch(e) {
                console.warn(`[neon] SDK ${ver} fallo en ${sdkUrl}:`, e.message);
                _sql = null;
            }
        }
    }
    NEON_OK = false;
    return false;
}

let DIST = []; // Se carga desde Neon: tabla distribuidores

function normalizarRubroEmpresa(tipo) {
    const t = String(tipo || '').trim().toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t === 'cooperativa de agua') return 'cooperativa_agua';
    if (t === 'cooperativa_electrica' || t === 'cooperativa eléctrica' || t === 'cooperativa electrica') return 'cooperativa_electrica';
    return null;
}

function esMunicipioRubro() {
    return normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) === 'municipio';
}
function esCooperativaAguaRubro() {
    return normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) === 'cooperativa_agua';
}

/** Cierre operativo (clientes afectados): no aplica a municipio ni coop. agua; u opción explícita en configuración. */
function debeOcultarTabClientesAfectadosInfraAdmin() {
    const cfg = window.EMPRESA_CFG || {};
    const o = cfg.ocultar_modulos_redes;
    if (o === true || o === 1 || String(o).toLowerCase() === 'true' || String(o) === '1') return true;
    const r = normalizarRubroEmpresa(cfg.tipo);
    return r === 'municipio' || r === 'cooperativa_agua';
}

/** Pestaña catálogo zona: ver modules/admin-tab-distribuidores-policy.js */
function debeOcultarTabDistribuidoresAdmin() {
    return debeOcultarTabDistribuidoresAdminPolicy({ esMunicipioRubro, esCooperativaElectricaRubro });
}

function aplicarVisibilidadTabsAdminRedElectrica() {
    syncCooperativaElectricaAdminTabs({ esMunicipioRubro, esCooperativaElectricaRubro });
    try {
        syncAdminSaidiDistribTabVisibility({
            esCooperativaElectricaRubro,
            debeOcultarTabDistribuidoresAdmin,
        });
    } catch (_) {}
    try {
        syncOcultarModulosRedesRowVisibility();
        syncAyudaDistribuidoresExcelHint();
    } catch (_) {}
}


function aplicarConfiguracionJsonClienteEnEmpresaCfg(conf) {
    if (!conf || typeof conf !== 'object') return;
    const next = { ...(window.EMPRESA_CFG || {}) };
    if (conf.derivaciones && typeof conf.derivaciones === 'object') {
        next.derivaciones = conf.derivaciones;
    }
    if (conf.derivacion_reclamos && typeof conf.derivacion_reclamos === 'object') {
        next.derivacion_reclamos = conf.derivacion_reclamos;
    }
    if (conf.derivaciones_terceros && typeof conf.derivaciones_terceros === 'object') {
        next.derivaciones_terceros = conf.derivaciones_terceros;
    }
    if (Object.prototype.hasOwnProperty.call(conf, 'ocultar_modulos_redes')) {
        next.ocultar_modulos_redes = !!conf.ocultar_modulos_redes;
    }
    for (const k of ['provincia', 'state', 'provincia_nominatim']) {
        if (Object.prototype.hasOwnProperty.call(conf, k) && conf[k] != null && String(conf[k]).trim()) {
            next[k] = String(conf[k]).trim();
        }
    }
    for (const k of ['calle', 'numero', 'localidad', 'ciudad']) {
        if (Object.prototype.hasOwnProperty.call(conf, k) && conf[k] != null) {
            next[k] = String(conf[k]).trim();
        }
    }
    for (const k of ['lat_base', 'lng_base', 'coord_proy_familia', 'coord_proy_modo', 'zoom_mapa', 'logo_url']) {
        if (Object.prototype.hasOwnProperty.call(conf, k) && conf[k] != null && String(conf[k]).trim() !== '') {
            next[k] = conf[k];
        }
    }
    for (const k of ['whatsapp_ar_default_area', 'whatsapp_ar_area_prefixes', 'whatsapp_ar_areas_por_localidad']) {
        if (Object.prototype.hasOwnProperty.call(conf, k)) {
            next[k] = conf[k];
        }
    }
    next.subtitulo = GN_SUBTITULO_FIJO;
    window.EMPRESA_CFG = next;
    try {
        aplicarVisibilidadTabsAdminRedElectrica();
    } catch (_) {}
    try {
        syncDerivacionesTercerosWrap();
    } catch (_) {}
    try {
        syncDerivacionTerceroNuevoPedidoUI();
    } catch (_) {}
    try {
        sincronizarCamposWhatsappArAreaDesdeEmpresaCfg();
    } catch (_) {}
}

/** Provincia / estado para Nominatim (Argentina) desde coordenadas de la oficina. */
async function nominatimReverseProvinciaArgentina(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    await new Promise((res) => setTimeout(res, 1100));
    const backoffs = [1500, 4000, 9000, 16000, 22000];
    const maxAttempts = 5;
    try {
        if (modoOffline || typeof fetch !== 'function') return null;
        await asegurarJwtApiRest();
        const token = getApiToken();
        if (!token) return null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const r = await fetch(apiUrl('/api/geocode/nominatim/reverse'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ lat: la, lon: lo, zoom: 8 }),
            });
            const rateLimited = r.status === 503 || r.status === 429;
            if (r.ok) {
                const j = await r.json().catch(() => null);
                const hit = j && j.result;
                const a = hit && hit.address;
                if (!a || typeof a !== 'object') return null;
                const state = a.state || a.region || a['ISO3166-2-lvl4'];
                const s = state != null ? String(state).trim() : '';
                return s.length >= 2 ? s : null;
            }
            if (rateLimited && attempt < maxAttempts - 1) {
                console.info(
                    '[geocode-proxy] reverse HTTP',
                    r.status,
                    'reintento',
                    attempt + 1,
                    '/',
                    maxAttempts - 1,
                    'espera',
                    backoffs[attempt],
                    'ms'
                );
                await new Promise((res) => setTimeout(res, backoffs[attempt]));
                continue;
            }
            if (rateLimited) {
                console.warn('[geocode-proxy] reverse agotó reintentos (503/429) lat/lng oficina');
                return null;
            }
            console.warn('[geocode-proxy] reverse HTTP', r.status);
            return null;
        }
        return null;
    } catch (_) {
        return null;
    }
}

/**
 * Clic en mapa → reverse Nominatim al formulario nuevo pedido (no shift).
 * Cualquier usuario con sesión + API base (JWT en el fetch); no solo admin — la ruta `/api/geocode` ya exige auth.
 * Acepta lat/lng numéricos o string (WebView/Leaflet).
 */
function debeReverseNominatimAdminMapTap(e) {
    try {
        if (modoOffline || typeof fetch !== 'function') return false;
        if (!getApiBaseUrl()) return false;
        if (!app?.u?.id) return false;
        if (e?.originalEvent?.shiftKey) return false;
        const ll = e?.latlng;
        if (!ll) return false;
        const lat = Number(ll.lat);
        const lng = Number(ll.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Clic en mapa → reverse Nominatim vía API → rellena calle/número/localidad/ref del formulario nuevo pedido.
 * Shift+clic mantiene el comportamiento anterior (abrir ubicación para nuevo pedido).
 * Siempre devuelve false (no corta el flujo del mapa); el reverse se programa en el siguiente tick.
 */
function aplicarReverseMapaAdminDesdeClicInicio(e) {
    try {
        if (!debeReverseNominatimAdminMapTap(e)) return false;
        const ll = e.latlng;
        programarReverseNominatimFormularioNuevoPedidoDesdeMapa(Number(ll.lat), Number(ll.lng));
        return false;
    } catch (_) {
        return false;
    }
}

if (typeof window !== 'undefined') {
    window.aplicarReverseMapaAdminDesdeClicInicio = aplicarReverseMapaAdminDesdeClicInicio;
    window.debeReverseNominatimAdminMapTap = debeReverseNominatimAdminMapTap;
}

/**
 * Persiste lat/lng base de oficina en la API (p. ej. admin en web sin Neon): complementa INSERT en `ubicaciones_usuarios`.
 */
async function persistirUbicacionBaseAdministradorApi(lat, lng) {
    if (!esAdmin() || modoOffline || typeof fetch !== 'function') return false;
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
    try {
        await asegurarJwtApiRest();
        const token = getApiToken();
        if (!token) return false;
        const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ latitud: la, longitud: lo }),
        });
        if (!resp.ok) return false;
        const ec = window.EMPRESA_CFG || {};
        window.EMPRESA_CFG = {
            ...ec,
            latitud: String(la),
            longitud: String(lo),
            lat_base: String(la),
            lng_base: String(lo),
        };
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Guarda provincia/state en clientes.configuracion (API) según lat/lng de la oficina.
 * No pisa el campo del formulario si el admin ya escribió una provincia.
 */
async function actualizarProvinciaTenantDesdeCoords(lat, lng) {
    if (!esAdmin() || modoOffline || typeof fetch !== 'function') return null;
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    try {
        const prov = await nominatimReverseProvinciaArgentina(la, lo);
        if (!prov) return null;
        await asegurarJwtApiRest();
        const token = getApiToken();
        if (!token) return null;
        const inp = document.getElementById('cfg-provincia-nominatim');
        if (inp && String(inp.value || '').trim().length >= 2) return String(inp.value).trim();
        const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                configuracion: { provincia: prov, state: prov, provincia_nominatim: prov },
            }),
        });
        if (!resp.ok) return null;
        const ec = window.EMPRESA_CFG || {};
        window.EMPRESA_CFG = { ...ec, provincia: prov, state: prov, provincia_nominatim: prov };
        if (inp) inp.value = prov;
        return prov;
    } catch (_) {
        return null;
    }
}

function initCommunityBroadcastFab() {
    initGnCommunityBroadcastFab({
        esAdmin,
        getApiToken,
        asegurarJwtApiRest,
        apiUrl,
    });
}

/**
 * GET `/api/clientes/mi-configuracion` (cualquier rol con JWT): el servidor fija `tenant_id` desde la BD
 * (`getUserTenantId`), igual que el admin web tras un cambio de tenant; alinea sesión si Neon WebView leyó mal.
 */
async function fetchMiConfiguracionYAplicarEnEmpresaCfg() {
    if (!getApiToken() || !app?.u) return;
    try {
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) return;
        const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const cli = data?.cliente;
        let empresaMt = false;
        try {
            empresaMt = !!(NEON_OK && _sql && (await neonPedidosTieneColumnaTenantId()));
        } catch (_) {}
        const apiTid = Number(data?.tenant_id ?? cli?.id);
        let neonUserTid = null;
        if (empresaMt && app?.u?.id) {
            try {
                neonUserTid = await leerTenantIdUsuarioDesdeNeon(Number(app.u.id));
            } catch (_) {}
        }
        const jwtVsNeonMismatch =
            empresaMt &&
            neonUserTid != null &&
            Number.isFinite(apiTid) &&
            apiTid > 0 &&
            neonUserTid !== apiTid;
        if (jwtVsNeonMismatch) {
            try {
                console.warn(
                    '[mi-cfg] Neon WebView usuarios ≠ tenant API; se usa tenant de la API (getUserTenantId / mismo criterio que admin web)'
                );
            } catch (_) {}
            try {
                app.u.tenant_id = apiTid;
                try {
                    delete app.u.tenantId;
                } catch (_) {}
                try {
                    localStorage.setItem('pmg', JSON.stringify(app.u));
                } catch (_) {}
                try {
                    if (window.AndroidSession && typeof AndroidSession.setTenantId === 'function') {
                        AndroidSession.setTenantId(apiTid);
                    }
                } catch (_) {}
            } catch (_) {}
            try {
                invalidatePedidosTenantSqlCache();
            } catch (_) {}
            try {
                await intentarRefrescarJwtDesdeCredencialesGuardadas();
            } catch (_) {}
            try {
                await refrescarEmpresaDesdeClienteNeonPorTenantActual();
            } catch (_) {}
            try {
                initCommunityBroadcastFab();
            } catch (_) {}
            /** Seguir: aplicar `data.cliente` de la API (no cortar). */
        }
        let conf = data?.cliente?.configuracion;
        if (typeof conf === 'string') {
            try {
                conf = JSON.parse(conf);
            } catch {
                conf = {};
            }
        }
        aplicarConfiguracionJsonClienteEnEmpresaCfg(conf && typeof conf === 'object' ? conf : {});
        if (cli && typeof cli === 'object') {
            window.EMPRESA_CFG = {
                ...(window.EMPRESA_CFG || {}),
                tipo: cli.tipo != null ? cli.tipo : window.EMPRESA_CFG?.tipo,
                active_business_type: cli.active_business_type != null ? cli.active_business_type : window.EMPRESA_CFG?.active_business_type,
            };
        }
        try {
            initCommunityBroadcastFab();
        } catch (_) {}
        try {
        } catch (_) {}
    } catch (_) {}
}


const TIPOS_RECLAMO_SOLICITUD_DERIVACION_TERCERO = new Set([
    'cables caídos/peligro',
    'poste inclinado/dañado',
    'alumbrado público',
    'alumbrado público (mantenimiento)',
    'riesgo en la vía pública',
    'riesgo vía pública',
    'corrimiento de poste/columna',
    'vandalismo',
    'disturbios',
    'violencia de género',
    'desorden en la vía pública',
    'otro problema de orden público',
]);

function _gnNormTipoDerivacion(tt) {
    return String(tt || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\s*\/\s*/g, '/')
        .trim();
}

/** Coincide con API `tipoPermiteSolicitudDerivacionTerceroCoopElectrica` (variantes de texto en Neon). */
function tipoPermiteSolicitudDerivacionTercero(tt) {
    const n = _gnNormTipoDerivacion(tt);
    if (!n) return false;
    for (const allowed of TIPOS_RECLAMO_SOLICITUD_DERIVACION_TERCERO) {
        const a = _gnNormTipoDerivacion(allowed);
        if (!a) continue;
        if (n === a || n.includes(a) || a.includes(n)) return true;
    }
    if (/\bcables?\b/.test(n) && (/\bca[iy]d\w*\b/.test(n) || /\bpeligro\b/.test(n))) return true;
    if (/\bposte\b/.test(n) && (/\binclinad\w*\b/.test(n) || /\bdan\w*\b/.test(n))) return true;
    if (/\balumbrado\b/.test(n) && (/\bpublic\w*\b/.test(n) || /\bmantenim\w*\b/.test(n) || /\bluz\b/.test(n))) return true;
    if (/\briesgo\b/.test(n) && (/\bvia\b/.test(n) || /\bpublic\w*\b/.test(n) || /\bcalle\b/.test(n))) return true;
    if (/\bcorrimiento\b/.test(n) && (/\bposte\b/.test(n) || /\bcolumna\b/.test(n))) return true;
    if (/\borden\s*public\w*\b/.test(n) || /\bvandalismo\b/.test(n) || /\bdisturbio\b/.test(n) || /\bviolencia\b/.test(n)) return true;
    return false;
}

/** `norm` usa `tt`; detalle puede traer solo `tipo_trabajo`. */
function _gnTipoTrabajoPedidoDerivacion(p) {
    if (!p) return '';
    const a = p.tt != null && String(p.tt).trim() !== '' ? String(p.tt).trim() : '';
    if (a) return a;
    return String(p.tipo_trabajo || '').trim();
}

function debeMostrarBotonDerivacion(pOrTipo) {
    const tt =
        pOrTipo != null && typeof pOrTipo === 'object'
            ? _gnTipoTrabajoPedidoDerivacion(pOrTipo)
            : String(pOrTipo || '').trim();
    return tipoPermiteSolicitudDerivacionTercero(tt);
}
window.debeMostrarBotonDerivacion = debeMostrarBotonDerivacion;

/** Técnico/supervisor asignado: solicitud de derivación (todos los rubros cuando el tipo encaja). */
/** Distribuidor (eléctrica) | Ramal (agua) | Barrio (municipio). */
function etiquetaZonaPedido() {
    if (esMunicipioRubro()) return 'Barrio';
    if (esCooperativaAguaRubro()) return 'Ramal';
    return 'Distribuidor';
}
function valorZonaPedidoUI(p) {
    const br = String(p?.br || '').trim();
    const dis = String(p?.dis || '').trim();
    if (esMunicipioRubro()) return br || dis || '';
    return dis || br || '';
}

/** Municipio → vecino; cooperativas → socio (etiquetas UI / impresión). */
function etiquetaFirmaPersona() {
    return String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio' ? 'vecino' : 'socio';
}
function etiquetaCampoClientePedido() {
    return String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio' ? 'Vecino' : 'Cliente';
}

function poblarSelectTiposReclamo() {
    const st = document.getElementById('tt');
    if (!st) return;
    const prev = st.value;
    const lista = tiposReclamoSeleccionables();
    st.innerHTML = '';
    lista.forEach(t => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        st.appendChild(o);
    });
    if (prev && lista.includes(prev)) st.value = prev;
    else     if (lista.length) st.selectedIndex = 0;
    syncNisClienteReclamoConexionUI();
    syncSuministroElectricoUI();
    syncPrioridadConTipoReclamo();
    try {
        syncChecklistSeguridadCierreLabels();
    } catch (_) {}
    try {
        syncDerivacionTerceroNuevoPedidoUI();
    } catch (_) {}
}

const MATERIAL_UNIDADES = ['PZA','MTR','LTR','KG','M3','M2','ML','JGO','UN','BOL','TN','BOB','TR','CJ','PAR','KIT','TAM'];

const CN = new Set(['numero_pedido','fecha_creacion','fecha_cierre','distribuidor','trafo','barrio',
    'cliente','tipo_trabajo','descripcion','prioridad','estado','avance','lat','lng',
    'usuario_id','usuario_creador_id','usuario_inicio_id','usuario_cierre_id','usuario_avance_id',
    'trabajo_realizado','tecnico_cierre','foto_base64','x_inchauspe','y_inchauspe',
    'fecha_avance','foto_cierre','nis_medidor','tecnico_asignado_id','fecha_asignacion','firma_cliente','checklist_seguridad','telefono_contacto',
    'cliente_nombre','cliente_direccion','cliente_calle','cliente_numero_puerta','cliente_localidad','provincia','codigo_postal',
    'suministro_tipo_conexion','suministro_fases',
    'derivado_externo','derivado_a','derivado_destino_nombre','fecha_derivacion','usuario_derivacion_id','derivacion_nota','derivacion_mensaje_snapshot',
    'solicitud_derivacion_pendiente','solicitud_derivacion_fecha','solicitud_derivacion_usuario_id','solicitud_derivacion_motivo','solicitud_derivacion_destino_sugerido']);

const app = {
    u: null,
    apiToken: null,
    p: [],
    map: null,
    mk: [],
    sel: null,
    tab: 'p',
    cid: null,
    ok: false
};
registrarAppGlobal(app);
try {
    installPedidoFormularioGlobalHooks();
} catch (_) {}

function normalizarRolStr(r) {
    const x = String(r == null ? '' : r)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (x === 'administrador') return 'admin';
    if (x === 'supervisor') return 'tecnico';
    return x || 'tecnico';
}
function getApiBaseUrl() {
    const fromCfg = String(window.APP_CONFIG?.api?.baseUrl || '').trim();
    if (!fromCfg) return '';
    return fromCfg.replace(/\/+$/, '');
}
function apiUrl(path) {
    const p = String(path || '');
    const base = getApiBaseUrl();
    if (!base) return p;
    return base + (p.startsWith('/') ? p : '/' + p);
}
window.apiUrl = apiUrl;
/** Tras cerrar por SQL directo (Neon), dispara el aviso WA en la API sin bloquear la UI. */
async function notificarCierreWhatsappApi(pedidoId, telefonoOverride) {
    if (modoOffline) return;
    const base = getApiBaseUrl();
    if (!base || pedidoId == null) return;
    await asegurarJwtApiRest();
    const tok = getApiToken() || app.apiToken;
    if (!tok) return;
    const pid = Number(pedidoId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
        const body = telefonoOverride ? { telefono_contacto: telefonoOverride } : {};
        const resp = await fetch(apiUrl(`/api/pedidos/${pid}/notify-cierre-whatsapp`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            const t = await resp.text();
            console.warn('[wa-cierre] API', resp.status, t.slice(0, 200));
        }
    } catch (e) {
        console.warn('[wa-cierre]', e && e.message);
    }
}

/** La API Node (JWT) es independiente de Neon en el cliente: no usar NEON_OK aquí. */
function puedeEnviarApiRestPedidos() {
    return !modoOffline && !!getApiBaseUrl() && !!getApiToken();
}

/** Reobtiene JWT con la contraseña guardada en pmg_offline_user (mismo login que offline). */
async function intentarRefrescarJwtDesdeCredencialesGuardadas() {
    if (modoOffline || !getApiBaseUrl() || !app.u || !app.u.email) return false;
    let pw = null;
    try {
        const lista = JSON.parse(localStorage.getItem(OU_KEY) || '[]');
        const entry = lista.find(u => u.email === app.u.email && u._pw);
        pw = entry && entry._pw;
    } catch (_) {}
    if (!pw) return false;
    const data = await loginApiJwt(app.u.email, pw);
    return !!(data && data.token);
}

async function asegurarJwtApiRest() {
    if (modoOffline || !getApiBaseUrl()) return false;
    if (getApiToken()) return true;
    return await intentarRefrescarJwtDesdeCredencialesGuardadas();
}

async function pedidoPutApi(id, body) {
    const base = getApiBaseUrl();
    if (!base || modoOffline) return null;
    await asegurarJwtApiRest();
    let tok = getApiToken();
    if (!tok) return null;
    const pid = parseInt(id, 10);
    if (!Number.isFinite(pid) || pid <= 0 || String(id).startsWith('off_')) return null;
    const url = apiUrl(`/api/pedidos/${pid}`);
    const opts = () => ({
        method: 'PUT',
        headers: { Authorization: `Bearer ${getApiToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    try {
        let resp = await fetch(url, opts());
        if (resp.status === 401) {
            await intentarRefrescarJwtDesdeCredencialesGuardadas();
            if (getApiToken()) resp = await fetch(url, opts());
        }
        if (!resp.ok) {
            const t = await resp.text();
            console.warn('[pedido-put-api]', resp.status, t.slice(0, 400));
            return null;
        }
        return await resp.json();
    } catch (e) {
        console.warn('[pedido-put-api]', e && e.message);
        return null;
    }
}

try {
    window.pedidoPutApi = pedidoPutApi;
} catch (_) {}

async function notificarWhatsappClienteEventoApi(pedidoId, event) {
    if (modoOffline) return;
    const base = getApiBaseUrl();
    if (!base || pedidoId == null) return;
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    const pid = Number(pedidoId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
        const resp = await fetch(apiUrl(`/api/pedidos/${pid}/whatsapp-aviso-cliente`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ event }),
        });
        if (!resp.ok) {
            const t = await resp.text();
            console.warn('[wa-cliente-event]', resp.status, t.slice(0, 200));
        }
    } catch (e) {
        console.warn('[wa-cliente-event]', e && e.message);
    }
}

/** Aviso WA al cliente: reclamo recién cargado (INSERT vía Neon + JWT). */
async function notificarAltaReclamoWhatsappApi(pedidoId) {
    if (modoOffline) return;
    const base = getApiBaseUrl();
    if (!base || pedidoId == null) return;
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    const pid = Number(pedidoId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
        const resp = await fetch(apiUrl(`/api/pedidos/${pid}/notify-alta-cliente-whatsapp`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        if (!resp.ok) {
            const t = await resp.text();
            console.warn('[wa-alta-reclamo]', resp.status, t.slice(0, 200));
        }
    } catch (e) {
        console.warn('[wa-alta-reclamo]', e && e.message);
    }
}
async function loginApiJwt(email, password) {
    try {
        const { resp, data } = await fetchAuthLoginApi(email, password, apiUrl, fetch);
        if (resp.status === 403 && data?.code === 'must_change_password') {
            return { must_change_password: true, user_id: data.user_id, user: data };
        }
        if (!resp.ok || !data?.token) {
            try {
                console.warn(
                    '[login] API',
                    resp.status,
                    data?.code || '',
                    (data?.error || '').slice(0, 120)
                );
            } catch (_) {}
            return {
                _loginFailed: true,
                status: resp.status,
                code: data?.code,
                message: data?.error,
                tenant_ids: data?.tenant_ids,
            };
        }
        app.apiToken = String(data.token);
        try {
            localStorage.setItem('pmg_api_token', app.apiToken);
        } catch (_) {}
        try {
            const du = data.user;
            if (du && app?.u && String(app.u.email || '').toLowerCase() === String(du.email || '').toLowerCase()) {
                if (du.tenant_id != null) {
                    const n = Number(du.tenant_id);
                    if (Number.isFinite(n) && n > 0) {
                        app.u.tenant_id = n;
                        try {
                            delete app.u.tenantId;
                        } catch (_) {}
                        try {
                            localStorage.setItem('pmg', JSON.stringify(app.u));
                        } catch (_) {}
                    }
                }
            }
        } catch (_) {}
        /** Devuelve `data` para que el login (p. ej. técnico Android) fusione `user.tenant_id` antes de `entrarConUsuario`. La API usa getUserTenantId (BD), misma fuente que el admin web. */
        return data;
    } catch (e) {
        if (e && e.name === 'AbortError') console.warn('[login] API JWT timeout — continuando sin token');
        else {
            try {
                console.warn('[login] API red:', e && e.message ? e.message : e);
            } catch (_) {}
        }
        return { _loginFailed: true, network: true, message: e && e.message ? e.message : 'red' };
    }
}

/** Login API sin mutar `app.u` (p. ej. modal «tenant técnico» en la pantalla de login Android). */
async function authLoginApiRetornarTokenUser(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '');
    if (!em || !pw) return null;
    try {
        const { resp, data } = await fetchAuthLoginApi(em, pw, apiUrl, fetch);
        if (!resp.ok || !data?.token || !data?.user) return null;
        return { token: String(data.token), user: data.user };
    } catch (_) {
        return null;
    }
}

async function apiSetupTechnicianPostAttach(apiToken, techKey, tenantId, fromTenantId) {
    const k = String(techKey || '').trim();
    const tid = Number(tenantId);
    const body = { tenant_id: tid };
    const fromT = Number(fromTenantId);
    if (Number.isFinite(fromT) && fromT > 0) body.from_tenant_id = fromT;
    const headers = { 'Content-Type': 'application/json', 'X-GestorNova-Technician-Key': k };
    if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
    const r = await fetch(apiUrl('/api/setup/technician/attach-tenant'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw new Error([j.error, j.detail, j.hint].filter(Boolean).join(' — ') || `HTTP ${r.status}`);
    }
    return j;
}

function wizardPoblarSelectTenantsClientes(selEl, clientes) {
    if (!selEl) return;
    selEl.innerHTML = '';
    (clientes || []).forEach((c) => {
        const o = document.createElement('option');
        o.value = String(c.id);
        const nom = String(c.nombre || '').trim() || '—';
        const tip = String(c.tipo || '').trim() || '—';
        o.textContent = `${c.id} — ${nom} (${tip})`;
        selEl.appendChild(o);
    });
}

/** Login vía API sin guardar token ni tocar `app.u` (p. ej. reabrir asistente con credenciales de admin). */
async function verificarLoginSoloAdminSinPersistir(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '');
    try {
        const { resp, data } = await fetchAuthLoginApi(em, pw, apiUrl, fetch);
        if (!resp.ok) return { ok: false, error: 'Usuario o contraseña incorrectos' };
        const rol = normalizarRolStr(data.user?.rol || '');
        if (rol !== 'admin') return { ok: false, error: 'Solo un administrador puede reabrir el asistente.' };
        return { ok: true };
    } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, error: 'Tiempo de espera agotado' };
        return { ok: false, error: 'No se pudo verificar con el servidor' };
    }
}

const GESTORNOVA_LS_PULSE = 'gestornova_ls_pulse';
const GESTORNOVA_ONBOARDING_DONE = 'gestornova_onboarding_done';
/** Primera vez del asistente solo en navegador / PWA (no WebView empaquetado). */
const PMG_ONBOARDING_WEB_DONE = 'pmg_onboarding_web_done';
let _gnWizardEsReapertura = false;

function esGestorNovaWebPublico() {
    return typeof window.AndroidConfig === 'undefined';
}

function onboardingWebMarcadoCompletado() {
    try {
        if (localStorage.getItem(PMG_ONBOARDING_WEB_DONE) === '1') return true;
        if (localStorage.getItem(GESTORNOVA_ONBOARDING_DONE) === '1') return true;
    } catch (_) {}
    return false;
}

function limpiarPersistenciaClienteGestorNovaMigracionV2() {
    try {
        if (typeof localStorage === 'undefined') return;
        if (localStorage.getItem(GESTORNOVA_LS_PULSE) === '2') return;
        const quitar = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || k === GESTORNOVA_LS_PULSE) continue;
            if (
                k.startsWith('pmg') ||
                k === 'gestornova_saved_login' ||
                k === 'ultima_ubicacion' ||
                k === GESTORNOVA_ONBOARDING_DONE
            ) {
                quitar.push(k);
            }
        }
        quitar.forEach((k) => {
            try {
                localStorage.removeItem(k);
            } catch (_) {}
        });
        try {
            sessionStorage.clear();
        } catch (_) {}
        try {
            app.apiToken = null;
        } catch (_) {}
        localStorage.setItem(GESTORNOVA_LS_PULSE, '2');
    } catch (_) {}
}

function aplicarCapaOnboardingVsLoginInicial() {
    try {
        const gw = document.getElementById('gw');
        const ls = document.getElementById('ls');
        if (!gw || !ls) return;
        if (!esGestorNovaWebPublico()) {
            gw.classList.remove('active');
            ls.classList.add('active');
            _gnWizardEsReapertura = false;
            sincronizarTextosBotonesWizardOnboarding();
            return;
        }
        if (onboardingWebMarcadoCompletado()) {
            gw.classList.remove('active');
            ls.classList.add('active');
        } else {
            ls.classList.remove('active');
            gw.classList.add('active');
            _gnWizardEsReapertura = false;
            sincronizarTextosBotonesWizardOnboarding();
        }
    } catch (_) {}
    try {
        actualizarVisibilidadBotonTenantTecnicoLogin();
    } catch (_) {}
}

function sincronizarTextosBotonesWizardOnboarding() {
    try {
        const p = document.getElementById('wizard-btn-primary');
        const sec = document.getElementById('wizard-btn-secondary');
        if (!p || !sec) return;
        if (_gnWizardEsReapertura) {
            p.innerHTML = '<i class="fas fa-check"></i> Listo';
            sec.style.display = 'block';
        } else {
            p.innerHTML = '<i class="fas fa-arrow-right"></i> Ir al inicio de sesión';
            sec.style.display = 'none';
        }
    } catch (_) {}
}

function cerrarVistaWizardMostrarLogin() {
    try {
        _gnWizardEsReapertura = false;
        const gw = document.getElementById('gw');
        const ls = document.getElementById('ls');
        gw?.classList.remove('active');
        ls?.classList.add('active');
        sincronizarTextosBotonesWizardOnboarding();
        try {
            if (sesionCompletaParaMarcaLogin()) {
                hydrateBrandingForPublicScreen();
                aplicarMarcaVisualCompleta();
            } else {
                pintarCabeceraLoginWizardGenerica();
            }
        } catch (_) {}
    } catch (_) {}
    try {
        actualizarVisibilidadBotonTenantTecnicoLogin();
    } catch (_) {}
}
window.cerrarVistaWizardMostrarLogin = cerrarVistaWizardMostrarLogin;

function finalizarOnboardingPrimeraVezGestorNova() {
    try {
        if (esGestorNovaWebPublico()) {
            localStorage.setItem(PMG_ONBOARDING_WEB_DONE, '1');
            localStorage.setItem(GESTORNOVA_ONBOARDING_DONE, '1');
        }
    } catch (_) {}
    cerrarVistaWizardMostrarLogin();
}

function onWizardPrimaryClick() {
    if (_gnWizardEsReapertura) cerrarVistaWizardMostrarLogin();
    else finalizarOnboardingPrimeraVezGestorNova();
}

function abrirModalReabrirAsistenteAdmin() {
    try {
        const m = document.getElementById('modal-reabrir-asistente');
        const pw = document.getElementById('reabrir-asistente-pw');
        const em = document.getElementById('reabrir-asistente-em');
        if (pw) pw.value = '';
        if (em) em.value = '';
        m?.classList.add('active');
    } catch (_) {}
}
window.abrirModalReabrirAsistenteAdmin = abrirModalReabrirAsistenteAdmin;

function cerrarModalReabrirAsistente() {
    document.getElementById('modal-reabrir-asistente')?.classList.remove('active');
}
window.cerrarModalReabrirAsistente = cerrarModalReabrirAsistente;

async function confirmarReabrirAsistenteConCredenciales(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const em = (document.getElementById('reabrir-asistente-em')?.value || '').trim();
    const pw = document.getElementById('reabrir-asistente-pw')?.value || '';
    const err = document.getElementById('reabrir-asistente-err');
    if (err) err.textContent = '';
    if (!em || !pw) {
        if (err) err.textContent = 'Completá usuario y contraseña de administrador.';
        return;
    }
    const btn = document.getElementById('reabrir-asistente-submit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';
    }
    try {
        const r = await verificarLoginSoloAdminSinPersistir(em, pw);
        if (!r.ok) {
            if (err) err.textContent = r.error || 'No autorizado';
            return;
        }
        cerrarModalReabrirAsistente();
        _gnWizardEsReapertura = true;
        const gw = document.getElementById('gw');
        const ls = document.getElementById('ls');
        gw?.classList.add('active');
        ls?.classList.remove('active');
        sincronizarTextosBotonesWizardOnboarding();
    } catch (e) {
        if (err) err.textContent = String(e?.message || e) || 'Error';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Abrir asistente';
        }
    }
}
window.confirmarReabrirAsistenteConCredenciales = confirmarReabrirAsistenteConCredenciales;

function getApiToken() {
    if (app.apiToken) return app.apiToken;
    try {
        const t = localStorage.getItem('pmg_api_token');
        if (t) {
            app.apiToken = t;
            return t;
        }
    } catch (_) {}
    return null;
}
window.getApiToken = getApiToken;

/** API Render: geocerca, chat interno y fotos clasificadas (ver docs/PLAN_TOP3_COOPERATIVA_GEOCERCA_CHAT_FOTOS.md). */
async function gnOperativaFetch(path, opts = {}) {
    const tok = getApiToken();
    if (!tok) throw new Error('Sin token API (iniciá sesión con backend activo).');
    const r = await fetch(apiUrl(path), {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tok}`,
            ...(opts.headers || {}),
        },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || r.statusText || 'Error API');
    return j;
}
window.gnOperativaGeocercaVerificar = async function (pedidoId, lat, lng) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/geocerca/verificar`, {
        method: 'POST',
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng) }),
    });
};
window.gnOperativaGeocercaEventos = async function (pedidoId) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/geocerca/eventos`, { method: 'GET' });
};
window.gnOperativaChatListar = async function (pedidoId) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/chat-interno/mensajes`, { method: 'GET' });
};
window.gnOperativaChatEnviar = async function (pedidoId, cuerpo) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/chat-interno/mensajes`, {
        method: 'POST',
        body: JSON.stringify({ cuerpo: String(cuerpo || '').trim() }),
    });
};
window.gnOperativaFotosListar = async function (pedidoId) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/fotos-clasificadas`, { method: 'GET' });
};
/** tipo: antes | despues | otro — fotosBase64: string[] data URLs */
window.gnOperativaFotosSubir = async function (pedidoId, tipo, fotosBase64) {
    const id = parseInt(pedidoId, 10);
    const arr = Array.isArray(fotosBase64) ? fotosBase64 : [];
    return gnOperativaFetch(`/api/pedidos/${id}/fotos-clasificadas`, {
        method: 'POST',
        body: JSON.stringify({ tipo: String(tipo || 'otro').toLowerCase(), fotos_base64: arr }),
    });
};
window.gnOperativaTenantGeocercaGet = async function () {
    return gnOperativaFetch('/api/tenant-operativa/geocerca-settings', { method: 'GET' });
};
window.gnOperativaTenantGeocercaPut = async function (habilitada, radioMetros) {
    return gnOperativaFetch('/api/tenant-operativa/geocerca-settings', {
        method: 'PUT',
        body: JSON.stringify({
            habilitada: habilitada !== false,
            radio_metros: Number(radioMetros) || 100,
        }),
    });
};
/**
 * Android: pide GPS y llama callback(json). En navegador usa navigator.geolocation si existe.
 * callbackName ejemplo: "window.__gnGeoCb"
 */
function gnOperativaInvokeCallback(callbackPath, payload) {
    const raw = String(callbackPath || '').trim();
    if (!raw) return;
    const path = raw.startsWith('window.') ? raw.slice(7) : raw;
    try {
        const segs = path.split('.').filter(Boolean);
        let o = window;
        for (const s of segs) o = o?.[s];
        if (typeof o === 'function') o(payload);
    } catch (_) {}
}
window.gnOperativaObtenerUbicacionDispositivo = function (callbackName) {
    const cb = String(callbackName || '').trim();
    if (!/^[a-zA-Z0-9_.]+$/.test(cb)) return;
    try {
        if (window.AndroidDevice && typeof window.AndroidDevice.getCurrentLocationForGeocerca === 'function') {
            window.AndroidDevice.getCurrentLocationForGeocerca(cb);
            return;
        }
    } catch (_) {}
    if (!navigator.geolocation) {
        gnOperativaInvokeCallback(cb, { ok: false, error: 'sin_geolocation' });
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => {
            gnOperativaInvokeCallback(cb, {
                ok: true,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
            });
        },
        () => {
            gnOperativaInvokeCallback(cb, { ok: false, error: 'denied_or_unavailable' });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
};

function rolApp() {
    return app.u ? normalizarRolStr(app.u.rol) : '';
}
function esAdmin() {
    return rolApp() === 'admin';
}
function esTecnicoOSupervisor() {
    return rolApp() === 'tecnico';
}
/**
 * Técnico/supervisor con «Todos»: fuente de verdad = checkbox y select Android (evita WebView/localStorage desfasados),
 * luego localStorage.
 */
function leerVerTodosPedidosTecnico() {
    if (!esTecnicoOSupervisor()) return false;
    try {
        const chk = document.getElementById('toggle-ver-todos-pedidos');
        if (chk && chk.checked) return true;
        const sel = document.getElementById('sel-android-pedidos-scope');
        if (sel && sel.value === 'todos') return true;
    } catch (_) {}
    try {
        return localStorage.getItem('pmg_tecnico_ver_todos') === '1';
    } catch (_) {
        return false;
    }
}

/** Alias semántico para el panel (misma lógica que la consulta SQL en cargarPedidos). */
function tecnicoPideVerTodosPedidosEmpresa() {
    return leerVerTodosPedidosTecnico();
}
function esAndroidWebViewMapa() {
    try {
        return /GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:';
    } catch (_) {
        return false;
    }
}

if (typeof window !== 'undefined') window.esAdmin = esAdmin;
if (typeof window !== 'undefined') window.esTecnicoOSupervisor = esTecnicoOSupervisor;
if (typeof window !== 'undefined') { window._gnSqlSimple = sqlSimple; window._gnEsc = esc; window._gnTenantId = () => tenantIdActual(); }

/** Admin en navegador (GitHub Pages / PWA), no en WebView empaquetado. */
function esAdminSesionWebPublica() {
    try {
        return esAdmin() && !esAndroidWebViewMapa();
    } catch (_) {
        return false;
    }
}

/** Marca por defecto hasta que el admin complete el setup inicial en servidor (setup_wizard_completado). */
const BRAND_DEFAULT_NAME = 'GestorNova';
/** Subtítulo fijo del producto (login, wizard, informes); no se personaliza por tenant. */
const GN_SUBTITULO_FIJO = 'Sistema de gestión de pedidos y reclamos';
/** Versión de la interfaz web/PWA (la app Android muestra la versión nativa en Acerca de). */
const GN_VERSION_WEB = '2.0';

/** Persiste nombre/logo/subtítulo entre sesiones (incl. tras cerrar sesión en la web pública). */
const PMG_BRANDING_LS_KEY = 'pmg_tenant_branding_v1';

/**
 * Firma de identidad `nombre|rubro` (normalizado) en localStorage para comparar antes de guardar.
 * Se sincroniza desde `EMPRESA_CFG`/formulario admin al cargar config (cargarConfigEmpresa / cargarFormEmpresa)
 * y al guardar con éxito; si cambia respecto del valor persistido se vacían socios/derivaciones (sin confirm).
 */
const PMG_TENANT_IDENTITY_SIG_LS = 'pmg_tenant_identity_sig_v1';

function firmaIdentidadTenant(nombre, tipo) {
    const n = String(nombre || '').trim().toLowerCase();
    const t = normalizarRubroEmpresa(String(tipo || '').trim());
    return `${n}|${t}`;
}

function leerFirmaIdentidadAlmacenada() {
    try {
        return String(localStorage.getItem(PMG_TENANT_IDENTITY_SIG_LS) || '');
    } catch (_) {
        return '';
    }
}

function sincronizarFirmaIdentidadTenantDesdeValores(nombre, tipo) {
    try {
        localStorage.setItem(PMG_TENANT_IDENTITY_SIG_LS, firmaIdentidadTenant(nombre, tipo));
    } catch (_) {}
}

/** Logo por defecto embebido (evita 404 de branding/*.png en GitHub Pages). */
const BRANDING_DEFAULT_LOGO_DATA_URL =
    'data:image/svg+xml,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#2563eb"/><text x="24" y="33" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="13" font-weight="700">GN</text></svg>'
    );

function basePathAssets() {
    try {
        let p = window.location.pathname || '/';
        if (p === '/' || p === '') return '/';
        if (!p.endsWith('/')) {
            const lastSeg = p.split('/').pop() || '';
            if (lastSeg.includes('.')) {
                p = p.slice(0, p.lastIndexOf('/') + 1);
            } else {
                p = p + '/';
            }
        }
        return p;
    } catch (_) {
        return '/';
    }
}

function defaultGestorNovaLogoUrl() {
    try {
        const base = basePathAssets();
        const rel = (base && base !== '/' ? base : '') + 'gestornova-logo.png';
        return rel || 'gestornova-logo.png';
    } catch (_) {
        return BRANDING_DEFAULT_LOGO_DATA_URL;
    }
}

function persistTenantBrandingCache(extra) {
    try {
        const b = window.__PMG_TENANT_BRANDING__ || {};
        const tidSnap = app?.u != null ? Number(app.u.tenant_id ?? app.u.tenantId) : NaN;
        const o = {
            setup_wizard_completado: !!b.setup_wizard_completado,
            marca_publicada_admin: !!b.marca_publicada_admin,
            nombre_cliente: String(b.nombre_cliente || '').trim(),
            logo_url: String(b.logo_url || '').trim(),
            tipo: String(b.tipo || '').trim(),
            subtitulo: GN_SUBTITULO_FIJO,
            from_local_cache: !!b.from_local_cache,
            ...(Number.isFinite(tidSnap) && tidSnap > 0 ? { tenant_id_snapshot: tidSnap } : {}),
        };
        localStorage.setItem(PMG_BRANDING_LS_KEY, JSON.stringify(o));
    } catch (_) {}
}

function loadTenantBrandingCache() {
    try {
        const raw = localStorage.getItem(PMG_BRANDING_LS_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        return o && typeof o === 'object' ? o : null;
    } catch (_) {
        return null;
    }
}

/** Solo con sesión API + usuario en memoria se aplica marca de tenant en la UI pública. */
function sesionCompletaParaMarcaLogin() {
    try {
        return !!(app?.u && getApiToken());
    } catch (_) {
        return false;
    }
}
window.sesionCompletaParaMarcaLogin = sesionCompletaParaMarcaLogin;

/**
 * Login / wizard sin autenticación: título y logo genéricos (sin nombre de tenant anterior en pantalla).
 * Solo DOM y document.title; no reemplaza el flujo de login ni escribe localStorage.
 */
function pintarCabeceraLoginWizardGenerica() {
    const titulo = BRAND_DEFAULT_NAME;
    const sub = GN_SUBTITULO_FIJO;
    const logo = defaultGestorNovaLogoUrl();
    try {
        document.title = titulo + ' — Pedidos';
    } catch (_) {}
    document.querySelectorAll('#app-titulo, #gw .gn-wizard-card h1').forEach((h1) => {
        if (h1) h1.textContent = titulo;
    });
    document.querySelectorAll('#app-subtitulo, #gw .gn-wizard-card .sub').forEach((subEl) => {
        if (subEl) subEl.textContent = sub;
    });
    const ll = document.querySelector('#ls .ll');
    if (ll) {
        const u = String(logo).replace(/"/g, '&quot;').replace(/</g, '');
        ll.classList.add('ll--logo');
        ll.innerHTML = `<img src="${u}" alt="" class="gn-header-logo-img" width="62" height="62">`;
    }
    const gwImg = document.querySelector('#gw .gw-brand img');
    if (gwImg) {
        gwImg.src = logo;
    }
}

/** Pantalla de login o post-logout: restaurar marca guardada (API o última sesión). */
function hydrateBrandingForPublicScreen() {
    hydrateBrandingLoginSinTenantAjeno({
        sesionCompleta: sesionCompletaParaMarcaLogin,
        pintarGenerica: pintarCabeceraLoginWizardGenerica,
        hydrateOriginal: () => hydrateBrandingForPublicScreenCore(),
    });
}
function hydrateBrandingForPublicScreenCore() {
    let c = loadTenantBrandingCache();
    if (app?.u && c) {
        const tid = Number(app.u.tenant_id ?? app.u.tenantId);
        const snap = Number(c.tenant_id_snapshot);
        if (Number.isFinite(tid) && tid > 0 && Number.isFinite(snap) && snap > 0 && tid !== snap) {
            try {
                localStorage.removeItem(PMG_BRANDING_LS_KEY);
            } catch (_) {}
            c = null;
        }
    }
    if (c && (String(c.nombre_cliente || '').trim() || String(c.logo_url || '').trim())) {
        window.__PMG_TENANT_BRANDING__ = {
            setup_wizard_completado: !!c.setup_wizard_completado,
            marca_publicada_admin: !!c.marca_publicada_admin,
            nombre_cliente: String(c.nombre_cliente || ''),
            logo_url: String(c.logo_url || ''),
            tipo: String(c.tipo || ''),
            from_local_cache: !!c.from_local_cache
        };
        window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), subtitulo: GN_SUBTITULO_FIJO };
    } else {
        resetBrandingSesionNoAutenticada();
    }
    syncEmpresaCfgNombreLogoDesdeMarca();
}

/** Si hay nombre en empresa_config local pero aún no hay marca en memoria, mostrar cabecera sin depender solo de la API. */
function ensureBrandingFromLocalEmpresaCfg() {
    const nSql = String(window.EMPRESA_CFG?.nombre || '').trim();
    if (!nSql) return;
    const b = window.__PMG_TENANT_BRANDING__ || {};
    if (String(b.nombre_cliente || '').trim()) return;
    window.__PMG_TENANT_BRANDING__ = {
        ...b,
        nombre_cliente: nSql,
        logo_url: String(b.logo_url || window.EMPRESA_CFG?.logo_url || '').trim(),
        marca_publicada_admin: true,
        setup_wizard_completado: true,
        from_local_cache: true
    };
    syncEmpresaCfgNombreLogoDesdeMarca();
}

/**
 * Datos de marca efectivos: nombre/logo si el admin publicó en API, completó wizard,
 * o hay caché local (última sesión / empresa_config).
 */
function resolveMarcaTenantUI() {
    const b = window.__PMG_TENANT_BRANDING__ || {};
    const setup = !!b.setup_wizard_completado;
    const marcaPub = !!b.marca_publicada_admin;
    const fromCache = !!b.from_local_cache;
    const nombreApi = String(b.nombre_cliente || '').trim();
    const logoApi = String(b.logo_url || '').trim();
    const tipoApi = String(b.tipo || '').trim();
    const trusted = marcaPub || setup || fromCache;
    if (trusted && (nombreApi || logoApi)) {
        return {
            nombre: nombreApi || BRAND_DEFAULT_NAME,
            logo_url: logoApi || defaultGestorNovaLogoUrl(),
            tipo: tipoApi,
            esPersonalizado: true
        };
    }
    return {
        nombre: BRAND_DEFAULT_NAME,
        logo_url: defaultGestorNovaLogoUrl(),
        tipo: tipoApi,
        esPersonalizado: false
    };
}

function syncEmpresaCfgNombreLogoDesdeMarca() {
    const m = resolveMarcaTenantUI();
    const prev = window.EMPRESA_CFG || {};
    window.EMPRESA_CFG = { ...prev, nombre: m.nombre, logo_url: m.logo_url };
    if (m.tipo) window.EMPRESA_CFG.tipo = m.tipo;
}

/** Sin marca conocida: volver a valores por defecto (no borra localStorage; usar solo si no hay caché). */
function resetBrandingSesionNoAutenticada() {
    window.__PMG_TENANT_BRANDING__ = {
        setup_wizard_completado: false,
        marca_publicada_admin: false,
        nombre_cliente: '',
        logo_url: '',
        tipo: '',
        from_local_cache: false
    };
    syncEmpresaCfgNombreLogoDesdeMarca();
}

/** Banner informativo sobre estadísticas admin (#enre-marco): texto según rubro (no solo ENRE eléctrico). */
function actualizarMarcoReferenciaEstadisticasAdmin() {
    const el = document.getElementById('enre-marco');
    if (!el) return;
    const rubro = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
    let bg = '#eff6ff';
    let bd = '#bfdbfe';
    let html = '';
    if (rubro === 'cooperativa_electrica') {
        html =
            '<strong>Referencia sector eléctrico (Argentina)</strong> — Para la calidad técnica y comercial del servicio eléctrico existen marcos regulatorios y métricas de continuidad (p. ej. SAIDI/SAIFI). Este tablero muestra gestión interna de órdenes y tiempos; contrastá con los datos oficiales de tu distribuidor y del organismo aplicable. Más información: <a href="https://www.argentina.gob.ar/enre/calidad-del-servicio" target="_blank" rel="noopener">argentina.gob.ar/enre/calidad-del-servicio</a>.';
    } else if (rubro === 'cooperativa_agua') {
        bg = '#ecfeff';
        bd = '#a5f3fc';
        html =
            '<strong>Servicios de agua y saneamiento</strong> — Los organismos provinciales y nacionales publican orientaciones sobre continuidad, presión y calidad del agua. Este panel ayuda a gestionar reclamos y tiempos internos; verificá requisitos locales con tu autoridad de aplicación.';
    } else if (rubro === 'municipio') {
        bg = '#f5f3ff';
        bd = '#ddd6fe';
        html =
            '<strong>Gestión municipal</strong> — Coordiná indicadores con las normativas locales (espacio público, alumbrado, saneamiento urbano). Este tablero resume pedidos internos del municipio.';
    } else {
        bg = '#f8fafc';
        bd = '#e2e8f0';
        html =
            '<strong>Referencia orientativa</strong> — Adaptá estos indicadores a tu sector y a las obligaciones vigentes donde operás. Este tablero muestra órdenes internas de trabajo; documentá evidencia y seguimiento según tu proceso.';
    }
    el.style.background = bg;
    el.style.border = `1px solid ${bd}`;
    el.innerHTML = html;
}

function aplicarMarcaVisualCompleta() {
    const m = resolveMarcaTenantUI();
    document.title = m.nombre + ' — Pedidos';
    document.querySelectorAll('#app-titulo, #gw .gn-wizard-card h1').forEach((h1) => {
        if (h1) h1.textContent = m.nombre;
    });
    try {
        window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), subtitulo: GN_SUBTITULO_FIJO };
    } catch (_) {}
    document.querySelectorAll('#app-subtitulo, #gw .gn-wizard-card .sub').forEach((subEl) => {
        if (subEl) subEl.textContent = GN_SUBTITULO_FIJO;
    });
    const h2 = document.querySelector('.hd h2');
    if (h2) {
        h2.textContent = '';
        const ic = document.createElement('i');
        ic.className = 'fas fa-network-wired';
        h2.appendChild(ic);
        const b = window.__PMG_TENANT_BRANDING__ || {};
        const tituloHd = b.setup_wizard_completado ? m.nombre : BRAND_DEFAULT_NAME;
        h2.appendChild(document.createTextNode(' ' + tituloHd));
    }
    const ll = document.querySelector('#ls .ll');
    if (ll) {
        const u = String(m.logo_url || '').replace(/"/g, '&quot;').replace(/</g, '');
        ll.classList.add('ll--logo');
        ll.innerHTML = `<img src="${u}" alt="" class="gn-header-logo-img">`;
    }
    try {
        actualizarMarcoReferenciaEstadisticasAdmin();
    } catch (_) {}
}

/** Admin: incluir pedidos en estado «Derivado externo» en listas y mapa (histórico operativo). */
const LS_MOSTRAR_DERIVADOS_FUERA = 'pmg_pedidos_mostrar_derivados_fuera';
const LS_MOSTRAR_DESESTIMADOS_LISTA = 'pmg_pedidos_mostrar_desestimados_lista';
const LS_SOLO_AGRUPADOS_INCI_LISTA = 'pmg_pedidos_solo_agrupados_incidencia_lista';
let _resolveAdminTipoModal = null;

function invalidateCachesTrasCambioRubro(tipoAnterior, tipoNuevo) {
    const a = normalizarRubroEmpresa(tipoAnterior);
    const b = normalizarRubroEmpresa(tipoNuevo);
    if (a === b) return;
    try {
        DIST = [];
    } catch (_) {}
    try {
        if (typeof syncMapaFiltroTiposRebuild === 'function') syncMapaFiltroTiposRebuild();
    } catch (_) {}
    try {
        void cargarDistribuidores();
    } catch (_) {}
    try {
        void cargarListaDistribuidoresAdmin();
    } catch (_) {}
    try {
        void cargarPedidos({ silent: true });
    } catch (_) {}
    try {
        render();
    } catch (_) {}
    try {
        renderMk();
    } catch (_) {}
    try {
        resetAdminUiMultitenantDatosOperativos();
    } catch (_) {}
    try {
        void cargarConfigEmpresa();
    } catch (_) {}
    try {
        void cargarFormEmpresa();
    } catch (_) {}
}

async function promptAdminTipoNegocioWebIfNeeded(force = false) {
    if (!esAdminSesionWebPublica()) return;
    if (!force) return;
    const modal = document.getElementById('modal-admin-tipo-negocio');
    const sel = document.getElementById('admin-sesion-tipo');
    if (!modal || !sel) return;
    const actual = String(window.EMPRESA_CFG?.tipo || '').trim();
    sel.value = actual || '';
    return new Promise((resolve) => {
        _resolveAdminTipoModal = resolve;
        modal.classList.add('active');
    });
}

function abrirModalCambioRubroAdminConPassword() {
    if (!esAdminSesionWebPublica()) return;
    const inp = document.getElementById('admin-verify-pw-rubro-input');
    if (inp) inp.value = '';
    document.getElementById('modal-admin-verify-pw-rubro')?.classList.add('active');
}
window.abrirModalCambioRubroAdminConPassword = abrirModalCambioRubroAdminConPassword;

async function confirmarPasswordYAbrirRubroAdmin() {
    const pw = (document.getElementById('admin-verify-pw-rubro-input')?.value || '').trim();
    if (!pw) {
        toast('Ingresá tu contraseña de administrador', 'error');
        return;
    }
    await asegurarJwtApiRest();
    const token = getApiToken();
    if (!token) {
        toast('No hay token de API. Volvé a iniciar sesión.', 'error');
        return;
    }
    try {
        const resp = await fetch(apiUrl('/api/auth/verify-password'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ password: pw })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }
    } catch (e) {
        toast(String(e?.message || e) || 'Contraseña incorrecta', 'error');
        return;
    }
    document.getElementById('modal-admin-verify-pw-rubro')?.classList.remove('active');
    try {
        window.__PMG_RUBRO_REENTRY__ = true;
    } catch (_) {}
    await promptAdminTipoNegocioWebIfNeeded(true);
}
window.confirmarPasswordYAbrirRubroAdmin = confirmarPasswordYAbrirRubroAdmin;

async function confirmarAdminTipoNegocioWeb() {
    const sel = document.getElementById('admin-sesion-tipo');
    const chk = document.getElementById('admin-sesion-tipo-persistir');
    const modal = document.getElementById('modal-admin-tipo-negocio');
    const tipo = (sel?.value || '').trim();
    if (!tipo) {
        toast('Elegí un tipo de negocio', 'error');
        return;
    }
    const tipoAntes = String(window.EMPRESA_CFG?.tipo || '').trim();
    let persistir = !!(chk && chk.checked);
    let guardadoServidor = false;
    if (persistir) {
        await asegurarJwtApiRest();
        if (!getApiToken()) await intentarRefrescarJwtDesdeCredencialesGuardadas();
        let token = getApiToken();
        if (!token) {
            toast('La API aún no respondió: el tipo se aplica solo en esta sesión. Reintentá guardar en servidor desde Admin → Empresa cuando haya conexión.', 'warning');
            persistir = false;
        } else {
            try {
                let serverTipo = '';
                try {
                    const gr = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (gr.ok) {
                        const jd = await gr.json().catch(() => ({}));
                        serverTipo = String(jd?.cliente?.tipo || '').trim();
                    }
                } catch (_) {}

                const cambiaRubroServidor =
                    !!tipo && !!serverTipo && String(tipo).trim() !== String(serverTipo).trim();

                const mapTipoABusiness = (t) => {
                    const n = normalizarRubroEmpresa(t);
                    if (n === 'cooperativa_agua') return 'agua';
                    if (n === 'municipio') return 'municipio';
                    return 'electricidad';
                };
                const businessSel = mapTipoABusiness(tipo);

                if (cambiaRubroServidor) {
                    if (!confirm('¿Cambiar la vista activa del negocio en el servidor? Los datos existentes no se borran; solo cambia qué reclamos y socios ves según la línea (electricidad / agua / municipio).')) {
                        toast('Cambio cancelado', 'warning');
                        return;
                    }
                }

                const sw = await fetch(apiUrl('/api/tenant/switch-business'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ business_type: businessSel })
                });
                if (!sw.ok) {
                    const er = await sw.json().catch(() => ({}));
                    if (sw.status !== 404) {
                        throw new Error(er.error || er.detail || `switch-business HTTP ${sw.status}`);
                    }
                }

                const bodyObj = { tipo, active_business_type: businessSel };
                const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(bodyObj)
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${resp.status}`);
                }
                guardadoServidor = true;
            } catch (e) {
                toast('No se pudo guardar en servidor: ' + (e?.message || e) + ' — queda aplicado en esta sesión.', 'warning');
                persistir = false;
            }
        }
    }

    const rubroCambioPersistido =
        guardadoServidor && normalizarRubroEmpresa(tipoAntes) !== normalizarRubroEmpresa(tipo);
    if (rubroCambioPersistido) {
        toast('Rubro actualizado en servidor. Se cierra la sesión para aplicar el cambio…', 'success');
        await logoutYLimpiarClienteTrasRubroPersistidoEnServidor();
        return;
    }

    window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), tipo };
    window.__PMG_TENANT_BRANDING__ = { ...(window.__PMG_TENANT_BRANDING__ || {}), tipo };
    try {
        persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
    } catch (_) {}
    invalidateCachesTrasCambioRubro(tipoAntes, tipo);
    aplicarEtiquetasPorTipo(tipo);
    poblarSelectTiposReclamo();
    syncZonaPedidoFormLabels();
    syncEmpresaCfgNombreLogoDesdeMarca();
    aplicarMarcaVisualCompleta();
    if (modal) modal.classList.remove('active');
    if (_resolveAdminTipoModal) {
        _resolveAdminTipoModal();
        _resolveAdminTipoModal = null;
    }
    try {
        window.__PMG_RUBRO_REENTRY__ = false;
    } catch (_) {}
    toast(guardadoServidor ? 'Tipo guardado en servidor y en pantalla' : 'Tipo aplicado en esta sesión', 'success');
}
window.confirmarAdminTipoNegocioWeb = confirmarAdminTipoNegocioWeb;

/** Menos tiles y menos trabajo en WebView / emulador. */
function gnMapaLigero() {
    try {
        return esAndroidWebViewMapa();
    } catch (_) {
        return false;
    }
}

let _gnLastWatchUbicacionMs = 0;
let _mapEscalaDebounceTimer = null;

function mapTapUbicacionInicialHechaSesion() {
    try { return sessionStorage.getItem(MAP_SEED_SESSION_KEY) === '1'; } catch (_) { return false; }
}
function marcarMapTapUbicacionInicialHecha() {
    try { sessionStorage.setItem(MAP_SEED_SESSION_KEY, '1'); } catch (_) {}
}

function mapTapNuevoPedidoArmadoSesion() {
    try {
        return sessionStorage.getItem(MAP_TAP_NUEVO_PEDIDO_ARMED_KEY) === '1';
    } catch (_) {
        return false;
    }
}
function setMapTapNuevoPedidoArmado(armed) {
    try {
        if (armed) {
            sessionStorage.setItem(MAP_TAP_NUEVO_PEDIDO_ARMED_KEY, '1');
            try {
                gnRequestClearGotoPreviewMarker();
            } catch (_) {}
        } else sessionStorage.removeItem(MAP_TAP_NUEVO_PEDIDO_ARMED_KEY);
    } catch (_) {}
    try {
        syncMapTapNuevoPedidoArmedUi();
    } catch (_) {}
}
function desarmarMapTapNuevoPedido() {
    setMapTapNuevoPedidoArmado(false);
}
function syncMapTapNuevoPedidoArmedUi() {
    const btn = document.getElementById('btn-mapa-armar-nuevo');
    if (!btn) return;
    const on = mapTapNuevoPedidoArmadoSesion();
    btn.classList.toggle('btn-mapa-armar-nuevo--armed', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on
        ? 'Activo: el próximo toque en el mapa abre nuevo pedido (se apaga al abrir el formulario)'
        : 'Activar: luego tocá el mapa para elegir el punto del nuevo pedido';
}
function toggleMapTapNuevoPedidoArmed() {
    setMapTapNuevoPedidoArmado(!mapTapNuevoPedidoArmadoSesion());
    const on = mapTapNuevoPedidoArmadoSesion();
    toast(
        on ? 'Tocá el mapa en el punto del nuevo pedido.' : 'Nuevo pedido desde el mapa desactivado.',
        on ? 'success' : 'info'
    );
}
window.toggleMapTapNuevoPedidoArmed = toggleMapTapNuevoPedidoArmed;
let _mapLazyIo = null;
function teardownMapLazyObserver() {
    if (_mapLazyIo) {
        try { _mapLazyIo.disconnect(); } catch (_) {}
        _mapLazyIo = null;
    }
}

function setupMapLazyWhenVisibleOnce() {
    teardownMapLazyObserver();
    const mc = document.getElementById('mc');
    const ms = document.getElementById('ms');
    if (!mc || !ms || !ms.classList.contains('active')) return;
    if (typeof IntersectionObserver === 'undefined') {
        queueLazyInitMap();
        return;
    }
    _mapLazyIo = new IntersectionObserver((entries) => {
        for (const en of entries) {
            if (en.isIntersecting && en.intersectionRatio > 0.02) {
                queueLazyInitMap();
                teardownMapLazyObserver();
                return;
            }
        }
    }, { root: ms, rootMargin: '0px', threshold: [0, 0.02, 0.08] });
    _mapLazyIo.observe(mc);
}

function limpiarEstadoMapaSesion() {
    _gpsRecibidoEstaSesion = false;
    teardownMapLazyObserver();
    try {
        sessionStorage.removeItem(MAP_SEED_SESSION_KEY);
    } catch (_) {}
    try {
        sessionStorage.removeItem(MAP_TAP_NUEVO_PEDIDO_ARMED_KEY);
    } catch (_) {}
    try {
        syncMapTapNuevoPedidoArmedUi();
    } catch (_) {}
}
function marcarGpsRecibidoEstaSesion() {
    _gpsRecibidoEstaSesion = true;
}

/** Barra superior Android eliminada: mapa = mismas paletas que admin (pestañas laterales). */
function toggleAndroidMapStripCollapsed() {}
window.toggleAndroidMapStripCollapsed = toggleAndroidMapStripCollapsed;

limpiarPersistenciaClienteGestorNovaMigracionV2();
aplicarCapaOnboardingVsLoginInicial();
(function reaplicarCapaOnboardingTrasDomReady() {
    const run = () => {
        try {
            aplicarCapaOnboardingVsLoginInicial();
        } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
})();

(function instalarEscapeFijarUbicacionAlCargar() {
    try {
        instalarEscapeCancelarFijarUbicacionAdmin();
    } catch (_) {}
})();

const dbs = document.getElementById('dbs');
const lb  = document.getElementById('lb');

/** WebView Android: asegurar que el submit de login no quede bloqueado por el atributo HTML `disabled`. */
function habilitarBotonIngresarLogin() {
    const el = document.getElementById('lb');
    if (!el) return;
    el.disabled = false;
    try {
        el.removeAttribute('disabled');
    } catch (_) {}
}
habilitarBotonIngresarLogin();
actualizarBadgeOffline();
(function antiAutofillCredencialesLogin() {
    const em = document.getElementById('em');
    const pw = document.getElementById('pw');
    const lf = document.getElementById('lf');
    const lb = document.getElementById('lb');
    if (!em || !pw) return;
    let usuarioEditoLogin = false;
    let detenerBarridoLogin = false;
    const marcarEdicionLogin = () => { usuarioEditoLogin = true; };
    [em, pw].forEach((el) => {
        ['input', 'keydown', 'paste', 'cut'].forEach((ev) => el.addEventListener(ev, marcarEdicionLogin, { passive: true }));
    });
    lb?.addEventListener('mousedown', () => { detenerBarridoLogin = true; }, { capture: true });
    lb?.addEventListener('touchstart', () => { detenerBarridoLogin = true; }, { capture: true, passive: true });
    const strip = () => {
        try {
            em.value = '';
            pw.value = '';
        } catch (_) {}
    };
    const unlock = (el) => {
        try { el.removeAttribute('readonly'); } catch (_) {}
    };
    em.setAttribute('readonly', 'readonly');
    pw.setAttribute('readonly', 'readonly');
    try {
        pw.setAttribute('autocomplete', 'new-password');
    } catch (_) {}
    const armUnlock = (el) => {
        const go = () => unlock(el);
        el.addEventListener('focus', go, { once: true });
        el.addEventListener('mousedown', go, { once: true });
        el.addEventListener('touchstart', go, { once: true, passive: true });
    };
    armUnlock(em);
    armUnlock(pw);
    lf?.addEventListener('submit', () => {
        unlock(em);
        unlock(pw);
    }, { capture: true });
    /** En WebView Android el IME a veces no deja `activeElement` en el input; el barrido borra la clave y el teclado queda con InputConnection inactiva (no ingresa). */
    const esWebViewGestorNova =
        typeof window.AndroidConfig !== 'undefined' ||
        (typeof navigator !== 'undefined' && /GestorNova\//i.test(String(navigator.userAgent || '')));
    if (esWebViewGestorNova) {
        return;
    }
    const barridoSiAutofill = () => {
        if (detenerBarridoLogin || usuarioEditoLogin) return;
        if (document.activeElement === em || document.activeElement === pw) return;
        if (!document.getElementById('ls')?.classList.contains('active')) return;
        strip();
    };
    let antiAutofillIntervalId = null;
    const programarBarridos = () => {
        strip();
        requestAnimationFrame(strip);
        requestAnimationFrame(() => requestAnimationFrame(strip));
        [0, 50, 150, 400, 800, 1500, 2500, 4000, 6000].forEach((ms) => setTimeout(barridoSiAutofill, ms));
        if (antiAutofillIntervalId != null) clearInterval(antiAutofillIntervalId);
        let n = 0;
        antiAutofillIntervalId = setInterval(() => {
            barridoSiAutofill();
            if (++n >= 35) {
                clearInterval(antiAutofillIntervalId);
                antiAutofillIntervalId = null;
            }
        }, 200);
    };
    programarBarridos();
    window.addEventListener('load', () => {
        strip();
        [80, 300, 900, 2000].forEach((ms) => setTimeout(barridoSiAutofill, ms));
    });
    window.addEventListener('pageshow', () => {
        strip();
        [100, 400, 1200].forEach((ms) => setTimeout(barridoSiAutofill, ms));
    });
})();
(function pintarMarcaLoginAlCargarModulo() {
    try {
        if (document.getElementById('ls')?.classList.contains('active')) {
            if (sesionCompletaParaMarcaLogin()) {
                hydrateBrandingForPublicScreen();
                aplicarMarcaVisualCompleta();
            } else {
                pintarCabeceraLoginWizardGenerica();
            }
        }
    } catch (_) {}
    try {
        actualizarVisibilidadBotonTenantTecnicoLogin();
    } catch (_) {}
})();
(function bindWizardOnboardingUi() {
    document.getElementById('wizard-btn-primary')?.addEventListener('click', (e) => {
        e.preventDefault();
        onWizardPrimaryClick();
    });
    document.getElementById('wizard-btn-secondary')?.addEventListener('click', (e) => {
        e.preventDefault();
        cerrarVistaWizardMostrarLogin();
    });
    document.getElementById('form-reabrir-asistente')?.addEventListener('submit', confirmarReabrirAsistenteConCredenciales);
})();
if (dbs) {
    dbs.className = 'dbs c';
    dbs.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando red...';
}


async function conectarNeon() {
    try {
        const ok = await initNeon();
        if (ok) {
            app.ok = true;
            try {
                if (dbs) {
                    dbs.className = 'dbs ok';
                    dbs.innerHTML =
                        '<i class="fas fa-circle-notch fa-spin"></i> Conectado — preparando tablas (puede tardar unos segundos)…';
                }
            } catch (_) {}
            habilitarBotonIngresarLogin();
            try {
                await sqlSimple(`CREATE TABLE IF NOT EXISTS pedidos(
                    id SERIAL PRIMARY KEY,
                    numero_pedido TEXT NOT NULL,
                    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
                    fecha_cierre TIMESTAMPTZ,
                    distribuidor TEXT NOT NULL,
                    cliente TEXT, tipo_trabajo TEXT,
                    descripcion TEXT NOT NULL,
                    prioridad TEXT NOT NULL DEFAULT 'Media',
                    estado TEXT NOT NULL DEFAULT 'Pendiente',
                    avance INT DEFAULT 0,
                    lat DOUBLE PRECISION, lng DOUBLE PRECISION,
                    usuario_id INT, trabajo_realizado TEXT,
                    tecnico_cierre TEXT, foto_base64 TEXT,
                    x_inchauspe NUMERIC, y_inchauspe NUMERIC,
                    fecha_avance TIMESTAMPTZ, foto_cierre TEXT
                )`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS foto_cierre TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nis_medidor TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tecnico_asignado_id INTEGER`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMPTZ`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS firma_cliente TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS checklist_seguridad TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS usuario_creador_id INTEGER`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS telefono_contacto TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_direccion TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(200)`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_calle TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_numero_puerta VARCHAR(20)`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_localidad TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS provincia TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS provincia TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS codigo_postal TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS codigo_postal TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS suministro_tipo_conexion TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS suministro_fases TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS trafo TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS barrio TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_cliente TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_opinion_cliente TIMESTAMPTZ`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_cliente_estrellas SMALLINT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_descargo_empresa TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_descargo_empresa TIMESTAMPTZ`);
                await sqlSimple(
                    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_banner_admin_descartado BOOLEAN NOT NULL DEFAULT FALSE`
                );
                try {
                    await sqlSimple(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS barrio TEXT`);
                } catch (_) {}
                try {
                    await sqlSimple(`ALTER TABLE pedidos ALTER COLUMN distribuidor DROP NOT NULL`);
                } catch (_) {}
                await sqlSimple(`CREATE TABLE IF NOT EXISTS socios_catalogo(
                    id SERIAL PRIMARY KEY,
                    nis_medidor TEXT NOT NULL UNIQUE,
                    nombre TEXT,
                    calle TEXT,
                    numero TEXT,
                    telefono TEXT,
                    distribuidor_codigo TEXT,
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS localidad TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS tipo_tarifa TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS urbano_rural TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS transformador TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS tipo_conexion TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS fases TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS calle TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS numero TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS barrio TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS latitud NUMERIC(12, 8)`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS longitud NUMERIC(12, 8)`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS nis TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS medidor TEXT`);
                await sqlSimple(`CREATE TABLE IF NOT EXISTS pedido_materiales(
                    id SERIAL PRIMARY KEY,
                    pedido_id INTEGER NOT NULL,
                    descripcion TEXT NOT NULL,
                    cantidad NUMERIC,
                    unidad TEXT,
                    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )`);
                
                await sqlSimple(`CREATE TABLE IF NOT EXISTS pedido_contador(
                    anio INT PRIMARY KEY,
                    ultimo_numero INT NOT NULL DEFAULT 0
                )`);
            } catch(_) {}
            try {
                await sqlSimple(
                    'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE'
                );
            } catch (_) {}
            if (dbs) {
                dbs.className = 'dbs ok';
                dbs.innerHTML = '<i class="fas fa-check-circle"></i> Conectado - Neon PostgreSQL';
            }
            setModoOffline(false);
            await notificarNeonConectadoParaUpdateCheck();
            try {
                if (app.u) {
                    await sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true });
                    if (!getApiToken()) {
                        try {
                            localStorage.removeItem(PMG_BRANDING_LS_KEY);
                        } catch (_) {}
                        await refrescarEmpresaDesdeClienteNeonPorTenantActual();
                    }
                    try {
                        render();
                        renderMk();
                    } catch (_) {}
                }
            } catch (_) {}
            if (app.u && offlineQueue().length > 0) setTimeout(sincronizarOffline, 1500);
            else if (app.u) cargarPedidos();
        } else {
            throw new Error('Sin red');
        }
    } catch(e) {
        console.warn('[Neon]', e.message);
        app.ok = false;
        NEON_OK = false;
        const tieneCache = (() => {
            try { return JSON.parse(localStorage.getItem('pmg_offline_user') || '[]').length > 0; } catch(_) { return false; }
        })();
        if (dbs) {
            dbs.className = 'dbs er';
            dbs.innerHTML = tieneCache
                ? '<i class="fas fa-wifi-slash"></i> Sin conexión — podés ingresar offline'
                : '<i class="fas fa-wifi-slash"></i> Sin conexión — ingresá con internet primero';
        }
        setModoOffline(true);
        habilitarBotonIngresarLogin();
    }
}




function resetPreferenciasPanelesInicioCerrados() {
    try {
        localStorage.setItem('pmg_map_filtros_slid', '1');
        localStorage.setItem('pmg_map_capas_slid', '1');
        localStorage.setItem('pmg_map_filtros_body_collapsed', '0');
        localStorage.setItem('pmg_map_capas_body_collapsed', '0');
        localStorage.setItem('pmg_map_panels_storage_v2', '1');
        localStorage.removeItem('pmg_slideoff_filtros');
        localStorage.removeItem('pmg_slideoff_capas_osm');
        localStorage.setItem('pmg_slideoff_filtro_tipo', '1');
        localStorage.setItem('pmg_slideoff_colores', '1');
        localStorage.setItem('pmg_slideoff_dash', '1');
        localStorage.setItem('pmg_bp2_hidden', '1');
    } catch (_) {}
}

function initWebCoordsConverterBar() {
    void import('./modules/conversor-coordenadas.js').then(({ installWebCoordsConverterBar: install }) =>
        install(esAndroidWebViewMapa)
    );
}

const lfLogin = document.getElementById('lf');
const gnLoginSubmitHandler = async e => {
    try {
        e.preventDefault();
    } catch (_) {}
    const emEl = document.getElementById('em');
    const pwEl = document.getElementById('pw');
    const le = document.getElementById('le');
    const lb = document.getElementById('lb');
    if (!emEl || !pwEl || !lb) return;
    if (!beginLoginAttempt()) return;
    try {
        console.log('[GN] login');
    } catch (_) {}

    const em = emEl.value.trim();
    const pw = pwEl.value;

    lb.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';
    lb.disabled = true;
    if (le) le.textContent = '';
    
    
    function entrarConUsuario(u, offline = false) {
        u.rol = normalizarRolStr(u.rol);
        app.u = u;
        invalidarCachesMultitenantSesionYOAdminUI();
        try {
            app.p = [];
        } catch (_) {}
        try {
            render();
        } catch (_) {}
        localStorage.setItem('pmg', JSON.stringify(app.u));
        try {
            _pmgActividadUltimaEscrituraLs = 0;
            registrarActividadSesionUsuario();
        } catch (_) {}
        try {
            actualizarBarraHeaderSesion();
        } catch (_) {}
        document.getElementById('ls').classList.remove('active');
        document.getElementById('ms').classList.add('active');
        try {
            document.body.classList.add('gn-sesion-activa');
        } catch (_) {}
        try {
            actualizarVisibilidadBotonTenantTecnicoLogin();
        } catch (_) {}
        try {
            syncVisibilidadBotonPedidoOficina();
        } catch (_) {}
        resetPreferenciasPanelesInicioCerrados();
        try { aplicarUIMapaPlataforma(); } catch (_) {}
        try { initWebCoordsConverterBar(); } catch (_) {}
        setupMapLazyWhenVisibleOnce();
        scheduleGnMapLayoutBumpsTrasLogin();
        iniciarKeepAlive();
        iniciarTracking();
        iniciarPollNotifMovil();
        iniciarSyncCatalogos();
        try {
            initGnFeaturesAdminMounts({ esAdmin, toast, apiUrl, getApiToken });
        } catch (_) {}
        void registrarFcmTokenSiDisponible({ apiUrl, getApiToken });
        const btnAdm = document.getElementById('btn-admin');
        if (btnAdm) btnAdm.style.display = esAdmin() ? 'flex' : 'none';
        try {
            gnGeocodeAdminLogSyncDockVisibility();
        } catch (_) {}
        const btnDash = document.getElementById('btn-dashboard-gerencia');
        if (btnDash) btnDash.style.display = esAdmin() ? 'flex' : 'none';
        try {
            actualizarBotonMtSegunRol({ rolApp });
        } catch (_) {}
        const btnDerivPend = document.getElementById('btn-derivaciones-pendientes');
        if (btnDerivPend) btnDerivPend.style.display = esAdmin() ? 'inline-flex' : 'none';
        const mapDashCard = document.getElementById('mapa-card-dashboard');
        if (mapDashCard) mapDashCard.style.display = esAdmin() ? 'block' : 'none';
        const wrapTog = document.getElementById('wrap-toggle-ver-todos');
        const chkTod = document.getElementById('toggle-ver-todos-pedidos');
        if (wrapTog && chkTod) {
            wrapTog.style.display = esTecnicoOSupervisor() ? 'inline-flex' : 'none';
            chkTod.checked = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
        }
        ['wrap-chk-derivados-fuera', 'wrap-chk-desestimados-lista', 'wrap-chk-solo-agrupados-incidencia'].forEach(
            (wid) => {
                const w = document.getElementById(wid);
                if (w) w.style.display = esAdmin() ? 'inline-flex' : 'none';
            }
        );
        try {
            syncPedidosToolbarFiltrosExclusivosFromLs(esAdmin());
        } catch (_) {}
        try {
            if (window.AndroidSession && typeof AndroidSession.setUser === 'function') {
                AndroidSession.setUser(parseInt(u.id, 10) || 0, String(u.rol || ''));
            }
            if (window.AndroidSession && typeof AndroidSession.setTenantId === 'function') {
                AndroidSession.setTenantId(tenantIdActual());
            }
        } catch (_) {}
        if (esAdmin()) {
            iniciarDashboardGerenciaPoll();
            iniciarPollWhatsappHumanChat();
            detenerPollSincroPedidosTecnico();
        } else {
            detenerDashboardGerenciaPoll();
            detenerPollWhatsappHumanChat();
            destruirTodasVentanasWaHc();
            detenerTecnicosMapaPrincipalPoll();
            iniciarPollSincroPedidosTecnico();
            detenerPollBannerReclamoCliente();
        }
        setTimeout(async () => {

            solicitarPermisos().then(r => {
                if (!r.gps) toast('GPS no disponible — ubicación manual', 'info');
                if (ultimaUbicacion) {
                    const enviarAl_SW = () => {
                        if (navigator.serviceWorker?.controller) {
                            navigator.serviceWorker.controller.postMessage({
                                tipo: 'CACHEAR_ZONA',
                                lat: ultimaUbicacion.lat,
                                lng: ultimaUbicacion.lon,
                                radioKm: 150
                            });
                        }
                    };
                    // Esperar a que el SW esté activo
                    if (navigator.serviceWorker?.controller) enviarAl_SW();
                    else setTimeout(enviarAl_SW, 4000);
                }
            });
            setupMapLazyWhenVisibleOnce();
            if (!offline) {
                await asegurarJwtApiRest();
                try {
                    await sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true });
                } catch (_) {}
                await cargarDistribuidores();
                const cfgLista = await verificarConfiguracionInicialObligatoria();
                if (!cfgLista) return;
                await cargarConfigEmpresa();
                await cargarPedidos();
                if (esAdmin()) iniciarPollBannerReclamoCliente();
                
                offlinePedidosSave(app.p);
            } else {
                
                app.p = offlinePedidos();
                render();
                toast('📴 Modo offline — mostrando pedidos en caché', 'info');
            }
            await consumirPedidoPendienteDesdeNotif();
        }, 200);
    }
    
    
    function intentarOffline() {
        const u = verificarUsuarioOffline(em, pw);
        if (u) {
            const uEnt = usuarioSesionParaEntrar(u);
            entrarConUsuario(
                uEnt && typeof uEnt === 'object'
                    ? uEnt
                    : { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol },
                true
            );
            toast('📴 Modo offline — ' + u.nombre, 'info');
            return true;
        }
        return false;
    }

    try {
        
        if (modoOffline || !NEON_OK || !_sql) {
            try {
                const reconectado = await initNeon();
                if (reconectado) {
                    NEON_OK = true;
                    setModoOffline(false);
                    await notificarNeonConectadoParaUpdateCheck();
                }
            } catch(_) {}
        }
        if (modoOffline || !NEON_OK || !_sql) {
            if (!intentarOffline()) {
                if (le) le.textContent = 'Sin conexión. Ingresá con internet al menos una vez para habilitar el modo offline.';
            }
            return;
        }

        let usuario = null;
        let loginJwtPayload = null;
        let loginApiFallo = null;

        /** 1) API primero (bcrypt y login global); reintento sin tenant si hint sessionStorage obsoleto. */
        try {
            loginJwtPayload = await loginApiJwt(em, pw);
            if (loginJwtPayload?._loginFailed) {
                loginApiFallo = loginJwtPayload;
                loginJwtPayload = null;
            } else if (loginJwtPayload?.must_change_password && loginJwtPayload?.user_id) {
                /* se maneja abajo con loginJwtPayload */
            } else if (loginJwtPayload?.user?.id) {
                let must = false;
                try {
                    const mr = await sqlSimple(
                        `SELECT COALESCE(must_change_password,false) AS must_change_password FROM usuarios WHERE id = ${esc(
                            loginJwtPayload.user.id
                        )} LIMIT 1`
                    );
                    must = !!(mr.rows?.[0]?.must_change_password);
                } catch (_) {}
                usuario = {
                    id: loginJwtPayload.user.id,
                    email: loginJwtPayload.user.email,
                    nombre: loginJwtPayload.user.nombre,
                    rol: loginJwtPayload.user.rol,
                    tenant_id: loginJwtPayload.user.tenant_id,
                    must_change_password: must,
                };
            }
        } catch (_) {}

        /** 2) Fallback Neon solo si la API no respondió; no comparar texto plano si la API ya validó bcrypt (401). */
        if (
            !usuario &&
            !loginJwtPayload?.must_change_password &&
            !shouldSkipNeonPlaintextLoginFallback(loginApiFallo, getApiBaseUrl)
        ) {
            let tenantFrag = '';
            try {
                tenantFrag = await buildNeonLoginTenantSqlFrag(esc, sqlColumnaTenantUsuariosNeonSync);
            } catch (_) {}
            const loginWhere = `FROM usuarios WHERE LOWER(TRIM(email)) = LOWER(TRIM(${esc(em)})) AND password_hash = ${esc(pw)}${tenantFrag}`;
            const mustCol = ', COALESCE(must_change_password, false) AS must_change_password';
            const loginOrd = ' ORDER BY id ASC';
            const loginSqlAttempts = [
                `SELECT id, email, nombre, rol, tenant_id${mustCol} ${loginWhere}${loginOrd}`,
                `SELECT id, email, nombre, rol, cliente_id AS tenant_id${mustCol} ${loginWhere}${loginOrd}`,
                `SELECT id, email, nombre, rol${mustCol} ${loginWhere}${loginOrd}`,
            ];
            try {
                let lastErr = null;
                let resultado = null;
                for (const sel of loginSqlAttempts) {
                    try {
                        resultado = await conTimeout(sqlSimple(sel), 8000, 'timeout login');
                        break;
                    } catch (err) {
                        lastErr = err;
                        console.warn('[login] variante SQL:', err && err.message ? err.message : err);
                    }
                }
                if (!resultado) throw lastErr || new Error('Login SQL no disponible');
                usuario = resultado.rows?.[0] || null;
                if (usuario && !loginJwtPayload) {
                    loginJwtPayload = await loginApiJwt(em, pw);
                }
            } catch (netErr) {
                console.warn('Login: red caída, usando cache:', netErr.message);
                setModoOffline(true);
                if (!intentarOffline()) {
                    if (le) le.textContent = 'Se perdió la conexión. Si ingresaste antes, ya podés entrar sin internet.';
                }
                return;
            }
        }

        if (loginJwtPayload?.must_change_password && loginJwtPayload?.user_id && !usuario) {
            const pendPrimera = {
                u: {
                    id: loginJwtPayload.user_id,
                    email: loginJwtPayload.user?.email || em,
                    nombre: loginJwtPayload.user?.nombre || 'Usuario',
                    rol: loginJwtPayload.user?.rol || 'admin',
                    tenant_id: loginJwtPayload.user?.tenant_id,
                    must_change_password: true,
                },
                passwordActual: pw,
                primeraContrasenaApi: true,
            };
            window._pendingAndroidPasswordChange = pendPrimera;
            if (typeof window.__gnAbrirModalPrimerIngresoBootstrap === 'function') {
                window.__gnAbrirModalPrimerIngresoBootstrap(pendPrimera);
            } else {
                document.getElementById('modal-forzar-cambio-pw')?.classList.add('active');
            }
            toast('Completá usuario, nombre y contraseña del administrador.', 'info');
            return;
        }

        if (usuario) {
            const tidLogin = await resolverTenantIdPostLoginNeon({
                usuario,
                leerTenantIdUsuarioDesdeNeon,
                appConfig: window.APP_CONFIG
            });
            const u = {
                id: usuario.id,
                email: usuario.email,
                nombre: usuario.nombre || 'Administrador',
                rol: normalizarRolStr(usuario.rol || 'tecnico'),
                tenant_id: tidLogin,
                must_change_password: !!usuario.must_change_password
            };
            guardarUsuarioOffline(u, pw);
            if (!loginJwtPayload) {
                const jwt2 = await loginApiJwt(em, pw);
                if (jwt2?._loginFailed) loginApiFallo = jwt2;
                else loginJwtPayload = jwt2;
            }
            if (loginJwtPayload?.must_change_password && loginJwtPayload?.user_id) {
                const pendPrimera2 = {
                    u: {
                        id: loginJwtPayload.user_id,
                        email: loginJwtPayload.user?.email || em,
                        nombre: loginJwtPayload.user?.nombre || 'Usuario',
                        rol: loginJwtPayload.user?.rol || 'admin',
                        tenant_id: loginJwtPayload.user?.tenant_id,
                        must_change_password: true,
                    },
                    passwordActual: pw,
                    primeraContrasenaApi: true,
                };
                window._pendingAndroidPasswordChange = pendPrimera2;
                if (typeof window.__gnAbrirModalPrimerIngresoBootstrap === 'function') {
                    window.__gnAbrirModalPrimerIngresoBootstrap(pendPrimera2);
                } else {
                    document.getElementById('modal-forzar-cambio-pw')?.classList.add('active');
                }
                lb.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
                lb.disabled = false;
                toast('Completá usuario, nombre y contraseña del administrador.', 'info');
                return;
            }
            try {
                const apiTidLogin = Number(loginJwtPayload?.user?.tenant_id);
                if (Number.isFinite(apiTidLogin) && apiTidLogin > 0) {
                    u.tenant_id = apiTidLogin;
                }
            } catch (_) {}
            if (!getApiToken()) {
                toast('La API (JWT) no respondió: el setup SaaS y datos del tenant pueden no cargar hasta que revises API_BASE_URL o la red.', 'warning');
            }
            const forzarCambioPw = !!u.must_change_password;
            if (forzarCambioPw) {
                const pendPw = { u, passwordActual: pw, primeraContrasenaApi: true };
                window._pendingAndroidPasswordChange = pendPw;
                if (typeof window.__gnAbrirModalPrimerIngresoBootstrap === 'function') {
                    window.__gnAbrirModalPrimerIngresoBootstrap(pendPw);
                } else {
                    document.getElementById('modal-forzar-cambio-pw')?.classList.add('active');
                }
                lb.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
                lb.disabled = false;
                toast('Completá usuario, nombre y contraseña del administrador.', 'info');
                return;
            }
            entrarConUsuario(u, false);
            toast('Bienvenido ' + u.nombre, 'success');
            try {
                if (typeof window._gnCheckDefaultCreds !== 'function') {
                    await import('./modules/suggest-change-creds.js');
                }
            } catch (_) {}
            if (typeof window._gnCheckDefaultCreds === 'function') window._gnCheckDefaultCreds(loginJwtPayload, pw);
        } else {
            if (loginApiFallo?.code === 'login_tenant_ambiguous') {
                if (le) {
                    le.textContent =
                        'Hay más de una cuenta con ese usuario en distintos tenants. Usá el asistente de configuración o contactá al administrador.';
                }
            } else if (!getApiBaseUrl()) {
                if (le) {
                    le.textContent =
                        'Falta api.baseUrl en config.json. Las contraseñas seguras solo validan por la API.';
                }
            } else if (loginApiFallo?.network) {
                if (le) {
                    le.textContent =
                        'No se pudo conectar con el servidor (API). Revisá la red o probá en unos minutos.';
                }
            } else if (loginApiFallo?.status === 401 && le) {
                le.textContent =
                    'Usuario o contraseña incorrectos. Verificá el usuario de login definido y la contraseña en texto plano (no un código que empiece con $2a$).';
            } else if (le) {
                le.textContent = 'Usuario o contraseña incorrectos.';
            }
        }
    } catch (error) {
        console.error('Error inesperado en login:', error);
        if (!intentarOffline()) {
            if (le) le.textContent = 'Error inesperado. Intentá de nuevo.';
        }
    } finally {
        endLoginAttempt();
        lb.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
        lb.disabled = false;
    }
};
/** Expuesto para index.html (#lb) y login biométrico; el trap en login-biometric-android.js lo envuelve. */
window.__gnEjecutarLogin = gnLoginSubmitHandler;
if (lfLogin) {
    const _gnDispatchLogin = (e) => {
        const fn = window.__gnEjecutarLogin;
        if (typeof fn === 'function') return fn(e);
        return gnLoginSubmitHandler(e);
    };
    lfLogin.addEventListener('submit', _gnDispatchLogin);
    for (const id of ['em', 'pw']) {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            try {
                e.preventDefault();
            } catch (_) {}
            _gnDispatchLogin(e);
        });
    }
}

(function wrapConfirmGestorNova() {
    if (typeof window === 'undefined' || window.__gnConfirmWrapped) return;
    const orig = window.confirm.bind(window);
    window.confirm = function (msg) {
        return orig(gnDice(msg));
    };
    window.__gnConfirmWrapped = true;
})();

(function wrapAlertGestorNova() {
    if (typeof window === 'undefined' || window.__gnAlertWrapped) return;
    const orig = window.alert.bind(window);
    window.alert = function (msg) {
        orig(gnDice(msg));
    };
    window.__gnAlertWrapped = true;
})();

/**
 * Unifica valores legacy o anglosajones (`EnProgreso`, `en_progreso`, sin tilde) con los estados del panel.
 * Canónicos: Pendiente | Asignado | En ejecución | Cerrado | Derivado externo
 */
function normalizarEstadoPedidoUi(raw) {
    const s0 = raw == null || raw === '' ? 'Pendiente' : String(raw).trim();
    if (!s0) return 'Pendiente';
    const low = s0.toLowerCase().replace(/\s+/g, ' ');
    const compact = low.replace(/[\s_-]/g, '');
    if (low === 'derivado externo' || compact === 'derivadoexterno') return 'Derivado externo';
    if (low === 'cerrado') return 'Cerrado';
    if (low === 'desestimado' || compact === 'desestimado') return 'Desestimado';
    if (low === 'pendiente') return 'Pendiente';
    if (low === 'asignado') return 'Asignado';
    if (
        low === 'en ejecución' ||
        low === 'en ejecucion' ||
        compact === 'enejecución' ||
        compact === 'enejecucion' ||
        compact === 'enprogreso' ||
        low === 'en progreso' ||
        compact === 'inprogress' ||
        compact === 'encurso' ||
        low === 'en curso'
    ) {
        return 'En ejecución';
    }
    return s0;
}
if (typeof window !== 'undefined') window.normalizarEstadoPedidoUi = normalizarEstadoPedidoUi;

const norm = p => ({
    id: p.id,
    np: p.numero_pedido,
    f: p.fecha_creacion || p.fecha || new Date().toISOString(),
    fc: p.fecha_cierre || null,
    fa: p.fecha_avance || null,
    dis: p.distribuidor || '',
    br: String(p.barrio || '').trim(),
    trf: String(p.trafo || p.setd || '').trim(),
    cl: p.cliente || '',
    tt: p.tipo_trabajo || '',
    de: p.descripcion || '',
    pr: p.prioridad || 'Media',
    es: normalizarEstadoPedidoUi(p.estado),
    av: parseInt(p.avance) || 0,
    la: (() => {
        const raw = p.lat != null && p.lat !== '' ? p.lat : p.latitud;
        if (raw == null || raw === '') return null;
        const v = parseFloat(String(raw).trim().replace(',', '.'));
        return Number.isFinite(v) ? v : null;
    })(),
    ln: (() => {
        const raw = p.lng != null && p.lng !== '' ? p.lng : p.longitud;
        if (raw == null || raw === '') return null;
        const v = parseFloat(String(raw).trim().replace(',', '.'));
        return Number.isFinite(v) ? v : null;
    })(),
    ui: p.usuario_id,
    tr: p.trabajo_realizado || null,
    tc: p.tecnico_cierre || null,
    fotos: p.foto_base64 ? p.foto_base64.split('||') : [],
    foto_cierre: p.foto_cierre || null,
    uc: p.usuario_creador_id,
    ui2: p.usuario_inicio_id,
    uav: p.usuario_avance_id,
    uci: p.usuario_cierre_id,
    x_inchauspe: p.x_inchauspe,
    y_inchauspe: p.y_inchauspe,
    nis: (p.nis || '').trim(),
    med: (p.medidor || '').trim(),
    nis_med: (p.nis_medidor || '').trim(),
    cdir: (p.cliente_direccion || '').trim(),
    cnom: (p.cliente_nombre || p.cliente || '').trim(),
    ccal: (p.cliente_calle || '').trim(),
    cnum: (p.cliente_numero_puerta || '').trim(),
    cloc: (p.cliente_localidad || '').trim(),
    cpcia: (p.provincia || '').trim(),
    ccp: (p.codigo_postal || '').trim(),
    stc: (p.suministro_tipo_conexion || '').trim(),
    sfs: (p.suministro_fases || '').trim(),
    tai: (() => {
        const v =
            p.tecnico_asignado_id ??
            p.tecnicoAsignadoId ??
            p.TECNICO_ASIGNADO_ID ??
            p.tecnico_asignado;
        if (v == null || v === '') return null;
        const n = parseInt(String(v).trim(), 10);
        return Number.isFinite(n) ? n : null;
    })(),
    fasi: p.fecha_asignacion || null,
    firma: p.firma_cliente || null,
    chkl: p.checklist_seguridad || null,
    tel: (p.telefono_contacto || '').trim(),
    opin: (() => {
        const v = p.opinion_cliente;
        if (v == null || v === '') return null;
        const s = String(v).trim();
        return s || null;
    })(),
    fopin: p.fecha_opinion_cliente || null,
    oes: (() => {
        const n = parseInt(p.opinion_cliente_estrellas, 10);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
    })(),
    odesc: (() => {
        const v = p.opinion_descargo_empresa;
        if (v == null || v === '') return null;
        const s = String(v).trim();
        return s || null;
    })(),
    fodesc: p.fecha_descargo_empresa || null,
    orc: String(p.origen_reclamo || '').trim().toLowerCase(),
    dex: !!(
        p.derivado_externo === true ||
        p.derivado_externo === 't' ||
        p.derivado_externo === 1 ||
        normalizarEstadoPedidoUi(p.estado) === 'Derivado externo'
    ),
    dda: String(p.derivado_a || '').trim(),
    ddn: String(p.derivado_destino_nombre || '').trim(),
    fder: p.fecha_derivacion || null,
    uider: p.usuario_derivacion_id != null ? parseInt(p.usuario_derivacion_id, 10) : null,
    dnota: String(p.derivacion_nota || '').trim(),
    dsnap: String(p.derivacion_mensaje_snapshot || '').trim(),
    sdpen: !!(
        p.solicitud_derivacion_pendiente === true ||
        p.solicitud_derivacion_pendiente === 't' ||
        p.solicitud_derivacion_pendiente === 1
    ),
    sdm: String(p.solicitud_derivacion_motivo || '').trim(),
    sdf: p.solicitud_derivacion_fecha || null,
    sduid:
        p.solicitud_derivacion_usuario_id != null
            ? parseInt(p.solicitud_derivacion_usuario_id, 10)
            : null,
    sddsu: String(p.solicitud_derivacion_destino_sugerido || '').trim(),
    mdes: String(p.motivo_desestimacion || '').trim(),
    inci: p.incidencia_id != null ? parseInt(String(p.incidencia_id), 10) || null : null,
    wgeo: (() => {
        const g = p.geocode_log_whatsapp;
        if (g == null || g === '') return null;
        if (typeof g === 'object' && !Array.isArray(g)) return g;
        try {
            return JSON.parse(String(g));
        } catch (_) {
            return null;
        }
    })(),
    gaudit: (() => {
        const g = p.geocoding_audit;
        if (g == null || g === '') return null;
        if (typeof g === 'object' && !Array.isArray(g)) return g;
        try {
            return JSON.parse(String(g));
        } catch (_) {
            return null;
        }
    })(),
});

if (typeof window !== 'undefined') window.gnNormPedidoDesdeApi = norm;

if (typeof window !== 'undefined' && !window._pedidoCoordsInferidas) window._pedidoCoordsInferidas = {};

/** WGS84 finito, no (0,0), dentro de rango — pin útil en mapa (no confundir con domicilio exacto). */
function coordsSonPinValidasMapaWgs84(la, ln) {
    const a = Number(la);
    const b = Number(ln);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (a === 0 && b === 0) return false;
    if (a < -90 || a > 90 || b < -180 || b > 180) return false;
    return true;
}

/** Texto admin: cómo se obtuvo el pin (política A / re-geocodificación). */
function etiquetaModoUbicPedido(a) {
    if (!a || typeof a !== 'object') return '';
    const ma = String(a.metodo_ancla || '').trim();
    const anclaEtq = {
        nominatim_inicio_num1: 'Ancla Nominatim (n°1 como inicio aprox.)',
        overpass_addr_min: 'Ancla Overpass (menor addr:housenumber en la zona)',
        overpass_geom_first_node: 'Ancla Overpass (primer nodo, vía más larga)',
    };
    const preAncla = ma ? `${anclaEtq[ma] || `Ancla: ${ma}`}. ` : '';
    const m = String(a.modo || '').trim();
    if (m === 'interpolado_via') {
        return `${preAncla}Aproximada — interpolación sobre vía OSM y vereda por paridad (heurística; no es medición catastral).`;
    }
    if (m === 'localidad') {
        return `${preAncla}Aproximada — centro o búsqueda por localidad / ciudad.`;
    }
    if (m === 'tenant') {
        return `${preAncla}Aproximada — sede o área de referencia del tenant.`;
    }
    if (m === 'region') {
        return `${preAncla}Muy aproximada — región o respaldo geográfico (último recurso).`;
    }
    if (m === 'exacto_aprox') {
        return `${preAncla}Según mapas / catálogo; puede no coincidir con la puerta exacta.`;
    }
    if (m === 'aprox') return `${preAncla}Aproximada (ver fuente en auditoría).`;
    if (preAncla) return preAncla.trim();
    return '';
}

/** Coordenadas para mapa: columnas del pedido; si faltan, último log WA en servidor (`geocode_log_whatsapp`). */
function coordsEfectivasPedidoMapa(p) {
    if (!p) return { la: null, ln: null };
    if (coordsSonPinValidasMapaWgs84(p.la, p.ln)) return { la: Number(p.la), ln: Number(p.ln) };
    const altLa = Number(p.latitud ?? p.lat ?? p.coords_lat);
    const altLn = Number(p.longitud ?? p.lng ?? p.coords_lng);
    if (coordsSonPinValidasMapaWgs84(altLa, altLn)) return { la: altLa, ln: altLn };
    const w = p.wgeo;
    if (w && typeof w === 'object') {
        const wla = Number(w.lat);
        const wln = Number(w.lng);
        const pinOk =
            w.pin_ok === true || (w.success === true && coordsSonPinValidasMapaWgs84(wla, wln));
        if (pinOk && coordsSonPinValidasMapaWgs84(wla, wln)) {
            return { la: wla, ln: wln };
        }
    }
    const inf = window._pedidoCoordsInferidas && window._pedidoCoordsInferidas[String(p.id)];
    if (inf && coordsSonPinValidasMapaWgs84(inf.la, inf.ln)) return { la: Number(inf.la), ln: Number(inf.ln) };
    return { la: null, ln: null };
}

/** Igual que api/utils/parseDomicilioArg.js — texto libre tipo "Doctor Haedo 365, Hasenkamp". */
function parseDomicilioLibreArgentinaFront(cdir, localidadFallback) {
    const raw = String(cdir || '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,.;-]+|[\s,.;-]+$/g, '')
        .trim();
    if (!raw) return null;
    const fb =
        localidadFallback != null && String(localidadFallback).trim() ? String(localidadFallback).trim() : null;
    const mComa = raw.match(/^(.+?)\s+(\d{1,6})\s*[,;]\s*(.+)$/i);
    if (mComa) {
        return { calle: mComa[1].trim(), numero: mComa[2].trim(), localidad: mComa[3].trim() };
    }
    const soloNum = raw.match(/^(.+?)\s+(\d{1,6})$/);
    if (soloNum && fb) {
        return { calle: soloNum[1].trim(), numero: soloNum[2].trim(), localidad: fb };
    }
    const triple = raw.match(
        /^(.+?)\s+(\d{1,6})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s\-.]{2,79})$/u
    );
    if (triple) {
        const locCand = triple[3].trim();
        if (!/^\d+$/.test(locCand) && locCand.length >= 3) {
            return { calle: triple[1].trim(), numero: triple[2].trim(), localidad: locCand };
        }
    }
    return null;
}

function domicilioParaGeocodePedido(p) {
    if (!p) return null;
    let calle = (p.ccal || '').trim();
    let loc = (p.cloc || '').trim();
    let num = (p.cnum || '').trim();
    const cdir = (p.cdir || '').trim();
    if (calle && loc) return { calle, loc, num };
    const parsed = cdir ? parseDomicilioLibreArgentinaFront(cdir, loc || null) : null;
    if (parsed && parsed.calle && parsed.localidad) {
        return {
            calle: parsed.calle,
            loc: parsed.localidad,
            num: num || parsed.numero || '',
        };
    }
    return null;
}

/** URL de la UI pública de Nominatim (solo admin / diagnóstico; el proxy sigue siendo la API Node). */
function nominatimUiSearchUrlFromTexto(texto) {
    let q = String(texto || '')
        .replace(/\s+/g, ' ')
        .trim();
    const m = q.match(/^q="([^"]+)"/);
    if (m) q = m[1];
    if (q.length < 2) return '';
    return `https://nominatim.openstreetmap.org/ui/search.html?q=${encodeURIComponent(q)}`;
}

function _normGeoTxt(s) {
    try {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    } catch (_) {
        return String(s || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }
}

/* ——— Log visible admin: geocodificación / proxy Nominatim (GitHub Pages; no OSM directo) ——— */
const GN_GEOCODE_LOG_STORAGE_KEY = 'gn_geocode_admin_ui_log_v1';
const GN_GEOCODE_LOG_MAX_LINES = 380;
let _gnGeocodeUiLogDepth = 0;
let _gnGeocodeLogLines = [];
let _gnGeocodeLogPersistTimer = null;
let _gnGeocodeLogDockBound = false;

function _gnGeocodeLogTs() {
    try {
        return new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    } catch (_) {
        return '';
    }
}

function gnGeocodeUiLogIsActive() {
    return _gnGeocodeUiLogDepth > 0;
}

function gnGeocodeUiLogStartSession(mensaje) {
    if (typeof esAdmin !== 'function' || !esAdmin()) return;
    _gnGeocodeUiLogDepth++;
    if (_gnGeocodeUiLogDepth === 1) {
        gnGeocodeUiLogAppend('info', mensaje || 'Sesión de geocodificación iniciada.');
    }
}

function gnGeocodeUiLogEndSession() {
    if (typeof esAdmin !== 'function' || !esAdmin()) return;
    if (_gnGeocodeUiLogDepth > 0) _gnGeocodeUiLogDepth--;
    if (_gnGeocodeUiLogDepth === 0) {
        gnGeocodeUiLogAppend('info', 'Sesión de geocodificación finalizada.');
    }
}

function _gnGeocodeLogPersistSoon() {
    if (_gnGeocodeLogPersistTimer) clearTimeout(_gnGeocodeLogPersistTimer);
    _gnGeocodeLogPersistTimer = setTimeout(() => {
        _gnGeocodeLogPersistTimer = null;
        try {
            const tail = _gnGeocodeLogLines.slice(-120).map((x) => ({ ts: x.ts, level: x.level, text: x.text }));
            sessionStorage.setItem(GN_GEOCODE_LOG_STORAGE_KEY, JSON.stringify(tail));
        } catch (_) {}
    }, 400);
}

function gnGeocodeUiLogAppend(level, message, opts) {
    if (typeof esAdmin !== 'function' || !esAdmin()) return;
    const o = opts && typeof opts === 'object' ? opts : {};
    const lv = level === 'warn' || level === 'error' || level === 'info' ? level : 'info';
    const text = String(message || '').trim() || '—';
    const line = { t: Date.now(), ts: _gnGeocodeLogTs(), level: lv, text };
    _gnGeocodeLogLines.push(line);
    if (_gnGeocodeLogLines.length > GN_GEOCODE_LOG_MAX_LINES) {
        _gnGeocodeLogLines.splice(0, _gnGeocodeLogLines.length - GN_GEOCODE_LOG_MAX_LINES);
    }
    const body = document.getElementById('gn-geocode-log-body');
    if (body) {
        const row = document.createElement('div');
        row.className = `gn-geocode-log-line gn-geocode-log-line--${lv}`;
        row.setAttribute('role', 'listitem');
        row.textContent = `[${line.ts}] [${lv.toUpperCase()}] ${text}`;
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
    }
    if (o.openPanel) gnGeocodeAdminLogOpenPanel();
    if (lv === 'error' && typeof toast === 'function' && o.toast !== false) {
        const short = text.length > 160 ? `${text.slice(0, 157)}…` : text;
        toast(short, 'error', 9000);
    }
    if (lv === 'warn' && typeof toast === 'function' && o.toast === true) {
        toast(text.length > 180 ? `${text.slice(0, 177)}…` : text, 'warning', 7000);
    }
    _gnGeocodeLogPersistSoon();
}

function gnGeocodeUiLogClear() {
    _gnGeocodeLogLines = [];
    const body = document.getElementById('gn-geocode-log-body');
    if (body) body.innerHTML = '';
    try {
        sessionStorage.removeItem(GN_GEOCODE_LOG_STORAGE_KEY);
    } catch (_) {}
}

function gnGeocodeUiLogCopyAll() {
    const txt = _gnGeocodeLogLines.map((x) => `[${x.ts}] [${x.level}] ${x.text}`).join('\n');
    if (!txt.trim()) {
        if (typeof toast === 'function') toast('No hay líneas para copiar.', 'info');
        return;
    }
    const run = () => {
        if (typeof toast === 'function') toast('Registro copiado al portapapeles.', 'success');
    };
    if (window.AndroidDevice && typeof window.AndroidDevice.copyText === 'function') {
        try {
            window.AndroidDevice.copyText(txt);
            run();
            return;
        } catch (_) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(run).catch(() => {
            if (typeof toast === 'function') toast('No se pudo copiar (permiso del navegador).', 'warning');
        });
        return;
    }
    if (typeof toast === 'function') toast('Copiar no disponible en este entorno.', 'warning');
}

function gnGeocodeAdminLogOpenPanel() {
    const panel = document.getElementById('gn-geocode-log-panel');
    const fab = document.getElementById('gn-geocode-log-fab');
    if (!panel || !fab) return;
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    gnWaGeoOpsStartPoll();
}

function gnGeocodeAdminLogClosePanel() {
    const panel = document.getElementById('gn-geocode-log-panel');
    const fab = document.getElementById('gn-geocode-log-fab');
    if (!panel || !fab) return;
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    gnWaGeoOpsStopPoll();
}

function gnGeocodeAdminLogSyncDockVisibility() {
    const root = document.getElementById('gn-geocode-log-root');
    if (!root) return;
    const show = typeof esAdmin === 'function' && esAdmin() && !modoOffline;
    if (show) {
        root.hidden = false;
        gnGeocodeAdminLogBindDockOnce();
    } else {
        root.hidden = true;
        gnGeocodeAdminLogClosePanel();
    }
}

function gnGeocodeAdminLogBindDockOnce() {
    if (_gnGeocodeLogDockBound) return;
    _gnGeocodeLogDockBound = true;
    document.getElementById('gn-geocode-log-fab')?.addEventListener('click', () => {
        const panel = document.getElementById('gn-geocode-log-panel');
        if (!panel) return;
        if (panel.hidden) gnGeocodeAdminLogOpenPanel();
        else gnGeocodeAdminLogClosePanel();
    });
    document.getElementById('gn-geocode-log-collapse')?.addEventListener('click', gnGeocodeAdminLogClosePanel);
    document.getElementById('gn-geocode-log-clear')?.addEventListener('click', () => {
        gnGeocodeUiLogClear();
        if (typeof toast === 'function') toast('Registro de geocodificación vaciado.', 'info');
    });
    document.getElementById('gn-geocode-log-copy')?.addEventListener('click', gnGeocodeUiLogCopyAll);
    gnWaGeoOpsBindControlsOnce();
    try {
        const raw = sessionStorage.getItem(GN_GEOCODE_LOG_STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : null;
        const body = document.getElementById('gn-geocode-log-body');
        if (Array.isArray(arr) && body && !body.childElementCount && arr.length) {
            for (const row of arr) {
                if (!row || !row.text) continue;
                const lv = row.level === 'warn' || row.level === 'error' ? row.level : 'info';
                const ts = row.ts != null ? String(row.ts) : _gnGeocodeLogTs();
                _gnGeocodeLogLines.push({ t: Date.now(), ts, level: lv, text: String(row.text) });
                const el = document.createElement('div');
                el.className = `gn-geocode-log-line gn-geocode-log-line--${lv}`;
                el.textContent = `[${ts}] [${lv.toUpperCase()}] ${String(row.text)}`;
                body.appendChild(el);
            }
            body.scrollTop = body.scrollHeight;
        }
    } catch (_) {}
}

/** Admin: inyecta en el dock el log de re-geocodificación guardado en servidor (WhatsApp o pedido sin pin). Una vez por sesión de navegador y pedido cuando hay `wgeo`. */
function gnGeocodePrecargarWhatsappRegeoLog(p) {
    if (typeof esAdmin !== 'function' || !esAdmin()) return;
    if (!p) return;
    const wa = String(p.orc || '').toLowerCase() === 'whatsapp';
    const sinPin = !coordsSonPinValidasMapaWgs84(p.la, p.ln);
    if (!wa && !sinPin) return;
    const w = p.wgeo;
    if (!w || typeof w !== 'object') {
        if (wa && sinPin) {
            try {
                const kw = `gn_nogeolog_warn_${p.id}`;
                if (sessionStorage.getItem(kw) === '1') return;
                sessionStorage.setItem(kw, '1');
                gnGeocodeAdminLogBindDockOnce();
                gnGeocodeUiLogStartSession(`Re-geocodificación servidor — pedido #${p.id}`);
                gnGeocodeUiLogAppend(
                    'warn',
                    'Aún no hay registro de re-geocodificación en el servidor (puede estar en curso). Volvé a abrir el pedido en unos segundos o usá Re-geocodificar.'
                );
                gnGeocodeUiLogEndSession();
                gnGeocodeAdminLogOpenPanel();
            } catch (_) {}
        }
        return;
    }
    const key = `gn_wa_geolog_done_${p.id}`;
    try {
        if (sessionStorage.getItem(key) === '1') return;
        sessionStorage.setItem(key, '1');
    } catch (_) {}
    gnGeocodeAdminLogBindDockOnce();
    gnGeocodeUiLogStartSession(
        `Re-geocodificación en servidor — pedido #${p.id}${wa ? ' (WhatsApp)' : ' (sin pin)'}`
    );
    if (w.at) gnGeocodeUiLogAppend('info', `Instante: ${w.at}`);
    if (w.pipeline) gnGeocodeUiLogAppend('info', `Pipeline: ${String(w.pipeline)}`);
    gnGeocodeUiLogAppend(
        'info',
        `Resumen servidor: ${w.success ? 'coords OK' : 'sin coords'} · fuente: ${
            w.fuente_final != null ? String(w.fuente_final) : w.fuente != null ? String(w.fuente) : '—'
        }`
    );
    if (w.mensaje) gnGeocodeUiLogAppend(w.success ? 'info' : 'warn', String(w.mensaje));
    const lines = Array.isArray(w.log) ? w.log : [];
    for (const line of lines.slice(0, 150)) {
        gnGeocodeUiLogAppend('info', String(line));
    }
    const errs = Array.isArray(w.errores) ? w.errores : [];
    for (const e of errs.slice(0, 30)) {
        gnGeocodeUiLogAppend('warn', typeof e === 'object' ? JSON.stringify(e) : String(e));
    }
    const pinOk = w.pin_ok === true || (w.success && coordsSonPinValidasMapaWgs84(w.lat, w.lng));
    if (pinOk && Number.isFinite(Number(w.lat)) && Number.isFinite(Number(w.lng))) {
        gnGeocodeUiLogAppend(
            'info',
            `Pin (servidor): SÍ (${Number(w.lat).toFixed(5)}, ${Number(w.lng).toFixed(5)})`
        );
    } else {
        gnGeocodeUiLogAppend(
            'warn',
            'Pin (servidor): NO — revisá domicilio o usá Re-geocodificar en el detalle.'
        );
    }
    gnGeocodeUiLogEndSession();
    gnGeocodeAdminLogOpenPanel();
}

if (typeof window !== 'undefined') {
    window.etiquetaModoUbicPedido = etiquetaModoUbicPedido;
    window.gnGeocodeUiLogAppend = gnGeocodeUiLogAppend;
    window.gnGeocodeUiLogStartSession = gnGeocodeUiLogStartSession;
    window.gnGeocodeUiLogEndSession = gnGeocodeUiLogEndSession;
    window.gnGeocodeUiLogClear = gnGeocodeUiLogClear;
    window.gnGeocodeUiLogCopyAll = gnGeocodeUiLogCopyAll;
    window.gnGeocodeAdminLogSyncDockVisibility = gnGeocodeAdminLogSyncDockVisibility;
    window.gnGeocodeAdminLogOpenPanel = gnGeocodeAdminLogOpenPanel;
    window.gnGeocodeAdminLogClosePanel = gnGeocodeAdminLogClosePanel;
    window.coordsSonPinValidasMapaWgs84 = coordsSonPinValidasMapaWgs84;
    window.coordsEfectivasPedidoMapa = coordsEfectivasPedidoMapa;
    window.nominatimUiSearchUrlFromTexto = nominatimUiSearchUrlFromTexto;
}

/** Campos de Nominatim donde suele aparecer la localidad declarada por el cliente. */
function _nominatimCamposLocalidad(addr) {
    if (!addr || typeof addr !== 'object') return [];
    const keys = [
        'city',
        'town',
        'village',
        'hamlet',
        'municipality',
        'city_district',
        'suburb',
        'neighbourhood',
        'county',
    ];
    const out = [];
    for (const k of keys) {
        const v = addr[k];
        if (v != null && String(v).trim()) out.push(String(v).trim());
    }
    return out;
}

function _nominatimResultadoCoincideLocalidad(r, locPedido) {
    const want = _normGeoTxt(locPedido);
    if (!want) return true;
    const dn = _normGeoTxt(r.display_name || '');
    if (dn.includes(want)) return true;
    const addr = r && r.address ? r.address : {};
    const fields = _nominatimCamposLocalidad(addr);
    for (const f of fields) {
        const nf = _normGeoTxt(f);
        if (!nf) continue;
        if (nf === want || nf.includes(want) || want.includes(nf)) return true;
    }
    return false;
}

function _filtrarNominatimPorLocalidad(results, locPedido) {
    const arr = Array.isArray(results) ? results : [];
    return arr.filter((r) => _nominatimResultadoCoincideLocalidad(r, locPedido));
}

/** Cola global: una búsqueda proxy a la vez + pausa entre fin de una y la siguiente (política OSM ~1 req/s). */
const _NOMINATIM_PROXY_MIN_GAP_MS = 1800;
let _nominatimSearchQueue = Promise.resolve();
let _nominatimSearchLastEnd = 0;

/** Caché en memoria: misma consulta no golpea el proxy durante 5 min tras un OK. */
const _NOMINATIM_CLIENT_CACHE_MS = 5 * 60 * 1000;
const _nominatimClientSearchCache = new Map();

function _nominatimSearchCacheKey(merged) {
    const o = merged && typeof merged === 'object' ? merged : {};
    const keys = Object.keys(o).sort();
    const norm = {};
    for (const k of keys) {
        const v = o[k];
        if (v == null) continue;
        const s = String(v).trim();
        if (!s) continue;
        norm[String(k).toLowerCase()] = s;
    }
    return JSON.stringify(norm);
}

function _nominatimSearchEnqueue(run) {
    _nominatimSearchQueue = _nominatimSearchQueue.then(async () => {
        const wait = _nominatimSearchLastEnd + _NOMINATIM_PROXY_MIN_GAP_MS - Date.now();
        if (wait > 0) {
            await new Promise((r) => setTimeout(r, wait));
        }
        try {
            return await run();
        } finally {
            _nominatimSearchLastEnd = Date.now();
        }
    });
    return _nominatimSearchQueue;
}

/** Nominatim solo desde la API Node (GitHub Pages / navegador: CORS bloquea openstreetmap.org). */
async function _nominatimFetchSearch(params) {
    return _nominatimSearchEnqueue(async () => {
        const merged = params && typeof params === 'object' ? { ...params } : {};
        const ctx = String(merged.q || merged.street || '').trim() || '(sin q/street)';
        const cacheKey = _nominatimSearchCacheKey(merged);
        const now = Date.now();
        const mem = _nominatimClientSearchCache.get(cacheKey);
        if (mem && now - mem.at < _NOMINATIM_CLIENT_CACHE_MS && Array.isArray(mem.results)) {
            if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
                gnGeocodeUiLogAppend(
                    'info',
                    `Caché en memoria (~5 min): se reutilizan resultados sin nueva llamada al proxy. ${ctx.slice(0, 100)}${ctx.length > 100 ? '…' : ''}`
                );
            }
            return mem.results;
        }
        const backoffs = [1500, 4000, 9000, 16000, 22000];
        const maxAttempts = 5;
        try {
            if (modoOffline || typeof fetch !== 'function') {
                if (typeof esAdmin === 'function' && esAdmin()) {
                    gnGeocodeUiLogAppend(
                        'warn',
                        'Sin conexión (modo offline o sin fetch): no se puede consultar el mapa. Activá Internet o desactivá modo offline.',
                        { openPanel: gnGeocodeUiLogIsActive() }
                    );
                }
                return [];
            }
            await asegurarJwtApiRest();
            const token = getApiToken();
            if (!token) {
                if (typeof esAdmin === 'function' && esAdmin()) {
                    gnGeocodeUiLogAppend(
                        'error',
                        'Sin token de API para geocodificar. Cerrá sesión y volvé a entrar; si usás solo GitHub Pages, comprobá que el login haya obtenido JWT.',
                        { openPanel: true }
                    );
                }
                return [];
            }
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive() && attempt === 0) {
                    gnGeocodeUiLogAppend('info', `Consulta al proxy de mapas: ${ctx.slice(0, 140)}${ctx.length > 140 ? '…' : ''}`);
                }
                const r = await fetch(apiUrl('/api/geocode/nominatim/search'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ params: merged }),
                });
                const rateLimited = r.status === 503 || r.status === 429;
                if (r.ok) {
                    const j = await r.json().catch(() => ({}));
                    const out = Array.isArray(j.results) ? j.results : [];
                    _nominatimClientSearchCache.set(cacheKey, { at: Date.now(), results: out });
                    if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
                        if (out.length) {
                            const top = out[0];
                            const dn =
                                top && top.display_name != null
                                    ? String(top.display_name).slice(0, 140)
                                    : '(sin nombre en resultado)';
                            const fullDn = top && top.display_name != null ? String(top.display_name) : '';
                            gnGeocodeUiLogAppend(
                                'info',
                                `Respuesta OK: ${out.length} resultado(s). Primer candidato: ${dn}${fullDn.length > 140 ? '…' : ''}`
                            );
                        } else {
                            gnGeocodeUiLogAppend(
                                'warn',
                                'El servidor respondió bien pero sin coincidencias para esta búsqueda. Revisá calle, número y localidad en el pedido.'
                            );
                        }
                    }
                    return out;
                }
                if (rateLimited && attempt < maxAttempts - 1) {
                    console.info(
                        '[geocode-proxy] search HTTP',
                        r.status,
                        'reintento',
                        attempt + 1,
                        '/',
                        maxAttempts - 1,
                        'espera',
                        backoffs[attempt],
                        'ms',
                        ctx
                    );
                    if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
                        gnGeocodeUiLogAppend(
                            'info',
                            `Servicio de mapas ocupado (código ${r.status}). Reintento ${attempt + 1}/${maxAttempts - 1} tras ${Math.round(
                                backoffs[attempt] / 1000
                            )} s (límite del proveedor OSM).`
                        );
                    }
                    await new Promise((res) => setTimeout(res, backoffs[attempt]));
                    continue;
                }
                if (rateLimited) {
                    console.warn('[geocode-proxy] search agotó reintentos (503/429) para:', ctx);
                    if (typeof esAdmin === 'function' && esAdmin()) {
                        gnGeocodeUiLogAppend(
                            'error',
                            'El mapa no respondió a tiempo (503 o 429 tras reintentos). Esperá unos minutos y reintentá; si sigue igual, verificá que la API en Render esté activa.',
                            { openPanel: true }
                        );
                    }
                    return [];
                }
                console.warn('[geocode-proxy] search HTTP', r.status, '—', ctx);
                if (typeof esAdmin === 'function' && esAdmin()) {
                    if (r.status === 401 || r.status === 403) {
                        gnGeocodeUiLogAppend(
                            'error',
                            `Acceso denegado (${r.status}) al proxy de mapas: sesión o permisos. Cerrá sesión y volvé a entrar con usuario administrador.`,
                            { openPanel: true }
                        );
                    } else if (r.status >= 500) {
                        gnGeocodeUiLogAppend(
                            'error',
                            `Error del servidor (${r.status}) al geocodificar. Revisá el estado de la API (Render) o los logs del backend.`,
                            { openPanel: true }
                        );
                    } else {
                        gnGeocodeUiLogAppend(
                            'warn',
                            `Respuesta HTTP ${r.status} al buscar en el mapa. Revisá datos del pedido o probá más tarde.`,
                            { openPanel: gnGeocodeUiLogIsActive() }
                        );
                    }
                }
                return [];
            }
            return [];
        } catch (e) {
            console.warn('[geocode-proxy] search excepción', e && e.message ? e.message : e, ctx);
            if (typeof esAdmin === 'function' && esAdmin()) {
                const em = e && e.message ? String(e.message) : String(e);
                const low = em.toLowerCase();
                const isAbort = low.includes('abort') || (e && e.name === 'AbortError');
                gnGeocodeUiLogAppend(
                    'error',
                    isAbort
                        ? 'La búsqueda de mapa se cortó por tiempo o cancelación. Probá de nuevo con buena conexión.'
                        : `No se pudo contactar a la API (red o navegador): ${em}. Comprobá conexión y URL de la API.`,
                    { openPanel: true }
                );
            }
            return [];
        }
    });
}

/** viewbox = min_lon, max_lat, max_lon, min_lat (Nominatim). */
async function _nominatimViewboxLocalidad(loc) {
    const arr = await _nominatimFetchSearch({
        q: `${loc}, Argentina`,
        countrycodes: 'ar',
        limit: '2',
    });
    const hit = arr[0];
    if (!hit || !hit.boundingbox || hit.boundingbox.length < 4) return null;
    const [south, north, west, east] = hit.boundingbox.map((x) => Number(x));
    if (![south, north, west, east].every((n) => Number.isFinite(n))) return null;
    return `${west},${north},${east},${south}`;
}

function _nominatimMetaFromHit(r) {
    if (!r) return {};
    const addr = r.address && typeof r.address === 'object' ? r.address : {};
    return {
        display_name: String(r.display_name || '').trim(),
        type: r.type != null ? String(r.type) : '',
        house_number: addr.house_number != null ? String(addr.house_number).trim() : '',
    };
}

function _parseHouseNumberNominatim(addr) {
    const raw = addr && addr.house_number != null ? String(addr.house_number).trim() : '';
    if (!raw) return null;
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

function _nominatimTipoRankPedido(r) {
    const t = String((r && r.type) || '').toLowerCase();
    if (t === 'house') return 0;
    if (t === 'building' || t === 'apartments' || t === 'residential') return 1;
    return 2;
}

function _elegirMejorResultadoNominatimPorPuerta(results, numeroPuertaStr) {
    const arr = Array.isArray(results) ? results : [];
    if (!arr.length) return null;
    const target = parseInt(String(numeroPuertaStr || '').replace(/\D/g, ''), 10);
    const rows = [];
    for (const r of arr) {
        const la = Number(r.lat);
        const lo = Number(r.lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
        const hn = _parseHouseNumberNominatim(r.address || {});
        const typeR = _nominatimTipoRankPedido(r);
        let hnTier = 2;
        let hnDist = 9999;
        if (Number.isFinite(target)) {
            if (hn === target) hnTier = 0;
            else if (hn != null) {
                hnTier = 1;
                hnDist = Math.abs(hn - target);
            }
        } else if (hn != null) hnTier = 1;
        const sortKey = typeR * 10000 + hnTier * 1000 + hnDist;
        rows.push({ la, lo, hn, r, sortKey });
    }
    if (!rows.length) {
        const r0 = arr[0];
        const la = Number(r0.lat);
        const lo = Number(r0.lon);
        return Number.isFinite(la) && Number.isFinite(lo)
            ? {
                  lat: la,
                  lng: lo,
                  src: 'aprox',
                  nominatimMeta: _nominatimMetaFromHit(r0),
                  nominatimClass: r0.class != null ? String(r0.class) : '',
              }
            : null;
    }
    rows.sort((a, b) => a.sortKey - b.sortKey);
    const best = rows[0];
    let src = 'aprox';
    if (Number.isFinite(target) && best.hn === target) src = 'exacta';
    else if (Number.isFinite(target) && best.hn != null) src = 'vecino';
    else if (_nominatimTipoRankPedido(best.r) === 0) src = 'casa';
    else if (!Number.isFinite(target)) src = 'calle';
    return {
        lat: best.la,
        lng: best.lo,
        src,
        nominatimMeta: _nominatimMetaFromHit(best.r),
        nominatimClass: best.r.class != null ? String(best.r.class) : '',
    };
}

/** Línea final obligatoria del flujo de georreferenciación (sesión de log admin activa). */
function _gnGeocodeRegistrarResultadoPinPedido(p, hit, motivoNoPin) {
    if (typeof esAdmin !== 'function' || !esAdmin() || !gnGeocodeUiLogIsActive()) return;
    const id = p && p.id != null ? `#${p.id}` : '(sin id)';
    const lat = hit && hit.lat != null ? Number(hit.lat) : NaN;
    const lng = hit && hit.lng != null ? Number(hit.lng) : NaN;
    if (hit && coordsSonPinValidasMapaWgs84(lat, lng)) {
        const m = hit.nominatimMeta || {};
        const provIso = hit.src === 'ciudad_centro' ? ' · aprox. centro de localidad (no domicilio exacto en puerta)' : '';
        gnGeocodeUiLogAppend(
            'info',
            `Resultado elegido: type=${m.type || '—'}, class=${hit.nominatimClass != null ? String(hit.nominatimClass) : '—'}, house_number(OSM)=${m.house_number || '—'}.`
        );
        if (m.display_name) {
            const dn = m.display_name;
            gnGeocodeUiLogAppend('info', `display_name: ${dn.length > 200 ? `${dn.slice(0, 197)}…` : dn}`);
        }
        if (hit.qUsed) {
            const qu = String(hit.qUsed);
            gnGeocodeUiLogAppend('info', `Consulta / params que orientaron el hit: ${qu.length > 200 ? `${qu.slice(0, 197)}…` : qu}`);
        }
        const linkQ = (hit.qNominatimUi != null && String(hit.qNominatimUi).trim()) || (hit.qUsed != null && String(hit.qUsed).trim()) || '';
        const urlDemo = typeof nominatimUiSearchUrlFromTexto === 'function' ? nominatimUiSearchUrlFromTexto(linkQ) : '';
        if (urlDemo) gnGeocodeUiLogAppend('info', `Abrir en Nominatim (referencia): ${urlDemo}`);
        gnGeocodeUiLogAppend('info', `Pin: SÍ ${id} → (${lat.toFixed(6)}, ${lng.toFixed(6)}) [${hit.src || '—'}]${provIso}.`);
    } else {
        const mot = motivoNoPin || 'sin coordenadas válidas para el mapa';
        gnGeocodeUiLogAppend('warn', `Pin: NO ${id} — ${mot}.`);
    }
}

async function nominatimGeocodeDomicilioPedido(p) {
    const dom = domicilioParaGeocodePedido(p);
    if (!dom) {
        if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend(
                'warn',
                `Pin: NO pedido #${p && p.id != null ? p.id : '?'} — sin domicilio estructurado (calle + localidad o texto cdir con patrón reconocible).`
            );
        }
        return null;
    }
    const adminSess = typeof esAdmin === 'function' && esAdmin();
    const startOwnUiSession = adminSess && !gnGeocodeUiLogIsActive();
    if (startOwnUiSession) {
        gnGeocodeUiLogStartSession(
            `Geocodificación Nominatim (domicilio) — pedido #${p && p.id != null ? p.id : '?'} · ${dom.calle || ''} / ${dom.loc || ''}`
        );
    }
    try {
        const calle = dom.calle;
        const loc = dom.loc;
        const num = (dom.num || '').trim();
        const streetLine = num ? `${num} ${calle}` : calle;
        let calleSinTilde = calle;
        try {
            calleSinTilde = String(calle)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        } catch (_) {}

        if (adminSess && gnGeocodeUiLogIsActive()) {
            const prov = p && String(p.cpcia || '').trim() ? ` · provincia decl.="${String(p.cpcia).trim()}"` : '';
            const cp = p && String(p.ccp || '').trim() ? ` · CP="${String(p.ccp).trim()}"` : '';
            gnGeocodeUiLogAppend(
                'info',
                `Datos recibidos: calle="${calle}", número="${num || '—'}", localidad="${loc}"${prov}${cp}.`
            );
            gnGeocodeUiLogAppend(
                'info',
                'Estrategia: variantes con parámetro q (Nominatim “simple”), luego street+city+country, búsqueda con viewbox de la localidad, y último recurso centro de la localidad (aprox., no puerta exacta).'
            );
        }

        const intentar = async (lista, qUsedLabel, qNominatimUi) => {
            const fil = _filtrarNominatimPorLocalidad(lista, loc);
            const h = _elegirMejorResultadoNominatimPorPuerta(fil.length ? fil : [], num);
            if (!h) return null;
            const out = { ...h, qUsed: qUsedLabel };
            if (qNominatimUi) out.qNominatimUi = qNominatimUi;
            return out;
        };

        const baseSearch = { countrycodes: 'ar', limit: '25', addressdetails: '1' };
        const qList = [];
        const pushQ = (q) => {
            const s = String(q || '')
                .replace(/\s+/g, ' ')
                .trim();
            if (s.length >= 4 && !qList.includes(s)) qList.push(s);
        };
        if (num) {
            pushQ(`${calle} ${num}, ${loc}`);
            pushQ(`${calle} ${num}, ${loc}, Argentina`);
            if (calleSinTilde !== calle) pushQ(`${calleSinTilde} ${num}, ${loc}, Argentina`);
            pushQ(`${num} ${calle}, ${loc}, Argentina`);
            pushQ(`${streetLine}, ${loc}, Argentina`);
            pushQ(`${streetLine}, ${loc}`);
        } else {
            pushQ(`${calle}, ${loc}, Argentina`);
            pushQ(`${calle}, ${loc}`);
        }

        let qi = 0;
        for (const q of qList) {
            if (adminSess && gnGeocodeUiLogIsActive() && qi === 0) {
                gnGeocodeUiLogAppend(
                    'info',
                    `Primera consulta (param q, coherente con “simple search”): ${q.length > 160 ? `${q.slice(0, 157)}…` : q}`
                );
            }
            qi++;
            const raw = await _nominatimFetchSearch({ ...baseSearch, q });
            const hit = await intentar(raw, `q="${q}" (countrycodes=ar, limit)`, q);
            if (hit) {
                _gnGeocodeRegistrarResultadoPinPedido(p, hit, null);
                return hit;
            }
        }

        if (adminSess && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend(
                'info',
                `Búsqueda estructurada: street="${streetLine}", city="${loc}", country=Argentina (limit 15).`
            );
        }
        let raw = await _nominatimFetchSearch({
            street: streetLine,
            city: loc,
            country: 'Argentina',
            ...baseSearch,
            limit: '15',
        });
        const qUiStruct = `${streetLine}, ${loc}, Argentina`;
        let hit = await intentar(
            raw,
            `street=${JSON.stringify(streetLine)}, city=${JSON.stringify(loc)}, country=Argentina`,
            qUiStruct
        );
        if (hit) {
            _gnGeocodeRegistrarResultadoPinPedido(p, hit, null);
            return hit;
        }

        if (adminSess && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend('info', `Reintento estructurado: street="${calle}" (sin n° en street), city="${loc}".`);
        }
        raw = await _nominatimFetchSearch({
            street: calle,
            city: loc,
            country: 'Argentina',
            ...baseSearch,
            limit: '15',
        });
        const qUiStruct2 = `${calle}, ${loc}, Argentina`;
        hit = await intentar(raw, `street=${JSON.stringify(calle)}, city=${JSON.stringify(loc)}`, qUiStruct2);
        if (hit) {
            _gnGeocodeRegistrarResultadoPinPedido(p, hit, null);
            return hit;
        }

        const vb = await _nominatimViewboxLocalidad(loc);
        if (vb) {
            if (adminSess && gnGeocodeUiLogIsActive()) {
                gnGeocodeUiLogAppend('info', 'Viewbox de la localidad obtenido; búsquedas q acotadas (bounded=1).');
            }
            for (const q of qList) {
                raw = await _nominatimFetchSearch({
                    ...baseSearch,
                    q,
                    viewbox: vb,
                    bounded: '1',
                });
                const hitV = await intentar(raw, `q="${q}" + viewbox acotado + bounded=1`, q);
                if (hitV) {
                    _gnGeocodeRegistrarResultadoPinPedido(p, hitV, null);
                    return hitV;
                }
            }
        }

        if (num) {
            raw = await _nominatimFetchSearch({ ...baseSearch, q: `${calle}, ${loc}, Argentina` });
            hit = await intentar(
                raw,
                `q="${calle}, ${loc}, Argentina" (sin n° en calle, sólo q)`,
                `${calle}, ${loc}, Argentina`
            );
            if (hit) {
                _gnGeocodeRegistrarResultadoPinPedido(p, hit, null);
                return hit;
            }
        }

        if (adminSess && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend('info', `Último recurso: centro aproximado de localidad con q="${loc}, Argentina".`);
        }
        raw = await _nominatimFetchSearch({
            q: `${loc}, Argentina`,
            countrycodes: 'ar',
            limit: '5',
            addressdetails: '1',
        });
        if (raw && raw.length > 0) {
            const locLow = loc.toLowerCase();
            const cityHit =
                raw.find((h) => {
                    const n = String(h.display_name || '').toLowerCase();
                    return n.includes(locLow) && n.includes('argentina');
                }) || raw[0];
            if (cityHit) {
                const la = Number(cityHit.lat);
                const lo = Number(cityHit.lon);
                if (Number.isFinite(la) && Number.isFinite(lo)) {
                    const hitCentro = {
                        lat: la,
                        lng: lo,
                        src: 'ciudad_centro',
                        qUsed: `q="${loc}, Argentina" (centro localidad, aprox.)`,
                        qNominatimUi: `${loc}, Argentina`,
                        nominatimMeta: _nominatimMetaFromHit(cityHit),
                        nominatimClass: cityHit.class != null ? String(cityHit.class) : '',
                    };
                    if (adminSess && gnGeocodeUiLogIsActive()) {
                        gnGeocodeUiLogAppend(
                            'info',
                            `Se usa centro aproximado de "${loc}" (Nominatim sin puerta exacta en mapa).`
                        );
                    }
                    _gnGeocodeRegistrarResultadoPinPedido(p, hitCentro, null);
                    return hitCentro;
                }
            }
        }

        const noTok = typeof getApiToken === 'function' && !getApiToken();
        _gnGeocodeRegistrarResultadoPinPedido(
            p,
            null,
            noTok
                ? 'sin token JWT para el proxy de mapas (cerrá sesión y volvé a entrar como admin)'
                : 'sin resultados tras variantes q + street/city + viewbox; Nominatim vacío o sin coincidencia con la localidad indicada'
        );
        return null;
    } finally {
        if (startOwnUiSession) gnGeocodeUiLogEndSession();
    }
}

/** Re-geocodificación servidor (pipeline catálogo-first); sin diálogo. Solo admin + JWT. */
async function intentarCoordsPedidoDesdeApiRegeocodificar(p) {
    if (!esAdmin() || !puedeEnviarApiRestPedidos()) return null;
    await asegurarJwtApiRest();
    const token = getApiToken();
    if (!token || p == null || p.id == null) return null;
    try {
        const r = await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(p.id))}/regeocodificar`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
        });
        const result = await r.json().catch(() => ({}));
        if (!r.ok || result.success === false) return null;
        const latRaw = result.coordenadas?.lat ?? result.lat;
        const lngRaw = result.coordenadas?.lng ?? result.lng;
        const la = Number(latRaw);
        const ln = Number(lngRaw);
        if (!coordsSonPinValidasMapaWgs84(la, ln)) return null;
        return { la, ln };
    } catch (_) {
        return null;
    }
}

async function persistirCoordsGeocodePedidoPanel(pedidoId, la, ln) {
    if (!esAdmin() || !puedeEnviarApiRestPedidos()) return;
    if (!coordsSonPinValidasMapaWgs84(la, ln)) {
        if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend(
                'warn',
                `Pin: NO pedido #${pedidoId} — coordenadas inválidas, (0,0) o fuera de WGS84; no se envían al servidor (coords-geocode-panel).`
            );
        }
        return;
    }
    await asegurarJwtApiRest();
    const token = getApiToken();
    if (!token) return;
    try {
        const r = await fetch(
            apiUrl(`/api/pedidos/${encodeURIComponent(String(pedidoId))}/coords-geocode-panel`),
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ lat: la, lng: ln }),
            }
        );
        if (!r.ok) {
            let detail = `HTTP ${r.status}`;
            try {
                const j = await r.json().catch(() => ({}));
                if (j && (j.error || j.detail || j.mensaje)) {
                    detail += `: ${String(j.error || j.detail || j.mensaje)}`;
                }
            } catch (_) {}
            if (typeof esAdmin === 'function' && esAdmin()) {
                gnGeocodeUiLogAppend(
                    'error',
                    `No se guardaron coordenadas en el servidor para el pedido #${pedidoId}. ${detail}. Si es 401/403, renová sesión; si es 5xx, revisá la API.`,
                    { openPanel: true }
                );
            }
            return;
        }
        const row = await r.json().catch(() => null);
        if (!row || row.lat == null || row.lng == null) return;
        const nla = Number(row.lat);
        const nln = Number(row.lng);
        if (!Number.isFinite(nla) || !Number.isFinite(nln)) return;
        const idStr = String(pedidoId);
        const idx = app.p.findIndex((x) => String(x.id) === idStr);
        if (idx >= 0) {
            app.p[idx].la = nla;
            app.p[idx].ln = nln;
        }
        try {
            render();
            renderMk();
        } catch (_) {}
        try {
            refrescarDetalleSiAbiertoTrasSync();
        } catch (_) {}
        if (typeof esAdmin === 'function' && esAdmin()) {
            gnGeocodeUiLogAppend(
                'info',
                `Guardado en API (coords-geocode-panel): pedido #${pedidoId} → (${nla.toFixed(6)}, ${nln.toFixed(6)}); pin WGS84 válido para mapa/lista.`
            );
        }
    } catch (e) {
        if (typeof esAdmin === 'function' && esAdmin()) {
            gnGeocodeUiLogAppend(
                'error',
                `Error al guardar geocodificación del pedido #${pedidoId}: ${e && e.message ? e.message : e}`,
                { openPanel: true }
            );
        }
    }
}

/**
 * Admin: corrección manual WGS84 (sobrescribe lat/lng en servidor).
 * @param {{ silentSuccessToast?: boolean }} [opts] — si true, no muestra toast verde al guardar (p. ej. «Corregir posición» desde el mapa).
 */
async function persistirCoordsManualPedidoPanel(pedidoId, la, ln, opts) {
    if (!esAdmin() || !puedeEnviarApiRestPedidos()) return;
    await asegurarJwtApiRest();
    const token = getApiToken();
    if (!token) return;
    try {
        const r = await fetch(
            apiUrl(`/api/pedidos/${encodeURIComponent(String(pedidoId))}/coords-manual`),
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ lat: la, lng: ln }),
            }
        );
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
            toast(String(body.error || 'No se pudieron guardar las coordenadas'), 'error');
            return;
        }
        const row = body;
        if (!row || row.lat == null || row.lng == null) return;
        const nla = Number(row.lat);
        const nln = Number(row.lng);
        if (!Number.isFinite(nla) || !Number.isFinite(nln)) return;
        const idStr = String(pedidoId);
        const idx = app.p.findIndex((x) => String(x.id) === idStr);
        if (idx >= 0) {
            app.p[idx].la = nla;
            app.p[idx].ln = nln;
            if (row.descripcion != null) app.p[idx].de = String(row.descripcion);
        } else {
            try {
                const merged = norm(row);
                app.p.push(merged);
                offlinePedidosSave(app.p);
            } catch (_) {}
        }
        try {
            if (window._pedidoCoordsInferidas && window._pedidoCoordsInferidas[idStr]) {
                delete window._pedidoCoordsInferidas[idStr];
            }
        } catch (_) {}
        try {
            render();
            renderMk();
        } catch (_) {}
        try {
            refrescarDetalleSiAbiertoTrasSync();
        } catch (_) {}
        if (!opts || !opts.silentSuccessToast) {
            if (row._correccionDireccionGuardada) {
                toast(
                    'Ubicación guardada. Los próximos reclamos en esta misma dirección usarán esta posición automáticamente.',
                    'success'
                );
            } else {
                toast('Ubicación del pedido actualizada en el mapa.', 'success');
            }
        }
    } catch (e) {
        toastError('coords-manual', e);
    }
}

async function enriquecerCoordsGeocodificadasPedidos() {
    if (modoOffline || typeof fetch !== 'function') return;
    if (!app.p || !app.p.length) return;
    const candidatos = (app.p || []).filter((p) => {
        if (Number.isFinite(p.la) && Number.isFinite(p.ln)) return false;
        const id = String(p.id);
        const prev = window._pedidoCoordsInferidas[id];
        if (prev && (prev.skip || (Number.isFinite(prev.la) && Number.isFinite(prev.ln)))) return false;
        return !!domicilioParaGeocodePedido(p);
    });
    const adminBatch = typeof esAdmin === 'function' && esAdmin() && candidatos.length > 0;
    if (adminBatch) {
        gnGeocodeUiLogStartSession(
            `Geocodificación automática en mapa: ${candidatos.length} pedido(s) sin coordenadas con domicilio cargado.`
        );
    }
    try {
        for (const p of candidatos) {
            try {
                if (adminBatch) {
                    gnGeocodeUiLogAppend('info', `Procesando pedido #${p.id}…`);
                }
                const id = String(p.id);
                const srv = await intentarCoordsPedidoDesdeApiRegeocodificar(p);
                if (srv && coordsSonPinValidasMapaWgs84(srv.la, srv.ln)) {
                    window._pedidoCoordsInferidas[id] = { la: srv.la, ln: srv.ln, src: 'regeo_api' };
                    const idx = app.p.findIndex((x) => String(x.id) === id);
                    if (idx >= 0) {
                        app.p[idx].la = srv.la;
                        app.p[idx].ln = srv.ln;
                    }
                    if (adminBatch) {
                        gnGeocodeUiLogAppend(
                            'info',
                            `Pedido #${p.id}: coordenadas desde API re-geocodificar (catálogo / pipeline servidor).`
                        );
                    }
                    try {
                        renderMk();
                        render();
                    } catch (_) {}
                    continue;
                }
                const hit = await nominatimGeocodeDomicilioPedido(p);
                if (hit && coordsSonPinValidasMapaWgs84(hit.lat, hit.lng)) {
                    window._pedidoCoordsInferidas[id] = { la: hit.lat, ln: hit.lng, src: hit.src || 'aprox' };
                    if (esAdmin()) {
                        void persistirCoordsGeocodePedidoPanel(p.id, hit.lat, hit.lng);
                    }
                    if (adminBatch) {
                        gnGeocodeUiLogAppend(
                            'info',
                            `Pedido #${p.id}: coordenadas aproximadas (${hit.src || 'aprox'}); persistencia disparada si aplica.`
                        );
                    }
                } else if (hit) {
                    window._pedidoCoordsInferidas[id] = { skip: true };
                    if (adminBatch) {
                        gnGeocodeUiLogAppend(
                            'warn',
                            `Pedido #${p.id}: resultado con lat/lng no válidos para mapa (NaN, 0,0 o fuera de rango); no se persiste.`
                        );
                    }
                } else {
                    window._pedidoCoordsInferidas[id] = { skip: true };
                    if (adminBatch) {
                        gnGeocodeUiLogAppend('warn', `Pedido #${p.id}: sin resultado de mapa para el domicilio cargado.`);
                    }
                }
                try {
                    renderMk();
                } catch (_) {}
            } catch (e) {
                console.warn('[geocode-pedido]', p.id, e && e.message ? e.message : e);
                if (adminBatch) {
                    gnGeocodeUiLogAppend(
                        'error',
                        `Pedido #${p.id}: error inesperado — ${e && e.message ? e.message : e}`
                    );
                }
            }
        }
    } finally {
        if (adminBatch) gnGeocodeUiLogEndSession();
    }
}

function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toR = x => x * Math.PI / 180;
    const dLat = toR(lat2 - lat1);
    const dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Fechas en informes / tablas sin texto tipo GMT-0300 */
function fmtInformeFecha(v) {
    if (v == null || v === '') return '';
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    try {
        return new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).format(d);
    } catch (_) {
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
}

function _gnDmTypingFocused() {
    const dm = document.getElementById('dm');
    const ae = document.activeElement;
    if (!dm || !ae || typeof ae.closest !== 'function') return false;
    if (!dm.classList.contains('active')) return false;
    if (!ae.closest('#dm')) return false;
    const t = ae.tagName;
    return t === 'TEXTAREA' || t === 'INPUT' || t === 'SELECT';
}

function actualizarBarraHeaderSesion() {
    const emp = document.getElementById('hd-empresa');
    const un = document.getElementById('un');
    const nom = String((window.EMPRESA_CFG || {}).nombre || '').trim();
    if (emp) {
        emp.textContent = nom || '';
        emp.style.display = nom ? '' : 'none';
        emp.title = nom;
    }
    if (un && app?.u?.nombre) un.textContent = String(app.u.nombre).split(' ')[0];
}

/** Si existe `pedidos.tenant_id`, `empresa_config` es global en Neon y no corresponde al tenant del JWT: no rellenar email/tel desde SQL. */
let _neonPedidosTenantIdColumnCache = null;
async function neonPedidosTieneColumnaTenantId() {
    if (_neonPedidosTenantIdColumnCache === true || _neonPedidosTenantIdColumnCache === false) {
        return _neonPedidosTenantIdColumnCache;
    }
    if (!NEON_OK || typeof sqlSimple !== 'function') {
        _neonPedidosTenantIdColumnCache = false;
        return false;
    }
    try {
        const chk = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'tenant_id' LIMIT 1`
        );
        _neonPedidosTenantIdColumnCache = !!(chk.rows && chk.rows.length);
    } catch (_) {
        _neonPedidosTenantIdColumnCache = false;
    }
    return _neonPedidosTenantIdColumnCache;
}

let _modoFijarUbicacionAdmin = false;
let _marcadoresTecnicosPrincipal = [];

function _escOpt(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

const WEB_MAP_FILTRO_TIPOS_KEY = 'pmg_map_filtro_tipos_json';

function leerMapFiltroTiposSet() {
    const tipos = tiposReclamoSeleccionables();
    let sel = null;
    try {
        const raw = localStorage.getItem(WEB_MAP_FILTRO_TIPOS_KEY);
        if (raw == null) return null;
        sel = JSON.parse(raw);
    } catch (_) {}
    if (!Array.isArray(sel)) return null;
    if (sel.length === 0) return new Set();
    const ok = new Set(tipos);
    const filtered = sel.filter((t) => ok.has(t));
    return filtered.length ? new Set(filtered) : new Set();
}

function pedidoPasaFiltroTipoReclamoMapa(p) {
    const allowed = leerMapFiltroTiposSet();
    if (allowed == null) return true;
    if (allowed.size === 0) return false;
    const tt = String(p?.tt || '').trim();
    if (!tt) return allowed.has('__sin_tipo__');
    return allowed.has(tt);
}

function syncMapaFiltroTiposRebuild() {
    const host = document.getElementById('mapa-filtro-tipo-body');
    if (!host) return;
    const tipos = tiposReclamoSeleccionables();
    const prev = leerMapFiltroTiposSet();
    const allMasterChecked =
        tipos.length === 0 ? true : prev == null || (prev.size > 0 && prev.size === tipos.length);
    const lines = tipos.map((t) => {
        const id = 'mapa-flt-tt-' + t.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
        const checked = prev == null || prev.has(t);
        return `<label class="mapa-flt-tipo-row" for="${id}"><input type="checkbox" id="${id}" data-tt="${_escOpt(t)}" ${checked ? 'checked' : ''} onchange="onMapaFiltroTipoTrabajoChange()"><span class="mapa-flt-tipo-lbl">${_escOpt(t)}</span></label>`;
    });
    host.innerHTML =
        `<p class="mapa-filtro-tipo-hint">Mostrar en el mapa solo los tipos marcados (según el rubro actual). <b>Todos los tipos</b> marca o desmarca la lista completa.</p>` +
        `<label class="mapa-flt-tipo-row mapa-flt-tipo-row-all" for="mapa-flt-tt-all"><input type="checkbox" id="mapa-flt-tt-all" ${allMasterChecked ? 'checked' : ''} onchange="onMapaFiltroTipoTrabajoChange(true)"><span class="mapa-flt-tipo-lbl">Todos los tipos</span></label>` +
        lines.join('');
    onMapaFiltroTipoTrabajoChange();
}

function onMapaFiltroTipoTrabajoChange(allMode) {
    const host = document.getElementById('mapa-filtro-tipo-body');
    if (!host) return;
    const all = document.getElementById('mapa-flt-tt-all');
    const boxes = [...host.querySelectorAll('input[type=checkbox][data-tt]')];
    if (allMode && all) {
        if (all.checked) {
            boxes.forEach((c) => {
                c.checked = true;
            });
        } else {
            boxes.forEach((c) => {
                c.checked = false;
            });
        }
    }
    const tipos = tiposReclamoSeleccionables();
    let picked = boxes.filter((c) => c.checked).map((c) => c.getAttribute('data-tt') || '');
    if (all) {
        all.checked = picked.length === tipos.length && tipos.length > 0;
    }
    try {
        if (picked.length === tipos.length && tipos.length > 0) localStorage.removeItem(WEB_MAP_FILTRO_TIPOS_KEY);
        else localStorage.setItem(WEB_MAP_FILTRO_TIPOS_KEY, JSON.stringify(picked));
    } catch (_) {}
    try {
        onMapaFiltroChange();
    } catch (_) {}
}
window.onMapaFiltroTipoTrabajoChange = onMapaFiltroTipoTrabajoChange;

function pedidosParaMarcadoresMapa() {
    const relaxRubroMapa = esTecnicoOSupervisor() && leerVerTodosPedidosTecnico();
    const mostrarDerivadoExternoEnMapa = (x) =>
        esAdmin() ? true : mostrarPedidoDerivadoFueraEnListasYMapa(x);
    const baseLista = pedidosBaseMapaSinToolbarBp2({
        pedidos: app.p || [],
        relaxRubroMapa,
        pedidoVisibleSegunRubro,
        mostrarDerivadoExternoEnMapa,
        operadorId: esTecnicoOSupervisor() ? app.u?.id : undefined,
    });
    const chk = (id) => {
        const el = document.getElementById(id);
        return !el || el.checked;
    };
    const anyChecked = [
        'mapa-flt-pendiente',
        'mapa-flt-asignado',
        'mapa-flt-ejecucion',
        'mapa-flt-cerrado',
        'mapa-flt-derivado',
        'mapa-flt-desestimado',
    ].some(id => document.getElementById(id)?.checked);
    const allowEstado = (es) => {
        if (!anyChecked) return true;
        if (es === 'Pendiente') return chk('mapa-flt-pendiente');
        if (es === 'Asignado') return chk('mapa-flt-asignado');
        if (es === 'En ejecución') return chk('mapa-flt-ejecucion');
        if (es === 'Cerrado') return chk('mapa-flt-cerrado');
        if (es === 'Derivado externo') return chk('mapa-flt-derivado');
        if (es === 'Desestimado') return chk('mapa-flt-desestimado');
        return true;
    };
    const selU = document.getElementById('mapa-filtro-usuario');
    const selA = document.getElementById('mapa-filtro-asignado');
    const uidF = selU?.value || '';
    const asigF = selA?.value || '';
    return baseLista.filter(p => {
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
        if (!allowEstado(normalizarEstadoPedidoUi(p.es || ''))) return false;
        if (uidF) {
            const cre = p.uc != null ? String(p.uc) : (p.ui != null ? String(p.ui) : '');
            if (cre !== uidF) return false;
        }
        if (asigF === '__sin__') {
            if (p.tai != null) return false;
        } else if (asigF) {
            if (String(p.tai ?? '') !== asigF) return false;
        }
        const prioOk = (() => {
            const chkP = (id) => {
                const el = document.getElementById(id);
                return !el || el.checked;
            };
            if ((p.es || '') === 'Cerrado' || (p.es || '') === 'Derivado externo') return chkP('mapa-flt-prio-cerrado');
            const mapPr = { 'Crítica': 'mapa-flt-prio-critica', 'Alta': 'mapa-flt-prio-alta', 'Media': 'mapa-flt-prio-media', 'Baja': 'mapa-flt-prio-baja' };
            return chkP(mapPr[p.pr] || 'mapa-flt-prio-baja');
        })();
        if (!prioOk) return false;
        if (!pedidoPasaFiltroTipoReclamoMapa(p)) return false;
        return true;
    });
}

try {
    window.pedidosParaMarcadoresMapa = pedidosParaMarcadoresMapa;
    window.coordsEfectivasPedidoMapa = coordsEfectivasPedidoMapa;
} catch (_) {}

function llenarSelectsFiltroMapa() {
    const selU = document.getElementById('mapa-filtro-usuario');
    const selA = document.getElementById('mapa-filtro-asignado');
    if (!selU || !selA) return;
    const relaxRubroMapa = esTecnicoOSupervisor() && leerVerTodosPedidosTecnico();
    const mostrarDerivadoExternoEnMapa = (x) =>
        esAdmin() ? true : mostrarPedidoDerivadoFueraEnListasYMapa(x);
    const baseMapa = pedidosBaseMapaSinToolbarBp2({
        pedidos: app.p || [],
        relaxRubroMapa,
        pedidoVisibleSegunRubro,
        mostrarDerivadoExternoEnMapa,
        operadorId: esTecnicoOSupervisor() ? app.u?.id : undefined,
    });
    const prevU = selU.value;
    const prevA = selA.value;
    selU.innerHTML = '<option value="">Todos los creadores</option>';
    selA.innerHTML = '<option value="">Todos los asignados</option><option value="__sin__">Sin asignar</option>';
    const nombrePorId = new Map();
    (app.usuariosCache || []).forEach(u => nombrePorId.set(String(u.id), u.nombre || u.email || ('#' + u.id)));
    const seenCre = new Set();
    baseMapa.forEach(p => {
        const id = p.uc != null ? p.uc : p.ui;
        if (id == null || seenCre.has(String(id))) return;
        seenCre.add(String(id));
        const name = nombrePorId.get(String(id)) || ('Usuario #' + id);
        selU.insertAdjacentHTML('beforeend', `<option value="${id}">${_escOpt(name)}</option>`);
    });
    if (esAdmin()) {
        (app.usuariosCache || []).forEach(u => {
            if (seenCre.has(String(u.id))) return;
            selU.insertAdjacentHTML('beforeend', `<option value="${u.id}">${_escOpt(u.nombre || u.email)}</option>`);
        });
    }
    const seenTec = new Set();
    (app.usuariosCache || []).forEach(u => {
        const r = String(u.rol || '').toLowerCase();
        if (r !== 'tecnico' && r !== 'supervisor') return;
        selA.insertAdjacentHTML('beforeend', `<option value="${u.id}">${_escOpt((u.nombre || '') + ' (' + u.rol + ')')}</option>`);
        seenTec.add(String(u.id));
    });
    baseMapa.forEach(p => {
        if (p.tai == null) return;
        const sid = String(p.tai);
        if (seenTec.has(sid)) return;
        seenTec.add(sid);
        const name = nombrePorId.get(sid) || ('#' + sid);
        selA.insertAdjacentHTML('beforeend', `<option value="${p.tai}">${_escOpt(name)}</option>`);
    });
    if ([...selU.options].some(o => o.value === prevU)) selU.value = prevU;
    if ([...selA.options].some(o => o.value === prevA)) selA.value = prevA;
}

function onMapaFiltroChange() {
    try {
        renderMk();
    } catch (_) {}
}

const MAPA_PRIO_CHK_IDS = ['mapa-flt-prio-critica', 'mapa-flt-prio-alta', 'mapa-flt-prio-media', 'mapa-flt-prio-baja', 'mapa-flt-prio-cerrado'];

function onMapaFiltroPrioridadChange() {
    MAPA_PRIO_CHK_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        try { localStorage.setItem('pmg_' + id, el.checked ? '1' : '0'); } catch (_) {}
    });
    try { onMapaFiltroChange(); } catch (_) {}
}
window.onMapaFiltroPrioridadChange = onMapaFiltroPrioridadChange;

function syncMapaPrioFiltrosFromStorage() {
    MAPA_PRIO_CHK_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        try {
            const v = localStorage.getItem('pmg_' + id);
            if (v === '0') el.checked = false;
            else if (v === '1') el.checked = true;
        } catch (_) {}
    });
}

/** Android WebView: abre el panel de filtros (misma paleta que admin web). */
function abrirAndroidFiltrosMapaRapidos() {
    try {
        toggleMapaCardSlideoff('mapa-card-filtros', false);
    } catch (_) {}
    try {
        onMapaFiltroChange();
    } catch (_) {}
}
window.abrirAndroidFiltrosMapaRapidos = abrirAndroidFiltrosMapaRapidos;

function resetMapaFiltros() {
    ['mapa-flt-pendiente', 'mapa-flt-asignado', 'mapa-flt-ejecucion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
    });
    ['mapa-flt-cerrado', 'mapa-flt-derivado', 'mapa-flt-desestimado'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    MAPA_PRIO_CHK_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
        try { localStorage.removeItem('pmg_' + id); } catch (_) {}
    });
    const u = document.getElementById('mapa-filtro-usuario');
    const a = document.getElementById('mapa-filtro-asignado');
    if (u) u.value = '';
    if (a) a.value = '';
    onMapaFiltroChange();
}

function onToggleMapaLabelsNp() {
    try {
        localStorage.setItem('pmg_map_labels_np', document.getElementById('mapa-chk-label-np')?.checked ? '1' : '0');
    } catch (_) {}
    try { renderMk(); } catch (_) {}
}
window.onToggleMapaLabelsNp = onToggleMapaLabelsNp;

function syncMapaLabelsNpCheckbox() {
    const el = document.getElementById('mapa-chk-label-np');
    if (!el) return;
    try { el.checked = localStorage.getItem('pmg_map_labels_np') === '1'; } catch (_) {}
}

function onToggleAndroidFiltrosMapa() {
    const chk = document.getElementById('chk-android-filtros-av');
    if (!chk) return;
    const card = document.getElementById('mapa-card-filtros');
    const cardTipo = document.getElementById('mapa-card-filtro-tipo');
    const cardCol = document.getElementById('mapa-card-colores');
    if (!card) return;
    const on = !!chk?.checked;
    try {
        localStorage.setItem('pmg_show_map_filters', on ? '1' : '0');
    } catch (_) {}
    card.style.display = on ? 'block' : 'none';
    if (cardTipo) cardTipo.style.display = on ? 'block' : 'none';
    if (cardCol) cardCol.style.display = on ? 'block' : 'none';
    if (!on) {
        document.getElementById('map-tab-filtros')?.classList.remove('visible');
        document.getElementById('map-tab-filtro-tipo')?.classList.remove('visible');
        document.getElementById('map-tab-colores')?.classList.remove('visible');
        document.getElementById('map-tab-dash')?.classList.remove('visible');
    }
}

function onAndroidPedidosScopeChange() {
    const v = document.getElementById('sel-android-pedidos-scope')?.value;
    try {
        localStorage.setItem('pmg_tecnico_ver_todos', v === 'todos' ? '1' : '0');
    } catch (_) {}
    const wt = document.getElementById('toggle-ver-todos-pedidos');
    if (wt) wt.checked = v === 'todos';
    void cargarPedidos();
}

function setBp2PanelHidden(hidden) {
    const bp2 = document.getElementById('bp2');
    const fab = document.getElementById('fab-show-pedidos');
    if (bp2) bp2.classList.toggle('bp2-fullhide', !!hidden);
    if (fab) {
        fab.classList.toggle('visible', !!hidden);
        try {
            fab.style.removeProperty('display');
            fab.style.removeProperty('visibility');
            fab.style.removeProperty('opacity');
        } catch (_) {}
    }
    try { localStorage.setItem('pmg_bp2_hidden', hidden ? '1' : '0'); } catch (_) {}
    if (hidden) queueLazyInitMap();
    try {
        syncPedidosDockChip();
    } catch (_) {}
}

/** Android: al abrir el detalle (#dm) guardamos si el panel inferior estaba visible para restaurarlo al cerrar. */
let _gnBp2SnapAntesDetalleAndroid = null;

function _gnRestaurarPanelPedidosTrasCerrarDetalleAndroid() {
    if (typeof esAndroidWebViewMapa !== 'function' || !esAndroidWebViewMapa()) {
        _gnBp2SnapAntesDetalleAndroid = null;
        return;
    }
    const snap = _gnBp2SnapAntesDetalleAndroid;
    _gnBp2SnapAntesDetalleAndroid = null;
    if (!snap) return;
    const bp2 = document.getElementById('bp2');
    setBp2PanelHidden(!!snap.fullhide);
    if (bp2) {
        bp2.classList.toggle('col', !!snap.col && !snap.fullhide);
    }
    requestAnimationFrame(() => {
        try {
            if (app.map) app.map.invalidateSize({ animate: false });
        } catch (_) {}
    });
}

let _bp2DragState = null;

/** Borde superior seguro para paneles `position:fixed` (mapa escritorio): debajo de la barra .hd. */
function mapFloatingPanelPadTopPx() {
    try {
        const hd = document.querySelector('#ms .hd');
        if (hd) {
            const r = hd.getBoundingClientRect();
            if (r.height > 0 && r.bottom > 0) return Math.ceil(r.bottom) + 6;
        }
    } catch (_) {}
    return 64;
}

/** Margen inferior al arrastrar paneles del mapa (WebView Android: columna FAB + barra / teclado). */
function androidMouiMapPanelPadBottomPx() {
    if (typeof esAndroidWebViewMapa !== 'function' || !esAndroidWebViewMapa()) return 0;
    try {
        const vv = typeof window.visualViewport === 'object' && window.visualViewport ? window.visualViewport : null;
        const ob = vv && Number.isFinite(Number(vv.offsetBottom)) ? Number(vv.offsetBottom) : 0;
        return Math.round(152 + ob);
    } catch (_) {
        return 152;
    }
}

/** Mantiene el panel completo dentro del viewport; permite llevarlo hasta los bordes (margen mínimo). */
function clampFloatingPanelToViewport(el, leftPx, topPx, opts) {
    const padX = (opts && opts.padX) != null ? opts.padX : 0;
    const padTop = (opts && opts.padTop) != null ? opts.padTop : mapFloatingPanelPadTopPx();
    const padBottom = (opts && opts.padBottom) != null ? opts.padBottom : 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const br = el.getBoundingClientRect();
    const w = br.width || el.offsetWidth || 160;
    const h = br.height || el.offsetHeight || 80;
    let l = Number(leftPx);
    let t = Number(topPx);
    const minL = padX;
    const maxL = Math.max(minL, vw - w - padX);
    const minT = padTop;
    const maxT = Math.max(minT, vh - h - padBottom);
    l = Math.min(Math.max(l, minL), maxL);
    t = Math.min(Math.max(t, minT), maxT);
    return { left: l, top: t };
}

/** Escritorio ancho o WebView Android: mismos paneles arrastrables (ratón, DeX, tablet). */
function floatingPanelsDragEnabled() {
    try {
        return window.matchMedia('(min-width:1024px)').matches || esAndroidWebViewMapa();
    } catch (_) {
        return esAndroidWebViewMapa();
    }
}

function aplicarPosicionBp2Guardada() {
    const bp2 = document.getElementById('bp2');
    if (!bp2 || !floatingPanelsDragEnabled()) return;
    try {
        const raw = localStorage.getItem('pmg_bp2_pos');
        if (!raw) {
            bp2.style.removeProperty('left');
            bp2.style.removeProperty('top');
            bp2.style.removeProperty('right');
            bp2.style.removeProperty('bottom');
            return;
        }
        const p = JSON.parse(raw);
        if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
        bp2.style.right = 'auto';
        bp2.style.bottom = 'auto';
        const c = clampFloatingPanelToViewport(bp2, p.left, p.top, { padX: 0, padBottom: 0 });
        bp2.style.left = c.left + 'px';
        bp2.style.top = c.top + 'px';
    } catch (_) {}
}

function initBp2PanelFlotanteDesktop() {
    const bp2 = document.getElementById('bp2');
    const ph = document.getElementById('ph');
    if (!bp2 || !ph || ph.dataset.bp2DragInit === '1') return;
    if (!floatingPanelsDragEnabled()) return;
    ph.dataset.bp2DragInit = '1';
    aplicarPosicionBp2Guardada();
    const startDrag = (clientX, clientY) => {
        const r = bp2.getBoundingClientRect();
        const hadCol = bp2.classList.contains('col');
        if (hadCol) bp2.classList.remove('col');
        _bp2DragState = {
            sx: clientX,
            sy: clientY,
            sl: r.left,
            st: r.top,
            moved: false,
            hadCol
        };
        let rafMove = null;
        const onMove = (ev) => {
            if (!_bp2DragState) return;
            const cx = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
            const cy = ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0);
            if (Math.abs(cx - _bp2DragState.sx) + Math.abs(cy - _bp2DragState.sy) > 5) _bp2DragState.moved = true;
            if (_bp2DragState.moved && ev.cancelable) ev.preventDefault();
            if (rafMove) cancelAnimationFrame(rafMove);
            rafMove = requestAnimationFrame(() => {
                rafMove = null;
                if (!_bp2DragState) return;
                const dx = cx - _bp2DragState.sx;
                const dy = cy - _bp2DragState.sy;
                bp2.style.right = 'auto';
                bp2.style.bottom = 'auto';
                const c = clampFloatingPanelToViewport(bp2, _bp2DragState.sl + dx, _bp2DragState.st + dy, { padX: 0, padBottom: 0 });
                bp2.style.left = c.left + 'px';
                bp2.style.top = c.top + 'px';
            });
        };
        const onUp = () => {
            if (rafMove) cancelAnimationFrame(rafMove);
            rafMove = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            document.removeEventListener('touchcancel', onUp);
            if (_bp2DragState) {
                if (!_bp2DragState.moved && _bp2DragState.hadCol) bp2.classList.add('col');
                if (_bp2DragState.moved) {
                    try {
                        const br = bp2.getBoundingClientRect();
                        const c = clampFloatingPanelToViewport(bp2, br.left, br.top, { padX: 0, padBottom: 0 });
                        bp2.style.left = c.left + 'px';
                        bp2.style.top = c.top + 'px';
                        localStorage.setItem('pmg_bp2_pos', JSON.stringify({ left: c.left, top: c.top }));
                    } catch (_) {}
                    window.__bp2DragJustEnded = true;
                    setTimeout(() => { window.__bp2DragJustEnded = false; }, 450);
                }
            }
            _bp2DragState = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
    };
    ph.addEventListener('mousedown', (e) => {
        if (!floatingPanelsDragEnabled()) return;
        if (e.button !== 0 || e.target.closest('button') || e.target.closest('.gn-bp2-plegar-trigger')) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
    });
    ph.addEventListener('touchstart', (e) => {
        if (!floatingPanelsDragEnabled()) return;
        if (e.touches.length !== 1 || e.target.closest('button') || e.target.closest('.gn-bp2-plegar-trigger')) return;
        e.preventDefault();
        const t = e.touches[0];
        startDrag(t.clientX, t.clientY);
    }, { passive: false });
}

let _mouiCardDragState = null;

/** Misma lógica que el panel de pedidos (bp2): umbral 5px, clamp al viewport, flag anti-clic al soltar. Escritorio ≥1024px o WebView Android. */
function initMouiCardDraggable(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const hd = card.querySelector('.moui-hd');
    if (!hd || card.dataset.mouiCardDragInit === '1') return;
    if (!card.isConnected || !hd.isConnected) return;
    card.dataset.mouiCardDragInit = '1';
    const key = 'pmg_moui_' + cardId.replace(/-/g, '_');
    const applySaved = () => {
        if (!floatingPanelsDragEnabled()) return;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
            card.style.right = 'auto';
            card.style.bottom = 'auto';
            const c = clampFloatingPanelToViewport(card, p.left, p.top, {
                padX: 0,
                padBottom: androidMouiMapPanelPadBottomPx()
            });
            card.style.left = c.left + 'px';
            card.style.top = c.top + 'px';
        } catch (_) {}
    };
    applySaved();
    const startDrag = (clientX, clientY) => {
        if (!card.isConnected || !hd.isConnected) return;
        const r = card.getBoundingClientRect();
        _mouiCardDragState = {
            sx: clientX,
            sy: clientY,
            sl: r.left,
            st: r.top,
            moved: false
        };
        let rafMove = null;
        const onMove = (ev) => {
            if (!_mouiCardDragState) return;
            const cx = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
            const cy = ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0);
            if (Math.abs(cx - _mouiCardDragState.sx) + Math.abs(cy - _mouiCardDragState.sy) > 5) _mouiCardDragState.moved = true;
            if (_mouiCardDragState.moved && ev.cancelable) ev.preventDefault();
            if (rafMove) cancelAnimationFrame(rafMove);
            rafMove = requestAnimationFrame(() => {
                rafMove = null;
                if (!_mouiCardDragState) return;
                const dx = cx - _mouiCardDragState.sx;
                const dy = cy - _mouiCardDragState.sy;
                card.style.right = 'auto';
                card.style.bottom = 'auto';
                const c = clampFloatingPanelToViewport(card, _mouiCardDragState.sl + dx, _mouiCardDragState.st + dy, {
                    padX: 0,
                    padBottom: androidMouiMapPanelPadBottomPx()
                });
                card.style.left = c.left + 'px';
                card.style.top = c.top + 'px';
            });
        };
        const onUp = () => {
            if (rafMove) cancelAnimationFrame(rafMove);
            rafMove = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            document.removeEventListener('touchcancel', onUp);
            if (_mouiCardDragState && _mouiCardDragState.moved) {
                try {
                    const br = card.getBoundingClientRect();
                    const c = clampFloatingPanelToViewport(card, br.left, br.top, {
                        padX: 0,
                        padBottom: androidMouiMapPanelPadBottomPx()
                    });
                    card.style.left = c.left + 'px';
                    card.style.top = c.top + 'px';
                    localStorage.setItem(key, JSON.stringify({ left: c.left, top: c.top }));
                } catch (_) {}
                window.__mouiCardDragJustEnded = true;
                setTimeout(() => {
                    window.__mouiCardDragJustEnded = false;
                }, 450);
            }
            _mouiCardDragState = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
    };
    hd.addEventListener('mousedown', (e) => {
        if (!floatingPanelsDragEnabled()) return;
        if (e.button !== 0 || e.target.closest('button')) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
    });
    hd.addEventListener(
        'touchstart',
        (e) => {
            if (!floatingPanelsDragEnabled()) return;
            if (e.touches.length !== 1 || e.target.closest('button')) return;
            e.preventDefault();
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);
        },
        { passive: false }
    );
}

/** Clic en la barra del panel = plegar/desplegar cuerpo (sin onclick inline, para no chocar con el arrastre). */
function bindMouiCardHeaderToggles() {
    const pairs = [
        ['mapa-card-filtros', toggleMapaFiltrosBody],
        ['mapa-card-filtro-tipo', toggleMapaFiltroTipoBody],
        ['mapa-card-colores', toggleMapaColoresBody],
        ['mapa-card-capas-osm', toggleMapaCapasOsmBody],
        ['mapa-card-coords-converter', toggleMapaCoordsConverterBody],
        ['mapa-card-dashboard', toggleMapaDashBody]
    ];
    for (const [id, fn] of pairs) {
        const hd = document.getElementById(id)?.querySelector('.moui-hd');
        if (!hd || hd.dataset.mouiToggleBound === '1') continue;
        hd.dataset.mouiToggleBound = '1';
        hd.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (window.__mouiCardDragJustEnded) return;
            try {
                fn();
            } catch (_) {}
        });
    }
}

function syncMapaCapasOsmCheckboxesFromStorage() {
    const card = document.getElementById('mapa-card-capas-osm');
    if (!card || card.style.display === 'none') return;
    const baseCb = document.getElementById('mapa-base-carto-visible');
    if (baseCb) {
        let baseOn = true;
        try {
            baseOn = localStorage.getItem('pmg_base_map_visible') !== '0';
        } catch (_) {}
        baseCb.checked = baseOn;
    }
    card.querySelectorAll('input[type="checkbox"][data-osm-layer]').forEach((inp) => {
        const id = inp.getAttribute('data-osm-layer');
        if (!id) return;
        let raw = '';
        try {
            raw = localStorage.getItem(`pmg_overlay_osm_${id}`) ?? '';
        } catch (_) {}
        const on = id === 'topo' || id === 'hot' ? raw !== '0' : raw === '1';
        inp.checked = on;
    });
}

async function onMapaAdminOsmCapaCheckboxChange(inp) {
    const id = inp?.getAttribute('data-osm-layer');
    if (!id) return;
    try {
        localStorage.setItem(`pmg_overlay_osm_${id}`, inp.checked ? '1' : '0');
    } catch (_) {}
    await ensureMapReady();
    if (!app.map) return;
    try {
        const mod = await loadMapViewModule();
        if (typeof mod.gnApplyAdminOsmOverlaysFromStorage === 'function') mod.gnApplyAdminOsmOverlaysFromStorage(app.map);
    } catch (_) {}
}

async function onMapaBaseCartoVisibleChange(inp) {
    if (!inp) return;
    try {
        localStorage.setItem('pmg_base_map_visible', inp.checked ? '1' : '0');
    } catch (_) {}
    await ensureMapReady();
    if (!app.map) return;
    try {
        const mod = await loadMapViewModule();
        if (typeof mod.gnApplyBaseMapVisibilityFromStorage === 'function') {
            mod.gnApplyBaseMapVisibilityFromStorage(app.map);
        }
    } catch (_) {}
}

function initAdminOsmCapasPanelBindings() {
    const card = document.getElementById('mapa-card-capas-osm');
    if (!card || card.dataset.osmCapasBound === '1') return;
    if (typeof esAndroidWebViewMapa === 'function' && esAndroidWebViewMapa()) return;
    if (!esAdmin()) return;
    card.dataset.osmCapasBound = '1';
    card.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t || t.type !== 'checkbox') return;
        if (t.id === 'mapa-base-carto-visible') {
            void onMapaBaseCartoVisibleChange(t);
            return;
        }
        if (!t.getAttribute('data-osm-layer')) return;
        void onMapaAdminOsmCapaCheckboxChange(t);
    });
}

let _gnAndroidViewportBound = false;
/** WebView con `configChanges`: `100dvh` a veces no se actualiza al rotar y la barra (.hd) queda fuera de vista. */
function encolarAjusteViewportAndroidWebView() {
    if (typeof esAndroidWebViewMapa !== 'function' || !esAndroidWebViewMapa() || _gnAndroidViewportBound) return;
    _gnAndroidViewportBound = true;
    /** Evita recursión infinita: dispatchEvent('resize') dispara este mismo listener en el mismo tick. */
    let _gnVhBumpDepth = 0;
    const bump = () => {
        if (_gnVhBumpDepth > 0) return;
        _gnVhBumpDepth++;
        try {
            const h =
                (window.visualViewport && window.visualViewport.height) ||
                document.documentElement.clientHeight ||
                window.innerHeight ||
                0;
            if (h > 0) {
                document.documentElement.style.setProperty('--gn-vh', `${h * 0.01}px`);
            }
        } catch (_) {}
        try {
            window.dispatchEvent(new Event('resize'));
        } catch (_) {}
        try {
            if (app?.map && typeof app.map.invalidateSize === 'function') app.map.invalidateSize();
        } catch (_) {}
        try {
            scheduleGnMapLayoutBumpsTrasLogin();
        } catch (_) {}
        finally {
            _gnVhBumpDepth--;
        }
    };
    try {
        window.addEventListener('resize', bump, { passive: true });
    } catch (_) {}
    try {
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', bump, { passive: true });
        }
    } catch (_) {}
    try {
        window.addEventListener('orientationchange', () => setTimeout(bump, 120), { passive: true });
    } catch (_) {}
    try {
        window.__pmgNotifyViewportResize = bump;
    } catch (_) {}
    bump();
}

function aplicarUIMapaPlataforma() {
    syncMapaLabelsNpCheckbox();
    syncMapaPrioFiltrosFromStorage();
    const card = document.getElementById('mapa-card-filtros');
    const cardTipo = document.getElementById('mapa-card-filtro-tipo');
    const cardCol = document.getElementById('mapa-card-colores');
    const cardCapasOsm = document.getElementById('mapa-card-capas-osm');
    const tabCapasOsm = document.getElementById('map-tab-capas-osm');
    const cardCoords = document.getElementById('mapa-card-coords-converter');
    const tabCoords = document.getElementById('map-tab-coords-converter');
    if (!card) return;
    if (esAndroidWebViewMapa()) {
        try {
            document.documentElement.classList.add('gn-android-webview');
        } catch (_) {}
        /* Mismas paletas que admin: paneles en DOM; mostrar/ocultar con pestañas + ojo (slideoff). */
        card.style.display = 'block';
        if (cardTipo) cardTipo.style.display = 'block';
        if (cardCol) cardCol.style.display = 'block';
        if (cardCapasOsm) {
            cardCapasOsm.style.display = 'none';
            cardCapasOsm.classList.remove('moui-card-slideoff');
        }
        if (tabCapasOsm) {
            tabCapasOsm.classList.remove('visible');
            tabCapasOsm.style.setProperty('display', 'none', 'important');
        }
        if (cardCoords) {
            cardCoords.style.display = 'none';
            cardCoords.classList.remove('moui-card-slideoff');
        }
        if (tabCoords) {
            tabCoords.classList.remove('visible');
            tabCoords.style.setProperty('display', 'none', 'important');
        }
        const mapDash = document.getElementById('mapa-card-dashboard');
        if (mapDash) mapDash.style.display = esAdmin() ? 'block' : 'none';
        const tabDash = document.getElementById('map-tab-dash');
        if (tabDash) {
            if (!esAdmin()) {
                tabDash.classList.remove('visible');
                tabDash.style.setProperty('display', 'none', 'important');
            } else {
                tabDash.style.removeProperty('display');
            }
        }
        const wrap = document.getElementById('wrap-android-scope');
        if (wrap) {
            wrap.style.display = 'flex';
            if (esTecnicoOSupervisor()) {
                try {
                    if (localStorage.getItem('pmg_tecnico_ver_todos') === null) {
                        /* Android operador: por defecto solo asignados (checkbox destildado). Escritorio: ver todos. */
                        localStorage.setItem('pmg_tecnico_ver_todos', esAndroidWebViewMapa() ? '0' : '1');
                    }
                } catch (_) {}
            }
            const sel = document.getElementById('sel-android-pedidos-scope');
            const vt = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
            if (sel) sel.value = vt ? 'todos' : 'asignados';
            const chkTodos = document.getElementById('toggle-ver-todos-pedidos');
            if (chkTodos) chkTodos.checked = vt;
        }
        const cc = document.getElementById('gn-cursor-coords');
        if (cc) cc.style.display = 'none';
    } else {
        try {
            document.documentElement.classList.remove('gn-android-webview');
        } catch (_) {}
        card.style.display = 'block';
        if (cardTipo) cardTipo.style.display = 'block';
        if (cardCol) cardCol.style.display = 'block';
        const mostrarCapasOsm = esAdmin();
        if (cardCapasOsm) {
            cardCapasOsm.style.display = mostrarCapasOsm ? 'block' : 'none';
            if (!mostrarCapasOsm) cardCapasOsm.classList.remove('moui-card-slideoff');
        }
        if (tabCapasOsm) {
            if (!mostrarCapasOsm) {
                tabCapasOsm.classList.remove('visible');
                tabCapasOsm.style.setProperty('display', 'none', 'important');
            } else {
                tabCapasOsm.style.removeProperty('display');
            }
        }
        if (cardCoords) cardCoords.style.display = 'block';
        if (tabCoords) tabCoords.style.removeProperty('display');
        const cc = document.getElementById('gn-cursor-coords');
        if (cc) cc.style.display = '';
    }
    try {
        if (esAndroidWebViewMapa()) {
            setBp2PanelHidden(true);
        } else {
            setBp2PanelHidden(localStorage.getItem('pmg_bp2_hidden') === '1');
        }
    } catch (_) {}
    syncMapSlideTabsFromStorage();
    try { initBp2PanelFlotanteDesktop(); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-filtros'); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-filtro-tipo'); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-colores'); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-capas-osm'); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-coords-converter'); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-dashboard'); } catch (_) {}
    if (esAdmin()) {
        void (async () => {
            try {
                const { initDashboardGerenciaModalDrag } = await import('./modules/dashboard-gerencia.js');
                initDashboardGerenciaModalDrag();
            } catch (_) {}
        })();
    }
    try { bindMouiCardHeaderToggles(); } catch (_) {}
    try { syncMapaCapasOsmCheckboxesFromStorage(); } catch (_) {}
    try { initAdminOsmCapasPanelBindings(); } catch (_) {}
    try { syncMapaFiltroTiposRebuild(); } catch (_) {}
    try { initWebCoordsConverterBar(); } catch (_) {}
    try {
        syncMapTapNuevoPedidoArmedUi();
    } catch (_) {}
    void (async () => {
        if (!esAdmin() || (typeof esAndroidWebViewMapa === 'function' && esAndroidWebViewMapa()) || !app.map) return;
        try {
            const mod = await loadMapViewModule();
            if (typeof mod.gnApplyAdminOsmOverlaysFromStorage === 'function') mod.gnApplyAdminOsmOverlaysFromStorage(app.map);
            if (typeof mod.gnApplyBaseMapVisibilityFromStorage === 'function') {
                mod.gnApplyBaseMapVisibilityFromStorage(app.map);
            }
        } catch (_) {}
    })();
    try {
        encolarAjusteViewportAndroidWebView();
    } catch (_) {}
}
window.setBp2PanelHidden = setBp2PanelHidden;

function toggleMapaFiltroTipoBody() {
    const b = document.getElementById('mapa-filtro-tipo-body');
    const ch = document.getElementById('mapa-filtro-tipo-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
}
window.toggleMapaFiltroTipoBody = toggleMapaFiltroTipoBody;

function toggleMapaDashBody() {
    const b = document.getElementById('mapa-dash-body');
    const ch = document.getElementById('mapa-dash-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
}

function toggleMapaColoresBody() {
    const b = document.getElementById('mapa-colores-body');
    const ch = document.getElementById('mapa-colores-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
}
window.toggleMapaColoresBody = toggleMapaColoresBody;

function iniciarTecnicosMapaPrincipalPoll() {
    detenerTecnicosMapaPrincipalPoll();
    if (!esAdmin()) return;
    void refrescarTecnicosMapaPrincipal();
    _pollTecnicosMapaInterval = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        void refrescarTecnicosMapaPrincipal();
    }, 8000);
}

async function refrescarTecnicosMapaPrincipal() {
    if (!app.map || modoOffline || !NEON_OK || !_sql) {
        _marcadoresTecnicosPrincipal.forEach(m => { try { app.map && app.map.removeLayer(m); } catch (_) {} });
        _marcadoresTecnicosPrincipal = [];
        return;
    }
    if (!esAdmin()) {
        _marcadoresTecnicosPrincipal.forEach(m => { try { app.map.removeLayer(m); } catch (_) {} });
        _marcadoresTecnicosPrincipal = [];
        return;
    }
    try {
        const wfUGps = await sqlFiltroUsuariosPorTenantAliased('u');
        const r = await sqlSimple(`SELECT DISTINCT ON (uu.usuario_id) uu.usuario_id, uu.lat, uu.lng, uu.timestamp, u.nombre, u.email, u.rol
            FROM ubicaciones_usuarios uu
            JOIN usuarios u ON u.id = uu.usuario_id AND u.activo = TRUE
            WHERE uu.timestamp > NOW() - INTERVAL '2 hours'
            AND LOWER(COALESCE(u.rol,'')) IN ('tecnico','supervisor')${wfUGps}
            ORDER BY uu.usuario_id, uu.timestamp DESC`);
        _marcadoresTecnicosPrincipal.forEach(m => { try { app.map.removeLayer(m); } catch (_) {} });
        _marcadoresTecnicosPrincipal = [];
        (r.rows || []).forEach(row => {
            const lat = parseFloat(row.lat);
            const lng = parseFloat(row.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return;
            const nom = String(row.nombre || '').trim() || row.email || 'Técnico';
            const short = nom.split(/\s+/)[0] || nom;
            const icon = L.divIcon({
                className: '',
                html: `<div class="user-marker-admin" style="border-color:#0f766e;background:#ecfdf5;box-shadow:0 2px 8px rgba(0,0,0,.2)"><i class="fas fa-hard-hat" style="font-size:.65rem;color:#0f766e"></i> ${_escOpt(short)}</div>`,
                iconAnchor: [0, 12]
            });
            const ts = row.timestamp ? new Date(row.timestamp) : null;
            const haceMin = ts ? Math.round((Date.now() - ts.getTime()) / 60000) : null;
            const horaStr =
                ts && !isNaN(ts.getTime())
                    ? ts.toLocaleString('es-AR', {
                          timeZone: 'America/Argentina/Buenos_Aires',
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                      })
                    : '—';
            const m = L.marker([lat, lng], { icon, zIndexOffset: 750 })
                .addTo(app.map)
                .bindPopup(
                    `<b>${_escOpt(nom)}</b><br>${_escOpt(row.rol || '')}<br>` +
                        `<strong>Última posición GPS:</strong> hace ${haceMin != null ? haceMin : '—'} min<br>` +
                        `<span style="font-size:11px;color:#64748b">Registrada: ${horaStr}</span>`
                );
            _marcadoresTecnicosPrincipal.push(m);
        });
    } catch (e) {
        console.warn('[tecnicos mapa]', e);
    }
}

async function activarModoFijarUbicacionAdmin() {
    if (!app.u || !esAdmin()) return;
    document.getElementById('admin-panel')?.classList.remove('active');
    try {
        await ensureMapReady();
        try {
            app.map?.invalidateSize?.({ animate: false });
        } catch (_) {}
        document.getElementById('mc')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            try {
                app.map?.invalidateSize?.({ animate: false });
            } catch (_) {}
        }, 380);
    } catch (_) {}
    _modoFijarUbicacionAdmin = true;
    document.body.classList.add('modo-fijar-ubicacion');
    try {
        instalarEscapeCancelarFijarUbicacionAdmin();
    } catch (_) {}
    toast('Tocá el mapa principal para fijar tu ubicación (oficina). Escape cancela.', 'info');
}

function cancelarModoFijarUbicacionAdmin() {
    if (!_modoFijarUbicacionAdmin) return;
    _modoFijarUbicacionAdmin = false;
    try {
        document.body.classList.remove('modo-fijar-ubicacion');
    } catch (_) {}
    try {
        document.getElementById('admin-panel')?.classList.add('active');
    } catch (_) {}
    toast('Fijar ubicación cancelado', 'info');
}

function instalarEscapeCancelarFijarUbicacionAdmin() {
    if (window.__PMG_ESC_FIJAR_UBICACION__) return;
    window.__PMG_ESC_FIJAR_UBICACION__ = true;
    document.addEventListener(
        'keydown',
        (ev) => {
            if (ev.key !== 'Escape') return;
            if (!_modoFijarUbicacionAdmin) return;
            ev.preventDefault();
            ev.stopPropagation();
            cancelarModoFijarUbicacionAdmin();
        },
        true
    );
}

async function registrarUbicacionManualAdmin(lat, lng) {
    if (!app.u || !esAdmin() || modoOffline) return;
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    try {
        window.__PMG_ADMIN_MANUAL_FIX_LL = { lat: la, lng: lo };
        let okNeon = false;
        if (NEON_OK && _sql) {
            await sqlSimple(`INSERT INTO ubicaciones_usuarios(usuario_id, lat, lng, precision_m, timestamp)
                VALUES(${esc(app.u.id)}, ${esc(la)}, ${esc(lo)}, ${esc(80)}, NOW())`);
            await sqlSimple(
                `DELETE FROM ubicaciones_usuarios WHERE usuario_id = ${esc(app.u.id)} AND timestamp < NOW() - INTERVAL '2 hours'`
            );
            okNeon = true;
        }
        const okApi = await persistirUbicacionBaseAdministradorApi(la, lo);
        if (!okNeon && !okApi) {
            toast('No se pudo guardar la ubicación (API/sesión o base local). Revisá conexión y token.', 'error');
            return;
        }
        toast('Ubicación de oficina registrada', 'success');
        void actualizarProvinciaTenantDesdeCoords(la, lo);
    } catch (e) {
        toastError('ubicacion-oficina-admin', e, 'No se pudo guardar la ubicación.');
    }
}

let _pollDashInterval = null;
let _pollPedidosActividadInterval = null;
let _pedidosActividadFinger = '';
let _pollTecnicosMapaInterval = null;
/** Sincroniza lista Neon → técnico/supervisor cuando el admin cambia estados desde la web. */
let _pollTecnicoPedidosInterval = null;
const TECNICO_PEDIDOS_SYNC_MS = 12000;
let _seenClosedIds = new Set();
let _dashCierresInit = false;

function detenerPollSincroPedidosTecnico() {
    if (_pollTecnicoPedidosInterval) {
        clearInterval(_pollTecnicoPedidosInterval);
        _pollTecnicoPedidosInterval = null;
    }
}

async function tickSincroPedidosTecnico() {
    if (!app.u || esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    if (!esTecnicoOSupervisor()) return;
    try {
        await cargarPedidos({ silent: true });
    } catch (_) {}
}

function iniciarPollSincroPedidosTecnico() {
    detenerPollSincroPedidosTecnico();
    if (!app.u || esAdmin()) return;
    if (!esTecnicoOSupervisor()) return;
    void tickSincroPedidosTecnico();
    _pollTecnicoPedidosInterval = setInterval(() => void tickSincroPedidosTecnico(), TECNICO_PEDIDOS_SYNC_MS);
}

/** Si el detalle está abierto, repinta con la fila actual de app.p (p. ej. cierre remoto). */
function refrescarDetalleSiAbiertoTrasSync() {
    const dm = document.getElementById('dm');
    if (!dm || !dm.classList.contains('active')) return;
    // Android/WebView: repintar #dmc destruye textareas → se cierra el teclado al derivar / comentar.
    if (_gnDmTypingFocused()) return;
    const pidKey = dm.dataset?.detallePedidoId;
    if (!pidKey || pidKey === '') return;
    const fresh = app.p.find(x => String(x.id) === pidKey);
    if (fresh) {
        const esF = normalizarEstadoPedidoUi(fresh.es);
        if (esF === 'Cerrado' || esF === 'Derivado externo') {
            return;
        }
        try {
            void detalle(fresh);
        } catch (_) {}
    } else {
        try {
            closeAll();
        } catch (_) {}
        toast('El pedido ya no está en tu listado (actualizado desde la central).', 'info');
    }
}

function notificarCambiosPedidoTecnico(prevSnap) {
    if (!prevSnap || !app.u || esAdmin() || modoOffline) return;
    if (!esTecnicoOSupervisor()) return;
    const uid = String(app.u.id);
    for (const p of app.p) {
        const prev = prevSnap.get(String(p.id));
        if (!prev) continue;
        if (normalizarEstadoPedidoUi(prev.es) === normalizarEstadoPedidoUi(p.es)) continue;
        const eraAbierto = ['Pendiente', 'Asignado', 'En ejecución'].includes(normalizarEstadoPedidoUi(prev.es));
        const ahoraCerrado = normalizarEstadoPedidoUi(p.es) === 'Cerrado';
        if (eraAbierto && ahoraCerrado && p.tai != null && String(p.tai) === uid) {
            const quien = (p.tc || '').trim() || 'Administración';
            toast(`Pedido #${p.np || p.id}: cerrado desde la central (${quien}). Revisá «Cerrados».`, 'success');
        }
    }
}

function detenerPedidosActividadPollAdmin() {
    if (_pollPedidosActividadInterval) {
        clearInterval(_pollPedidosActividadInterval);
        _pollPedidosActividadInterval = null;
    }
    _pedidosActividadFinger = '';
}

async function pollPedidosActividadAdmin() {
    if (!app.u || !esAdmin() || modoOffline || !NEON_OK) return;
    try {
        const tsql = await pedidosFiltroTenantSql();
        const qFull = `SELECT COALESCE(MAX(id),0)::bigint AS mid,
                COUNT(*) FILTER (WHERE estado='Pendiente')::bigint AS np,
                COUNT(*) FILTER (WHERE estado='Asignado')::bigint AS na,
                COUNT(*) FILTER (WHERE estado='En ejecución')::bigint AS ne,
                COUNT(*) FILTER (WHERE estado='Cerrado')::bigint AS nc,
                COALESCE(SUM(COALESCE(avance,0)),0)::bigint AS sav,
                COALESCE(MAX(fecha_avance), to_timestamp(0)) AS mfa,
                COALESCE(MAX(fecha_asignacion), to_timestamp(0)) AS mfas,
                COALESCE(MAX(fecha_cierre), to_timestamp(0)) AS mfc
             FROM pedidos WHERE 1=1${tsql}`;
        const qMin = `SELECT COALESCE(MAX(id),0)::bigint AS mid,
                COUNT(*) FILTER (WHERE estado='Pendiente')::bigint AS np,
                COUNT(*) FILTER (WHERE estado='Asignado')::bigint AS na,
                COUNT(*) FILTER (WHERE estado='En ejecución')::bigint AS ne,
                COUNT(*) FILTER (WHERE estado='Cerrado')::bigint AS nc,
                COALESCE(SUM(COALESCE(avance,0)),0)::bigint AS sav
             FROM pedidos WHERE 1=1${tsql}`;
        let r;
        try {
            r = await sqlSimple(qFull);
        } catch (e) {
            const m = String(e && e.message ? e.message : e);
            if (
                m.includes('fecha_avance') ||
                m.includes('fecha_asignacion') ||
                m.includes('fecha_cierre') ||
                m.includes('does not exist') ||
                m.includes('column')
            ) {
                r = await sqlSimple(qMin);
            } else {
                throw e;
            }
        }
        const row = r.rows?.[0] || {};
        let msdf = '0';
        let nsdp = '0';
        try {
            const rDer = await sqlSimple(
                `SELECT COALESCE(MAX(solicitud_derivacion_fecha), to_timestamp(0)) AS msdf,
                 COUNT(*) FILTER (WHERE COALESCE(solicitud_derivacion_pendiente, FALSE))::bigint AS nsdp
                 FROM pedidos WHERE 1=1${tsql}`
            );
            const rd = rDer.rows?.[0] || {};
            msdf = rd.msdf != null ? String(rd.msdf) : '0';
            nsdp = rd.nsdp != null ? String(rd.nsdp) : '0';
        } catch (_) {
            /* columnas solicitud_derivacion_* ausentes en BD antigua */
        }
        const f = [
            row.mid,
            row.np,
            row.na,
            row.ne,
            row.nc,
            row.sav,
            row.mfa != null ? row.mfa : '0',
            row.mfas != null ? row.mfas : '0',
            row.mfc != null ? row.mfc : '0',
            msdf,
            nsdp,
        ]
            .map((x) => String(x))
            .join('|');
        if (!_pedidosActividadFinger) {
            _pedidosActividadFinger = f;
            return;
        }
        if (f !== _pedidosActividadFinger) {
            _pedidosActividadFinger = f;
            await cargarPedidos({ silent: true });
            try { await refrescarTecnicosMapaPrincipal(); } catch (_) {}
        }
    } catch (_) {}
}

function iniciarPedidosActividadPollAdmin() {
    detenerPedidosActividadPollAdmin();
    if (!esAdmin()) return;
    pollPedidosActividadAdmin();
    _pollPedidosActividadInterval = setInterval(pollPedidosActividadAdmin, 8000);
    void pollBannerOpinionCliente();
    setInterval(() => void pollBannerOpinionCliente(), 8000);
}

function detenerTecnicosMapaPrincipalPoll() {
    if (_pollTecnicosMapaInterval) {
        clearInterval(_pollTecnicosMapaInterval);
        _pollTecnicosMapaInterval = null;
    }
}

/** Supervisor (sin panel KPI): solo técnicos en mapa principal. */
function iniciarDashboardGerenciaPoll() {
    detenerDashboardGerenciaPoll();
    if (!esAdmin()) return;
    const tick = () => { pollCierresGerencia(); refrescarDashboardGerencia(true); };
    tick();
    _pollDashInterval = setInterval(tick, 25000);
    iniciarPedidosActividadPollAdmin();
    iniciarTecnicosMapaPrincipalPoll();
}

function detenerDashboardGerenciaPoll() {
    if (_pollDashInterval) {
        clearInterval(_pollDashInterval);
        _pollDashInterval = null;
    }
    detenerPedidosActividadPollAdmin();
    detenerTecnicosMapaPrincipalPoll();
}

async function pollCierresGerencia() {
    if (!app.u || !esAdmin() || modoOffline || !NEON_OK) return;
    try {
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(`SELECT id, numero_pedido, fecha_cierre, trabajo_realizado, tecnico_cierre, nis_medidor, descripcion
            FROM pedidos WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > NOW() - INTERVAL '14 days'${tsql}
            ORDER BY fecha_cierre DESC LIMIT 50`);
        const rows = r.rows || [];
        if (!_dashCierresInit) {
            rows.forEach(row => _seenClosedIds.add(String(row.id)));
            _dashCierresInit = true;
            return;
        }
        let huboNuevo = false;
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            const sid = String(row.id);
            if (_seenClosedIds.has(sid)) continue;
            _seenClosedIds.add(sid);
            mostrarToastCierreGerencia(row);
            huboNuevo = true;
        }
        if (huboNuevo) {
            try { await cargarPedidos(); } catch (_) {}
        }
    } catch (_) {}
}


function mostrarToastCierreGerencia(row) {
    const host = document.getElementById('cierre-toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'cierre-toast';
    const np = String(row.numero_pedido || '').replace(/</g, '&lt;');
    el.innerHTML = `<strong>Concluido #${np}</strong><br><span style="opacity:.9">${fmtInformeFecha(row.fecha_cierre)} · ${String(row.tecnico_cierre || '').replace(/</g, '&lt;')}</span><br><span style="font-size:.76rem;opacity:.85">Tocá para ver el cierre</span>`;
        el.onclick = async () => {
        try { el.remove(); } catch (_) {}
        await cargarPedidos();
        const p = app.p.find(x => String(x.id) === String(row.id));
        if (p) {
            app.tab = 'c';
            document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === app.tab));
            render();
            void detalle(p);
        } else {
            toast('Actualizá la lista — pedido no encontrado en caché', 'info');
        }
    };
    host.appendChild(el);
    setTimeout(() => { try { if (el.parentNode) el.remove(); } catch (_) {} }, 90000);
}

function abrirModalDashboardGerencia() {
    if (!app.u || !esAdmin()) return;
    const m = document.getElementById('modal-dashboard-gerencia');
    if (m) m.classList.add('active');
    syncDashboardModalMaxButtons();
    refrescarDashboardGerencia(false);
}

function bindDashboardKpiClicks(gridEl, hostId) {
    if (!gridEl || gridEl._gnDashKpiBound) return;
    gridEl._gnDashKpiBound = true;
    gridEl.addEventListener('click', ev => {
        const card = ev.target.closest('[data-dash-filter]');
        if (!card) return;
        gridEl.querySelectorAll('.dash-kpi-click.active-ring').forEach(x => x.classList.remove('active-ring'));
        card.classList.add('active-ring');
        ejecutarDashboardFiltroLista(card.dataset.dashFilter, hostId);
    });
}

async function ejecutarDashboardFiltroLista(filter, hostId) {
    const host = document.getElementById(hostId || 'dashboard-filtro-lista-host');
    if (!host) return;
    if (filter === 'tecnicos_gps') {
        host.style.display = 'block';
        host.innerHTML = '<span style="color:var(--tm)">Listado de técnicos con GPS reciente arriba (sección «Técnicos en calle»).</span>';
        return;
    }
    host.style.display = 'block';
    host.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const lim = hostId === 'mapa-main-dash-filtro-host' ? 25 : 100;
    const tsql = await pedidosFiltroTenantSql();
    let q = '';
    if (filter === 'pendientes') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'Pendiente'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'asignados') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'Asignado'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'en_ejecucion') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'En ejecución'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'cerrados_hoy') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_cierre, descripcion FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre::date = CURRENT_DATE${tsql} ORDER BY fecha_cierre DESC LIMIT ${lim}`;
    } else if (filter === 'derivados_terceros') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion, derivado_destino_nombre FROM pedidos WHERE (estado = 'Derivado externo' OR COALESCE(derivado_externo, FALSE) = TRUE)${tsql} ORDER BY COALESCE(fecha_derivacion, fecha_creacion) DESC NULLS LAST LIMIT ${lim}`;
    } else if (filter === 'desestimados') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion, motivo_desestimacion FROM pedidos WHERE estado = 'Desestimado'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else {
        host.style.display = 'none';
        host.innerHTML = '';
        return;
    }
    try {
        const r = await sqlSimple(q);
        const rows = r.rows || [];
        if (!rows.length) {
            host.innerHTML = '<span style="color:var(--tl)">Sin pedidos en esta categoría.</span>';
            return;
        }
        host.innerHTML = rows.map(row => {
            const np = String(row.numero_pedido || '').replace(/</g, '&lt;');
            const pr = String(row.prioridad || '').replace(/</g, '&lt;');
            const es = String(row.estado || '').replace(/</g, '&lt;');
            const de = String(row.descripcion || '').replace(/</g, '&lt;').substring(0, 72);
            const fe = row.fecha_cierre ? fmtInformeFecha(row.fecha_cierre) : fmtInformeFecha(row.fecha_creacion);
            const ddn = row.derivado_destino_nombre
                ? ` · → ${String(row.derivado_destino_nombre).replace(/</g, '&lt;')}`
                : '';
            const motDes =
                filter === 'desestimados' && row.motivo_desestimacion
                    ? ` · ${String(row.motivo_desestimacion).replace(/</g, '&lt;').substring(0, 48)}`
                    : '';
            return `<div style="padding:.3rem 0;border-bottom:1px solid var(--bo);cursor:pointer;color:var(--bm)" onclick="cerrarModalDashYAbrirPedido(${row.id})"><strong>#${np}</strong> · ${es} · ${pr}${ddn}${motDes}<br><span style="color:var(--tm);font-size:.78rem">${fe} — ${de}${(row.descripcion && row.descripcion.length > 72) ? '…' : ''}</span></div>`;
        }).join('');
    } catch (e) {
        logErrorWeb('dashboard-filtro-lista', e);
        host.innerHTML = '<span style="color:var(--re)">' + escHtmlPrint(mensajeErrorUsuario(e)) + '</span>';
    }
}

async function refrescarDashboardGerencia(silent) {
    if (!app.u || !esAdmin() || modoOffline || !NEON_OK) return;
    const kpi = document.getElementById('dashboard-kpi-grid');
    const lt = document.getElementById('dashboard-lista-tecnicos');
    const lc = document.getElementById('dashboard-lista-cierres');
    const kpiM = document.getElementById('mapa-main-dash-kpi');
    const ltM = document.getElementById('mapa-main-dash-tecnicos');
    const lcM = document.getElementById('mapa-main-dash-cierres');
    const hostF = document.getElementById('dashboard-filtro-lista-host');
    const hostMap = document.getElementById('mapa-main-dash-filtro-host');
    if (hostF) { hostF.style.display = 'none'; hostF.innerHTML = ''; }
    if (hostMap) { hostMap.style.display = 'none'; hostMap.innerHTML = ''; }
    if (!silent && kpi) kpi.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    if (!silent && kpiM) kpiM.innerHTML = '<div class="ll2" style="padding:.5rem"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const tsql = await pedidosFiltroTenantSql();
        const wfUGps = await sqlFiltroUsuariosPorTenantAliased('u');
        const [rAct, rTec, rCi] = await Promise.all([
            sqlSimple(`SELECT
                COUNT(*) FILTER (WHERE estado = 'Asignado') AS asignados,
                COUNT(*) FILTER (WHERE estado = 'En ejecución') AS en_ejec,
                COUNT(*) FILTER (WHERE estado = 'Pendiente') AS pendientes,
                COUNT(*) FILTER (WHERE estado = 'Cerrado' AND fecha_cierre::date = CURRENT_DATE) AS cerrados_hoy,
                COUNT(*) FILTER (WHERE estado = 'Derivado externo' OR COALESCE(derivado_externo, FALSE) = TRUE) AS derivados_terceros,
                COUNT(*) FILTER (WHERE estado = 'Desestimado') AS desestimados
                FROM pedidos WHERE 1=1${tsql}`),
            sqlSimple(`SELECT DISTINCT ON (uu.usuario_id) uu.usuario_id, uu.lat, uu.lng, uu.timestamp, u.nombre, u.email, u.rol
                FROM ubicaciones_usuarios uu
                JOIN usuarios u ON u.id = uu.usuario_id AND u.activo = TRUE
                WHERE uu.timestamp > NOW() - INTERVAL '20 minutes'
                AND LOWER(COALESCE(u.rol,'')) IN ('tecnico','supervisor')${wfUGps}
                ORDER BY uu.usuario_id, uu.timestamp DESC`),
            sqlSimple(`SELECT id, numero_pedido, fecha_cierre, tecnico_cierre, nis_medidor FROM pedidos
                WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL${tsql} ORDER BY fecha_cierre DESC LIMIT 12`)
        ]);
        const a = rAct.rows[0] || {};
        const cards = [
            { val: a.pendientes || 0, lbl: 'Pendiente', cls: 'orange', filter: 'pendientes' },
            { val: a.asignados || 0, lbl: 'Asignados', cls: 'dash-kpi-blue', filter: 'asignados' },
            { val: a.en_ejec || 0, lbl: 'En ejecución', cls: 'dash-kpi-blue', filter: 'en_ejecucion' },
            { val: a.desestimados || 0, lbl: 'Desestimados', cls: 'dash-kpi-slate', filter: 'desestimados' },
            { val: a.derivados_terceros || 0, lbl: 'Derivados (terceros)', cls: 'dash-kpi-slate', filter: 'derivados_terceros' },
            { val: a.cerrados_hoy || 0, lbl: 'Cerrados hoy', cls: 'green', filter: 'cerrados_hoy' },
            { val: (rTec.rows || []).length, lbl: 'Con posición &lt;20 min', cls: '', filter: 'tecnicos_gps' }
        ];
        const htmlKpi = cards.map(s => `<div class="stat-card dash-kpi-click ${s.cls}" data-dash-filter="${s.filter}" tabindex="0" role="button"><div class="val">${s.val}</div><div class="lbl">${s.lbl}</div></div>`).join('');
        const tr = rTec.rows || [];
        const htmlLt = tr.length
            ? tr.map(row => {
                const min = Math.round((Date.now() - new Date(row.timestamp)) / 60000);
                return `<div style="padding:.35rem 0;border-bottom:1px solid var(--bo)"><b>${String(row.nombre || '').replace(/</g, '&lt;')}</b> <span style="color:var(--tl)">${row.rol || ''}</span> — hace ${min} min</div>`;
            }).join('')
            : '<span style="color:var(--tl)">Sin posiciones en los últimos 20 min (técnicos con app / GPS apagado).</span>';
        const cr = rCi.rows || [];
        const htmlLc = cr.length
            ? cr.map(row => `<div style="padding:.35rem 0;border-bottom:1px solid var(--bo);cursor:pointer;color:var(--bm)" onclick="cerrarModalDashYAbrirPedido(${row.id})">
                    <strong>#${String(row.numero_pedido || '').replace(/</g, '&lt;')}</strong> · ${fmtInformeFecha(row.fecha_cierre)} · ${String(row.tecnico_cierre || '—').replace(/</g, '&lt;')} · NIS ${String(row.nis_medidor || '—').replace(/</g, '&lt;')}
                </div>`).join('')
            : '—';
        if (kpi) kpi.innerHTML = htmlKpi;
        if (lt) lt.innerHTML = htmlLt;
        if (lc) lc.innerHTML = htmlLc;
        if (kpiM) kpiM.innerHTML = htmlKpi;
        if (ltM) ltM.innerHTML = htmlLt;
        if (lcM) lcM.innerHTML = htmlLc;
        bindDashboardKpiClicks(kpi, 'dashboard-filtro-lista-host');
        bindDashboardKpiClicks(kpiM, 'mapa-main-dash-filtro-host');
        try { await refrescarTecnicosMapaPrincipal(); } catch (_) {}
        try {
            const rMx = await sqlSimple(`SELECT COALESCE(MAX(id),0)::bigint AS m FROM pedidos WHERE 1=1${tsql}`);
            const m = Number(rMx.rows?.[0]?.m) || 0;
            if (m > (app._lastMaxPedidoIdSynced || 0)) {
                await cargarPedidos({ silent: true });
            }
        } catch (_) {}
    } catch (e) {
        logErrorWeb('dashboard-kpi', e);
        const em = escHtmlPrint(mensajeErrorUsuario(e));
        if (kpi && !silent) kpi.innerHTML = '<span style="color:var(--re)">' + em + '</span>';
        if (kpiM && !silent) kpiM.innerHTML = '<span style="color:var(--re)">' + em + '</span>';
    }
}

window.cerrarModalDashYAbrirPedido = async function (pid) {
    cerrarModalDashboardGerencia();
    await cargarPedidos();
    const p = app.p.find(x => String(x.id) === String(pid));
    if (!p) { toast('Pedido no encontrado', 'error'); return; }
    app.tab = tabPedidoListaPorEstado(p.es);
    document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === app.tab));
    render();
    void detalle(p);
};
window.cerrarModalDashYVerCierre = window.cerrarModalDashYAbrirPedido;

async function intentarAutoInicioEjecucionTecnico(lat, lng) {
    if (!app.u || !esTecnicoOSupervisor() || modoOffline || !NEON_OK) return;
    const uid = parseInt(app.u.id, 10);
    const umbral = 0.015;
    for (const p of app.p) {
        if (p.es !== 'Asignado' || p.tai !== uid) continue;
        const { la: pla, ln: pln } = coordsEfectivasPedidoMapa(p);
        if (pla == null || pln == null) continue;
        if (distanciaKm(lat, lng, pla, pln) > umbral) continue;
        const now = new Date().toISOString();
        const av = Math.max(parseInt(p.av, 10) || 0, 5);
        await updPedido(p.id, { estado: 'En ejecución', fecha_avance: now, avance: av }, app.u.id);
        const pidNum = parseInt(p.id, 10);
        if (Number.isFinite(pidNum) && pidNum > 0) {
            await asegurarJwtApiRest();
            if (puedeEnviarApiRestPedidos()) void notificarWhatsappClienteEventoApi(pidNum, 'inicio');
        }
        toast('Llegada al lugar: pedido #' + p.np + ' en ejecución', 'success');
    }
}

/** Filtro SQL por tenant cuando `usuarios` tiene tenant_id o cliente_id (misma lógica que la API). */
async function sqlFiltroUsuariosPorTenant() {
    try {
        const r = await sqlSimple(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name IN ('tenant_id','cliente_id')`
        );
        const names = new Set((r.rows || []).map((x) => x.column_name));
        const col = names.has('tenant_id') ? 'tenant_id' : names.has('cliente_id') ? 'cliente_id' : null;
        if (!col) return '';
        return ` AND ${col} = ${esc(tenantIdActual())}`;
    } catch (_) {
        return '';
    }
}

/** Misma condición que `sqlFiltroUsuariosPorTenant` pero con prefijo de tabla (p. ej. JOIN `u`). */
async function sqlFiltroUsuariosPorTenantAliased(alias) {
    const base = await sqlFiltroUsuariosPorTenant();
    if (!base) return '';
    const a = String(alias || 'u').replace(/[^a-zA-Z0-9_]/g, '');
    if (!a) return base;
    return base.replace(/\btenant_id\b/g, `${a}.tenant_id`).replace(/\bcliente_id\b/g, `${a}.cliente_id`);
}

/** Filtro SQL por tenant cuando `distribuidores.tenant_id` existe (misma idea que la API Node). */
async function sqlFiltroDistribuidoresPorTenant() {
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'distribuidores' AND column_name = 'tenant_id' LIMIT 1`
        );
        if (r.rows?.length) return ` AND tenant_id = ${esc(tenantIdActual())}`;
    } catch (_) {}
    return '';
}

/**
 * Listados de distribuidores: `distribuidores.tenant_id` si existe; si no, solo códigos que figuran en
 * `pedidos.distribuidor` del tenant (evita ver el catálogo global al cambiar de empresa sin migrar Neon).
 * Usar siempre con alias de tabla `d` (FROM distribuidores d …).
 */
async function sqlWhereDistribuidoresPorTenantOUsadosEnPedidos() {
    const wfT = await sqlFiltroDistribuidoresPorTenant();
    if (wfT) return wfT;
    try {
        const tsql = await pedidosFiltroTenantSql();
        if (!String(tsql || '').trim()) return '';
        return ` AND EXISTS (
            SELECT 1 FROM pedidos p
            WHERE 1=1${tsql}
            AND TRIM(UPPER(COALESCE(p.distribuidor::text, ''))) = TRIM(UPPER(COALESCE(d.codigo::text, '')))
        )`;
    } catch (_) {
        return '';
    }
}

/** Lista de usuarios para mapas / asignación / nombres — siempre acotada al tenant actual si la columna existe. */
async function refrescarUsuariosCacheDesdeNeon() {
    if (!NEON_OK || modoOffline || !_sql) return;
    try {
        await sqlSimple('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono_whatsapp VARCHAR(32)');
    } catch (_) {}
    const wf = await sqlFiltroUsuariosPorTenant();
    const ru = await sqlSimple(`SELECT id, nombre, email, rol, telefono, telefono_whatsapp, COALESCE(whatsapp_notificaciones, true) AS whatsapp_notificaciones
        FROM usuarios WHERE activo = TRUE${wf} ORDER BY nombre`);
    app.usuariosCache = (ru.rows || []).map((row) => ({ ...row, rol: normalizarRolStr(row.rol) }));
}

async function asegurarNombreUsuariosParaFiltros() {
    if (!NEON_OK || modoOffline || !app.u || !_sql) return;
    if (app.usuariosCache && app.usuariosCache.length) return;
    try {
        await refrescarUsuariosCacheDesdeNeon();
    } catch (_) {}
}

async function cargarPedidos(opts) {
    const silent = !!(opts && opts.silent);
    if (!silent) {
        document.getElementById('pl').innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i> Cargando...</div>';
    }
    if (modoOffline) {
        
        app.p = offlinePedidos();
        render();
        return;
    }
    try {
        await asegurarNombreUsuariosParaFiltros();
        const tsql = await pedidosFiltroTenantSql();
        const verTodosTec = esTecnicoOSupervisor() && leerVerTodosPedidosTecnico();
        let qPed = `SELECT * FROM pedidos WHERE 1=1${tsql} ORDER BY fecha_creacion DESC`;
        if (esTecnicoOSupervisor()) {
            if (!verTodosTec) {
                qPed = `SELECT * FROM pedidos WHERE tecnico_asignado_id = ${esc(parseInt(app.u.id, 10))}${tsql} ORDER BY fecha_creacion DESC`;
            }
        }
        const prevSnapTecnico =
            !esAdmin() && esTecnicoOSupervisor() && (app.p || []).length
                ? new Map((app.p || []).map(p => [String(p.id), { es: p.es, np: p.np, tai: p.tai }]))
                : null;
        let r;
        if (verTodosTec) {
            r = await sqlSimpleSelectAllPages(
                `SELECT * FROM pedidos WHERE 1=1${tsql}`,
                'ORDER BY fecha_creacion DESC'
            );
        } else {
            r = await ejecutarSQLConReintentos(qPed);
        }
        const prevIds = new Set((app.p || []).map(p => p.id));
        app.p = (r.rows || []).map(norm);
        if (prevSnapTecnico) notificarCambiosPedidoTecnico(prevSnapTecnico);
        if (esAdmin() && app.p.length) {
            const mx = app.p.reduce((a, p) => Math.max(a, Number(p.id) || 0), 0);
            if (Number.isFinite(mx) && mx > 0) app._lastMaxPedidoIdSynced = mx;
        }
        // Nuevos pedidos: aviso al admin (lista + dashboard a veces se desincronizaban)
        if (esAdmin() && prevIds.size > 0) {
            const dosMinutosAtras = Date.now() - 2 * 60 * 1000;
            const nuevos = app.p.filter(p => !prevIds.has(p.id));
            nuevos.forEach(p => {
                const urgente = ['Crítica', 'Alta'].includes(p.pr) && p.es === 'Pendiente' &&
                    new Date(p.f).getTime() > dosMinutosAtras;
                if (urgente) {
                    mostrarAlertaPedidoUrgente(p);
                } else {
                    const tit = (p.tt || p.de || '').toString().trim().slice(0, 52);
                    toast(`Nuevo reclamo #${p.np || p.id}${tit ? ' — ' + tit : ''}`, 'info');
                }
            });
        }
        
        offlinePedidosSave(app.p);
    } catch(e) {
        console.warn('cargarPedidos: error, usando cache', e.message);
        setModoOffline(true);
        app.p = offlinePedidos();
        toast('Sin conexión — mostrando pedidos en caché', 'info');
    }
    render();
    try {
        refrescarDetalleSiAbiertoTrasSync();
    } catch (_) {}
    void enriquecerCoordsGeocodificadasPedidos();
}

/** Hook módulos (p. ej. incidencias): recarga lista desde Neon/API sin duplicar lógica en `modules/`. */
if (typeof window !== 'undefined') {
    window.__gnRecargarPedidos = (o) => cargarPedidos(o || { silent: true });
}

/** Llamado desde Android (onResume) para traer cierres/cambios hechos por el admin en la web. */
window.gnSincronizarPedidosDesdeAndroid = function gnSincronizarPedidosDesdeAndroid() {
    if (!app.u || modoOffline || !NEON_OK || !_sql) return;
    if (_gnDmTypingFocused()) return;
    void cargarPedidos({ silent: true });
};




function calcularEscalaReal(zoom) {
    
    
    const lat = app.map ? app.map.getCenter().lat : -31.5;
    const latRad = lat * Math.PI / 180;
    
    const resolucion = (40075016.686 * Math.cos(latRad)) / (256 * Math.pow(2, zoom));
    
    const el = document.getElementById('mc');
    const anchoPantalla = el ? el.clientWidth : 800;
    const metrosVisibles = resolucion * anchoPantalla;
    
    if (metrosVisibles < 1) return (metrosVisibles * 100).toFixed(0) + ' cm';
    if (metrosVisibles < 10) return metrosVisibles.toFixed(1) + ' m';
    if (metrosVisibles < 1000) return Math.round(metrosVisibles) + ' m';
    if (metrosVisibles < 10000) return (metrosVisibles / 1000).toFixed(1) + ' km';
    return Math.round(metrosVisibles / 1000) + ' km';
}










let _watchId         = null;  
let _circuloAcc      = null;  
let _mejorPrecision  = Infinity; 


function mostrarMarcadorUbicacion(lat, lon, acc, opts) {
    if (!app.map) return;
    try {
        gnRequestClearGotoPreviewMarker();
    } catch (_) {}
    if (marcadorUbicacion) {
        try { app.map.removeLayer(marcadorUbicacion); } catch(_) {}
        marcadorUbicacion = null;
    }
    
    if (_circuloAcc) {
        try { app.map.removeLayer(_circuloAcc); } catch(_) {}
        _circuloAcc = null;
    }

    const esBaseOficina = opts && opts.tipo === 'base_oficina';
    if (esBaseOficina) {
        const precisionZoom = 15;
        const svgIcon = L.divIcon({
            className: '',
            html: `<div style="
            width:18px;height:18px;
            background:#1d4ed8;
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 0 0 3px rgba(29,78,216,.35);
            position:relative;
        "></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            popupAnchor: [0, -10]
        });
        const paneGps = app.map.getPane && app.map.getPane('gnPaneGpsUser') ? 'gnPaneGpsUser' : undefined;
        const mk = { icon: svgIcon, zIndexOffset: 220 };
        if (paneGps) mk.pane = paneGps;
        marcadorUbicacion = L.marker([lat, lon], mk)
            .addTo(app.map)
            .bindPopup(`<div style="font-family:system-ui;min-width:180px">
                <b style="color:#1d4ed8">🏢 Ubicación base de oficina</b><br>
                <span style="font-size:10px;color:#94a3b8">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
            </div>`);
        return precisionZoom;
    }

    
    
    
    
    
    const precisionZoom = !acc ? 15
        : acc < 50   ? 17
        : acc < 500  ? 15
        : acc < 5000 ? 13
        : 11;

    
    const svgIcon = L.divIcon({
        className: '',
        html: `<div style="
            width:16px;height:16px;
            background:#10b981;
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 0 0 3px rgba(16,185,129,.4);
            ${gnMapaLigero() ? '' : 'animation:pulse-gps 2s infinite;'}
            position:relative;
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10]
    });

    const accTexto = acc
        ? (acc < 1000 ? `±${Math.round(acc)} m` : `±${(acc/1000).toFixed(1)} km`)
        : 'precisión desconocida';

    const tipoGps = !acc ? 'GPS'
        : acc < 100  ? '🛰️ GPS'
        : acc < 2000 ? '📶 WiFi/Red celular'
        : '🌐 Geolocalización por IP';

    const paneGps = app.map.getPane && app.map.getPane('gnPaneGpsUser') ? 'gnPaneGpsUser' : undefined;
    const mkGps = { icon: svgIcon, zIndexOffset: 200 };
    if (paneGps) mkGps.pane = paneGps;
    marcadorUbicacion = L.marker([lat, lon], mkGps)
        .addTo(app.map)
        .bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
                <b style="color:#059669">📍 Tu ubicación</b><br>
                <span style="font-size:11px;color:#475569">${tipoGps} — ${accTexto}</span><br>
                <span style="font-size:10px;color:#94a3b8">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
            </div>
        `);

    
    if (acc && acc > 50 && !gnMapaLigero()) {
        const radioVisual = Math.min(Math.max(acc * 0.12, 10), 38);
        const cOpt = {
            radius: radioVisual,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.07,
            weight: 1,
            dashArray: '4,6',
            interactive: false,
            bubblingMouseEvents: true
        };
        if (paneGps) cOpt.pane = paneGps;
        _circuloAcc = L.circle([lat, lon], cOpt).addTo(app.map);
    }

    return precisionZoom;
}






function solicitarUbicacion(centrarMapa = true, modoSilencioso = false, opts) {
    if (!navigator.geolocation) {
        if (!modoSilencioso) toast('Geolocalización no disponible en este dispositivo', 'error');
        return;
    }

    const fastUserAction = !!(opts && opts.fastUserAction);
    let intentos = 0;
    const MAX_INTENTOS = gnMapaLigero() ? 2 : 3;
    let centroInicialAplicado = false;

    function procesarPosicion(position, esWatchUpdate = false) {
        const { latitude, longitude, accuracy } = position.coords;
        const acc = Math.round(accuracy);
        registrarFajaInstalacionSiFalta(longitude);
        marcarGpsRecibidoEstaSesion();

        
        if (esWatchUpdate && acc >= _mejorPrecision && acc > 200) return;
        _mejorPrecision = Math.min(_mejorPrecision, acc);

        ultimaUbicacion = { lat: latitude, lon: longitude, acc };
        try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}

        if (app.map) {
            const zoomSugerido = mostrarMarcadorUbicacion(latitude, longitude, acc);
            if (centrarMapa && !centroInicialAplicado) {
                app.map.invalidateSize({ animate: false });
                
                const actualCenter = app.map.getCenter();
                const distLat = Math.abs(actualCenter.lat - latitude);
                const distLon = Math.abs(actualCenter.lng - longitude);
                const estaLejos = distLat > 0.05 || distLon > 0.05;
                if (estaLejos || !esWatchUpdate) {
                    const doAnimate = !fastUserAction && !gnMapaLigero();
                    app.map.setView([latitude, longitude], zoomSugerido, { animate: doAnimate });
                }
                centroInicialAplicado = true;
                setTimeout(() => {
                    document.getElementById('zoom-altura').textContent = calcularEscalaReal(app.map.getZoom());
                }, 300);
            }
        }

        
        if (!modoSilencioso && !esWatchUpdate) {
            const msg = acc < 100
                ? `📍 GPS: ±${acc}m`
                : acc < 2000
                ? `📶 WiFi/Red: ±${acc}m`
                : `🌐 IP: ±${(acc/1000).toFixed(0)}km — precisión baja`;
            toast(msg, acc < 2000 ? 'success' : 'info');
        }
    }

    function manejarError(error) {
        const msgs = {
            1: 'Permiso de ubicación denegado — activalo en Configuración',
            2: 'GPS no disponible',
            3: 'Tiempo de espera agotado'
        };
        if (!modoSilencioso) {
            toast(msgs[error.code] || 'Error de GPS', 'error');
        }
        
        if (ultimaUbicacion && app.map && centrarMapa) {
            app.map.invalidateSize({ animate: false });
            mostrarMarcadorUbicacion(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc);
            app.map.setView([ultimaUbicacion.lat, ultimaUbicacion.lon], 14, { animate: !fastUserAction && !gnMapaLigero() });
            if (!modoSilencioso) toast('📍 Mostrando última ubicación conocida', 'info');
        }
    }

    const geoOptsPrincipal = fastUserAction
        ? { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 }
        : { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
        pos => {
            procesarPosicion(pos, false);

            if (!fastUserAction && pos.coords.accuracy > 100 && intentos < MAX_INTENTOS) {
                const intentarMejorar = () => {
                    if (intentos >= MAX_INTENTOS) return;
                    intentos++;
                    navigator.geolocation.getCurrentPosition(
                        p2 => {
                            procesarPosicion(p2, false);

                            if (p2.coords.accuracy > 100 && intentos < MAX_INTENTOS) {
                                setTimeout(intentarMejorar, 2000);
                            }
                        },
                        () => {},
                        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
                    );
                };
                setTimeout(intentarMejorar, 1500);
            }
        },
        manejarError,
        geoOptsPrincipal
    );

    
    
    
    
    if (!_watchId) {
        _watchId = navigator.geolocation.watchPosition(
            pos => {
                
                const { latitude, longitude, accuracy } = pos.coords;
                const acc = Math.round(accuracy);
                registrarFajaInstalacionSiFalta(longitude);
                ultimaUbicacion = { lat: latitude, lon: longitude, acc };
                try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}
                
                if (!app.map) return;
                marcarGpsRecibidoEstaSesion();
                if (gnMapaLigero()) {
                    const now = Date.now();
                    if (now - _gnLastWatchUbicacionMs < 45000) return;
                    _gnLastWatchUbicacionMs = now;
                }
                mostrarMarcadorUbicacion(latitude, longitude, acc);
            },
            err => console.warn('[GPS watch]', err.message),
            gnMapaLigero()
                ? { enableHighAccuracy: false, maximumAge: 20000, timeout: 20000 }
                : { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }
}

/** Lat/lng de oficina definidos por administrador (EMPRESA_CFG o columnas legadas). */
function parseEmpresaCfgLatLngBase() {
    const ec = window.EMPRESA_CFG || {};
    const latRaw =
        ec.lat_base != null && String(ec.lat_base).trim() !== ''
            ? ec.lat_base
            : ec.latitud != null && String(ec.latitud).trim() !== ''
              ? ec.latitud
              : null;
    const lngRaw =
        ec.lng_base != null && String(ec.lng_base).trim() !== ''
            ? ec.lng_base
            : ec.longitud != null && String(ec.longitud).trim() !== ''
              ? ec.longitud
              : null;
    const lat = latRaw != null ? Number.parseFloat(String(latRaw).trim()) : Number.NaN;
    const lng = lngRaw != null ? Number.parseFloat(String(lngRaw).trim()) : Number.NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) < 1e-7 && Math.abs(lng) < 1e-7) return null;
    return { lat, lng };
}

/**
 * Ubicación central del tenant (manual / admin). Prioridad sobre GPS al usar «Ir a mi ubicación» en el mapa.
 * Primero memoria (EMPRESA_CFG); si falta, GET público /api/config/ubicacion-central (p. ej. técnicos sin merge admin).
 */
async function resolverUbicacionCentralTenantParaMapa() {
    const direct = parseEmpresaCfgLatLngBase();
    if (direct) return { ...direct, source: 'empresa_cfg' };
    const base = String(getApiBaseUrl() || '').trim();
    if (!base || typeof fetch !== 'function') return null;
    const tid = tenantIdActual();
    if (!Number.isFinite(tid) || tid < 1) return null;
    try {
        const headers = { Accept: 'application/json' };
        const tok = typeof getApiToken === 'function' ? getApiToken() : null;
        if (tok) headers.Authorization = `Bearer ${tok}`;
        const url = `${base.replace(/\/+$/, '')}/api/config/ubicacion-central?tenant_id=${encodeURIComponent(String(tid))}`;
        const r = await fetch(url, { cache: 'no-store', headers });
        if (!r.ok) return null;
        const j = await r.json();
        const lat = Number(j.lat);
        const lng = Number(j.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng, source: 'api' };
    } catch (_) {
        return null;
    }
}

/** Botón «Centrar» mapa usuarios admin: GPS admin → punto fijado manual → base oficina/API → marcadores usuarios. */
async function centrarMapaAdminUbicacionesEnMapa() {
    const map = window._mapaUsuariosAdmin;
    if (!map) return;
    try {
        map.invalidateSize({ animate: false });
    } catch (_) {}
    const ul = typeof ultimaUbicacion !== 'undefined' ? ultimaUbicacion : null;
    if (ul && Number.isFinite(ul.lat) && Number.isFinite(ul.lon)) {
        map.setView([ul.lat, ul.lon], Math.max(14, map.getZoom() || 14), { animate: false });
        return;
    }
    const manual = window.__PMG_ADMIN_MANUAL_FIX_LL;
    if (manual && Number.isFinite(manual.lat) && Number.isFinite(manual.lng)) {
        map.setView([manual.lat, manual.lng], Math.max(14, map.getZoom() || 14), { animate: false });
        return;
    }
    const baseCfg = parseEmpresaCfgLatLngBase();
    if (baseCfg) {
        map.setView([baseCfg.lat, baseCfg.lng], Math.max(14, map.getZoom() || 14), { animate: false });
        return;
    }
    const central = await resolverUbicacionCentralTenantParaMapa();
    if (central && Number.isFinite(central.lat) && Number.isFinite(central.lng)) {
        map.setView([central.lat, central.lng], Math.max(14, map.getZoom() || 14), { animate: false });
        return;
    }
    const bs = [];
    try {
        window._marcadoresUsuarios?.forEach((m) => {
            try {
                bs.push(m.getLatLng());
            } catch (_) {}
        });
    } catch (_) {}
    if (bs.length) map.fitBounds(bs, { padding: [40, 40] });
}

async function irAMiUbicacionEnMapa() {
    await ensureMapReady();
    if (!app.map) {
        toast('No se pudo cargar el mapa', 'error');
        return;
    }
    if (esAndroidWebViewMapa()) {
        if (ultimaUbicacion && Number.isFinite(ultimaUbicacion.lat) && Number.isFinite(ultimaUbicacion.lon)) {
            const z = mostrarMarcadorUbicacion(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc || 0);
            app.map.invalidateSize({ animate: false });
            app.map.setView([ultimaUbicacion.lat, ultimaUbicacion.lon], z, { animate: false });
            try {
                const zEl = document.getElementById('zoom-altura');
                if (zEl) zEl.textContent = calcularEscalaReal(app.map.getZoom());
            } catch (_) {}
        }
        solicitarUbicacion(true, false, { fastUserAction: true });
        return;
    }
    const central = await resolverUbicacionCentralTenantParaMapa();
    if (central && Number.isFinite(central.lat) && Number.isFinite(central.lng)) {
        const z = mostrarMarcadorUbicacion(central.lat, central.lng, 0, { tipo: 'base_oficina' });
        app.map.invalidateSize({ animate: false });
        app.map.setView([central.lat, central.lng], Math.max(z || 15, 14), { animate: false });
        try {
            const zEl = document.getElementById('zoom-altura');
            if (zEl) zEl.textContent = calcularEscalaReal(app.map.getZoom());
        } catch (_) {}
        toast('📍 Centro en ubicación base de oficina (configuración del administrador)', 'info');
        return;
    }
    if (ultimaUbicacion && Number.isFinite(ultimaUbicacion.lat) && Number.isFinite(ultimaUbicacion.lon)) {
        const z = mostrarMarcadorUbicacion(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc || 0);
        app.map.invalidateSize({ animate: false });
        app.map.setView([ultimaUbicacion.lat, ultimaUbicacion.lon], z, { animate: false });
        try {
            const zEl = document.getElementById('zoom-altura');
            if (zEl) zEl.textContent = calcularEscalaReal(app.map.getZoom());
        } catch (_) {}
        solicitarUbicacion(true, true, { fastUserAction: true });
        return;
    }
    solicitarUbicacion(true, false, { fastUserAction: true });
}
window.irAMiUbicacionEnMapa = irAMiUbicacionEnMapa;

async function abrirNuevoPedidoEnCoordenadas(lat, lng, acc) {
    return abrirNuevoPedidoDesdePunto(lat, lng, acc);
}
window.abrirNuevoPedidoEnCoordenadas = abrirNuevoPedidoEnCoordenadas;

async function nuevoPedidoDesdeUbicacionActual() {
    const { ejecutarNuevoPedidoDesdeUbicacionActual } = await import('./modules/nuevo-pedido-desde-gps-mapa.js');
    return ejecutarNuevoPedidoDesdeUbicacionActual({
        ensureMapReady,
        getUltimaUbicacion: () => ultimaUbicacion,
        setUltimaUbicacion: (u) => {
            ultimaUbicacion = u;
            try {
                localStorage.setItem('ultima_ubicacion', JSON.stringify(u));
            } catch (_) {}
        },
        abrirNuevoPedidoEnCoordenadas,
        registrarFajaInstalacionSiFalta,
        toast,
        programarReverseNominatimFormularioNuevoPedidoDesdeMapa,
    });
}
window.nuevoPedidoDesdeUbicacionActual = nuevoPedidoDesdeUbicacionActual;

let mapViewImportPromise = null;
function loadMapViewModule() {
    if (!mapViewImportPromise) mapViewImportPromise = import('./map-view.js');
    return mapViewImportPromise;
}

function buildMapViewCtx() {
    return {
        app,
        getApiBaseUrl,
        tenantIdActual,
        get L() { return window.L; },
        document,
        window,
        toast,
        gnMapaLigero,
        aplicarUIMapaPlataforma,
        renderMk,
        registrarFajaInstalacionSiFalta,
        htmlLineaUbicacionFormulario,
        syncWrapCoordsDisplayNuevoPedido,
        poblarSelectTiposReclamo,
        syncNisClienteReclamoConexionUI,
        limpiarFotosYPreviewNuevoPedido,
        esAndroidWebViewMapa,
        esAdmin,
        mapTapUbicacionInicialHechaSesion,
        mapTapNuevoPedidoArmadoSesion,
        desarmarMapTapNuevoPedido,
        get _gpsRecibidoEstaSesion() { return _gpsRecibidoEstaSesion; },
        marcarMapTapUbicacionInicialHecha,
        solicitarUbicacion,
        registrarUbicacionManualAdmin,
        get _modoFijarUbicacionAdmin() { return _modoFijarUbicacionAdmin; },
        set _modoFijarUbicacionAdmin(v) { _modoFijarUbicacionAdmin = v; },
        get mapaInicializado() { return mapaInicializado; },
        set mapaInicializado(v) { mapaInicializado = v; },
        get marcadorUbicacion() { return marcadorUbicacion; },
        set marcadorUbicacion(v) { marcadorUbicacion = v; },
        get _circuloAcc() { return _circuloAcc; },
        set _circuloAcc(v) { _circuloAcc = v; },
        get _mapEscalaDebounceTimer() { return _mapEscalaDebounceTimer; },
        set _mapEscalaDebounceTimer(v) { _mapEscalaDebounceTimer = v; },
        get ultimaUbicacion() { return ultimaUbicacion; },
        set ultimaUbicacion(v) { ultimaUbicacion = v; },
        calcularEscalaReal,
        mostrarMarcadorUbicacion,
        aplicarReverseMapaAdminDesdeClicInicio,
        debeReverseNominatimAdminMapTap,
        programarReverseNominatimFormularioNuevoPedidoDesdeMapa,
        scheduleMapRetry: () => { void initMap(); }
    };
}

async function refreshMapAdminBaseMarkerIfReady() {
    try {
        if (!mapaInicializado || !app.map) return;
        const mod = await loadMapViewModule();
        if (typeof mod.gnRefreshMarcadorUbicacionBaseAdmin === 'function') {
            await mod.gnRefreshMarcadorUbicacionBaseAdmin();
        }
    } catch (_) {}
}

async function initMap() {
    const mod = await loadMapViewModule();
    mod.setMapViewContext(buildMapViewCtx());
    await mod.runInitMap();
}

let _mapLazyQueued = false;
function queueLazyInitMap() {
    if (_mapLazyQueued) return;
    _mapLazyQueued = true;
    const run = () => {
        void initMap().finally(() => {
            try { renderMk(); } catch (_) {}
            scheduleGnMapLayoutBumpsTrasLogin();
        });
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 3500 });
    } else {
        setTimeout(run, 400);
    }
}

/** Tras mostrar #ms / init del mapa, re-fuerza tamaño Leaflet (paneo en web tras login). */
function scheduleGnMapLayoutBumpsTrasLogin() {
    const bump = () => {
        try {
            if (!app.map) return;
            app.map.invalidateSize({ animate: false });
            if (app.map.dragging && typeof app.map.dragging.enable === 'function') app.map.dragging.enable();
        } catch (_) {}
    };
    requestAnimationFrame(() => requestAnimationFrame(bump));
    [100, 320, 800, 1600].forEach((ms) => setTimeout(bump, ms));
}

async function ensureMapReady() {
    if (mapaInicializado && app.map) return;
    _mapLazyQueued = true;
    await initMap();
    try { renderMk(); } catch (_) {}
}
window.ensureMapReady = ensureMapReady;

const btnMapaIrGps = document.getElementById('btn-mapa-ir-gps');
if (btnMapaIrGps) btnMapaIrGps.addEventListener('click', () => irAMiUbicacionEnMapa());
const btnMapaNuevoGps = document.getElementById('btn-mapa-nuevo-gps');
if (btnMapaNuevoGps) btnMapaNuevoGps.addEventListener('click', () => void nuevoPedidoDesdeUbicacionActual());

function renderMk() {
    renderMkPedidosEnMapa({
        app,
        L: window.L,
        pedidosParaMarcadoresMapa,
        coordsEfectivasPedidoMapa,
        esAdmin,
        esAndroidWebViewMapa: () =>
            typeof esAndroidWebViewMapa === 'function' && esAndroidWebViewMapa(),
        pedidoEsDerivadoFuera,
        puedeEnviarApiRestPedidos,
    });
}

/** Tras tocar un botón del popup de Leaflet, el mismo gesto puede generar un click en el mapa (p. ej. WebView Android). */
function suppressNextMapClickFromPopup(ms = 520) {
    try {
        window._gnSuppressMapClickUntil = Date.now() + ms;
    } catch (_) {}
}
window.suppressNextMapClickFromPopup = suppressNextMapClickFromPopup;

window._d = id => {
    suppressNextMapClickFromPopup(550);
    app.map?.closePopup();
    const p = app.p.find(x => String(x.id) === String(id));
    if (p) void detalle(p);
    else toast('No se encontró el pedido en la lista actual. Actualizá el listado e intentá de nuevo.', 'warning');
};

window._z = id => {
    suppressNextMapClickFromPopup(550);
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) return;
    void (async () => {
        await ensureMapReady();
        if (!app.map) return;
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) {
            toast('Este pedido no tiene ubicación GPS ni domicilio geocodificable aún.', 'warning');
            return;
        }
        app.map.closePopup();
        app.map.setView([la, ln], 17, { animate: true });
        setTimeout(() => {
            document.getElementById('zoom-altura').textContent = calcularEscalaReal(app.map.getZoom());
        }, 300);
    })();
};

window._assignMapa = id => {
    suppressNextMapClickFromPopup(550);
    try { app.map?.closePopup(); } catch (_) {}
    abrirModalAsignarTecnico(id);
};

window._desasignarMapa = id => {
    suppressNextMapClickFromPopup(550);
    try { app.map?.closePopup(); } catch (_) {}
    ejecutarDesasignarPedidoPorId(id, { confirmar: true });
};

let _moverUbicMapaState = null;
try {
    window.__gnEsReubicarPedidoMapa = function () {
        return _moverUbicMapaState != null;
    };
} catch (_) {}

function cancelarMoverUbicacionMapa() {
    if (!_moverUbicMapaState) return;
    try {
        if (_moverUbicMapaState.marker) _moverUbicMapaState.marker.remove();
        if (_moverUbicMapaState.onMapClick && app.map) app.map.off('click', _moverUbicMapaState.onMapClick);
    } catch (_) {}
    if (_moverUbicMapaState.barEl?.parentNode) _moverUbicMapaState.barEl.remove();
    _moverUbicMapaState = null;
    try {
        if (app.map) {
            app.map.getContainer().style.cursor = '';
            app.map.dragging.enable();
        }
    } catch (_) {}
}

async function confirmarMoverUbicacionMapa() {
    if (!_moverUbicMapaState?.marker || !_moverUbicMapaState.pedidoId) return;
    const ll = _moverUbicMapaState.marker.getLatLng();
    const la = ll.lat;
    const ln = ll.lng;
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
        toast('Coordenadas inválidas.', 'error');
        return;
    }
    if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) {
        toast('No se acepta la posición 0,0.', 'error');
        return;
    }
    const pid = _moverUbicMapaState.pedidoId;
    cancelarMoverUbicacionMapa();
    await persistirCoordsManualPedidoPanel(pid, la, ln, { silentSuccessToast: true });
}

window._moverUbicMapa = function (pedidoId) {
    if (!esAdmin() || !puedeEnviarApiRestPedidos()) {
        toast('Solo administrador con API activa puede corregir la posición.', 'warning');
        return;
    }
    const p = app.p.find((x) => String(x.id) === String(pedidoId));
    if (!p) {
        toast('Pedido no encontrado en la lista.', 'error');
        return;
    }
    if (p.es === 'Cerrado' || p.es === 'Derivado externo' || pedidoEsDerivadoFuera(p)) {
        toast('No se puede mover la ubicación de un pedido cerrado o derivado.', 'warning');
        return;
    }
    void (async () => {
        suppressNextMapClickFromPopup(550);
        await ensureMapReady();
        if (!app.map || typeof L === 'undefined') return;
        cancelarMoverUbicacionMapa();
        try {
            app.map.closePopup();
        } catch (_) {}
        const { la: la0, ln: ln0 } = coordsEfectivasPedidoMapa(p);
        let la = la0;
        let ln = ln0;
        if (!Number.isFinite(la) || !Number.isFinite(ln)) {
            const c = app.map.getCenter();
            la = c.lat;
            ln = c.lng;
        }
        const mk = L.marker([la, ln], { draggable: true, zIndexOffset: 900 }).addTo(app.map);
        app.map.panTo([la, ln], { animate: true });
        const bar = document.createElement('div');
        bar.id = 'gn-mover-ubic-float-bar';
        bar.setAttribute('role', 'toolbar');
        bar.style.cssText =
            'position:fixed;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:12000;background:#1e293b;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.35);font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:min(96vw,28rem)';
        bar.innerHTML =
            '<span style="opacity:.95">Arrastrá el pin o tocá el mapa para moverlo.</span>' +
            '<button type="button" style="background:#059669;color:#fff;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:600">Confirmar</button>' +
            '<button type="button" style="background:#64748b;color:#fff;border:none;padding:6px 12px;border-radius:8px;cursor:pointer">Cancelar</button>';
        document.body.appendChild(bar);
        try {
            if (typeof window.gnBumpOverlayElement === 'function') window.gnBumpOverlayElement(bar);
        } catch (_) {}
        const [btnOk, btnCan] = bar.querySelectorAll('button');
        btnOk.addEventListener('click', () => void confirmarMoverUbicacionMapa());
        btnCan.addEventListener('click', () => {
            cancelarMoverUbicacionMapa();
            toast('Corrección de posición cancelada.', 'info');
        });
        const onMapClick = (ev) => {
            if (!_moverUbicMapaState?.marker) return;
            _moverUbicMapaState.marker.setLatLng(ev.latlng);
        };
        app.map.on('click', onMapClick);
        try {
            app.map.getContainer().style.cursor = 'crosshair';
        } catch (_) {}
        _moverUbicMapaState = { pedidoId: p.id, marker: mk, onMapClick, barEl: bar };
    })();
};

window._a = (a, id) => {
    if (a === 'i') {
        void (async () => {
            const geo = await verificarGeocercaAntesIniciarPedido(id);
            if (!geo.ok) {
                toast(geo.message || 'Geocerca: no podés iniciar lejos del reclamo', 'warning');
                return;
            }
            await iniciar(id);
        })();
        return;
    }
    const dm = document.getElementById('dm');
    if (dm?.classList.contains('active')) {
        cerrarModalesMoSalvo(['dm']);
    } else {
        closeAll();
    }
    if (a === 'av') abrirAvance(id);
    else void abrirCierre(id);
};

window._zm = id => {
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) return;
    void (async () => {
        await ensureMapReady();
        if (!app.map) return;
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) {
            toast('Este pedido no tiene coordenadas en el mapa (sin GPS ni geocódigo de calle).', 'warning');
            return;
        }
        if (typeof esAndroidWebViewMapa === 'function' && esAndroidWebViewMapa()) {
            gnAndroidCerrarUiEncimaDelMapaParaZoomPedido();
            try {
                cancelarMoverUbicacionMapa();
            } catch (_) {}
        }
        // Cerrar #dm y demás modales: cerrarModalesMoSalvo(['dm']) dejaba el detalle abierto (keep = mantener).
        closeAll();
        setTimeout(() => {
            if (!app.map) return;
            app.map.invalidateSize({ animate: false });
            app.map.setView([la, ln], 17, { animate: true });
            setTimeout(() => {
                document.getElementById('zoom-altura').textContent = calcularEscalaReal(17);
            }, 300);
        }, 100);
    })();
};

// ── Notificaciones a usuarios (admin → técnico, cola en Neon + Android) ──
let _pedidoNotifContext = null;
let _assignPedidoId = null;
let _pollNotifMovilInterval = null;
const KEY_PENDING_NOTIF_PEDIDO_ID = 'pmg_pending_notif_pedido_id';

function guardarPedidoPendienteDesdeNotif(pedidoId) {
    if (!pedidoId) return;
    try { localStorage.setItem(KEY_PENDING_NOTIF_PEDIDO_ID, String(pedidoId)); } catch(_) {}
}

function borrarPedidoPendienteDesdeNotif() {
    try { localStorage.removeItem(KEY_PENDING_NOTIF_PEDIDO_ID); } catch(_) {}
}

function leerPedidoPendienteDesdeNotif() {
    try { return localStorage.getItem(KEY_PENDING_NOTIF_PEDIDO_ID) || ''; } catch(_) { return ''; }
}

async function enfocarPedidoDesdeNotif(pedidoId, opts = {}) {
    const pid = String(pedidoId || '').trim();
    if (!pid || !app.u) return false;

    try {
        document.getElementById('ls')?.classList.remove('active');
        document.getElementById('ms')?.classList.add('active');
        cerrarAdminPanel();
        document.getElementById('gw')?.classList.remove('active');
    } catch (_) {}

    let pedido = app.p.find((x) => String(x.id) === pid);
    if (!pedido && !modoOffline && NEON_OK && _sql) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(parseInt(pid, 10))} LIMIT 1`);
            const row = rr.rows?.[0];
            if (row) {
                pedido = norm(row);
                const idx = app.p.findIndex((x) => String(x.id) === String(pedido.id));
                if (idx >= 0) app.p[idx] = pedido;
                else app.p.unshift(pedido);
            }
        } catch (_) {}
    }
    if (!pedido) return false;

    await ensureMapReady();
    if (!app.map) return false;

    try {
        closeAll();
        void detalle(pedido);
        _zm(String(pedido.id));
        if (opts.scrollDerivacion) {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const el = document.getElementById('gn-focus-derivacion-pedido');
                    if (!el) return;
                    // WebView Android: scroll "smooth" puede cerrar teclado / perder foco en textareas del detalle.
                    if (typeof esAndroidWebViewMapa === 'function' && esAndroidWebViewMapa()) {
                        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    } else {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 180);
            });
        }
        if (!opts.silent) toast('📍 Pedido #' + (pedido.np || pedido.id) + ' centrado en el mapa', 'info');
        return true;
    } catch (_) {
        return false;
    }
}

async function resolverFocoPedidoNotificacion(pedidoId, opts = {}) {
    const pid = String(pedidoId || '').trim();
    if (!pid) return;
    guardarPedidoPendienteDesdeNotif(pid);
    const ok = await enfocarPedidoDesdeNotif(pid, opts);
    if (ok) borrarPedidoPendienteDesdeNotif();
}

window.handleAndroidIntentPedidoId = function (pedidoId) {
    resolverFocoPedidoNotificacion(pedidoId, { silent: true });
};

async function consumirPedidoPendienteDesdeNotif() {
    const pid = leerPedidoPendienteDesdeNotif();
    if (!pid) return;
    const ok = await enfocarPedidoDesdeNotif(pid, { silent: true });
    if (ok) borrarPedidoPendienteDesdeNotif();
}

function llenarSelectUsuariosNotif() {
    const sel = document.getElementById('notif-usuario-select');
    if (!sel) return;
    sel.innerHTML = '';
    const list = app.usuariosCache || [];
    list.forEach(u => {
        if (String(u.id) === String(app.u?.id)) return;
        if (normalizarRolStr(u.rol) === 'admin') return;
        const o = document.createElement('option');
        o.value = u.id;
        const tel = String(u.telefono_whatsapp || u.telefono || '').trim();
        o.textContent = (u.nombre || 'Usuario') + (u.email ? ' — ' + u.email : '') + (tel ? ' — ' + tel : ' — sin teléfono');
        sel.appendChild(o);
    });
    if (!sel.options.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'No hay técnicos activos';
        sel.appendChild(o);
    }
}

async function enviarWhatsappMetaTecnico(uid, pedidoId, mensaje) {
    try {
        const tk = getApiToken();
        if (!tk) return;
        const u = (app.usuariosCache || []).find(x => String(x.id) === String(uid));
        if (!u) return;
        const tel = normalizarTelefonoWhatsapp(u.telefono_whatsapp || u.telefono || '');
        if (!tel || u.whatsapp_notificaciones === false) return;
        await fetch(apiUrl('/api/whatsapp/meta/enviar-texto'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tk}`
            },
            body: JSON.stringify({
                telefono: tel,
                mensaje: String(mensaje || ''),
                destinatario_id: Number(uid),
                pedido_id: Number(pedidoId || 0) || null
            })
        });
    } catch (e) {
        console.warn('[whatsapp-meta]', e?.message || e);
    }
}

function cerrarModalNotifPedido() {
    _pedidoNotifContext = null;
}

function llenarSelectAssignTecnico() {
    const sel = document.getElementById('assign-tecnico-select');
    if (!sel) return;
    sel.innerHTML = '';
    const list = app.usuariosCache || [];
    list.forEach(u => {
        if (String(u.id) === String(app.u?.id)) return;
        if (normalizarRolStr(u.rol) === 'admin') return;
        const o = document.createElement('option');
        o.value = u.id;
        o.textContent = (u.nombre || 'Usuario') + ' (' + (u.rol || '') + ')';
        sel.appendChild(o);
    });
    if (!sel.options.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'No hay técnicos/supervisores';
        sel.appendChild(o);
    }
}

window.abrirModalAsignarTecnico = async function (pedidoId) {
    if (!esAdmin()) {
        toast('Solo administrador puede asignar', 'error');
        return;
    }
    _assignPedidoId = pedidoId;
    try {
        await refrescarUsuariosCacheDesdeNeon();
    } catch (e) {
        logErrorWeb('refresh-usuarios-cache-asignar', e);
    }
    llenarSelectAssignTecnico();
    const sel = document.getElementById('assign-tecnico-select');
    const p = app.p.find(x => String(x.id) === String(pedidoId));
    const tieneAsignado = p && p.tai != null;
    const tit = document.getElementById('assign-modal-title');
    if (tit) tit.innerHTML = tieneAsignado
        ? '<i class="fas fa-user-hard-hat"></i> Reasignar técnico'
        : '<i class="fas fa-user-hard-hat"></i> Asignar técnico';
    const btnDes = document.getElementById('btn-desasignar-tecnico');
    if (btnDes) btnDes.style.display = tieneAsignado ? 'inline-flex' : 'none';
    const btnOk = document.getElementById('btn-confirmar-asignar-tecnico');
    if (!sel) return;
    if (!tieneAsignado && !sel.value) {
        toast('Cargá usuarios en el panel o creá técnicos', 'error');
        return;
    }
    if (btnOk) btnOk.disabled = !sel.value;
    sel.onchange = () => { if (btnOk) btnOk.disabled = !sel.value; };
    const msg = document.getElementById('assign-tecnico-msg');
    if (msg) msg.value = '';
    document.getElementById('modal-asignar-tecnico')?.classList.add('active');
};

async function abrirModalNotificarPedidoPorId(pedidoId) {
    abrirModalAsignarTecnico(pedidoId);
}

window._notificarPedidoMapa = function (pid) {
    if (pid) abrirModalAsignarTecnico(pid);
};
window._notificarPedidoMapaAdmin = function (pid) {
    if (pid) abrirModalAsignarTecnico(pid);
};

async function confirmarEnviarNotifPedido() {
    const sel = document.getElementById('assign-tecnico-select');
    const uid = parseInt(sel?.value || '', 10);
    if (!uid || !_assignPedidoId) {
        toast('Elegí un técnico', 'error');
        return;
    }
    const msgExtra = (document.getElementById('assign-tecnico-msg')?.value || '').trim();
    const p = app.p.find(x => String(x.id) === String(_assignPedidoId));
    const oldTai = p && p.tai != null ? parseInt(p.tai, 10) : null;
    if (oldTai === uid) {
        toast('Ese técnico ya está asignado al pedido', 'info');
        return;
    }
    const titulo = oldTai && oldTai !== uid ? 'Pedido reasignado' : 'Pedido asignado';
    const cuerpo = msgExtra || ('Pedido ' + (p?.np || '#' + _assignPedidoId) + ' — revisá el mapa');
    const now = new Date().toISOString();
    const pidNum = parseInt(_assignPedidoId, 10);
    try {
        await updPedido(_assignPedidoId, {
            tecnico_asignado_id: uid,
            fecha_asignacion: now,
            estado: 'Asignado'
        }, app.u?.id);
        if (oldTai && oldTai !== uid) {
            const tOld = 'Pedido reasignado';
            const cOld = msgExtra || ('Ya no estás asignado a ' + (p?.np || '#' + _assignPedidoId));
            await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida) VALUES (${esc(oldTai)}, ${esc(pidNum)}, ${esc(tOld)}, ${esc(cOld)}, FALSE)`);
            await enviarWhatsappMetaTecnico(oldTai, pidNum, `${tOld}: ${cOld}`);
        }
        await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida) VALUES (${esc(uid)}, ${esc(pidNum)}, ${esc(titulo)}, ${esc(cuerpo)}, FALSE)`);
        await enviarWhatsappMetaTecnico(uid, pidNum, `${titulo}: ${cuerpo}`);
        if (puedeEnviarApiRestPedidos()) {
            const apiRow = await pedidoPutApi(_assignPedidoId, { estado: 'Asignado' });
            if (apiRow) {
                const ix = app.p.findIndex((x) => String(x.id) === String(_assignPedidoId));
                if (ix !== -1) {
                    app.p[ix] = norm(apiRow);
                    offlinePedidosSave(app.p);
                }
            }
        }
        document.getElementById('modal-asignar-tecnico')?.classList.remove('active');
        _assignPedidoId = null;
        toast(oldTai && oldTai !== uid ? 'Reasignado y notificaciones enviadas' : 'Técnico asignado y notificación encolada', 'success');
        await cargarPedidos();
        render();
    } catch (e) {
        toastError('asignar-tecnico', e);
    }
}

async function ejecutarDesasignarPedidoPorId(pedidoId, opts) {
    const id = pedidoId != null ? String(pedidoId) : (_assignPedidoId != null ? String(_assignPedidoId) : '');
    if (!id) return;
    const p = app.p.find(x => String(x.id) === String(id));
    const oldUid = p && p.tai != null ? parseInt(p.tai, 10) : null;
    if (!oldUid) {
        toast('No hay técnico asignado', 'info');
        return;
    }
    if (opts && opts.confirmar && !confirm('¿Desasignar al técnico de este pedido? El estado volverá a Pendiente.')) return;
    const pidNum = parseInt(id, 10);
    try {
        await updPedido(id, {
            tecnico_asignado_id: null,
            fecha_asignacion: null,
            estado: 'Pendiente'
        }, app.u?.id);
        const tOld = 'Pedido desasignado';
        const cOld = 'Te quitaron la asignación de ' + (p?.np || '#' + id) + '. Revisá el mapa.';
        await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida) VALUES (${esc(oldUid)}, ${esc(pidNum)}, ${esc(tOld)}, ${esc(cOld)}, FALSE)`);
        await enviarWhatsappMetaTecnico(oldUid, pidNum, `${tOld}: ${cOld}`);
        document.getElementById('modal-asignar-tecnico')?.classList.remove('active');
        _assignPedidoId = null;
        toast('Técnico desasignado; notificación enviada', 'success');
        await cargarPedidos();
        render();
    } catch (e) {
        toastError('desasignar-tecnico', e);
    }
}

async function confirmarDesasignarPedido() {
    if (!_assignPedidoId) return;
    await ejecutarDesasignarPedidoPorId(_assignPedidoId, { confirmar: true });
}
window.confirmarDesasignarPedido = confirmarDesasignarPedido;
window.ejecutarDesasignarPedidoPorId = ejecutarDesasignarPedidoPorId;

let _pollNotifMovilUsaColumnaLeida = true;

window.pollNotificacionesMovil = async function () {
    if (!app.u || modoOffline || !NEON_OK || !_sql) return;
    const uid = app.u.id;
    const filtroLeida = _pollNotifMovilUsaColumnaLeida ? ' AND leida = FALSE' : '';
    try {
        const r = await sqlSimple(
            `SELECT id, titulo, cuerpo, pedido_id FROM notificaciones_movil WHERE usuario_id = ${esc(uid)}${filtroLeida} ORDER BY id ASC LIMIT 15`
        );
        const rows = r.rows || [];
        const tienePuente = window.AndroidLocalNotify && typeof window.AndroidLocalNotify.show === 'function';
        const esAdm = esAdmin();
        for (const row of rows) {
            const t = row.titulo || 'GestorNova';
            const b = row.cuerpo || '';
            const pid = row.pedido_id != null ? String(row.pedido_id) : '';
            const esNotifRegeo = typeof b === 'string' && b.startsWith('GN_REGEO_LOG_V1\n');
            if (esAdm && esNotifRegeo) {
                try {
                    const raw = b.slice('GN_REGEO_LOG_V1\n'.length);
                    const data = JSON.parse(raw);
                    const lines = Array.isArray(data.log) ? data.log : [];
                    let inner = `<div><p style="margin:0 0 .5rem;font-size:.9rem"><strong>${data.success ? '✅' : '⚠️'} Re-geocodificación automática</strong></p>`;
                    if (data.np) inner += `<p style="font-size:.82rem;color:var(--tm)">Pedido ${escHtmlPrint(String(data.np))}</p>`;
                    if (data.fuente) inner += `<p style="font-size:.78rem;color:var(--tm)">Fuente: ${escHtmlPrint(String(data.fuente))}</p>`;
                    if (data.mensaje && !data.success) inner += `<p style="font-size:.78rem;color:#b45309">${escHtmlPrint(String(data.mensaje))}</p>`;
                    inner += '<div style="background:var(--bg2,#f3f4f6);padding:.6rem;border-radius:.45rem;margin-top:.4rem;max-height:45vh;overflow:auto;font-family:ui-monospace,monospace;font-size:.7rem;line-height:1.4">';
                    for (const line of lines) {
                        const s = String(line);
                        const escaped = escHtmlPrint(s);
                        let color = 'var(--tm)';
                        if (s.includes('✓') || s.includes('✅')) color = '#059669';
                        else if (s.includes('⚠')) color = '#d97706';
                        else if (s.includes('❌')) color = '#dc2626';
                        else if (/PASO|📚|🌍|📐|═/.test(s)) color = '#2563eb';
                        inner += `<div style="color:${color}">${escaped}</div>`;
                    }
                    inner += '</div></div>';
                    if (typeof window.mostrarModalLogRegeocodificacion === 'function') {
                        window.mostrarModalLogRegeocodificacion(inner, { durationMs: 60000 });
                    } else {
                        toast('Re-geocodificación automática (ver consola)', 'info', 8000);
                    }
                } catch (e) {
                    logErrorWeb('notif-regeo-log', e);
                }
                if (_pollNotifMovilUsaColumnaLeida) {
                    await sqlSimple(`UPDATE notificaciones_movil SET leida = TRUE WHERE id = ${esc(row.id)}`);
                }
                continue;
            }
            const esNotifDerivacion =
                /derivaci/i.test(t) || /derivaci/i.test(b) || /solicita derivar/i.test(b);
            if (tienePuente) {
                try {
                    window.AndroidLocalNotify.show(String(row.id), t, b, pid);
                    if (_pollNotifMovilUsaColumnaLeida) {
                        await sqlSimple(`UPDATE notificaciones_movil SET leida = TRUE WHERE id = ${esc(row.id)}`);
                    }
                    if (pid) await resolverFocoPedidoNotificacion(pid, { silent: true, scrollDerivacion: esNotifDerivacion });
                } catch (_) {}
            } else if (esAdm) {
                try {
                    toast(t + (b ? ': ' + b : ''), 'info');
                    if (_pollNotifMovilUsaColumnaLeida) {
                        await sqlSimple(`UPDATE notificaciones_movil SET leida = TRUE WHERE id = ${esc(row.id)}`);
                    }
                    if (pid) {
                        await resolverFocoPedidoNotificacion(pid, {
                            silent: true,
                            scrollDerivacion: esNotifDerivacion,
                        });
                    }
                } catch (_) {}
            }
        }
    } catch (e) {
        const m = String(e.message || e);
        if (_pollNotifMovilUsaColumnaLeida && (m.includes('leida') || (m.includes('column') && m.includes('notificaciones_movil')))) {
            _pollNotifMovilUsaColumnaLeida = false;
            return window.pollNotificacionesMovil();
        }
        if (!m.includes('notificaciones_movil')) console.warn('[notif-movil]', m);
    }
};

function iniciarPollNotifMovil() {
    detenerPollNotifMovil();
    window.pollNotificacionesMovil();
    _pollNotifMovilInterval = setInterval(() => { window.pollNotificacionesMovil(); }, esAdmin() ? 12000 : 18000);
}

function detenerPollNotifMovil() {
    if (_pollNotifMovilInterval) {
        clearInterval(_pollNotifMovilInterval);
        _pollNotifMovilInterval = null;
    }
}

window.cerrarModalNotifPedido = cerrarModalNotifPedido;
window.confirmarEnviarNotifPedido = confirmarEnviarNotifPedido;
window.abrirModalNotificarPedidoPorId = abrirModalNotificarPedidoPorId;


window.cerrarVistaImpresion = function() {
    const contenedor = document.getElementById('print-container');
    if (!contenedor) return;
    contenedor.classList.remove('printing');
    contenedor.innerHTML = '';
};

window.confirmarImpresionPedido = function() {
    document.querySelectorAll('#print-container .print-preview-toolbar').forEach(el => { el.style.display = 'none'; });
    try {
        if (window.AndroidPrint && typeof window.AndroidPrint.printWebContent === 'function') {
            window.AndroidPrint.printWebContent();
            setTimeout(() => { window.cerrarVistaImpresion(); }, 900);
        } else {
            let listo = false;
            const fin = () => {
                if (listo) return;
                listo = true;
                window.cerrarVistaImpresion();
            };
            window.addEventListener('afterprint', fin, { once: true });
            window.print();
            setTimeout(fin, 60000);
        }
    } catch (_) {
        window.cerrarVistaImpresion();
    }
};

function tituloPedidoDocumento(p) {
    const tt = String(p?.tt ?? '').trim();
    const np = String(p?.np ?? '').trim();
    if (tt && np) return `${tt} N° ${np}`;
    if (np) return `Pedido N° ${np}`;
    return tt || 'Pedido';
}

function nombreArchivoExportPedidoUnico(p) {
    const base = tituloPedidoDocumento(p);
    let safe = base.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_');
    if (safe.length > 120) safe = safe.slice(0, 120);
    return safe || ('pedido_' + String(p?.np || 'export').replace(/[\\/:*?"<>|]/g, '-'));
}

function nombreHojaExcelPedidoUnico(p) {
    let s = tituloPedidoDocumento(p).replace(/[:\\/*?\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > 31) s = s.slice(0, 31).trim();
    return s || 'Pedidos';
}

async function imprimirPedidoAsync(p) {
    if (!p) { toast('Pedido inválido', 'error'); return; }
    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    const f = p.f ? new Date(p.f).toLocaleString('es-AR', {...tz, hour12:false}) : '--';
    const fc = p.fc ? new Date(p.fc).toLocaleString('es-AR', {...tz, hour12:false}) : '--';
    const fa = p.fa ? new Date(p.fa).toLocaleString('es-AR', {...tz, hour12:false}) : '--';

    const filasCoordsPrint = (() => {
        const pc = proyectarCoordPedido(p.la, p.ln);
        if (pc) {
            return `<tr><td colspan="2" style="font-size:10pt;color:#64748b;padding-bottom:4px"><b>${escHtmlPrint(pc.crsLinea)}</b> · ${escHtmlPrint(pc.titulo)}</td></tr>
                <tr><td>${escHtmlPrint(pc.lx)}</td><td>${escHtmlPrint(pc.vx)}</td></tr>
                <tr><td>${escHtmlPrint(pc.ly)}</td><td>${escHtmlPrint(pc.vy)}</td></tr>`;
        }
        const cf = ((window.EMPRESA_CFG || {}).coord_proy_familia || 'none').trim();
        if (cf === 'none' && p.x_inchauspe && p.y_inchauspe) {
            return `<tr><td>Inchauspe X (hist.)</td><td>${escHtmlPrint(String(p.x_inchauspe).replace('.', ','))}</td></tr>
                <tr><td>Inchauspe Y (hist.)</td><td>${escHtmlPrint(String(p.y_inchauspe).replace('.', ','))}</td></tr>`;
        }
        return '';
    })();

    let matSection = '';
    if (tipoPedidoExcluyeMateriales(p.tt)) {
        matSection = '';
    } else if (p.es === 'Cerrado' && !String(p.id).startsWith('off_') && NEON_OK && !modoOffline) {
        try {
            const r = await sqlSimple(`SELECT descripcion, cantidad, unidad FROM pedido_materiales WHERE pedido_id=${esc(parseInt(p.id, 10))} ORDER BY id`);
            const rows = r.rows || [];
            let rowsH = '';
            rows.forEach(row => {
                rowsH += `<tr><td>${escHtmlPrint(row.descripcion)}</td><td style="text-align:center;width:18%">${escHtmlPrint(row.unidad ?? '')}</td><td style="text-align:center;width:12%">${escHtmlPrint(String(row.cantidad ?? ''))}</td></tr>`;
            });
            matSection = rowsH
                ? `<h2>🔧 Materiales</h2><table><thead><tr><th>Ítem</th><th>Unidad</th><th>Cantidad</th></tr></thead><tbody>${rowsH}</tbody></table>`
                : `<h2>🔧 Materiales</h2><p style="font-size:9pt">Sin materiales registrados.</p>`;
        } catch (_) {
            matSection = `<h2>🔧 Materiales</h2><p style="font-size:9pt">No se pudieron cargar los materiales.</p>`;
        }
    } else if (p.es === 'Cerrado' && !tipoPedidoExcluyeMateriales(p.tt)) {
        matSection = `<h2>🔧 Materiales</h2><p style="font-size:9pt">Sin datos (sin conexión).</p>`;
    }

    const _labFirma = etiquetaFirmaPersona();
    const firmaSection = p.es === 'Cerrado'
        ? (p.firma
            ? `<h2>✍️ Firma del ${_labFirma}</h2><div><img src="${String(p.firma).replace(/"/g, '&quot;')}" class="firma-print" alt="Firma"/></div>`
            : `<h2>✍️ Firma del ${_labFirma}</h2><p style="font-size:9pt"><em>Sin firma registrada.</em></p>`)
        : '';

    const opinPrint = construirHtmlOpinionClientePrint(p, escHtmlPrint);

    const contenidoCuerpo = `
            <h1>${escHtmlPrint(tituloPedidoDocumento(p))}</h1>
            
            <h2>📋 Información General</h2>
            <table>
                <tr><td>Fecha de Creación:</td><td>${f}</td></tr>
                <tr><td>Estado:</td><td>${escHtmlPrint(p.es)}</td></tr>
                <tr><td>Prioridad:</td><td>${escHtmlPrint(p.pr)}</td></tr>
                <tr><td>Tipo:</td><td>${escHtmlPrint(p.tt || '--')}</td></tr>
                ${p.es === 'Cerrado' ? 
                    `<tr><td>Fecha de Cierre:</td><td>${fc}</td></tr>` : 
                    p.es === 'En ejecución' ? 
                    `<tr><td>Último Avance:</td><td>${fa} (${p.av}%)</td></tr>` : ''}
                <tr><td>Avance:</td><td>${p.av}%</td></tr>
            </table>
            
            <h2>🏢 Datos del Trabajo</h2>
            <table>
                <tr><td>${etiquetaZonaPedido()}:</td><td>${escHtmlPrint(valorZonaPedidoUI(p))}</td></tr>
                ${esCooperativaElectricaRubro() && String(p.trf || '').trim() ? `<tr><td>Trafo:</td><td>${escHtmlPrint(p.trf)}</td></tr>` : ''}
                ${String(p.nis || '').trim() ? `<tr><td>NIS</td><td>${escHtmlPrint(p.nis)}</td></tr>` : ''}
                ${String(p.cnom || p.cl || '').trim() ? `<tr><td>Nombre y apellido</td><td>${escHtmlPrint(p.cnom || p.cl)}</td></tr>` : ''}
                ${String(p.ccal || '').trim() ? `<tr><td>Calle</td><td>${escHtmlPrint(p.ccal)}</td></tr>` : ''}
                ${String(p.cnum || '').trim() ? `<tr><td>Número</td><td>${escHtmlPrint(p.cnum)}</td></tr>` : ''}
                ${String(p.cloc || '').trim() ? `<tr><td>Localidad</td><td>${escHtmlPrint(p.cloc)}</td></tr>` : ''}
                ${String(p.stc || '').trim() ? `<tr><td>Tipo de conexión</td><td>${escHtmlPrint(p.stc)}</td></tr>` : ''}
                ${String(p.sfs || '').trim() ? `<tr><td>Fases</td><td>${escHtmlPrint(p.sfs)}</td></tr>` : ''}
                ${String(p.cdir || '').trim() ? `<tr><td>Referencia / notas ubicación</td><td>${escHtmlPrint(p.cdir)}</td></tr>` : ''}
                <tr><td>Descripción:</td><td>${escHtmlPrint(p.de)}</td></tr>
            </table>
            
            ${p.es === 'Cerrado' ? `
            <h2>✅ Cierre del Pedido</h2>
            <table>
                <tr><td>Fecha cierre:</td><td>${fc}</td></tr>
                ${p.tc ? `<tr><td>Técnico:</td><td>${escHtmlPrint(p.tc)}</td></tr>` : ''}
                ${p.tr ? `<tr><td>Trabajo realizado:</td><td>${escHtmlPrint(p.tr)}</td></tr>` : ''}
            </table>
            ` : ''}
            ${opinPrint}
            ${matSection}
            ${firmaSection}
            
            <h2>📍 Ubicación</h2>
            <table>
                <tr><td>Provincia:</td><td>${escHtmlPrint(String(p.cpcia || '').trim() || '—')}</td></tr>
                <tr><td>Código postal:</td><td>${escHtmlPrint(String(p.ccp || '').trim() || '—')}</td></tr>
                <tr><td>WGS84 Lat:</td><td>${p.la != null ? escHtmlPrint(String(p.la.toFixed(5).replace('.', ','))) : '--'}</td></tr>
                <tr><td>WGS84 Lng:</td><td>${p.ln != null ? escHtmlPrint(String(p.ln.toFixed(5).replace('.', ','))) : '--'}</td></tr>
                ${filasCoordsPrint}
            </table>
            
            <div style="margin-top:1.2rem; text-align:center; color:#94a3b8; font-size:0.75rem;">
                Documento generado el ${new Date().toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires', hour12:false})}
            </div>`;

    const contenedor = document.getElementById('print-container');
    contenedor.innerHTML = `
        <div class="print-preview-wrap">
            <div class="print-preview-toolbar no-print">
                <button type="button" class="ppt-btn ppt-cancel" onclick="window.cerrarVistaImpresion()"><i class="fas fa-times"></i> Cancelar</button>
                <button type="button" class="ppt-btn ppt-ok" onclick="window.confirmarImpresionPedido()"><i class="fas fa-print"></i> Imprimir</button>
            </div>
            <div class="print-content print-a4-tight">${contenidoCuerpo}</div>
        </div>`;
    contenedor.classList.add('printing');
}

window.imprimirPedido = function(p) {
    imprimirPedidoAsync(p).catch(e => toastError('imprimir-pedido', e, 'Error al preparar impresión.'));
};
window.imprimirPedidoPorId = function(id) {
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) { toast('Pedido no encontrado', 'error'); return; }
    imprimirPedidoAsync(p).catch(e => toastError('imprimir-pedido', e, 'Error al preparar impresión.'));
};



function leerOrientacionEXIF(arrayBuffer) {
    try {
        const view = new DataView(arrayBuffer);
        if (view.getUint16(0, false) !== 0xFFD8) return 1; 
        const length = view.byteLength;
        let offset = 2;
        while (offset < length) {
            if (view.getUint16(offset, false) !== 0xFFE1) { offset += 2 + view.getUint16(offset + 2, false); continue; }
            if (view.getUint32(offset + 4, false) !== 0x45786966) return 1;
            const little = view.getUint16(offset + 10, false) === 0x4949;
            const ifdOffset = offset + 10 + view.getUint32(offset + 14, little);
            const entries = view.getUint16(ifdOffset, little);
            for (let i = 0; i < entries; i++) {
                if (view.getUint16(ifdOffset + 2 + i * 12, little) === 0x0112)
                    return view.getUint16(ifdOffset + 2 + i * 12 + 8, little);
            }
        }
    } catch(_) {}
    return 1;
}

function comprimirImagen(file, opts = {}) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = (evBuf) => {
            const usarExifRotacion = opts.usarExifRotacion !== false;
            const blob = new Blob([evBuf.target.result], { type: file.type });
            const urlObj = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(urlObj);
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;

                
                
                const portrait = h > w;
                const orientacion = usarExifRotacion ? leerOrientacionEXIF(evBuf.target.result) : 1;
                const rotar = portrait && [5,6,7,8].includes(orientacion);
                const maxSize = 1600; 
                const mayor = rotar ? Math.max(h, w) : Math.max(w, h);
                if (mayor > maxSize) {
                    const r = maxSize / mayor;
                    w = Math.round(w * r);
                    h = Math.round(h * r);
                }

                if (rotar) { canvas.width = h; canvas.height = w; }
                else       { canvas.width = w; canvas.height = h; }

                const ctx = canvas.getContext('2d');
                ctx.save();
                
                
                let ang = 0;
                let sx = 1;
                let sy = 1;
                if      (orientacion === 2) { sx = -1; }
                else if (orientacion === 3) { ang = Math.PI; }
                else if (orientacion === 4) { sy = -1; }
                else if (orientacion === 5) { ang = Math.PI / 2; sx = -1; }
                
                else if (orientacion === 6) { ang = -Math.PI / 2; }
                else if (orientacion === 7) { ang = -Math.PI / 2; sx = -1; }
                else if (orientacion === 8) { ang = Math.PI / 2; }

                ctx.translate(canvas.width / 2, canvas.height / 2);
                if (rotar) {
                    ctx.rotate(ang);
                    ctx.scale(sx, sy);
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                } else {
                    
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                }
                ctx.restore();

                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = urlObj;
        };
        reader.onerror = reject;
    });
}


(function() {
    const modal = document.getElementById('modal-foto-ampliada');
    const img   = document.getElementById('foto-ampliada');
    const cont  = document.getElementById('img-container');
    const info  = document.getElementById('foto-zoom-nivel');
    
    let scale = 1;       
    let tx = 0, ty = 0; 
    let rot = 0;         
    let isDragging = false;
    let lastX = 0, lastY = 0;
    
    let lastDist = 0;
    let rafTransform = null;
    let transformPendingAnimate = false;

    function applyTransform(animate) {
        img.style.transition = animate ? 'transform .2s' : 'none';
        img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale}) rotate(${rot}deg)`;
        info.textContent = Math.round(scale * 100) + '%';
        cont.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    }

    function scheduleTransform(animate) {
        transformPendingAnimate = transformPendingAnimate || !!animate;
        if (rafTransform != null) return;
        rafTransform = requestAnimationFrame(() => {
            rafTransform = null;
            const anim = transformPendingAnimate;
            transformPendingAnimate = false;
            applyTransform(anim);
        });
    }

    function setFotoPanning(on) {
        try {
            if (on) modal.classList.add('gn-foto-panning');
            else modal.classList.remove('gn-foto-panning');
        } catch (_) {}
    }

    function clampTranslation() {
        if (scale <= 1) { tx = 0; ty = 0; return; }
        let imgW = img.naturalWidth  || img.offsetWidth;
        let imgH = img.naturalHeight || img.offsetHeight;
        
        const rotNorm = ((rot % 360) + 360) % 360;
        if (rotNorm === 90 || rotNorm === 270) {
            const t = imgW; imgW = imgH; imgH = t;
        }
        
        const maxX = Math.max(0, (imgW  * scale - cont.clientWidth)  / 2);
        const maxY = Math.max(0, (imgH  * scale - cont.clientHeight) / 2);
        tx = Math.max(-maxX, Math.min(maxX, tx));
        ty = Math.max(-maxY, Math.min(maxY, ty));
    }

    function resetZoom() {
        scale = 1; tx = 0; ty = 0; rot = 0;
        applyTransform(true);
        if (btnGuardar) btnGuardar.style.display = 'none';
    }
    function zoomBy(delta, cx, cy) {
        const prev = scale;
        scale = Math.max(1, Math.min(8, scale * delta));
        
        if (cx !== undefined) {
            const rect = cont.getBoundingClientRect();
            const ox = cx - rect.left - cont.clientWidth  / 2;
            const oy = cy - rect.top  - cont.clientHeight / 2;
            tx -= ox * (scale / prev - 1);
            ty -= oy * (scale / prev - 1);
        }
        clampTranslation();
        scheduleTransform(false);
    }

    window._fotoCtx = null; 
    window.verFotoAmpliada = function(src, ctx) {
        img.src = src;
        window._fotoCtx = ctx || null;
        resetZoom();
        modal.classList.add('active');
        img.style.transition = 'none';
        const rr = ctx && ctx.tipo === 'reclamo_imagen' ? Number(ctx.reclamo_imagen_rotacion) : NaN;
        if (Number.isFinite(rr)) {
            rot = ((Math.round(rr) % 360) + 360) % 360;
        } else {
            rot = 0;
        }
        tx = 0; ty = 0; scale = 1;
        applyTransform(false);
        
        if (btnGuardarBD) btnGuardarBD.style.display = ctx ? 'flex' : 'none';
    };

    
    document.getElementById('cerrar-modal-foto').addEventListener('click', () => {
        modal.classList.remove('active');
        resetZoom();
    });
    
    modal.addEventListener('click', e => {
        if (e.target === modal) { modal.classList.remove('active'); resetZoom(); }
    });
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.classList.contains('active'))
            { modal.classList.remove('active'); resetZoom(); }
    });

    
    document.getElementById('foto-zoom-in').addEventListener('click', e => {
        e.stopPropagation(); zoomBy(1.4);
    });
    document.getElementById('foto-zoom-out').addEventListener('click', e => {
        e.stopPropagation(); zoomBy(1/1.4);
    });
    document.getElementById('foto-zoom-reset').addEventListener('click', e => {
        e.stopPropagation(); resetZoom();
    });

    
    const btnGuardar   = document.getElementById('foto-guardar');
    const btnGuardarBD = document.getElementById('foto-guardar-bd');

    
    function aplicarRotacionAlCanvas() {
        if (!img.src || img.src === window.location.href) return null;
        const rotNorm = ((rot % 360) + 360) % 360;
        if (rotNorm === 0) return null;
        const canvas = document.createElement('canvas');
        const swap = rotNorm === 90 || rotNorm === 270;
        canvas.width  = swap ? img.naturalHeight : img.naturalWidth;
        canvas.height = swap ? img.naturalWidth  : img.naturalHeight;
        const ctx2 = canvas.getContext('2d');
        ctx2.translate(canvas.width / 2, canvas.height / 2);
        ctx2.rotate(rotNorm * Math.PI / 180);
        ctx2.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        return canvas.toDataURL('image/jpeg', 0.92);
    }

    
    document.getElementById('foto-rotate-90').addEventListener('click', e => {
        e.stopPropagation();
        rot = ((rot + 90) % 360);
        tx = 0; ty = 0;
        clampTranslation();
        applyTransform(true);
        const hayRot = rot !== 0;
        btnGuardar.style.display   = hayRot ? 'flex' : 'none';
        
        if (btnGuardarBD) btnGuardarBD.style.display = (hayRot && window._fotoCtx) ? 'flex' : 'none';
    });

    
    if (btnGuardarBD) {
        btnGuardarBD.addEventListener('click', async e => {
            e.stopPropagation();
            const dataUrl = aplicarRotacionAlCanvas();
            if (!dataUrl) { toast('Sin rotación para guardar', 'info'); return; }
            const ctx3 = window._fotoCtx;
            if (!ctx3) { toast('Sin contexto de pedido', 'info'); return; }

            btnGuardarBD.disabled = true;
            btnGuardarBD.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

            try {
                if (ctx3.tipo === 'temporal') {
                    
                    fotosTemporales[ctx3.idx] = dataUrl;
                    actualizarVistaPreviaFotos();
                    
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    toast('✓ Rotación guardada en el pedido', 'success');

                } else if (ctx3.tipo === 'cierre_temp') {
                    
                    fotoCierreTemp = dataUrl;
                    actualizarVistaPreviaFotoCierre();
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    toast('✓ Rotación guardada en la foto de cierre', 'success');

                } else if (ctx3.tipo === 'pedido_fotos') {
                    
                    const pedido = app.p.find(x => String(x.id) === String(ctx3.id));
                    if (!pedido) throw new Error('Pedido no encontrado');
                    pedido.fotos[ctx3.idx] = dataUrl;
                    const nuevasCadena = pedido.fotos.join('||');
                    if (!modoOffline && NEON_OK) {
                        await ejecutarSQLConReintentos(
                            `UPDATE pedidos SET foto_base64 = ${esc(nuevasCadena)} WHERE id = ${esc(parseInt(ctx3.id))}`
                        );
                    } else {
                        enqueueOffline({ tipo:'UPDATE', query:`UPDATE pedidos SET foto_base64 = ${esc(nuevasCadena)} WHERE id = ${esc(parseInt(ctx3.id))}` });
                    }
                    offlinePedidosSave(app.p);
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    
                    const pedidoActual = app.p.find(x => String(x.id) === String(ctx3.id));
                    if (pedidoActual) void detalle(pedidoActual);
                    toast('✓ Rotación guardada en el pedido', 'success');

                } else if (ctx3.tipo === 'reclamo_imagen') {
                    const pid = String(ctx3.id || '').trim();
                    if (!pid) throw new Error('Pedido inválido');
                    await guardarRotacionReclamoDesdeFotoAmpliada(pid, rot);
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    toast('✓ Rotación de imagen del reclamo guardada', 'success');
                } else if (ctx3.tipo === 'pedido_cierre') {
                    
                    const pedido = app.p.find(x => String(x.id) === String(ctx3.id));
                    if (!pedido) throw new Error('Pedido no encontrado');
                    pedido.foto_cierre = dataUrl;
                    if (!modoOffline && NEON_OK) {
                        await ejecutarSQLConReintentos(
                            `UPDATE pedidos SET foto_cierre = ${esc(dataUrl)} WHERE id = ${esc(parseInt(ctx3.id))}`
                        );
                    } else {
                        enqueueOffline({ tipo:'UPDATE', query:`UPDATE pedidos SET foto_cierre = ${esc(dataUrl)} WHERE id = ${esc(parseInt(ctx3.id))}` });
                    }
                    offlinePedidosSave(app.p);
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    const pedidoActual2 = app.p.find(x => String(x.id) === String(ctx3.id));
                    if (pedidoActual2) void detalle(pedidoActual2);
                    toast('✓ Rotación de foto de cierre guardada', 'success');
                }
            } catch(err) {
                console.error('Error guardando rotación:', err);
                toast('Error al guardar: ' + err.message, 'error');
            } finally {
                btnGuardarBD.disabled = false;
                btnGuardarBD.innerHTML = '<i class="fas fa-save"></i> Guardar';
            }
        });
    }

    
    btnGuardar.addEventListener('click', async e => {
        e.stopPropagation();
        if (!img.src || img.src === window.location.href) return;
        const rotNorm = ((rot % 360) + 360) % 360;
        
        let dataUrl;
        if (rotNorm !== 0) {
            dataUrl = aplicarRotacionAlCanvas();
        } else {
            dataUrl = img.src; 
        }
        if (!dataUrl) return;
        
        if (navigator.share && navigator.canShare) {
            try {
                const res  = await fetch(dataUrl);
                const blob = await res.blob();
                const file = new File([blob], 'foto_pedido.jpg', { type: 'image/jpeg' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'Foto Pedido MG' });
                    toast('Foto compartida/guardada', 'success');
                    return;
                }
            } catch(err) {
                if (err.name !== 'AbortError') console.warn('Share falló:', err.message);
            }
        }
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'foto_pedido' + (rotNorm !== 0 ? '_rotada' : '') + '.jpg';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); }, 500);
        toast('Foto descargada', 'success');
    });

    
    
    cont.addEventListener('click', e => {
        if (hasMoved) { hasMoved = false; return; } 
        if (scale < 1.5) zoomBy(2.5, e.clientX, e.clientY);
        else resetZoom();
    });

    
    cont.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.2 : 1/1.2;
        zoomBy(delta, e.clientX, e.clientY);
    }, { passive: false });

    
    
    let hasMoved = false;
    cont.addEventListener('mousedown', e => {
        if (scale < 1.05) return;
        isDragging = true;
        hasMoved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        setFotoPanning(true);
        cont.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
        tx += dx; ty += dy;
        lastX = e.clientX; lastY = e.clientY;
        clampTranslation();
        scheduleTransform(false);
    });
    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        setFotoPanning(false);
        cont.style.cursor = scale > 1.05 ? 'grab' : 'zoom-in';
    });

    
    cont.addEventListener('touchstart', e => {
        setFotoPanning(true);
        if (e.touches.length === 2) {
            lastDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        } else if (e.touches.length === 1 && scale > 1) {
            isDragging = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
        }
        e.preventDefault();
    }, { passive: false });

    cont.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            if (lastDist > 0) zoomBy(dist / lastDist, cx, cy);
            lastDist = dist;
            scheduleTransform(false);
        } else if (e.touches.length === 1 && isDragging) {
            tx += e.touches[0].clientX - lastX;
            ty += e.touches[0].clientY - lastY;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            clampTranslation();
            scheduleTransform(false);
        }
        e.preventDefault();
    }, { passive: false });

    cont.addEventListener('touchend', e => {
        if (e.touches.length < 2) lastDist = 0;
        if (e.touches.length === 0) {
            isDragging = false;
            setFotoPanning(false);
        }
    });

    cont.addEventListener('touchcancel', () => {
        isDragging = false;
        setFotoPanning(false);
    });

})(); 


initPedidoFotosCampoAndroid({
    comprimirImagen,
    toast,
    abrirCamara,
    esAndroidShell: () => document.documentElement.classList.contains('gn-android-shell'),
    mergeFotosBase64EnPedido,
});

async function procesarFotoSeleccionada(file, opts = {}) {
    if (!file) return;
    try {
        const compressedImage = await comprimirImagen(file, opts);
        fotosTemporales.push(compressedImage);
        actualizarVistaPreviaFotos();
        
        const kb = Math.round(compressedImage.length * 0.75 / 1024);
        toast(`✓ Foto lista (≈${kb} KB)`, 'success');
    } catch (error) {
        console.error('Error al procesar imagen:', error);
        toast('Error al procesar la imagen', 'error');
    }
}
















const esMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const esAndroidApp = /GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:';

(function mostrarVersionEnLogin() {
    var el = document.getElementById('app-version');
    if (!el) return;
    if (esAndroidApp && window.AndroidConfig && typeof window.AndroidConfig.getAppVersion === 'function') {
        try {
            el.textContent = 'Versión ' + window.AndroidConfig.getAppVersion();
        } catch (_) {}
    } else {
        el.textContent = 'Versión web ' + GN_VERSION_WEB;
    }
})();

function dispararSelectorArchivos(input) {
    if (!input) return;
    try { input.value = ''; } catch(_) {}
    input.click();
}




function abrirCamara(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (esMobile) {
        
        
        input.setAttribute('capture', 'environment');
    } else {
        
        input.removeAttribute('capture');
    }
    dispararSelectorArchivos(input);
}


async function procesarFotoCierre(file, opts = {}) {
    if (!file) return;
    try {
        toast('Procesando foto de cierre...', 'info');
        fotoCierreTemp = await comprimirImagen(file, opts);
        actualizarVistaPreviaFotoCierre();
        const kb = Math.round(fotoCierreTemp.length * 0.75 / 1024);
        toast(`✓ Foto de cierre lista (≈${kb} KB)`, 'success');
    } catch (err) {
        console.error('Error procesando foto cierre:', err);
        toast('Error al procesar la foto', 'error');
    }
}


document.getElementById('btn-tomar-foto').addEventListener('click', () => {
    abrirCamara('input-foto-camara');
});




document.getElementById('input-foto-camara').addEventListener('change', async (e) => {
    if (e.target.files[0]) await procesarFotoSeleccionada(e.target.files[0], { usarExifRotacion: true });
    e.target.value = '';
});
document.getElementById('input-foto-galeria').addEventListener('change', async (e) => {
    
    if (e.target.files[0]) await procesarFotoSeleccionada(e.target.files[0], { usarExifRotacion: false });
    e.target.value = '';
});


document.getElementById('btn-foto-cierre-camara').addEventListener('click', () => {
    abrirCamara('input-foto-cierre-camara');
});




document.getElementById('input-foto-cierre-camara').addEventListener('change', async (e) => {
    if (e.target.files[0]) await procesarFotoCierre(e.target.files[0], { usarExifRotacion: true });
    e.target.value = '';
});
document.getElementById('input-foto-cierre-galeria').addEventListener('change', async (e) => {
    
    if (e.target.files[0]) await procesarFotoCierre(e.target.files[0], { usarExifRotacion: false });
    e.target.value = '';
});

function actualizarVistaPreviaFotos() {
    const container = document.getElementById('vista-previa-fotos');
    container.innerHTML = '';
    fotosTemporales.forEach((foto, index) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block';
        const img = document.createElement('img');
        img.src = foto;
        img.className = 'foto-miniatura';
        img.onclick = () => window.verFotoAmpliada(foto, { tipo: 'temporal', idx: index });
        
        const del = document.createElement('button');
        del.type = 'button';
        del.innerHTML = '✕';
        del.title = 'Eliminar foto';
        del.style.cssText = 'position:absolute;top:-5px;right:-5px;background:#ef4444;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;z-index:10';
        del.onclick = (e) => {
            e.stopPropagation();
            fotosTemporales.splice(index, 1);
            actualizarVistaPreviaFotos();
        };
        wrap.appendChild(img);
        wrap.appendChild(del);
        container.appendChild(wrap);
    });
    
    if (fotosTemporales.length > 0) {
        const cnt = document.createElement('div');
        cnt.style.cssText = 'width:100%;font-size:.75rem;color:#475569;margin-top:.25rem';
        cnt.textContent = fotosTemporales.length + ' foto(s) adjunta(s)';
        container.appendChild(cnt);
    }
}


function abrirAvance(id) {
    resetFotosAvanceSesion();
    abrirModalAvancePedido(id, (pid) => app.p.find((x) => String(x.id) === String(pid)));
}

initPedidoAvanceModalUI({
    findPedido: (id) => app.p.find((p) => String(p.id) === String(id)),
    onGuardar: async (id, avance) => {
        await actualizarAvance(id, avance);
        const fotosAv = tomarFotosAvanceTemp();
        if (fotosAv.length) await mergeFotosBase64EnPedido(id, fotosAv);
    },
    toast,
});


const _pfSubmitEl = () => document.getElementById('pf');
function _bindPedidoFormSubmit() {
    const pf = _pfSubmitEl();
    if (!pf || pf.dataset.gnSubmitBound === '1') return;
    pf.dataset.gnSubmitBound = '1';
    pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const depsUbicOficina = {
        nominatimFetchSearch: _nominatimFetchSearch,
        htmlLineaUbicacionFormulario,
        syncWrapCoordsDisplayNuevoPedido,
        mostrarMarcadorUbicacion,
        ensureMapReady,
        parseEmpresaCfgLatLngBase,
        resolverUbicacionCentralTenantParaMapa,
    };
    const eraPedidoOficina = esPedidoNuevoModoOficina();
    const prepUbic = await prepararUbicacionSubmitPedidoOficina(depsUbicOficina);
    if (!prepUbic.ok) {
        btn.disabled = false;
        return;
    }
    if (!asegurarAppSelParaGuardarPedido(prepUbic)) {
        toast(
            eraPedidoOficina
                ? 'Falta la ubicación: usá «Buscar dirección» o «Marcar en mapa».'
                : 'Selecciona ubicación en el mapa',
            'error'
        );
        btn.disabled = false;
        return;
    }
    const coordsInsert = coordsDesdeAppParaGuardar();
    if (!coordsInsert) {
        toast('No se pudieron leer las coordenadas del reclamo.', 'error');
        btn.disabled = false;
        return;
    }
    if (app.sel == null) {
        app.sel = { lat: coordsInsert.lat, lng: coordsInsert.lng };
    }
    
    try {
        
        const anioActual = new Date().getFullYear();
        let numPedido;
        if (modoOffline || !NEON_OK) {
            const tidOff = tenantIdActual();
            const keyContador = 'pmg_contador_tenant_' + tidOff + '_' + anioActual;
            const contadorLocal = parseInt(localStorage.getItem(keyContador) || '0') + 1;
            localStorage.setItem(keyContador, String(contadorLocal));
            numPedido = 'PM-' + anioActual + '-' + String(contadorLocal).padStart(4, '0');
        } else {
            try {
                numPedido = await bumpPedidoContadorSqlNeon();
            } catch (_) {
                const fallback = Date.now().toString().slice(-5);
                numPedido = 'PM-' + anioActual + '-' + fallback;
            }
        }
        const fotosString = fotosTemporales.join('||');
        let xInchauspe = null, yInchauspe = null;
        try {
            asegurarDefsProyeccionesARG();
            const zNuevo = fajaArgentinaPorLongitud(app.sel.lng);
            const xyNuevo = proj4('EPSG:4326', 'PMG_inchauspe_Z' + zNuevo, [app.sel.lng, app.sel.lat]);
            xInchauspe = xyNuevo[0].toFixed(2);
            yInchauspe = xyNuevo[1].toFixed(2);
        } catch (_) {}

        const tipoTr = document.getElementById('tt')?.value || '';
        const permitidos = tiposReclamoSeleccionables();
        if (!permitidos.includes(tipoTr)) {
            toast('Elegí un tipo de reclamo válido para el rubro de tu organización.', 'error');
            btn.disabled = false;
            return;
        }
        const reqNis = tipoReclamoRequiereNisYCliente(tipoTr);
        const reqNombreCli = tipoReclamoRequiereNombreClienteEnFormulario(tipoTr);
        const nisVal = (document.getElementById('nis').value || '').trim();
        const clVal = (document.getElementById('cl').value || '').trim();
        if (reqNis && !nisVal) {
            toast('Para este tipo de reclamo el NIS / medidor es obligatorio', 'error');
            btn.disabled = false;
            return;
        }
        if (reqNombreCli && !clVal) {
            toast('Para este tipo de reclamo el nombre de cliente es obligatorio', 'error');
            btn.disabled = false;
            return;
        }
        const uidCre = app.u?.id || 1;
        const telVal = (document.getElementById('ped-tel-contacto')?.value || '').trim();
        const cliNomVal = (document.getElementById('cl').value || '').trim();
        const calleVal = (document.getElementById('ped-cli-calle')?.value || '').trim();
        const numVal = (document.getElementById('ped-cli-num')?.value || '').trim();
        const locVal = (document.getElementById('ped-cli-loc')?.value || '').trim();
        const refUbicVal = (document.getElementById('ped-cli-ref')?.value || '').trim();
        let disVal = (document.getElementById('di2').value || '').trim();
        const trafoInp = document.getElementById('trafo-pedido');
        let trafoVal = (trafoInp && trafoInp.value ? trafoInp.value : '').trim();
        let barrioVal = null;
        const tieneNisMed = !!nisVal;
        if (esCooperativaElectricaRubro()) {
            if (!tieneNisMed) {
                trafoVal = '';
            }
        } else if (esMunicipioRubro()) {
            barrioVal = disVal || null;
            disVal = '';
            trafoVal = '';
        } else if (esCooperativaAguaRubro()) {
            trafoVal = '';
        }
        if (
            esCooperativaElectricaRubro() &&
            tieneNisMed &&
            (disVal || trafoVal) &&
            !modoOffline &&
            NEON_OK
        ) {
            const cZona = await contarPedidosCorteZonaNeon(disVal, trafoVal);
            if (cZona >= 4) {
                const wa = urlWhatsappAtencionDesdeCfg();
                const msg =
                    'En las últimas horas hay varios reclamos abiertos en la misma zona (mismo distribuidor o trafo). Podría tratarse de un corte de sector o general.\n\n' +
                    (wa ? '¿Abrimos WhatsApp para hablar con un representante de la cooperativa antes de cargar el reclamo?' : 'Contactá a la cooperativa antes de cargar otro reclamo.');
                if (wa && confirm(msg)) {
                    window.open(wa, '_blank', 'noopener');
                    btn.disabled = false;
                    return;
                }
                if (!confirm('¿Registrar el reclamo de todas formas?')) {
                    btn.disabled = false;
                    return;
                }
            }
        }
        const sumConVal = (document.getElementById('ped-sum-conexion')?.value || '').trim();
        const sumFasVal = (document.getElementById('ped-sum-fases')?.value || '').trim();
        if (
            esCooperativaElectricaRubro() &&
            tipoReclamoElectricoPideSuministroWhatsapp(tipoTr) &&
            (!sumConVal || !sumFasVal)
        ) {
            toast('Para este tipo de reclamo indicá tipo de conexión (aéreo/subterráneo) y fases (monofásico/trifásico).', 'error');
            btn.disabled = false;
            return;
        }

        const { provincia: provPedGeo, codigo_postal: cpPedGeo } = leerProvinciaCpNuevoPedido();
        const queryInsert = `INSERT INTO pedidos(
            numero_pedido, distribuidor, trafo, cliente, tipo_trabajo,
            descripcion, prioridad, lat, lng, usuario_id, usuario_creador_id, estado, avance, foto_base64,
            x_inchauspe, y_inchauspe, fecha_creacion, nis_medidor, telefono_contacto,
            cliente_nombre, cliente_calle, cliente_numero_puerta, cliente_localidad, cliente_direccion,
            suministro_tipo_conexion, suministro_fases, barrio, provincia, codigo_postal
        ) VALUES(
            ${esc(numPedido)},
            ${esc(disVal || null)},
            ${esc(trafoVal || null)},
            ${esc(cliNomVal || null)},
            ${esc(document.getElementById('tt').value || null)},
            ${esc(document.getElementById('de').value)},
            ${esc(document.getElementById('pr').value)},
            ${esc(app.sel.lat)},
            ${esc(app.sel.lng)},
            ${esc(uidCre)},
            ${esc(uidCre)},
            'Pendiente', 0,
            ${esc(fotosString || null)},
            ${esc(xInchauspe)},
            ${esc(yInchauspe)},
            ${esc(new Date().toISOString())},
            ${esc(nisVal || null)},
            ${esc(telVal || null)},
            ${esc(cliNomVal || null)},
            ${esc(calleVal || null)},
            ${esc(numVal || null)},
            ${esc(locVal || null)},
            ${esc(refUbicVal || null)},
            ${esc(sumConVal || null)},
            ${esc(sumFasVal || null)},
            ${esc(barrioVal || null)},
            ${esc(provPedGeo || null)},
            ${esc(cpPedGeo || null)}
        )`;

        let derivacionAltaApiOk = false;
        if (modoOffline || !NEON_OK) {
            
            enqueueOffline({ tipo: 'INSERT', query: queryInsert });
            
            const pedidoLocal = {
                id: 'off_' + Date.now(),
                np: numPedido,
                f: new Date().toISOString(),
                fc: null, fa: null,
                dis: disVal,
                br: barrioVal || '',
                trf: trafoVal,
                cl: cliNomVal,
                cnom: cliNomVal,
                ccal: calleVal,
                cnum: numVal,
                cloc: locVal,
                tt: document.getElementById('tt').value || '',
                de: document.getElementById('de').value,
                pr: document.getElementById('pr').value,
                es: 'Pendiente', av: 0,
                la: app.sel.lat, ln: app.sel.lng,
                ui: app.u?.id || 1,
                tr: null, tc: null,
                fotos: fotosString ? fotosString.split('||') : [],
                foto_cierre: null,
                x_inchauspe: xInchauspe, y_inchauspe: yInchauspe,
                nis: nisVal,
                tel: telVal,
                cdir: refUbicVal,
                stc: sumConVal || '',
                sfs: sumFasVal || '',
                _offline: true
            };
            app.p.unshift(pedidoLocal);
            offlinePedidosSave(app.p);
            toast('📴 Pedido guardado localmente — se sincronizará al conectarse', 'success');
        } else {
            
            await ejecutarSQLConReintentos(queryInsert);
            toast('Pedido guardado', 'success');
            if (esMunicipioRubro() && nisVal) {
                void enriquecerSociosCatalogoGeoDesdeFormularioNuevoPedido();
            }
            if (puedeEnviarApiRestPedidos()) {
                try {
                    const rNew = await sqlSimple(
                        `SELECT id FROM pedidos WHERE numero_pedido = ${esc(numPedido)} ORDER BY id DESC LIMIT 1`
                    );
                    const newId = rNew.rows?.[0]?.id;
                    if (newId != null) {
                        const nid = Number(newId);
                        if (telVal) void notificarAltaReclamoWhatsappApi(nid);
                        if (fotosString && typeof window.__gnSyncFotosReclamoCloudinary === 'function') {
                            await window.__gnSyncFotosReclamoCloudinary({
                                pedidoId: nid,
                                numPedido,
                                fotoBase64Joined: fotosString,
                            });
                        }
                        const rol = String(app?.u?.rol || '').toLowerCase();
                        const esAdmin = rol === 'admin' || rol === 'administrador';
                        if (esAdmin) {
                            const terc = leerTerceroDerivacionNuevoPedidoSiActivo();
                            if (terc?.whatsappDigitos) {
                                const intl = internacionalMasDesdeDigitosOTexto(String(terc.whatsappDigitos));
                                if (intl) {
                                    const rDeriv = await postDerivarExternoDesdeAltaNuevoPedido({
                                        url: apiUrl(`/api/pedidos/${nid}/derivar-externo`),
                                        asegurarJwtApiRest,
                                        getToken,
                                        whatsappTercero: intl,
                                        nombreTercero: terc.nombre || 'Tercero',
                                        motivo: String(document.getElementById('de')?.value || '')
                                            .trim()
                                            .slice(0, 2000),
                                        lat: app.sel?.lat,
                                        lng: app.sel?.lng,
                                    });
                                    if (rDeriv?.ok) derivacionAltaApiOk = true;
                                    else if (rDeriv?.error) console.warn('[deriv-alta-pedido]', rDeriv.error);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[wa-alta-reclamo] lookup id', e && e.message);
                }
            }
        }

        const domicilioDeriv = [calleVal, numVal, locVal, refUbicVal]
            .map((x) => String(x || '').trim())
            .filter(Boolean)
            .join(', ');
        try {
            if (!derivacionAltaApiOk) {
                afterPedidoGuardadoIntentarWhatsappDerivacionTercero({
                    numPedido,
                    tipoTr,
                    desc: document.getElementById('de')?.value || '',
                    cliNomVal,
                    domicilio: domicilioDeriv,
                    telVal,
                    lat: app.sel?.lat,
                    lng: app.sel?.lng,
                });
            }
        } catch (_) {}

        fotosTemporales = [];
        actualizarVistaPreviaFotos();
        const latPedidoGuardado = app.sel?.lat;
        const lngPedidoGuardado = app.sel?.lng;
        closeAll();
        app.sel = null;
        render();
        if (!modoOffline) cargarPedidos();
        if (eraPedidoOficina && Number.isFinite(latPedidoGuardado) && Number.isFinite(lngPedidoGuardado)) {
            void finalizarPedidoOficinaTrasGuardar(
                {
                    ...depsUbicOficina,
                    esc,
                    ejecutarSql: ejecutarSQLConReintentos,
                    neonOk: NEON_OK,
                    modoOffline,
                    cargarPedidos,
                    render,
                },
                {
                    lat: latPedidoGuardado,
                    lng: lngPedidoGuardado,
                    numPedido,
                    calleVal,
                    numVal,
                    locVal,
                }
            );
        }
    } catch(e) {
        logErrorWeb('guardar-pedido', e);
        const low = String(e && e.message ? e.message : e || '').toLowerCase();
        if (low.includes('fetch') || low.includes('network') || low.includes('failed')) {
            setModoOffline(true);
            toast('Sin conexión — reintentá guardar en modo offline', 'error');
        } else {
            toast(mensajeErrorUsuario(e), 'error');
        }
    } finally {
        btn.disabled = false;
    }
    });
}

try {
    _bindPedidoFormSubmit();
} catch (_) {}

async function actualizarAvance(id, avance) {
    try {
        const now = new Date().toISOString();
        const idx0 = app.p.findIndex(p => String(p.id) === String(id));
        const avPrev = idx0 !== -1 ? app.p[idx0] : null;
        const valAv = validarAvanceNoRetrocede(avance, avPrev);
        if (!valAv.ok) {
            toast(valAv.mensaje, 'warning');
            return;
        }
        avance = valAv.valor;

        const apiRow = await pedidoPutApi(id, { avance: avance });
        if (apiRow) {
            const idx = app.p.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) app.p[idx] = norm(apiRow);
            offlinePedidosSave(app.p);
            render();
            toast('Avance actualizado', 'success');
            return;
        }

        await ejecutarSQLConReintentos(
            `UPDATE pedidos SET avance = {0}, fecha_avance = {1} WHERE id = {2}`,
            [avance, now, parseInt(id)]
        );

        const idx = app.p.findIndex(p => String(p.id) === String(id));
        if (idx !== -1) {
            app.p[idx].av = avance;
            app.p[idx].fa = now;
        }

        if (puedeEnviarApiRestPedidos() && avanceEnteroPedido(avPrev) !== Number(avance)) {
            const pidNum = parseInt(id, 10);
            if (Number.isFinite(pidNum) && pidNum > 0) void notificarWhatsappClienteEventoApi(pidNum, 'avance');
        }

        render();
        toast('Avance actualizado', 'success');
    } catch(e) {
        console.error('Error actualizando avance:', e);
        toast('Error al actualizar avance', 'error');
    }
}

async function updPedido(id, campos, usuarioId) {
    const idxPre = app.p.findIndex(p => String(p.id) === String(id));
    const prevRow = idxPre !== -1 ? app.p[idxPre] : null;
    const estadoAntesUpd = prevRow ? String(prevRow.es || '') : '';
    const taiAsignado = prevRow != null && prevRow.tai != null ? prevRow.tai : null;

    if (prevRow && campos.avance !== undefined) aplicarMinimoAvanceEnCamposPedido(campos, prevRow);

    // Agregar auditoría si corresponde
    if (usuarioId && app.u) {
        if (campos.estado === 'En ejecución') campos.usuario_inicio_id = app.u.id;
        if (campos.estado === 'Cerrado')      campos.usuario_cierre_id = app.u.id;
        if (campos.avance !== undefined && campos.estado === undefined) campos.usuario_avance_id = app.u.id;
    }
    const cv = {};
    for (const [k, v] of Object.entries(campos)) {
        if (CN.has(k)) cv[k] = v;
    }
    if (!Object.keys(cv).length) return;
    
    const s = [];
    for (const [k, val] of Object.entries(cv)) s.push(`${k}=${esc(val)}`);
    const queryUpdate = `UPDATE pedidos SET ${s.join(',')} WHERE id=${esc(parseInt(id))}`;

    if (modoOffline || !NEON_OK || String(id).startsWith('off_')) {
        
        if (!String(id).startsWith('off_')) {
            enqueueOffline({ tipo: 'UPDATE', query: queryUpdate });
        }
        
    } else {
        await ejecutarSQLConReintentos(queryUpdate);
        const cierreCentral =
            cv.estado === 'Cerrado' &&
            estadoAntesUpd !== 'Cerrado' &&
            taiAsignado != null &&
            String(taiAsignado) !== String(app.u?.id || '');
        if (cierreCentral && _sql) {
            try {
                const pidNum = parseInt(id, 10);
                const np = prevRow && prevRow.np ? String(prevRow.np) : '';
                const titulo = 'Pedido cerrado';
                const cuerpo = `El reclamo ${np || '#' + id} fue cerrado desde la central.`;
                await sqlSimple(
                    `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida) VALUES (${esc(
                        parseInt(taiAsignado, 10)
                    )}, ${esc(pidNum)}, ${esc(titulo)}, ${esc(cuerpo)}, FALSE)`
                );
            } catch (e) {
                if (!String(e.message || e).includes('notificaciones_movil')) {
                    console.warn('[notif-cierre-tecnico]', e.message || e);
                }
            }
        }
    }
    
    const idx = app.p.findIndex(p => String(p.id) === String(id));
    if (idx !== -1) {
        const pm = {
            estado: 'es',
            avance: 'av',
            trabajo_realizado: 'tr',
            tecnico_cierre: 'tc',
            fecha_cierre: 'fc',
            fecha_avance: 'fa',
            foto_cierre: 'foto_cierre',
            nis_medidor: 'nis',
            tecnico_asignado_id: 'tai',
            fecha_asignacion: 'fasi',
            firma_cliente: 'firma',
            checklist_seguridad: 'chkl',
            telefono_contacto: 'tel',
            cliente_nombre: 'cnom',
            cliente_direccion: 'cdir',
            cliente_calle: 'ccal',
            cliente_numero_puerta: 'cnum',
            cliente_localidad: 'cloc',
            provincia: 'cpcia',
            codigo_postal: 'ccp',
            suministro_tipo_conexion: 'stc',
            suministro_fases: 'sfs',
            trafo: 'trf',
            usuario_inicio_id: 'ui2',
            usuario_cierre_id: 'uci',
            usuario_avance_id: 'uav',
            derivado_externo: 'dex',
            derivado_a: 'dda',
            derivado_destino_nombre: 'ddn',
            fecha_derivacion: 'fder',
            usuario_derivacion_id: 'uider',
            derivacion_nota: 'dnota',
            derivacion_mensaje_snapshot: 'dsnap'
        };
        for (const [k, v2] of Object.entries(campos)) {
            if (!pm[k]) continue;
            app.p[idx][pm[k]] = k === 'estado' ? normalizarEstadoPedidoUi(v2) : v2;
        }
        if (campos.foto_base64) {
            app.p[idx].fotos = campos.foto_base64.split('||');
        }
        if (campos.x_inchauspe) app.p[idx].x_inchauspe = campos.x_inchauspe;
        if (campos.y_inchauspe) app.p[idx].y_inchauspe = campos.y_inchauspe;
    }
    
    offlinePedidosSave(app.p);
    render();
}

/** WebView y web: tras «Poner en ejecución» mantener el detalle abierto y refrescar datos. */
function _gnCerrarDetalleORefrescarTrasPonerEnEjecucion(pedidoId) {
    try {
        const p2 = app.p.find((p) => String(p.id) === String(pedidoId));
        if (p2) void detalle(p2, { skipBackgroundRefetch: true });
        else closeAll();
    } catch (_) {
        closeAll();
    }
}

async function mergeFotosBase64EnPedido(id, nuevasDataUrls) {
    const arr = Array.isArray(nuevasDataUrls) ? nuevasDataUrls.filter(Boolean) : [];
    if (!arr.length) return;
    const prev = app.p.find((p) => String(p.id) === String(id));
    const exist = Array.isArray(prev?.fotos) ? prev.fotos.filter(Boolean) : [];
    const merged = [...exist, ...arr].slice(0, 12);
    const cadena = merged.join('||');
    const apiRow = await pedidoPutApi(id, { foto_base64: cadena });
    if (apiRow) {
        const idx = app.p.findIndex((p) => String(p.id) === String(id));
        if (idx !== -1) app.p[idx] = norm(apiRow);
        offlinePedidosSave(app.p);
        render();
        return;
    }
    await updPedido(id, { foto_base64: cadena }, app.u?.id);
}

async function iniciar(id) {
    try {
        const geo = await verificarGeocercaAntesIniciarPedido(id);
        if (!geo.ok) {
            toast(geo.message || 'Geocerca: acercate al reclamo para iniciar', 'warning');
            return;
        }
        const fotosCampo = await solicitarFotosCampoOpcional(id, 'Al poner en ejecución');
        const now = new Date().toISOString();
        const prevIni = app.p.find((p) => String(p.id) === String(id));
        const bodyIni = bodyIniciarEjecucionSinBajarAvance(prevIni);
        if (prevIni && (parseInt(prevIni.av, 10) || 0) === 0) bodyIni.fecha_avance = now;
        if (fotosCampo.length) {
            const exist = Array.isArray(prevIni?.fotos) ? prevIni.fotos.filter(Boolean) : [];
            bodyIni.foto_base64 = [...exist, ...fotosCampo].join('||');
        }
        const apiRow = await pedidoPutApi(id, bodyIni);
        if (apiRow) {
            const idx = app.p.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) app.p[idx] = norm(apiRow);
            offlinePedidosSave(app.p);
            render();
            toast(
                '✅ Pedido en ejecución. Si hay teléfono de contacto y WhatsApp configurado, se avisó al cliente.',
                'success'
            );
            _gnCerrarDetalleORefrescarTrasPonerEnEjecucion(id);
            return;
        }
        const camposIni = { estado: 'En ejecución', fecha_avance: now };
        if (!prevIni || (parseInt(prevIni.av, 10) || 0) === 0) camposIni.avance = 0;
        await updPedido(id, camposIni, app.u?.id);
        if (fotosCampo.length) await mergeFotosBase64EnPedido(id, fotosCampo);
        if (puedeEnviarApiRestPedidos()) {
            const pidNum = parseInt(id, 10);
            if (Number.isFinite(pidNum) && pidNum > 0) void notificarWhatsappClienteEventoApi(pidNum, 'inicio');
        }
        toast('✅ Pedido en ejecución', 'success');
        _gnCerrarDetalleORefrescarTrasPonerEnEjecucion(id);
    } catch(e) {
        toastError('iniciar-pedido', e);
    }
}

function actualizarVistaPreviaFotoCierre() {
    const container = document.getElementById('vista-previa-foto-cierre');
    if (!container) return;
    container.innerHTML = '';
    if (!fotoCierreTemp) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block';
    const img = document.createElement('img');
    img.src = fotoCierreTemp;
    img.className = 'foto-miniatura';
    img.onclick = () => window.verFotoAmpliada(fotoCierreTemp, { tipo: 'cierre_temp' });
    const del = document.createElement('button');
    del.type = 'button';
    del.innerHTML = '✕';
    del.title = 'Eliminar foto';
    del.style.cssText = 'position:absolute;top:-5px;right:-5px;background:#ef4444;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;z-index:10';
    del.onclick = (e) => { e.stopPropagation(); fotoCierreTemp = null; actualizarVistaPreviaFotoCierre(); };
    wrap.appendChild(img);
    wrap.appendChild(del);
    container.appendChild(wrap);
    const cnt = document.createElement('div');
    cnt.style.cssText = 'width:100%;font-size:.75rem;color:#475569;margin-top:.25rem';
    const kb = Math.round(fotoCierreTemp.length * 0.75 / 1024);
    cnt.textContent = `1 foto de cierre (≈${kb} KB)`;
    container.appendChild(cnt);
}

let _firmaCanvasBound = false;
function initFirmaCierreCanvas() {
    const c = document.getElementById('firma-canvas-cierre');
    if (!c) return;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (_firmaCanvasBound) return;
    _firmaCanvasBound = true;
    let draw = false;
    const pos = e => {
        const r = c.getBoundingClientRect();
        const scaleX = c.width / r.width;
        const scaleY = c.height / r.height;
        const cx = ('touches' in e ? e.touches[0].clientX : e.clientX) - r.left;
        const cy = ('touches' in e ? e.touches[0].clientY : e.clientY) - r.top;
        return { x: cx * scaleX, y: cy * scaleY };
    };
    const start = e => { draw = true; const p0 = pos(e); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); };
    const move = e => { if (!draw) return; const p0 = pos(e); ctx.lineTo(p0.x, p0.y); ctx.stroke(); };
    const end = () => { draw = false; };
    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', move);
    c.addEventListener('mouseup', end);
    c.addEventListener('mouseleave', end);
    c.addEventListener('touchstart', e => { e.preventDefault(); start(e); }, { passive: false });
    c.addEventListener('touchmove', e => { e.preventDefault(); move(e); }, { passive: false });
    c.addEventListener('touchend', end);
}
function limpiarFirmaCierreCanvas() {
    const c = document.getElementById('firma-canvas-cierre');
    if (!c) return;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
}
function firmaCierreCanvasVacio() {
    const c = document.getElementById('firma-canvas-cierre');
    if (!c) return true;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 32) {
        if (d[i] < 248 || d[i + 1] < 248 || d[i + 2] < 248) return false;
    }
    return true;
}

function htmlOptsUnidadMaterial(val) {
    const u0 = String(val ?? '').trim().toUpperCase();
    let html = MATERIAL_UNIDADES.map(u => `<option value="${u}"${u === u0 ? ' selected' : ''}>${u}</option>`).join('');
    if (u0 && MATERIAL_UNIDADES.indexOf(u0) < 0)
        html = `<option value="${u0.replace(/"/g, '&quot;')}" selected>${u0}</option>` + html;
    return html;
}

// escHtmlPrint → modules/ui-utils.js

/** Oculta en pantalla ruido técnico ([Sistema]…, caché, sugerencias GPS) ya persistido en descripción. */
function sanitizarTextoDescripcionPedidoVista(s) {
    if (s == null || s === '') return '';
    let t = String(s).replace(/\r\n/g, '\n');
    t = t.replace(/\n\nSi podés, enviá[\s\S]*?precisión\./gi, '');
    t = t.replace(/\n\n\[Sistema\][^\n]*/g, '');
    t = t.replace(/\n\[Sistema\][^\n]*/g, '');
    t = t.replace(/\[Sistema\][^\n]*/g, '');
    t = t.replace(/geocodificacion_cache[^\n]*/gi, '');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}

/**
 * WebView Android (técnico/supervisor no admin): no insertar el bloque «Materiales» en el detalle
 * mientras el pedido siga Pendiente o Asignado (antes de Iniciar / avance / cierre). Evita Cargando…
 * y parpadeos. Admin y navegador web siguen viendo el bloque como antes.
 */
function incluirBloqueMaterialesEnDetallePedido(p) {
    if (!p || esTipoPedidoFactibilidad(p.tt)) return false;
    if (!esAndroidWebViewMapa()) return true;
    if (esAdmin()) return true;
    if (!esTecnicoOSupervisor()) return true;
    const es = String(p.es || '').trim();
    if (es === 'Pendiente' || es === 'Asignado') return false;
    return true;
}

/** Misma lógica que los botones «Iniciar» / «Cerrar» en detalle: admin, creador del pedido o técnico asignado. */
function puedeEditarMaterialesEnPedido(p) {
    if (!p || p.es === 'Cerrado') return false;
    if (p.es !== 'En ejecución') return false;
    if (tipoPedidoExcluyeMateriales(p.tt)) return false;
    if (p.sdpen && esTecnicoOSupervisor() && !esAdmin()) return false;
    const uid = String(app.u?.id ?? '');
    return (
        esAdmin() ||
        String(p.ui) === uid ||
        (esTecnicoOSupervisor() && p.tai != null && String(p.tai) === uid)
    );
}

async function sqlMaterialesPedidoRows(pid) {
    const q = `SELECT id, descripcion, cantidad, unidad FROM pedido_materiales WHERE pedido_id=${esc(pid)} ORDER BY id`;
    let ult = null;
    for (let i = 0; i < 3; i++) {
        try {
            const r = await sqlSimple(q);
            return r.rows || [];
        } catch (e) {
            ult = e;
            if (i < 2) await new Promise(res => setTimeout(res, 500 * (i + 1)));
        }
    }
    throw ult;
}

function _materialesDetalleSigueSiendoPedidoActual(p) {
    const dm = document.getElementById('dm');
    if (!dm?.classList.contains('active')) return false;
    const cur = dm.dataset?.detallePedidoId;
    return cur != null && String(cur) === String(p.id);
}

function _materialesCierreModalSigueSiendoPedidoActual(p) {
    const cm2 = document.getElementById('cm2');
    if (!cm2?.classList.contains('active')) return false;
    return app.cid != null && String(app.cid) === String(p.id);
}

async function refrescarMaterialesEnDetalle(p) {
    if (!incluirBloqueMaterialesEnDetallePedido(p)) return;
    const body = document.getElementById('materiales-detalle-body');
    if (!body) return;
    if (esTipoPedidoFactibilidad(p.tt)) return;
    const pid = parseInt(p.id, 10);
    if (materialesDetalleDebeOmitirRecarga(p, body)) return;
    if (!materialesDetalleIniciarCarga(pid)) return;
    
    if (String(p.id).startsWith('off_') || modoOffline || !NEON_OK) {
        body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Materiales: requiere conexión a Neon.</p>';
        return;
    }
    const excluyeMat = tipoPedidoExcluyeMateriales(p.tt);
    if (excluyeMat) {
        try {
            const rows = await sqlMaterialesPedidoRows(pid);
            if (!_materialesDetalleSigueSiendoPedidoActual(p)) return;
            const aviso = '<p style="font-size:.8rem;color:var(--tl);margin-bottom:.5rem">Este tipo de pedido no admite registrar ni editar materiales.</p>';
            if (!rows.length) {
                body.innerHTML = aviso;
                return;
            }
            let html = aviso + '<table class="mat-det-table"><thead><tr><th class="mat-col-item">Ítem</th><th class="mat-col-un">Unidad</th><th class="mat-col-cant">Cantidad</th></tr></thead><tbody>';
            rows.forEach((row) => {
                const des = String(row.descripcion || '').replace(/</g, '&lt;');
                const celUn = escHtmlPrint(row.unidad || '—');
                const celCant = row.cantidad != null && row.cantidad !== '' ? escHtmlPrint(String(row.cantidad)) : '—';
                html += `<tr><td class="mat-col-item">${des}</td><td class="mat-col-un">${celUn}</td><td class="mat-col-cant">${celCant}</td></tr>`;
            });
            html += '</tbody></table>';
            body.innerHTML = html;
            if (p.es === 'Cerrado') materialesDetalleMarcarEstable(body, pid);
        } catch (e) {
            logErrorWeb('materiales-detalle-readonly', e);
            body.innerHTML =
                '<p style="color:var(--re);font-size:.8rem">' +
                escHtmlPrint(mensajeErrorUsuario(e)) +
                '</p><p style="margin-top:.45rem"><button type="button" class="btn-sm primary" onclick="refrescarMaterialesDetallePorPid(' +
                pid +
                ')">Reintentar</button></p>';
        }
        return;
    }
    const puedeEditarMat = puedeEditarMaterialesEnPedido(p);
    try {
        const rows = await sqlMaterialesPedidoRows(pid);
        if (!_materialesDetalleSigueSiendoPedidoActual(p)) return;
        let html = '<table class="mat-det-table"><thead><tr><th class="mat-col-item">Ítem</th><th class="mat-col-un">Unidad</th><th class="mat-col-cant">Cantidad</th><th></th></tr></thead><tbody>';
        rows.forEach(row => {
            const des = String(row.descripcion || '').replace(/</g, '&lt;');
            const mid = parseInt(row.id, 10);
            let celUn = '';
            let celCant = '';
            if (puedeEditarMat) {
                celUn = `<select class="mat-sel-un" onchange="actualizarCampoMaterial(${mid},${pid},'unidad',this.value)">${htmlOptsUnidadMaterial(row.unidad)}</select>`;
                const qc = row.cantidad != null && row.cantidad !== '' ? String(row.cantidad) : '';
                celCant = `<input type="number" class="mat-inp-cant" step="any" value="${qc.replace(/"/g, '&quot;')}" onblur="actualizarCampoMaterial(${mid},${pid},'cantidad',this.value)">`;
            } else {
                celUn = escHtmlPrint(row.unidad || '—');
                celCant = row.cantidad != null && row.cantidad !== '' ? escHtmlPrint(String(row.cantidad)) : '—';
            }
            html += `<tr><td class="mat-col-item">${des}</td><td class="mat-col-un">${celUn}</td><td class="mat-col-cant">${celCant}</td><td>`;
            if (puedeEditarMat) {
                html += `<button type="button" class="btn-sm" onclick="eliminarMaterialPedido(${row.id},${pid})" title="Quitar ítem" style="font-size:.7rem;padding:.15rem .4rem;border-color:#fecaca;color:#b91c1c;background:#fff"><i class="fas fa-trash-alt"></i></button>`;
            }
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        const puedeAgregar = puedeEditarMat;
        if (puedeAgregar) {
            html += `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem;align-items:flex-end">
                <input type="text" id="mat-desc-${pid}" placeholder="Descripción" style="flex:2;min-width:120px;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
                <select id="mat-un-${pid}" style="width:5.5rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem;font-size:.8rem">${htmlOptsUnidadMaterial('PZA')}</select>
                <input type="number" id="mat-cant-${pid}" placeholder="Cant." step="any" style="width:5.5rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
                <button type="button" class="btn-sm primary" onclick="agregarMaterialPedidoDesdeDetalle(${pid})">+ Agregar</button>
            </div>`;
        }
        if (!_materialesDetalleSigueSiendoPedidoActual(p)) return;
        if (!rows.length && !puedeAgregar) {
            body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Sin materiales registrados</p>';
            if (p.es === 'Cerrado') materialesDetalleMarcarEstable(body, pid);
        } else {
            body.innerHTML = html;
            if (p.es === 'Cerrado') materialesDetalleMarcarEstable(body, pid);
        }
    } catch (e) {
        logErrorWeb('materiales-detalle', e);
        body.innerHTML =
            '<p style="color:var(--re);font-size:.8rem">' +
            escHtmlPrint(mensajeErrorUsuario(e)) +
            '</p><p style="margin-top:.45rem"><button type="button" class="btn-sm primary" onclick="refrescarMaterialesDetallePorPid(' +
            pid +
            ')">Reintentar</button></p>';
    } finally {
        materialesDetalleFinCarga(pid);
    }
}

window.refrescarMaterialesDetallePorPid = function (pid) {
    const p = app.p.find(x => String(x.id) === String(pid));
    if (p) void refrescarMaterialesEnDetalle(p);
};

/** Materiales en el modal «Cerrar pedido» (mismas reglas que en detalle). */
async function refrescarMaterialesEnModalCierre(p) {
    const body = document.getElementById('cierre-materiales-body');
    if (!body) return;
    if (tipoPedidoExcluyeMateriales(p.tt)) {
        body.innerHTML = '';
        return;
    }
    const pid = parseInt(p.id, 10);
    if (String(p.id).startsWith('off_') || modoOffline || !NEON_OK) {
        body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Materiales: requiere conexión a Neon.</p>';
        return;
    }
    const puedeEditarMat = puedeEditarMaterialesEnPedido(p);
    try {
        const rows = await sqlMaterialesPedidoRows(pid);
        if (!_materialesCierreModalSigueSiendoPedidoActual(p)) return;
        let html = '<table class="mat-det-table"><thead><tr><th class="mat-col-item">Ítem</th><th class="mat-col-un">Unidad</th><th class="mat-col-cant">Cantidad</th><th></th></tr></thead><tbody>';
        rows.forEach(row => {
            const des = String(row.descripcion || '').replace(/</g, '&lt;');
            const mid = parseInt(row.id, 10);
            let celUn = '';
            let celCant = '';
            if (puedeEditarMat) {
                celUn = `<select class="mat-sel-un" onchange="actualizarCampoMaterial(${mid},${pid},'unidad',this.value)">${htmlOptsUnidadMaterial(row.unidad)}</select>`;
                const qc = row.cantidad != null && row.cantidad !== '' ? String(row.cantidad) : '';
                celCant = `<input type="number" class="mat-inp-cant" step="any" value="${qc.replace(/"/g, '&quot;')}" onblur="actualizarCampoMaterial(${mid},${pid},'cantidad',this.value)">`;
            } else {
                celUn = escHtmlPrint(row.unidad || '—');
                celCant = row.cantidad != null && row.cantidad !== '' ? escHtmlPrint(String(row.cantidad)) : '—';
            }
            html += `<tr><td class="mat-col-item">${des}</td><td class="mat-col-un">${celUn}</td><td class="mat-col-cant">${celCant}</td><td>`;
            if (puedeEditarMat) {
                html += `<button type="button" class="btn-sm" onclick="eliminarMaterialPedido(${row.id},${pid})" title="Quitar ítem" style="font-size:.7rem;padding:.15rem .4rem;border-color:#fecaca;color:#b91c1c;background:#fff"><i class="fas fa-trash-alt"></i></button>`;
            }
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        if (puedeEditarMat) {
            html += `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem;align-items:flex-end">
                <input type="text" id="cierre-mat-desc-${pid}" placeholder="Descripción" style="flex:2;min-width:120px;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
                <select id="cierre-mat-un-${pid}" style="width:5.5rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem;font-size:.8rem">${htmlOptsUnidadMaterial('PZA')}</select>
                <input type="number" id="cierre-mat-cant-${pid}" placeholder="Cant." step="any" style="width:5.5rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
                <button type="button" class="btn-sm primary" onclick="agregarMaterialPedidoDesdeCierreModal(${pid})">+ Agregar</button>
            </div>`;
        }
        if (!_materialesCierreModalSigueSiendoPedidoActual(p)) return;
        if (!rows.length && !puedeEditarMat) {
            body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Sin materiales registrados</p>';
        } else {
            body.innerHTML = html;
        }
    } catch (e) {
        logErrorWeb('materiales-cierre-modal', e);
        body.innerHTML =
            '<p style="color:var(--re);font-size:.8rem">' +
            escHtmlPrint(mensajeErrorUsuario(e)) +
            '</p><p style="margin-top:.45rem"><button type="button" class="btn-sm primary" onclick="refrescarMaterialesCierrePorPid(' +
            pid +
            ')">Reintentar carga</button></p>';
    }
}

window.refrescarMaterialesCierrePorPid = function (pid) {
    const p = app.p.find(x => String(x.id) === String(pid));
    if (p) void refrescarMaterialesEnModalCierre(p);
};

function sincronizarVistaMaterialesPedido(p) {
    if (!p) return;
    if (incluirBloqueMaterialesEnDetallePedido(p)) void refrescarMaterialesEnDetalle(p);
    const cm2 = document.getElementById('cm2');
    if (cm2?.classList.contains('active') && String(app.cid) === String(p.id)) {
        void refrescarMaterialesEnModalCierre(p);
    }
}

window.actualizarCampoMaterial = async function (mid, pid, campo, valor) {
    if (modoOffline || !NEON_OK) return;
    const p0 = app.p.find((x) => String(x.id) === String(pid));
    if (p0 && tipoPedidoExcluyeMateriales(p0.tt)) {
        toast('Este tipo de pedido no admite materiales', 'error');
        return;
    }
    if (!p0 || !puedeEditarMaterialesEnPedido(p0)) {
        toast('No tenés permiso para editar materiales de este pedido', 'error');
        return;
    }
    try {
        if (campo === 'unidad') {
            await sqlSimple(`UPDATE pedido_materiales SET unidad = ${esc(valor || null)} WHERE id = ${esc(parseInt(mid, 10))}`);
        } else if (campo === 'cantidad') {
            const c = valor === '' || valor == null ? null : parseFloat(valor);
            if (valor !== '' && Number.isNaN(c)) { toast('Cantidad inválida', 'error'); return; }
            if (c != null && c <= 0) { toast('La cantidad debe ser mayor que cero', 'error'); return; }
            await sqlSimple(`UPDATE pedido_materiales SET cantidad = ${esc(c)} WHERE id = ${esc(parseInt(mid, 10))}`);
        }
        const p = app.p.find(x => String(x.id) === String(pid));
        if (p) await sincronizarVistaMaterialesPedido(p);
    } catch (e) { toastError('material-editar', e); }
};

window.agregarMaterialPedidoDesdeDetalle = async function (pid) {
    const p0 = app.p.find((x) => String(x.id) === String(pid));
    if (p0 && tipoPedidoExcluyeMateriales(p0.tt)) {
        toast('Este tipo de pedido no admite materiales', 'error');
        return;
    }
    if (!p0 || !puedeEditarMaterialesEnPedido(p0)) {
        toast('No tenés permiso para cargar materiales en este pedido', 'error');
        return;
    }
    const d = document.getElementById('mat-desc-' + pid)?.value.trim();
    if (!d) { toast('Indicá descripción del material', 'error'); return; }
    const cantRaw = document.getElementById('mat-cant-' + pid)?.value;
    const un = document.getElementById('mat-un-' + pid)?.value?.trim() || '';
    const cant = cantRaw === '' || cantRaw == null ? null : parseFloat(cantRaw);
    if (cant == null || !Number.isFinite(cant) || cant <= 0) {
        toast('Indicá una cantidad mayor que cero', 'error');
        return;
    }
    try {
        await sqlSimple(`INSERT INTO pedido_materiales(pedido_id, descripcion, cantidad, unidad) VALUES (${esc(pid)}, ${esc(d)}, ${esc(cant)}, ${esc(un || null)})`);
        toast('Material registrado', 'success');
        const p = app.p.find(x => String(x.id) === String(pid));
        if (p) sincronizarVistaMaterialesPedido(p);
    } catch (e) { toastError('material-agregar', e); }
};

window.agregarMaterialPedidoDesdeCierreModal = async function (pid) {
    const p0 = app.p.find((x) => String(x.id) === String(pid));
    if (p0 && tipoPedidoExcluyeMateriales(p0.tt)) {
        toast('Este tipo de pedido no admite materiales', 'error');
        return;
    }
    if (!p0 || !puedeEditarMaterialesEnPedido(p0)) {
        toast('No tenés permiso para cargar materiales en este pedido', 'error');
        return;
    }
    const d = document.getElementById('cierre-mat-desc-' + pid)?.value.trim();
    if (!d) { toast('Indicá descripción del material', 'error'); return; }
    const cantRaw = document.getElementById('cierre-mat-cant-' + pid)?.value;
    const un = document.getElementById('cierre-mat-un-' + pid)?.value?.trim() || '';
    const cant = cantRaw === '' || cantRaw == null ? null : parseFloat(cantRaw);
    if (cant == null || !Number.isFinite(cant) || cant <= 0) {
        toast('Indicá una cantidad mayor que cero', 'error');
        return;
    }
    try {
        await sqlSimple(`INSERT INTO pedido_materiales(pedido_id, descripcion, cantidad, unidad) VALUES (${esc(pid)}, ${esc(d)}, ${esc(cant)}, ${esc(un || null)})`);
        toast('Material registrado', 'success');
        const p = app.p.find(x => String(x.id) === String(pid));
        if (p) sincronizarVistaMaterialesPedido(p);
    } catch (e) { toastError('material-agregar-cierre', e); }
};

window.eliminarMaterialPedido = async function (mid, pid) {
    const p0 = app.p.find((x) => String(x.id) === String(pid));
    if (p0 && tipoPedidoExcluyeMateriales(p0.tt)) {
        toast('Este tipo de pedido no admite materiales', 'error');
        return;
    }
    if (!p0 || !puedeEditarMaterialesEnPedido(p0)) {
        toast('No tenés permiso para editar materiales de este pedido', 'error');
        return;
    }
    if (!confirm('¿Eliminar material?')) return;
    try {
        await sqlSimple(`DELETE FROM pedido_materiales WHERE id=${esc(parseInt(mid, 10))}`);
        const p = app.p.find(x => String(x.id) === String(pid));
        if (p) sincronizarVistaMaterialesPedido(p);
    } catch (e) { toastError('material-eliminar', e); }
};

function pedidoTieneClienteCargado(p) {
    return !!(p && String(p.cl || '').trim());
}

let _cacheInfraAfectadosTablas = null;
let _cacheInfraTrafoColDistribuidor = null;
let _cacheDistribuidorColLocalidad = null;
function invalidateInfraAfectadosTablasCache() {
    _cacheInfraAfectadosTablas = null;
    _cacheInfraTrafoColDistribuidor = null;
    _cacheDistribuidorColLocalidad = null;
}

async function sqlDistribuidoresTieneLocalidad() {
    if (!NEON_OK || !_sql) return false;
    if (_cacheDistribuidorColLocalidad !== null) return _cacheDistribuidorColLocalidad;
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'distribuidores' AND column_name = 'localidad' LIMIT 1`
        );
        _cacheDistribuidorColLocalidad = !!(r.rows && r.rows.length);
    } catch (_) {
        _cacheDistribuidorColLocalidad = false;
    }
    return _cacheDistribuidorColLocalidad;
}

async function sqlInfraTrafoTieneDistribuidorId() {
    if (!NEON_OK || !_sql) return false;
    if (_cacheInfraTrafoColDistribuidor !== null) return _cacheInfraTrafoColDistribuidor;
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'infra_transformadores' AND column_name = 'distribuidor_id' LIMIT 1`
        );
        _cacheInfraTrafoColDistribuidor = !!(r.rows && r.rows.length);
    } catch (_) {
        _cacheInfraTrafoColDistribuidor = false;
    }
    return _cacheInfraTrafoColDistribuidor;
}

async function sqlInfraAfectadosTablasExisten() {
    if (!NEON_OK || !_sql) return false;
    if (_cacheInfraAfectadosTablas !== null) return _cacheInfraAfectadosTablas;
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'infra_transformadores' LIMIT 1`
        );
        _cacheInfraAfectadosTablas = !!(r.rows && r.rows.length);
    } catch (_) {
        _cacheInfraAfectadosTablas = false;
    }
    return _cacheInfraAfectadosTablas;
}

async function infraAfectadosDisponibleCierre() {
    if (debeOcultarTabClientesAfectadosInfraAdmin()) return false;
    if (await sqlInfraAfectadosTablasExisten()) return true;
    if (puedeEnviarApiRestPedidos()) {
        try {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return false;
            const resp = await fetch(apiUrl('/api/infra-afectados/transformadores'), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (resp.status === 503) return false;
            return resp.ok;
        } catch (_) {
            return false;
        }
    }
    return false;
}

function syncCierreAfectadosPanels() {
    const m = document.querySelector('input[name="cierre-afect-metodo"]:checked')?.value || 'omitir';
    const show = (id, on) => {
        const el = document.getElementById(id);
        if (el) el.style.display = on ? '' : 'none';
    };
    show('cierre-afect-panel-trafo', m === 'transformador');
    show('cierre-afect-panel-distribuidor', m === 'distribuidor');
    show('cierre-afect-panel-alimentador', m === 'alimentador');
    show('cierre-afect-panel-rango', m === 'rango');
    show('cierre-afect-panel-manual', m === 'manual');
}
window.syncCierreAfectadosPanels = syncCierreAfectadosPanels;

function llenarSelectOptionText(sel, value, text) {
    const o = document.createElement('option');
    o.value = String(value);
    o.textContent = text;
    sel.appendChild(o);
}

function llenarCierreSelectsDistribuidorResumen(rows) {
    const sd = document.getElementById('cierre-afect-sel-distribuidor');
    const sad = document.getElementById('cierre-afect-alim-dist');
    if (!sd || !sad) return;
    sd.innerHTML = '';
    llenarSelectOptionText(sd, '', '— Elegir distribuidor —');
    sad.innerHTML = '';
    llenarSelectOptionText(sad, '', '— Elegir distribuidor —');
    for (const row of rows || []) {
        const did = Number(row.distribuidor_id);
        if (!Number.isFinite(did)) continue;
        const cod = String(row.codigo || '');
        const nom = row.nombre ? String(row.nombre) : '';
        const loc = row.localidad ? String(row.localidad) : '';
        const kva = Number(row.total_kva) || 0;
        const soc = Number(row.total_clientes) || 0;
        const ntr = Number(row.cant_transformadores) || 0;
        const lab = `${cod}${nom ? ' — ' + nom : ''}${loc ? ' · ' + loc : ''} · ${soc} socios · ${kva} kVA · ${ntr} trafos`;
        llenarSelectOptionText(sd, did, lab);
        llenarSelectOptionText(sad, did, lab);
    }
}

async function refrescarCierreSelectAlimentadores() {
    const sad = document.getElementById('cierre-afect-alim-dist');
    const sal = document.getElementById('cierre-afect-sel-alimentador');
    if (!sad || !sal) return;
    const did = Number(sad.value);
    sal.innerHTML = '';
    llenarSelectOptionText(sal, '', '— Elegir alimentador —');
    if (!Number.isFinite(did) || did <= 0) return;
    try {
        if (NEON_OK && _sql && (await sqlInfraTrafoTieneDistribuidorId())) {
            const tid = tenantIdActual();
            const r = await sqlSimple(
                `SELECT TRIM(alimentador) AS alimentador,
                  COALESCE(SUM(capacidad_kva),0) AS total_kva,
                  COALESCE(SUM(clientes_conectados),0) AS total_clientes,
                  COUNT(*)::int AS cant_tr
                 FROM infra_transformadores
                 WHERE tenant_id = ${esc(tid)} AND distribuidor_id = ${esc(did)} AND activo = TRUE
                   AND alimentador IS NOT NULL AND TRIM(alimentador) <> ''
                 GROUP BY TRIM(alimentador)
                 ORDER BY TRIM(alimentador)`
            );
            for (const row of r.rows || []) {
                const a = String(row.alimentador || '');
                if (!a) continue;
                const kva = Number(row.total_kva) || 0;
                const soc = Number(row.total_clientes) || 0;
                llenarSelectOptionText(sal, a, `${a} · ${soc} socios · ${kva} kVA (${row.cant_tr} trafos)`);
            }
        } else if (puedeEnviarApiRestPedidos()) {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return;
            const resp = await fetch(
                apiUrl(`/api/infra-afectados/resumen-por-alimentador?distribuidor_id=${encodeURIComponent(String(did))}`),
                { headers: { Authorization: `Bearer ${tok}` } }
            );
            if (!resp.ok) return;
            const list = await resp.json();
            for (const row of list) {
                const a = String(row.alimentador || '');
                if (!a) continue;
                const kva = Number(row.total_kva) || 0;
                const soc = Number(row.total_clientes) || 0;
                const ntr = Number(row.cant_transformadores) || 0;
                llenarSelectOptionText(sal, a, `${a} · ${soc} socios · ${kva} kVA (${ntr} trafos)`);
            }
        }
    } catch (e) {
        console.warn('[cierre-afectados] alimentadores', e);
    }
}

async function llenarCatalogosCierreAfectados() {
    const selT = document.getElementById('cierre-afect-sel-trafo');
    if (!selT) return;
    selT.innerHTML = '';
    llenarSelectOptionText(selT, '', '— Elegir transformador —');
    llenarCierreSelectsDistribuidorResumen([]);
    const sal = document.getElementById('cierre-afect-sel-alimentador');
    if (sal) {
        sal.innerHTML = '';
        llenarSelectOptionText(sal, '', '— Elegir alimentador —');
    }
    const tid = tenantIdActual();
    try {
        if (NEON_OK && _sql && (await sqlInfraAfectadosTablasExisten())) {
            const rT = await sqlSimple(
                `SELECT id, codigo, nombre, clientes_conectados FROM infra_transformadores WHERE tenant_id = ${esc(
                    tid
                )} AND activo = TRUE ORDER BY codigo`
            );
            for (const row of rT.rows || []) {
                const cc = Number(row.clientes_conectados) || 0;
                const cod = String(row.codigo || '');
                const nom = row.nombre ? String(row.nombre) : '';
                const lab = nom ? `${cod} — ${nom} (${cc} socios)` : `${cod} (${cc} socios)`;
                llenarSelectOptionText(selT, row.id, lab);
            }
            if (await sqlInfraTrafoTieneDistribuidorId()) {
                const hasLoc = await sqlDistribuidoresTieneLocalidad();
                const rD = await sqlSimple(
                    hasLoc
                        ? `SELECT d.id AS distribuidor_id, d.codigo, d.nombre, d.localidad,
                      COALESCE(SUM(t.capacidad_kva),0)::bigint AS total_kva,
                      COALESCE(SUM(t.clientes_conectados),0)::bigint AS total_clientes,
                      COUNT(t.id)::int AS cant_transformadores
                     FROM infra_transformadores t
                     INNER JOIN distribuidores d ON d.id = t.distribuidor_id
                     WHERE t.tenant_id = ${esc(tid)} AND t.activo = TRUE AND t.distribuidor_id IS NOT NULL
                     GROUP BY d.id, d.codigo, d.nombre, d.localidad
                     ORDER BY d.codigo`
                        : `SELECT d.id AS distribuidor_id, d.codigo, d.nombre,
                      COALESCE(SUM(t.capacidad_kva),0)::bigint AS total_kva,
                      COALESCE(SUM(t.clientes_conectados),0)::bigint AS total_clientes,
                      COUNT(t.id)::int AS cant_transformadores
                     FROM infra_transformadores t
                     INNER JOIN distribuidores d ON d.id = t.distribuidor_id
                     WHERE t.tenant_id = ${esc(tid)} AND t.activo = TRUE AND t.distribuidor_id IS NOT NULL
                     GROUP BY d.id, d.codigo, d.nombre
                     ORDER BY d.codigo`
                );
                llenarCierreSelectsDistribuidorResumen(rD.rows || []);
            }
        } else if (puedeEnviarApiRestPedidos()) {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return;
            const h = { Authorization: `Bearer ${tok}` };
            const respT = await fetch(apiUrl('/api/infra-afectados/transformadores'), { headers: h });
            const rowsT = respT.ok ? await respT.json() : [];
            for (const row of rowsT) {
                const cc = Number(row.clientes_conectados) || 0;
                const cod = String(row.codigo || '');
                const nom = row.nombre ? String(row.nombre) : '';
                const lab = nom ? `${cod} — ${nom} (${cc} socios)` : `${cod} (${cc} socios)`;
                llenarSelectOptionText(selT, row.id, lab);
            }
            const respD = await fetch(apiUrl('/api/infra-afectados/resumen-por-distribuidor'), { headers: h });
            if (respD.ok) {
                llenarCierreSelectsDistribuidorResumen(await respD.json());
            }
        }
    } catch (e) {
        console.warn('[cierre-afectados] catálogo', e);
    }
    try {
        const sdChk = document.getElementById('cierre-afect-sel-distribuidor');
        if (sdChk && sdChk.options.length <= 1 && NEON_OK && _sql) {
            try {
                const chkT = await sqlSimple(
                    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'distribuidores' AND column_name = 'tenant_id' LIMIT 1`
                );
                const hasT = !!(chkT.rows && chkT.rows.length);
                const rFb = await sqlSimple(
                    hasT
                        ? `SELECT id AS distribuidor_id, codigo, nombre, localidad FROM distribuidores WHERE tenant_id = ${esc(
                              tid
                          )} AND COALESCE(activo, TRUE) ORDER BY codigo`
                        : `SELECT id AS distribuidor_id, codigo, nombre, NULL::text AS localidad FROM distribuidores WHERE COALESCE(activo, TRUE) ORDER BY codigo`
                );
                const rowsFb = (rFb.rows || []).map((row) => ({
                    ...row,
                    total_kva: 0,
                    total_clientes: 0,
                    cant_transformadores: 0,
                }));
                if (rowsFb.length) llenarCierreSelectsDistribuidorResumen(rowsFb);
            } catch (_) {}
        }
    } catch (_) {}
    const sad = document.getElementById('cierre-afect-alim-dist');
    if (sad && !sad.dataset.boundAlim) {
        sad.dataset.boundAlim = '1';
        sad.addEventListener('change', () => void refrescarCierreSelectAlimentadores());
    }
}

function _normTrafoCodigoPedido(s) {
    return String(s || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/^TR-?/, '');
}

function _normDistCodigoPedido(s) {
    return String(s || '').trim().toUpperCase();
}

async function aplicarPresetInfraCierreDesdePedido(p) {
    const blk = document.getElementById('cierre-afectados-block');
    if (!blk || blk.style.display === 'none' || !p) return;
    const selT = document.getElementById('cierre-afect-sel-trafo');
    const trafoCod = _normTrafoCodigoPedido(p.trf);
    const disCod = _normDistCodigoPedido(p.dis);
    let trafoIdSql = null;
    let distIdSql = null;
    let alimSql = '';
    if (NEON_OK && _sql && trafoCod && (await sqlInfraAfectadosTablasExisten())) {
        try {
            const tid = tenantIdActual();
            const r1 = await sqlSimple(
                `SELECT id, codigo, distribuidor_id, TRIM(alimentador) AS alimentador FROM infra_transformadores
                 WHERE tenant_id = ${esc(tid)} AND activo = TRUE
                 AND REPLACE(UPPER(TRIM(REPLACE(REPLACE(codigo, '-', ''), ' ', ''))), 'TR', '') = ${esc(trafoCod)}
                 LIMIT 5`
            );
            const row = (r1.rows || []).find((x) => _normTrafoCodigoPedido(x.codigo) === trafoCod) || r1.rows?.[0];
            if (row) {
                trafoIdSql = row.id;
                distIdSql = row.distribuidor_id != null ? Number(row.distribuidor_id) : null;
                alimSql = row.alimentador ? String(row.alimentador).trim() : '';
            }
        } catch (_) {}
    }
    const pickTrafoSelect = () => {
        if (!selT || !selT.options.length) return null;
        for (let i = 0; i < selT.options.length; i++) {
            const o = selT.options[i];
            const lab = String(o.textContent || '');
            const val = String(o.value || '');
            if (trafoIdSql != null && val === String(trafoIdSql)) return val;
            const firstTok = lab.split(/[\s—-]/)[0] || '';
            if (trafoCod && _normTrafoCodigoPedido(firstTok) === trafoCod) return val;
            if (trafoCod && lab.toUpperCase().replace(/\s+/g, '').includes(trafoCod)) return val;
        }
        return null;
    };
    const trafoVal = pickTrafoSelect();
    const trafoRadio = blk.querySelector('input[value="transformador"]');
    if (trafoVal && trafoRadio) {
        trafoRadio.checked = true;
        selT.value = trafoVal;
        syncCierreAfectadosPanels();
        return;
    }
    const sd = document.getElementById('cierre-afect-sel-distribuidor');
    const sad = document.getElementById('cierre-afect-alim-dist');
    const pickDistVal = () => {
        const lists = [sd, sad].filter(Boolean);
        for (const el of lists) {
            if (!el.options.length) continue;
            for (let i = 0; i < el.options.length; i++) {
                const o = el.options[i];
                if (!o.value) continue;
                const lab = String(o.textContent || '');
                const head = lab.split(/[·—]/)[0].trim().toUpperCase();
                if (disCod && (head.startsWith(disCod) || head.includes(disCod))) return o.value;
            }
        }
        if (distIdSql != null && sd) {
            for (let i = 0; i < sd.options.length; i++) {
                if (sd.options[i].value === String(distIdSql)) return sd.options[i].value;
            }
        }
        return null;
    };
    const did = pickDistVal();
    const sal = document.getElementById('cierre-afect-sel-alimentador');
    if (did && alimSql && distIdSql != null && sal) {
        const alRadio = blk.querySelector('input[value="alimentador"]');
        if (alRadio) {
            alRadio.checked = true;
            syncCierreAfectadosPanels();
            sad.value = String(did);
            await refrescarCierreSelectAlimentadores();
            for (let i = 0; i < sal.options.length; i++) {
                const o = sal.options[i];
                if (!o.value) continue;
                if (o.value.toUpperCase() === alimSql.toUpperCase()) {
                    sal.value = o.value;
                    return;
                }
                if (String(o.textContent || '').toUpperCase().startsWith(alimSql.toUpperCase())) {
                    sal.value = o.value;
                    return;
                }
            }
            return;
        }
    }
    if (did) {
        const dRadio = blk.querySelector('input[value="distribuidor"]');
        if (dRadio && sd) {
            dRadio.checked = true;
            sd.value = String(did);
            syncCierreAfectadosPanels();
        }
    }
}

async function prepararBloqueClientesAfectadosCierre(_p) {
    /* Bloque SAIDI/SAIFI manual eliminado: los índices se calculan en estadísticas. */
}

function leerCuerpoValidadoCierreAfectados() {
    return { ok: true, body: null };
}

async function neonInsertClientesAfectadosLog(pedidoId, body) {
    const tid = tenantIdActual();
    const uid = app.u?.id != null ? Number(app.u.id) : null;
    const metodo = String(body.metodo || '').toLowerCase();
    let transformador_id = null;
    let zona_id = null;
    let distribuidor_id = null;
    let alimentador = null;
    let medidor_desde = null;
    let medidor_hasta = null;
    let cantidad_clientes = 0;
    let es_estimado = false;
    if (metodo === 'transformador') {
        const trId = Number(body.transformador_id);
        const r = await sqlSimple(
            `SELECT id, clientes_conectados FROM infra_transformadores WHERE id = ${esc(trId)} AND tenant_id = ${esc(
                tid
            )} AND activo = TRUE LIMIT 1`
        );
        if (!r.rows?.length) throw new Error('Transformador inválido');
        transformador_id = r.rows[0].id;
        cantidad_clientes = Math.max(0, Number(r.rows[0].clientes_conectados) || 0);
    } else if (metodo === 'distribuidor') {
        const did = Number(body.distribuidor_id);
        if (!(await sqlInfraTrafoTieneDistribuidorId())) throw new Error('Ejecutá la migración SQL distribuidor/alimentador');
        const r = await sqlSimple(
            `SELECT COALESCE(SUM(clientes_conectados), 0) AS t FROM infra_transformadores WHERE tenant_id = ${esc(
                tid
            )} AND distribuidor_id = ${esc(did)} AND activo = TRUE`
        );
        distribuidor_id = did;
        cantidad_clientes = Math.max(0, Number(r.rows?.[0]?.t) || 0);
        es_estimado = false;
    } else if (metodo === 'alimentador') {
        const did = Number(body.distribuidor_id);
        alimentador = String(body.alimentador || '').trim();
        if (!(await sqlInfraTrafoTieneDistribuidorId())) throw new Error('Ejecutá la migración SQL distribuidor/alimentador');
        const r = await sqlSimple(
            `SELECT COALESCE(SUM(clientes_conectados), 0) AS t FROM infra_transformadores WHERE tenant_id = ${esc(
                tid
            )} AND distribuidor_id = ${esc(did)} AND activo = TRUE AND TRIM(alimentador) = ${esc(alimentador)}`
        );
        distribuidor_id = did;
        cantidad_clientes = Math.max(0, Number(r.rows?.[0]?.t) || 0);
        es_estimado = false;
    } else if (metodo === 'zona') {
        const zId = Number(body.zona_id);
        const r = await sqlSimple(
            `SELECT id, clientes_estimados FROM infra_zonas_clientes WHERE id = ${esc(zId)} AND tenant_id = ${esc(
                tid
            )} AND activo = TRUE LIMIT 1`
        );
        if (!r.rows?.length) throw new Error('Zona inválida');
        zona_id = r.rows[0].id;
        cantidad_clientes = Math.max(0, Number(r.rows[0].clientes_estimados) || 0);
        es_estimado = true;
    } else if (metodo === 'rango') {
        medidor_desde = String(body.medidor_desde || '').trim();
        medidor_hasta = String(body.medidor_hasta || '').trim();
        const a = Number.parseInt(medidor_desde, 10);
        const b = Number.parseInt(medidor_hasta, 10);
        if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
            cantidad_clientes = b - a + 1;
        } else {
            cantidad_clientes = Math.max(0, Number(body.cantidad) || 0);
            es_estimado = true;
        }
    } else if (metodo === 'manual') {
        cantidad_clientes = Math.max(0, Number(body.cantidad) || 0);
        es_estimado = body.es_estimado !== undefined ? !!body.es_estimado : true;
    } else {
        throw new Error('Método no válido');
    }
    if (cantidad_clientes <= 0) throw new Error('Cantidad inválida');
    await sqlSimple(
        `INSERT INTO clientes_afectados_log (pedido_id, tenant_id, metodo, transformador_id, zona_id, distribuidor_id, alimentador, medidor_desde, medidor_hasta, cantidad_clientes, es_estimado, usuario_id) VALUES (${esc(
            pedidoId
        )}, ${esc(tid)}, ${esc(metodo)}, ${esc(transformador_id)}, ${esc(zona_id)}, ${esc(distribuidor_id)}, ${esc(
            alimentador
        )}, ${esc(medidor_desde)}, ${esc(medidor_hasta)}, ${esc(cantidad_clientes)}, ${es_estimado}, ${esc(uid)})`
    );
}

async function enviarRegistroClientesAfectados(pedidoId, body) {
    const pid = Number(pedidoId);
    if (!Number.isFinite(pid) || pid <= 0) return { ok: false };
    if (puedeEnviarApiRestPedidos()) {
        try {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return { ok: false, warning: 'No se pudo registrar clientes afectados (sin token API).' };
            const resp = await fetch(apiUrl(`/api/pedidos/${pid}/clientes-afectados`), {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                const t = await resp.text();
                console.warn('[clientes-afectados]', resp.status, t.slice(0, 300));
                if (NEON_OK && _sql && (await sqlInfraAfectadosTablasExisten())) {
                    try {
                        await neonInsertClientesAfectadosLog(pid, body);
                        return { ok: true };
                    } catch (_) {}
                }
                return {
                    ok: false,
                    warning: 'El cierre se guardó; no se pudo registrar clientes afectados en el servidor.',
                };
            }
            return { ok: true };
        } catch (e) {
            if (NEON_OK && _sql && (await sqlInfraAfectadosTablasExisten())) {
                try {
                    await neonInsertClientesAfectadosLog(pid, body);
                    return { ok: true };
                } catch (_) {}
            }
            return { ok: false, warning: 'El cierre se guardó; falló el registro de clientes afectados.' };
        }
    }
    if (NEON_OK && _sql && (await sqlInfraAfectadosTablasExisten())) {
        try {
            await neonInsertClientesAfectadosLog(pid, body);
            return { ok: true };
        } catch (e) {
            console.warn('[clientes-afectados-neon]', e);
            return {
                ok: false,
                warning: 'El cierre se guardó; no se pudo registrar clientes afectados en la base.',
            };
        }
    }
    return {
        ok: false,
        warning: 'El cierre se guardó; sin API ni tablas locales para clientes afectados.',
    };
}

async function abrirCierre(id) {
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) return;
    
    app.cid = id;
    const lblFirma = document.getElementById('lbl-firma-cierre');
    const _fp = etiquetaFirmaPersona();
    if (lblFirma) {
        if (pedidoTieneClienteCargado(p)) {
            lblFirma.innerHTML = `<i class="fas fa-signature"></i> Firma del cliente / ${_fp} <span style="font-weight:600;color:#b45309">(obligatoria)</span>`;
        } else {
            lblFirma.innerHTML = `<i class="fas fa-signature"></i> Firma del cliente / ${_fp} <span style="font-weight:400;opacity:.88;font-size:.88em">(opcional — no hay ${etiquetaCampoClientePedido().toLowerCase()} en el pedido)</span>`;
        }
    }
    document.getElementById('ci').innerHTML = `
        <strong>#${p.np}</strong> - ${p.tt}<br>
        <span style="font-size:.85em">${p.de.substring(0,100)}${p.de.length > 100 ? '…' : ''}</span>
    `;
    document.getElementById('tr').value = '';
    document.getElementById('tc2').value = app.u?.nombre || '';
    const telCierreIn = document.getElementById('cierre-tel-contacto');
    if (telCierreIn) telCierreIn.value = (p.tel || '').trim();
    document.getElementById('tc').textContent = '0';
    ['chk-epp','chk-corte','chk-senal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    try {
        syncChecklistSeguridadCierreLabels();
    } catch (_) {}

    const blkMat = document.getElementById('cierre-materiales-block');
    const bodyMat = document.getElementById('cierre-materiales-body');
    if (blkMat && bodyMat) {
        const admiteMat = !tipoPedidoExcluyeMateriales(p.tt) && !String(p.id).startsWith('off_') && !modoOffline && NEON_OK;
        if (admiteMat) {
            blkMat.style.display = '';
            void refrescarMaterialesEnModalCierre(p);
        } else {
            blkMat.style.display = 'none';
            bodyMat.innerHTML = '';
        }
    }

    await prepararBloqueClientesAfectadosCierre(p);

    fotoCierreTemp = null;
    actualizarVistaPreviaFotoCierre();
    initFirmaCierreCanvas();
    limpiarFirmaCierreCanvas();
    document.getElementById('cm2').classList.add('active');
}

document.getElementById('btn-limpiar-firma-cierre')?.addEventListener('click', () => limpiarFirmaCierreCanvas());

document.getElementById('cc2').addEventListener('click', async () => {
    const tr = document.getElementById('tr').value.trim();
    if (!tr) {
        toast('Describí el trabajo realizado', 'error');
        return;
    }
    const pCierre = app.p.find(x => String(x.id) === String(app.cid));
    const firmaObligatoria = pedidoTieneClienteCargado(pCierre);
    if (firmaObligatoria && firmaCierreCanvasVacio()) {
        toast('Este pedido tiene cliente cargado: la firma es obligatoria', 'error');
        return;
    }
    const c = document.getElementById('firma-canvas-cierre');
    const firmaData = !firmaCierreCanvasVacio() && c ? c.toDataURL('image/png') : null;
    const checklistJson = JSON.stringify({
        epp: !!document.getElementById('chk-epp')?.checked,
        corte: !!document.getElementById('chk-corte')?.checked,
        senal: !!document.getElementById('chk-senal')?.checked
    });
    const btn = document.getElementById('cc2');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Guardando...';
    try {
        const telCierre = (document.getElementById('cierre-tel-contacto')?.value || '').trim();
        const camposCierre = {
            estado: 'Cerrado',
            avance: 100,
            trabajo_realizado: tr,
            tecnico_cierre: document.getElementById('tc2').value.trim() || app.u?.nombre || '',
            fecha_cierre: new Date().toISOString(),
            foto_cierre: fotoCierreTemp || null,
            firma_cliente: firmaData,
            checklist_seguridad: checklistJson
        };
        if (telCierre) camposCierre.telefono_contacto = telCierre;
        await updPedido(app.cid, camposCierre, app.u?.id);
        if (puedeEnviarApiRestPedidos() && !String(app.cid).startsWith('off_')) {
            const pidNum = parseInt(app.cid, 10);
            if (Number.isFinite(pidNum) && pidNum > 0) {
                void notificarCierreWhatsappApi(pidNum, telCierre || undefined);
            }
        }
        fotoCierreTemp = null;
        closeAll();
        toast('Pedido cerrado', 'success');
    } catch(e) {
        toastError('cerrar-pedido', e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirmar cierre';
    }
});

function pedidoEsDerivadoFuera(p) {
    if (!p) return false;
    return String(p.es || '') === 'Derivado externo' || p.dex === true || p.dex === 1;
}

function adminMuestraPedidosDerivadosFuera() {
    try {
        return esAdmin() && localStorage.getItem(LS_MOSTRAR_DERIVADOS_FUERA) === '1';
    } catch (_) {
        return false;
    }
}

/**
 * Listas + mapa: pedidos «Derivado externo» / `dex`.
 * - Admin: solo si `LS_MOSTRAR_DERIVADOS_FUERA` (comportamiento actual).
 * - Técnico / supervisor: siempre los que **participó** — `tecnico_asignado_id` (`tai`) o creador (`uc` / `ui`), sin depender del LS del admin.
 */
function mostrarPedidoDerivadoFueraEnListasYMapa(p) {
    if (!pedidoEsDerivadoFuera(p)) return true;
    if (esAdmin()) return adminMuestraPedidosDerivadosFuera();
    if (esTecnicoOSupervisor()) {
        const uid = parseInt(app.u && app.u.id, 10);
        if (!Number.isFinite(uid) || uid < 1) return false;
        const tai = p.tai != null ? parseInt(p.tai, 10) : NaN;
        if (Number.isFinite(tai) && tai === uid) return true;
        const creador = p.uc != null ? parseInt(p.uc, 10) : p.ui != null ? parseInt(p.ui, 10) : NaN;
        if (Number.isFinite(creador) && creador === uid) return true;
        return false;
    }
    return false;
}

function construirOpcionesDerivacionAdminHtml(escFn) {
    const dr = window.EMPRESA_CFG?.derivacion_reclamos;
    if (!dr || typeof dr !== 'object') {
        return `<option value="">${escFn('Configurá contactos en Admin → Empresa')}</option>`;
    }
    const out = [];
    const one = (k, shortLab) => {
        const s = dr[k];
        if (s?.whatsapp && /^\+\d{8,22}$/.test(String(s.whatsapp))) {
            const n = String(s.nombre || '').trim();
            const label = n ? `${shortLab} — ${n}` : shortLab;
            out.push(`<option value="${k}::">${escFn(label)}</option>`);
        }
    };
    one('empresa_energia', 'Energía eléctrica');
    one('cooperativa_agua', 'Cooperativa de agua');
    one('empresa_gas_natural', 'Gas natural');
    one('empresa_telefonia', 'Telefonía');
    one('policia', 'Policía');
    [['empresa_internet', 'Internet'], ['empresa_tv_cable', 'TV cable']].forEach(([k, shortLab]) => {
        const arr = Array.isArray(dr[k]) ? dr[k] : [];
        arr.forEach((slot, i) => {
            if (slot?.whatsapp && /^\+\d{8,22}$/.test(String(slot.whatsapp))) {
                const sub = String(slot.nombre || '').trim() || 'Contacto ' + (i + 1);
                out.push(`<option value="${k}::${i}">${escFn(`${shortLab} — ${sub}`)}</option>`);
            }
        });
    });
    if (!out.length) {
        return `<option value="otro::">${escFn('Otro — WhatsApp manual (+internacional)')}</option>`;
    }
    out.push(`<option value="otro::">${escFn('Otro — WhatsApp manual (+internacional)')}</option>`);
    return out.join('');
}

function normalizarDestinoDerivacionSeleccion(v) {
    const raw = String(v || '').trim();
    if (!raw || !raw.includes('::')) return null;
    const cut = raw.indexOf('::');
    const destino = raw.slice(0, cut);
    const idxStr = raw.slice(cut + 2);
    let fila_index;
    if (idxStr !== '') {
        const n = parseInt(idxStr, 10);
        if (!Number.isFinite(n)) return null;
        fila_index = n;
    }
    return { destino, idxStr, fila_index };
}

function obtenerTelefonoDerivacionDesdeEmpresaCfg(v) {
    const sel = normalizarDestinoDerivacionSeleccion(v);
    if (!sel) return '';
    const dr = window.EMPRESA_CFG?.derivacion_reclamos;
    if (!dr || typeof dr !== 'object') return '';
    if (sel.idxStr !== '') {
        const arr = Array.isArray(dr[sel.destino]) ? dr[sel.destino] : [];
        const slot = arr[sel.fila_index];
        return String(slot?.whatsapp || '').trim();
    }
    return String(dr[sel.destino]?.whatsapp || '').trim();
}

function buildPreviewMensajeDerivacionAdmin(p, destinoNombre, obs) {
    const entidad = String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
    const np = String(p?.np || p?.numero_pedido || '—').trim();
    const pid = String(p?.id || '—').trim();
    const tipo = String(p?.tt || '—').trim();
    const prioridad = String(p?.pr || '—').trim();
    const estado = String(p?.es || '—').trim();
    const cliente = String(p?.cnom || p?.cl || '').trim();
    const tel = String(p?.tel || '').trim();
    const calle = String(p?.ccal || '').trim();
    const num = String(p?.cnum || '').trim();
    const loc = String(p?.cloc || '').trim();
    const dir = [calle, num, loc].filter(Boolean).join(', ') || String(p?.cdir || '').trim();
    const { la: laEf, ln: lnEf } = coordsEfectivasPedidoMapa(p);
    const lat = Number(laEf);
    const lng = Number(lnEf);
    const coordsOk =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        (Math.abs(lat) > 1e-7 || Math.abs(lng) > 1e-7);
    const ubicacion = coordsOk
        ? `Coordenadas GPS: ${lat}, ${lng}\nAbrí en Maps: https://www.google.com/maps?q=${lat},${lng}`
        : `${dir || 'Sin domicilio estructurado'}\n(Sin coordenadas GPS registradas en el sistema.)`;
    const obsTxt = String(obs || '').trim() || '—';
    const recl = cliente || tel ? `${cliente || '—'}${tel ? ` · Tel.: ${tel}` : ''}` : '—';
    return [
        `A: ${destinoNombre || '—'}`,
        '',
        `${entidad} le informa que recibimos el reclamo *N° ${np}* (ref. interna id ${pid}) y que, *en visita / según lo informado por el técnico*, se constató en el lugar que *corresponde atenderlo vuestra empresa*.`,
        '',
        'Derivamos el reclamo con las *observaciones del técnico / operador*:',
        obsTxt,
        '',
        '*Ubicación para relevo en campo:*',
        ubicacion,
        '',
        '*Datos útiles del reclamo*',
        `• Tipo: ${tipo || '—'}`,
        `• Prioridad: ${prioridad || '—'}`,
        `• Estado al derivar: ${estado || '—'}`,
        `• Reclamante / contacto: ${recl}`,
        '',
        '*Respuesta por este mismo chat (WhatsApp):*',
        'Pueden responder por este mismo hilo de WhatsApp; un operador de nuestra entidad verá el mensaje en el panel de gestión y podrá continuar la coordinación de este reclamo.',
        '',
        'Los datos se comparten solo para coordinar este reclamo entre entidades. No reenviarlos fuera del circuito operativo acordado.',
        '',
        'Gracias por su atención.',
        entidad,
    ].join('\n');
}

function cerrarModalDerivacionPreviewAdmin() {
    document.getElementById('modal-derivacion-preview-admin')?.classList.remove('active');
    try {
        const w = document.getElementById('deriv-prev-otro-wrap');
        if (w) w.style.display = 'none';
        const telEl = document.getElementById('deriv-prev-telefono');
        if (telEl) {
            telEl.setAttribute('readonly', 'readonly');
            telEl.placeholder = '';
        }
    } catch (_) {}
}
window.cerrarModalDerivacionPreviewAdmin = cerrarModalDerivacionPreviewAdmin;

function abrirModalRevisionDerivacionAdmin(pid) {
    if (!puedeEnviarApiRestPedidos()) {
        toast(
            'Para confirmar la derivación por servidor hace falta la API (api.baseUrl en config) y sesión con JWT. Usá los botones «Contactar…» en este pedido o completá el login hasta que aparezca el aviso verde de API.',
            'info'
        );
        return;
    }
    const sel = document.getElementById('admin-derivar-destino');
    const ta = document.getElementById('admin-derivar-motivo');
    const v = (sel?.value || '').trim();
    if (!v || !v.includes('::')) {
        toast('Elegí un destino.', 'warning');
        return;
    }
    const pRow = resolverPedidoParaDerivacionRevisionAdmin(pid);
    if (!pRow) {
        toast(
            'No se encontró el pedido en la lista cargada. Abrí de nuevo el detalle desde Pedidos o tocá «Recargar» y reintentá.',
            'error'
        );
        return;
    }
    const obsTa = (ta?.value || '').trim();
    const obsTec = String(pRow?.sdm || '').trim();
    if (!obsTa && !obsTec) {
        toast(
            'Cargá las observaciones para el tercero. Si el técnico ya mandó una solicitud, deberían aparecer prellenadas: revisalas o editá antes de confirmar.',
            'warning'
        );
        return;
    }
    const destinoSel = normalizarDestinoDerivacionSeleccion(v);
    if (!destinoSel) {
        toast('Destino inválido.', 'error');
        return;
    }
    const esOtroDest = destinoSel.destino === 'otro' || destinoSel.destino === 'otro_personalizado';
    if (!esOtroDest) {
        const telPre = obtenerTelefonoDerivacionDesdeEmpresaCfg(v);
        if (!telPre || !/^\+\d{8,22}$/.test(String(telPre).trim())) {
            toast(
                'No hay teléfono configurado para esta derivación. Carguelo en Panel Admin → Datos de la Empresa → Derivación a terceros.',
                'error'
            );
            return;
        }
    }
    const destinoNombre =
        String(sel?.selectedOptions?.[0]?.textContent || '').trim() || destinoSel.destino;
    const tel = esOtroDest ? '' : obtenerTelefonoDerivacionDesdeEmpresaCfg(v);
    const nomOtroEl = document.getElementById('deriv-prev-nombre-otro');
    const nomOtroVal = (nomOtroEl?.value || '').trim();
    const destinoParaMsg =
        esOtroDest && nomOtroVal ? nomOtroVal : esOtroDest ? 'Tercero' : destinoNombre;
    const msg = buildPreviewMensajeDerivacionAdmin(pRow, destinoParaMsg, obsTa || obsTec);
    const mp = document.getElementById('modal-derivacion-preview-admin');
    const pidEl = document.getElementById('deriv-prev-pid');
    if (!mp || !pidEl) {
        toast('No se encontró el modal de revisión de derivación. Recargá la página (F5).', 'error');
        return;
    }
    pidEl.value = String(pid);
    const dstEl = document.getElementById('deriv-prev-destino');
    if (dstEl) dstEl.innerHTML = `<option value="${v.replace(/"/g, '&quot;')}">${destinoNombre.replace(/</g, '&lt;')}</option>`;
    const telEl = document.getElementById('deriv-prev-telefono');
    const otroWrap = document.getElementById('deriv-prev-otro-wrap');
    if (esOtroDest) {
        if (otroWrap) otroWrap.style.display = '';
        if (telEl) {
            telEl.removeAttribute('readonly');
            telEl.value = '';
            telEl.placeholder = '+5434341234567';
        }
        try {
            const syncPrev = () => {
                const n = (document.getElementById('deriv-prev-nombre-otro')?.value || '').trim();
                const msgEl = document.getElementById('deriv-prev-mensaje');
                if (!msgEl) return;
                msgEl.value = buildPreviewMensajeDerivacionAdmin(pRow, n || 'Tercero', obsTa || obsTec);
            };
            nomOtroEl?.removeEventListener('input', nomOtroEl._gnDerivOtroSync);
            nomOtroEl._gnDerivOtroSync = syncPrev;
            nomOtroEl?.addEventListener('input', syncPrev);
        } catch (_) {}
    } else {
        if (otroWrap) otroWrap.style.display = 'none';
        if (telEl) {
            telEl.setAttribute('readonly', 'readonly');
            telEl.placeholder = '';
        }
        try {
            nomOtroEl?.removeEventListener('input', nomOtroEl._gnDerivOtroSync);
        } catch (_) {}
    }
    if (telEl && !esOtroDest) telEl.value = tel || '';
    const msgEl = document.getElementById('deriv-prev-mensaje');
    if (msgEl) msgEl.value = msg;
    try {
        mp.classList.add('active');
    } catch (e) {
        toast('No se pudo abrir el modal de revisión.', 'error');
    }
}
window.abrirModalRevisionDerivacionAdmin = abrirModalRevisionDerivacionAdmin;

async function ejecutarDerivacionExternaAdmin(pid, override) {
    const dataModal = override || {};
    const v = String(dataModal.destinoValue || '').trim();
    const destinoSel = normalizarDestinoDerivacionSeleccion(v);
    if (!destinoSel) {
        toast('Destino inválido.', 'error');
        return;
    }
    const motivo = String(dataModal.motivo || '').trim().slice(0, 2000);
    const mensajeFinal = String(dataModal.mensajeFinal || '').trim().slice(0, 6000);
    if (!motivo) {
        toast('Falta el texto de observaciones para la derivación.', 'warning');
        return;
    }
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) {
        toast('No hay sesión API. Reintentá con conexión.', 'error');
        return;
    }
    const pidNum = parseInt(pid, 10);
    if (!Number.isFinite(pidNum)) return;
    try {
        const body = { destino: destinoSel.destino, motivo: motivo || undefined, mensaje_final: mensajeFinal || undefined };
        if (destinoSel.idxStr !== '') body.fila_index = destinoSel.fila_index;
        const pRowChk = app.p.find((x) => String(x.id) === String(pidNum));
        if (pRowChk && normalizarEstadoPedidoUi(pRowChk.es) === 'Pendiente') body.desde_alta_pedido_nuevo = true;
        const esOtroApi = destinoSel.destino === 'otro' || destinoSel.destino === 'otro_personalizado';
        if (esOtroApi) {
            const wt = String(dataModal.whatsapp_tercero || '').trim();
            const nt = String(dataModal.nombre_tercero || '').trim();
            if (!wt) {
                toast('Completá el WhatsApp del tercero (+internacional) en el paso anterior.', 'warning');
                return;
            }
            body.whatsapp_tercero = wt;
            if (nt) body.nombre_tercero = nt;
        }
        const pRow = app.p.find((x) => String(x.id) === String(pidNum));
        if (pRow) {
            const { la: laEf, ln: lnEf } = coordsEfectivasPedidoMapa(pRow);
            const lx = Number(laEf);
            const ly = Number(lnEf);
            if (Number.isFinite(lx) && Number.isFinite(ly) && (Math.abs(lx) > 1e-7 || Math.abs(ly) > 1e-7)) {
                body.lat = lx;
                body.lng = ly;
            }
        }
        const resp = await fetch(apiUrl(`/api/pedidos/${pidNum}/derivar-externo`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        }
        const waOk = data._derivacion_whatsapp_enviado === true;
        const waErr = String(data._derivacion_whatsapp_envio_error || '').trim();
        delete data._derivacion_whatsapp_enviado;
        delete data._derivacion_whatsapp_envio_error;
        const row = norm(data);
        const idx = app.p.findIndex((x) => String(x.id) === String(pid));
        if (idx !== -1) app.p[idx] = row;
        else app.p.push(row);
        offlinePedidosSave(app.p);
        render();
        cerrarModalDerivacionPreviewAdmin();
        try {
            sessionStorage.removeItem('gn-admin-deriv-motivo-' + pidNum);
        } catch (_) {}
        if (waOk) {
            toast('Derivación registrada. El mensaje se envió al tercero por WhatsApp (servidor).', 'success');
        } else {
            toast(
                waErr
                    ? `Derivación registrada. WhatsApp automático no disponible: ${waErr}`
                    : 'Derivación registrada. Revisá credenciales Meta (Empresa) o contactá al tercero desde el panel de chat humano.',
                waErr ? 'warning' : 'info'
            );
        }
        void detalle(idx !== -1 ? app.p[idx] : row);
    } catch (e) {
        toast(String(e?.message || e), 'error');
    }
}
window.ejecutarDerivacionExternaAdmin = ejecutarDerivacionExternaAdmin;

async function confirmarEnvioDerivacionPreviewAdmin() {
    const pid = document.getElementById('deriv-prev-pid')?.value;
    const destinoValue = document.getElementById('deriv-prev-destino')?.value || '';
    const mensajeFinal = document.getElementById('deriv-prev-mensaje')?.value || '';
    const detTa = document.getElementById('admin-derivar-motivo');
    const pRow = app.p.find((x) => String(x.id) === String(pid));
    const motivo = String(detTa?.value || pRow?.sdm || '').trim();
    if (!pid) return;
    const destinoParsed = normalizarDestinoDerivacionSeleccion(destinoValue);
    const esOtro =
        destinoParsed?.destino === 'otro' || destinoParsed?.destino === 'otro_personalizado';
    const telPreview = String(document.getElementById('deriv-prev-telefono')?.value || '').trim();
    if (esOtro && (!telPreview || !/^\+\d{8,22}$/.test(telPreview))) {
        toast('Completá el WhatsApp del tercero en formato internacional (ej. +5434341234567).', 'warning');
        return;
    }
    await ejecutarDerivacionExternaAdmin(pid, {
        destinoValue,
        motivo,
        mensajeFinal,
        whatsapp_tercero: esOtro ? telPreview : undefined,
        nombre_tercero: esOtro
            ? String(document.getElementById('deriv-prev-nombre-otro')?.value || '').trim()
            : undefined,
    });
}
window.confirmarEnvioDerivacionPreviewAdmin = confirmarEnvioDerivacionPreviewAdmin;

async function solicitarDerivacionTerceroDesdeTecnico(pid) {
    const pidNum = parseInt(pid, 10);
    if (!Number.isFinite(pidNum)) return;
    const ta = document.getElementById(`tec-sol-deriv-motivo-${pidNum}`);
    const motivo = (ta?.value || '').trim();
    if (motivo.length < 8) {
        toast('Las observaciones de campo son obligatorias (mínimo 8 caracteres).', 'error');
        return;
    }
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) {
        toast('No hay sesión API. Reintentá con conexión.', 'error');
        return;
    }
    try {
        const resp = await fetch(apiUrl(`/api/pedidos/${pidNum}/solicitar-derivacion-tercero`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: motivo || undefined }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        const row = norm(data);
        const ix = app.p.findIndex((x) => String(x.id) === String(pid));
        if (ix !== -1) app.p[ix] = row;
        else app.p.push(row);
        offlinePedidosSave(app.p);
        render();
        toast('Solicitud enviada al administrador.', 'success');
        try {
            sessionStorage.removeItem('gn-tec-deriv-motivo-' + pidNum);
        } catch (_) {}
        try {
            const dm = document.getElementById('dm');
            if (dm) {
                dm.classList.remove('active');
                try {
                    gnMapThrottleOnDetallePedidoClosed();
                } catch (_) {}
                try {
                    disconnectPedidoVerImagenDetalleObserver();
                } catch (_) {}
                try {
                    delete dm.dataset.detallePedidoId;
                } catch (_) {}
            }
        } catch (_) {}
        try {
            if (window.AndroidLocalNotify && typeof window.AndroidLocalNotify.show === 'function') {
                const np = row.np != null && String(row.np).trim() !== '' ? String(row.np).trim() : String(pidNum);
                window.AndroidLocalNotify.show(
                    `sol-deriv-${pidNum}-${Date.now()}`,
                    'Solicitud de derivación enviada a la central',
                    `Pedido #${np}`,
                    String(pidNum)
                );
            }
        } catch (_) {}
    } catch (e) {
        toast(String(e?.message || e), 'error');
    }
}
window.solicitarDerivacionTerceroDesdeTecnico = solicitarDerivacionTerceroDesdeTecnico;

async function rechazarSolicitudDerivacionAdmin(pid) {
    const pidNum = parseInt(pid, 10);
    if (!Number.isFinite(pidNum)) return;
    const nota = window.prompt('Motivo del rechazo (opcional, queda en auditoría):', '') || '';
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) {
        toast('No hay sesión API.', 'error');
        return;
    }
    try {
        const resp = await fetch(apiUrl(`/api/pedidos/${pidNum}/rechazar-solicitud-derivacion-tercero`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nota_admin: nota.trim() || undefined }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        const row = norm(data);
        const ix = app.p.findIndex((x) => String(x.id) === String(pid));
        if (ix !== -1) app.p[ix] = row;
        else app.p.push(row);
        offlinePedidosSave(app.p);
        render();
        toast('Solicitud rechazada.', 'success');
        void detalle(ix !== -1 ? app.p[ix] : row);
    } catch (e) {
        toast(String(e?.message || e), 'error');
    }
}
window.rechazarSolicitudDerivacionAdmin = rechazarSolicitudDerivacionAdmin;

/** Admin / técnico asignado: fila fresca desde API o Neon para ver motivo de derivación sin F5. */
async function refetchPedidoFilaParaDetalle(pedidoId) {
    const id = parseInt(String(pedidoId), 10);
    if (!Number.isFinite(id) || id < 1) return null;
    if (esAdmin() && puedeEnviarApiRestPedidos()) {
        try {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return null;
            const r = await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(id))}`), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (!r.ok) return null;
            const row = await r.json();
            const merged = norm(row);
            const ix = app.p.findIndex((x) => String(x.id) === String(merged.id));
            if (ix >= 0) app.p[ix] = merged;
            else app.p.unshift(merged);
            try {
                offlinePedidosSave(app.p);
            } catch (_) {}
            return merged;
        } catch (_) {
            return null;
        }
    }
    if (NEON_OK && _sql && !modoOffline) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(id)} LIMIT 1`);
            const row = rr.rows?.[0];
            if (!row) return null;
            const merged = norm(row);
            const ix = app.p.findIndex((x) => String(x.id) === String(merged.id));
            if (ix >= 0) app.p[ix] = merged;
            else app.p.unshift(merged);
            try {
                offlinePedidosSave(app.p);
            } catch (_) {}
            return merged;
        } catch (_) {
            return null;
        }
    }
    return null;
}

let _gnDetalleRenderDepsCache = null;

function getDetalleRenderDeps() {
    if (_gnDetalleRenderDepsCache) return _gnDetalleRenderDepsCache;
    _gnDetalleRenderDepsCache = {
        app,
        modoOffline,
        NEON_OK,
        _sql,
        sqlSimple,
        esc,
        esAdmin,
        esTecnicoOSupervisor,
        esAndroidWebViewMapa,
        etiquetaNisDetalleModalPedido,
        esCooperativaElectricaRubro,
        esMunicipioRubro,
        esCooperativaAguaRubro,
        construirHtmlBloqueOpinionClienteDetalle,
        actualizarHostOpinionClienteDetalleModal,
        pedidoSugiereDerivacionAguaOMunicipioEnElectrica,
        gnTipoTrabajoPedidoDerivacion: _gnTipoTrabajoPedidoDerivacion,
        normalizarWhatsappInternacionalWaMeUrl,
        pedidoEsDerivadoFuera,
        normalizarRolStr,
        textoResumenChecklistSeguridad,
        etiquetaFirmaPersona,
        coordsEfectivasPedidoMapa,
        coordsSonPinValidasMapaWgs84,
        domicilioParaGeocodePedido,
        etiquetaModoUbicPedido,
        proyectarCoordPedido,
        construirOpcionesDerivacionAdminHtml,
        puedeEnviarApiRestPedidos,
        debeMostrarBotonDerivacion,
        htmlDerivacionTercerosPedidoDetalle,
        htmlSolicitudDerivacionCoopElectricaTecnico,
        etiquetaZonaPedido,
        valorZonaPedidoUI,
        sanitizarTextoDescripcionPedidoVista,
        esTipoPedidoFactibilidad,
        incluirBloqueMaterialesEnDetallePedido,
        htmlOperativaTop3Section,
    };
    return _gnDetalleRenderDepsCache;
}

function finalizarDetallePedidoPatch(p) {
    try {
        syncPedidoVolverPendienteButton(p);
    } catch (_) {}
    const cargarMaterialesDetalle = () => {
        const bodyMat = document.getElementById('materiales-detalle-body');
        if (
            !esTipoPedidoFactibilidad(p.tt) &&
            incluirBloqueMaterialesEnDetallePedido(p) &&
            !(p.es === 'Cerrado' && materialesDetalleDebeOmitirRecarga(p, bodyMat))
        ) {
            refrescarMaterialesEnDetalle(p);
        }
    };
    if (document.documentElement.classList.contains('gn-android-shell')) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(cargarMaterialesDetalle, { timeout: 650 });
        } else {
            setTimeout(cargarMaterialesDetalle, 280);
        }
    } else {
        requestAnimationFrame(cargarMaterialesDetalle);
    }
}

function finalizarDetallePedidoAbierto(p) {
    const ed =
        esAdmin() ||
        String(p.ui) === String(app.u?.id) ||
        (esTecnicoOSupervisor() && p.tai != null && String(p.tai) === String(app.u?.id));
    try {
        syncPedidoVolverPendienteButton(p);
    } catch (_) {}

    const dmEl = document.getElementById('dm');
    dmEl.classList.add('active');
    try {
        installPedidoVerImagenDetalleObserver();
    } catch (_) {}
    pedidoDetalleTraerModalAlFrente(dmEl, gnForceModalZFront);
    try {
        gnMapThrottleOnDetallePedidoOpened();
    } catch (_) {}
    const cargarMaterialesDetalle = () => {
        const bodyMat = document.getElementById('materiales-detalle-body');
        if (
            !esTipoPedidoFactibilidad(p.tt) &&
            incluirBloqueMaterialesEnDetallePedido(p) &&
            !(p.es === 'Cerrado' && materialesDetalleDebeOmitirRecarga(p, bodyMat))
        ) {
            refrescarMaterialesEnDetalle(p);
        }
    };
    if (document.documentElement.classList.contains('gn-android-shell')) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(cargarMaterialesDetalle, { timeout: 650 });
        } else {
            setTimeout(cargarMaterialesDetalle, 280);
        }
    } else {
        requestAnimationFrame(cargarMaterialesDetalle);
    }
    try {
        mountPedidoOperativaTop3UI(p, { ed, esAdmin: esAdmin(), toast });
    } catch (_) {}
}

async function detalle(p, opts = {}) {
    try {
        gnRequestClearGotoPreviewMarker();
    } catch (_) {}
    const skipBgRefetch = !!opts.skipBackgroundRefetch;
    if (!skipBgRefetch && p?.id != null && !String(p.id).startsWith('off_') && !modoOffline) {
        const okRol =
            esAdmin() ||
            (esTecnicoOSupervisor() &&
                app.u &&
                p.tai != null &&
                String(p.tai) === String(app.u.id));
        if (okRol) {
            const pidRef = p.id;
            void refetchPedidoFilaParaDetalle(pidRef).then((fr) => {
                if (!fr) return;
                const dm = document.getElementById('dm');
                if (!dm || String(dm.dataset.detallePedidoId || '') !== String(fr.id)) return;
                if (_gnDmTypingFocused()) {
                    const ix = app.p.findIndex((x) => String(x.id) === String(fr.id));
                    if (ix >= 0) app.p[ix] = fr;
                    return;
                }
                if (typeof window.gnDmDebeDiferirRepintadoDetalle === 'function' && window.gnDmDebeDiferirRepintadoDetalle()) {
                    window.gnDmEncolarRepintadoDetalle(fr, { skipBackgroundRefetch: true });
                    return;
                }
                void detalle(fr, { skipBackgroundRefetch: true });
            });
        }
    }
    try {
        gnGeocodePrecargarWhatsappRegeoLog(p);
    } catch (_) {}
    const pidKey = String(p.id);
    try {
        const dmRoot = document.getElementById('dm');
        if (dmRoot) dmRoot.dataset.detallePedidoId = pidKey;
    } catch (_) {}
    try {
        window.__gnDetallePedidoActivo = p;
    } catch (_) {}
    try {
        if (esAdmin() && p?.id != null) {
            const ob = document.getElementById('admin-banner-opinion-cliente');
            if (ob?.dataset?.visible === '1' && String(ob.dataset.pedidoId) === pidKey) {
                void ocultarBannerOpinionCliente();
            }
        }
    } catch (_) {}

    if (!pidKey.startsWith('off_') && !modoOffline && NEON_OK && _sql) {
        void (async () => {
            try {
                const pidNum = parseInt(p.id, 10);
                if (!Number.isFinite(pidNum)) return;
                const r = await sqlSimple(
                    `SELECT opinion_cliente, opinion_cliente_estrellas, fecha_opinion_cliente, opinion_descargo_empresa, fecha_descargo_empresa FROM pedidos WHERE id=${esc(pidNum)} LIMIT 1`
                );
                const row = r.rows?.[0];
                if (!row) return;
                const dmOpen = document.getElementById('dm');
                if (!dmOpen?.classList.contains('active') || dmOpen.dataset.detallePedidoId !== pidKey) return;
                const cur = app.p.find((x) => String(x.id) === pidKey);
                if (!cur) return;
                const o = row.opinion_cliente;
                const os = o != null && String(o).trim() ? String(o).trim() : '';
                let changed = false;
                if (os && os !== String(cur.opin || '')) {
                    cur.opin = os;
                    changed = true;
                }
                const nEs = Number(row.opinion_cliente_estrellas);
                const oesNew = Number.isFinite(nEs) && nEs >= 1 && nEs <= 5 ? Math.round(nEs) : null;
                if (oesNew !== cur.oes) {
                    cur.oes = oesNew;
                    changed = true;
                }
                const fp = row.fecha_opinion_cliente;
                if (fp && String(fp) !== String(cur.fopin || '')) {
                    cur.fopin = fp;
                    changed = true;
                }
                const od = row.opinion_descargo_empresa;
                const odescNew = od != null && String(od).trim() ? String(od).trim() : null;
                if (String(odescNew || '') !== String(cur.odesc || '')) {
                    cur.odesc = odescNew;
                    changed = true;
                }
                const fd = row.fecha_descargo_empresa;
                if (fd && String(fd) !== String(cur.fodesc || '')) {
                    cur.fodesc = fd;
                    changed = true;
                } else if (!odescNew && cur.fodesc) {
                    cur.fodesc = null;
                    changed = true;
                }
                if (changed) {
                    // Solo recargar si el pedido NO está cerrado (evita bucle de recarga)
                    if (p.es !== 'Cerrado' && cur.es !== 'Cerrado') {
                        if (_gnDmTypingFocused()) {
                            try {
                                actualizarHostOpinionClienteDetalleModal(cur);
                            } catch (_) {}
                        } else if (
                            typeof window.gnDmDebeDiferirRepintadoDetalle === 'function' &&
                            window.gnDmDebeDiferirRepintadoDetalle()
                        ) {
                            window.gnDmEncolarRepintadoDetalle(cur, { skipBackgroundRefetch: true });
                        } else {
                            void detalle(cur, { skipBackgroundRefetch: true });
                        }
                    }
                }
            } catch (_) {}
        })();
    }

    const deps = getDetalleRenderDeps();
    const dmAbierto = document.getElementById('dm');
    const dmcEl = document.getElementById('dmc');
    const restaurarScrollDetalle =
        dmAbierto?.classList.contains('active') &&
        String(dmAbierto.dataset.detallePedidoId || '') === pidKey
            ? dmcEl?.querySelector('.gn-dm-detail-scroll')?.scrollTop ?? 0
            : 0;

    if (puedePatchIncrementalDetalle(p, opts, deps)) {
        hydrateDetallePedido(p, deps, { mode: 'patch' });
        finalizarDetallePedidoPatch(p);
        return;
    }

    hydrateDetallePedido(p, deps, {
        mode: 'full',
        preserveScroll: restaurarScrollDetalle > 0,
        scrollTop: restaurarScrollDetalle,
        forceFullRender: !!opts.forceFullRender,
    });
    finalizarDetallePedidoAbierto(p);
}


// Movido a modules/export-excel.js: arrayBufferToBase64, textToBase64, guardarArchivoAndroid, dl, exportarCSV, runExportPedidosExcelCsv.

function exportPedido(pedidos, nombre) {
    gnCerrarModalPedidoDetalleSiAbierto();
    runExportPedidosExcelCsv(pedidos, nombre, {
        proyectarCoordPedido,
        etiquetaZonaPedido,
        valorZonaPedidoUI,
        esCooperativaElectricaRubro,
        empresaCfg: () => window.EMPRESA_CFG || {},
        nombreHojaExcelPedidoUnico,
    });
}

window._xl = id => {
    const p = app.p.find(x => String(x.id) === String(id));
    if (p) exportPedido([p], nombreArchivoExportPedidoUnico(p));
};


function tabPedidoListaPorEstado(es) {
    const n = normalizarEstadoPedidoUi(es);
    if (n === 'Cerrado' || n === 'Derivado externo' || n === 'Desestimado') return 'c';
    if (n === 'Asignado' || n === 'En ejecución') return 'a';
    return 'p';
}

function pedidosConSolicitudDerivacionPendiente() {
    return (app.p || []).filter((p) => p && p.sdpen === true);
}

function ocultarBannerDerivacionPendiente() {
    const b = document.getElementById('admin-banner-derivacion-pendiente');
    if (b) b.style.display = 'none';
}
window.ocultarBannerDerivacionPendiente = ocultarBannerDerivacionPendiente;

function adminDerivacionPendienteIrPrimera() {
    const pend = pedidosConSolicitudDerivacionPendiente();
    if (!pend.length) {
        toast('No hay solicitudes pendientes.', 'info');
        ocultarBannerDerivacionPendiente();
        return;
    }
    void detalle(pend[0]);
}
window.adminDerivacionPendienteIrPrimera = adminDerivacionPendienteIrPrimera;
window.detalle = detalle;

function actualizarIndicadorSolicitudesDerivacionAdmin() {
    const btn = document.getElementById('btn-derivaciones-pendientes');
    const badge = document.getElementById('badge-derivaciones-pendientes');
    const banner = document.getElementById('admin-banner-derivacion-pendiente');
    const txt = document.getElementById('admin-banner-derivacion-pendiente-txt');
    const esAdm = esAdmin();
    const n = esAdm ? pedidosConSolicitudDerivacionPendiente().length : 0;
    if (btn) btn.style.display = esAdm ? 'inline-flex' : 'none';
    if (badge) {
        badge.style.display = esAdm && n > 0 ? 'inline-block' : 'none';
        badge.textContent = n > 99 ? '99+' : String(n);
    }
    if (banner) banner.style.display = esAdm && n > 0 ? 'flex' : 'none';
    if (txt) {
        txt.textContent =
            n > 0
                ? `${n} solicitud${n === 1 ? '' : 'es'} de derivación pendiente${n === 1 ? '' : 's'} para revisar.`
                : 'Solicitudes de derivación pendientes.';
    }
}

function render() {
    actualizarIndicadorSolicitudesDerivacionAdmin();
    const vis = pedidosVisiblesEnUI();
    const soloAgLista = esAdmin() && document.getElementById('chk-lista-solo-agrupados-incidencia')?.checked;
    const soloDesLista = esAdmin() && document.getElementById('chk-lista-mostrar-desestimados')?.checked;
    const soloDerivLista = esAdmin() && document.getElementById('chk-mostrar-derivados-fuera')?.checked;
    const pasaSoloAgrupadosToolbar = (p) =>
        !soloAgLista || (p.inci != null && Number(p.inci) > 0);
    const cer = vis.filter((p) => {
        if (!pasaSoloAgrupadosToolbar(p)) return false;
        if (soloDesLista) return p.es === 'Desestimado';
        if (soloDerivLista) return pedidoEsDerivadoFuera(p);
        return p.es === 'Cerrado' || p.es === 'Derivado externo';
    }).length;
    const asg = vis.filter((p) => pasaSoloAgrupadosToolbar(p) && (p.es === 'Asignado' || p.es === 'En ejecución')).length;
    const pen = vis.filter((p) => pasaSoloAgrupadosToolbar(p) && p.es === 'Pendiente').length;
    const pcEl = document.getElementById('pc');
    const acEl = document.getElementById('ac');
    const ccEl = document.getElementById('cc');
    if (pcEl) pcEl.textContent = pen;
    if (acEl) acEl.textContent = asg;
    if (ccEl) {
        if (cer > GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS) {
            ccEl.textContent = `${GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS}+`;
            ccEl.title = `${cer} en Cerrados / derivados / desestimados (según filtros); en esta pestaña se listan los ${GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS} resueltos más recientes. Ver el resto en Admin → Históricos.`;
        } else {
            ccEl.textContent = String(cer);
            try {
                ccEl.removeAttribute('title');
            } catch (_) {}
        }
    }

    let fl = tecnicoPideVerTodosPedidosEmpresa()
        ? [...vis]
              .filter((p) => pasaSoloAgrupadosToolbar(p))
              .sort((a, b) => {
                  const ta = a.f ? new Date(a.f).getTime() : 0;
                  const tb = b.f ? new Date(b.f).getTime() : 0;
                  return tb - ta;
              })
        : vis.filter((p) => {
              if (!pasaSoloAgrupadosToolbar(p)) return false;
              if (app.tab === 'p') return p.es === 'Pendiente';
              if (app.tab === 'a') return p.es === 'Asignado' || p.es === 'En ejecución';
              if (soloDesLista) return p.es === 'Desestimado';
              if (soloDerivLista) return pedidoEsDerivadoFuera(p);
              return p.es === 'Cerrado' || p.es === 'Derivado externo';
          });
    if (!tecnicoPideVerTodosPedidosEmpresa() && app.tab === 'c' && Array.isArray(fl) && fl.length > GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS) {
        fl = [...fl]
            .sort((a, b) => tsResolucionPedidoMs(b) - tsResolucionPedidoMs(a))
            .slice(0, GN_MAX_HISTORICOS_EN_PANEL_PEDIDOS);
    }
    if ((app.tab === 'p' || app.tab === 'a') && typeof window._gnPriorizarPedidosBp2 === 'function') {
        fl = window._gnPriorizarPedidosBp2(fl);
    }
    const c = document.getElementById('pl');
    c.innerHTML = '';
    
    if (!fl.length) {
        c.innerHTML = '<div class="ll2"><i class="fas fa-inbox"></i> Sin pedidos</div>';
        try { llenarSelectsFiltroMapa(); } catch (_) {}
        renderMk();
        return;
    }
    
    const bC = {
        'Crítica': '#ef4444',
        'Alta': '#f97316',
        'Media': '#eab308',
        'Baja': '#3b82f6'
    };
    
    const eC = {
        'Pendiente': 'ep',
        'Asignado': 'ea',
        'En ejecución': 'ee',
        'Cerrado': 'ec',
        'Derivado externo': 'edex',
        Desestimado: 'edes',
    };
    
    const pC = {
        'Crítica': 'pc2',
        'Alta': 'pa',
        'Media': 'pm',
        'Baja': 'pb'
    };
    
    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    
    fl.forEach(p => {
        const d = document.createElement('div');
        d.className = 'pi';
        try {
            d.dataset.gnNp = p.np != null && String(p.np).trim() !== '' ? String(p.np).trim() : '';
        } catch (_) {}
        d.style.borderLeftColor = bC[p.pr] || '#3b82f6';
        d.addEventListener('click', () => void detalle(p));
        
        const f = p.f ? new Date(p.f).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, ...tz }) : '';
        
        d.innerHTML = `
            <div class="ph2">
                <span class="pn">#${p.np}${p._offline ? '<span class="offline-tag">LOCAL</span>' : ''}</span>
                <span class="ph2-actions">
                    ${esAdmin() && p.es === 'Pendiente' ? `<button type="button" class="gn-pi-desest" data-gn-desestimar-pid="${String(p.id).replace(/"/g, '')}" title="Desestimar reclamo" aria-label="Desestimar">🚫</button>` : ''}
                    <span class="pe ${eC[p.es] || ''}">${p.es}</span>
                </span>
            </div>
            <div class="pi2">
                ${p.dis}${(p.cnom || p.cl) ? ' - ' + String(p.cnom || p.cl) : ''}${p.nis ? ' · ' + etiquetaIdentificadorPedidoLista() + ' ' + String(p.nis).substring(0, 14) + (String(p.nis).length > 14 ? '…' : '') : ''}
                <span style="float:right;color:#94a3b8">${f}</span>
            </div>
            <div class="pd">${p.de.substring(0,70)}${p.de.length > 70 ? '…' : ''}</div>
            <span class="pt2 ${pC[p.pr] || ''}">${p.pr}</span>
            <div class="pav">
                <div class="ab" style="width:${p.av}%"></div>
            </div>
        `;
        c.appendChild(d);
    });
    
    try { llenarSelectsFiltroMapa(); } catch (_) {}
    renderMk();
}


function limpiarFotosYPreviewNuevoPedido() {
    fotosTemporales = [];
    try { actualizarVistaPreviaFotos(); } catch (_) {}
}

/** Cierra modales `.mo` excepto los ids indicados (p. ej. detalle `#dm` abierto detrás de avance/cierre). */
function cerrarModalesMoSalvo(keepIds) {
    const keep = new Set((keepIds || []).map((id) => String(id || '').trim()).filter(Boolean));
    const forzarPw = document.getElementById('modal-forzar-cambio-pw');
    document.querySelectorAll('.mo').forEach((m) => {
        const id = m.id || '';
        if (keep.has(id)) return;
        if (m === forzarPw && window._pendingAndroidPasswordChange) return;
        m.classList.remove('active');
    });
}

function closeAll() {
    try {
        gnRequestClearGotoPreviewMarker();
    } catch (_) {}
    const dmAntes = document.getElementById('dm')?.classList.contains('active');
    const forzarPw = document.getElementById('modal-forzar-cambio-pw');
    document.getElementById('modal-dashboard-gerencia')?.classList.remove('modal-dash--maximized');
    syncDashboardModalMaxButtons();
    document.querySelectorAll('.mo').forEach(m => {
        if (m === forzarPw && window._pendingAndroidPasswordChange) return;
        m.classList.remove('active');
    });
    if (dmAntes) {
        try {
            gnMapThrottleOnDetallePedidoClosed();
        } catch (_) {}
        try {
            disconnectPedidoVerImagenDetalleObserver();
        } catch (_) {}
        try {
            _gnRestaurarPanelPedidosTrasCerrarDetalleAndroid();
        } catch (_) {}
        try {
            const ap = document.getElementById('admin-panel');
            const tab = window.__gnAdminReopenTabTrasDetalle;
            if (ap && ap.classList.contains('active') && tab && typeof window !== 'undefined' && typeof window.adminTab === 'function') {
                window.__gnAdminReopenTabTrasDetalle = null;
                window.adminTab(tab);
            }
        } catch (_) {}
    }
    app.cid = null;
    try {
        const dm = document.getElementById('dm');
        if (dm) delete dm.dataset.detallePedidoId;
    } catch (_) {}
    try {
        delete window.__gnDetallePedidoActivo;
    } catch (_) {}
    document.getElementById('pf').reset();
    try {
        resetDerivacionTerceroNuevoPedidoUI();
    } catch (_) {}
    limpiarFotosYPreviewNuevoPedido();
    try {
        resetPadronNuevoPedidoNisTimers();
    } catch (_) {}
    try {
        resetPedidoNuevoOficinaUi();
    } catch (_) {}
    const nisEl = document.getElementById('nis');
    if (nisEl) nisEl.value = '';
    document.getElementById('dc').textContent = '0';
    try { syncNisClienteReclamoConexionUI(); } catch (_) {}
    try { syncPrioridadConTipoReclamo(); } catch (_) {}
    ['ped-cli-calle','ped-cli-num','ped-cli-loc','ped-cli-ref'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['chk-epp','chk-corte','chk-senal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    try { limpiarFirmaCierreCanvas(); } catch (_) {}
    
    fotoCierreTemp = null;
    const vpc = document.getElementById('vista-previa-foto-cierre');
    if (vpc) vpc.innerHTML = '';
    const ui = document.getElementById('ui');
    if (ui) {
        ui.innerHTML = '<i class="fas fa-crosshairs"></i> Hacé clic en el mapa para seleccionar';
        ui.className = 'ud';
    }
}

window.__gnCerrarModalPedidoDetalleSiAbierto = () => {
    try {
        if (document.getElementById('dm')?.classList.contains('active')) closeAll();
    } catch (_) {}
};

function togglePanel() {
    document.getElementById('bp2').classList.toggle('col');
}

/** #mt / abrirWizardMarcaEmpresaManual: ver modules/gn-tenant-solo-tecnico-ui.js */

async function confirmarPasswordYAbrirSetupSaaSWizard() {
    document.getElementById('modal-admin-verify-pw-setup-saas')?.classList.remove('active');
    toast(
        'La configuración de marca y tenant del negocio solo se abre con la clave técnica del servidor (GESTORNOVA_TECHNICIAN_TENANT_KEY), no con la contraseña de administrador.',
        'info'
    );
    if (typeof window.gnAbrirWizardTenantUnificado === 'function') {
        void window.gnAbrirWizardTenantUnificado();
    } else if (typeof window.gnSolicitarAccesoTecnicoYAbrirWizardConfig === 'function') {
        void window.gnSolicitarAccesoTecnicoYAbrirWizardConfig();
    }
}
window.confirmarPasswordYAbrirSetupSaaSWizard = confirmarPasswordYAbrirSetupSaaSWizard;

async function abrirWizardMarcaEmpresaManualTrasPassword() {
    try {
        await cargarConfigEmpresa();
        await asegurarJwtApiRest();
        const token = getApiToken();
        if (token) {
            const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                const cli = data?.cliente || {};
                let extra = cli?.configuracion || {};
                if (typeof extra === 'string') {
                    try {
                        extra = JSON.parse(extra);
                    } catch (_) {
                        extra = {};
                    }
                }
                const ep = extra && typeof extra === 'object' ? extra : {};
                const nom = String(cli.nombre || '').trim();
                window.EMPRESA_CFG = {
                    ...(window.EMPRESA_CFG || {}),
                    ...(nom ? { nombre: nom } : {}),
                    ...(Object.prototype.hasOwnProperty.call(cli || {}, 'tipo') && String(cli.tipo ?? '').trim()
                        ? { tipo: String(cli.tipo).trim() }
                        : {}),
                    ...(String(ep.logo_url || '').trim() ? { logo_url: String(ep.logo_url).trim() } : {})
                };
                if (ep.lat_base != null && Number.isFinite(Number(ep.lat_base))) {
                    window.EMPRESA_CFG.lat_base = String(ep.lat_base);
                }
                if (ep.lng_base != null && Number.isFinite(Number(ep.lng_base))) {
                    window.EMPRESA_CFG.lng_base = String(ep.lng_base);
                }
                primeWizardCoordsFromEp(ep);
            }
        }
    } catch (e) {
        console.warn('[wizard-marca-manual]', e?.message || e);
    }
    resetWizardLogoBufferForManualOpen();
    setWizardManualContext(true);
    mostrarModalConfigInicial();
}
window.abrirWizardMarcaEmpresaManualTrasPassword = abrirWizardMarcaEmpresaManualTrasPassword;

function switchTab(t) {
    app.tab = t;
    document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    render();
}


document.querySelector('#ph .gn-bp2-plegar-trigger')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (window.__bp2DragJustEnded) return;
    togglePanel();
});

function cerrarUserMenuPop() {
    const pop = document.getElementById('user-menu-pop');
    if (pop) {
        pop.classList.remove('user-menu-pop-open');
        pop.setAttribute('aria-hidden', 'true');
    }
}

function toggleUserMenuPop() {
    const pop = document.getElementById('user-menu-pop');
    if (!pop) return;
    const open = pop.classList.toggle('user-menu-pop-open');
    pop.setAttribute('aria-hidden', open ? 'false' : 'true');
}

document.addEventListener(
    'click',
    (e) => {
        if (e.target.closest('#user-menu-wrap')) return;
        cerrarUserMenuPop();
    },
    false
);

document.getElementById('ub')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleUserMenuPop();
});

function ejecutarCerrarSesion() {
    invalidarCachesMultitenantSesionYOAdminUI();
    detenerKeepAlive();
    detenerTracking();
    detenerDashboardGerenciaPoll();
    try {
        cerrarModalDashboardGerencia();
    } catch (_) {}
    detenerPollWhatsappHumanChat();
    destruirTodasVentanasWaHc();
    detenerTecnicosMapaPrincipalPoll();
    detenerPollSincroPedidosTecnico();
    _dashCierresInit = false;
    _seenClosedIds.clear();
    try {
        if (window.AndroidSession && typeof AndroidSession.clearUser === 'function') AndroidSession.clearUser();
    } catch (_) {}
    detenerSyncCatalogos();
    limpiarEstadoMapaSesion();
    localStorage.removeItem('pmg');
    localStorage.removeItem('pmg_api_token');
    try {
        clearAuthLoginTenantHint();
    } catch (_) {}
    try {
        localStorage.removeItem(PMG_LAST_ACTIVITY_TS_KEY);
    } catch (_) {}
    app.apiToken = null;
    app.u = null;
    try {
        clearGnTenantTechSession();
    } catch (_) {}
    try {
        localStorage.removeItem(PMG_BRANDING_LS_KEY);
    } catch (_) {}
    try {
        resetBrandingSesionNoAutenticada();
    } catch (_) {}
    try {
        pintarCabeceraLoginWizardGenerica();
    } catch (_) {}
    mapaInicializado = false;
    _mapLazyQueued = false;
    if (app.map) {
        app.map.remove();
        app.map = null;
    }
    try {
        app.p = [];
    } catch (_) {}
    _marcadoresTecnicosPrincipal = [];
    const btnAdm = document.getElementById('btn-admin');
    if (btnAdm) btnAdm.style.display = 'none';
    try {
        gnGeocodeAdminLogSyncDockVisibility();
    } catch (_) {}
    const btnDg = document.getElementById('btn-dashboard-gerencia');
    if (btnDg) btnDg.style.display = 'none';
    const btnDerivPend = document.getElementById('btn-derivaciones-pendientes');
    if (btnDerivPend) btnDerivPend.style.display = 'none';
    const badgeDerivPend = document.getElementById('badge-derivaciones-pendientes');
    if (badgeDerivPend) badgeDerivPend.style.display = 'none';
    ocultarBannerDerivacionPendiente();
    const mapDashCard = document.getElementById('mapa-card-dashboard');
    if (mapDashCard) mapDashCard.style.display = 'none';
    const wvt = document.getElementById('wrap-toggle-ver-todos');
    if (wvt) wvt.style.display = 'none';
    const wdf = document.getElementById('wrap-chk-derivados-fuera');
    if (wdf) wdf.style.display = 'none';
    const wdes = document.getElementById('wrap-chk-desestimados-lista');
    if (wdes) wdes.style.display = 'none';
    cerrarAdminPanel();
    document.getElementById('gw')?.classList.remove('active');
    document.getElementById('ls').classList.add('active');
    document.getElementById('ms').classList.remove('active');
    try {
        document.body.classList.remove('gn-sesion-activa');
    } catch (_) {}
    try {
        actualizarVisibilidadBotonTenantTecnicoLogin();
    } catch (_) {}
    try {
        localStorage.removeItem('gestornova_saved_login');
        const emEl = document.getElementById('em');
        const pwEl = document.getElementById('pw');
        if (emEl) emEl.value = '';
        if (pwEl) pwEl.value = '';
    } catch (_) {}
    cerrarUserMenuPop();
}

/** Tras primer ingreso bootstrap: vuelve al login con usuario prefilled (sin confirm). */
window.__gnCerrarSesionTrasPrimerIngreso = function __gnCerrarSesionTrasPrimerIngreso(prefillUsuario) {
    ejecutarCerrarSesion();
    if (prefillUsuario) {
        const emEl = document.getElementById('em');
        if (emEl) emEl.value = String(prefillUsuario).trim();
    }
};

/**
 * Tras persistir en servidor un cambio de línea de negocio: vacía catálogo socios del tenant (sin confirmaciones), cierra sesión, vacía storage y recarga.
 * Evita datos residuales (filtros mapa, listas en memoria). Borra también cola offline en localStorage.
 */
async function logoutYLimpiarClienteTrasRubroPersistidoEnServidor() {
    try {
        if (typeof offlineQueue === 'function' && offlineQueue().length > 0) {
            alert(
                'Hay pedidos en cola offline sin sincronizar. Al cambiar el rubro se borrará el almacenamiento local de este navegador (incluida esa cola). Sincronizá antes si podés; se cerrará la sesión ahora.'
            );
        }
    } catch (_) {}
    try {
    } catch (_) {}
    try {
        ejecutarCerrarSesion();
    } catch (_) {}
    try {
        sessionStorage.clear();
    } catch (_) {}
    try {
        localStorage.clear();
    } catch (_) {}
    try {
        const url = window.location.pathname + window.location.search;
        window.location.href = url || '/';
    } catch (_) {
        try {
            window.location.reload();
        } catch (_) {}
    }
}

function confirmarCerrarSesionDesdeMenu() {
    cerrarUserMenuPop();
    if (confirm('¿Cerrar sesión?')) ejecutarCerrarSesion();
}
window.confirmarCerrarSesionDesdeMenu = confirmarCerrarSesionDesdeMenu;

function abrirModalMiCuentaDesdeMenu() {
    cerrarUserMenuPop();
    if (modoOffline || !NEON_OK) {
        toast('Cambiar cuenta requiere conexión (no está disponible en modo offline).', 'warning');
        return;
    }
    const tok = getApiToken() || app.apiToken;
    if (!tok || !app.u) {
        toast('No hay sesión activa con token de API.', 'error');
        return;
    }
    const m = document.getElementById('modal-mi-cuenta');
    const n = document.getElementById('micuenta-nombre');
    const em = document.getElementById('micuenta-email');
    const pa = document.getElementById('micuenta-pw-actual');
    const p1 = document.getElementById('micuenta-pw-nueva');
    const p2 = document.getElementById('micuenta-pw-nueva2');
    const msg = document.getElementById('micuenta-msg');
    if (n) n.value = String(app.u.nombre || '').trim();
    if (em) em.value = String(app.u.email || '').trim();
    if (pa) pa.value = '';
    if (p1) p1.value = '';
    if (p2) p2.value = '';
    if (msg) {
        msg.textContent = '';
        msg.style.color = '';
    }
    m?.classList.add('active');
}
window.abrirModalMiCuentaDesdeMenu = abrirModalMiCuentaDesdeMenu;

async function guardarMiCuentaUsuario() {
    const msg = document.getElementById('micuenta-msg');
    const setErr = (t) => {
        if (msg) {
            msg.textContent = t;
            msg.style.color = 'var(--re)';
        }
    };
    if (modoOffline) {
        setErr('No disponible en modo offline.');
        return;
    }
    const tok = getApiToken() || app.apiToken;
    if (!tok || !app.u) {
        setErr('Sesión no válida.');
        return;
    }
    const n = document.getElementById('micuenta-nombre');
    const em = document.getElementById('micuenta-email');
    const pa = document.getElementById('micuenta-pw-actual');
    const p1 = document.getElementById('micuenta-pw-nueva');
    const p2 = document.getElementById('micuenta-pw-nueva2');
    const nombre = (n?.value || '').trim();
    const usuario = (em?.value || '').trim().toLowerCase();
    const password_actual = pa?.value || '';
    const password_nueva = (p1?.value || '').trim();
    const password_nueva2 = (p2?.value || '').trim();
    if (!password_actual) {
        setErr('La contraseña actual es obligatoria.');
        return;
    }
    if (password_nueva && password_nueva !== password_nueva2) {
        setErr('Las contraseñas nuevas no coinciden.');
        return;
    }
    if (!usuario) {
        setErr('El nombre de usuario no puede quedar vacío.');
        return;
    }
    const body = { password_actual, nombre, usuario };
    if (password_nueva) body.password_nueva = password_nueva;
    const btn = document.getElementById('btn-micuenta-guardar');
    if (btn) {
        btn.disabled = true;
        btn.dataset._html = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Guardando…';
    }
    try {
        const resp = await fetch(apiUrl('/api/auth/me'), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            setErr(data.error || data.detail || 'No se pudo actualizar.');
            return;
        }
        if (data.user) {
            app.u.nombre = data.user.nombre || app.u.nombre;
            app.u.email = data.user.email || app.u.email;
            try {
                localStorage.setItem('pmg', JSON.stringify(app.u));
            } catch (_) {}
            try {
                actualizarBarraHeaderSesion();
            } catch (_) {}
        }
        toast('Datos actualizados.', 'success');
        document.getElementById('modal-mi-cuenta')?.classList.remove('active');
        if (pa) pa.value = '';
        if (p1) p1.value = '';
        if (p2) p2.value = '';
    } catch (e) {
        setErr(e?.message || 'Error de red.');
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btn.dataset._html) btn.innerHTML = btn.dataset._html;
        }
    }
}
window.guardarMiCuentaUsuario = guardarMiCuentaUsuario;

function logout() {
    if (confirm('¿Cerrar sesión?')) ejecutarCerrarSesion();
}

document.querySelectorAll('.tb').forEach(b => {
    b.addEventListener('click', () => {
        if (b.dataset.tab) switchTab(b.dataset.tab);
    });
});

document.getElementById('toggle-ver-todos-pedidos')?.addEventListener('change', function () {
    try {
        localStorage.setItem('pmg_tecnico_ver_todos', this.checked ? '1' : '0');
    } catch (_) {}
    const sel = document.getElementById('sel-android-pedidos-scope');
    if (sel) sel.value = this.checked ? 'todos' : 'asignados';
    if (esTecnicoOSupervisor() && !modoOffline && NEON_OK) void cargarPedidos();
});

initPedidosToolbarFiltrosExclusivos(() => {
    try {
        render();
    } catch (_) {}
});

document.getElementById('eb').addEventListener('click', () => {
    const soloAg = esAdmin() && document.getElementById('chk-lista-solo-agrupados-incidencia')?.checked;
    const soloDes = esAdmin() && document.getElementById('chk-lista-mostrar-desestimados')?.checked;
    const soloDeriv = esAdmin() && document.getElementById('chk-mostrar-derivados-fuera')?.checked;
    const pasaAg = (p) => !soloAg || (p.inci != null && Number(p.inci) > 0);
    const flt = (p) => {
        if (!pasaAg(p)) return false;
        if (app.tab === 'p') return p.es === 'Pendiente';
        if (app.tab === 'a') return p.es === 'Asignado' || p.es === 'En ejecución';
        if (soloDes) return p.es === 'Desestimado';
        if (soloDeriv) return pedidoEsDerivadoFuera(p);
        return p.es === 'Cerrado' || p.es === 'Derivado externo';
    };
    exportPedido(
        pedidosVisiblesEnUI().filter(flt),
        'pedidos_' + app.tab + '_' + new Date().toISOString().slice(0,10)
    );
});



function _gnOnClickCloseModalButton(ev) {
    const b = ev.currentTarget;
    const mo = b && b.closest ? b.closest('.mo') : null;
    const idMo = mo && mo.id ? String(mo.id) : '';
    const dm = document.getElementById('dm');
    const dmOpen = !!dm?.classList.contains('active');
    if (idMo === 'cm2' && dmOpen) {
        document.getElementById('cm2')?.classList.remove('active');
        return;
    }
    closeAll();
}

document.querySelectorAll('.cm').forEach(b => b.addEventListener('click', _gnOnClickCloseModalButton));
document.querySelectorAll('.cm2').forEach(b => b.addEventListener('click', _gnOnClickCloseModalButton));

document.getElementById('de').addEventListener('input', function() {
    document.getElementById('dc').textContent = this.value.length;
});

document.getElementById('tr').addEventListener('input', function() {
    document.getElementById('tc').textContent = this.value.length;
});


document.getElementById('ui').addEventListener('click', () => {
    closeAll();
    toast('Hacé clic en el mapa para seleccionar la ubicación', 'info');
});


const sd = document.getElementById('di2');
[...new Set(DIST.map(d => d.g))].forEach(g => {
    const og = document.createElement('optgroup');
    og.label = g;
    DIST.filter(d => d.g === g).forEach(d => {
        const o = document.createElement('option');
        o.value = d.v;
        o.textContent = d.l;
        og.appendChild(o);
    });
    sd.appendChild(og);
});

poblarSelectTiposReclamo();
try {
    initDerivacionesTercerosNuevoPedido();
} catch (_) {}

function tipoTrabajoRequiereNisYCliente() {
    return tipoReclamoRequiereNisYCliente(document.getElementById('tt')?.value || '');
}

function tipoReclamoRequiereNisYCliente(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    if (tipoReclamoEsFraudeAnonimo(v)) return false;
    if (!v) return false;
    if (v === 'Reclamo de Cliente' || v === 'Conexión Nueva') return true;
    if (v.includes('Conexión Nueva')) return true;
    if (v.includes('Consumo elevado')) return true;
    if (v === 'Problemas de Tensión') return true;
    if (v.toLowerCase().includes('factibilidad')) return true;
    return false;
}

function tipoReclamoSoloNisSinNombreCliente(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    return v === 'Problemas de Tensión' || v === 'Consumo elevado';
}

function tipoReclamoRequiereNombreClienteEnFormulario(tipoTrabajo) {
    return tipoReclamoRequiereNisYCliente(tipoTrabajo) && !tipoReclamoSoloNisSinNombreCliente(tipoTrabajo);
}

/** Tipos de trabajo de factibilidad: sin carga ni edición de materiales (cualquier origen). */
function esTipoPedidoFactibilidad(tipoTrabajo) {
    return String(tipoTrabajo || '').trim().toLowerCase().includes('factibilidad');
}

/** Pedidos donde no se gestionan materiales (detalle, impresión, APIs UI). */
function tipoPedidoExcluyeMateriales(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    if (!v) return false;
    if (v === 'Otros') return true;
    if (esTipoPedidoFactibilidad(v)) return true;
    return false;
}

function syncNisClienteReclamoConexionUI() {
    const req = tipoTrabajoRequiereNisYCliente();
    const esMunicipio = String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio';
    syncPedidoFormNisYClienteLabels({ requiereNis: req, esMunicipio });
}
const st = document.getElementById('tt');
if (st) {
    st.addEventListener('change', () => {
        syncNisClienteReclamoConexionUI();
        syncSuministroElectricoUI();
    });
}
syncNisClienteReclamoConexionUI();
syncSuministroElectricoUI();
try { syncZonaPedidoFormLabels(); } catch (_) {}

function esCooperativaElectricaRubro() {
    return normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) === 'cooperativa_electrica';
}

function pedidoSugiereDerivacionAguaOMunicipioEnElectrica(tt) {
    const t = String(tt || '').trim();
    return TIPOS_TRABAJO_DERIVACION_SOLO_AGUA.has(t) || TIPOS_TRABAJO_DERIVACION_SOLO_MUNICIPIO.has(t);
}

function normalizarWhatsappInternacionalWaMeUrl(raw) {
    const s = String(raw ?? '').trim();
    if (!/^\+\d{8,22}$/.test(s)) return '';
    return 'https://wa.me/' + s.slice(1);
}

function syncDerivacionesTercerosWrap() {
    const apply = () => {
        const w = document.getElementById('admin-derivacion-terceros-wrap');
        if (!w) return;
        w.style.removeProperty('display');
        w.style.display = '';
        w.style.removeProperty('visibility');
    };
    apply();
    try {
        queueMicrotask(apply);
        setTimeout(apply, 0);
    } catch (_) {}
}

/**
 * Tras cambio de nombre/tipo de emisor (misma sesión WebView), evita mezclar datos de otro rubro/tenant.
 * No borra todo sessionStorage: solo claves de borradores de derivación y caches de mapa/socios en memoria.
 */
function invalidarCachesTrasCambioIdentidadTenant() {
    try {
        if (window._pedidoCoordsInferidas && typeof window._pedidoCoordsInferidas === 'object') {
            for (const k of Object.keys(window._pedidoCoordsInferidas)) {
                try {
                    delete window._pedidoCoordsInferidas[k];
                } catch (_) {}
            }
        }
    } catch (_) {}
    try {
        window._sociosVirtualRows = null;
    } catch (_) {}
    try {
        localStorage.removeItem(WEB_MAP_FILTRO_TIPOS_KEY);
    } catch (_) {}
    try {
        const toDel = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (!k) continue;
            if (k.indexOf('gn-admin-deriv-motivo-') === 0 || k.indexOf('gn-tec-deriv-motivo-') === 0) toDel.push(k);
        }
        toDel.forEach((k) => {
            try {
                sessionStorage.removeItem(k);
            } catch (_) {}
        });
    } catch (_) {}
    try {
        invalidatePedidosTenantSqlCache();
    } catch (_) {}
}

/** Vacía checkboxes/inputs del bloque derivaciones (mismo alcance que reset por cambio de tenant). */
function vaciarDerivacionesTercerosFormularioAdmin() {
    try {
        const wrap = document.getElementById('admin-derivacion-terceros-wrap');
        if (!wrap) return;
        wrap.querySelectorAll('input:not([type="button"]):not([type="submit"]), textarea').forEach((el) => {
            const id = el.id || '';
            if (!id.startsWith('cfg-deriv-') && id !== 'cfg-ocultar-modulos-redes') return;
            if (el.type === 'checkbox') el.checked = false;
            else el.value = '';
        });
        const irr = document.getElementById('cfg-deriv-internet-rows');
        const tvr = document.getElementById('cfg-deriv-tv-rows');
        if (irr) irr.innerHTML = '';
        if (tvr) tvr.innerHTML = '';
        try {
            setDerivacionesInlineError('');
        } catch (_) {}
        try {
            actualizarBotonesWhatsappDerivacionesUi();
        } catch (_) {}
    } catch (_) {}
}

/**
 * Arma `configuracion.derivacion_reclamos` desde el formulario admin (cfg-deriv-*).
 * @throws {Error} mensaje para toast / inline
 */
function construirDerivacionReclamosDesdeFormularioDerivaciones() {
    return construirDerivacionReclamosDesdeFormularioDerivacionesCompleto(normalizarWhatsappInternacionalDesdeInput);
}

function setDerivacionesInlineError(msg) {
    const el = document.getElementById('cfg-deriv-inline-error');
    if (!el) return;
    if (!msg) {
        el.textContent = '';
        el.style.display = 'none';
        return;
    }
    el.textContent = msg;
    el.style.display = '';
}
window.setDerivacionesInlineError = setDerivacionesInlineError;

// ── TRACKING DE UBICACIÓN (WebView ~2 min · navegador 15 min) — antes del restore de sesión ──
let _trackingInterval = null;

async function iniciarTracking() {
    if (_trackingInterval) return; // ya está corriendo
    const enviarUbicacion = async () => {
        if (!app.u || !navigator.geolocation || modoOffline || !NEON_OK) return;
        navigator.geolocation.getCurrentPosition(async pos => {
                try {
                const { latitude, longitude, accuracy } = pos.coords;
                registrarFajaInstalacionSiFalta(longitude);
                await sqlSimple(`INSERT INTO ubicaciones_usuarios(usuario_id, lat, lng, precision_m, timestamp)
                    VALUES(${esc(app.u.id)}, ${esc(latitude)}, ${esc(longitude)}, ${esc(Math.round(accuracy))}, NOW())`);
                // Limpiar registros viejos de este usuario (más de 2 horas)
                await sqlSimple(`DELETE FROM ubicaciones_usuarios WHERE usuario_id = ${esc(app.u.id)} AND timestamp < NOW() - INTERVAL '2 hours'`);
                await intentarAutoInicioEjecucionTecnico(latitude, longitude);
            } catch(e) { console.warn('[tracking]', e.message); }
        }, () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    };
    const intervaloMs = esAndroidWebViewMapa() ? 120000 : 15 * 60 * 1000;
    enviarUbicacion();
    _trackingInterval = setInterval(enviarUbicacion, intervaloMs);
    console.log('[tracking] iniciado');
}

function detenerTracking() {
    if (_trackingInterval) { clearInterval(_trackingInterval); _trackingInterval = null; }
    if (_watchId && navigator.geolocation) {
        try { navigator.geolocation.clearWatch(_watchId); } catch(_) {}
    }
    _watchId = null;
}
window.detenerTracking = detenerTracking;

(function limpiarSesionSiActualizoApkAndroid() {
    try {
        if (window.AndroidConfig && typeof AndroidConfig.getVersionCode === 'function') {
            const vc = AndroidConfig.getVersionCode();
            const key = 'pmg_stored_app_version_code';
            const prevRaw = localStorage.getItem(key);
            if (prevRaw != null && prevRaw !== '') {
                const prev = parseInt(prevRaw, 10);
                if (Number.isFinite(prev) && prev > 0 && vc !== prev) {
                    localStorage.removeItem('pmg');
                    localStorage.removeItem('pmg_api_token');
                    app.apiToken = null;
                    try {
                        if (window.AndroidSession && typeof AndroidSession.clearUser === 'function') {
                            AndroidSession.clearUser();
                        }
                    } catch (_) {}
                }
            }
            localStorage.setItem(key, String(vc));
        }
    } catch (_) {}
})();

try {
    const s = localStorage.getItem('pmg');
    try {
        const tk = localStorage.getItem('pmg_api_token');
        if (tk) app.apiToken = tk;
    } catch (_) {}
    if (s) {
        if (sesionSuperaInactividadMaxima()) {
            try {
                toast('Sesión cerrada por inactividad (más de 15 min). Iniciá sesión de nuevo.', 'info');
            } catch (_) {}
            try {
                ejecutarCerrarSesion();
            } catch (_) {}
        } else {
        app.u = JSON.parse(s);
        app.u.rol = normalizarRolStr(app.u.rol);
        try {
            localStorage.setItem('pmg', JSON.stringify(app.u));
        } catch (_) {}
        try {
            actualizarBarraHeaderSesion();
        } catch (_) {}
        const btnAdm = document.getElementById('btn-admin');
        if (btnAdm) btnAdm.style.display = esAdmin() ? 'flex' : 'none';
        try {
            gnGeocodeAdminLogSyncDockVisibility();
        } catch (_) {}
        const btnDash2 = document.getElementById('btn-dashboard-gerencia');
        if (btnDash2) btnDash2.style.display = esAdmin() ? 'flex' : 'none';
        const btnDerivPend2 = document.getElementById('btn-derivaciones-pendientes');
        if (btnDerivPend2) btnDerivPend2.style.display = esAdmin() ? 'inline-flex' : 'none';
        const mapDashCard2 = document.getElementById('mapa-card-dashboard');
        if (mapDashCard2) mapDashCard2.style.display = esAdmin() ? 'block' : 'none';
        const wrapTog2 = document.getElementById('wrap-toggle-ver-todos');
        const chkTod2 = document.getElementById('toggle-ver-todos-pedidos');
        if (wrapTog2 && chkTod2) {
            wrapTog2.style.display = esTecnicoOSupervisor() ? 'inline-flex' : 'none';
            chkTod2.checked = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
        }
        ['wrap-chk-derivados-fuera', 'wrap-chk-desestimados-lista', 'wrap-chk-solo-agrupados-incidencia'].forEach(
            (wid) => {
                const w = document.getElementById(wid);
                if (w) w.style.display = esAdmin() ? 'inline-flex' : 'none';
            }
        );
        try {
            syncPedidosToolbarFiltrosExclusivosFromLs(esAdmin());
        } catch (_) {}
        try {
            if (window.AndroidSession && typeof AndroidSession.setUser === 'function') {
                AndroidSession.setUser(parseInt(app.u.id, 10) || 0, String(app.u.rol || ''));
            }
            if (window.AndroidSession && typeof AndroidSession.setTenantId === 'function') {
                AndroidSession.setTenantId(tenantIdActual());
            }
        } catch (_) {}
        if (esAdmin()) {
            iniciarDashboardGerenciaPoll();
            iniciarPollWhatsappHumanChat();
            detenerPollSincroPedidosTecnico();
        } else {
            detenerDashboardGerenciaPoll();
            detenerPollWhatsappHumanChat();
            destruirTodasVentanasWaHc();
            detenerTecnicosMapaPrincipalPoll();
            iniciarPollSincroPedidosTecnico();
            detenerPollBannerReclamoCliente();
        }
        document.getElementById('ls').classList.remove('active');
        document.getElementById('ms').classList.add('active');
        try {
            document.body.classList.add('gn-sesion-activa');
        } catch (_) {}
        try {
            actualizarVisibilidadBotonTenantTecnicoLogin();
        } catch (_) {}
        try {
            syncVisibilidadBotonPedidoOficina();
        } catch (_) {}
        resetPreferenciasPanelesInicioCerrados();
        try { aplicarUIMapaPlataforma(); } catch (_) {}
        try { initWebCoordsConverterBar(); } catch (_) {}
        setupMapLazyWhenVisibleOnce();
        scheduleGnMapLayoutBumpsTrasLogin();
        iniciarKeepAlive();
        iniciarTracking();
        iniciarPollNotifMovil();
        iniciarSyncCatalogos();
        actualizarBadgeOffline();
        setTimeout(async () => {
            
            solicitarPermisos();
            setupMapLazyWhenVisibleOnce();
            await asegurarJwtApiRest();
            try {
                await sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true });
            } catch (_) {}
            if (!modoOffline) {
                const cfgLista = await verificarConfiguracionInicialObligatoria();
                if (!cfgLista) return;
                await cargarConfigEmpresa();
            }
            await cargarPedidos();
            if (esAdmin()) iniciarPollBannerReclamoCliente();
            
            if (!modoOffline && offlineQueue().length > 0) {
                setTimeout(sincronizarOffline, 2000);
            }
            await consumirPedidoPendienteDesdeNotif();
        }, 200);
        }
    }
} catch(_) {}


const xscript = document.createElement('script');
xscript.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
xscript.onerror = () => console.log('XLSX no disponible - se usará CSV');
document.head.appendChild(xscript);


async function cargarDistribuidores() {
    try {
        DIST = await cargarSelectDi2Distribuidores({
            esCooperativaElectricaRubro,
            etiquetaZonaPedido,
            sqlSimpleSelectAllPages,
            sqlSimple,
            sqlWhereDistribuidoresPorTenantOUsadosEnPedidos,
            tenantIdActual,
            esc,
        });
    } catch (e) {
        console.warn('No se pudieron cargar distribuidores:', e.message);
    }
}
if (typeof window !== 'undefined') window.cargarDistribuidores = cargarDistribuidores;

async function cargarConfigEmpresa() {
    try {
        let empresaConfigEsGlobalMultitenant = false;
        try {
            empresaConfigEsGlobalMultitenant = await neonPedidosTieneColumnaTenantId();
        } catch (_) {}
        if (empresaConfigEsGlobalMultitenant) {
            invalidatePedidosTenantSqlCache();
        }
        const r = await sqlSimple("SELECT clave, valor FROM empresa_config");
        const sqlCfg = {};
        (r.rows || []).forEach(row => {
            sqlCfg[row.clave] = row.valor;
        });
        if (empresaConfigEsGlobalMultitenant) {
            for (const k of ['nombre', 'tipo', 'logo_url', 'active_business_type', 'empresa_identidad_bloqueada']) {
                delete sqlCfg[k];
            }
        }
        // Gana la BD (clave/valor) sobre memoria; identidad nombre/tipo/logo en multitenant viene de `clientes` vía refrescarEmpresa…
        window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), ...sqlCfg };
        if (NEON_OK && app?.u) {
            try {
                await refrescarEmpresaDesdeClienteNeonPorTenantActual();
            } catch (_) {}
        }
        if (!String(window.EMPRESA_CFG.tipo || '').trim() && NEON_OK) {
            try {
                const tid = tenantIdActual();
                const cr = await sqlSimple(`SELECT tipo FROM clientes WHERE id = ${esc(tid)} LIMIT 1`);
                const trow = cr.rows?.[0];
                if (trow && String(trow.tipo || '').trim()) {
                    const t = String(trow.tipo).trim();
                    window.EMPRESA_CFG.tipo = t;
                    window.__PMG_TENANT_BRANDING__ = { ...(window.__PMG_TENANT_BRANDING__ || {}), tipo: t };
                    syncEmpresaCfgNombreLogoDesdeMarca();
                }
            } catch (_) {}
        }
        if (!empresaConfigEsGlobalMultitenant) {
            ensureBrandingFromLocalEmpresaCfg();
        }
        syncEmpresaCfgNombreLogoDesdeMarca();
        syncWrapCoordsDisplayNuevoPedido();
        refrescarLineaUbicacionModalNuevoPedido();
        aplicarMarcaVisualCompleta();
        const cfg = window.EMPRESA_CFG || {};
        try {
            sincronizarFirmaIdentidadTenantDesdeValores(cfg.nombre, cfg.tipo);
        } catch (_) {}
        aplicarEtiquetasPorTipo(cfg.tipo || '');
        poblarSelectTiposReclamo();
        try {
            persistTenantBrandingCache({ subtitulo: cfg.subtitulo });
        } catch (_) {}
        if (getApiToken() && app?.u) {
            try {
                await fetchMiConfiguracionYAplicarEnEmpresaCfg();
            } catch (_) {}
        }
        if (NEON_OK && app?.u) {
            try {
                await refrescarEmpresaDesdeClienteNeonPorTenantActual();
            } catch (_) {}
        }
        try {
            aplicarVisibilidadTabsAdminRedElectrica();
        } catch (_) {}
        try {
            syncDerivacionesTercerosWrap();
        } catch (_) {}
        void refreshMapAdminBaseMarkerIfReady();
        invalidatePedidosTenantSqlCache();
        try {
            actualizarBarraHeaderSesion();
        } catch (_) {}
        try {
            aplicarMarcaVisualCompleta();
        } catch (_) {}
        try {
            persistTenantBrandingCache({ subtitulo: (window.EMPRESA_CFG || {}).subtitulo });
        } catch (_) {}
    } catch(e) {
        console.warn('Config empresa no cargada:', e.message);
        syncWrapCoordsDisplayNuevoPedido();
        refrescarLineaUbicacionModalNuevoPedido();
        try { aplicarMarcaVisualCompleta(); } catch (_) {}
        poblarSelectTiposReclamo();
        try {
            aplicarVisibilidadTabsAdminRedElectrica();
        } catch (_) {}
        try {
            syncDerivacionesTercerosWrap();
        } catch (_) {}
    }
}

// Estado y lógica del wizard SaaS (modal cfgi) → modules/admin-wizard.js

/**
 * Tenant para filtros SQL y UI multitenant.
 * Prioriza `app.u.tenant_id` (API/Neon/sincronización) sobre el claim del JWT: el token puede quedar
 * desfasado unos instantes tras vincular tenant (Android) o `sincronizarTenantOperativoDesdeMiConfiguracionApi`.
 */
function tenantIdActual() {
    const u = app?.u;
    if (u && (u.tenant_id != null || u.tenantId != null)) {
        const n = Number(u.tenant_id ?? u.tenantId);
        if (Number.isFinite(n) && n > 0) return n;
    }
    try {
        const tok = getApiToken();
        const pl = tok ? parseJwtPayloadLoose(tok) : null;
        if (pl && pl.tenant_id != null) {
            const jt = Number(pl.tenant_id);
            if (Number.isFinite(jt) && jt > 0) return jt;
        }
    } catch (_) {}
    const cfgT = tenantIdDesdeAppConfig(window.APP_CONFIG || {});
    if (Number.isFinite(cfgT) && cfgT > 0) return cfgT;
    return TENANT_ID_MONOTENANT_FALLBACK;
}

function parseJwtPayloadLoose(tok) {
    try {
        const parts = String(tok || '').split('.');
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
        const json = atob(b64 + pad);
        return JSON.parse(json);
    } catch (_) {
        return null;
    }
}

/**
 * El JWT (`pmg_api_token`) puede traer `tenant_id` obsoleto tras un cambio en la web admin o en Neon.
 * **No** alinear `app.u` desde el claim: pisa el tenant correcto que ya fijó API/Neon en `sincronizarTenantOperativoDesdeMiConfiguracionApi`.
 * Se mantiene el nombre por compatibilidad con código antiguo; no hace nada.
 */
function aplicarTenantDesdeJwtSiHaceFalta() {
    return false;
}

/** Columna `tenant_id` o `cliente_id` en `usuarios` (misma idea que la API / `sqlFiltroUsuariosPorTenant`). */
async function sqlColumnaTenantUsuariosNeonSync() {
    return resolveUsuariosTenantColumnName({
        sqlSimple,
        neonOk: NEON_OK && !!_sql,
        modoOffline,
    });
}

/** Tenant del usuario en Neon (válido en Android sin `API_BASE_URL` / JWT en disco). */
async function leerTenantIdUsuarioDesdeNeon(usuarioId) {
    const uid = Number(usuarioId);
    if (!Number.isFinite(uid) || uid < 1 || modoOffline || !NEON_OK || !_sql) return null;
    const col = await sqlColumnaTenantUsuariosNeonSync();
    if (!col) return null;
    try {
        const r = await sqlSimple(`SELECT ${col}::int AS tenant_id FROM usuarios WHERE id = ${esc(uid)} LIMIT 1`);
        const raw = r.rows?.[0]?.tenant_id;
        if (raw == null || raw === '') return null;
        const t = Number(raw);
        if (!Number.isFinite(t) || t < 1) return null;
        return t;
    } catch (_) {
        return null;
    }
}

/**
 * Sin JWT, `verificarConfiguracionInicialObligatoria` no llama a la API: armamos nombre/tipo/marca desde `clientes`
 * del `tenant_id` actual (corrige cabecera y wizard tras cambiar de tenant en la web admin).
 */
async function refrescarEmpresaDesdeClienteNeonPorTenantActual() {
    if (!NEON_OK || !_sql || !app?.u || modoOffline) return;
    const tid = tenantIdActual();
    if (!Number.isFinite(tid) || tid < 1) return;
    try {
        let cr;
        try {
            cr = await sqlSimple(
                `SELECT id, nombre, tipo, configuracion, active_business_type FROM clientes WHERE id = ${esc(tid)} LIMIT 1`
            );
        } catch (_) {
            cr = await sqlSimple(
                `SELECT id, nombre, tipo, configuracion FROM clientes WHERE id = ${esc(tid)} LIMIT 1`
            );
        }
        const row = cr.rows?.[0];
        if (!row) return;
        let cfg = row.configuracion;
        if (typeof cfg === 'string') {
            try {
                cfg = JSON.parse(cfg);
            } catch (_) {
                cfg = {};
            }
        }
        const c = cfg && typeof cfg === 'object' ? cfg : {};
        const nombreTrim = String(row.nombre || '').trim();
        const tipoRow = String(row.tipo ?? '').trim();
        const lbApi =
            c.lat_base != null && String(c.lat_base).trim() !== '' ? String(c.lat_base).trim() : '';
        const lbgApi =
            c.lng_base != null && String(c.lng_base).trim() !== '' ? String(c.lng_base).trim() : '';
        const ec = window.EMPRESA_CFG || {};
        window.EMPRESA_CFG = {
            ...ec,
            nombre: nombreTrim || ec.nombre,
            tipo: tipoRow || ec.tipo,
            ...(c.logo_url ? { logo_url: String(c.logo_url).trim() } : {}),
            lat_base: lbApi || ec.lat_base,
            lng_base: lbgApi || ec.lng_base,
            ...(row.active_business_type != null && String(row.active_business_type).trim()
                ? { active_business_type: String(row.active_business_type).trim() }
                : {}),
        };
        try {
            aplicarConfiguracionJsonClienteEnEmpresaCfg(c);
        } catch (_) {}
        window.__PMG_TENANT_BRANDING__ = {
            setup_wizard_completado: !!c.setup_wizard_completado,
            marca_publicada_admin: !!c.marca_publicada_admin || nombreTrim.length > 0,
            nombre_cliente: nombreTrim,
            logo_url: String(c.logo_url || '').trim(),
            tipo: tipoRow,
            from_local_cache: false,
        };
        window.__PMG_LAST_MI_CLIENTE = {
            id: Number(row.id) || tid,
            nombre: nombreTrim,
            tipo: tipoRow,
        };
        syncEmpresaCfgNombreLogoDesdeMarca();
        aplicarMarcaVisualCompleta();
        aplicarEtiquetasPorTipo(window.EMPRESA_CFG.tipo || '');
        poblarSelectTiposReclamo();
        try {
            persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
        } catch (_) {}
        try {
            actualizarBarraHeaderSesion();
        } catch (_) {}
    } catch (e) {
        console.warn('[empresa-neon-cliente]', e && e.message ? e.message : e);
    }
}

/**
 * Alinea `app.u.tenant_id` con la BD.
 * Con JWT, **prioriza** GET `/api/auth/tenant-operativo` (misma fuente que el admin web vía API);
 * si no hay token o falla la API, usa lectura Neon; último recurso `mi-configuracion`.
 * No se vuelve a forzar Neon al final: en WebView Android podía pisar un tenant API correcto con `1`.
 */
async function sincronizarTenantOperativoDesdeMiConfiguracionApi(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const silent = !!o.silent;
    try {
        if (!app?.u || modoOffline) return false;
        const tid = await resolverTenantOperativoSesion({
            modoOffline,
            neonOk: NEON_OK,
            hasSql: !!_sql,
            appUserId: Number(app.u.id),
            leerTenantIdUsuarioDesdeNeon,
            getApiBaseUrl,
            asegurarJwtApiRest,
            getApiToken,
            apiUrl,
            fetchFn: fetch,
        });
        if (!Number.isFinite(tid) || tid < 1) return false;
        try {
            if (window.AndroidSession && typeof AndroidSession.setTenantId === 'function') {
                AndroidSession.setTenantId(tid);
            }
        } catch (_) {}
        const cur = Number(tenantIdActual());
        if (!Number.isFinite(cur) || cur === tid) return false;
        app.u.tenant_id = tid;
        try {
            delete app.u.tenantId;
        } catch (_) {}
        try {
            localStorage.setItem('pmg', JSON.stringify(app.u));
        } catch (_) {}
        try {
            await intentarRefrescarJwtDesdeCredencialesGuardadas();
        } catch (_) {}
        try {
            limpiarLocalStorageContadoresPedido();
        } catch (_) {}
        try {
            invalidarCachesMultitenantSesionYOAdminUI();
        } catch (_) {}
        try {
            actualizarBarraHeaderSesion();
        } catch (_) {}
        try {
            localStorage.removeItem(PMG_BRANDING_LS_KEY);
        } catch (_) {}
        try {
            await refrescarEmpresaDesdeClienteNeonPorTenantActual();
        } catch (_) {}
        try {
            await restaurarDatosCompletosTrasCambioTenant({ silent: true });
        } catch (_) {}
        try {
            render();
            renderMk();
        } catch (_) {}
        try {
            await verificarConfiguracionInicialObligatoria();
        } catch (_) {}
        if (!silent) {
            try {
                toast(`Negocio / tenant actualizado (${tid})`, 'info');
            } catch (_) {}
        }
        return true;
    } catch (e) {
        console.warn('[tenant-sync]', e && e.message ? e.message : e);
        return false;
    }
}
if (typeof window !== 'undefined') {
    window.sincronizarTenantOperativoDesdeMiConfiguracionApi = sincronizarTenantOperativoDesdeMiConfiguracionApi;
}

/** Cache: existe columna socios_catalogo.tenant_id (Neon / multitenant). */
let _sociosCatalogoTieneTenantIdCache = null;
/** Cache: existe columna datos_extra en socios_catalogo (migración add_datos_extra_socios_catalogo.sql). */
let _sociosCatalogoTieneDatosExtraCache = null;
async function sociosCatalogoTieneDatosExtra() {
    if (_sociosCatalogoTieneDatosExtraCache === true || _sociosCatalogoTieneDatosExtraCache === false) {
        return _sociosCatalogoTieneDatosExtraCache;
    }
    try {
        const chk = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name = 'datos_extra' LIMIT 1`
        );
        _sociosCatalogoTieneDatosExtraCache = !!(chk.rows && chk.rows.length);
    } catch (_) {
        _sociosCatalogoTieneDatosExtraCache = false;
    }
    return _sociosCatalogoTieneDatosExtraCache;
}
async function sociosCatalogoTieneTenantId() {
    if (_sociosCatalogoTieneTenantIdCache === true || _sociosCatalogoTieneTenantIdCache === false) {
        return _sociosCatalogoTieneTenantIdCache;
    }
    try {
        const chk = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name = 'tenant_id' LIMIT 1`
        );
        _sociosCatalogoTieneTenantIdCache = !!(chk.rows?.length);
    } catch (_) {
        _sociosCatalogoTieneTenantIdCache = false;
    }
    return _sociosCatalogoTieneTenantIdCache;
}

/** True si `pedido_contador` tiene PK (tenant_id, anio) — migración `api/db/migrations/pedido_contador_tenant_id.sql`. */
let _pedidoContadorNeonTenantCache = null;
async function pedidoContadorNeonUsaTenantId() {
    if (_pedidoContadorNeonTenantCache === true || _pedidoContadorNeonTenantCache === false) {
        return _pedidoContadorNeonTenantCache;
    }
    try {
        const chk = await sqlSimple(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'pedido_contador' AND column_name = 'tenant_id' LIMIT 1`
        );
        _pedidoContadorNeonTenantCache = !!(chk.rows?.length);
    } catch (_) {
        _pedidoContadorNeonTenantCache = false;
    }
    return _pedidoContadorNeonTenantCache;
}

function limpiarLocalStorageContadoresPedido() {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('pmg_contador_') || k.startsWith('pmg_contador_tenant_'))) keys.push(k);
        }
        keys.forEach((k) => {
            try {
                localStorage.removeItem(k);
            } catch (_) {}
        });
    } catch (_) {}
}

/**
 * Siguiente número para `numero_pedido` (Neon directo desde el front).
 * Usa contador por tenant si la migración está aplicada; si no, esquema legacy por año.
 */
async function bumpPedidoContadorSqlNeon() {
    const anioActual = new Date().getFullYear();
    const tid = tenantIdActual();
    if (await pedidoContadorNeonUsaTenantId()) {
        const r = await sqlSimple(
            `INSERT INTO pedido_contador(tenant_id, anio, ultimo_numero)
             VALUES(${esc(tid)}, ${esc(anioActual)}, 1)
             ON CONFLICT (tenant_id, anio) DO UPDATE SET ultimo_numero = pedido_contador.ultimo_numero + 1
             RETURNING ultimo_numero`
        );
        const num = r.rows[0]?.ultimo_numero || 1;
        try {
            localStorage.setItem('pmg_contador_tenant_' + tid + '_' + anioActual, String(num));
        } catch (_) {}
        return 'PM-' + anioActual + '-' + String(num).padStart(4, '0');
    }
    const r = await sqlSimple(
        `INSERT INTO pedido_contador(anio, ultimo_numero)
         VALUES(${esc(anioActual)}, 1)
         ON CONFLICT(anio) DO UPDATE SET ultimo_numero = pedido_contador.ultimo_numero + 1
         RETURNING ultimo_numero`
    );
    const num = r.rows[0]?.ultimo_numero || 1;
    try {
        localStorage.setItem('pmg_contador_' + anioActual, String(num));
    } catch (_) {}
    return 'PM-' + anioActual + '-' + String(num).padStart(4, '0');
}

let _pedidosTenantSqlCache = null;
function invalidatePedidosTenantSqlCache() {
    _pedidosTenantSqlCache = null;
}

/** Si existe pedidos.tenant_id, filtra por el tenant del usuario (multicliente). Si existe business_type, acota a la línea activa. */
async function pedidosFiltroTenantSql() {
    if (_pedidosTenantSqlCache !== null) return _pedidosTenantSqlCache;
    try {
        const chk = await sqlSimple(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'pedidos'
             AND column_name IN ('tenant_id','business_type')`
        );
        const names = new Set((chk.rows || []).map((x) => x.column_name));
        const parts = [];
        if (names.has('tenant_id')) {
            parts.push(`tenant_id = ${esc(tenantIdActual())}`);
        }
        if (names.has('business_type')) {
            const bt = String(window.EMPRESA_CFG?.active_business_type || '').trim().toLowerCase();
            if (bt === 'electricidad' || bt === 'agua' || bt === 'municipio') {
                parts.push(
                    `(business_type = ${esc(bt)} OR business_type IS NULL OR TRIM(COALESCE(business_type::text, '')) = '')`
                );
            }
        }
        _pedidosTenantSqlCache = parts.length ? ` AND ${parts.join(' AND ')}` : '';
    } catch (_) {
        _pedidosTenantSqlCache = '';
    }
    return _pedidosTenantSqlCache;
}

function urlWhatsappAtencionDesdeCfg() {
    const raw = String((window.EMPRESA_CFG || {}).telefono || '').replace(/\D/g, '');
    if (raw.length < 8) return '';
    const n = raw.startsWith('54') ? raw : '54' + raw.replace(/^0+/, '');
    return 'https://wa.me/' + n;
}

async function contarPedidosCorteZonaNeon(disVal, trafoVal) {
    const d = disVal != null ? String(disVal).trim() : '';
    const t = trafoVal != null ? String(trafoVal).trim() : '';
    if (!d && !t) return 0;
    const tsql = await pedidosFiltroTenantSql();
    const ors = [];
    if (d) ors.push(`TRIM(COALESCE(distribuidor,'')) = TRIM(${esc(d)})`);
    if (t) ors.push(`TRIM(COALESCE(trafo,'')) = TRIM(${esc(t)})`);
    if (!ors.length) return 0;
    const w = [
        `estado IN ('Pendiente','Asignado','En ejecución')`,
        `fecha_creacion > NOW() - INTERVAL '90 minutes'`,
        `(${ors.join(' OR ')})`,
    ];
    try {
        const r = await sqlSimple(`SELECT COUNT(*)::int AS c FROM pedidos WHERE ${w.join(' AND ')}${tsql}`);
        return Number(r.rows?.[0]?.c) || 0;
    } catch (_) {
        if (!d) return 0;
        try {
            const r2 = await sqlSimple(
                `SELECT COUNT(*)::int AS c FROM pedidos WHERE estado IN ('Pendiente','Asignado','En ejecución') AND fecha_creacion > NOW() - INTERVAL '90 minutes' AND TRIM(COALESCE(distribuidor,'')) = TRIM(${esc(d)})${tsql}`
            );
            return Number(r2.rows?.[0]?.c) || 0;
        } catch (_e2) {
            return 0;
        }
    }
}

let _adminBannerWatermarkId = 0;
let _adminBannerTimer = null;
let _pollBannerAdminInterval = null;
/** Ids de reclamos WhatsApp acumulados en el banner actual (hasta ocultar o abrir detalle). */
const _adminBannerNuevoIdsMostrados = new Set();
const BANNER_NUEVO_MS = 10000;
/** ISO: última fecha_opinion_cliente ya notificada en banner (solo admin). */
let _adminBannerOpinionWatermarkIso = null;

const SESS_KEY_BANNER_OPINION_DISMISS = 'pmg_sess_banner_opinion_dismiss_v1';
/** Cierre explícito del banner de calificación baja: persiste entre sesiones (por tenant + pedido). */
const LS_KEY_BANNER_OPINION_DISMISS = 'pmg_ls_banner_opinion_dismiss_v1';

function _persistedOpinionBannerDismissedKeys() {
    try {
        const j = localStorage.getItem(LS_KEY_BANNER_OPINION_DISMISS);
        const a = JSON.parse(j || '[]');
        return new Set((Array.isArray(a) ? a : []).map(String));
    } catch (_) {
        return new Set();
    }
}

function _persistDismissOpinionBannerPedido(pid) {
    if (pid == null || pid === '') return;
    const tid = String(tenantIdActual());
    const key = `${tid}:${String(pid)}`;
    const s = _persistedOpinionBannerDismissedKeys();
    s.add(key);
    try {
        localStorage.setItem(LS_KEY_BANNER_OPINION_DISMISS, JSON.stringify([...s]));
    } catch (_) {}
}

function _sessionOpinionBannerDismissedIds() {
    try {
        const j = sessionStorage.getItem(SESS_KEY_BANNER_OPINION_DISMISS);
        const a = JSON.parse(j || '[]');
        return new Set((Array.isArray(a) ? a : []).map(String));
    } catch (_) {
        return new Set();
    }
}

function _sessionDismissOpinionBannerPedido(pid) {
    if (pid == null || pid === '') return;
    const s = _sessionOpinionBannerDismissedIds();
    s.add(String(pid));
    try {
        sessionStorage.setItem(SESS_KEY_BANNER_OPINION_DISMISS, JSON.stringify([...s]));
    } catch (_) {}
}

async function iniciarWatermarkBannerReclamoCliente() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    try {
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(`SELECT COALESCE(MAX(id),0)::bigint AS m FROM pedidos WHERE 1=1${tsql}`);
        _adminBannerWatermarkId = Number(r.rows?.[0]?.m) || 0;
    } catch (_) {}
}

async function iniciarWatermarkBannerOpinionCliente() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    try {
        const col = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'fecha_opinion_cliente' LIMIT 1`
        );
        if (!col.rows?.length) {
            _adminBannerOpinionWatermarkIso = new Date().toISOString();
            return;
        }
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(
            `SELECT MAX(fecha_opinion_cliente) AS m FROM pedidos WHERE fecha_opinion_cliente IS NOT NULL${tsql}`
        );
        const m = r.rows?.[0]?.m;
        _adminBannerOpinionWatermarkIso = m ? new Date(m).toISOString() : new Date(0).toISOString();
        setOpinionBannerWatermarkIso(_adminBannerOpinionWatermarkIso);
    } catch (_) {
        _adminBannerOpinionWatermarkIso = new Date().toISOString();
        setOpinionBannerWatermarkIso(_adminBannerOpinionWatermarkIso);
    }
}

function ocultarBannerReclamoCliente() {
    if (_adminBannerNuevoIdsMostrados.size) {
        const mx = Math.max(...[..._adminBannerNuevoIdsMostrados].map((x) => Number(x)).filter((n) => Number.isFinite(n)));
        if (Number.isFinite(mx) && mx > 0) {
            _adminBannerWatermarkId = Math.max(_adminBannerWatermarkId, mx);
        }
        _adminBannerNuevoIdsMostrados.clear();
    }
    const box = document.getElementById('admin-banner-nuevo-cliente');
    if (box) {
        box.style.display = 'none';
        delete box.dataset.visible;
        delete box.dataset.pedidoId;
    }
    clearTimeout(_adminBannerTimer);
    _adminBannerTimer = null;
}

function _commitAdminBannerOpinionWatermark() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    const pid = box?.dataset?.pedidoId;
    let iso = box?.dataset?.fechaOpinionIso;
    if (!iso && pid) {
        const p0 = app.p?.find(x => String(x.id) === String(pid));
        if (p0?.fopin) {
            const d = new Date(p0.fopin);
            if (!Number.isNaN(d.getTime())) iso = d.toISOString();
        }
    }
    if (iso) {
        const t = new Date(iso).getTime();
        const cur = _adminBannerOpinionWatermarkIso ? new Date(_adminBannerOpinionWatermarkIso).getTime() : 0;
        if (t > cur) _adminBannerOpinionWatermarkIso = new Date(t).toISOString();
    } else if (pid) {
        _adminBannerOpinionWatermarkIso = new Date().toISOString();
    }
}

/**
 * @param {{ persistDismiss?: boolean }} [opts] persistDismiss=false: solo ocultar UI (p. ej. al pasar a técnico), sin marcar descarte permanente.
 */
async function ocultarBannerOpinionCliente(opts) {
    const persist = opts?.persistDismiss !== false;
    const boxPre = document.getElementById('admin-banner-opinion-cliente');
    if (persist && boxPre?.dataset?.pedidoId) {
        _sessionDismissOpinionBannerPedido(boxPre.dataset.pedidoId);
        _persistDismissOpinionBannerPedido(boxPre.dataset.pedidoId);
        try {
            if (NEON_OK && _sql && esAdmin()) {
                const pidNum = parseInt(boxPre.dataset.pedidoId, 10);
                if (Number.isFinite(pidNum)) {
                    const tsql = await pedidosFiltroTenantSql();
                    await sqlSimple(
                        `UPDATE pedidos SET opinion_banner_admin_descartado = TRUE WHERE id = ${esc(pidNum)}${tsql}`
                    );
                }
            }
        } catch (e) {
            console.warn('[opinion-banner-dismiss-db]', e && e.message ? e.message : e);
        }
    }
    if (persist) _commitAdminBannerOpinionWatermark();
    const box = document.getElementById('admin-banner-opinion-cliente');
    if (box) {
        box.style.display = 'none';
        delete box.dataset.visible;
        delete box.dataset.pedidoId;
        delete box.dataset.fechaOpinionIso;
        delete box.dataset.waTelE164;
        delete box.dataset.estrellasOpinion;
    }
    const btnHc = document.getElementById('admin-banner-opinion-hc');
    if (btnHc) btnHc.style.display = 'none';
}

async function pollBannerNuevoReclamoCliente() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    const box = document.getElementById('admin-banner-nuevo-cliente');
    if (!box) return;
    try {
        const colO = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'origen_reclamo' LIMIT 1`
        );
        if (!colO.rows?.length) return;
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(
            `SELECT id, numero_pedido, tipo_trabajo FROM pedidos WHERE id > ${esc(_adminBannerWatermarkId)} AND COALESCE(origen_reclamo,'') = 'whatsapp'${tsql} ORDER BY id ASC LIMIT 25`
        );
        const rows = (r.rows || []).filter((row) => row && row.id != null);
        if (!rows.length) return;
        const antes = new Set(_adminBannerNuevoIdsMostrados);
        let hayNuevo = box.dataset.visible !== '1';
        for (const row of rows) {
            const k = String(row.id);
            if (!antes.has(k)) hayNuevo = true;
            _adminBannerNuevoIdsMostrados.add(k);
        }
        if (!hayNuevo) return;
        const last = rows.reduce((a, b) => (Number(a.id) > Number(b.id) ? a : b));
        const nid = Number(last.id);
        const txt = document.getElementById('admin-banner-nuevo-cliente-txt');
        if (txt) {
            const n = _adminBannerNuevoIdsMostrados.size;
            const titLast = (last.tipo_trabajo || '').trim();
            if (n <= 1) {
                txt.textContent = `Nuevo reclamo de cliente · #${last.numero_pedido || nid}${titLast ? ' · ' + titLast : ''}`;
            } else {
                txt.textContent = `Tenés ${n} nuevos reclamos · último: #${last.numero_pedido || nid}${titLast ? ' · ' + titLast : ''}`;
            }
        }
        box.style.display = 'flex';
        box.dataset.visible = '1';
        box.dataset.pedidoId = String(nid);
        clearTimeout(_adminBannerTimer);
        _adminBannerTimer = setTimeout(() => ocultarBannerReclamoCliente(), BANNER_NUEVO_MS);
    } catch (_) {}
}

async function pollBannerOpinionCliente() {
    return pollBannerOpinionClienteMejorado({
        esAdmin,
        modoOffline: () => modoOffline,
        neonOk: () => NEON_OK && !!_sql,
        pedidosFiltroTenantSql,
        sqlSimple,
        esc,
        tenantIdActual,
        persistedDismissKeys: _persistedOpinionBannerDismissedKeys,
        sessionDismissIds: _sessionOpinionBannerDismissedIds,
        normalizarTel: normalizarWhatsappInternacionalDesdeInput,
        puedeApiRest: puedeEnviarApiRestPedidos,
    });
}

function adminBannerOpinionClickWhatsapp() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    const w = (box?.dataset?.waTelE164 || '').trim();
    const pid = box?.dataset?.pedidoId;
    const est = box?.dataset?.estrellasOpinion || '';
    if (!w || !/^\+\d{8,22}$/.test(w)) {
        toast('No hay un WhatsApp de contacto válido para este pedido.', 'warning');
        return;
    }
    const msg = `Hola, te escribo desde ${String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim()} respecto de tu experiencia con el servicio${
        pid ? ` (pedido #${pid})` : ''
    }.${est ? ` Vimos la calificación ${est}/5 y queremos resolver cualquier inconveniente.` : ''}`;
    window.open(`https://wa.me/${w.slice(1)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
}
window.adminBannerOpinionClickWhatsapp = adminBannerOpinionClickWhatsapp;

async function adminBannerOpinionAbrirChatOperador() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    const pid = box?.dataset?.pedidoId;
    if (!pid) return;
    if (!puedeEnviarApiRestPedidos()) {
        toast('Sin API activa para abrir el chat operador.', 'warning');
        return;
    }
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(pid))}/abrir-chat-calificacion-baja`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            toast(String(data.error || 'No se pudo abrir el chat operador'), 'error');
            return;
        }
        const sid = data.humanChatSessionId;
        if (sid != null) await abrirModalWhatsappHumanChat(Number(sid));
        else toast('Sesión de chat no disponible.', 'warning');
    } catch (e) {
        toastError('opinion-chat-operador', e);
    }
}
window.adminBannerOpinionAbrirChatOperador = adminBannerOpinionAbrirChatOperador;

function detenerPollBannerReclamoCliente() {
    if (_pollBannerAdminInterval) {
        clearInterval(_pollBannerAdminInterval);
        _pollBannerAdminInterval = null;
    }
    ocultarBannerReclamoCliente();
    void ocultarBannerOpinionCliente({ persistDismiss: false });
    _adminBannerNuevoIdsMostrados.clear();
}

function iniciarPollBannerReclamoCliente() {
    detenerPollBannerReclamoCliente();
    if (!esAdmin() || modoOffline || !NEON_OK) return;
    _adminBannerNuevoIdsMostrados.clear();
    void (async () => {
        await iniciarWatermarkBannerReclamoCliente();
        await iniciarWatermarkBannerOpinionCliente();
        _pollBannerAdminInterval = setInterval(() => {
            void pollBannerNuevoReclamoCliente();
            void pollBannerOpinionCliente();
        }, 5000);
        void pollBannerNuevoReclamoCliente();
        void pollBannerOpinionCliente();
    })();
}

async function adminBannerClickVerDetalle() {
    const box = document.getElementById('admin-banner-nuevo-cliente');
    const pid = box?.dataset?.pedidoId;
    ocultarBannerReclamoCliente();
    if (!pid) return;
    let p = app.p.find(x => String(x.id) === String(pid));
    if (!p && _sql && NEON_OK) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(parseInt(pid, 10))} LIMIT 1`);
            const row = rr.rows?.[0];
            if (row) {
                p = norm(row);
                const ix = app.p.findIndex(x => String(x.id) === String(p.id));
                if (ix >= 0) app.p[ix] = p;
                else app.p.unshift(p);
            }
        } catch (_) {}
    }
    if (p) void detalle(p);
    else toast('No se encontró el pedido. Probá actualizar la lista.', 'warning');
}

async function adminBannerOpinionClickVerDetalle() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    const pid = box?.dataset?.pedidoId;
    await ocultarBannerOpinionCliente();
    if (!pid) return;
    let p = app.p.find((x) => String(x.id) === String(pid));
    if (!p && _sql && NEON_OK) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(parseInt(pid, 10))} LIMIT 1`);
            const row = rr.rows?.[0];
            if (row) {
                p = norm(row);
                const ix = app.p.findIndex((x) => String(x.id) === String(p.id));
                if (ix >= 0) app.p[ix] = p;
                else app.p.unshift(p);
            }
        } catch (_) {}
    }
    if (p) void detalle(p);
    else toast('No se encontró el pedido. Probá actualizar la lista.', 'warning');
}

window.adminBannerClickVerDetalle = adminBannerClickVerDetalle;
window.adminBannerCerrarSinDetalle = ocultarBannerReclamoCliente;
window.adminBannerOpinionClickVerDetalle = adminBannerOpinionClickVerDetalle;
window.adminBannerOpinionCerrar = ocultarBannerOpinionCliente;

/** Mapa: oculta pedidos cuyo tipo pertenece claramente a otro rubro (catálogo distinto). */
function pedidoVisibleSegunRubro(p) {
    const rubro = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
    if (!rubro) return true;
    const tt = String(p?.tt || '').trim();
    if (!tt) return true;
    if (TIPOS_RECLAMO_LEGACY.includes(tt)) return true;
    const catalogKey = rubroCatalogoTiposReclamo();
    const mis = TIPOS_RECLAMO_POR_RUBRO[catalogKey];
    if (mis && mis.includes(tt)) return true;
    for (const k of Object.keys(TIPOS_RECLAMO_POR_RUBRO)) {
        if (k !== catalogKey && (TIPOS_RECLAMO_POR_RUBRO[k] || []).includes(tt)) return false;
    }
    return true;
}

function pedidosVisiblesEnUI() {
    const relaxRubroLista =
        esTecnicoOSupervisor() && leerVerTodosPedidosTecnico();
    const chkDes =
        esAdmin() && document.getElementById('chk-lista-mostrar-desestimados')?.checked;
    const ocultarHistBp2 = esAdmin() && bp2OcultarHistoricosResueltosActivo();
    return (app.p || []).filter((p) => {
        if (!pedidoPasaFiltroRubroSiAsignadoAOperador({ relax: relaxRubroLista, pedido: p, pedidoVisibleSegunRubro, operadorId: esTecnicoOSupervisor() ? app.u?.id : undefined })) return false;
        if (!mostrarPedidoDerivadoFueraEnListasYMapa(p)) return false;
        if (String(p.es || '') === 'Desestimado' && !chkDes) return false;
        if (ocultarHistBp2) {
            const es = String(p.es || '');
            if (es === 'Cerrado' || es === 'Desestimado' || es === 'Derivado externo') return false;
            if (p.dex === true || p.dex === 1) return false;
        }
        return true;
    });
}
if (typeof window !== 'undefined') window.pedidosVisiblesEnUI = pedidosVisiblesEnUI;

function aplicarEtiquetasPorTipo(tipo) {
    const esMunicipio = String(tipo || '').toLowerCase() === 'municipio';
    const etiqueta = esMunicipio ? 'Vecinos' : 'Socios / NIS';
    document.querySelectorAll('.admin-tab').forEach(tab => {
        if (tab?.getAttribute('onclick') === "adminTab('socios')") {
            tab.innerHTML = `<i class="fas fa-address-book"></i> ${etiqueta}`;
        }
        if (tab?.getAttribute('onclick') === "adminTab('distribuidores')") {
            const lbl = esMunicipio ? 'Barrios / Zonas' : String(tipo || '').toLowerCase() === 'cooperativa_agua' ? 'Ramales' : 'Distribuidores';
            const ico = esMunicipio ? 'fa-map-marked-alt' : 'fa-network-wired';
            tab.innerHTML = `<i class="fas ${ico}"></i> ${lbl}`;
        }
    });
    const h3cat = document.getElementById('admin-socios-catalogo-titulo');
    if (h3cat) {
        h3cat.textContent = esMunicipio ? 'Catálogo de vecinos' : 'Catálogo de socios (NIS / medidor)';
    }
    const hZona = document.getElementById('admin-zona-catalogo-titulo');
    if (hZona) {
        hZona.textContent = esMunicipio ? 'Barrios / Zonas' : String(tipo || '').toLowerCase() === 'cooperativa_agua' ? 'Ramales' : 'Distribuidores';
    }
    const firma = document.getElementById('lbl-firma-cierre');
    if (firma) {
        firma.innerHTML = `<i class="fas fa-signature"></i> Firma del cliente / ${esMunicipio ? 'vecino' : 'socio'}`;
    }
    try { syncNisClienteReclamoConexionUI(); } catch (_) {}
    try { syncZonaPedidoFormLabels(); } catch (_) {}
    try { syncMapaFiltroTiposRebuild(); } catch (_) {}
    try {
        syncChecklistSeguridadCierreLabels();
    } catch (_) {}
    try {
        syncOcultarModulosRedesRowVisibility();
        syncAyudaDistribuidoresExcelHint();
        syncAdminSaidiDistribTabVisibility({
            esCooperativaElectricaRubro,
            debeOcultarTabDistribuidoresAdmin,
        });
        syncAdminRedElectricaTabVisibility({ esCooperativaElectricaRubro });
    } catch (_) {}
    try {
        syncKpiAdminRubroDom();
    } catch (_) {}
}

function syncZonaPedidoFormLabels() {
    try {
        syncPedidoFormZonaDistribuidorLabels();
    } catch (_) {}
    const trafoW = document.getElementById('trafo-pedido')?.closest('.fg');
    if (trafoW) trafoW.style.display = esCooperativaElectricaRubro() ? '' : 'none';
}
window.syncZonaPedidoFormLabels = syncZonaPedidoFormLabels;

/** JWT temporal del modal «tenant técnico» en login Android; se limpia al cerrar o tras vincular. */
let __mttAndroidStagingToken = '';

function _mttAndroidSetMsg(texto, esError) {
    const m = document.getElementById('mtt-android-msg');
    if (!m) return;
    if (!texto) {
        m.style.display = 'none';
        m.textContent = '';
        return;
    }
    m.style.display = 'block';
    m.style.color = esError ? 'var(--re)' : 'var(--tm)';
    m.textContent = texto;
}

function esEntornoAndroidGestorNovaLogin() {
    try {
        return (
            typeof window.AndroidConfig !== 'undefined' ||
            (typeof esAndroidWebViewMapa === 'function' && esAndroidWebViewMapa())
        );
    } catch (_) {
        return false;
    }
}

function actualizarVisibilidadBotonTenantTecnicoLogin() {
    const b = document.getElementById('btn-login-tenant-tecnico');
    if (!b) return;
    const lsActivo = !!document.getElementById('ls')?.classList?.contains('active');
    const show = lsActivo && (esEntornoAndroidGestorNovaLogin() || esGestorNovaWebPublico());
    b.style.display = show ? 'flex' : 'none';
}

function abrirModalTenantTecnicoAndroid() {
    const modal = document.getElementById('modal-tenant-tecnico-android');
    if (!modal) return;
    __mttAndroidStagingToken = '';
    _mttAndroidSetMsg('');
    const sel = document.getElementById('mtt-android-tenant-sel');
    if (sel) sel.innerHTML = '';
    modal.classList.add('active');
}

function cerrarModalTenantTecnicoAndroid() {
    const modal = document.getElementById('modal-tenant-tecnico-android');
    if (modal) modal.classList.remove('active');
    __mttAndroidStagingToken = '';
    _mttAndroidSetMsg('');
}

async function mttAndroidListarTenants() {
    const k = (document.getElementById('mtt-android-tech-key')?.value || '').trim();
    if (!k) {
        _mttAndroidSetMsg('Ingresá la clave de técnico.', true);
        return;
    }
    __mttAndroidStagingToken = '';
    _mttAndroidSetMsg('Listando clientes…', false);
    try {
        const j = await apiSetupTechnicianFetchTenants(null, k);
        wizardPoblarSelectTenantsClientes(document.getElementById('mtt-android-tenant-sel'), j.clientes);
        _mttAndroidSetMsg(
            `Listo: ${(j.clientes || []).length} fila(s). Elegí tenant y tocá Vincular; después Ingresar o recargá.`,
            false
        );
    } catch (e) {
        _mttAndroidSetMsg(e.message || 'Error', true);
    }
}

async function mttAndroidVincularTenant() {
    const k = (document.getElementById('mtt-android-tech-key')?.value || '').trim();
    const sel = document.getElementById('mtt-android-tenant-sel');
    const tid = Number(sel?.value);
    if (!k) {
        _mttAndroidSetMsg('Ingresá la clave de técnico.', true);
        return;
    }
    if (!Number.isFinite(tid) || tid < 1) {
        _mttAndroidSetMsg('Primero listá tenants y elegí un id.', true);
        return;
    }
    const tok = (__mttAndroidStagingToken || '').trim() || getApiToken();
    const fromTid = tenantIdActual();
    _mttAndroidSetMsg('Vinculando…', false);
    try {
        const j = await apiSetupTechnicianPostAttach(tok || null, k, tid, tok ? undefined : fromTid);
        if (j.token) {
            try {
                app.apiToken = String(j.token);
                localStorage.setItem('pmg_api_token', app.apiToken);
            } catch (_) {}
            const tidApi = Number(j.tenant_id);
            const tidOk = Number.isFinite(tidApi) && tidApi > 0 ? tidApi : tid;
            const pl = parseJwtPayloadLoose(j.token);
            const uidJwt = pl ? Number(pl.userId ?? pl.sub) : NaN;
            if (!app?.u && Number.isFinite(uidJwt) && uidJwt > 0 && pl) {
                app.u = {
                    id: uidJwt,
                    email: String(pl.email || ''),
                    nombre: String(pl.nombre || ''),
                    rol: normalizarRolStr(pl.rol || ''),
                    tenant_id: tidOk,
                    activo: true
                };
            } else if (app?.u) {
                app.u.tenant_id = tidOk;
                try {
                    delete app.u.tenantId;
                } catch (_) {}
            }
            try {
                if (app?.u) localStorage.setItem('pmg', JSON.stringify(app.u));
            } catch (_) {}
            try {
                limpiarLocalStorageContadoresPedido();
            } catch (_) {}
            try {
                registrarOnboardingCompletadoTrasVinculoTenantMtt();
            } catch (_) {}
            try {
                invalidarCachesMultitenantSesionYOAdminUI();
            } catch (_) {}
            try {
                if (window.AndroidSession && typeof window.AndroidSession.setTenantId === 'function') {
                    window.AndroidSession.setTenantId(tidOk);
                }
            } catch (_) {}
        }
        _mttAndroidSetMsg([j.message, j.hint_admin_creado].filter(Boolean).join(' ') || 'Vinculado.', false);
        toast([j.message, j.hint_admin_creado].filter(Boolean).join(' ') || 'Tenant vinculado. Recargando…', 'success');
        __mttAndroidStagingToken = '';
        cerrarModalTenantTecnicoAndroid();
        setTimeout(() => {
            try {
                window.location.reload();
            } catch (_) {}
        }, 400);
    } catch (e) {
        _mttAndroidSetMsg(e.message || 'Error', true);
    }
}

window.abrirModalTenantTecnicoAndroid = abrirModalTenantTecnicoAndroid;
window.cerrarModalTenantTecnicoAndroid = cerrarModalTenantTecnicoAndroid;
window.mttAndroidListarTenants = mttAndroidListarTenants;
window.mttAndroidVincularTenant = mttAndroidVincularTenant;
window.actualizarVisibilidadBotonTenantTecnicoLogin = actualizarVisibilidadBotonTenantTecnicoLogin;

// ── ALARMA PEDIDOS URGENTES ──────────────────────────────────
let _audioCtx = null;

function tocarAlarma() {
    try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.frequency.setValueAtTime(880, _audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, _audioCtx.currentTime + 0.15);
        osc.frequency.setValueAtTime(880, _audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.5);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 0.5);
    } catch(_) {}
}

function mostrarAlertaPedidoUrgente(pedido) {
    // Solo al admin
    if (!esAdmin()) return;
    if (!['Crítica','Alta'].includes(pedido.pr)) return;

    tocarAlarma();

    const pid = String(pedido.id);
    const deEsc = String(pedido.de || '').replace(/</g, '&lt;');
    const snip = deEsc.length > 72 ? deEsc.substring(0, 72) + '…' : deEsc;

    const alerta = document.createElement('div');
    alerta.style.cssText = `
        position:fixed;top:1rem;left:50%;transform:translateX(-50%);
        background:${pedido.pr === 'Crítica' ? '#dc2626' : '#f97316'};
        color:white;padding:1rem 1.5rem;border-radius:.75rem;
        z-index:9999;max-width:min(92vw,520px);box-shadow:0 8px 25px rgba(0,0,0,.3);
        animation:alertaIn .3s ease;font-weight:600;display:flex;gap:.75rem;align-items:flex-start;
        cursor:pointer
    `;
    alerta.setAttribute('role', 'button');
    alerta.setAttribute('tabindex', '0');
    alerta.title = 'Tocá para abrir el detalle del reclamo';
    alerta.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="font-size:1.4rem;flex-shrink:0;margin-top:.1rem"></i>
        <div style="flex:1;min-width:0">
            <div style="font-size:1rem">⚠️ Pedido ${pedido.pr.toUpperCase()}</div>
            <div style="font-size:.85rem;opacity:.95">#${pedido.np} — ${String(pedido.tt || 'Sin tipo').replace(/</g, '&lt;')}</div>
            <div style="font-size:.78rem;opacity:.88;line-height:1.35;margin-top:.25rem">${snip || '—'}</div>
            <div style="font-size:.72rem;opacity:.75;margin-top:.35rem">Tocá para ver el detalle</div>
        </div>
        <button type="button" class="gn-alerta-urgente-cerrar" aria-label="Cerrar" style="background:rgba(255,255,255,.2);border:none;color:white;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:1rem;flex-shrink:0">✕</button>
    `;
    const cerrar = (ev) => {
        ev.stopPropagation();
        try { alerta.remove(); } catch (_) {}
    };
    alerta.querySelector('.gn-alerta-urgente-cerrar')?.addEventListener('click', cerrar);

    const abrir = async () => {
        try { alerta.remove(); } catch (_) {}
        await cargarPedidos({ silent: true });
        const p = app.p.find(x => String(x.id) === pid);
        if (p) {
            app.tab = 'c';
            document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === app.tab));
            render();
            void detalle(p);
        } else {
            toast('Actualizá la lista — pedido no encontrado en caché', 'info');
        }
    };
    alerta.addEventListener('click', abrir);
    alerta.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            abrir();
        }
    });
    document.body.appendChild(alerta);
    setTimeout(() => { if (alerta.parentElement) alerta.remove(); }, 45000);
}



// ================================================================
//  FUNCIONES DEL PANEL ADMIN
// ================================================================

// ── Carga de config.json desde GitHub ────────────────────────
let APP_CONFIG = null;
async function cargarAppConfig() {
    const uaGestorNova =
        typeof navigator !== 'undefined' &&
        (/GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent));
    const desdeAssetsFile = window.location.protocol === 'file:';
    /* APK GestorNova: Neon/API en assets/config.json. Con HTTPS (Pages) no hay fetch a ./config.json con secretos. */
    if (
        uaGestorNova &&
        window.AndroidConfig &&
        typeof window.AndroidConfig.getConfigJson === 'function'
    ) {
        try {
            const raw = window.AndroidConfig.getConfigJson();
            if (raw && raw.trim()) {
                APP_CONFIG = JSON.parse(raw);
                window.APP_CONFIG = APP_CONFIG;
                console.log('[config] cargado OK desde AndroidConfig bridge');
                return true;
            }
        } catch (e) {
            console.warn('[config] fallo bridge AndroidConfig:', e && e.message ? e.message : e);
        }
    }
    const esAndroidApp = desdeAssetsFile || uaGestorNova;
    const rutas =
        desdeAssetsFile && uaGestorNova
            ? ['./config.json', 'config.json', 'file:///android_asset/config.json']
            : ['./config.json?' + Date.now()];
    let ultimoError = '';
    for (const ruta of rutas) {
        try {
            const ctl = new AbortController();
            const tid = setTimeout(() => {
                try {
                    ctl.abort();
                } catch (_) {}
            }, 15000);
            let resp;
            try {
                resp = await fetch(ruta, { cache: 'no-store', signal: ctl.signal });
            } finally {
                clearTimeout(tid);
            }
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            APP_CONFIG = await resp.json();
            window.APP_CONFIG = APP_CONFIG;
            console.log('[config] cargado OK desde', ruta);
            return true;
        } catch (e) {
            ultimoError = e && e.message ? e.message : String(e);
            console.warn('[config] fallo en', ruta, ultimoError);
        }
    }
    console.error('[config] ERROR al cargar config.json:', ultimoError);
    const dbs2 = document.getElementById('dbs');
    if (dbs2) {
        dbs2.className = 'dbs er';
        dbs2.innerHTML = esAndroidApp
            ? '<i class="fas fa-exclamation-circle"></i> Error: no se pudo leer assets/config.json'
            : '<i class="fas fa-exclamation-circle"></i> Error: no se encontró config.json en el repositorio';
    }
    return false;
}

// ── Admin tab switcher ────────────────────────────────────────
const _ADMIN_TAB_ORDER = ['empresa','usuarios','distribuidores','saidi-excel','red-electrica','socios','estadisticas','kpi','mapa-usuarios','historicos','contrasena'];
let _kpiSnapshotsTablaCache = null;
async function adminKpiSnapshotsTablaExiste(refrescar) {
    if (!refrescar && _kpiSnapshotsTablaCache !== null) return _kpiSnapshotsTablaCache;
    if (!_sql || modoOffline || !NEON_OK) {
        _kpiSnapshotsTablaCache = false;
        return false;
    }
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kpi_snapshots' LIMIT 1`
        );
        _kpiSnapshotsTablaCache = (r.rows || []).length > 0;
    } catch (_) {
        _kpiSnapshotsTablaCache = false;
    }
    return _kpiSnapshotsTablaCache;
}

/** Presets del formulario admin KPI (texto amigable → clave estable en BD). */
const KPI_ADMIN_PRESET_META = {
    '': { metrica: '', detail: 'none', unidad: '', hint: '', valorAyuda: '' },
    pct_cierres_con_foto: {
        metrica: 'pct_cierres_con_foto',
        detail: 'cierres_foto',
        unidad: 'porcentaje',
        hint: 'Qué parte de los cierres del periodo tuvieron al menos una foto de cierre.',
        valorAyuda:
            'Completá fechas y tocá «Calcular desde datos del sistema», o cargá «con foto» / «total» y el % se calcula solo.',
    },
    reclamos_cerrados: {
        metrica: 'reclamos_cerrados_count',
        detail: 'conteo',
        conteoLabel: '¿Cuántos reclamos se cerraron en estas fechas?',
        jsonKey: 'cerrados',
        unidad: 'cantidad',
        hint: 'Pedidos con estado Cerrado cuya fecha de cierre cae en el periodo (este tenant).',
        valorAyuda: 'Podés usar «Calcular desde datos del sistema» con las fechas, o escribir el número a mano.',
    },
    reclamos_recibidos: {
        metrica: 'reclamos_recibidos_count',
        detail: 'conteo',
        conteoLabel: '¿Cuántos reclamos nuevos entraron en el periodo?',
        jsonKey: 'recibidos',
        unidad: 'cantidad',
        hint: 'Pedidos nuevos según fecha de creación en el rango (este tenant).',
        valorAyuda: '«Calcular desde datos del sistema» cuenta por fecha_creacion, o cargá el número a mano.',
    },
    tiempo_respuesta_horas: {
        metrica: 'tiempo_respuesta_medio_horas',
        detail: 'none',
        unidad: 'horas',
        hint: 'Promedio de horas desde la creación del pedido hasta la primera asignación (fecha_asignacion), solo cierres del periodo.',
        valorAyuda: '«Calcular desde datos del sistema» usa pedidos cerrados con asignación registrada.',
    },
    satisfaccion_pct: {
        metrica: 'satisfaccion_pct',
        detail: 'satisfaccion_wa',
        unidad: 'porcentaje',
        hint: 'Tras el cierre por WhatsApp el cliente califica 1–5 y puede dejar comentario. El % equivale al promedio de estrellas sobre 5 (ej. 4 estrellas → 80%).',
        valorAyuda:
            'Con «Calcular desde datos del sistema» se usan opinion_cliente_estrellas en el rango de fecha_opinion_cliente.',
    },
    saifi: {
        metrica: 'saifi_indice',
        detail: 'none',
        unidad: 'proporción',
        hint: 'SAIFI: índice de frecuencia de interrupciones del servicio eléctrico en el periodo (definición operativa de la cooperativa).',
        valorAyuda: 'Cargá el valor principal a mano según tu informe de calidad de suministro.',
    },
    saidi: {
        metrica: 'saidi_minutos',
        detail: 'none',
        unidad: 'minutos',
        hint: 'SAIDI: duración equivalente de interrupciones en minutos (criterio de la cooperativa).',
        valorAyuda: 'Cargá el valor principal a mano según tu informe.',
    },
    pct_bacheo_48h: {
        metrica: 'pct_bacheo_resuelto_48h',
        detail: 'none',
        unidad: 'porcentaje',
        hint: 'Porcentaje de reclamos de bacheo resueltos en menos de 48 h (desde alta hasta cierre).',
        valorAyuda: 'Completá el % según tus datos municipales o el valor principal a mano.',
    },
    pct_alumbrado_24h: {
        metrica: 'pct_alumbrado_repuesto_24h',
        detail: 'none',
        unidad: 'porcentaje',
        hint: 'Porcentaje de reclamos de alumbrado público resueltos en menos de 24 h.',
        valorAyuda: 'Completá el % según tus datos municipales o el valor principal a mano.',
    },
};

const KPI_METRICA_ETIQUETAS = {
    horas_promedio_cierre: 'Horas promedio de cierre',
    pct_cerrados_24h: '% Cerrados en 24 h',
    pct_cerrados_48h: '% Cerrados en 48 h',
    pct_cierre: '% de Cierre',
    total_reclamos: 'Total de reclamos',
    pct_cierres_con_foto: '% Cierres con foto',
    reclamos_cerrados_count: 'Reclamos cerrados',
    reclamos_recibidos_count: 'Reclamos recibidos',
    tiempo_respuesta_medio_horas: 'Tiempo medio respuesta (h)',
    satisfaccion_pct: 'Satisfacción (WA 1–5★ → %)',
    avance_medio_pct: '% Avance medio',
    saifi_indice: 'SAIFI (índice)',
    saidi_minutos: 'SAIDI (minutos)',
    pct_bacheo_resuelto_48h: '% Bacheo resuelto <48 h',
    pct_alumbrado_repuesto_24h: '% Alumbrado repuesto <24 h',
};

function normalizarUnidadKpiParaGuardar(raw) {
    const s = String(raw || '').trim();
    const leg = { percent: 'porcentaje', hours: 'horas', count: 'cantidad', ratio: 'proporción', days: 'días' };
    return leg[s] || s;
}

function formatearUnidadKpiVista(u) {
    const s = String(u || '').trim();
    if (!s) return '—';
    const leg = { percent: 'porcentaje', hours: 'horas', count: 'cantidad', ratio: 'proporción', days: 'días' };
    return leg[s] || s;
}

function fmtFechaKpiSnapshotCorta(val) {
    const s = String(val || '').trim();
    if (!s) return '—';
    const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-AR');
}

function aplicarKpiUnidadCustomToggleAdmin() {
    const sel = document.getElementById('kpi-unidad');
    const c = document.getElementById('kpi-unidad-custom');
    if (!c || !sel) return;
    c.style.display = sel.value === '__custom' ? 'block' : 'none';
}
window.aplicarKpiUnidadCustomToggleAdmin = aplicarKpiUnidadCustomToggleAdmin;

function syncKpiMetricaAvanzadaAdmin() {
    const v = document.getElementById('kpi-metrica-visible');
    const h = document.getElementById('kpi-metrica');
    if (v && h) h.value = v.value;
}
window.syncKpiMetricaAvanzadaAdmin = syncKpiMetricaAvanzadaAdmin;

function kpiAdminRellenarValorDesdeCierresFoto() {
    const cf = parseInt(document.getElementById('kpi-det-con-foto')?.value, 10);
    const tot = parseInt(document.getElementById('kpi-det-total-cierres')?.value, 10);
    const valEl = document.getElementById('kpi-valor');
    if (!valEl || !Number.isFinite(cf) || !Number.isFinite(tot) || tot <= 0) return;
    if (cf > tot) return;
    const pct = Math.round((cf / tot) * 10000) / 100;
    valEl.value = String(pct);
}
window.kpiAdminRellenarValorDesdeCierresFoto = kpiAdminRellenarValorDesdeCierresFoto;

function aplicarKpiPresetAdmin() {
    const sel = document.getElementById('kpi-preset');
    const preset = sel?.value || '';
    const meta = KPI_ADMIN_PRESET_META[preset] || KPI_ADMIN_PRESET_META[''];
    const ayuda = document.getElementById('kpi-preset-ayuda');
    const ayudaValor = document.getElementById('kpi-valor-ayuda');
    const wrapAdvMet = document.getElementById('kpi-wrap-metrica-avanzada');
    const wrapCierres = document.getElementById('kpi-detail-cierres-foto');
    const wrapConteo = document.getElementById('kpi-detail-conteo-wrap');
    const wrapJsonAdv = document.getElementById('kpi-json-advanced-wrap');
    const hiddenM = document.getElementById('kpi-metrica');
    const unidadSel = document.getElementById('kpi-unidad');
    if (ayuda) {
        ayuda.textContent = meta.hint || '';
        ayuda.style.display = meta.hint ? 'block' : 'none';
    }
    if (ayudaValor) {
        ayudaValor.textContent = meta.valorAyuda || '';
        ayudaValor.style.display = meta.valorAyuda ? 'block' : 'none';
    }
    if (wrapCierres) wrapCierres.style.display = meta.detail === 'cierres_foto' ? 'block' : 'none';
    if (wrapConteo) {
        wrapConteo.style.display = meta.detail === 'conteo' ? 'block' : 'none';
        const lbl = document.getElementById('kpi-det-conteo-label');
        if (lbl && meta.conteoLabel) lbl.textContent = meta.conteoLabel;
    }
    if (wrapAdvMet) wrapAdvMet.style.display = 'none';
    if (wrapJsonAdv) wrapJsonAdv.style.display = 'none';
    const wrapSatWa = document.getElementById('kpi-detail-satisfaccion-wa');
    if (wrapSatWa) wrapSatWa.style.display = meta.detail === 'satisfaccion_wa' ? 'block' : 'none';
    const wrapNeonCalc = document.getElementById('kpi-neon-calc-wrap');
    if (wrapNeonCalc) {
        const calcPresets = new Set([
            'pct_cierres_con_foto',
            'reclamos_cerrados',
            'reclamos_recibidos',
            'tiempo_respuesta_horas',
            'satisfaccion_pct',
        ]);
        wrapNeonCalc.style.display = calcPresets.has(preset) ? 'block' : 'none';
    }
    const visMet = document.getElementById('kpi-metrica-visible');
    if (hiddenM) hiddenM.value = meta.metrica || '';
    if (visMet) visMet.value = '';
    {
        const ta = document.getElementById('kpi-json');
        if (ta) ta.value = '';
    }
    if (unidadSel) {
        if (meta.unidad) unidadSel.value = meta.unidad;
        else if (!preset) unidadSel.value = '';
        aplicarKpiUnidadCustomToggleAdmin();
    }
}
window.aplicarKpiPresetAdmin = aplicarKpiPresetAdmin;

/** Rellena valor (y detalles) desde agregados en Neon para el preset y fechas actuales. */
window.kpiAdminRellenarDesdeNeon = async function kpiAdminRellenarDesdeNeon() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) {
        toast('Sin conexión o sin permisos.', 'error');
        return;
    }
    const preset = (document.getElementById('kpi-preset')?.value || '').trim();
    if (!preset) {
        toast('Elegí un tipo de indicador.', 'warning');
        return;
    }
    const desde = (document.getElementById('kpi-desde')?.value || '').trim();
    const hasta = (document.getElementById('kpi-hasta')?.value || '').trim();
    if (!desde || !hasta) {
        toast('Completá periodo desde y hasta.', 'warning');
        return;
    }
    if (desde > hasta) {
        toast('«Desde» no puede ser posterior a «Hasta».', 'warning');
        return;
    }
    const tsql = await pedidosFiltroTenantSql();
    const round2 = (x) => Math.round(Number(x) * 100) / 100;
    try {
        if (preset === 'pct_cierres_con_foto') {
            const r = await sqlSimple(
                `SELECT
                  COUNT(*) FILTER (WHERE foto_cierre IS NOT NULL AND length(trim(COALESCE(foto_cierre,''))) > 0)::int AS cf,
                  COUNT(*)::int AS tot
                 FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL
                 AND fecha_cierre::date >= ${esc(desde)}::date AND fecha_cierre::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            const row = r.rows?.[0];
            const tot = parseInt(row?.tot, 10);
            const cf = parseInt(row?.cf, 10);
            if (!Number.isFinite(tot) || tot <= 0) {
                toast('No hay cierres en ese periodo para calcular.', 'warning');
                return;
            }
            const elCf = document.getElementById('kpi-det-con-foto');
            const elTot = document.getElementById('kpi-det-total-cierres');
            if (elCf) elCf.value = String(cf);
            if (elTot) elTot.value = String(tot);
            kpiAdminRellenarValorDesdeCierresFoto();
            toast('Porcentaje calculado desde cierres con foto.', 'success');
            return;
        }
        if (preset === 'reclamos_cerrados') {
            const r = await sqlSimple(
                `SELECT COUNT(*)::int AS n FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL
                 AND fecha_cierre::date >= ${esc(desde)}::date AND fecha_cierre::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            const n = parseInt(r.rows?.[0]?.n, 10);
            if (!Number.isFinite(n)) {
                toast('No se pudo calcular.', 'error');
                return;
            }
            const el = document.getElementById('kpi-det-conteo');
            if (el) el.value = String(n);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(n);
            toast(`Cerrados en periodo: ${n}`, 'success');
            return;
        }
        if (preset === 'reclamos_recibidos') {
            const r = await sqlSimple(
                `SELECT COUNT(*)::int AS n FROM pedidos WHERE fecha_creacion::date >= ${esc(desde)}::date
                 AND fecha_creacion::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            const n = parseInt(r.rows?.[0]?.n, 10);
            if (!Number.isFinite(n)) {
                toast('No se pudo calcular.', 'error');
                return;
            }
            const el = document.getElementById('kpi-det-conteo');
            if (el) el.value = String(n);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(n);
            toast(`Recibidos (nuevos) en periodo: ${n}`, 'success');
            return;
        }
        if (preset === 'tiempo_respuesta_horas') {
            const r = await sqlSimple(
                `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (fecha_asignacion - fecha_creacion)) / 3600.0), 0) AS h
                 FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL
                 AND fecha_cierre::date >= ${esc(desde)}::date AND fecha_cierre::date <= ${esc(hasta)}::date
                 AND fecha_asignacion IS NOT NULL AND fecha_creacion IS NOT NULL
                 ${tsql}`
            );
            let h = Number(r.rows?.[0]?.h);
            if (!Number.isFinite(h) || h <= 0) {
                toast('No hay pedidos con asignación en ese periodo para promediar.', 'warning');
                return;
            }
            h = round2(h);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(h).replace('.', ',');
            toast(`Tiempo medio hasta asignación: ${h} h`, 'success');
            return;
        }
        if (preset === 'satisfaccion_pct') {
            const chk = await sqlSimple(
                `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos'
                 AND column_name = 'opinion_cliente_estrellas' LIMIT 1`
            );
            if (!chk.rows?.length) {
                toast('Falta la columna opinion_cliente_estrellas (actualizá la app o ejecutá migración en Neon).', 'warning');
                return;
            }
            const r = await sqlSimple(
                `SELECT COUNT(*)::int AS n, AVG(opinion_cliente_estrellas::double precision) AS prom
                 FROM pedidos WHERE opinion_cliente_estrellas IS NOT NULL
                 AND fecha_opinion_cliente IS NOT NULL
                 AND fecha_opinion_cliente::date >= ${esc(desde)}::date AND fecha_opinion_cliente::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            const n = parseInt(r.rows?.[0]?.n, 10);
            const prom = Number(r.rows?.[0]?.prom);
            if (!Number.isFinite(n) || n < 1 || !Number.isFinite(prom)) {
                toast('No hay valoraciones WhatsApp en ese periodo.', 'warning');
                return;
            }
            const pct = round2((prom / 5) * 100);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(pct).replace('.', ',');
            const j = document.getElementById('kpi-json');
            if (j)
                j.value = JSON.stringify(
                    {
                        n_respuestas: n,
                        promedio_estrellas: round2(prom),
                        fuente_calculo: 'whatsapp_estrellas_1_a_5',
                    },
                    null,
                    0
                );
            toast(`Satisfacción ≈ ${pct}% (${n} resp., promedio ${round2(prom)}★)`, 'success');
            return;
        }
    } catch (e) {
        toastError('kpi-calc-neon', e);
    }
};

function leerUnidadKpiAdmin() {
    const sel = document.getElementById('kpi-unidad');
    const v = (sel?.value || '').trim();
    if (v === '__custom') return (document.getElementById('kpi-unidad-custom')?.value || '').trim().slice(0, 32);
    return v;
}

function limpiarFormKpiSnapshotAdmin() {
    const ids = [
        'kpi-metrica',
        'kpi-metrica-visible',
        'kpi-desde',
        'kpi-hasta',
        'kpi-valor',
        'kpi-notas',
        'kpi-json',
        'kpi-det-con-foto',
        'kpi-det-total-cierres',
        'kpi-det-conteo',
        'kpi-unidad-custom',
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const preset = document.getElementById('kpi-preset');
    if (preset) preset.value = '';
    const unidad = document.getElementById('kpi-unidad');
    if (unidad) unidad.value = '';
    aplicarKpiPresetAdmin();
}
window.limpiarFormKpiSnapshotAdmin = limpiarFormKpiSnapshotAdmin;

function populateKpiChartMetricaSelect(rows) {
    const sel = document.getElementById('kpi-chart-metrica');
    const wrap = document.getElementById('kpi-chart-wrap');
    if (!sel) return;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— Elegí métrica para el gráfico —';
    sel.appendChild(opt0);
    const keys = [...new Set((rows || []).map(r => r.metrica).filter(Boolean))].sort();
    keys.forEach(m => {
        const o = document.createElement('option');
        o.value = m;
        o.textContent = KPI_METRICA_ETIQUETAS[m] || m;
        sel.appendChild(o);
    });
    if (wrap && (!keys.length || (rows || []).length < 2)) wrap.style.display = 'none';
    for (let i = 1; i < sel.options.length; i++) {
        const m = sel.options[i].value;
        const n = (rows || []).filter(
            r => r.metrica === m && r.valor_numero != null && r.valor_numero !== '' && !Number.isNaN(Number(r.valor_numero))
        ).length;
        if (n >= 2) {
            sel.value = m;
            break;
        }
    }
}

/** Evolución por periodo (misma métrica, varios registros). Requiere Chart.js. */
window.renderKpiAdminHistoricoChart = function renderKpiAdminHistoricoChart() {
    const wrap = document.getElementById('kpi-chart-wrap');
    const sel = document.getElementById('kpi-chart-metrica');
    const canvas = document.getElementById('chart-kpi-admin');
    if (!wrap || !sel || !canvas || typeof Chart === 'undefined') {
        if (wrap) wrap.style.display = 'none';
        return;
    }
    const rows = window.__kpiAdminLastRows || [];
    const metrica = sel.value;
    if (!metrica || rows.length === 0) {
        wrap.style.display = 'none';
        if (window._chartKpiAdmin) {
            try {
                window._chartKpiAdmin.destroy();
            } catch (_) {}
            window._chartKpiAdmin = null;
        }
        return;
    }
    const points = rows
        .filter(
            r =>
                r.metrica === metrica &&
                r.valor_numero != null &&
                r.valor_numero !== '' &&
                !Number.isNaN(Number(r.valor_numero))
        )
        .map(r => ({
            label: String(r.periodo_fin || r.periodo_inicio || ''),
            y: Number(r.valor_numero),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    if (points.length < 2) {
        wrap.style.display = 'none';
        if (window._chartKpiAdmin) {
            try {
                window._chartKpiAdmin.destroy();
            } catch (_) {}
            window._chartKpiAdmin = null;
        }
        return;
    }
    wrap.style.display = 'block';
    const ctx = canvas.getContext('2d');
    if (window._chartKpiAdmin) {
        try {
            window._chartKpiAdmin.destroy();
        } catch (_) {}
        window._chartKpiAdmin = null;
    }
    const lab = KPI_METRICA_ETIQUETAS[metrica] || metrica;
    const kpiSoftLine = { border: '#5b7cba', fill: 'rgba(91, 124, 186, 0.12)' };
    const shortLabel = (s) => {
        const t = String(s || '').trim();
        if (!t) return '';
        const d = new Date(t);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' });
        }
        return t.length > 22 ? `${t.slice(0, 20)}…` : t;
    };
    window._chartKpiAdmin = new Chart(ctx, {
        type: 'line',
        data: {
            labels: points.map(p => shortLabel(p.label)),
            datasets: [
                {
                    label: lab,
                    data: points.map(p => p.y),
                    borderColor: kpiSoftLine.border,
                    backgroundColor: kpiSoftLine.fill,
                    tension: 0.25,
                    fill: true,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: kpiSoftLine.border,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.55,
            layout: { padding: { bottom: 8, top: 4 } },
            plugins: {
                legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } },
            },
            scales: {
                y: { beginAtZero: false, ticks: { font: { size: 10 } } },
                x: {
                    ticks: {
                        font: { size: 9 },
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10,
                    },
                },
            },
        },
    });
};

async function cargarKpiSnapshotsAdmin() {
    const host = document.getElementById('kpi-snapshots-lista');
    const sinTabla = document.getElementById('kpi-snapshots-sin-tabla');
    const formWrap = document.getElementById('kpi-snapshots-form-wrap');
    const btnRef = document.getElementById('kpi-btn-refrescar');
    const btnImp = document.getElementById('kpi-btn-imprimir');
    if (!host) return;
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) {
        host.innerHTML = '<span style="color:var(--re)">Sin conexión o sin permisos.</span>';
        return;
    }
    const okTabla = await adminKpiSnapshotsTablaExiste(true);
    if (!okTabla) {
        if (sinTabla) {
            sinTabla.style.display = 'block';
            sinTabla.innerHTML =
                '<strong>Tabla <code>kpi_snapshots</code> no encontrada.</strong> En el SQL Editor de Neon ejecutá el script del repo: <code>docs/NEON_kpi_snapshots.sql</code>. Luego tocá «Actualizar lista».';
        }
        if (formWrap) formWrap.style.display = 'none';
        if (btnRef) btnRef.style.display = 'none';
        if (btnImp) btnImp.style.display = 'none';
        host.innerHTML = '';
        return;
    }
    if (sinTabla) sinTabla.style.display = 'none';
    if (formWrap) formWrap.style.display = 'block';
    if (btnRef) btnRef.style.display = 'inline-flex';
    if (btnImp) btnImp.style.display = 'none';
    try {
        aplicarKpiPresetAdmin();
    } catch (_) {}
    host.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const tid = tenantIdActual();
    try {
        const r = await sqlSimple(
            `SELECT id, metrica, periodo_inicio, periodo_fin, valor_numero, valor_json, unidad, fuente, notas, created_at::text AS created_at
             FROM kpi_snapshots WHERE tenant_id = ${esc(tid)}
             ORDER BY periodo_inicio DESC NULLS LAST, metrica ASC LIMIT 200`
        );
        const rows = r.rows || [];
        window.__kpiAdminLastRows = rows;
        populateKpiChartMetricaSelect(rows);
        if (rows.length === 0) {
            host.innerHTML = '<p style="font-size:.85rem;color:var(--tl)">No hay KPIs guardados para este tenant.</p>';
            if (btnImp) btnImp.style.display = 'none';
            try {
                renderKpiAdminHistoricoChart();
            } catch (_) {}
            return;
        }
        if (btnImp) btnImp.style.display = 'inline-flex';
        const head =
            '<div style="overflow-x:auto;border:1px solid var(--bo);border-radius:.5rem"><table style="width:100%;border-collapse:collapse;font-size:.78rem"><thead><tr style="background:var(--bg);text-align:left">' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Métrica</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Desde</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Hasta</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Valor</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Unidad</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Fuente</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Alta (fecha)</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Alta (hora)</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)"><button type="button" class="btn-sm" style="padding:.2rem .45rem;font-size:.7rem;background:#dc2626;color:#fff;border:1px solid #dc2626;border-radius:.35rem" onclick="eliminarTodosKpiSnapshotsAdmin()">Eliminar todos</button></th></tr></thead><tbody>';
        const body = rows
            .map(row => {
                const vj = row.valor_json != null ? JSON.stringify(row.valor_json) : '{}';
                const vjShort = vj.length > 48 ? vj.slice(0, 45) + '…' : vj;
                const vn = row.valor_numero != null && row.valor_numero !== '' ? String(row.valor_numero) : '—';
                const labM = KPI_METRICA_ETIQUETAS[row.metrica];
                const al = splitFechaHoraExportAR(row.created_at);
                const celMetrica = labM
                    ? `<span style="font-weight:600">${_escOpt(labM)}</span><br><code style="font-size:.68rem;color:var(--tl)">${_escOpt(row.metrica)}</code>`
                    : `<code>${_escOpt(row.metrica)}</code>`;
                return (
                    `<tr><td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo);vertical-align:top">${celMetrica}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(fmtFechaKpiSnapshotCorta(row.periodo_inicio))}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(fmtFechaKpiSnapshotCorta(row.periodo_fin))}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(vn)}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(formatearUnidadKpiVista(row.unidad))}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(row.fuente || '')}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo);white-space:nowrap">${_escOpt(al.fecha)}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo);white-space:nowrap">${_escOpt(al.hora)}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">` +
                    `<button type="button" class="btn-sm" style="padding:.2rem .45rem;font-size:.72rem;background:var(--bg);border:1px solid var(--bo)" onclick="eliminarKpiSnapshotAdmin(${Number(row.id)})" title="${_escOpt(vjShort)}">Eliminar</button></td></tr>`
                );
            })
            .join('');
        host.innerHTML = head + body + '</tbody></table></div>';
        try {
            renderKpiAdminHistoricoChart();
        } catch (e) {
            console.warn('[kpi-chart]', e);
        }
    } catch (e) {
        logErrorWeb('kpi-snapshots-lista', e);
        host.innerHTML = '<span style="color:var(--re)">' + _escOpt(mensajeErrorUsuario(e)) + '</span>';
        window.__kpiAdminLastRows = [];
        populateKpiChartMetricaSelect([]);
        if (btnImp) btnImp.style.display = 'none';
    }
}
window.cargarKpiSnapshotsAdmin = cargarKpiSnapshotsAdmin;

async function guardarKpiSnapshotAdmin() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) {
        toast('Sin conexión o sin permisos.', 'error');
        return;
    }
    if (!(await adminKpiSnapshotsTablaExiste(true))) {
        toast('Creá la tabla kpi_snapshots en Neon (docs/NEON_kpi_snapshots.sql).', 'error');
        return;
    }
    const preset = (document.getElementById('kpi-preset')?.value || '').trim();
    if (!preset) {
        toast('Elegí qué tipo de indicador vas a cargar.', 'warning');
        return;
    }
    const desde = (document.getElementById('kpi-desde')?.value || '').trim();
    const hasta = (document.getElementById('kpi-hasta')?.value || '').trim();
    let valStr = (document.getElementById('kpi-valor')?.value || '').trim();
    const unidad = normalizarUnidadKpiParaGuardar(leerUnidadKpiAdmin());
    const fuente = 'computed_batch';
    const notas = (document.getElementById('kpi-notas')?.value || '').trim();
    const jsonRaw = (document.getElementById('kpi-json')?.value || '').trim();
    const metrica = (document.getElementById('kpi-metrica')?.value || '').trim();
    if (!metrica || !desde || !hasta) {
        toast('Falta la clave de la métrica o las fechas.', 'warning');
        return;
    }
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(metrica)) {
        toast('Clave de métrica: solo letras, números, punto, guión y _ (máx. 100).', 'warning');
        return;
    }
    if (desde > hasta) {
        toast('«Desde» no puede ser posterior a «Hasta».', 'warning');
        return;
    }
    if (document.getElementById('kpi-unidad')?.value === '__custom' && !unidad) {
        toast('Escribí la unidad personalizada o elegí otra opción.', 'warning');
        return;
    }
    const meta = KPI_ADMIN_PRESET_META[preset] || KPI_ADMIN_PRESET_META[''];
    let valorJson = {};
    if (preset === 'pct_cierres_con_foto') {
        const cf = parseInt(document.getElementById('kpi-det-con-foto')?.value, 10);
        const tot = parseInt(document.getElementById('kpi-det-total-cierres')?.value, 10);
        if (Number.isFinite(cf) && Number.isFinite(tot)) {
            if (tot <= 0) {
                toast('«Cierres en total» debe ser mayor que cero.', 'warning');
                return;
            }
            if (cf > tot) {
                toast('«Con foto» no puede ser mayor que el total de cierres.', 'warning');
                return;
            }
            valorJson = { cerrados_con_foto: cf, cerrados_total: tot };
            if (valStr === '') valStr = String(Math.round((cf / tot) * 10000) / 100);
        }
        if (Object.keys(valorJson).length === 0 && valStr === '') {
            toast('Completá «con foto» y «total» o escribí el porcentaje en valor principal.', 'warning');
            return;
        }
    } else if (meta && meta.detail === 'conteo' && meta.jsonKey) {
        const cnt = parseInt(document.getElementById('kpi-det-conteo')?.value, 10);
        if (Number.isFinite(cnt)) {
            valorJson = { [meta.jsonKey]: cnt };
            if (valStr === '') valStr = String(cnt);
        }
        if (Object.keys(valorJson).length === 0 && valStr === '') {
            toast('Completá la cantidad o el valor principal.', 'warning');
            return;
        }
    } else if (
        ['tiempo_respuesta_horas', 'satisfaccion_pct', 'saifi', 'saidi', 'pct_bacheo_48h', 'pct_alumbrado_24h'].includes(preset)
    ) {
        if (valStr === '') {
            toast('Completá el valor principal.', 'warning');
            return;
        }
    }
    if (preset === 'satisfaccion_pct') {
        const jx = (document.getElementById('kpi-json')?.value || '').trim();
        if (jx) {
            try {
                const o = JSON.parse(jx);
                if (o && typeof o === 'object' && !Array.isArray(o)) {
                    valorJson = { ...valorJson, ...o };
                }
            } catch (_) {
                /* ignorar JSON auxiliar inválido */
            }
        }
    }
    let valorNumSql = 'NULL';
    if (valStr !== '') {
        const n = Number(valStr.replace(',', '.'));
        if (!Number.isFinite(n)) {
            toast('Valor numérico no válido.', 'warning');
            return;
        }
        valorNumSql = esc(n);
    }
    const unidadSql = unidad === '' ? 'NULL' : esc(unidad.slice(0, 32));
    const notasSql = notas === '' ? 'NULL' : esc(notas);
    const tid = tenantIdActual();
    const uid = app.u && app.u.id != null ? Number(app.u.id) : null;
    const uidSql = uid != null && Number.isFinite(uid) ? esc(uid) : 'NULL';
    const jsonStr = JSON.stringify(valorJson);
    try {
        await sqlSimple(
            `INSERT INTO kpi_snapshots (tenant_id, metrica, periodo_inicio, periodo_fin, valor_numero, valor_json, unidad, fuente, notas, created_by_usuario_id)
             VALUES (${esc(tid)}, ${esc(metrica)}, ${esc(desde)}::date, ${esc(hasta)}::date, ${valorNumSql}, ${esc(jsonStr)}::jsonb, ${unidadSql}, ${esc(fuente)}, ${notasSql}, ${uidSql})
             ON CONFLICT (tenant_id, metrica, periodo_inicio, periodo_fin)
             DO UPDATE SET valor_numero = EXCLUDED.valor_numero, valor_json = EXCLUDED.valor_json, unidad = EXCLUDED.unidad, fuente = EXCLUDED.fuente, notas = EXCLUDED.notas, created_at = NOW(), created_by_usuario_id = EXCLUDED.created_by_usuario_id`
        );
        toast('KPI guardado.', 'success');
        await cargarKpiSnapshotsAdmin();
    } catch (e) {
        toastError('kpi-snapshot-guardar', e, 'No se pudo guardar.');
    }
}
window.guardarKpiSnapshotAdmin = guardarKpiSnapshotAdmin;

async function eliminarKpiSnapshotAdmin(id) {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    const nid = Number(id);
    if (!Number.isFinite(nid) || nid <= 0) return;
    if (!confirm('¿Eliminar este registro de KPI?')) return;
    if (!(await adminKpiSnapshotsTablaExiste(true))) return;
    const tid = tenantIdActual();
    try {
        await sqlSimple(
            `DELETE FROM kpi_snapshots WHERE id = ${esc(nid)} AND tenant_id = ${esc(tid)}`
        );
        toast('Eliminado.', 'success');
        await cargarKpiSnapshotsAdmin();
    } catch (e) {
        toastError('kpi-snapshot-eliminar', e, 'No se pudo eliminar.');
    }
}
window.eliminarKpiSnapshotAdmin = eliminarKpiSnapshotAdmin;

async function eliminarTodosKpiSnapshotsAdmin() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    const rows = window.__kpiAdminLastRows;
    if (!Array.isArray(rows) || !rows.length) { toast('No hay registros para eliminar.', 'info'); return; }
    if (!confirm(`¿Eliminar TODOS los ${rows.length} registros de KPI? Esta acción no se puede deshacer.`)) return;
    if (!(await adminKpiSnapshotsTablaExiste(true))) return;
    const tid = tenantIdActual();
    try {
        await sqlSimple(`DELETE FROM kpi_snapshots WHERE tenant_id = ${esc(tid)}`);
        toast('Todos los registros eliminados.', 'success');
        await cargarKpiSnapshotsAdmin();
    } catch (e) {
        toastError('kpi-snapshot-eliminar-todos', e, 'No se pudo eliminar.');
    }
}
window.eliminarTodosKpiSnapshotsAdmin = eliminarTodosKpiSnapshotsAdmin;

/** Puntos ordenados para la métrica elegida en el selector del gráfico (misma lógica que el chart). */
function kpiAdminPuntosTendencia(rows, metrica) {
    if (!metrica || !Array.isArray(rows) || !rows.length) return [];
    return rows
        .filter(
            r =>
                r.metrica === metrica &&
                r.valor_numero != null &&
                r.valor_numero !== '' &&
                !Number.isNaN(Number(r.valor_numero))
        )
        .map(r => ({
            label: String(r.periodo_fin || r.periodo_inicio || ''),
            y: Number(r.valor_numero),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** Snapshots con valor_numero agrupados por código de métrica (para PDF multi-gráfico). */
function kpiAgruparSnapshotsNumericosPorMetrica(rows) {
    const map = new Map();
    for (const row of rows || []) {
        if (row.valor_numero == null || row.valor_numero === '' || Number.isNaN(Number(row.valor_numero))) continue;
        const m = String(row.metrica || 'sin_metrica');
        if (!map.has(m)) map.set(m, []);
        map.get(m).push(row);
    }
    return map;
}

function kpiPuntosDesdeFilasSnapshot(filas) {
    return (filas || [])
        .map((r) => {
            const pf = fmtFechaKpiSnapshotCorta(r.periodo_fin);
            const pi = fmtFechaKpiSnapshotCorta(r.periodo_inicio);
            const lab = pf && pi && pf !== pi ? `${pi}→${pf}` : pf || pi || String(r.created_at || '').slice(0, 10);
            return { label: lab || '—', y: Number(r.valor_numero) };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

function textoBreveInterpretacionKpi(rows, metricaSel, points) {
    const parts = [];
    parts.push(
        'Este informe resume los KPI guardados para el tenant actual: cada fila es un valor agregado para un periodo (fechas desde/hasta), con unidad y origen del dato.'
    );
    if (points.length >= 2) {
        const lab = KPI_METRICA_ETIQUETAS[metricaSel] || metricaSel;
        const v0 = points[0].y;
        const v1 = points[points.length - 1].y;
        const d = v1 - v0;
        const base = Math.max(Math.abs(v0), Math.abs(v1), 1e-6) * 0.02 + 1e-6;
        let tend = 'se mantiene estable entre el primer y el último periodo con datos';
        if (d > base) tend = 'tiene tendencia al alza entre el primer y el último periodo';
        else if (d < -base) tend = 'tiene tendencia a la baja entre el primer y el último periodo';
        parts.push(
            `La métrica «${lab}» ${tend} (aprox. ${v0} → ${v1}). Interpretá el cambio con contexto (muestra, estacionalidad o campañas) antes de tomar decisiones.`
        );
    } else if (metricaSel) {
        parts.push(
            'Para ver una curva de tendencia hacen falta al menos dos valores numéricos de la misma métrica en periodos distintos; igualmente se listan todos los registros abajo.'
        );
    }
    parts.push('Documento para uso interno y seguimiento de piloto comercial.');
    return parts.join(' ');
}

function kpiPdfTruncCell(s, max) {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    return t.slice(0, Math.max(1, max - 1)) + '…';
}

/** Fuente compacta para tabla KPI en A4 (evita solapamiento entre columnas). */
const KPI_PDF_TAB_FS = 6.2;
const KPI_PDF_TAB_HDR_FS = 6.8;
const KPI_PDF_TAB_LINE_MM = 2.35;

/**
 * Dibuja una fila de tabla con texto envuelto al ancho de cada columna (no invade la siguiente).
 * @returns {number} nueva coordenada Y (baseline última línea aprox. + margen).
 */
function kpiPdfDibujarFilaTablaKpi(pdf, margin, y, cols, opts) {
    const lineH = opts?.lineH ?? KPI_PDF_TAB_LINE_MM;
    const fontSize = opts?.fontSize ?? KPI_PDF_TAB_FS;
    const bold = !!opts?.bold;
    const rgb = opts?.rgb ?? (bold ? [30, 41, 59] : [15, 23, 42]);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(fontSize);
    pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
    pdf.setCharSpace(0);
    let x = margin;
    let maxLines = 1;
    const bloques = cols.map((c) => {
        const innerW = Math.max(3.5, c.w - 0.45);
        const raw = String(c.t ?? '').replace(/\s+/g, ' ').trim();
        const lines = pdf.splitTextToSize(raw, innerW);
        maxLines = Math.max(maxLines, lines.length || 1);
        const bx = x;
        x += c.w;
        return { bx, lines: lines.length ? lines : [''] };
    });
    const y0 = y;
    bloques.forEach((b) => {
        b.lines.forEach((line, li) => {
            pdf.text(line, b.bx, y0 + li * lineH);
        });
    });
    const altura = maxLines * lineH + (opts?.extraBottom ?? 0.9);
    return y0 + altura;
}

function kpiPdfDibujarCabeceraTabla(pdf, margin, y) {
    const cols = [
        { w: 50, t: 'Métrica' },
        { w: 19, t: 'Desde' },
        { w: 19, t: 'Hasta' },
        { w: 13, t: 'Valor' },
        { w: 17, t: 'Unidad' },
        { w: 20, t: 'Fuente' },
        { w: 22, t: 'Alta fecha' },
        { w: 22, t: 'Alta hora' },
    ];
    const yAfter = kpiPdfDibujarFilaTablaKpi(pdf, margin, y, cols, {
        bold: true,
        fontSize: KPI_PDF_TAB_HDR_FS,
        lineH: KPI_PDF_TAB_LINE_MM,
        extraBottom: 0.35,
    });
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.22);
    pdf.line(margin, yAfter + 0.5, margin + 182, yAfter + 0.5);
    return yAfter + 2.2;
}

function kpiPdfPiePaginas(pdf) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const n = pdf.internal.getNumberOfPages();
    const ent = kpiPdfTruncCell(String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova', 48);
    for (let i = 1; i <= n; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.3);
        pdf.line(12, pageH - 10, pageW - 12, pageH - 10);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.6);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Página ${i} de ${n} · ${ent}`, pageW / 2, pageH - 6, { align: 'center' });
    }
}

/** PDF A4 listo para imprimir: encabezado empresa, texto breve, un gráfico compacto por tipo de métrica y tabla de snapshots. */
window.imprimirInformeKpiPiloto = async function imprimirInformeKpiPiloto() {
    if (!esAdmin()) {
        toast('Solo administrador', 'error');
        return;
    }
    gnCerrarModalPedidoDetalleSiAbierto();
    if (modoOffline || !NEON_OK) {
        toast('Requiere conexión', 'error');
        return;
    }
    const rows = window.__kpiAdminLastRows;
    if (!rows || !rows.length) {
        toast('Primero tocá «Actualizar lista» en KPI piloto para cargar los datos.', 'warning');
        return;
    }
    if (!window.jspdf?.jsPDF) {
        toast('Falta la librería jsPDF. Recargá la página.', 'error');
        return;
    }
    if (typeof Chart === 'undefined') {
        toast('Chart.js no está cargado; recargá la página e intentá de nuevo.', 'error');
        return;
    }
    try {
        toast('Generando informe con IA…', 'info');
        const { loadKpiInformePdfDeps } = await import('./modules/app-kpi-informe-pdf-loaders.js');
        const K = await loadKpiInformePdfDeps();
        const iaMapPromise = K.obtenerExplicacionesKpiIA(rows).catch(() => new Map());
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 14;
        const maxW = pageW - 2 * margin;
        const lineaGen = `Documento generado el ${new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.`;
        let y = await pdfEncabezadoEmpresaBloque(pdf, margin, pageW, margin, {
            variante: 'kpi',
            lineaContexto: lineaGen,
        });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(51, 65, 85);
        const intro = K.introInformeKpiPdfLegible(rows);
        const introRaw = pdf.splitTextToSize(intro, maxW);
        const introLines = Array.isArray(introRaw) ? introRaw : String(introRaw || '').split('\n').filter(Boolean);
        const lineH = 3.5;
        for (let li = 0; li < introLines.length; li++) {
            if (y + lineH > pageH - 14) { pdf.addPage(); y = margin; }
            pdf.text(introLines[li], margin, y);
            y += lineH;
        }
        y += 4;
        pdf.setDrawColor(30, 58, 138);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, margin + 42, y);
        y += 3;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(30, 58, 138);
        if (y + 8 > pageH - 14) { pdf.addPage(); y = margin; }
        pdf.text('Indicadores por tipo', margin, y);
        y += 6;
        pdf.setFont('helvetica', 'normal');
        const porMetrica = kpiAgruparSnapshotsNumericosPorMetrica(rows);
        const keysOrden = [...porMetrica.keys()].sort((a, b) => a.localeCompare(b));
        const hMmMax = 88;
        const iaMap = await iaMapPromise;
        for (const mk of keysOrden) {
            const filasM = porMetrica.get(mk);
            const pts = kpiPuntosDesdeFilasSnapshot(filasM);
            if (!pts.length) continue;
            const labelLegible = KPI_METRICA_ETIQUETAS[mk] || K.formatearMetricaKeyLegible(mk);
            const narr = K.lineasNarrativaMetricaKpiPdf(mk, filasM, {
                fmtFechaCorta: fmtFechaKpiSnapshotCorta,
                KPI_METRICA_ETIQUETAS,
            });
            pdf.setTextColor(30, 41, 59);
            narr.forEach((nl, idx) => {
                if (nl == null || !String(nl).trim()) { y += 1.5; return; }
                const t = String(nl);
                const isIt = t.startsWith('*') && t.endsWith('*') && t.length > 2;
                const raw = isIt ? t.slice(1, -1) : t;
                const tituloBloque = idx === 0 && !isIt;
                pdf.setFont('helvetica', tituloBloque ? 'bold' : isIt ? 'italic' : 'normal');
                pdf.setFontSize(tituloBloque ? 9.5 : 8.5);
                if (tituloBloque) pdf.setTextColor(30, 58, 138);
                else pdf.setTextColor(51, 65, 85);
                const split = pdf.splitTextToSize(raw, maxW);
                split.forEach((line) => {
                    if (y + lineH > pageH - 14) { pdf.addPage(); y = margin; }
                    pdf.text(line, margin, y);
                    y += lineH;
                });
            });
            y += 2;
            const dataUrl = await K.kpiPdfMiniChartDataUrl(labelLegible, pts);
            if (!dataUrl) continue;
            let hMm = Math.min(hMmMax, Math.max(24, 10 + pts.length * 4.6));
            let wMm = Math.min(maxW, 190);
            if (y + hMm + 3.5 > pageH - 14) { pdf.addPage(); y = margin; }
            try {
                pdf.addImage(dataUrl, 'PNG', margin, y, wMm, hMm);
            } catch (_) {
                pdf.setFontSize(7.5);
                pdf.setTextColor(100, 116, 139);
                pdf.text(`(No se pudo embeber el gráfico «${kpiPdfTruncCell(labelLegible, 40)}»)`, margin, y + 4);
                hMm = 6;
            }
            y += hMm + 3;
            y = K.kpiPdfRenderIaBlock(pdf, iaMap.get(mk), { y, margin, maxW, pageH });
            try {
                pdf.setCharSpace(0);
            } catch (_) {}
            y += 2;
        }
        if (y + 14 > pageH - 14) {
            pdf.addPage();
            y = margin;
        }
        pdf.setDrawColor(30, 58, 138);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, margin + 42, y);
        y += 3;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(30, 58, 138);
        pdf.text('Detalle por periodo', margin, y);
        y += 6;
        y = kpiPdfDibujarCabeceraTabla(pdf, margin, y);
        for (let ri = 0; ri < rows.length; ri++) {
            const row = rows[ri];
            const labM = KPI_METRICA_ETIQUETAS[row.metrica] || K.formatearMetricaKeyLegible(row.metrica);
            const vn = row.valor_numero != null && row.valor_numero !== '' ? String(row.valor_numero) : '—';
            const al = splitFechaHoraExportAR(row.created_at);
            const cells = [
                { w: 50, t: labM },
                { w: 19, t: fmtFechaKpiSnapshotCorta(row.periodo_inicio) || '—' },
                { w: 19, t: fmtFechaKpiSnapshotCorta(row.periodo_fin) || '—' },
                { w: 13, t: vn },
                { w: 17, t: formatearUnidadKpiVista(row.unidad) || '—' },
                { w: 20, t: K.legibleFuenteKpi(row.fuente) },
                { w: 22, t: al.fecha || '' },
                { w: 22, t: al.hora || '' },
            ];
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(KPI_PDF_TAB_FS);
            const estMetric = pdf.splitTextToSize(String(labM).trim(), 49.55).length || 1;
            const rowEstH = estMetric * KPI_PDF_TAB_LINE_MM + 1.35;
            if (y + rowEstH > pageH - 14) {
                pdf.addPage();
                y = margin + 2;
                y = kpiPdfDibujarCabeceraTabla(pdf, margin, y);
            }
            y = kpiPdfDibujarFilaTablaKpi(pdf, margin, y, cells, {
                bold: false,
                fontSize: KPI_PDF_TAB_FS,
                lineH: KPI_PDF_TAB_LINE_MM,
                extraBottom: 0.25,
                rgb: [15, 23, 42],
            });
        }
        kpiPdfPiePaginas(pdf);
        const blob = pdf.output('blob');
        const modo = K.abrirPdfBlobParaImpresion(blob, `informe-kpi-${tenantIdActual()}.pdf`);
        if (modo === 'ventana') {
            toast('Informe listo — se abrió la vista de impresión.', 'success');
        } else if (modo === 'descarga') {
            toast(
                'El PDF se guardó en Descargas (WebView no abre ventanas nuevas). Abrilo desde ahí para imprimir.',
                'success'
            );
        } else {
            toast('No se pudo generar el archivo PDF.', 'error');
        }
    } catch (e) {
        toastError('kpi-informe-pdf', e);
    }
};

function adminTab(tab) {
    try {
        const ap = document.getElementById('admin-panel');
        if (ap && ap.classList.contains('active')) {
            void ensureAdminPanelDeferredBindings(() => _depsAdminPanelDeferred());
        }
    } catch (_) {}
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const tabs = document.querySelectorAll('#admin-panel .admin-tab');
    const idx = _ADMIN_TAB_ORDER.indexOf(tab);
    if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');
    const sec = document.getElementById('admin-' + tab);
    if (sec) sec.classList.add('active');
    if (tab === 'estadisticas') {
        void import('./modules/estadisticas-chart-plugins.js').then((m) => m.initGNChartPercentPlugins()).catch(() => {});
        cargarEstadisticas();
        try { if (typeof window._gnInitBotonAnalizarIA === 'function') window._gnInitBotonAnalizarIA(); } catch (_) {}
        try { if (typeof window._gnInitBotonInformeUnificado === 'function') window._gnInitBotonInformeUnificado(); } catch (_) {}
    }
    if (tab === 'kpi') {
        try {
            syncKpiAdminRubroDom();
        } catch (_) {}
        void cargarKpiSnapshotsAdmin();
        try { if (typeof window._gnInitBotonSugerirKpis === 'function') window._gnInitBotonSugerirKpis(); } catch (_) {}
    }
    if (tab === 'usuarios') cargarListaUsuarios();
    if (tab === 'distribuidores') cargarListaDistribuidoresAdmin();
    if (tab === 'saidi-excel') {
        const pre = document.getElementById('admin-saidi-excel-result');
        if (pre && !pre.textContent.trim()) pre.style.display = 'none';
    }
    if (tab === 'red-electrica') {
        const pre = document.getElementById('admin-red-electrica-result');
        if (pre && !pre.querySelector('.gn-import-result-panel')) pre.style.display = 'none';
        void cargarListaRedElectricaInfra({
            getApiToken,
            apiUrl,
            toast,
        });
    }
    if (tab === 'socios') {
        try {
            if (typeof actualizarUiSociosImportCrs === 'function') actualizarUiSociosImportCrs();
        } catch (_) {}
        try {
            if (typeof actualizarUiSociosVistaProyeccion === 'function') actualizarUiSociosVistaProyeccion();
        } catch (_) {}
        try { if (typeof window._gnInitBotonAnalizarIA === 'function') window._gnInitBotonAnalizarIA(); } catch (_) {}
        void import('./modules/admin-socios-tab-load.js').then((m) => m.cargarListaSociosAdminAlAbrirTab());
        try {
            syncHistorialNisBusquedaDom();
        } catch (_) {}
        try {
            if (typeof window.syncSociosBusquedaPadronLabels === 'function') window.syncSociosBusquedaPadronLabels();
        } catch (_) {}
        if (!document.getElementById('nis-historial-item-style')) {
            const st = document.createElement('style');
            st.id = 'nis-historial-item-style';
            st.textContent =
                '.nis-historial-item:hover,.nis-historial-item:focus-visible{border-color:#2563eb!important;box-shadow:0 0 0 2px rgba(37,99,235,.22);outline:none;background:#f8fafc!important}';
            document.head.appendChild(st);
        }
        const inpNisHist = document.getElementById('historial-nis-input');
        if (inpNisHist && !inpNisHist.dataset.enterBuscarNis) {
            inpNisHist.dataset.enterBuscarNis = '1';
            inpNisHist.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    buscarHistorialPorNIS();
                }
            });
        }
    }
    if (tab === 'empresa') {
        void cargarFormEmpresa();
        try {
            syncDerivacionesTercerosWrap();
        } catch (_) {}
    }
    if (tab === 'mapa-usuarios') iniciarMapaUsuariosAdmin();
    if (tab === 'historicos') {
        void ensureAdminHistoricosTabReady(() => _depsAdminPanelDeferred());
    }
    if (tab === 'contrasena') {
        try {
            window.sincronizarFormularioAdminContrasenaDesdeSesion?.();
        } catch (_) {}
    }
}

function cerrarAdminPanel() {
    const p = document.getElementById('admin-panel');
    if (!p) return;
    p.classList.remove('active', 'admin-panel--maximized');
    syncAdminPanelMaxButtons();
}
window.cerrarAdminPanel = cerrarAdminPanel;

function _depsAdminPanelDeferred() {
    return {
        esAdmin,
        toast,
        toastError,
        gnCerrarModalPedidoDetalleSiAbierto,
        neonOk: () => NEON_OK,
        sqlReady: () => typeof _sql !== 'undefined' && !!_sql,
        modoOffline: () => !!modoOffline,
        sqlSimple,
        sqlSimpleSelectAllPages,
        pedidosFiltroTenantSql,
        resolveCondicionFechaPedidosStats,
        esc,
        tenantIdActual,
        normalizarRubroEmpresa,
        esMunicipioRubro,
        esCooperativaAguaRubro,
        cargarListaDistribuidoresAdmin: () => cargarListaDistribuidoresAdmin(),
        cargarDistribuidores: () => cargarDistribuidores(),
        normalizarWhatsappInternacionalDesdeInput,
        setDerivacionesInlineError,
        actualizarBotonesWhatsappDerivacionesUi,
        refrescarPedidos: () => cargarPedidos({ silent: true }),
        cerrarAdminPanel,
        getApiToken,
        apiUrl,
        esCooperativaElectricaRubro,
        debeOcultarTabDistribuidoresAdmin,
        sociosCatalogoTieneTenantId,
        sociosCatalogoTieneDatosExtra,
        mostrarOverlayImportacion,
        actualizarOverlayImportacion,
        ocultarOverlayImportacion,
        nominatimFetchSearch: _nominatimFetchSearch,
    };
}
if (typeof window !== 'undefined') {
    window.__gnDepsAdminPanelDeferred = _depsAdminPanelDeferred;
    window.__gnUsuarioNombresDeps = () => ({
        neonOk: () => NEON_OK,
        modoOffline: () => !!modoOffline,
        sqlReady: () => typeof _sql !== 'undefined' && !!_sql,
        sqlSimple,
        esc,
        sqlFiltroUsuariosPorTenant,
    });
}

function syncAdminPanelMaxButtons() {
    const p = document.getElementById('admin-panel');
    const maxed = !!(p && p.classList.contains('admin-panel--maximized'));
    const bMax = document.getElementById('admin-panel-btn-max');
    const bRest = document.getElementById('admin-panel-btn-restore');
    if (bMax) bMax.style.display = maxed ? 'none' : '';
    if (bRest) bRest.style.display = maxed ? '' : 'none';
}

function toggleAdminPanelMaximized() {
    const p = document.getElementById('admin-panel');
    if (!p || !p.classList.contains('active')) return;
    p.classList.toggle('admin-panel--maximized');
    syncAdminPanelMaxButtons();
    try {
        window.dispatchEvent(new Event('resize'));
    } catch (_) {}
}
window.toggleAdminPanelMaximized = toggleAdminPanelMaximized;

function syncDashboardModalMaxButtons() {
    const m = document.getElementById('modal-dashboard-gerencia');
    const maxed = !!(m && m.classList.contains('modal-dash--maximized'));
    const bMax = document.getElementById('dashboard-modal-btn-max');
    const bRest = document.getElementById('dashboard-modal-btn-restore');
    if (bMax) bMax.style.display = maxed ? 'none' : '';
    if (bRest) bRest.style.display = maxed ? '' : 'none';
}

function toggleDashboardModalMaximized() {
    const m = document.getElementById('modal-dashboard-gerencia');
    if (!m || !m.classList.contains('active')) return;
    m.classList.toggle('modal-dash--maximized');
    syncDashboardModalMaxButtons();
    try {
        window.dispatchEvent(new Event('resize'));
    } catch (_) {}
}
window.toggleDashboardModalMaximized = toggleDashboardModalMaximized;

function cerrarModalDashboardGerencia() {
    const m = document.getElementById('modal-dashboard-gerencia');
    if (m) m.classList.remove('active', 'modal-dash--maximized');
    syncDashboardModalMaxButtons();
}
window.cerrarModalDashboardGerencia = cerrarModalDashboardGerencia;

function abrirModalAcercaDe() {
    const modal = document.getElementById('modal-acerca-de');
    const vLine = document.getElementById('acerca-version-line');
    if (vLine) {
        let v = GN_VERSION_WEB;
        if (esAndroidApp && window.AndroidConfig && typeof window.AndroidConfig.getAppVersion === 'function') {
            try {
                v = String(window.AndroidConfig.getAppVersion());
            } catch (_) {}
        }
        vLine.textContent =
            'Versión: ' + v + (esAndroidApp ? ' (aplicación Android)' : ' (web / PWA)');
    }
    modal?.classList.add('active');
}
window.abrirModalAcercaDe = abrirModalAcercaDe;

function cerrarModalAcercaDe() {
    document.getElementById('modal-acerca-de')?.classList.remove('active');
}
window.cerrarModalAcercaDe = cerrarModalAcercaDe;

function abrirAdmin() {
    const p = document.getElementById('admin-panel');
    if (!p) return;
    p.classList.remove('admin-panel--maximized');
    syncAdminPanelMaxButtons();
    p.classList.add('active');
    try {
        aplicarVisibilidadTabsAdminRedElectrica();
    } catch (_) {}
    adminTab('empresa');
    cargarFormEmpresa();
}
window.abrirAdmin = abrirAdmin;

// ── Empresa config ────────────────────────────────────────────
function empresaIdentidadEdicionBloqueada() {
    const cfg = window.EMPRESA_CFG || {};
    const b = String(cfg.empresa_identidad_bloqueada || '').toLowerCase();
    if (b === '1' || b === 'true' || b === 'sí' || b === 'si') return true;
    return !!(window.__PMG_TENANT_BRANDING__ && window.__PMG_TENANT_BRANDING__.setup_wizard_completado);
}

function aplicarBloqueoIdentidadEmpresaFormulario() {
    const lock = empresaIdentidadEdicionBloqueada();
    const nombre = document.getElementById('cfg-nombre');
    const tipo = document.getElementById('cfg-tipo');
    [nombre, tipo].forEach((el) => {
        if (!el) return;
        el.readOnly = !!lock;
        el.title = lock ? 'Definido en el setup inicial — no editable' : '';
    });
}

async function cargarFormEmpresa() {
    try {
        const r = await sqlSimple("SELECT clave, valor FROM empresa_config");
        const cfg = {};
        (r.rows || []).forEach(row => { cfg[row.clave] = row.valor; });
        const cfgMultitenantNeon =
            NEON_OK && typeof sqlSimple === 'function' ? await neonPedidosTieneColumnaTenantId() : false;
        document.getElementById('cfg-nombre').value    = cfg.nombre || '';
        document.getElementById('cfg-tipo').value      = cfg.tipo || '';
        const subIn = document.getElementById('cfg-subtitulo');
        if (subIn) subIn.value = GN_SUBTITULO_FIJO;
        const mailEl = document.getElementById('cfg-email');
        const telEl = document.getElementById('cfg-telefono');
        if (mailEl) mailEl.value = cfgMultitenantNeon ? '' : (cfg.email_contacto || '');
        if (telEl) telEl.value = cfgMultitenantNeon ? '' : (cfg.telefono || '');
        if (cfgMultitenantNeon) {
            const pe = document.getElementById('cfg-provincia-nominatim');
            if (pe) pe.value = '';
        }
        const fam = document.getElementById('cfg-coord-familia');
        const modo = document.getElementById('cfg-coord-modo');
        if (fam) {
            const v = cfg.coord_proy_familia || 'none';
            fam.value = ['none', 'inchauspe', 'posgar94', 'posgar98', 'posgar2007'].includes(v) ? v : 'none';
        }
        if (modo) {
            const mv = cfg.coord_proy_modo || 'punto';
            modo.value = ['punto', 'instal', '1', '2', '3', '4', '5', '6', '7'].includes(mv) ? mv : 'punto';
        }
        syncCoordModoVisibility();
        aplicarBloqueoIdentidadEmpresaFormulario();
        syncDerivacionesTercerosWrap();
        if (esAdmin()) {
            try {
                await asegurarJwtApiRest();
                const token = getApiToken();
                if (token) {
                    const rcfg = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (rcfg.status === 401) {
                        if (document.getElementById('admin-derivacion-terceros-wrap')) {
                            setDerivacionesInlineError('Iniciá sesión de nuevo para cargar la derivación.');
                        }
                    } else if (rcfg.status === 403) {
                        if (document.getElementById('admin-derivacion-terceros-wrap')) {
                            setDerivacionesInlineError('Sin permiso para leer la configuración del tenant.');
                        }
                    } else if (rcfg.ok) {
                        const j = await rcfg.json().catch(() => ({}));
                        let apiCfg = j.cliente?.configuracion;
                        if (typeof apiCfg === 'string') {
                            try {
                                apiCfg = JSON.parse(apiCfg);
                            } catch (_) {
                                apiCfg = {};
                            }
                        }
                        apiCfg = apiCfg && typeof apiCfg === 'object' ? apiCfg : {};
                        aplicarConfiguracionJsonClienteEnEmpresaCfg(apiCfg);
                        if (document.getElementById('admin-derivacion-terceros-wrap')) {
                            setDerivacionesInlineError('');
                        }
                    }
                }
            } catch (_) {}
        }
        bindDerivacionesFormInputsOnce();
        poblarFormDerivacionesDesdeEmpresaCfg();
        sincronizarCamposWhatsappArAreaDesdeEmpresaCfg();
        const provEl = document.getElementById('cfg-provincia-nominatim');
        if (provEl) {
            const ec = window.EMPRESA_CFG || {};
            const cur = String(ec.provincia || ec.provincia_nominatim || ec.state || '').trim();
            if (cur) provEl.value = cur;
        }
        const ohRed = document.getElementById('cfg-ocultar-redes-help');
        if (ohRed) ohRed.style.removeProperty('display');
        try {
            const ec = window.EMPRESA_CFG || {};
            sincronizarFirmaIdentidadTenantDesdeValores(ec.nombre || cfg.nombre, ec.tipo || cfg.tipo);
        } catch (_) {}
        try {
            const ec = window.EMPRESA_CFG || {};
            const calleIn = document.getElementById('cfg-calle');
            const numIn = document.getElementById('cfg-numero');
            if (calleIn) calleIn.value = String(ec.calle || '').trim();
            if (numIn) numIn.value = String(ec.numero || '').trim();
        } catch (_) {}
    } catch(e) { console.warn(e); }
}

async function guardarConfigEmpresa() {
    const saveBtn = document.getElementById('cfg-guardar-empresa');
    const famEl = document.getElementById('cfg-coord-familia');
    const modoEl = document.getElementById('cfg-coord-modo');
    const famVal = famEl ? famEl.value : 'none';
    const modoVal = modoEl ? modoEl.value : 'punto';
    const lockIdent = empresaIdentidadEdicionBloqueada();
    const prev = window.EMPRESA_CFG || {};
    const campos = {
        nombre: lockIdent
            ? String(prev.nombre || '').trim()
            : document.getElementById('cfg-nombre').value.trim(),
        tipo: lockIdent
            ? String(prev.tipo || '').trim()
            : document.getElementById('cfg-tipo').value.trim(),
        subtitulo: GN_SUBTITULO_FIJO,
        email_contacto: document.getElementById('cfg-email').value.trim(),
        telefono:       document.getElementById('cfg-telefono').value.trim(),
        coord_proy_familia: famVal,
        coord_proy_modo: famVal === 'none' ? 'punto' : modoVal
    };
    const firmaNueva = firmaIdentidadTenant(campos.nombre, campos.tipo);
    const firmaGuardada = leerFirmaIdentidadAlmacenada();
    if (firmaNueva !== firmaGuardada && esAdmin()) {
        vaciarDerivacionesTercerosFormularioAdmin();
        try {
            invalidarCachesTrasCambioIdentidadTenant();
        } catch (_) {}
    }
    let derivacionReclamosPayload = null;
    if (document.getElementById('admin-derivacion-terceros-wrap')) {
        try {
            derivacionReclamosPayload = construirDerivacionReclamosDesdeFormularioDerivaciones();
        } catch (e) {
            const m = e?.message || String(e);
            setDerivacionesInlineError(m);
            toast(m, 'error');
            return;
        }
    }
    setDerivacionesInlineError('');
    let apiSaveFailed = false;
    if (saveBtn) saveBtn.disabled = true;
    try {
        for (const [k, v] of Object.entries(campos)) {
            await sqlSimple(`INSERT INTO empresa_config(clave, valor) VALUES(${esc(k)}, ${esc(v)})
                ON CONFLICT(clave) DO UPDATE SET valor = ${esc(v)}, actualizado = NOW()`);
        }
        let marcaApiOk = true;
        if (esAdmin()) {
            try {
                await asegurarJwtApiRest();
                const token = getApiToken();
                if (token) {
                    /** Solo publicar marca aquí; setup_wizard_completado lo pone el wizard al Finalizar. */
                    const body = {
                        configuracion: {
                            marca_publicada_admin: true,
                            ocultar_modulos_redes: ocultarModulosRedesValorParaApi(),
                        },
                    };
                    const provNom = (document.getElementById('cfg-provincia-nominatim')?.value || '').trim();
                    if (provNom.length >= 2) {
                        body.configuracion.provincia = provNom;
                        body.configuracion.state = provNom;
                        body.configuracion.provincia_nominatim = provNom;
                    }
                    {
                        const calleVal = (document.getElementById('cfg-calle')?.value || '').trim();
                        const numeroVal = (document.getElementById('cfg-numero')?.value || '').trim();
                        body.configuracion.calle = calleVal || null;
                        body.configuracion.numero = numeroVal || null;
                    }
                    if (derivacionReclamosPayload !== null) {
                        body.configuracion.derivacion_reclamos = derivacionReclamosPayload;
                    }
                    {
                        const elWaDef = document.getElementById('cfg-wa-ar-default-area');
                        const elWaPr = document.getElementById('cfg-wa-ar-area-prefixes');
                        const elWaTa = document.getElementById('cfg-wa-ar-areas-por-localidad');
                        if (elWaDef || elWaPr || elWaTa) {
                            const waDef = (elWaDef?.value || '').trim();
                            const waDigits = waDef.replace(/\D/g, '').slice(0, 6);
                            body.configuracion.whatsapp_ar_default_area = waDigits || null;
                            const waPr = parseWhatsappArAreaPrefixesInput(elWaPr?.value || '');
                            body.configuracion.whatsapp_ar_area_prefixes = waPr.length ? waPr : null;
                            body.configuracion.whatsapp_ar_areas_por_localidad = parseWhatsappArAreasPorLocalidadTextarea(
                                elWaTa?.value || ''
                            );
                        } else {
                            const ec = window.EMPRESA_CFG || {};
                            const def = ec.whatsapp_ar_default_area != null ? ec.whatsapp_ar_default_area : ec.ar_default_area;
                            body.configuracion.whatsapp_ar_default_area =
                                def != null && String(def).replace(/\D/g, '').length
                                    ? String(def).replace(/\D/g, '').slice(0, 6)
                                    : null;
                            const rawPr = ec.whatsapp_ar_area_prefixes;
                            const prArr = Array.isArray(rawPr)
                                ? rawPr
                                : typeof rawPr === 'string'
                                  ? parseWhatsappArAreaPrefixesInput(rawPr)
                                  : [];
                            body.configuracion.whatsapp_ar_area_prefixes = prArr.length ? prArr : null;
                            const m = ec.whatsapp_ar_areas_por_localidad;
                            body.configuracion.whatsapp_ar_areas_por_localidad =
                                m && typeof m === 'object' && !Array.isArray(m) ? m : null;
                        }
                    }
                    if (campos.nombre) body.nombre = campos.nombre;
                    if (campos.tipo) body.tipo = campos.tipo;
                    const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify(body),
                    });
                    const rd = await resp.json().catch(() => ({}));
                    if (!resp.ok) {
                        let det = rd.error || `HTTP ${resp.status}`;
                        if (rd.detalles && typeof rd.detalles.mensaje === 'string') det = rd.detalles.mensaje;
                        else if (rd.detail) det = `${rd.error || 'Error'}: ${rd.detail}`;
                        if (resp.status === 401) {
                            throw new Error('Iniciá sesión de nuevo para guardar en el servidor.');
                        }
                        if (resp.status === 403) {
                            throw new Error('Sin permiso para guardar la configuración del tenant.');
                        }
                        throw new Error(det);
                    }
                    if (rd.cliente?.configuracion != null) {
                        let cfg = rd.cliente.configuracion;
                        if (typeof cfg === 'string') {
                            try {
                                cfg = JSON.parse(cfg);
                            } catch (_) {
                                cfg = {};
                            }
                        }
                        if (cfg && typeof cfg === 'object') {
                            const next = { ...(window.EMPRESA_CFG || {}) };
                            if (cfg.derivaciones && typeof cfg.derivaciones === 'object') {
                                next.derivaciones = cfg.derivaciones;
                            }
                            if (cfg.derivacion_reclamos && typeof cfg.derivacion_reclamos === 'object') {
                                next.derivacion_reclamos = cfg.derivacion_reclamos;
                            }
                            if (Object.prototype.hasOwnProperty.call(cfg, 'ocultar_modulos_redes')) {
                                next.ocultar_modulos_redes = !!cfg.ocultar_modulos_redes;
                            }
                            for (const k of [
                                'whatsapp_ar_default_area',
                                'whatsapp_ar_area_prefixes',
                                'whatsapp_ar_areas_por_localidad',
                            ]) {
                                if (Object.prototype.hasOwnProperty.call(cfg, k)) next[k] = cfg[k];
                            }
                            for (const k of ['calle', 'numero', 'localidad', 'ciudad']) {
                                if (Object.prototype.hasOwnProperty.call(cfg, k)) next[k] = cfg[k];
                            }
                            window.EMPRESA_CFG = next;
                            sincronizarCamposWhatsappArAreaDesdeEmpresaCfg();
                        }
                    }
                    try {
                        aplicarVisibilidadTabsAdminRedElectrica();
                    } catch (_) {}
                } else {
                    marcaApiOk = false;
                }
            } catch (e) {
                marcaApiOk = false;
                apiSaveFailed = true;
                const apiErrorMsg = String(e?.message || e || '');
                console.warn('[empresa] PUT mi-configuracion:', apiErrorMsg);
                if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(apiErrorMsg)) {
                    toast(
                        'No hay conexión con el servidor. La configuración local se guardó; reintentá cuando vuelva la red.',
                        'error'
                    );
                } else {
                    toast(apiErrorMsg || 'No se pudo guardar en el servidor', 'error');
                }
            }
        }
        window.EMPRESA_CFG = {
            ...(window.EMPRESA_CFG || {}),
            nombre: campos.nombre,
            tipo: campos.tipo,
            subtitulo: campos.subtitulo,
            telefono: campos.telefono,
            email_contacto: campos.email_contacto,
            calle: (document.getElementById('cfg-calle')?.value || '').trim(),
            numero: (document.getElementById('cfg-numero')?.value || '').trim(),
        };
        window.__PMG_TENANT_BRANDING__ = {
            ...(window.__PMG_TENANT_BRANDING__ || {}),
            nombre_cliente: campos.nombre,
            tipo: campos.tipo,
            marca_publicada_admin: true,
            from_local_cache: !marcaApiOk,
        };
        if (marcaApiOk) {
            window.__PMG_TENANT_BRANDING__.from_local_cache = false;
        }
        syncEmpresaCfgNombreLogoDesdeMarca();
        try {
            persistTenantBrandingCache({ subtitulo: campos.subtitulo });
        } catch (_) {}
        try {
            aplicarMarcaVisualCompleta();
        } catch (_) {}
        await cargarConfigEmpresa();
        await verificarConfiguracionInicialObligatoria();
        syncWrapCoordsDisplayNuevoPedido();
        refrescarLineaUbicacionModalNuevoPedido();
        try {
            sincronizarFirmaIdentidadTenantDesdeValores(campos.nombre, campos.tipo);
        } catch (_) {}
        if (apiSaveFailed) {
            /* error ya mostrado arriba */
        } else if (marcaApiOk) {
            toast('Configuración guardada', 'success');
        } else {
            toast(
                'Configuración guardada en base local; no se pudo publicar marca en el servidor (revisá API o token)',
                'warning'
            );
        }
    } catch (e) {
        toastError('guardar-config-empresa', e);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ── Usuarios admin ────────────────────────────────────────────
async function cargarListaUsuarios() {
    const mod = await import('./modules/admin-lista-usuarios-neon.js');
    return mod.cargarListaUsuariosTodosTenantsNeon({
        sqlSimple,
        neonOk: !!(NEON_OK && _sql),
        modoOffline,
        sqlFiltroUsuariosPorTenant,
    });
}

function abrirFormUsuario() {
    document.getElementById('form-usuario').style.display = 'block';
    document.getElementById('nu-email').focus();
}

async function crearUsuario() {
    const { ejecutarCrearUsuarioAdminPanel } = await import('./modules/admin-crear-usuario-panel.js');
    return ejecutarCrearUsuarioAdminPanel({
        toast,
        toastError,
        sqlSimple,
        esc,
        sqlFiltroUsuariosPorTenant,
        tenantIdActual,
        getApiToken,
        apiUrl: getApiBaseUrl,
        asegurarJwtApiRest,
        cargarListaUsuarios,
        refrescarUsuariosCacheDesdeNeon,
    });
}

function escJs(v) {
    return `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function editarTelefonoWhatsappUsuario(id, telefonoWhatsappActual, telefonoContactoLegacy, habilitadoActual) {
    const { openAdminUsuarioWhatsappModal } = await import('./modules/admin-usuarios-whatsapp.js');
    await openAdminUsuarioWhatsappModal({
        userId: id,
        telefonoWhatsapp: telefonoWhatsappActual || '',
        telefonoContacto: telefonoContactoLegacy || '',
        whatsappNotificaciones: habilitadoActual === true || habilitadoActual === 'true',
        sqlSimple,
        onAfterSave: async () => {
            await cargarListaUsuarios();
            try {
                await refrescarUsuariosCacheDesdeNeon();
            } catch (_) {}
        },
    });
}

async function toggleUsuario(id, activar) {
    try {
        await sqlSimple(`UPDATE usuarios SET activo = ${activar} WHERE id = ${esc(id)}`);
        toast(activar ? 'Usuario activado' : 'Usuario desactivado', 'success');
        cargarListaUsuarios();
    } catch(e) { toastError('toggle-usuario', e); }
}

async function eliminarUsuario(id) {
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
    try {
        await sqlSimple(`DELETE FROM usuarios WHERE id = ${esc(id)}`);
        toast('Usuario eliminado', 'success');
        cargarListaUsuarios();
    } catch(e) { toastError('eliminar-usuario', e); }
}

function _esEmailValidoSimple(s) {
    const t = String(s || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

async function leerEmailContactoEmpresaNeon() {
    try {
        const r = await sqlSimple(
            `SELECT valor FROM empresa_config WHERE lower(trim(clave)) = 'email_contacto' LIMIT 1`
        );
        const v = (r.rows?.[0]?.valor || '').trim();
        return _esEmailValidoSimple(v) ? v : '';
    } catch (_) {
        return '';
    }
}

// confirmarCambioPasswordObligatorioAndroid → modules/tenant-primer-ingreso-bootstrap.js

// ── Distribuidores admin ──────────────────────────────────────
async function cargarListaDistribuidoresAdmin() {
    const cont = document.getElementById('lista-distribuidores-admin');
    const zonaP = esMunicipioRubro() ? 'barrios' : esCooperativaAguaRubro() ? 'ramales' : 'distribuidores';
    const zona1 = esMunicipioRubro() ? 'barrio' : esCooperativaAguaRubro() ? 'ramal' : 'distribuidor';
    const zonaN = (n) => (n === 1 ? zona1 : zonaP);
    cont.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const hasLoc = await sqlDistribuidoresTieneLocalidad();
        const wf = await sqlWhereDistribuidoresPorTenantOUsadosEnPedidos();
        const r = await sqlSimpleSelectAllPages(
            hasLoc
                ? `SELECT d.id, d.codigo, d.nombre, d.tension, d.localidad, d.activo FROM distribuidores d WHERE 1=1${wf}`
                : `SELECT d.id, d.codigo, d.nombre, d.tension, d.activo FROM distribuidores d WHERE 1=1${wf}`,
            'ORDER BY d.codigo'
        );
        if (!r.rows.length) {
            cont.innerHTML = `<p style="color:var(--tl);font-size:.85rem;padding:.5rem">Sin ${zonaP}. Cargalos manualmente o importá un Excel.</p>`;
            return;
        }
        const n = r.rows.length;
        const head = hasLoc
            ? '<th>Código</th><th>Nombre</th><th>Tensión</th><th>Localidad</th><th>Estado</th><th>Acciones</th>'
            : '<th>Código</th><th>Nombre</th><th>Tensión</th><th>Estado</th><th>Acciones</th>';
        cont.innerHTML = `<table class="admin-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${r.rows.map(d => `<tr>
                <td><b>${_escOpt(d.codigo)}</b></td>
                <td>${_escOpt(d.nombre)}</td>
                <td>${_escOpt(d.tension) || '-'}</td>
                ${hasLoc ? `<td>${_escOpt(d.localidad) || '—'}</td>` : ''}
                <td><span style="color:${d.activo ? '#166534' : '#dc2626'};font-weight:600">${d.activo ? '✓' : '✗'}</span></td>
                <td style="display:flex;gap:.3rem">
                    <button class="btn-sm danger" onclick="eliminarDistribuidor(${Number(d.id)})">Eliminar</button>
                </td>
            </tr>`).join('')}</tbody>
        </table>
        <p style="font-size:.78rem;color:var(--tm);margin:.55rem 0 0">Total en base de datos: <strong>${n}</strong> ${zonaN(n)}. Desplazá esta sección si la lista es larga.</p>`;
    } catch(e) {
        logErrorWeb('lista-distribuidores-admin', e);
        cont.innerHTML = '<p style="color:var(--re)">' + escHtmlPrint(mensajeErrorUsuario(e)) + '</p>';
    }
}

function abrirFormDistribuidor() {
    document.getElementById('form-distribuidor').style.display = 'block';
    document.getElementById('nd-codigo').focus();
}

async function crearDistribuidor() {
    const codigo  = document.getElementById('nd-codigo').value.trim().toUpperCase();
    const nombre  = document.getElementById('nd-nombre').value.trim();
    const tension = document.getElementById('nd-tension').value.trim();
    const locRaw = document.getElementById('nd-localidad')?.value?.trim() || '';
    if (!codigo || !nombre) { toast('Código y nombre son obligatorios', 'error'); return; }
    try {
        const wfD = await sqlFiltroDistribuidoresPorTenant();
        const tid = tenantIdActual();
        if (wfD) {
            const hasLoc = await sqlDistribuidoresTieneLocalidad();
            const ex = await sqlSimple(
                `SELECT id FROM distribuidores WHERE UPPER(TRIM(codigo)) = UPPER(TRIM(${esc(codigo)}))${wfD} LIMIT 1`
            );
            const rowId = ex.rows?.[0]?.id;
            if (rowId != null) {
                if (hasLoc) {
                    await sqlSimple(
                        `UPDATE distribuidores SET nombre = ${esc(nombre)}, tension = ${esc(
                            tension || null
                        )}, localidad = ${esc(locRaw || null)}, activo = TRUE WHERE id = ${esc(rowId)}${wfD}`
                    );
                } else {
                    await sqlSimple(
                        `UPDATE distribuidores SET nombre = ${esc(nombre)}, tension = ${esc(
                            tension || null
                        )}, activo = TRUE WHERE id = ${esc(rowId)}${wfD}`
                    );
                }
            } else if (hasLoc) {
                await sqlSimple(
                    `INSERT INTO distribuidores(codigo, nombre, tension, localidad, activo, tenant_id) VALUES(${esc(
                        codigo
                    )}, ${esc(nombre)}, ${esc(tension || null)}, ${esc(locRaw || null)}, TRUE, ${esc(tid)})`
                );
            } else {
                await sqlSimple(
                    `INSERT INTO distribuidores(codigo, nombre, tension, activo, tenant_id) VALUES(${esc(
                        codigo
                    )}, ${esc(nombre)}, ${esc(tension || null)}, TRUE, ${esc(tid)})`
                );
            }
        } else if (await sqlDistribuidoresTieneLocalidad()) {
            await sqlSimple(
                `INSERT INTO distribuidores(codigo, nombre, tension, localidad) VALUES(${esc(codigo)}, ${esc(nombre)}, ${esc(
                    tension || null
                )}, ${esc(locRaw || null)}) ON CONFLICT(codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension, localidad = EXCLUDED.localidad`
            );
        } else {
            await sqlSimple(
                `INSERT INTO distribuidores(codigo, nombre, tension) VALUES(${esc(codigo)}, ${esc(nombre)}, ${esc(tension || null)})`
            );
        }
        toast(`${etiquetaZonaPedido()} creado`, 'success');
        document.getElementById('form-distribuidor').style.display = 'none';
        ['nd-codigo', 'nd-nombre', 'nd-tension', 'nd-localidad'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
    } catch(e) {
        const low = String(e && e.message ? e.message : e).toLowerCase();
        if (low.includes('unique')) toast('Ese código ya existe.', 'error');
        else toastError('crear-distribuidor', e);
    }
}

async function eliminarDistribuidor(id) {
    if (!confirm(`¿Dar de baja este ${etiquetaZonaPedido().toLowerCase()}? (queda inactivo en Neon, no se borra)`)) return;
    try {
        const wfD = await sqlFiltroDistribuidoresPorTenant();
        await sqlSimple(`UPDATE distribuidores SET activo = FALSE WHERE id = ${esc(id)}${wfD}`);
        toast('Dado de baja (inactivo)', 'success');
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
    } catch (e) {
        toastError('eliminar-distribuidor', e);
    }
}

async function importarExcelDistribuidores(event) {
    const { importarExcelDistribuidoresCatalogo } = await import('./modules/admin-distribuidores-catalogo-import.js');
    return importarExcelDistribuidoresCatalogo(event, {
        getApiToken,
        apiUrl,
        toast,
        toastError,
        esMunicipioRubro,
        esCooperativaAguaRubro,
        mostrarOverlayImportacion,
        actualizarOverlayImportacion,
        ocultarOverlayImportacion,
        cargarListaDistribuidoresAdmin: () => cargarListaDistribuidoresAdmin(),
        cargarDistribuidores: () => cargarDistribuidores(),
    });
}


// Movido a modules/admin-socios.js


async function resolveCondicionFechaPedidosStats(tsql) {
    const tsqlSafe = tsql || '';
    if (window.__gnFechaInicioOperativa == null) {
        if (NEON_OK && _sql) {
            try {
                const rmin = await sqlSimple(`SELECT MIN(fecha_creacion) AS m FROM pedidos WHERE 1=1${tsqlSafe}`);
                const m = rmin.rows?.[0]?.m;
                window.__gnFechaInicioOperativa = m ? new Date(m) : new Date();
            } catch (_) {
                window.__gnFechaInicioOperativa = new Date(2000, 0, 1);
            }
        } else {
            window.__gnFechaInicioOperativa = new Date(2000, 0, 1);
        }
    }
    const dia = (document.getElementById('est-fecha-dia')?.value || '').trim();
    const mesPick = (document.getElementById('est-mes-filtro')?.value || '').trim();
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        return {
            condFecha: `fecha_creacion::date = ${esc(dia)}::date`,
            fechaDesde: new Date(dia + 'T12:00:00'),
            periodo: 'dia',
        };
    }
    if (mesPick && /^\d{4}-\d{2}$/.test(mesPick)) {
        const d0 = `${mesPick}-01`;
        return {
            condFecha: `fecha_creacion >= ${esc(d0)}::timestamptz AND fecha_creacion < (${esc(d0)}::date + interval '1 month')::timestamptz`,
            fechaDesde: new Date(d0 + 'T12:00:00'),
            periodo: 'mes_pick',
        };
    }
    const periodo = document.getElementById('est-periodo')?.value || 'ejecucion';
    const ahora = new Date();
    let fechaDesde;
    if (periodo === 'mes') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    else if (periodo === '3meses') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
    else if (periodo === 'anio') fechaDesde = new Date(ahora.getFullYear(), 0, 1);
    else if (periodo === 'todo') fechaDesde = new Date('2000-01-01');
    else fechaDesde = window.__gnFechaInicioOperativa || new Date(2000, 0, 1);
    const condFecha = `fecha_creacion >= ${esc(fechaDesde.toISOString())}`;
    return { condFecha, fechaDesde, periodo };
}

function limpiarFiltrosAuxiliaresEstadisticas() {
    const hid = document.getElementById('est-mes-filtro');
    if (hid) hid.value = '';
    const fd = document.getElementById('est-fecha-dia');
    if (fd) fd.value = '';
}
window.limpiarFiltrosAuxiliaresEstadisticas = limpiarFiltrosAuxiliaresEstadisticas;

function aplicarFiltroDiaEstadisticas() {
    const hid = document.getElementById('est-mes-filtro');
    if (hid) hid.value = '';
    void cargarEstadisticas();
}
window.aplicarFiltroDiaEstadisticas = aplicarFiltroDiaEstadisticas;

// Export listado pedidos admin (Excel) → modules/export-pedidos-admin-stats.js

function periodoInformeDesdeSelectEstadisticasSync() {
    const dia = (document.getElementById('est-fecha-dia')?.value || '').trim();
    const mesPick = (document.getElementById('est-mes-filtro')?.value || '').trim();
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        return {
            condFecha: `fecha_creacion::date = ${esc(dia)}::date`,
            fechaDesde: new Date(dia + 'T12:00:00'),
            periodo: 'dia',
        };
    }
    if (mesPick && /^\d{4}-\d{2}$/.test(mesPick)) {
        const d0 = `${mesPick}-01`;
        return {
            condFecha: `fecha_creacion >= ${esc(d0)}::timestamptz AND fecha_creacion < (${esc(d0)}::date + interval '1 month')::timestamptz`,
            fechaDesde: new Date(d0 + 'T12:00:00'),
            periodo: 'mes_pick',
        };
    }
    const periodo = document.getElementById('est-periodo')?.value || 'ejecucion';
    const ahora = new Date();
    let fechaDesde;
    if (periodo === 'mes') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    else if (periodo === '3meses') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
    else if (periodo === 'anio') fechaDesde = new Date(ahora.getFullYear(), 0, 1);
    else if (periodo === 'todo') fechaDesde = new Date('2000-01-01');
    else fechaDesde = window.__gnFechaInicioOperativa || new Date(2000, 0, 1);
    const condFecha = `fecha_creacion >= ${esc(fechaDesde.toISOString())}`;
    return { periodo, fechaDesde, condFecha };
}

/** @deprecated Usar periodoInformeDesdeSelectEstadisticasSync; nombre conservado para compat. */
function periodoInformeDesdeSelectEstadisticas() {
    return periodoInformeDesdeSelectEstadisticasSync();
}

function periodoInformeEtiquetaHumana(periodo) {
    const m = {
        mes: 'Mes en curso',
        '3meses': 'Últimos 3 meses (ventana móvil)',
        anio: 'Año calendario en curso',
        todo: 'Histórico completo',
        ejecucion: 'Desde el inicio operativo hasta hoy',
        dia: 'Un día seleccionado',
        mes_pick: 'Mes seleccionado (desde el gráfico o filtro)',
    };
    return m[periodo] || String(periodo || '');
}

function lineaPeriodoInformeEstadisticas() {
    const { periodo, fechaDesde } = periodoInformeDesdeSelectEstadisticas();
    const ph = periodoInformeEtiquetaHumana(periodo);
    const fd = fechaDesde.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const gen = new Date().toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'medium' });
    return `Período analizado: ${ph} · desde ${fd} · Generado ${gen}`;
}

async function exportInformeMensualExcel() {
    if (!esAdmin()) { toast('Solo administrador', 'error'); return; }
    if (modoOffline || !NEON_OK) { toast('Requiere conexión', 'error'); return; }
    if (!window.XLSX || !XLSX.utils) { toast('Excel aún no cargó — esperá unos segundos y reintentá', 'error'); return; }
    try {
        const tsql = await pedidosFiltroTenantSql();
        const { fechaDesde, condFecha } = await resolveCondicionFechaPedidosStats(tsql);
        const r = await sqlSimple(`SELECT numero_pedido, nis_medidor, estado, prioridad, fecha_creacion, fecha_cierre, distribuidor, tipo_trabajo, descripcion,
            COALESCE(NULLIF(TRIM(cliente_nombre),''), NULLIF(TRIM(cliente),''), '') AS cliente_nombre,
            COALESCE(TRIM(cliente_calle),'') AS cliente_calle,
            COALESCE(TRIM(cliente_numero_puerta),'') AS cliente_numero_puerta,
            COALESCE(TRIM(cliente_localidad),'') AS cliente_localidad,
            COALESCE(TRIM(telefono_contacto),'') AS telefono_contacto
            FROM pedidos WHERE ${condFecha}${tsql} ORDER BY fecha_creacion DESC LIMIT 500`);
        const rows = (r.rows || []).map(row => {
            const fc = splitFechaHoraExportAR(row.fecha_creacion);
            const ff = splitFechaHoraExportAR(row.fecha_cierre);
            return {
                Pedido: row.numero_pedido,
                NIS: row.nis_medidor,
                Estado: row.estado,
                Prioridad: row.prioridad,
                Creado_fecha: fc.fecha,
                Creado_hora: fc.hora,
                Cierre_fecha: ff.fecha,
                Cierre_hora: ff.hora,
                Distribuidor: row.distribuidor,
                Tipo: row.tipo_trabajo,
                Descripcion: row.descripcion,
                Cliente: row.cliente_nombre,
                Calle: row.cliente_calle,
                Numero: row.cliente_numero_puerta,
                Localidad: row.cliente_localidad,
                Telefono: row.telefono_contacto,
                Direccion_consolidada: [row.cliente_calle, row.cliente_numero_puerta, row.cliente_localidad].filter(Boolean).join(', ') || '',
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Pedido: '—', Nota: 'Sin filas en el período' }]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
        const suf = fechaDesde.toISOString().slice(0, 10);
        XLSX.writeFile(wb, `gestornova_pedidos_${suf}.xlsx`);
        toast('Excel descargado', 'success');
    } catch (e) { toastError('export-excel-pedidos', e); }
}

async function generarInformeMensualENRE() {
    if (!esAdmin()) { toast('Solo administrador', 'error'); return; }
    if (modoOffline || !NEON_OK) { toast('Requiere conexión', 'error'); return; }
    try {
        const tsql = await pedidosFiltroTenantSql();
        const { fechaDesde, condFecha } = await resolveCondicionFechaPedidosStats(tsql);
        const r = await sqlSimple(`SELECT numero_pedido, nis_medidor, estado, prioridad, fecha_creacion, fecha_cierre, distribuidor, tipo_trabajo, descripcion,
            COALESCE(NULLIF(TRIM(cliente_nombre),''), NULLIF(TRIM(cliente),''), '') AS cliente_nombre,
            COALESCE(TRIM(cliente_calle),'') AS cliente_calle,
            COALESCE(TRIM(cliente_numero_puerta),'') AS cliente_numero_puerta,
            COALESCE(TRIM(cliente_localidad),'') AS cliente_localidad
            FROM pedidos WHERE ${condFecha}${tsql} ORDER BY fecha_creacion DESC LIMIT 500`);
        const rows = r.rows || [];
        const ent = String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
        const tit = ent + ' — Informe de pedidos';
        const hdr = construirHtmlEncabezadoInformeEmpresa(lineaPeriodoInformeEstadisticas());
        const colId = etiquetaIdentificadorPedidoLista();
        let tab = '<p style="font-size:7.5pt;color:#475569;margin:0 0 .35rem">Arrastrá el borde derecho de cada encabezado para ajustar el ancho de columna antes de imprimir.</p><table id="gn-informe-pedidos-tab"><thead><tr><th>Pedido</th><th>' + String(colId).replace(/</g, '&lt;') + '</th><th>Estado</th><th>Prior.</th><th>F. alta</th><th>H. alta</th><th>F. cierre</th><th>H. cierre</th><th>Dist.</th><th>Tipo</th><th>Cliente</th><th>Calle</th><th>N°</th><th>Loc.</th></tr></thead><tbody>';
        rows.forEach(row => {
            const fc = splitFechaHoraExportAR(row.fecha_creacion);
            const ff = splitFechaHoraExportAR(row.fecha_cierre);
            const esc = (s) => String(s ?? '').replace(/</g, '&lt;');
            tab += `<tr><td>${esc(row.numero_pedido)}</td><td>${esc(row.nis_medidor)}</td><td>${esc(row.estado)}</td><td>${esc(row.prioridad)}</td><td>${esc(fc.fecha)}</td><td>${esc(fc.hora)}</td><td>${esc(ff.fecha)}</td><td>${esc(ff.hora)}</td><td>${esc(row.distribuidor)}</td><td>${esc(row.tipo_trabajo)}</td><td>${esc(row.cliente_nombre)}</td><td>${esc(row.cliente_calle)}</td><td>${esc(row.cliente_numero_puerta)}</td><td>${esc(row.cliente_localidad)}</td></tr>`;
        });
        tab += '</tbody></table>';
        const w = window.open('', '_blank');
        if (!w) { toast('Permití ventanas emergentes para el informe', 'error'); return; }
        const sty = '@page{size:A4 portrait;margin:9mm}body{font-family:system-ui;padding:.2rem;max-width:210mm;margin:0 auto} table{border-collapse:collapse;width:100%;font-size:7.3pt;table-layout:auto} th,td{border:1px solid #cbd5e1;padding:2px 3px;vertical-align:top;white-space:nowrap} th{background:#eff6ff;position:relative}.gn-col-grip{position:absolute;right:0;top:0;bottom:0;width:6px;cursor:col-resize;z-index:2}';
        const scr = `(function(){document.querySelectorAll('#gn-informe-pedidos-tab th').forEach(function(th){var g=document.createElement('div');g.className='gn-col-grip';th.appendChild(g);g.addEventListener('mousedown',function(e){e.preventDefault();var th0=th,start=e.pageX,w0=th0.getBoundingClientRect().width;function mv(ev){var nw=Math.max(36,w0+ev.pageX-start);th0.style.width=nw+'px';th0.style.minWidth=nw+'px';}function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);});});})();`;
        w.document.write('<html><head><title>' + tit.replace(/</g, '&lt;') + '</title><style>' + sty + '</style></head><body>' + hdr + '<h1 style="font-size:12pt;color:#1e3a8a;margin:.45rem 0">' + tit.replace(/</g, '&lt;') + '</h1>' + tab + '<p style="margin-top:.6rem;font-size:7pt;color:#64748b">Documento para gestión interna. Complementar con datos de red (SAIDI/SAIFI oficiales) según normativa. Al imprimir, desactivá encabezado/pie del navegador.</p><script>' + scr + '</script></body></html>');
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch (_) {} }, 500);
    } catch (e) { toastError('informe-mensual-enre', e); }
}

// ── Estadísticas con Chart.js ─────────────────────────────────
/** @type {Promise<typeof import('./modules/estadisticas-datos-red-saifi.js') & typeof import('./modules/estadisticas-saifi-saidi-charts.js')> | null} */
let _estadisticasRedSaifiMods = null;
async function ensureEstadisticasRedSaifiModules() {
    if (!_estadisticasRedSaifiMods) {
        const [red, charts] = await Promise.all([
            import('./modules/estadisticas-datos-red-saifi.js'),
            import('./modules/estadisticas-saifi-saidi-charts.js'),
        ]);
        _estadisticasRedSaifiMods = Promise.resolve({ ...red, ...charts });
    }
    return _estadisticasRedSaifiMods;
}

let _charts = {};
setInformesEstadisticasPdfCaptureDeps({
    getCharts: () => _charts,
    lineaPeriodoInformeEstadisticas,
});
setInformesEstadisticasPrintDeps({
    esAdmin,
    modoOffline: () => modoOffline,
    neonOk: () => NEON_OK,
    toast,
    toastError,
    adminTab,
    cargarEstadisticas,
    lineaPeriodoInformeEstadisticas,
    tituloResumenReferenciaEstadisticas,
    pedidosFiltroTenantSql,
    resolveCondicionFechaPedidosStats,
    kpiPdfPiePaginas,
});
async function cargarEstadisticas() {
    try {
        actualizarMarcoReferenciaEstadisticasAdmin();
    } catch (_) {}
    void import('./modules/estadisticas-chart-plugins.js').then((m) => m.initGNChartPercentPlugins()).catch(() => {});
    const tsql = await pedidosFiltroTenantSql();
    const tsqlP = tsql
        ? tsql.replace(/\btenant_id\b/g, 'p.tenant_id').replace(/\bbusiness_type\b/g, 'p.business_type')
        : '';
    const { condFecha, fechaDesde, periodo } = await resolveCondicionFechaPedidosStats(tsql);
    const filtro    = `WHERE ${condFecha}${tsql}`;
    const andFecha  = `AND ${condFecha}`;

    // Mostrar loading
    const statsEl = document.getElementById('stats-cards');
    if (statsEl) statsEl.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i> Calculando...</div>';

    try {
        const statSql = (query, tag) =>
            sqlSimple(query).catch(err => {
                console.warn('[estadisticas]', tag, err && err.message ? err.message : err);
                return { rows: [] };
            });
        const esMun = esMunicipioRubro();
        const sqlDistZona = esMun
            ? `SELECT COALESCE(NULLIF(TRIM(barrio),''), 'Sin barrio') AS distribuidor, COUNT(*) AS n,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados
                FROM pedidos ${filtro} GROUP BY 1 ORDER BY n DESC LIMIT 10`
            : `SELECT distribuidor, COUNT(*) AS n,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados
                FROM pedidos ${filtro} GROUP BY distribuidor ORDER BY n DESC LIMIT 10`;
        const showConf = esCooperativaElectricaRubro();
        const socTieneTStats = await sociosCatalogoTieneTenantId();
        const socTsqlStats = socTieneTStats ? ` AND tenant_id = ${esc(tenantIdActual())}` : '';
        const tiposConfSql =
            "('Corte de Energía','Cables Caídos/Peligro','Problemas de Tensión','Poste Inclinado/Dañado','Consumo elevado','Riesgo en la vía pública','Corrimiento de poste/columna','Falla de Línea','Avería en Transformador','Corte Programado','Emergencia')";
        const redSaifiMods = showConf ? await ensureEstadisticasRedSaifiModules() : null;
        const [rTotal, rEstados, rPrior, rMensual, rTipos, rMotivos, rDist, rTiempos, rTecnicos, rAvance, rUsuarios,
            rTecCalle, rAsig, rCrit24, rBarT, rSocios, rConfDist, rSociosDist, datosRedPack, rConfMes] = await Promise.all([
            // Resumen general
            statSql(`SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados,
                COUNT(*) FILTER(WHERE estado='Pendiente') AS pendientes,
                COUNT(*) FILTER(WHERE estado='Asignado') AS asignados,
                COUNT(*) FILTER(WHERE estado='En ejecución') AS en_ejec,
                COUNT(*) FILTER(WHERE estado='Desestimado') AS desestimados,
                COUNT(*) FILTER(WHERE prioridad='Crítica' AND estado!='Cerrado') AS criticos,
                COUNT(*) FILTER(WHERE prioridad='Alta' AND estado!='Cerrado') AS altos,
                COUNT(*) FILTER(WHERE estado='Cerrado' AND fecha_cierre::date = CURRENT_DATE) AS cerrados_hoy
                FROM pedidos ${filtro}`, 'total'),
            // Por estado
            statSql(`SELECT estado, COUNT(*) AS n FROM pedidos ${filtro} GROUP BY estado ORDER BY n DESC`, 'estados'),
            // Por prioridad
            statSql(`SELECT prioridad, COUNT(*) AS n FROM pedidos ${filtro} GROUP BY prioridad ORDER BY
                CASE prioridad WHEN 'Crítica' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Media' THEN 3 ELSE 4 END`, 'prior'),
            // Por mes
            statSql(`SELECT TO_CHAR(fecha_creacion,'YYYY-MM') AS mes,
                COUNT(*) AS total,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados
                FROM pedidos ${filtro} GROUP BY mes ORDER BY mes`, 'mensual'),
            // Por tipo de trabajo (incluye conteo desestimados por tipo)
            statSql(`SELECT COALESCE(tipo_trabajo,'Sin tipo') AS tipo, COUNT(*) AS n,
                COUNT(*) FILTER(WHERE estado='Desestimado') AS nd
                FROM pedidos ${filtro} GROUP BY 1 ORDER BY n DESC LIMIT 10`, 'tipos'),
            statSql(sqlMotivosDesestimacion(filtro), 'motivos_desest'),
            // Por distribuidor / ramal / barrio (top 10)
            statSql(sqlDistZona, 'dist'),
            // Tiempo promedio de cierre (horas) — solo pedidos cerrados con fecha
            statSql(`SELECT
                AVG(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600) AS horas_prom,
                MIN(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600) AS horas_min,
                MAX(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600) AS horas_max
                FROM pedidos WHERE ${condFecha}${tsql} AND estado='Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > fecha_creacion`, 'tiempos'),
            // Por técnico de cierre (top 8)
            statSql(`SELECT COALESCE(tecnico_cierre,'Sin asignar') AS tecnico, COUNT(*) AS n
                FROM pedidos WHERE ${condFecha}${tsql} AND estado='Cerrado' GROUP BY tecnico ORDER BY n DESC LIMIT 8`, 'tecnicos'),
            // Avance promedio de pedidos en ejecución
            statSql(`SELECT ROUND(AVG(avance)) AS avance_prom FROM pedidos WHERE ${condFecha}${tsql} AND estado='En ejecución'`, 'avance'),
            // Pedidos por usuario creador
            statSql(`SELECT COALESCE(u.nombre, 'Sin asignar') AS usuario, COUNT(*) AS n
                FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_creador_id
                WHERE p.fecha_creacion >= ${esc(fechaDesde.toISOString())}${tsqlP}
                GROUP BY usuario ORDER BY n DESC LIMIT 10`, 'usuarios'),
            statSql(`SELECT COUNT(DISTINCT tecnico_asignado_id) AS n FROM pedidos ${filtro}
                AND estado IN ('En ejecución','Asignado') AND tecnico_asignado_id IS NOT NULL`, 'tecCalle'),
            statSql(`SELECT AVG(EXTRACT(EPOCH FROM (fecha_asignacion - fecha_creacion))/3600) AS h
                FROM pedidos ${filtro} AND fecha_asignacion IS NOT NULL AND fecha_asignacion > fecha_creacion`, 'asig'),
            statSql(`SELECT
                COUNT(*) FILTER (WHERE prioridad='Crítica' AND estado='Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre <= fecha_creacion + interval '24 hours') AS n24,
                COUNT(*) FILTER (WHERE prioridad='Crítica' AND estado='Cerrado' AND fecha_cierre IS NOT NULL) AS nct
                FROM pedidos ${filtro}`, 'crit24'),
            esMun
                ? statSql(
                      `SELECT COALESCE(NULLIF(TRIM(barrio),''), 'Sin barrio') AS barrio,
                ROUND(AVG(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600)::numeric, 2) AS horas_prom,
                COUNT(*)::int AS n
                FROM pedidos WHERE ${condFecha}${tsql} AND estado='Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > fecha_creacion
                GROUP BY 1 ORDER BY horas_prom ASC NULLS LAST LIMIT 8`,
                      'barT'
                  )
                : Promise.resolve({ rows: [] }),
            statSql(`SELECT COUNT(*)::int AS n FROM socios_catalogo WHERE COALESCE(activo, TRUE)${socTsqlStats}`, 'nsocios'),
            showConf
                ? statSql(
                      `SELECT DISTINCT COALESCE(NULLIF(TRIM(distribuidor), ''), '') AS dist_raw
                FROM pedidos
                WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > fecha_creacion
                AND fecha_cierre >= ${esc(fechaDesde.toISOString())}
                AND tipo_trabajo IN ${tiposConfSql}
                ${tsql}`,
                      'confDist'
                  )
                : Promise.resolve({ rows: [] }),
            showConf
                ? statSql(
                      `SELECT COALESCE(NULLIF(TRIM(distribuidor_codigo), ''), '') AS dist_raw, COUNT(*)::int AS n
                FROM socios_catalogo
                WHERE COALESCE(activo, TRUE)${socTsqlStats}
                  AND COALESCE(NULLIF(TRIM(distribuidor_codigo), ''), '') <> ''
                GROUP BY 1`,
                      'sociosDist'
                  )
                : Promise.resolve({ rows: [] }),
            showConf && !modoOffline && redSaifiMods
                ? redSaifiMods
                      .fetchDatosRedParaEstadisticas({
                          getApiToken,
                          apiUrl,
                          asegurarJwtApiRest,
                      })
                      .catch(() => null)
                : Promise.resolve(null),
            showConf
                ? statSql(
                      `SELECT TO_CHAR(fecha_cierre,'YYYY-MM') AS mes,
                COUNT(*)::int AS ev,
                COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/60.0, 0)), 0)::double precision AS min_tot
                FROM pedidos
                WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > fecha_creacion
                AND fecha_cierre >= ${esc(fechaDesde.toISOString())}
                AND tipo_trabajo IN ${tiposConfSql}
                ${tsql}
                GROUP BY 1 ORDER BY 1`,
                      'confMes'
                  )
                : Promise.resolve({ rows: [] }),
        ]);

        const t = rTotal.rows[0] || {};
        const horasProm = parseFloat(rTiempos.rows[0]?.horas_prom || 0);
        const horasMin  = parseFloat(rTiempos.rows[0]?.horas_min  || 0);
        const horasMax  = parseFloat(rTiempos.rows[0]?.horas_max  || 0);
        const avanceProm = parseInt(rAvance.rows[0]?.avance_prom  || 0);
        const nTecCalle = parseInt(rTecCalle.rows[0]?.n || 0, 10);
        const hAsig = parseFloat(rAsig.rows[0]?.h || 0);
        const nCrit24 = parseInt(rCrit24.rows[0]?.n24 || 0, 10);
        const nCritTot = parseInt(rCrit24.rows[0]?.nct || 0, 10);
        const totalN = Number(t.total) || 0;
        const cerrN = Number(t.cerrados) || 0;
        const pctCerr = totalN > 0 ? Math.round(1000 * cerrN / totalN) / 10 : 0;
        const pctCrit24 = nCritTot ? Math.round(1000 * nCrit24 / nCritTot) / 10 : null;

        const fmtHoras = h =>
            h === 0 || !isFinite(h)
                ? '—'
                : h < 1
                  ? Math.round(h * 60) + ' minutos'
                  : h < 24
                    ? h.toFixed(1) + ' horas'
                    : (h / 24).toFixed(1) + ' días';

        const titZona = document.getElementById('estadisticas-titulo-zona');
        if (titZona) {
            titZona.textContent = esMun ? 'Por barrio' : esCooperativaAguaRubro() ? 'Por ramal' : 'Por distribuidor';
        }
        const wrapBarT = document.getElementById('chart-wrap-barrios-tiempo');
        if (wrapBarT) wrapBarT.style.display = esMun ? '' : 'none';

        const nSociosCat = Math.max(1, parseInt(rSocios.rows?.[0]?.n || 0, 10) || 1);
        const confRows = rConfMes.rows || [];
        const evConfTot = confRows.reduce((s, r) => s + parseInt(r.ev || 0, 10), 0);
        const minConfTot = confRows.reduce((s, r) => s + parseFloat(r.min_tot || 0), 0);
        const denomMeta = redSaifiMods
            ? redSaifiMods.denominadorClientesConfiabilidad({
                  datosPack: datosRedPack,
                  distRawRows: rConfDist.rows || [],
                  nSociosCat,
                  sociosPorCodigo: redSaifiMods.buildMapaSociosPorCodigoDistribuidor(rSociosDist.rows || []),
              })
            : { n: nSociosCat, sinDatosRed: true, fuente: 'socios_catalogo', parcial: false };
        const denomEff = denomMeta.n;
        const saifiPeriodo = showConf && denomEff ? evConfTot / denomEff : null;
        const saidiPeriodo = showConf && denomEff ? minConfTot / denomEff : null;

        try {
            const av = document.getElementById('estad-red-infra-aviso');
            if (av) {
                if (!showConf) {
                    av.style.display = 'none';
                    av.textContent = '';
                } else if (denomMeta.sinDatosRed) {
                    av.style.display = '';
                    av.textContent =
                        '📊 Datos de red no cargados. Los valores de SAIDI/SAIFI son estimaciones basadas solo en reclamos (denominador: socios del catálogo). Cargá la infraestructura en la pestaña «Red Eléctrica».';
                } else if (denomMeta.fuente === 'red' && denomMeta.parcial) {
                    av.style.display = '';
                    av.textContent =
                        '⚠️ Datos de red parciales: algunos distribuidores con eventos no tienen clientes en tabla; el denominador suma solo los cargados.';
                } else if (denomMeta.fuente === 'red') {
                    av.style.display = '';
                    av.textContent =
                        '✓ Denominador según clientes de la pestaña «Red Eléctrica» (suma por distribuidores con interrupciones en el período).';
                } else if (denomMeta.fuente === 'socios_catalogo') {
                    av.style.display = '';
                    av.textContent =
                        '✓ Denominador: socios activos del catálogo (columna Dist.) por cada distribuidor con reclamos de red en el período' +
                        (denomMeta.parcial ? ' (algunos distribuidores sin socios cargados con ese código).' : '.');
                } else {
                    av.style.display = '';
                    av.textContent =
                        '📊 Sin suma útil de clientes por distribuidor afectado; se usa el total de socios activos del catálogo.';
                }
            }
        } catch (_) {}

        try {
            const pd = document.querySelector('#chart-wrap-confiabilidad > p');
            if (pd && showConf) {
                const base =
                    'Basado en <strong>cierres</strong> de reclamos de red (cortes, tensión, cables, etc.), excluye administrativos. <strong>SAIFI</strong> ≈ interrupciones / usuarios; <strong>SAIDI</strong> ≈ minutos acumulados / usuario. ';
                const den =
                    denomMeta.fuente === 'red'
                        ? 'Denominador: <strong>clientes cargados en «Red Eléctrica»</strong> (suma de distribuidores con esos cierres en el período). Complementar con mediciones oficiales.'
                        : denomMeta.fuente === 'socios_catalogo'
                          ? 'Denominador: <strong>socios activos por Dist.</strong> en <code style="font-size:.7rem">socios_catalogo</code> (Neon, tenant actual). Complementar con mediciones oficiales.'
                          : 'Denominador: total socios activos en <code style="font-size:.7rem">socios_catalogo</code> (mín. 1). Complementar con mediciones oficiales de red.';
                pd.innerHTML = base + den;
            }
        } catch (_) {}

        try {
            const cw = document.getElementById('chart-wrap-confiabilidad');
            if (cw) cw.style.display = showConf ? '' : 'none';
        } catch (_) {}

        // ── Cards de resumen ───────────────────────────────────
        const cardList = [
            { val: totalN, lbl: 'Total pedidos',     cls: '' },
            { val: Number(t.pendientes)  || 0, lbl: 'Pendientes',         cls: Number(t.pendientes) > 0 ? 'orange' : '' },
            { val: Number(t.asignados)   || 0, lbl: 'Asignados',          cls: Number(t.asignados) > 0 ? 'orange' : '' },
            { val: Number(t.en_ejec)     || 0, lbl: 'En ejecución',       cls: '' },
            { val: cerrN, lbl: 'Cerrados',           cls: 'green' },
            { val: Number(t.criticos)    || 0, lbl: '🔴 Críticos activos', cls: Number(t.criticos) > 0 ? 'red' : '' },
            { val: Number(t.altos)       || 0, lbl: '🟠 Altos activos',   cls: Number(t.altos) > 0 ? 'orange' : '' },
            { val: Number(t.cerrados_hoy)|| 0, lbl: 'Cerrados hoy',       cls: 'green' },
            { val: nTecCalle, lbl: 'Técnicos con pedido (asig./ejec.)', cls: nTecCalle ? 'orange' : '' },
            { val: fmtHoras(hAsig), lbl: 'Prom. tiempo hasta asignar', cls: '' },
            { val: pctCerr + '%', lbl: '% cerrados / total período', cls: 'green' },
            { val: pctCrit24 != null ? pctCrit24 + '%' : '—', lbl: '% críticos cerrados &lt;24h', cls: '' },
            { val: fmtHoras(horasProm), lbl: 'Prom. tiempo cierre', cls: '' },
            { val: fmtHoras(horasMin),  lbl: 'Cierre más rápido',   cls: 'green' },
            { val: avanceProm + '%',    lbl: 'Avance prom. en ejec.', cls: '' },
        ];
        if (showConf) {
            cardList.push(
                {
                    val: saifiPeriodo != null ? saifiPeriodo.toFixed(4) : '—',
                    lbl: 'SAIFI aprox. (int./usuario en período)',
                    cls: '',
                },
                {
                    val: saidiPeriodo != null ? Math.round(saidiPeriodo * 10) / 10 + ' min/usuario' : '—',
                    lbl: 'SAIDI aprox. (min acum./usuario)',
                    cls: '',
                }
            );
        }
        try {
            insertarCardDesestimadosEnResumen(cardList, t.desestimados, totalN);
        } catch (_) {}
        try {
            renderBloquePdfDesestimados(document.getElementById('stats-desestimados-pdf-block'), {
                totalN,
                desestimados: t.desestimados,
                motivosRows: rMotivos.rows || [],
            });
        } catch (_) {}
        document.getElementById('stats-cards').innerHTML = cardList
            .map(s => `<div class="stat-card ${s.cls}"><div class="val">${s.val}</div><div class="lbl">${s.lbl}</div></div>`)
            .join('');

        // ── Helper para crear/recrear charts (Chart.js v4) ────
        const crearChart = (id, type, labels, datasets, extraOpts = {}) => {
            if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
            const canvas = document.getElementById(id);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const isVerticalBar = type === 'bar' && extraOpts.indexAxis !== 'y';
            _charts[id] = new Chart(ctx, {
                type,
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 520, easing: 'easeOutQuart' },
                    clip: false,
                    layout: { padding: { top: 12, bottom: 14, left: 12, right: 18 } },
                    plugins: { legend: { display: false, labels: { boxWidth: 18, boxHeight: 8, padding: 14, color: '#334155', font: { size: 11, weight: '600' } } }, tooltip: { callbacks: {
                        label: ctx2 => {
                            const v = ctx2.parsed && typeof ctx2.parsed === 'object' && 'y' in ctx2.parsed
                                ? ctx2.parsed.y : (ctx2.parsed ?? ctx2.raw);
                            return ' ' + v + ' pedidos';
                        }
                    }}},
                    ...(isVerticalBar
                        ? {
                              scales: {
                                  x: {
                                      grid: { display: false },
                                      ticks: { color: '#475569', font: { size: 11, weight: '600' }, maxRotation: 40, minRotation: 0, autoSkipPadding: 10 },
                                  },
                                  y: { beginAtZero: true, grace: '8%', ticks: { color: '#475569', precision: 0, font: { size: 11, weight: '600' } }, grid: { color: 'rgba(148,163,184,.22)' } },
                              },
                          }
                        : {}),
                    ...extraOpts
                }
            });
            requestAnimationFrame(() => {
                try { _charts[id]?.resize(); } catch (_) {}
            });
        };

        const priorColor = {
            Crítica: 'rgba(254, 202, 202, 0.72)',
            Alta: 'rgba(253, 186, 116, 0.55)',
            Media: 'rgba(253, 224, 71, 0.52)',
            Baja: 'rgba(186, 230, 253, 0.72)',
        };

        // ── Gráfico mensual: total y cerrados por mes ─────────
        crearChart('chart-mensual', 'bar',
            rMensual.rows.map(r => r.mes),
            datasetsMensualCreadosCerrados(rMensual.rows),
            { layout: { padding: { top: 10, bottom: 22, left: 4, right: 8 } },
                plugins: { legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y }}}}
        );
        const chMes = _charts['chart-mensual'];
        if (chMes) {
            chMes.options.onClick = (_evt, elements) => {
                if (!elements?.length) return;
                const idx = elements[0].index;
                const lab = chMes.data.labels[idx];
                if (lab && /^\d{4}-\d{2}$/.test(String(lab))) {
                    const hid = document.getElementById('est-mes-filtro');
                    if (hid) hid.value = String(lab);
                    const fd = document.getElementById('est-fecha-dia');
                    if (fd) fd.value = '';
                    void cargarEstadisticas();
                    toast(`Filtrado: mes ${lab}. Elegí un día abajo para ver solo ese día, o «Limpiar filtro».`, 'info');
                }
            };
            chMes.update();
        }

        // ── Gráfico estados: doughnut ─────────────────────────
        crearChart('chart-estados', 'doughnut',
            rEstados.rows.map(r => r.estado),
            [{ data: rEstados.rows.map(r => parseInt(r.n)),
               backgroundColor: rEstados.rows.map((row, i) =>
                   ESTADO_DONUT_COLORS[row.estado] || DONUT_FALLBACK_SEQUENCE[i % DONUT_FALLBACK_SEQUENCE.length]
               ),
               borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.98)' }],
            { plugins: { legend: { display: true, position: 'bottom' },
                tooltip: { callbacks: { label: (c) => {
                    const ds = c.dataset;
                    const arr = ds?.data || [];
                    const tot = arr.reduce((s, v) => s + Number(v || 0), 0);
                    const v = Number(c.parsed || 0);
                    const pct = tot ? Math.round((1000 * v) / tot) / 10 : 0;
                    return ` ${c.label}: ${v} pedidos (${pct}%)`;
                } }}}}
        );

        // ── Gráfico prioridades: dona + % (plugin gestornovaPctDoughnut) ──
        crearChart('chart-prioridades', 'doughnut',
            rPrior.rows.map(r => r.prioridad),
            [{
                data: rPrior.rows.map(r => parseInt(r.n, 10)),
                backgroundColor: rPrior.rows.map(r => priorColor[r.prioridad] || 'rgba(203, 213, 225, 0.5)'),
                borderWidth: 1.5,
                borderColor: 'rgba(255, 255, 255, 0.98)',
            }],
            {
                plugins: {
                    legend: { display: true, position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (c) => {
                                const ds = c.dataset;
                                const arr = ds?.data || [];
                                const tot = arr.reduce((s, v) => s + Number(v || 0), 0);
                                const v = Number(c.parsed || 0);
                                const pct = tot ? Math.round((1000 * v) / tot) / 10 : 0;
                                return ` ${c.label}: ${v} pedidos (${pct}%)`;
                            },
                        },
                    },
                },
            }
        );

        // ── Gráfico tipos de trabajo: barras horizontales apiladas (otros + desestimados) ─────
        crearChart(
            'chart-tipos',
            'bar',
            rTipos.rows.map((r) => (r.tipo.length > 25 ? r.tipo.substring(0, 25) + '…' : r.tipo)),
            datasetsTiposTrabajoConDesestimados(rTipos.rows),
            opcionesChartTiposApilados()
        );
        if (_charts['chart-tipos']) {
            _charts['chart-tipos']._gnLabelsFull = rTipos.rows.map((r) => String(r.tipo || ''));
        }
        try {
            crearGraficoMotivosDesestimacion(crearChart, rMotivos.rows || []);
        } catch (_) {}

        try {
            if (redSaifiMods) {
                redSaifiMods.crearGraficosSaifiSaidi(crearChart, {
                    showConf,
                    confRows: rConfMes.rows || [],
                    denomEff,
                    saifiPeriodo,
                    saidiPeriodo,
                    denomMeta,
                });
            }
        } catch (_) {}

        // ── Gráfico distribuidor / ramal / barrio: barras con % cierre ─
        crearChart('chart-distribuidores', 'bar',
            rDist.rows.map(r => r.distribuidor),
            [
                { label: 'Total',    data: rDist.rows.map(r => parseInt(r.n        || 0)), backgroundColor: 'rgba(186, 230, 253, 0.82)', borderColor: 'rgba(125, 211, 252, 0.65)', borderWidth: 1 },
                { label: 'Cerrados', data: rDist.rows.map(r => parseInt(r.cerrados || 0)), backgroundColor: 'rgba(167, 243, 208, 0.85)', borderColor: 'rgba(110, 231, 183, 0.65)', borderWidth: 1 }
            ],
            { layout: { padding: { top: 8, bottom: 36, left: 4, right: 10 } },
              plugins: { legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y }}},
              scales: { x: { ticks: { maxRotation: 45, font: { size: 10 } } } } }
        );

        if (esMun && (rBarT?.rows || []).length) {
            crearChart(
                'chart-barrios-tiempo',
                'bar',
                rBarT.rows.map((r) => (String(r.barrio || '').length > 22 ? String(r.barrio).slice(0, 22) + '…' : String(r.barrio || ''))),
                [
                    {
                        label: 'Horas prom. cierre',
                        data: rBarT.rows.map((r) => parseFloat(r.horas_prom || 0)),
                        backgroundColor: 'rgba(186, 230, 253, 0.75)',
                        borderColor: 'rgba(125, 211, 252, 0.55)',
                        borderWidth: 1,
                    },
                ],
                {
                    indexAxis: 'y',
                    layout: { padding: { top: 4, bottom: 4, left: 4, right: 48 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (c) =>
                                    ' ' +
                                    (c.parsed?.x != null ? c.parsed.x.toFixed(1) : c.raw) +
                                    ' h · n=' +
                                    (rBarT.rows[c.dataIndex]?.n ?? ''),
                            },
                        },
                    },
                    scales: { x: { beginAtZero: true, title: { display: true, text: 'Horas' } } },
                }
            );
            if (_charts['chart-barrios-tiempo']) {
                _charts['chart-barrios-tiempo']._gnLabelsFull = rBarT.rows.map((r) =>
                    String(r.barrio || '')
                );
            }
        } else if (_charts['chart-barrios-tiempo']) {
            _charts['chart-barrios-tiempo'].destroy();
            delete _charts['chart-barrios-tiempo'];
        }

        try {
            window.__gnChartsEstadisticas = _charts;
        } catch (_) {}

        // ── Gráfico técnicos de cierre ────────────────────────
        // ── Gráfico por usuario creador ──────────────────────
        if ((rUsuarios?.rows || []).length) {
            crearChart('chart-usuarios', 'bar',
                rUsuarios.rows.map(r => r.usuario.length > 14 ? r.usuario.substring(0,14)+'…' : r.usuario),
                [{ label: 'Pedidos', data: rUsuarios.rows.map(r => parseInt(r.n)),
                   backgroundColor: rUsuarios.rows.map((_, i) => CHART_PALETTE_ARRAY[i % CHART_PALETTE_ARRAY.length]) }],
                { layout: { padding: { top: 32, bottom: 28, left: 4, right: 8 } },
                    plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: c => ' ' + c.parsed.y + ' pedidos' }}},
                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            );
        }

        // ── Gráfico técnicos ──────────────────────────────────
        if ((rTecnicos?.rows || []).length) {
            const wrapTec0 = document.getElementById('chart-wrap-tecnicos');
            if (wrapTec0) wrapTec0.style.display = '';
            crearChart('chart-tecnicos', 'bar',
                rTecnicos.rows.map(r => r.tecnico.length > 15 ? r.tecnico.substring(0,15)+'…' : r.tecnico),
                [{ label: 'Pedidos cerrados', data: rTecnicos.rows.map(r => parseInt(r.n)),
                   backgroundColor: rTecnicos.rows.map((_, i) => CHART_PALETTE_ARRAY[i % CHART_PALETTE_ARRAY.length]) }],
                { layout: { padding: { top: 32, bottom: 28, left: 4, right: 8 } },
                    plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: c => ' ' + c.parsed.y + ' pedidos' }}} }
            );
        } else {
            const wrapTec1 = document.getElementById('chart-wrap-tecnicos');
            if (wrapTec1) wrapTec1.style.display = 'none';
            const capTx = document.getElementById('chart-cap-tecnicos');
            if (capTx) capTx.innerHTML = '';
        }

        const scap = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const pctOf = (n, tot) => (!tot ? 0 : Math.round(1000 * Number(n) / tot) / 10);
        pintarCaptionsGraficosEstadisticasAdmin({
            scap,
            pctOf,
            esMun,
            esCooperativaAgua: esCooperativaAguaRubro(),
            rMensual,
            rEstados,
            rPrior,
            rDist,
            rBarT,
            rTipos,
            rUsuarios: rUsuarios || { rows: [] },
            rTecnicos: rTecnicos || { rows: [] },
        });
        try {
            if (redSaifiMods) {
                redSaifiMods.pintarCaptionConfiabilidadSaifiSaidi({
                    scap,
                    confRows: rConfMes.rows || [],
                    denomEff,
                    saifiPeriodo,
                    saidiPeriodo,
                    denomMeta,
                    evConfTot,
                    minConfTot,
                });
            }
        } catch (_) {}

        requestAnimationFrame(() => {
            Object.values(_charts).forEach(ch => { try { ch.resize(); } catch (_) {} });
        });

        try {
            void refrescarRankingSlaEstadisticas({ esAdmin, apiUrl, getApiToken });
        } catch (_) {}

    } catch(e) {
        logErrorWeb('cargar-estadisticas', e);
        const em = escHtmlPrint(mensajeErrorUsuario(e));
        if (document.getElementById('stats-cards'))
            document.getElementById('stats-cards').innerHTML =
                `<div style="color:var(--re);padding:1rem;font-size:.85rem">No se pudieron cargar las estadísticas. ${em}</div>`;
        toast(mensajeErrorUsuario(e), 'error');
    }
}

// ── Ubicaciones de usuarios en mapa ──────────────────────────
let _mapaUsuariosAdmin = null;
let _marcadoresUsuarios = [];
let _marcadoresPedidosAdmin = [];
/** Se incrementa al invalidar sesión/tenant; `cargarUbicacionesUsuarios` ignora resultados obsoletos. */
let _genCargaUbicacionesAdmin = 0;
window._marcadoresUsuarios = _marcadoresUsuarios;

function limpiarMarcadoresMapaAdminYOArrays() {
    try {
        if (_mapaUsuariosAdmin) {
            _marcadoresUsuarios.forEach((m) => {
                try {
                    _mapaUsuariosAdmin.removeLayer(m);
                } catch (_) {}
            });
            _marcadoresPedidosAdmin.forEach((m) => {
                try {
                    _mapaUsuariosAdmin.removeLayer(m);
                } catch (_) {}
            });
        }
        _marcadoresUsuarios = [];
        _marcadoresPedidosAdmin = [];
        window._marcadoresUsuarios = _marcadoresUsuarios;
    } catch (_) {}
}

function destruirChartsEstadisticasAdmin() {
    try {
        Object.keys(_charts).forEach((id) => {
            try {
                _charts[id]?.destroy();
            } catch (_) {}
            delete _charts[id];
        });
    } catch (_) {}
}

/** Cards y leyendas en cero hasta `cargarEstadisticas()` con SQL del tenant actual (evita números residuales). */
function resetEstadisticasAdminVisualNeutro() {
    destruirChartsEstadisticasAdmin();
    try {
        [
            'chart-cap-confiabilidad',
            'chart-cap-mensual',
            'chart-cap-estados',
            'chart-cap-prioridades',
            'chart-cap-distribuidores',
            'chart-cap-barrios-tiempo',
            'chart-cap-tipos',
            'chart-cap-desest-motivos',
            'chart-cap-usuarios',
            'chart-cap-tecnicos'
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = '';
        });
        const avi = document.getElementById('estad-red-infra-aviso');
        if (avi) {
            avi.style.display = 'none';
            avi.textContent = '';
        }
        const statsEl = document.getElementById('stats-cards');
        if (!statsEl) return;
        let cardList = [
            { val: 0, lbl: 'Total pedidos', cls: '' },
            { val: 0, lbl: 'Pendientes', cls: '' },
            { val: 0, lbl: 'Asignados', cls: '' },
            { val: 0, lbl: 'En ejecución', cls: '' },
            { val: 0, lbl: 'Cerrados', cls: '' },
            { val: 0, lbl: '🔴 Críticos activos', cls: '' },
            { val: 0, lbl: '🟠 Altos activos', cls: '' },
            { val: 0, lbl: 'Cerrados hoy', cls: '' },
            { val: 0, lbl: 'Técnicos con pedido (asig./ejec.)', cls: '' },
            { val: '—', lbl: 'Prom. tiempo hasta asignar', cls: '' },
            { val: '0%', lbl: '% cerrados / total período', cls: '' },
            { val: '—', lbl: '% críticos cerrados &lt;24h', cls: '' },
            { val: '—', lbl: 'Prom. tiempo cierre', cls: '' },
            { val: '—', lbl: 'Cierre más rápido', cls: '' },
            { val: '0%', lbl: 'Avance prom. en ejec.', cls: '' }
        ];
        try {
            if (esCooperativaElectricaRubro()) {
                cardList.push(
                    { val: '—', lbl: 'SAIFI aprox. (int./usuario en período)', cls: '' },
                    { val: '—', lbl: 'SAIDI aprox. (min acum./usuario)', cls: '' }
                );
            }
        } catch (_) {}
        statsEl.innerHTML = cardList
            .map((s) => `<div class="stat-card ${s.cls}"><div class="val">${s.val}</div><div class="lbl">${s.lbl}</div></div>`)
            .join('');
    } catch (_) {}
}

/** KPIs en cero y listas vacías hasta `refrescarDashboardGerencia` con datos del tenant. */
function resetDashboardGerenciaPlaceholderNeutro() {
    try {
        const cards = [
            { val: 0, lbl: 'Pendiente', cls: 'orange', filter: 'pendientes' },
            { val: 0, lbl: 'Asignados', cls: 'dash-kpi-blue', filter: 'asignados' },
            { val: 0, lbl: 'En ejecución', cls: 'dash-kpi-blue', filter: 'en_ejecucion' },
            { val: 0, lbl: 'Derivados (terceros)', cls: 'dash-kpi-slate', filter: 'derivados_terceros' },
            { val: 0, lbl: 'Cerrados hoy', cls: 'green', filter: 'cerrados_hoy' },
            { val: 0, lbl: 'Con posición &lt;20 min', cls: '', filter: 'tecnicos_gps' }
        ];
        const htmlKpi = cards
            .map(
                (s) =>
                    `<div class="stat-card dash-kpi-click ${s.cls}" data-dash-filter="${s.filter}" tabindex="0" role="button"><div class="val">${s.val}</div><div class="lbl">${s.lbl}</div></div>`
            )
            .join('');
        const htmlLt =
            '<span style="color:var(--tl)">Cargando posiciones del tenant actual…</span>';
        const htmlLc = '<span style="color:var(--tl)">—</span>';
        ['dashboard-kpi-grid', 'mapa-main-dash-kpi'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = htmlKpi;
        });
        ['dashboard-lista-tecnicos', 'mapa-main-dash-tecnicos'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = htmlLt;
        });
        ['dashboard-lista-cierres', 'mapa-main-dash-cierres'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = htmlLc;
        });
        try {
            bindDashboardKpiClicks(document.getElementById('dashboard-kpi-grid'), 'dashboard-filtro-lista-host');
            bindDashboardKpiClicks(document.getElementById('mapa-main-dash-kpi'), 'mapa-main-dash-filtro-host');
        } catch (_) {}
    } catch (_) {}
}

/** Una sola fila con el usuario de sesión hasta que `cargarListaUsuarios()` traiga el listado filtrado por tenant. */
let _refrescoMultitenantTimer = null;

/** Tras JWT/tenant distinto: recarga pedidos, catálogos y paneles admin para “volver” a una empresa sin datos viejos en pantalla. */
function scheduleRefrescoDatosTrasCambioTenantMultitenant() {
    try {
        if (_refrescoMultitenantTimer) clearTimeout(_refrescoMultitenantTimer);
    } catch (_) {}
    _refrescoMultitenantTimer = setTimeout(() => {
        _refrescoMultitenantTimer = null;
        void ejecutarRefrescoDatosTrasCambioTenantMultitenant();
    }, 80);
}

async function ejecutarRefrescoDatosTrasCambioTenantMultitenant() {
    if (!app?.u || modoOffline) return;
    try {
        if (NEON_OK && _sql) {
            await cargarPedidos({ silent: true });
            await cargarDistribuidores();
            if (esAdmin()) {
                try {
                    await cargarListaDistribuidoresAdmin();
                } catch (_) {}
                try {
                    await cargarListaUsuarios();
                } catch (_) {}
                try {
                    await refrescarDashboardGerencia(true);
                } catch (_) {}
                try {
                    await cargarEstadisticas();
                } catch (_) {}
                try {
                    await recargarSociosAdminTrasCambioTenant();
                } catch (e) {
                    console.warn('[refresco-multitenant] socios', e?.message || e);
                }
            }
            try {
                await refrescarUsuariosCacheDesdeNeon();
            } catch (_) {}
        }
    } catch (e) {
        console.warn('[refresco-multitenant]', e && e.message ? e.message : e);
    }
    try {
        render();
    } catch (_) {}
    try {
        renderMk();
    } catch (_) {}
}

function pintarListaUsuariosAdminSoloSesionActual() {
    const cont = document.getElementById('lista-usuarios-admin');
    if (!cont || !app?.u) return;
    const u = app.u;
    const tel = escHtmlPrint(String(u.telefono_whatsapp != null && u.telefono_whatsapp !== '' ? u.telefono_whatsapp : u.telefono != null ? u.telefono : ''));
    const waOn = u.whatsapp_notificaciones !== false;
    cont.innerHTML = `<p style="font-size:.78rem;color:var(--tm);margin:0 0 .65rem;line-height:1.35">Mostrando solo tu usuario de sesión hasta cargar el listado completo del tenant (sin datos de otro negocio).</p>
<table class="admin-table">
<thead><tr><th>ID</th><th>Usuario</th><th>Nombre</th><th>WhatsApp</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
<tbody><tr>
  <td style="color:var(--tl)">${escHtmlPrint(String(u.id))}</td>
  <td><b>${escHtmlPrint(String(u.email || ''))}</b></td>
  <td>${escHtmlPrint(String(u.nombre || ''))}</td>
  <td>
    <div style="font-size:.8rem">${tel || '<span style="color:var(--tl)">Sin cargar</span>'}</div>
    <div style="font-size:.74rem;color:${waOn ? '#166534' : '#b45309'}">${waOn ? 'Notificaciones ON' : 'Notificaciones OFF'}</div>
  </td>
  <td><span style="background:var(--bg);padding:.15rem .5rem;border-radius:.3rem;font-size:.78rem;font-weight:600">${escHtmlPrint(String(u.rol || ''))}</span></td>
  <td><span style="color:var(--tl);font-weight:600">…</span></td>
  <td style="color:var(--tl);font-size:.78rem">Esperando lista…</td>
</tr></tbody></table>`;
}

/** Admin en sesión: datos operativos (stats, dashboard tacho, mapa ubicaciones) sin vaciar EMPRESA_CFG ni formulario empresa — p. ej. tras cambiar rubro en pantalla. */
function resetAdminUiMultitenantDatosOperativos() {
    try {
        if (typeof window.__gnResetAdminHistoricosUi === 'function') window.__gnResetAdminHistoricosUi();
    } catch (_) {}
    try {
        invalidatePedidosTenantSqlCache();
    } catch (_) {}
    try {
        _genCargaUbicacionesAdmin++;
    } catch (_) {}
    try {
        resetEstadisticasAdminVisualNeutro();
    } catch (_) {}
    try {
        resetDashboardGerenciaPlaceholderNeutro();
    } catch (_) {}
    try {
        limpiarMarcadoresMapaAdminYOArrays();
    } catch (_) {}
    try {
        const cw = document.getElementById('chart-wrap-confiabilidad');
        if (cw) cw.style.display = 'none';
    } catch (_) {}
    try {
        void cargarUbicacionesUsuarios();
    } catch (_) {}
    try {
        void cargarEstadisticas();
    } catch (_) {}
    try {
        void cargarListaDistribuidoresAdmin();
    } catch (_) {}
    try {
        void cargarListaUsuarios();
    } catch (_) {}
}

/**
 * Tras login distinto o invalidación de sesión: vacía formularios y listas del admin
 * (empresa, derivaciones, KPI, dashboard, usuarios) y `EMPRESA_CFG` en memoria.
 * No toca la base: los datos se vuelven a cargar con el `tenant_id` activo.
 */
function vaciarPanelesAdminPorCambioTenantSesion() {
    try {
        if (typeof window.__gnResetAdminHistoricosUi === 'function') window.__gnResetAdminHistoricosUi();
    } catch (_) {}
    try {
        window.EMPRESA_CFG = {};
    } catch (_) {}
    try {
        const emp = document.getElementById('admin-empresa');
        if (emp) {
            emp.querySelectorAll('input, select, textarea').forEach((el) => {
                const id = el.id || '';
                if (id === 'cfg-guardar-empresa' || el.type === 'button' || el.type === 'submit') return;
                if (id === 'cfg-subtitulo') {
                    el.value = typeof GN_SUBTITULO_FIJO !== 'undefined' ? GN_SUBTITULO_FIJO : '';
                    return;
                }
                if (el.type === 'checkbox') {
                    el.checked = false;
                    return;
                }
                if (el.tagName === 'SELECT') {
                    if (id === 'cfg-coord-familia') el.value = 'none';
                    else if (id === 'cfg-coord-modo') el.value = 'punto';
                    else el.selectedIndex = 0;
                    return;
                }
                el.value = '';
            });
        }
        const irr = document.getElementById('cfg-deriv-internet-rows');
        const tvr = document.getElementById('cfg-deriv-tv-rows');
        if (irr) irr.innerHTML = '';
        if (tvr) tvr.innerHTML = '';
        const oh = document.getElementById('cfg-ocultar-redes-help');
        if (oh) oh.style.display = 'none';
        try {
            syncCoordModoVisibility();
        } catch (_) {}
        try {
            setDerivacionesInlineError('');
        } catch (_) {}
    } catch (_) {}
    try {
        ['pw-actual', 'pw-nueva', 'pw-confirmar', 'pw-email-nuevo', 'pw-nombre-nuevo'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const pm = document.getElementById('pw-msg');
        if (pm) {
            pm.textContent = '';
            pm.style.color = '';
        }
    } catch (_) {}
    try {
        const wrapKpi = document.getElementById('kpi-snapshots-form-wrap');
        if (wrapKpi) wrapKpi.style.display = 'none';
        const sinTabla = document.getElementById('kpi-snapshots-sin-tabla');
        if (sinTabla) {
            sinTabla.style.display = 'none';
            sinTabla.textContent = '';
        }
        const kpiLista = document.getElementById('kpi-snapshots-lista');
        if (kpiLista) {
            kpiLista.innerHTML =
                '<div class="ll2" style="color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Cargando datos KPI…</div>';
        }
        const adminKpi = document.getElementById('admin-kpi');
        if (adminKpi) {
            adminKpi.querySelectorAll('input, textarea, select').forEach((el) => {
                const id = el.id || '';
                if (!id || id === 'kpi-btn-imprimir' || id === 'kpi-btn-refrescar') return;
                if (el.tagName === 'SELECT') {
                    el.selectedIndex = 0;
                    return;
                }
                if (el.type === 'checkbox') el.checked = false;
                else el.value = '';
            });
        }
        try {
            if (typeof aplicarKpiPresetAdmin === 'function') aplicarKpiPresetAdmin();
        } catch (_) {}
    } catch (_) {}
    try {
        resetDashboardGerenciaPlaceholderNeutro();
        const hostF = document.getElementById('dashboard-filtro-lista-host');
        const hostMap = document.getElementById('mapa-main-dash-filtro-host');
        if (hostF) {
            hostF.style.display = 'none';
            hostF.innerHTML = '';
        }
        if (hostMap) {
            hostMap.style.display = 'none';
            hostMap.innerHTML = '';
        }
    } catch (_) {}
    try {
        const listaDist = document.getElementById('lista-distribuidores-admin');
        if (listaDist) {
            listaDist.innerHTML =
                '<div class="ll2" style="color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Cargando distribuidores del tenant…</div>';
        }
    } catch (_) {}
    try {
        pintarListaUsuariosAdminSoloSesionActual();
    } catch (_) {}
}

/** Login/logout/cambio de tenant: caches SQL en memoria + paneles admin (evita datos cruzados entre tenants/rubros). */
function invalidarCachesMultitenantSesionYOAdminUI() {
    invalidatePedidosTenantSqlCache();
    try {
        localStorage.removeItem('pmg_offline_pedidos');
    } catch (_) {}
    try {
        _genCargaUbicacionesAdmin++;
    } catch (_) {}
    vaciarPanelesAdminPorCambioTenantSesion();
    try {
        aplicarMascaraEmpresaAdminTrasCambioTenant();
    } catch (_) {}
    try {
        _sociosCatalogoTieneTenantIdCache = null;
        resetSociosCatalogoSchemaCache();
    } catch (_) {}
    try {
        _sociosCatalogoTieneDatosExtraCache = null;
    } catch (_) {}
    try {
        _pedidoContadorNeonTenantCache = null;
    } catch (_) {}
    try {
        resetUsuariosTenantColumnCache();
    } catch (_) {}
    try {
        window._sociosVirtualRows = null;
    } catch (_) {}
    try {
        if (_sociosVirtualScrollRaf) {
            cancelAnimationFrame(_sociosVirtualScrollRaf);
            _sociosVirtualScrollRaf = null;
        }
    } catch (_) {}
    try {
        try {
            marcarListaSociosPendienteRecarga({ soloSiTabInactiva: true });
        } catch (_) {}
        try {
            app.usuariosCache = null;
            gnResetUsuarioNombresMap();
        } catch (_) {}
        const listaUb = document.getElementById('lista-ubicaciones');
        if (listaUb)
            listaUb.innerHTML =
                '<div class="ll2" style="color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Cargando ubicaciones…</div>';
    } catch (_) {}
    resetEstadisticasAdminVisualNeutro();
    limpiarMarcadoresMapaAdminYOArrays();
    try {
        scheduleRefrescoDatosTrasCambioTenantMultitenant();
    } catch (_) {}
}

function iniciarMapaUsuariosAdmin() {
    const el = document.getElementById('mapa-usuarios-admin');
    if (!el) return;
    setTimeout(async () => {
        const mod = await loadMapViewModule();
        mod.setMapViewContext(buildMapViewCtx());
        if (!_mapaUsuariosAdmin) {
            _mapaUsuariosAdmin = L.map('mapa-usuarios-admin', {
                zoomControl: false,
                preferCanvas: true,
                zoomAnimation: false,
                fadeAnimation: false,
                markerZoomAnimation: false,
                inertia: false
            }).setView([-31.5, -60.0], 10);
            mod.gnAttachBaseMapLayers(_mapaUsuariosAdmin, { applyAdminOsmOverlays: false });
            window._mapaUsuariosAdmin = _mapaUsuariosAdmin;
        } else {
            _mapaUsuariosAdmin.invalidateSize();
            try {
                if (typeof mod.gnClearAdminOsmOverlaysFromMap === 'function') {
                    mod.gnClearAdminOsmOverlaysFromMap(_mapaUsuariosAdmin);
                }
            } catch (_) {}
            window._mapaUsuariosAdmin = _mapaUsuariosAdmin;
        }
        cargarUbicacionesUsuarios();
    }, 200);
}

async function cargarUbicacionesUsuarios() {
    const esActualizacion = _marcadoresUsuarios.length > 0 || _marcadoresPedidosAdmin.length > 0;
    const myGen = _genCargaUbicacionesAdmin;
    try {
        if (_mapaUsuariosAdmin) {
            _marcadoresUsuarios.forEach((m) => {
                try {
                    _mapaUsuariosAdmin.removeLayer(m);
                } catch (_) {}
            });
            _marcadoresPedidosAdmin.forEach((m) => {
                try {
                    _mapaUsuariosAdmin.removeLayer(m);
                } catch (_) {}
            });
        }
        _marcadoresUsuarios = [];
        _marcadoresPedidosAdmin = [];
        window._marcadoresUsuarios = _marcadoresUsuarios;
        const listaSpin = document.getElementById('lista-ubicaciones');
        if (listaSpin)
            listaSpin.innerHTML =
                '<div class="ll2" style="color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Cargando ubicaciones…</div>';

        const wfU = await sqlFiltroUsuariosPorTenant();
        // ── Usuarios activos con ubicación reciente ───────────
        const [rUsr, rPed] = await Promise.all([
            sqlSimple(`
                SELECT DISTINCT ON (uu.usuario_id)
                    uu.usuario_id, uu.lat, uu.lng, uu.precision_m, uu.timestamp,
                    u.nombre, u.email
                FROM ubicaciones_usuarios uu
                JOIN usuarios u ON u.id = uu.usuario_id
                WHERE u.activo = TRUE AND uu.timestamp > NOW() - INTERVAL '2 hours'${wfU}
                ORDER BY uu.usuario_id, uu.timestamp DESC
            `),
            // Pedidos pendientes y en ejecución con coordenadas
            (async () => {
                const tsql = await pedidosFiltroTenantSql();
                return sqlSimple(`
                SELECT id, numero_pedido, descripcion, prioridad, estado, lat, lng, distribuidor
                FROM pedidos
                WHERE estado != 'Cerrado' AND lat IS NOT NULL AND lng IS NOT NULL${tsql}
                ORDER BY
                    CASE prioridad WHEN 'Crítica' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Media' THEN 3 ELSE 4 END
            `);
            })()
        ]);

        if (myGen !== _genCargaUbicacionesAdmin) return;

        if (!_mapaUsuariosAdmin) {
            console.warn('[ubicaciones admin] mapa no inicializado');
            return;
        }

        const lista = document.getElementById('lista-ubicaciones');

        // ── Marcadores de pedidos ─────────────────────────────
        const fillPrior = { 'Crítica':'#ef4444','Alta':'#f97316','Media':'#eab308','Baja':'#3b82f6' };
        (rPed.rows || []).forEach(p => {
            const lat = parseFloat(p.lat), lng = parseFloat(p.lng);
            if (!lat || !lng) return;
            const color = fillPrior[p.prioridad] || '#3b82f6';
            const iconPed = L.divIcon({
                className: '',
                html: `<div style="width:14px;height:14px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);position:relative">
                    <div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:${color};color:white;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap">#${p.numero_pedido}</div>
                </div>`,
                iconSize: [14,14], iconAnchor: [7,7]
            });
            const mk = L.marker([lat, lng], { icon: iconPed, zIndexOffset: 100 })
                .addTo(_mapaUsuariosAdmin)
                .bindPopup(`<b style="color:${color}">#${p.numero_pedido}</b><br>
                    <span style="font-size:11px">${p.prioridad} — ${p.estado}</span><br>
                    <span style="font-size:11px;color:#475569">${p.distribuidor || ''}</span><br>
                    <span style="font-size:11px">${(p.descripcion||'').substring(0,60)}...</span>`);
            _marcadoresPedidosAdmin.push(mk);
        });

        // ── Marcadores de usuarios ────────────────────────────
        const usuariosRows = rUsr.rows || [];
        const bounds = [];

        usuariosRows.forEach(row => {
            const lat = parseFloat(row.lat), lng = parseFloat(row.lng);
            bounds.push([lat, lng]);
            const hace = Math.round((Date.now() - new Date(row.timestamp)) / 60000);

            // Calcular pedido más cercano a este usuario
            let pedidoCercano = null, distMin = Infinity;
            (rPed.rows || []).forEach(p => {
                const plat = parseFloat(p.lat), plng = parseFloat(p.lng);
                if (!plat || !plng) return;
                // Distancia aproximada en km (fórmula simple)
                const dlat = (lat - plat) * 111;
                const dlng = (lng - plng) * 111 * Math.cos(lat * Math.PI / 180);
                const d = Math.sqrt(dlat*dlat + dlng*dlng);
                if (d < distMin) { distMin = d; pedidoCercano = p; }
            });

            const cercanoHtml = pedidoCercano
                ? `<br><span style="font-size:10px;color:#059669">📍 Pedido más cercano: #${pedidoCercano.numero_pedido} (${distMin < 1 ? (distMin*1000).toFixed(0)+'m' : distMin.toFixed(1)+'km'})</span>`
                : '';

            if (_mapaUsuariosAdmin) {
                const icon = L.divIcon({
                    className: '',
                    html: `<div class="user-marker-admin"><i class="fas fa-user" style="font-size:.65rem"></i> ${row.nombre.split(' ')[0]}</div>`,
                    iconAnchor: [0, 12]
                });
                const m = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
                    .addTo(_mapaUsuariosAdmin)
                    .bindPopup(`<b>${row.nombre}</b><br>${row.email}<br>Hace ${hace} min<br>±${row.precision_m || '?'}m${cercanoHtml}`);
                _marcadoresUsuarios.push(m);
            }
        });

        // fitBounds SOLO la primera vez (no al actualizar)
        if (!esActualizacion && _mapaUsuariosAdmin && bounds.length) {
            _mapaUsuariosAdmin.fitBounds(bounds, { padding: [40, 40] });
        }

        // ── Lista inferior ────────────────────────────────────
        if (!usuariosRows.length) {
            if (lista) lista.textContent = 'Ningún usuario ha compartido su ubicación en las últimas 2 horas.';
        } else {
            if (lista) lista.innerHTML = usuariosRows.map(row => {
                const hace = Math.round((Date.now() - new Date(row.timestamp)) / 60000);
                return `<span style="display:inline-flex;align-items:center;gap:.3rem;background:var(--bg);border-radius:.5rem;padding:.25rem .6rem;margin:.15rem;font-size:.78rem">
                    <i class="fas fa-user"></i> <b>${row.nombre}</b> — hace ${hace} min
                </span>`;
            }).join('') + `<span style="display:inline-flex;align-items:center;gap:.3rem;background:#f0fdf4;border-radius:.5rem;padding:.25rem .6rem;margin:.15rem;font-size:.78rem">
                <i class="fas fa-circle" style="color:#ef4444;font-size:.5rem"></i> Crítica &nbsp;
                <i class="fas fa-circle" style="color:#f97316;font-size:.5rem"></i> Alta &nbsp;
                <i class="fas fa-circle" style="color:#eab308;font-size:.5rem"></i> Media &nbsp;
                <i class="fas fa-circle" style="color:#3b82f6;font-size:.5rem"></i> Baja
            </span>`;
        }

    } catch(e) { console.warn('Error ubicaciones usuarios:', e.message); }
}

// ── Cambio de contraseña / usuario admin → modules/admin-cambiar-credenciales.js ──

// ── Reset de contraseña con EmailJS ──────────────────────────
let _resetPaso = 1;
let _resetTokenActual = null;
let _resetUsuarioAdmin = false;
/** Usuario que recibió `reset_token` en el paso 1 (evita fallar el paso 2 si el usuario del formulario no coincide con la fila resuelta en paso 1). */
let _resetTargetUserId = null;

/** Quita espacios y, si hay exactamente 6 dígitos, usa solo esos (p. ej. mail con «Código: 123 456»). */
function _normalizarCodigoResetPw(raw) {
    const t = String(raw || '').trim();
    const digits = t.replace(/\D/g, '');
    if (digits.length === 6) return digits;
    return t.replace(/\s+/g, '');
}

function _errMsg(e) {
    if (!e) return 'Error desconocido';
    if (typeof e === 'string') return e;
    if (e.message) return e.message;
    if (e.error) return typeof e.error === 'string' ? e.error : JSON.stringify(e.error);
    try { return JSON.stringify(e); } catch (_) { return String(e); }
}

/** Al abrir el modal de recuperación: evita quedar en paso 2 sin UI coherente. */
function reiniciarModalResetPwUi() {
    _resetPaso = 1;
    _resetTokenActual = null;
    _resetUsuarioAdmin = false;
    _resetTargetUserId = null;
    try {
        const m = document.getElementById('reset-msg');
        if (m) {
            m.textContent = '';
            m.style.color = '';
        }
        const w = document.getElementById('reset-codigo-wrap');
        if (w) w.style.display = 'none';
        const c = document.getElementById('reset-codigo');
        const n = document.getElementById('reset-nueva-pw');
        if (c) c.value = '';
        if (n) n.value = '';
        const btn = document.getElementById('btn-reset-pw');
        if (btn) {
            btn.style.display = '';
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar código';
        }
    } catch (_) {}
}
window.reiniciarModalResetPwUi = reiniciarModalResetPwUi;

async function pasoResetPw() {
    const cfg = window.APP_CONFIG?.emailjs;

    const msg = document.getElementById('reset-msg');
    const btn = document.getElementById('btn-reset-pw');

    if (_resetPaso === 1) {
        const email = document.getElementById('reset-email').value.trim();
        if (!email) {
            msg.textContent = 'Ingresá el nombre de usuario del administrador.';
            return;
        }
        _resetUsuarioAdmin = false;
        try {
            const emailLc = email.toLowerCase();
            const matchSql = (wfExtra) => `SELECT id, email, nombre, rol
                FROM usuarios
                WHERE activo = TRUE
                  AND lower(coalesce(email,'')) = ${esc(emailLc)}
                ${wfExtra || ''}
                LIMIT 1`;
            const wf = await sqlFiltroUsuariosPorTenant();
            let r = await sqlSimple(matchSql(wf));
            if (!r.rows[0] && wf) {
                r = await sqlSimple(matchSql(''));
            }
            if (!r.rows[0]) {
                const emEmpresa = (await leerEmailContactoEmpresaNeon()).trim().toLowerCase();
                if (emEmpresa && emailLc === emEmpresa) {
                    const pickAdmin = (wfExtra) => `SELECT id, email, nombre, rol
                        FROM usuarios
                        WHERE activo = TRUE
                          AND lower(trim(coalesce(rol,''))) IN ('admin','administrador')
                        ${wfExtra || ''}
                        ORDER BY id ASC
                        LIMIT 1`;
                    r = await sqlSimple(pickAdmin(wf));
                    if (!r.rows[0] && wf) r = await sqlSimple(pickAdmin(''));
                }
            }
            if (!r.rows[0]) { msg.textContent = 'Cuenta no encontrada o inactiva'; return; }
            const usuario = r.rows[0];
            _resetTargetUserId = Number(usuario.id);
            if (!Number.isFinite(_resetTargetUserId) || _resetTargetUserId <= 0) _resetTargetUserId = null;
            const rolRaw = String(usuario.rol || '').toLowerCase();
            if (rolRaw !== 'admin' && rolRaw !== 'administrador') {
                msg.textContent =
                    'La recuperación por correo es solo para administradores. Los técnicos deben pedir una clave provisoria al admin (panel Usuarios).';
                return;
            }
            _resetUsuarioAdmin = true;

            const destManual = (document.getElementById('reset-email-destino')?.value || '').trim();
            let toEmail = '';
            if (destManual) {
                if (!_esEmailValidoSimple(destManual)) {
                    msg.textContent = 'El correo de destino no es válido.';
                    return;
                }
                toEmail = destManual;
            } else {
                toEmail = await leerEmailContactoEmpresaNeon();
                if (!toEmail) toEmail = String(usuario.email || '').trim();
            }
            if (!_esEmailValidoSimple(toEmail)) {
                msg.textContent =
                    'No hay correo de destino. Completá «Correo para el código» o cargá el correo de la empresa en Admin → Empresa (email de contacto).';
                return;
            }

            const token = String(Math.floor(100000 + Math.random() * 900000));
            _resetTokenActual = token;
            const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            await sqlSimple(`UPDATE usuarios SET reset_token = ${esc(token)}, reset_expiry = ${esc(expiry)} WHERE id = ${esc(usuario.id)}`);

            const esAndroidLocal = !!window.AndroidDevice && (/GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:');
            if (esAndroidLocal) {
                msg.style.color = '#854d0e';
                msg.innerHTML =
                    `En Android no se puede enviar el correo desde la app.<br>` +
                    `Código temporal (válido ~30 min): <b>${token}</b><br>` +
                    `<span style="font-size:.8rem">Si necesitás recibirlo por mail, usá la versión web en PC.</span>`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            } else {
                if (!cfg?.publicKey || !cfg?.serviceId || !cfg?.templateId) {
                    throw new Error('Servicio de correo no configurado (config.json → emailjs)');
                }
                if (!window.emailjs || typeof emailjs.send !== 'function') {
                    throw new Error('Servicio de correo no cargado; recargá la página');
                }
                await emailjs.send(
                    cfg.serviceId,
                    templateIdEmailReset(cfg),
                    paramsEmailReset({
                        toEmail,
                        toName: usuario.nombre || usuario.email || 'Administrador',
                        token,
                        appName: 'GestorNova',
                    }),
                    cfg.publicKey
                );

                msg.style.color = '#166534';
                msg.textContent = `✓ Código enviado a ${toEmail}`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            }
        } catch(e) {
            const em = _errMsg(e);
            const esAndroidLocal = !!window.AndroidDevice && (/GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:');
            if (esAndroidLocal && _resetTokenActual && _resetUsuarioAdmin) {
                msg.style.color = '#854d0e';
                msg.innerHTML =
                    `No se pudo enviar el email (${em}).<br>` +
                    `Código temporal: <b>${_resetTokenActual}</b>`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            } else {
                msg.style.color = '';
                msg.textContent = 'Error: ' + em;
            }
        }
    } else {
        const email  = document.getElementById('reset-email').value.trim();
        const codigo = _normalizarCodigoResetPw(document.getElementById('reset-codigo').value);
        const nuevaPw = document.getElementById('reset-nueva-pw').value;
        if (!codigo || !nuevaPw) { msg.textContent = 'Completá el código y la nueva contraseña'; return; }
        try {
            const emailLc = email.toLowerCase();
            const wf = await sqlFiltroUsuariosPorTenant();
            const tokSql = `trim(both from coalesce(reset_token::text, '')) = ${esc(codigo)}`;
            const matchById = (wfExtra) => `SELECT id
                FROM usuarios
                WHERE id = ${esc(Number(_resetTargetUserId))}
                  AND ${tokSql}
                  AND reset_expiry > NOW()
                ${wfExtra || ''}
                LIMIT 1`;
            const matchUpd = (wfExtra) => `SELECT id
                FROM usuarios
                WHERE lower(coalesce(email,'')) = ${esc(emailLc)}
                  AND ${tokSql}
                  AND reset_expiry > NOW()
                ${wfExtra || ''}
                LIMIT 1`;
            let r = { rows: [] };
            if (_resetTargetUserId != null && Number.isFinite(Number(_resetTargetUserId))) {
                r = await sqlSimple(matchById(wf));
                if (!r.rows[0] && wf) r = await sqlSimple(matchById(''));
            }
            if (!r.rows[0]) {
                r = await sqlSimple(matchUpd(wf));
                if (!r.rows[0] && wf) {
                    r = await sqlSimple(matchUpd(''));
                }
            }
            if (!r.rows[0]) { msg.textContent = 'Código incorrecto o expirado'; return; }
            await sqlSimple(
                `UPDATE usuarios SET password_hash = ${esc(nuevaPw)}, reset_token = NULL, reset_expiry = NULL, must_change_password = FALSE WHERE id = ${esc(r.rows[0].id)}`
            );
            msg.style.color = '#166534';
            msg.textContent = '✓ Contraseña actualizada. Ya podés iniciar sesión.';
            btn.style.display = 'none';
            _resetPaso = 1;
            _resetTokenActual = null;
            _resetUsuarioAdmin = false;
        } catch(e) {
            msg.style.color = '';
            msg.textContent = 'Error: ' + _errMsg(e);
        }
    }
}
window.pasoResetPw = pasoResetPw;

// ── Banner offline ocultable ──────────────────────────────────
function toggleOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    const toggle = document.getElementById('offline-toggle');
    if (!banner) return;
    if (banner.classList.contains('hidden')) {
        banner.classList.remove('hidden');
        try { localStorage.setItem('pmg_offline_banner_hidden', '0'); } catch(_) {}
        if (toggle) toggle.innerHTML = '<i class="fas fa-wifi-slash"></i>';
    } else {
        banner.classList.add('hidden');
        try { localStorage.setItem('pmg_offline_banner_hidden', '1'); } catch(_) {}
        if (toggle) toggle.innerHTML = '<i class="fas fa-wifi-slash"></i>';
    }
}
window.toggleOfflineBanner = toggleOfflineBanner;

// Sobrescribir setModoOffline para manejar el toggle
const _setModoOfflineOrig = setModoOffline;
// (La función original ya existe, solo agregar manejo del toggle)
function _actualizarEstadoBanner(offline) {
    const toggle = document.getElementById('offline-toggle');
    if (!toggle) return;
    toggle.className = offline ? 'visible' : '';
}

// ── Cache de tiles: escuchar progreso del SW ──────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        const msg = event.data;
        if (!msg || msg.tipo !== 'CACHE_PROGRESO') return;
        const bar  = document.getElementById('cache-progress-bar');
        const fill = document.getElementById('cache-fill');
        const pct  = document.getElementById('cache-pct');
        const txt  = document.getElementById('cache-msg');
        if (!bar) return;
        if (msg.estado === 'ya_hecho') {
            // Ya estaba cacheado — no mostrar nada
            return;
        }
        if (msg.estado === 'iniciando') {
            bar.classList.add('visible');
            txt.textContent = 'Descargando mapa offline (~' + msg.total + ' tiles)...';
            fill.style.width = '0%'; pct.textContent = '0%';
        } else if (msg.estado === 'progreso') {
            fill.style.width = msg.pct + '%'; pct.textContent = msg.pct + '%';
        } else if (msg.estado === 'completo') {
            fill.style.width = '100%'; pct.textContent = '100%';
            txt.textContent = '✓ Mapa offline listo (' + msg.ok + ' tiles descargados)';
            setTimeout(() => bar.classList.remove('visible'), 4000);
            toast('✓ Mapa offline descargado', 'success');
        }
    });
}

// ── Inicializar todo al arrancar ──────────────────────────────
(async function iniciarApp() {
    try {
        window.__GESTORNOVA_APP_BOOT_TS = Date.now();
        initGnModalZIndexStack();
        setAdminEmpresaWhatsappDerivacionesDeps({
            toast,
            setDerivacionesInlineError,
        });
        setGnWaGeoOpsPanelDeps({
            esAdmin,
            modoOffline: () => modoOffline,
            getApiToken,
            apiUrl,
        });
        setWhatsappHumanChatAdminDeps({
            esAdmin,
            toast,
            toastError,
            getApiToken,
            apiUrl,
            asegurarJwtApiRest,
            puedeEnviarApiRestPedidos,
            modoOffline: () => modoOffline,
            getAppUser: () => app?.u,
            escOpt: _escOpt,
        });
        wireWhatsappHumanChatAdminWindow();
        wireAbrirWhatsappDerivacionFormWindow();
        setPedidoDetalleDerivacionHtmlDeps({
            esTecnicoOSupervisor,
            esAdmin,
            debeMostrarBotonDerivacion,
            pedidoEsDerivadoFuera,
            normalizarEstadoPedidoUi,
            fmtInformeFecha,
            obtenerWaMeUrlDerivacionEmpresaCfg,
            etiquetaFirmaPersona,
            getAppUser: () => app?.u,
        });
        setPedidoOpinionClienteUiDeps({
            esAdmin,
            fmtInformeFecha,
            apiUrl,
            asegurarJwtApiRest,
            puedeEnviarApiRestPedidos,
            getApiToken,
            toast,
            getApp: () => app,
            get NEON_OK() {
                return NEON_OK;
            },
            modoOffline: () => modoOffline,
            sqlSimple,
            esc,
            coordsEfectivasPedidoMapa,
        });
        installPedidoOpinionDescargoUi();
        initAdminWizard({
            app,
            getApiToken,
            apiUrl,
            esc,
            sqlSimple,
            get NEON_OK() {
                return NEON_OK;
            },
            get _sql() {
                return _sql;
            },
            esAdmin,
            tenantIdActual,
            neonPedidosTieneColumnaTenantId,
            leerTenantIdUsuarioDesdeNeon,
            invalidatePedidosTenantSqlCache,
            intentarRefrescarJwtDesdeCredencialesGuardadas,
            refrescarEmpresaDesdeClienteNeonPorTenantActual,
            aplicarConfiguracionJsonClienteEnEmpresaCfg,
            hydrateBrandingForPublicScreen,
            aplicarMarcaVisualCompleta,
            pintarCabeceraLoginWizardGenerica,
            sesionCompletaParaMarcaLogin,
            poblarSelectTiposReclamo,
            syncEmpresaCfgNombreLogoDesdeMarca,
            aplicarEtiquetasPorTipo,
            persistTenantBrandingCache,
            firmaIdentidadTenant,
            leerFirmaIdentidadAlmacenada,
            sincronizarFirmaIdentidadTenantDesdeValores,
            vaciarDerivacionesTercerosFormularioAdmin,
            parseJwtPayloadLoose,
            normalizarRolStr,
            normalizarRubroEmpresa,
            nominatimReverseProvinciaArgentina,
            cargarConfigEmpresa,
            limpiarLocalStorageContadoresPedido,
            invalidarCachesMultitenantSesionYOAdminUI,
            apiSetupTechnicianFetchTenants,
            apiSetupTechnicianPostAttach,
            wizardPoblarSelectTenantsClientes,
            GN_SUBTITULO_FIJO,
            WEB_MAP_FILTRO_TIPOS_KEY,
        });
        initTenantPrimerIngresoBootstrap();
        initGnTenantAccesoTecnicoUnificado({
            abrirWizardMarcaEmpresaManualTrasPassword,
        });
        initGnTenantSoloTecnicoUI({
            rolApp,
            esAdmin,
            togglePanel,
            abrirWizardTenant: () =>
                typeof window.gnAbrirWizardTenantUnificado === 'function'
                    ? window.gnAbrirWizardTenantUnificado()
                    : undefined,
        });
        initSetupWizardBindings();
        initAdminCambiarCredenciales({
            getApp: () => app,
            getApiToken,
            apiUrl,
            getModoOffline: () => modoOffline,
            esc,
            sqlSimple,
            sqlFiltroUsuariosPorTenant,
            actualizarBarraHeaderSesion,
            logErrorWeb,
            mensajeErrorUsuario,
            toast,
            ejecutarCerrarSesion,
        });
        initAdminClaveProvisoria({
            esAdmin,
            getModoOffline: () => modoOffline,
            getApiToken,
            apiUrl: getApiBaseUrl,
            asegurarJwtApiRest,
            toast,
            toastError,
            cargarListaUsuarios,
            refrescarUsuariosCacheDesdeNeon,
        });
        initAuthLoginApiTenantResolver(() => tenantIdActual());
        (function showAndroidExportsBtn() {
            const b = document.getElementById('btn-android-descargas');
            if (b && window.AndroidDevice && typeof window.AndroidDevice.openExportsFolder === 'function') {
                b.style.display = '';
            }
        })();

        // 1. Cargar config.json
        const configOk = await cargarAppConfig();
        if (!configOk) return; // No continuar sin config

        // 2. Cargar EmailJS si hay config
        if (window.APP_CONFIG?.emailjs?.publicKey) {
            const ejsScript = document.createElement('script');
            ejsScript.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
            ejsScript.onload = () => {
                try {
                    if (window.emailjs && window.APP_CONFIG?.emailjs?.publicKey) {
                        emailjs.init(window.APP_CONFIG.emailjs.publicKey);
                    }
                } catch (_) {}
            };
            document.head.appendChild(ejsScript);
        }

        // Llamar conectarNeon() DESPUÉS de cargar config (timing correcto)
        await conectarNeon();
        if (document.getElementById('ls')?.classList.contains('active')) {
            if (sesionCompletaParaMarcaLogin()) {
                hydrateBrandingForPublicScreen();
                try {
                    if (NEON_OK) await cargarConfigEmpresa();
                } catch (_) {}
                try {
                    aplicarMarcaVisualCompleta();
                } catch (_) {}
            } else {
                try {
                    pintarCabeceraLoginWizardGenerica();
                } catch (_) {}
                try {
                    if (NEON_OK) await cargarConfigEmpresa();
                } catch (_) {}
            }
        }
    } catch (e) {
        console.warn('[iniciarApp]', e && e.message ? e.message : e);
        try {
            const dbsEl = document.getElementById('dbs');
            if (dbsEl && /Verificando red|preparando tablas/i.test(dbsEl.textContent || '')) {
                dbsEl.className = 'dbs er';
                dbsEl.innerHTML =
                    '<i class="fas fa-exclamation-triangle"></i> Error al iniciar. Reintentá; si usás la web, publicá también la carpeta <code>modules/</code>.';
            }
        } catch (_) {}
    } finally {
        try {
            window.__GESTORNOVA_APP_READY__ = 1;
        } catch (_) {}
        habilitarBotonIngresarLogin();
        try {
            if (typeof Event === 'function') window.dispatchEvent(new Event('gestornova-app-ready'));
        } catch (_) {}
    }
})();


// ── Descargar gráfico como PNG ────────────────────────────────
function descargarGrafico(canvasId, nombre) {
    gnCerrarModalPedidoDetalleSiAbierto();
    const canvas = document.getElementById(canvasId);
    if (!canvas) { toast('Gráfico no disponible', 'error'); return; }
    try {
        // Crear canvas con fondo blanco para la descarga
        const tmp = document.createElement('canvas');
        tmp.width  = canvas.width;
        tmp.height = canvas.height;
        const ctx = tmp.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, 0);
        const link = document.createElement('a');
        link.download = nombre + '_' + new Date().toISOString().slice(0,10) + '.png';
        link.href = tmp.toDataURL('image/png');
        link.click();
        toast('Gráfico descargado', 'success');
    } catch(e) {
        toastError('descargar-grafico', e, 'No se pudo descargar.');
    }
}
window.descargarGrafico = descargarGrafico;

try {
    setPedidoNuevoReverseGeoDeps({
        apiUrl,
        asegurarJwtApiRest,
        getApiToken,
        toast,
        modoOffline: () => modoOffline,
        get NEON_OK() {
            return NEON_OK;
        },
        sqlSimple,
        esc,
        tenantIdActual,
        sociosCatalogoTieneTenantId,
        esMunicipioRubro,
    });
} catch (_) {}

try {
    initPedidoNuevoOficina({
        esAdminSesionWebPublica,
        limpiarFotosYPreviewNuevoPedido,
        poblarSelectTiposReclamo,
        syncNisClienteReclamoConexionUI,
        cargarDistribuidores,
        htmlLineaUbicacionFormulario,
        syncWrapCoordsDisplayNuevoPedido,
        mostrarMarcadorUbicacion,
        ensureMapReady,
        nominatimFetchSearch: _nominatimFetchSearch,
        parseEmpresaCfgLatLngBase,
        resolverUbicacionCentralTenantParaMapa,
    });
} catch (_) {}

try {
    initPedidoNuevoDesdePunto({
        esAdminSesionWebPublica,
        ensureMapReady,
        htmlLineaUbicacionFormulario,
        syncWrapCoordsDisplayNuevoPedido,
        mostrarMarcadorUbicacion,
        limpiarFotosYPreviewNuevoPedido,
        poblarSelectTiposReclamo,
        syncNisClienteReclamoConexionUI,
        esAndroidWebViewMapa,
        desarmarMapTapNuevoPedido,
        gnMapaLigero,
        calcularEscalaReal,
        programarReverseNominatimFormularioNuevoPedidoDesdeMapa,
    });
} catch (_) {}

try {
    initPedidoNuevoPadronBusqueda({
        sqlSimple,
        esc,
        tenantIdActual,
        sociosCatalogoTieneTenantId,
        neonOk: () => !!NEON_OK,
        modoOffline: () => !!modoOffline,
        apiUrl,
        getApiToken,
        normalizarRubroEmpresa,
        esCooperativaElectricaRubro,
        esMunicipioRubro,
        esCooperativaAguaRubro,
        ensureDistribuidoresCargados: async () => {
            try {
                await cargarDistribuidores();
            } catch (_) {}
        },
    });
} catch (_) {}

try {
    installAdminSociosHistorialPedidos({
        sqlSimple,
        esc,
        pedidosFiltroTenantSql,
        fmtInformeFecha,
        neonOk: () => !!NEON_OK,
    });
} catch (_) {}

try {
    const depsBusquedaPadronHistorial = {
        sqlSimple,
        pedidosFiltroTenantSql,
        tenantIdActual,
        fmtInformeFecha,
        neonOk: () => !!NEON_OK,
        normalizarRubroEmpresa,
        etiquetaNisSocio: () => {
            if (typeof esMunicipioRubro === 'function' && esMunicipioRubro()) return 'ID vecino';
            if (typeof esCooperativaAguaRubro === 'function' && esCooperativaAguaRubro()) return 'ID socio';
            return 'NIS';
        },
    };
    installBusquedaApellidoHistorial(depsBusquedaPadronHistorial);
    installBusquedaDireccionHistorial(depsBusquedaPadronHistorial);
} catch (_) {}

try {
    installAdminSociosBusquedaPadron({
        sqlSimple,
        pedidosFiltroTenantSql,
        tenantIdActual,
        neonOk: () => !!NEON_OK,
        normalizarRubroEmpresa,
        apiUrl,
        getApiToken,
        etiquetaNisSocio: () => {
            if (typeof esMunicipioRubro === 'function' && esMunicipioRubro()) return 'ID vecino';
            if (typeof esCooperativaAguaRubro === 'function' && esCooperativaAguaRubro()) return 'N° socio';
            return 'NIS o medidor';
        },
    });
} catch (_) {}

try {
    installAdminSociosUsarEnPedido({
        sqlSimple,
        esc,
        tenantIdActual,
        sociosCatalogoTieneTenantId,
        normalizarRubroEmpresa,
        esCooperativaElectricaRubro,
        esMunicipioRubro,
        esCooperativaAguaRubro,
        ensureDistribuidoresCargados: async () => {
            try {
                await cargarDistribuidores();
            } catch (_) {}
        },
        neonOk: () => !!NEON_OK,
    });
} catch (_) {}

try {
    installPedidoVolverPendiente({
        esAdmin,
        modoOffline: () => !!modoOffline,
        pedidoPutApi,
        norm,
        app: () => app,
        offlinePedidosSave,
        render,
        detalle,
    });
} catch (_) {}

// Inits admin pesados (export estadísticas, CSV tipo, derivaciones onclick, históricos): ver ensureAdminPanelDeferredBindings al abrir admin.

// ── Exponer funciones admin al scope global ────────────
if (typeof adminTab !== "undefined") window.adminTab = adminTab;
if (typeof guardarConfigEmpresa !== "undefined") window.guardarConfigEmpresa = guardarConfigEmpresa;
if (typeof abrirFormUsuario !== "undefined") window.abrirFormUsuario = abrirFormUsuario;
if (typeof crearUsuario !== "undefined") window.crearUsuario = crearUsuario;
if (typeof toggleUsuario !== "undefined") window.toggleUsuario = toggleUsuario;
if (typeof editarTelefonoWhatsappUsuario !== "undefined") window.editarTelefonoWhatsappUsuario = editarTelefonoWhatsappUsuario;
if (typeof eliminarUsuario !== "undefined") window.eliminarUsuario = eliminarUsuario;
if (typeof abrirFormDistribuidor !== "undefined") window.abrirFormDistribuidor = abrirFormDistribuidor;
if (typeof crearDistribuidor !== "undefined") window.crearDistribuidor = crearDistribuidor;
if (typeof eliminarDistribuidor !== "undefined") window.eliminarDistribuidor = eliminarDistribuidor;
if (typeof importarExcelDistribuidores !== "undefined") window.importarExcelDistribuidores = importarExcelDistribuidores;
if (typeof cargarEstadisticas !== "undefined") window.cargarEstadisticas = cargarEstadisticas;
if (typeof cargarUbicacionesUsuarios !== "undefined") window.cargarUbicacionesUsuarios = cargarUbicacionesUsuarios;
if (typeof pasoResetPw !== "undefined") window.pasoResetPw = pasoResetPw;
if (typeof toggleOfflineBanner !== "undefined") window.toggleOfflineBanner = toggleOfflineBanner;
if (typeof reactivarSesion !== "undefined") window.reactivarSesion = reactivarSesion;
if (typeof abrirAdmin !== "undefined") window.abrirAdmin = abrirAdmin;
if (typeof cargarListaUsuarios !== "undefined") window.cargarListaUsuarios = cargarListaUsuarios;
if (typeof cargarListaDistribuidoresAdmin !== "undefined") window.cargarListaDistribuidoresAdmin = cargarListaDistribuidoresAdmin;
if (typeof cargarFormEmpresa !== "undefined") window.cargarFormEmpresa = cargarFormEmpresa;
if (typeof cargarConfigEmpresa !== "undefined") window.cargarConfigEmpresa = cargarConfigEmpresa;
if (typeof cargarListaSociosAdmin !== "undefined") window.cargarListaSociosAdmin = cargarListaSociosAdmin;
if (typeof importarExcelSocios !== "undefined") window.importarExcelSocios = importarExcelSocios;
if (typeof mostrarFormatoExcelSocios !== "undefined") window.mostrarFormatoExcelSocios = mostrarFormatoExcelSocios;
if (typeof cerrarModalFormatoExcelSocios !== "undefined") window.cerrarModalFormatoExcelSocios = cerrarModalFormatoExcelSocios;
if (typeof descargarPlantillaCsvSociosRubro !== "undefined") window.descargarPlantillaCsvSociosRubro = descargarPlantillaCsvSociosRubro;
if (typeof buscarHistorialPorNIS !== "undefined") window.buscarHistorialPorNIS = buscarHistorialPorNIS;
if (typeof generarInformeMensualENRE !== "undefined") window.generarInformeMensualENRE = generarInformeMensualENRE;
if (typeof exportInformeMensualExcel !== "undefined") window.exportInformeMensualExcel = exportInformeMensualExcel;
window.exportarPedidosExcelAdmin = window.exportarPedidosCsvAdmin = async function () {
    return exportarPedidosExcelAdminDeferred(() => _depsAdminPanelDeferred());
};
if (typeof imprimirInformeConGraficos !== "undefined") window.imprimirInformeConGraficos = imprimirInformeConGraficos;
if (typeof generarPdfEstadisticasMultipaginaENRE !== "undefined") window.generarPdfEstadisticasMultipaginaENRE = generarPdfEstadisticasMultipaginaENRE;
if (typeof abrirModalDashboardGerencia !== "undefined") window.abrirModalDashboardGerencia = abrirModalDashboardGerencia;
if (typeof refrescarDashboardGerencia !== "undefined") window.refrescarDashboardGerencia = refrescarDashboardGerencia;
if (typeof activarModoFijarUbicacionAdmin !== "undefined") window.activarModoFijarUbicacionAdmin = activarModoFijarUbicacionAdmin;
if (typeof cancelarModoFijarUbicacionAdmin !== "undefined") window.cancelarModoFijarUbicacionAdmin = cancelarModoFijarUbicacionAdmin;
if (typeof centrarMapaAdminUbicacionesEnMapa !== "undefined") window.centrarMapaAdminUbicacionesEnMapa = centrarMapaAdminUbicacionesEnMapa;
if (typeof onMapaFiltroChange !== "undefined") window.onMapaFiltroChange = onMapaFiltroChange;
if (typeof resetMapaFiltros !== "undefined") window.resetMapaFiltros = resetMapaFiltros;
if (typeof toggleMapaDashBody !== "undefined") window.toggleMapaDashBody = toggleMapaDashBody;

