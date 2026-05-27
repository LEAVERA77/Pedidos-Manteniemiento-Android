/**
 * Vista rápida del bbox de zona de servicio en el mapa.
 * made by leavera77
 */

export function abrirZonaServicioEnMapa(bbox) {
    if (!bbox || bbox.minLat == null) {
        window.toast?.('Sin bbox configurado', 'warn');
        return;
    }
    try {
        const la = (Number(bbox.minLat) + Number(bbox.maxLat)) / 2;
        const ln = (Number(bbox.minLng) + Number(bbox.maxLng)) / 2;
        if (typeof window.ensureMapReady === 'function') {
            void window.ensureMapReady().then(() => {
                if (window.map && typeof window.map.setView === 'function') {
                    window.map.setView([la, ln], 11);
                }
            });
        }
        document.getElementById('admin-panel')?.classList.remove('active');
        window.toast?.('Mapa centrado en zona de servicio', 'info');
    } catch (e) {
        window.toast?.(e.message || 'No se pudo abrir mapa', 'error');
    }
}
