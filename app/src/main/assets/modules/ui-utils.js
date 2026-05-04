/**
 * UI genérica (toast, errores legibles, escape HTML) sin estado de sesión.
 * made by leavera77
 */

import { gnDice } from './utils.js';

export function escHtmlPrint(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Registro en consola con contexto (diagnóstico sin mostrar stack al usuario). */
export function logErrorWeb(tag, err, extra) {
    const msg = err != null && err !== '' ? err.message || String(err) : String(err);
    const det = extra != null ? extra : '';
    if (err && err.stack) console.error(`[GestorNova:${tag}]`, msg, det, err.stack);
    else console.error(`[GestorNova:${tag}]`, msg, det);
}

/**
 * Convierte errores de red, Neon, HTTP o SQL en texto entendible para el operador.
 * No incluye stacks ni detalles técnicos largos.
 */
export function mensajeErrorUsuario(err) {
    if (err == null) return 'Ocurrió un error. Probá de nuevo.';
    const raw = String(err.message != null ? err.message : err).trim() || 'Error desconocido';
    const m = raw.toLowerCase();
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') || m.includes('network request failed')) {
        return 'No hay conexión o el servidor no respondió. Comprobá internet y probá de nuevo.';
    }
    if (m.includes('aborted') || m.includes('abort') || m.includes('timeout')) {
        return 'La operación tardó demasiado. Intentá de nuevo.';
    }
    if (m.includes('neon no inicializado') || (m.includes('sin conexión') && m.includes('offline'))) {
        return 'Sin conexión a la base de datos. Revisá la red o la configuración.';
    }
    if (m.includes('401') || m.includes('unauthorized')) return 'Sesión vencida o sin permiso. Volvé a iniciar sesión.';
    if (m.includes('403') || m.includes('forbidden')) return 'No tenés permiso para esta acción.';
    if (m.includes('502') || m.includes('503') || m.includes('504') || m.includes('bad gateway')) {
        return 'El servidor está sobrecargado o en mantenimiento. Probá en unos minutos.';
    }
    if (m.includes('500') && m.includes('internal')) return 'Error en el servidor. Si persiste, avisá al administrador.';
    if (m.includes('permission denied') || m.includes('must be owner')) {
        return 'No se pudo acceder a ese dato con tu usuario.';
    }
    if (m.includes('unique') || m.includes('duplicate key')) {
        return 'Ese dato ya existe (no se puede duplicar).';
    }
    if (m.includes('violates foreign key') || m.includes('foreign key')) {
        return 'No se puede borrar o modificar: está vinculado a otros registros.';
    }
    if (raw.length <= 100 && !/^at\s/i.test(raw) && !m.startsWith('error:') && /[áéíóúñüa-z]/i.test(raw)) {
        return raw;
    }
    return 'Algo salió mal. Si se repite, anotá la hora y contactá al administrador.';
}

/**
 * Muestra toast de error amigable y deja traza en consola con etiqueta de contexto.
 * @param {string} tag - identificador corto (ej. "guardar-pedido")
 * @param {*} err - Error o valor lanzado
 * @param {string} [prefijo] - texto opcional antes del mensaje amigable (ej. "No se pudo guardar.")
 */
export function toastError(tag, err, prefijo) {
    logErrorWeb(tag, err);
    const cuerpo = mensajeErrorUsuario(err);
    let msg = prefijo ? `${String(prefijo).trim()} ${cuerpo}` : cuerpo;
    msg = msg.replace(/\s+/g, ' ').trim();
    if (msg.length > 300) msg = msg.slice(0, 297) + '…';
    toast(msg, 'error');
}

export function toast(msg, tipo = 'info', durationMs) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
    }
    let s = gnDice(String(msg ?? ''));
    const isRich = s.includes('<div') || s.includes('<p');
    const maxLen = tipo === 'error' ? (isRich ? 12000 : 600) : 2200;
    if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';

    if (s.includes('<div') || s.includes('<p')) {
        el.innerHTML = s;
    } else {
        el.textContent = s;
    }

    el.className = 'show ' + tipo + (s.length > 100 ? ' toast-multiline' : '');
    try {
        el.style.whiteSpace = s.length > 100 ? 'normal' : 'nowrap';
        el.style.maxWidth = s.length > 100 ? 'min(92vw, 32rem)' : '';
    } catch (_) {}
    if (tipo === 'error') el.setAttribute('role', 'alert');
    else el.removeAttribute('role');
    const dur =
        durationMs != null && Number.isFinite(Number(durationMs)) && Number(durationMs) > 0
            ? Number(durationMs)
            : 5200;
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        el.className = tipo;
        try {
            el.style.whiteSpace = '';
            el.style.maxWidth = '';
        } catch (_) {}
        if (tipo === 'error') el.removeAttribute('role');
    }, dur);
}

if (typeof window !== 'undefined') {
    window.toast = toast;
}
