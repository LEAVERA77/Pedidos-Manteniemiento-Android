/**
 * WebView Android: al centrar un pedido en el mapa (zoom máximo), limpia paneles y overlays
 * que `closeAll()` no cubre (foto ampliada, avance, impresión, admin, lista #bp2, chips flotantes del mapa).
 * made by leavera77
 */

const GN_MAP_TAB_IDS = ['map-tab-filtros', 'map-tab-filtro-tipo', 'map-tab-colores', 'map-tab-dash'];

export function gnAndroidCerrarUiEncimaDelMapaParaZoomPedido() {
    try {
        if (typeof document === 'undefined') return;
        document.getElementById('modal-foto-ampliada')?.classList.remove('active');
        document.getElementById('avance-modal')?.classList.remove('active');
        if (typeof window.cerrarVistaImpresion === 'function') window.cerrarVistaImpresion();
        if (typeof window.cerrarAdminPanel === 'function') window.cerrarAdminPanel();
        document.getElementById('gw')?.classList.remove('active');
        document.getElementById('ls')?.classList.remove('active');
        document.getElementById('ms')?.classList.add('active');
        GN_MAP_TAB_IDS.forEach((id) => {
            document.getElementById(id)?.classList.remove('visible');
        });
        if (typeof window.setBp2PanelHidden === 'function') window.setBp2PanelHidden(true);
    } catch (_) {}
}
