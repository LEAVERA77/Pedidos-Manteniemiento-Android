/**
 * Modal «Recuperar acceso (admin)»: EmailJS + Neon (reset_token).
 * Clave nueva: permite contraseñas cortas y simples (mín. 3).
 * made by leavera77
 */

import { esc } from './utils.js';

/** @type {{ sqlSimple: Function, sqlFiltroUsuariosPorTenant: Function, leerEmailContactoEmpresaNeon: Function, esEmailValidoSimple: Function } | null} */
let _deps = null;

let _resetPaso = 1;
let _resetTokenActual = null;
let _resetUsuarioAdmin = false;
let _resetTargetUserId = null;

function _normalizarCodigoResetPw(raw) {
    const t = String(raw || '').trim();
    const digits = t.replace(/\D/g, '');
    if (digits.length === 6) return digits;
    return t.replace(/\s+/g, '');
}

function _errMsg(e) {
    if (!e) return 'Error desconocido';
    if (typeof e === 'string') return e;
    if (e.message) return e.message;
    if (e.error) return typeof e.error === 'string' ? e.error : JSON.stringify(e.error);
    try {
        return JSON.stringify(e);
    } catch (_) {
        return String(e);
    }
}

/** @returns {{ ok: true, password: string } | { ok: false, msg: string }} */
export function validarNuevaClaveRecuperacionMail(raw) {
    const t = String(raw ?? '').trim();
    if (!t) return { ok: false, msg: 'Completá la nueva contraseña' };
    if (t.length < 3) {
        return { ok: false, msg: 'La nueva contraseña debe tener al menos 3 caracteres (puede ser corta y fácil)' };
    }
    if (t.length > 128) return { ok: false, msg: 'Demasiado larga (máx. 128 caracteres)' };
    return { ok: true, password: t };
}

function reiniciarModalResetPwUi() {
    _resetPaso = 1;
    _resetTokenActual = null;
    _resetUsuarioAdmin = false;
    _resetTargetUserId = null;
    try {
        const m = document.getElementById('reset-msg');
        if (m) {
            m.textContent = '';
            m.style.color = '';
        }
        const w = document.getElementById('reset-codigo-wrap');
        if (w) w.style.display = 'none';
        const c = document.getElementById('reset-codigo');
        const n = document.getElementById('reset-nueva-pw');
        if (c) c.value = '';
        if (n) n.value = '';
        const btn = document.getElementById('btn-reset-pw');
        if (btn) {
            btn.style.display = '';
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar código';
        }
    } catch (_) {}
}

async function pasoResetPw() {
    const d = _deps;
    if (!d) return;
    const { sqlSimple, sqlFiltroUsuariosPorTenant, leerEmailContactoEmpresaNeon, esEmailValidoSimple } = d;
    const cfg = window.APP_CONFIG?.emailjs;

    const msg = document.getElementById('reset-msg');
    const btn = document.getElementById('btn-reset-pw');
    if (!msg || !btn) return;

    if (_resetPaso === 1) {
        const email = document.getElementById('reset-email')?.value.trim() || '';
        if (!email) {
            msg.textContent = 'Ingresá el nombre de usuario del administrador.';
            return;
        }
        _resetUsuarioAdmin = false;
        try {
            const emailLc = email.toLowerCase();
            const matchSql = (wfExtra) => `SELECT id, email, nombre, rol
                FROM usuarios
                WHERE activo = TRUE
                  AND lower(coalesce(email,'')) = ${esc(emailLc)}
                ${wfExtra || ''}
                LIMIT 1`;
            const wf = await sqlFiltroUsuariosPorTenant();
            let r = await sqlSimple(matchSql(wf));
            if (!r.rows[0] && wf) {
                r = await sqlSimple(matchSql(''));
            }
            if (!r.rows[0]) {
                const emEmpresa = (await leerEmailContactoEmpresaNeon()).trim().toLowerCase();
                if (emEmpresa && emailLc === emEmpresa) {
                    const pickAdmin = (wfExtra) => `SELECT id, email, nombre, rol
                        FROM usuarios
                        WHERE activo = TRUE
                          AND lower(trim(coalesce(rol,''))) IN ('admin','administrador')
                        ${wfExtra || ''}
                        ORDER BY id ASC
                        LIMIT 1`;
                    r = await sqlSimple(pickAdmin(wf));
                    if (!r.rows[0] && wf) r = await sqlSimple(pickAdmin(''));
                }
            }
            if (!r.rows[0]) {
                msg.textContent = 'Cuenta no encontrada o inactiva';
                return;
            }
            const usuario = r.rows[0];
            _resetTargetUserId = Number(usuario.id);
            if (!Number.isFinite(_resetTargetUserId) || _resetTargetUserId <= 0) _resetTargetUserId = null;
            const rolRaw = String(usuario.rol || '').toLowerCase();
            if (rolRaw !== 'admin' && rolRaw !== 'administrador') {
                msg.textContent =
                    'La recuperación por correo es solo para administradores. Los técnicos deben pedir una clave provisoria al admin (panel Usuarios).';
                return;
            }
            _resetUsuarioAdmin = true;

            const destManual = (document.getElementById('reset-email-destino')?.value || '').trim();
            let toEmail = '';
            if (destManual) {
                if (!esEmailValidoSimple(destManual)) {
                    msg.textContent = 'El correo de destino no es válido.';
                    return;
                }
                toEmail = destManual;
            } else {
                toEmail = await leerEmailContactoEmpresaNeon();
                if (!toEmail) toEmail = String(usuario.email || '').trim();
            }
            if (!esEmailValidoSimple(toEmail)) {
                msg.textContent =
                    'No hay correo de destino. Completá «Correo para el código» o cargá el correo de la empresa en Admin → Empresa (email de contacto).';
                return;
            }

            const token = String(Math.floor(100000 + Math.random() * 900000));
            _resetTokenActual = token;
            const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            await sqlSimple(`UPDATE usuarios SET reset_token = ${esc(token)}, reset_expiry = ${esc(expiry)} WHERE id = ${esc(usuario.id)}`);

            const esAndroidLocal =
                !!window.AndroidDevice &&
                (/GestorNova\//i.test(navigator.userAgent) ||
                    /Nexxo\//i.test(navigator.userAgent) ||
                    window.location.protocol === 'file:');
            if (esAndroidLocal) {
                msg.style.color = '#854d0e';
                msg.innerHTML =
                    `En Android no se puede enviar el correo desde la app.<br>` +
                    `Código temporal (válido ~30 min): <b>${token}</b><br>` +
                    `<span style="font-size:.8rem">Si necesitás recibirlo por mail, usá la versión web en PC.</span>`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            } else {
                if (!cfg?.publicKey || !cfg?.serviceId || !cfg?.templateId) {
                    throw new Error('Servicio de correo no configurado (config.json → emailjs)');
                }
                if (!window.emailjs || typeof window.emailjs.send !== 'function') {
                    throw new Error('Servicio de correo no cargado; recargá la página');
                }
                await window.emailjs.send(
                    cfg.serviceId,
                    cfg.templateId,
                    {
                        to_email: toEmail,
                        to_name: usuario.nombre || usuario.email || 'Administrador',
                        token,
                        app_name: 'GestorNova',
                    },
                    cfg.publicKey
                );

                msg.style.color = '#166534';
                msg.textContent = `✓ Código enviado a ${toEmail}`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            }
        } catch (e) {
            const em = _errMsg(e);
            const esAndroidLocal =
                !!window.AndroidDevice &&
                (/GestorNova\//i.test(navigator.userAgent) ||
                    /Nexxo\//i.test(navigator.userAgent) ||
                    window.location.protocol === 'file:');
            if (esAndroidLocal && _resetTokenActual && _resetUsuarioAdmin) {
                msg.style.color = '#854d0e';
                msg.innerHTML =
                    `No se pudo enviar el email (${em}).<br>` +
                    `Código temporal: <b>${_resetTokenActual}</b>`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            } else {
                msg.style.color = '';
                msg.textContent = 'Error: ' + em;
            }
        }
    } else {
        const email = document.getElementById('reset-email')?.value.trim() || '';
        const codigo = _normalizarCodigoResetPw(document.getElementById('reset-codigo')?.value || '');
        const valPw = validarNuevaClaveRecuperacionMail(document.getElementById('reset-nueva-pw')?.value || '');
        if (!codigo) {
            msg.textContent = 'Completá el código recibido por correo';
            return;
        }
        if (!valPw.ok) {
            msg.textContent = valPw.msg;
            return;
        }
        const nuevaPw = valPw.password;
        try {
            const emailLc = email.toLowerCase();
            const wf = await sqlFiltroUsuariosPorTenant();
            const tokSql = `trim(both from coalesce(reset_token::text, '')) = ${esc(codigo)}`;
            const matchById = (wfExtra) => `SELECT id
                FROM usuarios
                WHERE id = ${esc(Number(_resetTargetUserId))}
                  AND ${tokSql}
                  AND reset_expiry > NOW()
                ${wfExtra || ''}
                LIMIT 1`;
            const matchUpd = (wfExtra) => `SELECT id
                FROM usuarios
                WHERE lower(coalesce(email,'')) = ${esc(emailLc)}
                  AND ${tokSql}
                  AND reset_expiry > NOW()
                ${wfExtra || ''}
                LIMIT 1`;
            let r = { rows: [] };
            if (_resetTargetUserId != null && Number.isFinite(Number(_resetTargetUserId))) {
                r = await sqlSimple(matchById(wf));
                if (!r.rows[0] && wf) r = await sqlSimple(matchById(''));
            }
            if (!r.rows[0]) {
                r = await sqlSimple(matchUpd(wf));
                if (!r.rows[0] && wf) {
                    r = await sqlSimple(matchUpd(''));
                }
            }
            if (!r.rows[0]) {
                msg.textContent = 'Código incorrecto o expirado';
                return;
            }
            await sqlSimple(
                `UPDATE usuarios SET password_hash = ${esc(nuevaPw)}, reset_token = NULL, reset_expiry = NULL, must_change_password = FALSE WHERE id = ${esc(r.rows[0].id)}`
            );
            msg.style.color = '#166534';
            msg.textContent = '✓ Contraseña actualizada. Ya podés iniciar sesión.';
            btn.style.display = 'none';
            _resetPaso = 1;
            _resetTokenActual = null;
            _resetUsuarioAdmin = false;
        } catch (e) {
            msg.style.color = '';
            msg.textContent = 'Error: ' + _errMsg(e);
        }
    }
}

/**
 * @param {{ sqlSimple: Function, sqlFiltroUsuariosPorTenant: Function, leerEmailContactoEmpresaNeon: Function, esEmailValidoSimple: Function }} deps
 */
export function initRecuperarContrasenaMail(deps) {
    _deps = deps;
    window.reiniciarModalResetPwUi = reiniciarModalResetPwUi;
    window.pasoResetPw = pasoResetPw;
}
