/**
 * Descarga automática diaria del CSV de socios al iniciar sesión (solo web admin, no Android).
 * made by leavera77
 */

const LS_KEY = 'gn_socios_export_last';

function isAndroidWebView() {
    return typeof window.AndroidConfig !== 'undefined' || typeof window.AndroidDevice !== 'undefined';
}

function alreadyDownloadedToday() {
    const last = localStorage.getItem(LS_KEY);
    if (!last) return false;
    const today = new Date().toISOString().slice(0, 10);
    return last === today;
}

function markDownloadedToday() {
    localStorage.setItem(LS_KEY, new Date().toISOString().slice(0, 10));
}

function showExportToast() {
    if (typeof window.toast === 'function') {
        window.toast('Lista de socios descargada en Descargas', 'success');
    }
}

async function doExport() {
    try {
        const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
        if (!token) return;
        const apiUrl = typeof window.apiUrl === 'function' ? window.apiUrl('/api/socios/exportar') : '/api/socios/exportar';

        const resp = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const disposition = resp.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="?([^";\s]+)"?/);
        const filename = match ? match[1] : `socios_${new Date().toISOString().slice(0, 10)}.xlsx`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        markDownloadedToday();
        showExportToast();
    } catch (_) {}
}

export function initAdminSociosAutoExport() {
    if (isAndroidWebView()) return;
    if (alreadyDownloadedToday()) return;

    const esAdmin = typeof window.esAdmin === 'function' ? window.esAdmin() : false;
    if (!esAdmin) return;

    setTimeout(doExport, 4000);
}
