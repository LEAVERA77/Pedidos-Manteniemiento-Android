/**
 * Abre un PDF en nueva ventana e intenta imprimir. En WebView Android,
 * window.open(blob:) suele devolver null → fallback por descarga.
 */
export function abrirPdfBlobParaImpresion(blob, nombreArchivo) {
    const nombre =
        nombreArchivo ||
        `documento-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-6)}.pdf`;
    const url = URL.createObjectURL(blob);
    let ventana = null;
    try {
        ventana = window.open(url, '_blank');
    } catch (_) {}
    if (ventana) {
        setTimeout(() => {
            try {
                ventana.focus();
                ventana.print();
            } catch (_) {}
        }, 450);
        setTimeout(() => {
            try {
                URL.revokeObjectURL(url);
            } catch (_) {}
        }, 120000);
        return 'ventana';
    }
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.setAttribute('rel', 'noopener');
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (_) {
        try {
            URL.revokeObjectURL(url);
        } catch (_e) {}
        return 'fallo';
    }
    setTimeout(() => {
        try {
            URL.revokeObjectURL(url);
        } catch (_) {}
    }, 90000);
    return 'descarga';
}
