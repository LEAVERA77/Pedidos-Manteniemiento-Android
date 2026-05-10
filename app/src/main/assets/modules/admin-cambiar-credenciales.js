/**
 * Panel admin → Cuenta y contraseña: usuario de login (columna email), nombre y contraseña.
 * Cambios de usuario/contraseña vía PUT /api/auth/cambiar-credenciales (Neon + JWT nuevo).
 */

import { generarPasswordFacilDictado } from './password-facil-sugerido.js';

/** @type {Record<string, unknown> | null} */
let _ctx = null;

function getCtx() {
    return _ctx;
}

export function initAdminCambiarCredenciales(c) {
    _ctx = c;
    window.cambiarContrasena = cambiarContrasena;
    window.sincronizarFormularioAdminContrasenaDesdeSesion = sincronizarFormularioAdminContrasenaDesdeSesion;
    window.rellenarContrasenaFacilAdminPanel = rellenarContrasenaFacilAdminPanel;
}

/** Rellena «Nueva» y «Confirmar» con la misma sugerencia (la actual la escribe el usuario a mano). */
export function rellenarContrasenaFacilAdminPanel() {
    const p = generarPasswordFacilDictado();
    const n = document.getElementById('pw-nueva');
    const c = document.getElementById('pw-confirmar');
    if (n) n.value = p;
    if (c) c.value = p;
    const msg = document.getElementById('pw-msg');
    if (msg) {
        msg.style.color = 'var(--tm)';
        msg.textContent =
            'Sugerencia en «Nueva» y «Confirmar». En «Contraseña actual» escribí la clave con la que entrás al sistema (no pegues códigos $2a$… de la base).';
    }
}

export function sincronizarFormularioAdminContrasenaDesdeSesion() {
    const c = getCtx();
    const app = c?.getApp?.();
    if (!app?.u) return;
    const em = document.getElementById('pw-email-nuevo');
    const nm = document.getElementById('pw-nombre-nuevo');
    if (em) em.value = String(app.u.email || '').trim();
    if (nm) nm.value = String(app.u.nombre || '').trim();
}

function _esUsuarioLoginValido(s) {
    const t = String(s || '').trim();
    if (t.length < 1 || t.length > 254) return false;
    if (/\s/.test(t)) return false;
    return true;
}

export async function cambiarContrasena() {
    const c = getCtx();
    if (!c) return;
    const app = c.getApp();
    const actual = (document.getElementById('pw-actual')?.value || '').trim();
    const nueva = (document.getElementById('pw-nueva')?.value || '').trim();
    const confirmar = (document.getElementById('pw-confirmar')?.value || '').trim();
    const usuarioNuevo = (document.getElementById('pw-email-nuevo')?.value || '').trim();
    const nombreNuevo = (document.getElementById('pw-nombre-nuevo')?.value || '').trim();
    const msg = document.getElementById('pw-msg');
    if (!msg) return;

    const setErr = (t) => {
        msg.style.color = 'var(--re)';
        msg.textContent = t;
    };
    const setOk = (t) => {
        msg.style.color = '#166534';
        msg.textContent = t;
    };

    const usuarioActual = String(app?.u?.email || '').trim();
    const nombreActual = String(app?.u?.nombre || '').trim();
    const cambiaPw = !!(nueva || confirmar);
    const cambiaUsuario = usuarioNuevo.toLowerCase() !== usuarioActual.toLowerCase();
    const cambiaNombre = nombreNuevo !== nombreActual;

    if (!actual) {
        setErr('Ingresá la contraseña actual');
        return;
    }
    if (/^\$2[aby]\$/i.test(actual)) {
        setErr(
            'En «Contraseña actual» va la clave con la que iniciás sesión (texto plano), no el hash de la base ($2a$…). Si la dejaron por defecto, probá admin.'
        );
        return;
    }
    if (cambiaPw) {
        if (!nueva || !confirmar) {
            setErr('Completá nueva contraseña y confirmación, o dejá ambas vacías si solo cambiás usuario o nombre');
            return;
        }
        if (nueva !== confirmar) {
            setErr('Las contraseñas nuevas no coinciden');
            return;
        }
        if (nueva.length < 4) {
            setErr('La contraseña debe tener al menos 4 caracteres');
            return;
        }
    }
    if (!cambiaPw && !cambiaUsuario && !cambiaNombre) {
        setErr('No hay cambios: indicá usuario, nombre o contraseña nueva');
        return;
    }
    if (cambiaUsuario && !_esUsuarioLoginValido(usuarioNuevo)) {
        setErr('Usuario inválido (sin espacios, hasta 254 caracteres)');
        return;
    }
    const modoOffline = !!c.getModoOffline?.();
    const tok = typeof c.getApiToken === 'function' ? c.getApiToken() : '';
    if (modoOffline || !tok || typeof c.apiUrl !== 'function') {
        if (cambiaUsuario || cambiaNombre) {
            setErr('Cambiar usuario o nombre requiere sesión con el servidor (token API).');
            return;
        }
    }

    if (tok && typeof c.apiUrl === 'function' && !modoOffline) {
        try {
            if (cambiaUsuario || cambiaPw) {
                const body = {
                    usuario_actual: usuarioActual,
                    nuevo_usuario: cambiaUsuario ? usuarioNuevo : usuarioActual,
                    password_actual: actual,
                    nombre: nombreNuevo,
                };
                if (cambiaPw) body.nueva_password = nueva;
                const resp = await fetch(c.apiUrl('/api/auth/cambiar-credenciales'), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                    body: JSON.stringify(body),
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                    setErr(data.error || data.detail || 'No se pudo actualizar');
                    return;
                }
                if (data.token) {
                    try {
                        app.apiToken = String(data.token);
                        localStorage.setItem('pmg_api_token', app.apiToken);
                    } catch (_) {}
                }
                if (data.user) {
                    app.u.nombre = data.user.nombre ?? app.u.nombre;
                    app.u.email = data.user.email ?? app.u.email;
                    try {
                        localStorage.setItem('pmg', JSON.stringify(app.u));
                    } catch (_) {}
                }
                try {
                    c.actualizarBarraHeaderSesion?.();
                } catch (_) {}
                setOk('✓ Credenciales actualizadas');
                try {
                    c.toast?.('Credenciales actualizadas. Iniciá sesión nuevamente con el usuario indicado.', 'success');
                } catch (_) {}
                ['pw-actual', 'pw-nueva', 'pw-confirmar'].forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                sincronizarFormularioAdminContrasenaDesdeSesion();
                setTimeout(() => {
                    try {
                        c.ejecutarCerrarSesion?.();
                    } catch (_) {}
                }, 600);
                return;
            }

            const body = {
                password_actual: actual,
                usuario: usuarioActual,
                nombre: nombreNuevo,
            };
            const resp = await fetch(c.apiUrl('/api/auth/me'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                body: JSON.stringify(body),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                setErr(data.error || data.detail || 'No se pudo actualizar');
                return;
            }
            if (data.user) {
                app.u.nombre = data.user.nombre || app.u.nombre;
                app.u.email = data.user.email || app.u.email;
                try {
                    localStorage.setItem('pmg', JSON.stringify(app.u));
                } catch (_) {}
                try {
                    c.actualizarBarraHeaderSesion?.();
                } catch (_) {}
            }
            setOk('✓ Datos actualizados correctamente');
            ['pw-actual', 'pw-nueva', 'pw-confirmar'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            sincronizarFormularioAdminContrasenaDesdeSesion();
        } catch (e) {
            try {
                c.logErrorWeb?.('cambiar-contrasena-api', e);
            } catch (_) {}
            setErr(c.mensajeErrorUsuario?.(e) || String(e?.message || e));
        }
        return;
    }

    if (cambiaUsuario || cambiaNombre) {
        setErr('Sin token de API no se puede cambiar usuario o nombre desde aquí.');
        return;
    }

    try {
        const wf = await c.sqlFiltroUsuariosPorTenant();
        const r = await c.sqlSimple(
            `SELECT id FROM usuarios WHERE id = ${c.esc(app.u.id)} AND password_hash = ${c.esc(actual)}` + wf
        );
        if (!r.rows.length) {
            setErr('La contraseña actual es incorrecta');
            return;
        }
        await c.sqlSimple(`UPDATE usuarios SET password_hash = ${c.esc(nueva)} WHERE id = ${c.esc(app.u.id)}` + wf);
        setOk('✓ Contraseña actualizada correctamente');
        ['pw-actual', 'pw-nueva', 'pw-confirmar'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    } catch (e) {
        try {
            c.logErrorWeb?.('cambiar-contrasena', e);
        } catch (_) {}
        setErr(c.mensajeErrorUsuario?.(e) || String(e?.message || e));
    }
}
