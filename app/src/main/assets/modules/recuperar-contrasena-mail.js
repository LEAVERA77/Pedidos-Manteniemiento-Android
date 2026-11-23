/** Modal de recuperación: exclusivamente por API y correo configurado en el servidor. */
let _resetPaso = 1;
let _resetTargetUserId = null;

function normalizarCodigo(raw) {
    const t = String(raw || '').trim();
    const digits = t.replace(/\D/g, '');
    return digits.length === 6 ? digits : t.replace(/\s+/g, '');
}

/** Se conserva el contrato para los clientes que importen este módulo. */
export function validarNuevaClaveRecuperacionMail(raw) {
    const t = String(raw ?? '').trim();
    if (!t) return { ok: false, msg: 'Completá la nueva contraseña' };
    if (t.length < 3) return { ok: false, msg: 'La nueva contraseña debe tener al menos 3 caracteres' };
    if (t.length > 128) return { ok: false, msg: 'Demasiado larga (máx. 128 caracteres)' };
    return { ok: true, password: t };
}

function reiniciarModalResetPwUi() {
    _resetPaso = 1;
    _resetTargetUserId = null;
    const msg = document.getElementById('reset-msg');
    if (msg) { msg.textContent = ''; msg.style.color = ''; }
    const wrap = document.getElementById('reset-codigo-wrap');
    if (wrap) wrap.style.display = 'none';
    for (const id of ['reset-codigo', 'reset-nueva-pw']) {
        const el = document.getElementById(id);
        if (el) el.value = '';
    }
    const btn = document.getElementById('btn-reset-pw');
    if (btn) { btn.style.display = ''; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar código'; }
}

async function pasoResetPw() {
    const msg = document.getElementById('reset-msg');
    const btn = document.getElementById('btn-reset-pw');
    if (!msg || !btn) return;
    const email = document.getElementById('reset-email')?.value.trim() || '';
    if (!email) { msg.textContent = 'Ingresá el nombre de usuario del administrador.'; return; }
    const apiBase = String(window.APP_CONFIG?.api?.baseUrl || '').trim().replace(/\/+$/, '');
    if (!apiBase) {
        msg.textContent = 'La recuperación requiere conexión y una API configurada. Contactá a un administrador.';
        return;
    }
    let url, body;
    if (_resetPaso === 1) {
        const tid = typeof window._gnTenantId === 'function' ? window._gnTenantId() : undefined;
        url = `${apiBase}/api/auth/password-reset/request`;
        body = { usuario: email, tenant_id: tid };
    } else {
        const codigo = normalizarCodigo(document.getElementById('reset-codigo')?.value || '');
        const val = validarNuevaClaveRecuperacionMail(document.getElementById('reset-nueva-pw')?.value || '');
        if (!codigo) { msg.textContent = 'Completá el código recibido por correo'; return; }
        if (!val.ok) { msg.textContent = val.msg; return; }
        url = `${apiBase}/api/auth/password-reset/confirm`;
        body = { usuario: email, user_id: _resetTargetUserId, codigo, nueva_password: val.password };
    }
    try {
        const resp = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            msg.style.color = '';
            msg.textContent = data?.error || `Error (${resp.status})`;
            return;
        }
        msg.style.color = '#166534';
        if (_resetPaso === 1) {
            _resetTargetUserId = Number(data?.user_id) || null;
            if (!_resetTargetUserId) { msg.style.color = ''; msg.textContent = 'La API no identificó la cuenta.'; return; }
            msg.textContent = `✓ Código enviado a ${data?.to_email || 'tu correo'}`;
            const wrap = document.getElementById('reset-codigo-wrap');
            if (wrap) wrap.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
            _resetPaso = 2;
        } else {
            try { window.__gnPurgarHuellaGuardadaExplicitamente?.(); } catch (_) {}
            msg.textContent = '✓ Contraseña actualizada. Ya podés iniciar sesión.';
            btn.style.display = 'none';
            _resetPaso = 1;
            _resetTargetUserId = null;
        }
    } catch (e) {
        msg.style.color = '';
        msg.textContent = 'No se pudo conectar con el servidor de recuperación.';
    }
}

/** El argumento de dependencias heredado ya no habilita SQL ni envío local. */
export function initRecuperarContrasenaMail(_deps) {
    window.reiniciarModalResetPwUi = reiniciarModalResetPwUi;
    window.pasoResetPw = pasoResetPw;
}
