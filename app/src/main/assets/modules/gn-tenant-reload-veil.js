/**
 * Pantalla completa antes de recargar tras cambio de tenant (evita restos visibles).
 * made by leavera77
 */

export function gnMostrarVeilRecargaTenant() {
    try {
        document.querySelectorAll('.mo.active').forEach((el) => {
            el.classList.remove('active');
        });
    } catch (_) {}
    try {
        document.getElementById('ms')?.classList.remove('active');
    } catch (_) {}
    try {
        document.getElementById('gw')?.classList.remove('active');
    } catch (_) {}
    let v = document.getElementById('gn-tenant-reload-veil');
    if (!v) {
        v = document.createElement('div');
        v.id = 'gn-tenant-reload-veil';
        v.setAttribute(
            'style',
            'position:fixed;inset:0;z-index:2147483646;background:#f1f5f9;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:.75rem;font-family:system-ui,sans-serif;padding:1rem;box-sizing:border-box'
        );
        v.innerHTML =
            '<p style="margin:0;font-size:1.05rem;color:#0f172a;font-weight:600;text-align:center">Aplicando tenant…</p>' +
            '<p style="margin:0;font-size:.85rem;color:#64748b;text-align:center">Se limpia la vista anterior y se recarga la app.</p>';
        document.body.appendChild(v);
    } else {
        v.style.display = 'flex';
    }
}
