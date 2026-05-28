/**
 * Notificación chat interno pedido: toast clicable (admin) → modal detalle + chat.
 * Técnico Android: panel flotante (gn-pedido-chat-interno-android.js).
 * made by leavera77
 */

import { abrirPedidoChatInternoFloatAndroid } from './gn-pedido-chat-interno-android.js';
import {
    detalleModalAbiertoParaPedido,
    enfocarSeccionChatInternoDetalle,
    refrescarChatInternoEnDetalleAbierto,
} from './pedido-operativa-top3-ui.js';

const HOST_ID = 'gn-pedido-chat-toast-host';

export function esNotificacionChatInternoPedido(titulo) {
    return /Mensaje en reclamo/i.test(String(titulo || ''));
}

function esAdminSesion() {
    try {
        return typeof window.esAdmin === 'function' && window.esAdmin();
    } catch (_) {
        return false;
    }
}

function esAndroidShell() {
    try {
        return document.documentElement.classList.contains('gn-android-shell');
    } catch (_) {
        return false;
    }
}

function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function ensureToastHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
}

function quitarToastsChatHost() {
    try {
        document.getElementById(HOST_ID)?.querySelectorAll('.gn-pedido-chat-interno-toast').forEach((el) => el.remove());
    } catch (_) {}
}

/**
 * Toast clicable (misma idea que chat WhatsApp humano).
 */
export function mostrarToastChatInternoAdmin(pedidoId, titulo, cuerpo) {
    const host = ensureToastHost();
    quitarToastsChatHost();
    const pid = String(pedidoId || '').trim();
    const el = document.createElement('div');
    el.className = 'gn-pedido-chat-interno-toast wa-human-chat-toast';
    el.innerHTML = `<strong><i class="fas fa-comments"></i> ${esc(titulo || 'Chat del reclamo')}</strong><br>${esc(cuerpo || 'Nuevo mensaje')}<br><span style="font-size:.76rem;opacity:.9">Tocá para abrir el pedido y responder</span>`;
    el.onclick = () => {
        try {
            el.remove();
        } catch (_) {}
        void abrirDetallePedidoConChatInterno(pid);
    };
    host.appendChild(el);
    setTimeout(() => {
        try {
            if (el.parentElement) el.remove();
        } catch (_) {}
    }, 55000);
}

/**
 * Abre #dm del pedido y despliega la sección de chat interno.
 */
export async function abrirDetallePedidoConChatInterno(pedidoId) {
    const pid = String(pedidoId || '').trim();
    if (!pid) return;
    try {
        if (typeof window.resolverFocoPedidoNotificacion === 'function') {
            await window.resolverFocoPedidoNotificacion(pid, { silent: true });
        } else if (typeof window.detalle === 'function') {
            const p = window.app?.p?.find((x) => String(x.id) === pid);
            if (p) await window.detalle(p);
        }
    } catch (_) {}
    requestAnimationFrame(() => {
        setTimeout(() => enfocarSeccionChatInternoDetalle(pid), 120);
        setTimeout(() => enfocarSeccionChatInternoDetalle(pid), 450);
    });
}

/**
 * Entrada única desde poll de notificaciones (app.js).
 */
export function manejarNotificacionChatInternoPedido(pedidoId, titulo, cuerpo) {
    if (!esNotificacionChatInternoPedido(titulo)) return;
    const pid = String(pedidoId || '').trim();
    if (!pid) return;

    if (esAdminSesion()) {
        if (detalleModalAbiertoParaPedido(pid)) {
            refrescarChatInternoEnDetalleAbierto(pid);
            return;
        }
        mostrarToastChatInternoAdmin(pid, titulo, cuerpo);
        return;
    }

    if (esAndroidShell()) {
        abrirPedidoChatInternoFloatAndroid(pid);
    }
}

export function installPedidoChatInternoNotifUi() {
    ensureToastHost();
}
