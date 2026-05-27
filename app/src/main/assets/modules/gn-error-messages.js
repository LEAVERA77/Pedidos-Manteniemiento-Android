/**
 * Alias amigables de errores + alert() → toast cuando conviene (sin duplicar ui-utils).
 * made by leavera77
 */

import { toast, toastError, mensajeErrorUsuario } from './ui-utils.js';

export function mostrarError(mensajeOError, tag) {
  if (mensajeOError instanceof Error || (mensajeOError && typeof mensajeOError === 'object' && mensajeOError.message)) {
    toastError(tag || 'ui', mensajeOError);
    return;
  }
  const msg = String(mensajeOError ?? '').trim() || mensajeErrorUsuario(null);
  toast(msg, 'error');
}

export function mostrarExito(mensaje, duracionMs) {
  toast(String(mensaje ?? ''), 'success', duracionMs);
}

export function mostrarAdvertencia(mensaje, duracionMs) {
  toast(String(mensaje ?? ''), 'warning', duracionMs);
}

function mejorarAlertNativo() {
  if (typeof window === 'undefined' || window.__gnAlertToastWrapped) return;
  const prev = typeof window.alert === 'function' ? window.alert.bind(window) : null;
  if (!prev) return;

  window.alert = function gnAlertConToast(msg) {
    const s = String(msg ?? '').trim();
    if (!s) return;
    if (typeof window.toast === 'function') {
      const tipo = /error|falló|fallo|no se pudo/i.test(s) ? 'error' : 'info';
      const dur = s.length > 240 ? 10000 : 6500;
      window.toast(s, tipo, dur);
      return;
    }
    prev(s);
  };
  window.__gnAlertToastWrapped = true;
}

function initGnErrorMessages() {
  if (typeof window !== 'undefined') {
    window.mostrarError = mostrarError;
    window.mostrarExito = mostrarExito;
    window.mostrarAdvertencia = mostrarAdvertencia;
    window.mensajeErrorUsuario = mensajeErrorUsuario;
  }
  mejorarAlertNativo();
}

initGnErrorMessages();
