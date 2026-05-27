/**
 * Preferencias de notificaciones en Mi cuenta.
 * made by leavera77
 */

const HOST_ID = 'gn-notif-prefs-host';

const LABELS = [
    { key: 'asignacion', label: 'Nuevo pedido asignado' },
    { key: 'chat_interno', label: 'Mensajes en chat del pedido' },
    { key: 'cierre_pedido', label: 'Pedido cerrado' },
    { key: 'derivacion', label: 'Solicitudes de derivación' },
    { key: 'whatsapp', label: 'WhatsApp operativo (admin)' },
];

function apiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

function getTok() {
    return typeof window.getApiToken === 'function' ? window.getApiToken() : '';
}

function ensureHost() {
    const modal = document.getElementById('modal-mi-cuenta');
    if (!modal || document.getElementById(HOST_ID)) return;
    const mb = modal.querySelector('.mb');
    if (!mb) return;
    const div = document.createElement('div');
    div.id = HOST_ID;
    div.className = 'gn-notif-prefs-block';
    div.style.marginTop = '0.75rem';
    mb.appendChild(div);
}

async function cargarNotifPrefsUi() {
    ensureHost();
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    const tok = getTok();
    if (!tok) return;
    host.innerHTML = '<p style="font-size:.8rem;color:var(--tm)">Cargando notificaciones…</p>';
    try {
        const r = await fetch(apiUrl('/api/auth/notif-prefs'), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        const prefs = data.prefs || {};
        host.innerHTML = `<fieldset class="gn-notif-prefs-fieldset">
<legend style="font-size:.85rem;font-weight:600">Notificaciones en la app</legend>
${LABELS.map(
    (it) =>
        `<label class="gn-notif-prefs-row"><input type="checkbox" data-np="${it.key}" ${prefs[it.key] !== false ? 'checked' : ''}/> ${it.label}</label>`
).join('')}
<button type="button" class="btn btn-s" data-gn-np-save style="margin-top:.45rem">Guardar preferencias</button>
</fieldset>`;
        host.querySelector('[data-gn-np-save]')?.addEventListener('click', async () => {
            const body = {};
            host.querySelectorAll('[data-np]').forEach((inp) => {
                body[inp.getAttribute('data-np')] = inp.checked;
            });
            const r2 = await fetch(apiUrl('/api/auth/notif-prefs'), {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${tok}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prefs: body }),
            });
            const d2 = await r2.json().catch(() => ({}));
            if (!r2.ok) throw new Error(d2.error || r2.statusText);
            window.toast?.('Preferencias de notificación guardadas', 'ok');
        });
    } catch (e) {
        host.innerHTML = `<p style="font-size:.8rem;color:var(--re)">${e.message || ''}</p>`;
    }
}

function initGnNotifPrefsUi() {
    document.addEventListener('click', (e) => {
        const t = e.target;
        if (t?.closest?.('[onclick*="abrirModalMiCuenta"]') || t?.closest?.('.user-menu-item')) {
            setTimeout(() => void cargarNotifPrefsUi(), 120);
        }
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGnNotifPrefsUi, { once: true });
    } else initGnNotifPrefsUi();
}
