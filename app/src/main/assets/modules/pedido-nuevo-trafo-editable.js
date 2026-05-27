/**
 * Trafo en #pm: editable si no hay NIS (reclamo solo por ubicación en mapa).
 * made by leavera77
 */

function esCooperativaElectricaRubro() {
    const t = String(window.EMPRESA_CFG?.tipo || '')
        .trim()
        .toLowerCase();
    return (
        t === 'cooperativa_electrica' ||
        t === 'cooperativa eléctrica' ||
        t === 'cooperativa electrica'
    );
}

export function syncTrafoPedidoNuevoEditable() {
    const tf = document.getElementById('trafo-pedido');
    if (!tf || !esCooperativaElectricaRubro()) return;
    const nis = String(document.getElementById('nis')?.value || '').trim();
    if (nis) {
        tf.readOnly = true;
        tf.setAttribute('readonly', 'readonly');
        tf.style.background = 'var(--bg2,#f1f5f9)';
        tf.style.cursor = 'default';
        tf.placeholder = 'Se completa con NIS en catálogo';
    } else {
        tf.readOnly = false;
        tf.removeAttribute('readonly');
        tf.style.background = '';
        tf.style.cursor = '';
        tf.placeholder = 'Sin NIS: ingresá trafo a mano (opcional)';
    }
}

function bindNisInputTrafoSync() {
    const nis = document.getElementById('nis');
    if (!nis || nis.dataset.gnTrafoSync === '1') return;
    nis.dataset.gnTrafoSync = '1';
    nis.addEventListener('input', () => syncTrafoPedidoNuevoEditable(), { passive: true });
}

export function installTrafoPedidoNuevoListeners() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            bindNisInputTrafoSync();
            syncTrafoPedidoNuevoEditable();
        }, { once: true });
    } else {
        bindNisInputTrafoSync();
        syncTrafoPedidoNuevoEditable();
    }
}

if (typeof window !== 'undefined') {
    window.syncTrafoPedidoNuevoEditable = syncTrafoPedidoNuevoEditable;
}
