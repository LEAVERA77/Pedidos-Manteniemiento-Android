/**
 * Botones "Descargar" y "Compartir" en el visor de foto ampliada.
 * En Android WebView usa el bridge AndroidImageShare; en web usa el API nativo de share/download.
 * made by leavera77
 */

(function initFotoCompartir() {
    const btnCompartir = document.getElementById('foto-compartir');
    const btnDescargar = document.getElementById('foto-guardar');
    const img = document.getElementById('foto-ampliada');
    if (!btnCompartir || !img) return;

    const isAndroid = typeof window.AndroidImageShare !== 'undefined';

    function getCurrentSrc() {
        return (img && img.src) ? img.src : '';
    }

    btnCompartir.addEventListener('click', async (e) => {
        e.stopPropagation();
        const src = getCurrentSrc();
        if (!src) return;

        if (isAndroid && typeof window.AndroidImageShare.shareImage === 'function') {
            window.AndroidImageShare.shareImage(src);
            return;
        }

        if (navigator.share && navigator.canShare) {
            try {
                const resp = await fetch(src, { mode: 'cors', credentials: 'omit' });
                const blob = await resp.blob();
                const file = new File([blob], 'imagen-gestornova.jpg', { type: blob.type || 'image/jpeg' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'Imagen del pedido' });
                    return;
                }
            } catch (_) {}
        }

        if (typeof window.toast === 'function') {
            window.toast('Compartir no disponible en este navegador', 'warning');
        }
    });

    btnDescargar.addEventListener('click', (e) => {
        e.stopPropagation();
        const src = getCurrentSrc();
        if (!src) return;

        if (isAndroid && typeof window.AndroidImageShare.downloadImage === 'function') {
            window.AndroidImageShare.downloadImage(src);
            return;
        }
    });

    const observer = new MutationObserver(() => {
        const modal = document.getElementById('modal-foto-ampliada');
        const active = modal && modal.classList.contains('active');
        if (active) {
            btnDescargar.style.display = 'flex';
            btnCompartir.style.display = 'flex';
        }
    });

    const modal = document.getElementById('modal-foto-ampliada');
    if (modal) {
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
})();
