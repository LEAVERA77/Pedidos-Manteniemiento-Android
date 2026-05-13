/**
 * Admin: clave provisoria para técnico/supervisor — vía API (bcrypt), misma política que Contraseña / alta usuario.
 * El admin puede elegir la clave (nueva + confirmación) o dejar vacío para generar una aleatoria.
 * made by leavera77
 */

import { validarParPasswordNuevoConfirmacionGestornova } from './password-policy-gestornova.js';

/**
 * @param {{
 *   esAdmin: () => boolean;
 *   getModoOffline: () => boolean;
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: () => string;
 *   asegurarJwtApiRest?: () => Promise<unknown>;
 *   toast: (msg: string, tipo?: string) => void;
 *   toastError?: (tag: string, err: unknown) => void;
 *   cargarListaUsuarios?: () => Promise<void> | void;
 *   refrescarUsuariosCacheDesdeNeon?: () => Promise<void>;
 * }} d
 */
export function initAdminClaveProvisoria(d) {
    window.adminGenerarClaveProvisionalUsuario = async (userId) => {
        if (!d.esAdmin() || d.getModoOffline()) {
            d.toast('Sin permisos o sin conexión.', 'error');
            return;
        }
        const id = Number(userId);
        if (!Number.isFinite(id) || id <= 0) return;
        try {
            await d.asegurarJwtApiRest?.();
        } catch (_) {}
        const tok = d.getApiToken?.();
        const baseRaw = d.apiUrl?.() || '';
        const apiBase = String(baseRaw).replace(/\/+$/, '');
        if (!tok || !apiBase) {
            d.toast('Generar clave provisoria requiere sesión con el servidor (API) y URL configurada.', 'error');
            return;
        }

        const p1 = window.prompt(
            'Clave provisoria — ingresá la contraseña que usará el técnico (mín. 4 caracteres). Dejá vacío y Aceptar para generar una aleatoria.\n\nEl técnico deberá cambiarla al ingresar (web o Android).',
            ''
        );
        if (p1 === null) {
            d.toast('Operación cancelada.', 'info');
            return;
        }
        const t1 = String(p1).trim();
        let bodyObj = {};
        if (t1 !== '') {
            const p2 = window.prompt('Repetí la misma contraseña:', '');
            if (p2 === null) {
                d.toast('Operación cancelada.', 'info');
                return;
            }
            const v = validarParPasswordNuevoConfirmacionGestornova(t1, p2);
            if (!v.ok) {
                d.toast(v.error, 'error');
                return;
            }
            bodyObj = { password: v.skipped ? t1 : v.nueva };
        }

        try {
            const r = await fetch(`${apiBase}/api/usuarios/${id}/clave-provisoria`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyObj),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
                d.toast(String(j.error || j.detail || `Error ${r.status}`), 'error');
                return;
            }
            const nom = j.nombre || j.email || 'usuario';
            if (j.provisional_password) {
                window.prompt(
                    `Clave provisoria generada para ${nom} — copiá y entregála al técnico (deberá cambiarla al ingresar):`,
                    j.provisional_password
                );
                d.toast('Clave provisoria generada. Entregála al técnico.', 'success');
            } else {
                d.toast(`Clave provisoria guardada para ${nom}. Ya podés comunicársela al técnico.`, 'success');
            }
            await d.cargarListaUsuarios?.();
            try {
                await d.refrescarUsuariosCacheDesdeNeon?.();
            } catch (_) {}
        } catch (e) {
            try {
                d.toastError?.('clave-provisoria-api', e);
            } catch (_) {
                d.toast(String(e && e.message ? e.message : e), 'error');
            }
        }
    };
}
