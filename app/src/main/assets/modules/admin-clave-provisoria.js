/**
 * Admin: clave provisoria para técnico/supervisor — siempre vía API (bcrypt), misma BD que el login JWT.
 * made by leavera77
 */

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
        try {
            const r = await fetch(`${apiBase}/api/usuarios/${id}/clave-provisoria`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: '{}',
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
                d.toast(String(j.error || j.detail || `Error ${r.status}`), 'error');
                return;
            }
            const pwd = j.provisional_password;
            const nom = j.nombre || j.email || 'usuario';
            window.prompt(
                `Clave provisoria para ${nom} — copiá y entregála al técnico (en Android deberá cambiarla al ingresar):`,
                pwd
            );
            d.toast('Clave provisional generada.', 'success');
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
