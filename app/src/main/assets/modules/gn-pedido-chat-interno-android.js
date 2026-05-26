/**
 * Chat interno del pedido en Android: panel flotante arrastrable (misma UX que .moui-card).
 * made by leavera77
 */

const CARD_ID = 'gn-pedido-chat-float';
const TAB_ID = 'gn-pedido-chat-float-tab';
const LS_POS = 'pmg_gn_pedido_chat_float_pos';

let _installed = false;
let _pollTimer = null;
let _msgPollTimer = null;
let _activePedidoId = null;
let _floatZ = 10055;

function esAndroidShell() {
    try {
        return document.documentElement.classList.contains('gn-android-shell');
    } catch (_) {
        return false;
    }
}

const esc = (t) =>
    String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

function pedidoEnApp(pid) {
    try {
        const list = window.app?.p;
        if (!Array.isArray(list)) return null;
        return list.find((x) => String(x.id) === String(pid)) || null;
    } catch (_) {
        return null;
    }
}

function numeroPedidoLabel(p, pid) {
    const np = String(p?.np ?? p?.numero_pedido ?? '').trim();
    return np || `#${pid}`;
}

function clampToViewport(el, leftPx, topPx) {
    const r = el.getBoundingClientRect();
    const w = r.width || 320;
    const h = r.height || 280;
    const pad = 8;
    const padBottom =
        typeof window.androidMouiMapPanelPadBottomPx === 'function'
            ? window.androidMouiMapPanelPadBottomPx()
            : 72;
    const maxL = Math.max(pad, window.innerWidth - w - pad);
    const maxT = Math.max(pad, window.innerHeight - h - padBottom);
    return {
        left: Math.min(maxL, Math.max(pad, leftPx)),
        top: Math.min(maxT, Math.max(pad, topPx)),
    };
}

function attachFloatDrag(headerEl, card) {
    if (!headerEl || card.dataset.gnChatDragInit === '1') return;
    card.dataset.gnChatDragInit = '1';
    const startDrag = (clientX, clientY) => {
        const r = card.getBoundingClientRect();
        const state = { sx: clientX, sy: clientY, sl: r.left, st: r.top, moved: false };
        const onMove = (ev) => {
            const cx = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
            const cy = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
            if (Math.abs(cx - state.sx) + Math.abs(cy - state.sy) > 5) state.moved = true;
            if (state.moved && ev.cancelable) ev.preventDefault();
            card.style.right = 'auto';
            card.style.bottom = 'auto';
            const c = clampToViewport(card, state.sl + cx - state.sx, state.st + cy - state.sy);
            card.style.left = `${c.left}px`;
            card.style.top = `${c.top}px`;
            traerAlFrente(card);
        };
        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('touchcancel', onEnd);
            if (state.moved) {
                try {
                    const br = card.getBoundingClientRect();
                    const c = clampToViewport(card, br.left, br.top);
                    card.style.left = `${c.left}px`;
                    card.style.top = `${c.top}px`;
                    localStorage.setItem(LS_POS, JSON.stringify({ left: c.left, top: c.top }));
                } catch (_) {}
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('touchcancel', onEnd);
    };
    headerEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
    });
    headerEl.addEventListener(
        'touchstart',
        (e) => {
            if (e.touches.length !== 1 || e.target.closest('button')) return;
            e.preventDefault();
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);
        },
        { passive: false }
    );
}

function traerAlFrente(card) {
    try {
        if (typeof window.gnBumpOverlayElement === 'function') {
            window.gnBumpOverlayElement(card);
            return;
        }
    } catch (_) {}
    _floatZ++;
    card.style.zIndex = String(_floatZ);
}

function ensureDom() {
    let card = document.getElementById(CARD_ID);
    if (card) return card;

    const overlay = document.getElementById('mapa-overlay-ui') || document.body;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = TAB_ID;
    tab.className = 'map-slide-tab gn-pedido-chat-float-tab';
    tab.title = 'Mostrar chat del reclamo';
    tab.innerHTML = '<i class="fas fa-comments"></i> Chat';
    tab.style.display = 'none';
    tab.addEventListener('click', () => {
        if (_activePedidoId != null) mostrarPanel(true);
    });
    const cluster = document.getElementById('map-slide-tabs-cluster');
    if (cluster) cluster.appendChild(tab);
    else overlay.appendChild(tab);

    card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'moui-card gn-pedido-chat-float';
    card.style.display = 'none';
    card.innerHTML = `
<div class="moui-hd gn-pedido-chat-float-hd">
  <i class="fas fa-grip-vertical moui-drag-handle" title="Arrastrar"></i>
  <i class="fas fa-comments"></i>
  <span class="gn-pedido-chat-float-title" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Chat equipo</span>
  <button type="button" class="ib-mini gn-pedido-chat-float-hide" title="Ocultar panel"><i class="fas fa-eye-slash"></i></button>
  <button type="button" class="ib-mini gn-pedido-chat-float-close" title="Cerrar chat"><i class="fas fa-times"></i></button>
</div>
<div class="moui-bd moui-scroll gn-pedido-chat-float-bd">
  <div id="gn-pedido-chat-float-msgs" class="gn-pedido-chat-float-msgs"></div>
  <div class="gn-pedido-chat-float-compose">
    <input type="text" id="gn-pedido-chat-float-input" maxlength="4000" placeholder="Mensaje para admin o técnico…" autocomplete="off">
    <button type="button" class="btn-sm primary" id="gn-pedido-chat-float-send">Enviar</button>
  </div>
</div>`;
    overlay.appendChild(card);
    initMouiDragWhenReady();

    const hd = card.querySelector('.gn-pedido-chat-float-hd');
    attachFloatDrag(hd, card);

    card.querySelector('.gn-pedido-chat-float-hide')?.addEventListener('click', (e) => {
        e.stopPropagation();
        ocultarPanelSlideoff(true);
    });
    card.querySelector('.gn-pedido-chat-float-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        cerrarPanel();
    });

    const sendBtn = document.getElementById('gn-pedido-chat-float-send');
    const inp = document.getElementById('gn-pedido-chat-float-input');
    sendBtn?.addEventListener('click', () => void enviarDesdeFloat());
    inp?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void enviarDesdeFloat();
        }
    });

    try {
        const raw = localStorage.getItem(LS_POS);
        if (raw) {
            const p = JSON.parse(raw);
            if (Number.isFinite(p.left) && Number.isFinite(p.top)) {
                card.style.position = 'fixed';
                card.style.right = 'auto';
                card.style.bottom = 'auto';
                const c = clampToViewport(card, p.left, p.top);
                card.style.left = `${c.left}px`;
                card.style.top = `${c.top}px`;
            }
        }
    } catch (_) {}

    if (!card.style.left) {
        card.style.position = 'fixed';
        card.style.left = '0.5rem';
        card.style.top = '5.5rem';
    }

    return card;
}

function ocultarPanelSlideoff(hide) {
    const card = document.getElementById(CARD_ID);
    const tab = document.getElementById(TAB_ID);
    if (!card) return;
    card.classList.toggle('moui-card-slideoff', !!hide);
    if (tab) {
        tab.style.display = hide && _activePedidoId != null ? '' : hide ? tab.style.display : 'none';
        tab.classList.toggle('visible', !!hide);
    }
    if (!hide) {
        card.style.display = 'flex';
        traerAlFrente(card);
        void refrescarMensajesFloat();
    }
}

function mostrarPanel(unhide) {
    const card = ensureDom();
    card.style.display = 'flex';
    if (unhide) card.classList.remove('moui-card-slideoff');
    const tab = document.getElementById(TAB_ID);
    if (tab) {
        tab.style.display = 'none';
        tab.classList.remove('visible');
    }
    traerAlFrente(card);
    asegurarPollMensajes();
    void refrescarMensajesFloat();
}

function cerrarPanel() {
    const card = document.getElementById(CARD_ID);
    const tab = document.getElementById(TAB_ID);
    _activePedidoId = null;
    if (card) {
        card.style.display = 'none';
        card.classList.remove('moui-card-slideoff');
    }
    if (tab) {
        tab.style.display = 'none';
        tab.classList.remove('visible');
    }
    detenerPollMensajes();
}

async function refrescarMensajesFloat() {
    const box = document.getElementById('gn-pedido-chat-float-msgs');
    const pid = _activePedidoId;
    if (!box || pid == null || typeof window.gnOperativaChatListar !== 'function') return;
    try {
        const rows = await window.gnOperativaChatListar(pid);
        if (!rows?.length) {
            box.innerHTML = '<p class="gn-pedido-chat-float-empty">Sin mensajes. Escribí para el equipo.</p>';
            return;
        }
        box.innerHTML = rows
            .map((m) => {
                const who = esc(m.autor_nombre || m.autor_rol || 'Usuario');
                const rol = m.autor_rol ? ` <span class="gn-pedido-chat-rol">(${esc(m.autor_rol)})</span>` : '';
                const when = m.created_at
                    ? new Date(m.created_at).toLocaleString('es-AR', { hour12: false })
                    : '';
                return `<div class="gn-pedido-chat-line"><div class="gn-pedido-chat-line-hd"><strong>${who}</strong>${rol}<span class="gn-pedido-chat-when">${esc(when)}</span></div><div class="gn-pedido-chat-body">${esc(m.cuerpo || '')}</div></div>`;
            })
            .join('');
        box.scrollTop = box.scrollHeight;
    } catch (e) {
        box.innerHTML = `<p class="gn-pedido-chat-float-err">${esc(e.message || 'Error al cargar')}</p>`;
    }
}

async function enviarDesdeFloat() {
    const pid = _activePedidoId;
    const inp = document.getElementById('gn-pedido-chat-float-input');
    const txt = String(inp?.value || '').trim();
    if (!pid || !txt || typeof window.gnOperativaChatEnviar !== 'function') return;
    const btn = document.getElementById('gn-pedido-chat-float-send');
    if (btn) btn.disabled = true;
    try {
        await window.gnOperativaChatEnviar(pid, txt);
        if (inp) inp.value = '';
        document.dispatchEvent(
            new CustomEvent('gn:pedido-chat-interno-enviado', { detail: { pedidoId: pid } })
        );
        await refrescarMensajesFloat();
    } catch (e) {
        try {
            window.toast?.(e.message || 'No se pudo enviar', 'error');
        } catch (_) {}
    } finally {
        if (btn) btn.disabled = false;
    }
}

function asegurarPollMensajes() {
    if (_msgPollTimer) return;
    _msgPollTimer = setInterval(() => {
        if (_activePedidoId != null && document.getElementById(CARD_ID)?.style.display !== 'none') {
            void refrescarMensajesFloat();
        }
    }, 4000);
}

function detenerPollMensajes() {
    if (_msgPollTimer) {
        clearInterval(_msgPollTimer);
        _msgPollTimer = null;
    }
}

function actualizarTitulo(pid) {
    const title = document.querySelector('.gn-pedido-chat-float-title');
    if (!title) return;
    const p = pedidoEnApp(pid);
    title.textContent = `Chat · ${numeroPedidoLabel(p, pid)}`;
}

/**
 * Abre el panel flotante de chat (Android).
 * @param {number|string} pedidoId
 * @param {{ soloSiOculto?: boolean }} [opts]
 */
export function abrirPedidoChatInternoFloatAndroid(pedidoId, opts = {}) {
    if (!esAndroidShell()) return;
    const pid = parseInt(pedidoId, 10);
    if (!Number.isFinite(pid) || pid < 1) return;
    const card = document.getElementById(CARD_ID);
    if (opts.soloSiOculto && card && card.style.display !== 'none' && !card.classList.contains('moui-card-slideoff')) {
        return;
    }
    _activePedidoId = pid;
    actualizarTitulo(pid);
    mostrarPanel(true);
    try {
        if (typeof window.resolverFocoPedidoNotificacion === 'function') {
            void window.resolverFocoPedidoNotificacion(String(pid), { silent: true });
        }
    } catch (_) {}
}

export function installGnPedidoChatInternoAndroid() {
    if (_installed || !esAndroidShell()) return;
    _installed = true;

    window.gnAbrirPedidoChatInternoFloat = abrirPedidoChatInternoFloatAndroid;

    document.addEventListener('gn:pedido-chat-interno-enviado', (ev) => {
        const pid = ev.detail?.pedidoId;
        if (pid != null) abrirPedidoChatInternoFloatAndroid(pid, { soloSiOculto: true });
    });

    const origEnviar = window.gnOperativaChatEnviar;
    if (typeof origEnviar === 'function' && !origEnviar.__gnChatFloatWrapped) {
        const wrapped = async function (pedidoId, cuerpo) {
            const r = await origEnviar.call(this, pedidoId, cuerpo);
            document.dispatchEvent(
                new CustomEvent('gn:pedido-chat-interno-enviado', { detail: { pedidoId } })
            );
            return r;
        };
        wrapped.__gnChatFloatWrapped = true;
        window.gnOperativaChatEnviar = wrapped;
    }

}

function initMouiDragWhenReady() {
    if (typeof window.initMouiCardDraggable === 'function') {
        try {
            window.initMouiCardDraggable(CARD_ID);
        } catch (_) {}
    }
}

/** Llamado desde poll de notificaciones móvil (app.js). */
export function onNotificacionMovilChatInterno(pedidoId, titulo) {
    if (!esAndroidShell()) return;
    if (!/Mensaje en reclamo/i.test(String(titulo || ''))) return;
    const pid = parseInt(pedidoId, 10);
    if (!Number.isFinite(pid) || pid < 1) return;
    abrirPedidoChatInternoFloatAndroid(pid);
}
