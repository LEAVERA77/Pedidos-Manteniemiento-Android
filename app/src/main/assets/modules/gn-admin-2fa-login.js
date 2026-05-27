/**
 * Segundo factor por email en login admin (si la API devuelve requires_otp).
 * made by leavera77
 */

const OTP_MODAL_ID = 'gn-admin-otp-modal';

function apiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

function ensureOtpModal() {
    if (document.getElementById(OTP_MODAL_ID)) return;
    const mo = document.createElement('div');
    mo.id = OTP_MODAL_ID;
    mo.className = 'mo gn-admin-otp-modal active';
    mo.style.display = 'none';
    mo.innerHTML = `
<div class="mc" style="max-width:22rem">
  <div class="mh"><h3><i class="fas fa-envelope-circle-check"></i> Verificación</h3></div>
  <div class="mb" style="padding:1rem">
    <p id="gn-otp-msg" style="font-size:.85rem;margin:0 0 .75rem;color:var(--tm,#64748b)"></p>
    <input type="text" id="gn-otp-code" inputmode="numeric" maxlength="6" class="gn-global-search-input" placeholder="Código de 6 dígitos" autocomplete="one-time-code" />
    <div style="display:flex;gap:.5rem;margin-top:.75rem">
      <button type="button" class="btn-sm primary" id="gn-otp-submit">Confirmar</button>
      <button type="button" class="btn-sm" id="gn-otp-cancel">Cancelar</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(mo);
}

function cerrarOtpModal() {
    const mo = document.getElementById(OTP_MODAL_ID);
    if (mo) {
        mo.classList.remove('active');
        mo.style.display = 'none';
    }
}

/**
 * @param {object} loginData — respuesta JSON del login con requires_otp
 * @returns {Promise<object|null>} datos de sesión { token, user } o null si canceló
 */
export function completarLoginOtpAdmin(loginData) {
    return new Promise((resolve) => {
        ensureOtpModal();
        const mo = document.getElementById(OTP_MODAL_ID);
        const msg = document.getElementById('gn-otp-msg');
        const inp = document.getElementById('gn-otp-code');
        const masked = loginData?.email_masked || 'tu correo';
        if (msg) msg.textContent = `Enviamos un código a ${masked}. Ingresalo para continuar.`;
        if (inp) {
            inp.value = '';
            setTimeout(() => inp.focus(), 80);
        }
        mo.style.display = '';
        mo.classList.add('active');

        const finish = (data) => {
            cerrarOtpModal();
            resolve(data);
        };

        const onCancel = () => finish(null);
        const onSubmit = async () => {
            const code = String(inp?.value || '').trim().replace(/\D/g, '');
            if (code.length < 4) {
                window.toast?.('Ingresá el código recibido por email', 'warn');
                return;
            }
            try {
                const r = await fetch(apiUrl('/api/auth/verify-login-otp'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        challenge_id: loginData.challenge_id,
                        code,
                    }),
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(data.error || r.statusText);
                finish(data);
            } catch (e) {
                window.toast?.(e.message || 'Código inválido', 'err');
            }
        };

        document.getElementById('gn-otp-submit')?.replaceWith(
            document.getElementById('gn-otp-submit').cloneNode(true)
        );
        document.getElementById('gn-otp-cancel')?.replaceWith(
            document.getElementById('gn-otp-cancel').cloneNode(true)
        );
        document.getElementById('gn-otp-submit')?.addEventListener('click', onSubmit);
        document.getElementById('gn-otp-cancel')?.addEventListener('click', onCancel);
        inp?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void onSubmit();
            }
        });
    });
}

if (typeof window !== 'undefined') {
    window.__gnCompleteLoginOtp = async (loginData) => {
        if (!loginData?.requires_otp) return null;
        const done = await completarLoginOtpAdmin(loginData);
        if (!done?.token) return null;
        return done;
    };
}
