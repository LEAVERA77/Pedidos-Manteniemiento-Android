/**
 * Descarga automática diaria del Excel de socios (solo web admin, no Android).
 * Se ejecuta UNA sola vez por día, sin importar cuántas veces el admin recargue.
 * made by leavera77
 */

const LS_KEY = 'gn_socios_export_last';
const SS_KEY = 'gn_socios_export_session';

function isAndroidWebView() {
    return typeof window.AndroidConfig !== 'undefined' || typeof window.AndroidDevice !== 'undefined';
}

function alreadyDownloadedToday() {
    if (sessionStorage.getItem(SS_KEY)) return true;
    try {
        const last = localStorage.getItem(LS_KEY);
        if (!last) return false;
        const today = new Date().toISOString().slice(0, 10);
        return last === today;
    } catch (_) {
        return false;
    }
}

function markDownloadedToday() {
    const today = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(LS_KEY, today); } catch (_) {}
    try { sessionStorage.setItem(SS_KEY, '1'); } catch (_) {}
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
        const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : (p) => p;
        const tid =
            typeof window.tenantIdActual === 'function' ? Number(window.tenantIdActual()) : NaN;
        const q =
            Number.isFinite(tid) && tid > 0
                ? `?tenant_id=${encodeURIComponent(String(tid))}`
                : '';
        const resp = await fetch(apiUrlFn(`/api/socios/exportar${q}`), {
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
