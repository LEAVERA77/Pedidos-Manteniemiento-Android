/**
 * WhatsApp human chat admin (poll + ventanas flotantes).
 * made by leavera77
 */

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setWhatsappHumanChatAdminDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function esAdmin() {
    return typeof _deps?.esAdmin === 'function' && _deps.esAdmin();
}
function toast(msg, type) {
    _deps?.toast?.(msg, type);
}
function toastError(code, e, msg) {
    _deps?.toastError?.(code, e, msg);
}
function getApiToken() {
    return _deps?.getApiToken?.();
}
function apiUrl(p) {
    return _deps?.apiUrl?.(p);
}
function asegurarJwtApiRest() {
    return _deps?.asegurarJwtApiRest?.();
}
function puedeEnviarApiRestPedidos() {
    return _deps?.puedeEnviarApiRestPedidos?.();
}
function modoOffline() {
    return !!_deps?.modoOffline?.();
}
function escOpt(s) {
    return _deps?.escOpt?.(s) ?? String(s ?? '');
}

let _waHcPollInterval = null;
let _waHcKnownSessionIds = new Set();
let _waHcPollPrimed = false;
/** @type {Map<string, { root: HTMLElement, visible: boolean, dockChip: HTMLElement|null, metaEl: HTMLElement, msgBox: HTMLElement, ta: HTMLTextAreaElement, titleEl: HTMLElement }>} */
let _waHcWindows = new Map();
let _waHcMessagePollInterval = null;
/** Por encima de pestañas fijas del mapa (≈9600); coincide con .wa-hc-float en styles.css */
let _waHcFloatZ = 10060;

export function detenerRefrescoMensajesWaHcVentanas() {
    if (_waHcMessagePollInterval) {
        clearInterval(_waHcMessagePollInterval);
        _waHcMessagePollInterval = null;
    }
}

export function asegurarRefrescoMensajesWaHcVentanas() {
    if (_waHcMessagePollInterval || _waHcWindows.size === 0) return;
    _waHcMessagePollInterval = setInterval(() => {
        for (const [sid, st] of _waHcWindows) {
            if (st.visible) refrescarMensajesWaHcVentana(Number(sid));
        }
    }, 3500);
}

export function destruirTodasVentanasWaHc() {
    for (const st of _waHcWindows.values()) {
        try { st.root.remove(); } catch (_) {}
        try { if (st.dockChip && st.dockChip.parentElement) st.dockChip.remove(); } catch (_) {}
    }
    _waHcWindows.clear();
    const dock = document.getElementById('wa-human-chat-dock');
    if (dock) dock.innerHTML = '';
    detenerRefrescoMensajesWaHcVentanas();
}

export function detenerPollWhatsappHumanChat() {
    if (_waHcPollInterval) {
        clearInterval(_waHcPollInterval);
        _waHcPollInterval = null;
    }
}

export function iniciarPollWhatsappHumanChat() {
    detenerPollWhatsappHumanChat();
    if (!esAdmin()) return;
    _waHcPollPrimed = false;
    _waHcKnownSessionIds.clear();
    const tick = () => { pollWhatsappHumanChatCola(); };
    tick();
    _waHcPollInterval = setInterval(tick, 5000);
}

export async function pollWhatsappHumanChatCola() {
    if (!_deps?.getAppUser?.() || !esAdmin() || modoOffline() || !puedeEnviarApiRestPedidos()) return;
    try {
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) return;
        const r = await fetch(apiUrl('/api/whatsapp/human-chat/sessions'), {
            headers: { Authorization: `Bearer ${tok}` }
        });
        if (!r.ok) return;
        const data = await r.json();
        const list = data.sessions || [];
        const idsNow = new Set(list.map(s => String(s.id)));
        for (const k of [..._waHcKnownSessionIds]) {
            if (!idsNow.has(k)) _waHcKnownSessionIds.delete(k);
        }
        if (!_waHcPollPrimed) {
            _waHcPollPrimed = true;
            for (const s of list) {
                const id = String(s.id);
                _waHcKnownSessionIds.add(id);
                mostrarToastWaHumanChatNuevo(s);
            }
            return;
        }
        for (const s of list) {
            const id = String(s.id);
            if (_waHcKnownSessionIds.has(id)) continue;
            _waHcKnownSessionIds.add(id);
            mostrarToastWaHumanChatNuevo(s);
        }
    } catch (_) {}
}

export function mostrarToastWaHumanChatNuevo(s) {
    const host = document.getElementById('wa-human-chat-toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'wa-human-chat-toast';
    const name = String(s.contact_name || '').trim() || 'Cliente';
    const ph = String(s.phone_canonical || '');
    el.innerHTML = `<strong><i class="fas fa-comments"></i> Cliente pide chat</strong><br>${escOpt(name)} · ${escOpt(ph)}<br><span style="font-size:.76rem;opacity:.9">Tocá para abrir</span>`;
    el.onclick = () => {
        try { el.remove(); } catch (_) {}
        abrirModalWhatsappHumanChat(Number(s.id));
    };
    host.appendChild(el);
    setTimeout(() => { try { if (el.parentElement) el.remove(); } catch (_) {} }, 45000);
}

export function traerAlFrenteVentanaWaHc(floatEl) {
    try {
        if (typeof window.gnBumpOverlayElement === 'function') {
            window.gnBumpOverlayElement(floatEl);
            return;
        }
    } catch (_) {}
    _waHcFloatZ++;
    floatEl.style.zIndex = String(_waHcFloatZ);
}

export function attachWaHcDrag(headerEl, floatEl) {
    headerEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const r = floatEl.getBoundingClientRect();
        const ox = r.left;
        const oy = r.top;
        const sx = e.clientX;
        const sy = e.clientY;
        traerAlFrenteVentanaWaHc(floatEl);
        const onMove = (ev) => {
            floatEl.style.left = (ox + ev.clientX - sx) + 'px';
            floatEl.style.top = (oy + ev.clientY - sy) + 'px';
            floatEl.style.right = 'auto';
            floatEl.style.bottom = 'auto';
        };
        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    });
    headerEl.addEventListener('touchstart', (e) => {
        if (e.target.closest('button')) return;
        const t0 = e.touches[0];
        if (!t0) return;
        const r = floatEl.getBoundingClientRect();
        const ox = r.left;
        const oy = r.top;
        const sx = t0.clientX;
        const sy = t0.clientY;
        traerAlFrenteVentanaWaHc(floatEl);
        const onMove = (ev) => {
            const t = ev.touches[0];
            if (!t) return;
            floatEl.style.left = (ox + t.clientX - sx) + 'px';
            floatEl.style.top = (oy + t.clientY - sy) + 'px';
            floatEl.style.right = 'auto';
            floatEl.style.bottom = 'auto';
        };
        const onEnd = () => {
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('touchcancel', onEnd);
        };
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('touchcancel', onEnd);
    }, { passive: true });
}

export function actualizarTituloYChipDockWaHc(sidStr, titulo) {
    const st = _waHcWindows.get(sidStr);
    if (!st) return;
    const t = String(titulo || '').trim() || ('Chat #' + sidStr);
    st.titleEl.textContent = t;
    if (st.dockChip && st.dockChip.isConnected) {
        const short = t.length > 40 ? t.slice(0, 38) + '…' : t;
        st.dockChip.textContent = short;
    }
}

export function ensureDockChipWaHc(sidStr, st) {
    if (st.dockChip && st.dockChip.isConnected) return;
    const dock = document.getElementById('wa-human-chat-dock');
    if (!dock) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'wa-hc-dock-chip';
    chip.setAttribute('aria-label', 'Volver al chat de WhatsApp');
    const t = String(st.titleEl.textContent || 'Chat').trim() || ('Chat #' + sidStr);
    chip.textContent = t.length > 40 ? t.slice(0, 38) + '…' : t;
    chip.onclick = () => restaurarVentanaWaHc(sidStr);
    dock.appendChild(chip);
    st.dockChip = chip;
}

export function minimizarVentanaWaHc(sidStr) {
    const st = _waHcWindows.get(sidStr);
    if (!st) return;
    st.root.style.display = 'none';
    st.visible = false;
    ensureDockChipWaHc(sidStr, st);
}

export function restaurarVentanaWaHc(sidStr) {
    const st = _waHcWindows.get(sidStr);
    if (!st) return;
    st.root.style.display = 'flex';
    st.visible = true;
    if (st.dockChip) {
        try { st.dockChip.remove(); } catch (_) {}
        st.dockChip = null;
    }
    traerAlFrenteVentanaWaHc(st.root);
    refrescarMensajesWaHcVentana(Number(sidStr));
    asegurarRefrescoMensajesWaHcVentanas();
}

export function crearVentanaFlotanteWaHc(sidNum) {
    const sidStr = String(sidNum);
    const idx = _waHcWindows.size;
    const root = document.createElement('div');
    root.className = 'wa-hc-float';
    root.style.left = 'auto';
    root.style.right = (10 + (idx % 3) * 14) + 'px';
    root.style.top = (70 + (idx % 5) * 34) + 'px';
    root.dataset.waHcSession = sidStr;

    const header = document.createElement('div');
    header.className = 'wa-hc-float-h';
    const titleEl = document.createElement('span');
    titleEl.style.flex = '1';
    titleEl.style.minWidth = '0';
    titleEl.style.overflow = 'hidden';
    titleEl.style.textOverflow = 'ellipsis';
    titleEl.style.whiteSpace = 'nowrap';
    titleEl.textContent = 'Chat #' + sidStr;

    const actions = document.createElement('div');
    actions.className = 'wa-hc-float-actions';

    const btnMin = document.createElement('button');
    btnMin.type = 'button';
    btnMin.title = 'Minimizar: el chat sigue a la izquierda';
    btnMin.setAttribute('aria-label', 'Minimizar chat');
    btnMin.textContent = '–';
    btnMin.onclick = (e) => { e.stopPropagation(); minimizarVentanaWaHc(sidStr); };

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.title = 'Cerrar ventana: el chat no se pierde; tocá el aviso a la izquierda';
    btnClose.setAttribute('aria-label', 'Cerrar ventana del chat');
    btnClose.innerHTML = '<i class="fas fa-times"></i>';
    btnClose.onclick = (e) => { e.stopPropagation(); minimizarVentanaWaHc(sidStr); };

    actions.appendChild(btnMin);
    actions.appendChild(btnClose);
    header.appendChild(titleEl);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'wa-hc-float-body';
    const metaEl = document.createElement('div');
    metaEl.className = 'wa-hc-float-meta';
    metaEl.textContent = 'Cargando…';
    const msgBox = document.createElement('div');
    msgBox.className = 'wa-hc-thread';
    const ta = document.createElement('textarea');
    ta.className = 'wa-hc-float-ta';
    ta.rows = 3;
    ta.placeholder = 'Respuesta… Enter envía · Shift+Enter nueva línea';
    ta.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        enviarMensajeWaHcDesdeVentana(sidNum);
    });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:.45rem;flex-wrap:wrap;align-items:center';
    const btnSend = document.createElement('button');
    btnSend.type = 'button';
    btnSend.className = 'bp btn-sm';
    btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
    btnSend.onclick = () => enviarMensajeWaHcDesdeVentana(sidNum);

    const btnDeact = document.createElement('button');
    btnDeact.type = 'button';
    btnDeact.className = 'btn-sm warning';
    btnDeact.textContent = 'Desactivar chat';
    btnDeact.title = 'Cierra la sesión humana: el bot vuelve a atender solo';
    btnDeact.onclick = () => desactivarChatWaHc(sidNum);

    row.appendChild(btnSend);
    row.appendChild(btnDeact);
    body.appendChild(metaEl);
    body.appendChild(msgBox);
    body.appendChild(ta);
    body.appendChild(row);

    root.appendChild(header);
    root.appendChild(body);
    document.body.appendChild(root);

    attachWaHcDrag(header, root);
    traerAlFrenteVentanaWaHc(root);

    const st = { root, visible: true, dockChip: null, metaEl, msgBox, ta, titleEl };
    _waHcWindows.set(sidStr, st);
    return st;
}

/** Etiqueta legible para teléfonos guardados como dígitos (WhatsApp / Meta). */
export function fmtTelWaMeta(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (!d) return '—';
    if (d.startsWith('54')) return '+' + d;
    return '+' + d;
}

export async function refrescarMensajesWaHcVentana(sidNum) {
    const sidStr = String(sidNum);
    const st = _waHcWindows.get(sidStr);
    if (!st || !st.visible) return;
    const tok = getApiToken();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${sidNum}/messages`), {
            headers: { Authorization: `Bearer ${tok}` }
        });
        if (!r.ok) {
            if (r.status === 404) toast('Conversación no encontrada', 'error');
            return;
        }
        const data = await r.json();
        if (data.session) {
            const cn = String(data.session.contact_name || '').trim();
            const line = (cn ? cn + ' · ' : '') +
                'Tel: ' + fmtTelWaMeta(data.session.phone_canonical) +
                ' · Estado: ' + (data.session.estado || '');
            st.metaEl.textContent = line;
            actualizarTituloYChipDockWaHc(sidStr, cn || ('Chat · ' + fmtTelWaMeta(data.session.phone_canonical)));
        }
        if (Array.isArray(data.messages)) {
            st.msgBox.innerHTML = data.messages.map(m =>
                `<div class="${m.direction === 'in' ? 'wa-hc-bubble-in' : 'wa-hc-bubble-out'}">${escOpt(m.body)}</div>`
            ).join('');
            st.msgBox.scrollTop = st.msgBox.scrollHeight;
        }
    } catch (_) {}
}

export async function enviarMensajeWaHcDesdeVentana(sidNum) {
    const sidStr = String(sidNum);
    const st = _waHcWindows.get(sidStr);
    if (!st) return;
    const text = String(st.ta?.value || '').trim();
    if (!text) return;
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${sidNum}/send`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.error || 'HTTP ' + r.status);
        }
        st.ta.value = '';
        await refrescarMensajesWaHcVentana(sidNum);
        toast('Mensaje enviado', 'success');
    } catch (e) {
        toastError('wa-hc-enviar', e, 'No se pudo enviar el mensaje.');
    }
}

export async function desactivarChatWaHc(sidNum) {
    const sidStr = String(sidNum);
    if (!confirm('¿Desactivar este chat? El bot volverá a atender al cliente solo.')) return;
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${sidNum}/close`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
        });
        if (!r.ok) throw new Error('close');
        _waHcKnownSessionIds.delete(sidStr);
        const st = _waHcWindows.get(sidStr);
        if (st) {
            try { st.dockChip?.remove(); } catch (_) {}
            try { st.root.remove(); } catch (_) {}
            _waHcWindows.delete(sidStr);
        }
        if (_waHcWindows.size === 0) detenerRefrescoMensajesWaHcVentanas();
        toast('Chat desactivado', 'success');
    } catch (e) {
        toast('No se pudo desactivar el chat', 'error');
    }
}

export function cerrarModalWaHumanChat() {
    for (const sidStr of [..._waHcWindows.keys()]) {
        minimizarVentanaWaHc(sidStr);
    }
}

export async function abrirModalWhatsappHumanChat(prefSessionId) {
    if (!puedeEnviarApiRestPedidos()) {
        toast('Sin conexión a la API para el chat', 'warning');
        return;
    }
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    const prefNum = prefSessionId != null ? Number(prefSessionId) : NaN;
    if (Number.isFinite(prefNum)) {
        const k = String(prefNum);
        if (_waHcWindows.has(k)) {
            try {
                await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${prefNum}/activate`), {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
                });
            } catch (_) {}
            restaurarVentanaWaHc(k);
            await refrescarMensajesWaHcVentana(prefNum);
            asegurarRefrescoMensajesWaHcVentanas();
            return;
        }
    }
    try {
        const r = await fetch(apiUrl('/api/whatsapp/human-chat/sessions'), {
            headers: { Authorization: `Bearer ${tok}` }
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        let data = await r.json();
        let list = data.sessions || [];
        let useId = null;
        if (prefSessionId && list.some(x => Number(x.id) === Number(prefSessionId))) {
            useId = Number(prefSessionId);
        } else if (list[0]) {
            useId = Number(list[0].id);
        } else if (prefSessionId) {
            useId = Number(prefSessionId);
        }
        if (!useId || !Number.isFinite(useId)) {
            toast('No hay conversaciones en cola para abrir', 'info');
            return;
        }
        const ar = await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${useId}/activate`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
        });
        if (!ar.ok) {
            const err = await ar.json().catch(() => ({}));
            toast(err.error || ('No se pudo activar la sesión (' + ar.status + ')'), 'warning');
        }
        if (!_waHcWindows.has(String(useId))) crearVentanaFlotanteWaHc(useId);
        else restaurarVentanaWaHc(String(useId));
        await refrescarMensajesWaHcVentana(useId);
        asegurarRefrescoMensajesWaHcVentanas();
    } catch (e) {
        toastError('wa-hc-abrir', e, 'No se pudo abrir el chat.');
    }
}

export function onWaHcPickerChange() {}

export async function enviarMensajeWaHumanChatAdmin() {
    toast('Abrí el chat desde el aviso o el panel flotante.', 'info');
}

export async function finalizarChatWaHumanChatAdmin() {
    toast('Usá «Desactivar chat» en la ventana de esa conversación.', 'info');
}






export function wireWhatsappHumanChatAdminWindow() {
    if (typeof window === 'undefined') return;
    window.cerrarModalWaHumanChat = cerrarModalWaHumanChat;
    window.abrirModalWhatsappHumanChat = abrirModalWhatsappHumanChat;
    window.onWaHcPickerChange = onWaHcPickerChange;
    window.enviarMensajeWaHumanChatAdmin = enviarMensajeWaHumanChatAdmin;
    window.finalizarChatWaHumanChatAdmin = finalizarChatWaHumanChatAdmin;
}
