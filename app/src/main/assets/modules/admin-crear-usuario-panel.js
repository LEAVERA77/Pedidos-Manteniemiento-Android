/**
 * Alta de usuario desde el panel admin: solo vía API (bcrypt), misma política que Cuenta → Contraseña.
 * Incluye business_type para técnicos/supervisores (CHECK chk_usuarios_business_type_role en Neon).
 * made by leavera77
 */
import { normalizarTelefonoWhatsapp, esTelefonoWhatsappValido } from './normalizar-telefono.js';
import { validarParPasswordNuevoConfirmacionGestornova } from './password-policy-gestornova.js';

/**
 * @param {{
 *   toast: (msg: string, tipo?: string) => void;
 *   toastError: (tag: string, err: unknown, prefijo?: string) => void;
 *   tenantIdActual: () => number;
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: () => string;
 *   asegurarJwtApiRest?: () => Promise<boolean>;
 *   cargarListaUsuarios: () => Promise<void> | void;
 *   refrescarUsuariosCacheDesdeNeon: () => Promise<void>;
 * }} d
 */
export async function ejecutarCrearUsuarioAdminPanel(d) {
    const usuarioLogin = document.getElementById('nu-email')?.value?.trim() || '';
    const nombre = document.getElementById('nu-nombre')?.value?.trim() || '';
    const pw = document.getElementById('nu-pw')?.value || '';
    const pw2 = document.getElementById('nu-pw-confirm')?.value || '';
    const rol = document.getElementById('nu-rol')?.value || '';
    const telefono = normalizarTelefonoWhatsapp(document.getElementById('nu-telefono')?.value || '');
    if (!usuarioLogin || !nombre || !String(pw).trim()) {
        d.toast('Completá todos los campos', 'error');
        return;
    }
    const vPw = validarParPasswordNuevoConfirmacionGestornova(pw, pw2);
    if (!vPw.ok) {
        d.toast(vPw.error, 'error');
        return;
    }
    const pwTrim = vPw.skipped ? String(pw).trim() : vPw.nueva;
    if (telefono && !esTelefonoWhatsappValido(telefono)) {
        d.toast('Teléfono inválido. Usá formato +543434123456', 'error');
        return;
    }

    try {
        await d.asegurarJwtApiRest?.();
    } catch (_) {}
    const tok = d.getApiToken?.();
    const baseRaw = d.apiUrl?.() || '';
    const apiBase = String(baseRaw).replace(/\/+$/, '');
    if (tok && apiBase) {
        try {
            const tidPanel = Number(d.tenantIdActual?.());
            const body = {
                usuario: usuarioLogin,
                nombre,
                password: pwTrim,
                rol,
                telefono: telefono || undefined,
            };
            if (Number.isFinite(tidPanel) && tidPanel > 0) body.tenant_id = tidPanel;
            d.toast('Creando usuario…', 'info', 2800);
            const ac = new AbortController();
            const tmo = setTimeout(() => {
                try {
                    ac.abort();
                } catch (_) {}
            }, 45000);
            let r;
            try {
                r = await fetch(`${apiBase}/api/usuarios`, {
                    method: 'POST',
                    signal: ac.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${tok}`,
                    },
                    body: JSON.stringify(body),
                });
            } finally {
                clearTimeout(tmo);
            }
            const rawText = await r.text().catch(() => '');
            let j = {};
            try {
                j = rawText ? JSON.parse(rawText) : {};
            } catch (_) {
                j = { error: rawText ? rawText.slice(0, 280) : `HTTP ${r.status}` };
            }
            if (!r.ok) {
                const piece = (v) => {
                    if (v == null) return '';
                    if (typeof v === 'string') return v;
                    try {
                        return JSON.stringify(v).slice(0, 400);
                    } catch (_) {
                        return String(v);
                    }
                };
                const msg = piece(j.detail) || piece(j.error) || piece(j.message) || rawText.slice(0, 280) || `Error ${r.status}`;
                const low = String(msg).toLowerCase();
                if (r.status === 409 || low.includes('unique') || low.includes('duplicate')) {
                    d.toast(
                        'Ese nombre de usuario ya está registrado en este tenant (o la base aún tiene unicidad global: ejecutá docs/NEON_usuarios_email_unique_per_tenant.sql en Neon).',
                        'error'
                    );
                    return;
                }
                if (r.status === 401 || r.status === 403) {
                    d.toast('Sesión API: revisá permisos o volvé a iniciar sesión.', 'error');
                    return;
                }
                if (r.status === 400) {
                    d.toast(String(msg).trim() || 'Datos inválidos para crear el usuario.', 'error');
                    return;
                }
                d.toastError('crear-usuario-api', new Error(String(msg).trim() || `HTTP ${r.status}`));
                return;
            }
            d.toast('Usuario creado: ' + nombre, 'success');
            document.getElementById('form-usuario').style.display = 'none';
            ['nu-email', 'nu-nombre', 'nu-pw', 'nu-pw-confirm', 'nu-telefono'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await d.cargarListaUsuarios();
            try {
                await d.refrescarUsuariosCacheDesdeNeon();
            } catch (_) {}
        } catch (e) {
            const m = String(e && e.name === 'AbortError' ? 'timeout' : e && e.message ? e.message : e).toLowerCase();
            if (m.includes('abort') || m.includes('timeout')) {
                d.toast('La creación tardó demasiado o se canceló. Comprobá la API y volvé a intentar.', 'error');
            } else {
                d.toastError('crear-usuario-api', e);
            }
        }
        return;
    }

    d.toast(
        'Para crear usuarios con la misma seguridad que en Cuenta → Contraseña (contraseña cifrada), necesitás sesión API activa y la URL del servidor configurada. Volvé a iniciar sesión o revisá API_BASE_URL.',
        'error'
    );
}
