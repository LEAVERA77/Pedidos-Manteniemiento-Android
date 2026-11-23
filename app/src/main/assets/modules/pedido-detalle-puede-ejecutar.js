/**
 * «Poner en ejecución» / Ejecutar: solo admin o técnico asignado (no por ser creador del pedido).
 * made by leavera77
 */

function parseIdUsuario(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v | 0;
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function parseJwtPayloadLoose(tok) {
    try {
        const parts = String(tok || '').split('.');
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
        return JSON.parse(atob(b64 + pad));
    } catch (_) {
        return null;
    }
}

/** Id de sesión (JWT primero; evita desfase de app.u en WebView Android). */
export function usuarioIdSesionOperadorPedidos() {
    try {
        const getTok =
            typeof window.getApiToken === 'function'
                ? window.getApiToken
                : typeof window.__gnGetApiToken === 'function'
                  ? window.__gnGetApiToken
                  : null;
        const pl = getTok ? parseJwtPayloadLoose(getTok()) : null;
        if (pl) {
            for (const c of [pl.userId, pl.sub, pl.id, pl.usuario_id, pl.usuarioId, pl.uid]) {
                const n = parseIdUsuario(c);
                if (n != null) return n;
            }
        }
    } catch (_) {}
    try {
        const n = parseIdUsuario(window.app?.u?.id);
        if (n != null) return n;
    } catch (_) {}
    return null;
}

/** @param {object} p */
export function tecnicoAsignadoIdDesdePedido(p) {
    if (!p || typeof p !== 'object') return null;
    const raw = p.tai ?? p.tecnico_asignado_id ?? p.tecnicoAsignadoId ?? p.Tecnico_asignado_id;
    return parseIdUsuario(raw);
}

/**
 * @param {object} p
 * @param {{ esAdmin?: () => boolean, esTecnicoOSupervisor?: () => boolean }} [ctx]
 */
export function puedePonerPedidoEnEjecucionEnDetalle(p, ctx = {}) {
    if (!p) return false;
    const es = String(p.es || '').trim();
    if (es !== 'Pendiente' && es !== 'Asignado') return false;
    if (typeof ctx.esAdmin === 'function' && ctx.esAdmin()) return true;
    if (typeof ctx.esTecnicoOSupervisor === 'function' && !ctx.esTecnicoOSupervisor()) return false;
    const uid = usuarioIdSesionOperadorPedidos();
    const tid = tecnicoAsignadoIdDesdePedido(p);
    if (uid == null || tid == null) return false;
    return tid === uid;
}

/**
 * @param {object} p
 * @param {{ esAdmin?: () => boolean, esTecnicoOSupervisor?: () => boolean }} [ctx]
 * @returns {{ ok: boolean, message?: string }}
 */
/** Restricción operativa de Android; no constituye una frontera de seguridad del servidor. */
export function androidRequiereEjecucionParaCerrar(ctx = {}) {
    try {
        const android = typeof ctx.esAndroid === 'function' ? ctx.esAndroid() :
            (typeof window !== 'undefined' && !!window.AndroidConfig) ||
            (typeof navigator !== 'undefined' && /(?:GestorNova|Nexxo)\//i.test(navigator.userAgent || ''));
        return !!android && !(typeof ctx.esAdmin === 'function' && ctx.esAdmin()) &&
            typeof ctx.esTecnicoOSupervisor === 'function' && ctx.esTecnicoOSupervisor();
    } catch (_) { return false; }
}

/** Cerrar / avance: admin o técnico asignado (no por ser creador del pedido). */
export function puedeCerrarPedidoEnDetalle(p, ctx = {}) {
    if (!p) return false;
    const es = String(p.es || '').trim();
    if (es === 'Cerrado' || es === 'Derivado externo' || es === 'Desestimado') return false;
    if (typeof ctx.esAdmin === 'function' && ctx.esAdmin()) return true;
    if (!ctx.esAvance && androidRequiereEjecucionParaCerrar(ctx) && es !== 'En ejecución') return false;
    if (typeof ctx.esTecnicoOSupervisor === 'function' && !ctx.esTecnicoOSupervisor()) return false;
    const uid = usuarioIdSesionOperadorPedidos();
    const tid = tecnicoAsignadoIdDesdePedido(p);
    if (uid == null || tid == null) return false;
    return tid === uid;
}

/**
 * @param {object} p
 * @param {{ esAdmin?: () => boolean, esTecnicoOSupervisor?: () => boolean }} [ctx]
 * @returns {{ ok: boolean, message?: string }}
 */
export function validarPuedeCerrarPedido(p, ctx = {}) {
    if (!ctx.esAvance && androidRequiereEjecucionParaCerrar(ctx) && String(p?.es || '').trim() !== 'En ejecución') {
        return { ok: false, message: 'Para cerrar el pedido primero debe estar En ejecución.' };
    }
    if (puedeCerrarPedidoEnDetalle(p, ctx)) return { ok: true };
    if (typeof ctx.esAdmin === 'function' && ctx.esAdmin()) return { ok: true };
    const tid = tecnicoAsignadoIdDesdePedido(p);
    if (tid == null) {
        return {
            ok: false,
            message:
                'Este reclamo no está asignado a tu usuario. Solo podés cerrar pedidos asignados a vos.',
        };
    }
    return {
        ok: false,
        message: 'Este reclamo está asignado a otro técnico. Solo podés cerrar pedidos asignados a vos.',
    };
}

/** Avance conserva los permisos anteriores; la condición nueva solo afecta al cierre. */
export function validarPuedeRegistrarAvance(p, ctx = {}) {
    return validarPuedeCerrarPedido(p, { ...ctx, esAvance: true });
}

export function validarPuedePonerPedidoEnEjecucion(p, ctx = {}) {
    if (puedePonerPedidoEnEjecucionEnDetalle(p, ctx)) return { ok: true };
    const es = String(p?.es || '').trim();
    if (es !== 'Pendiente' && es !== 'Asignado') return { ok: false, message: 'El pedido no admite iniciar ejecución.' };
    if (typeof ctx.esAdmin === 'function' && ctx.esAdmin()) return { ok: true };
    const tid = tecnicoAsignadoIdDesdePedido(p);
    if (tid == null) {
        return {
            ok: false,
            message: 'Este reclamo no está asignado a tu usuario. Solo podés ejecutar pedidos asignados a vos.',
        };
    }
    return {
        ok: false,
        message: 'Este reclamo está asignado a otro técnico. Solo podés ejecutar pedidos asignados a vos.',
    };
}
