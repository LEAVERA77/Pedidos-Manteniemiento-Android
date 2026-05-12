/**
 * Modal admin: WhatsApp del usuario → columna telefono_whatsapp (E.164 54 sin 9).
 * made by leavera77
 */

import { esc } from './utils.js';
import { toast, toastError } from './ui-utils.js';
import { normalizarTelefonoWhatsapp, esTelefonoWhatsappValido } from './normalizar-telefono.js';

const MODAL_ID = 'gn-modal-admin-usuario-wa';

function cerrarModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
}

/**
 * @param {{ userId: number, telefonoWhatsapp: string, telefonoContacto: string, whatsappNotificaciones: boolean, sqlSimple: (q: string) => Promise<unknown>, onAfterSave: () => Promise<void> }} p
 */
export async function openAdminUsuarioWhatsappModal(p) {
    const userId = Number(p.userId);
    if (!Number.isFinite(userId) || userId <= 0) return;
    const waRaw = String(p.telefonoWhatsapp || '').trim();
    const legRaw = String(p.telefonoContacto || '').trim();
    const digMostrar = (() => {
        const n = normalizarTelefonoWhatsapp(waRaw || legRaw);
        return n ? n.replace(/^\+/, '') : '';
    })();

    cerrarModal();
    const wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.style.cssText =
        'position:fixed;inset:0;z-index:100080;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:1rem';
    wrap.innerHTML = `
<div style="background:var(--bg,#fff);color:var(--tm,#0f172a);max-width:420px;width:100%;border-radius:.65rem;box-shadow:0 20px 50px rgba(0,0,0,.2);padding:1.1rem 1.15rem;font-size:.9rem">
  <div style="font-weight:700;margin-bottom:.35rem">WhatsApp del usuario</div>
  <p style="margin:0 0 .65rem;font-size:.82rem;color:var(--tl,#64748b);line-height:1.35">Ingresá el número con prefijo país <b>54</b> y <b>sin</b> el 9 móvil (ej: <code>543434123456</code>). Se guarda en <code>telefono_whatsapp</code>.</p>
  <label for="gn-wa-user-input" style="display:block;font-size:.78rem;font-weight:600;margin-bottom:.2rem">Número WhatsApp</label>
  <input id="gn-wa-user-input" type="text" inputmode="numeric" autocomplete="tel" value="${digMostrar.replace(/"/g, '&quot;')}" placeholder="543434123456" style="width:100%;padding:.5rem .65rem;border:1.5px solid #cbd5e1;border-radius:.45rem;font-size:.95rem;box-sizing:border-box" />
  <label style="display:flex;align-items:center;gap:.45rem;margin-top:.75rem;font-size:.82rem;cursor:pointer">
    <input type="checkbox" id="gn-wa-user-notif" ${p.whatsappNotificaciones !== false ? 'checked' : ''} /> Notificaciones WhatsApp habilitadas
  </label>
  <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem;flex-wrap:wrap">
    <button type="button" class="btn-sm" id="gn-wa-user-cancel" style="background:var(--bg,#f8fafc);border:1px solid var(--bo,#e2e8f0)">Cancelar</button>
    <button type="button" class="btn-sm" id="gn-wa-user-save" style="background:#0f766e;color:#fff;border:1px solid #0d9488">Guardar</button>
  </div>
</div>`;
    document.body.appendChild(wrap);
    const inp = wrap.querySelector('#gn-wa-user-input');
    const cb = wrap.querySelector('#gn-wa-user-notif');
    wrap.querySelector('#gn-wa-user-cancel')?.addEventListener('click', cerrarModal);
    wrap.addEventListener('click', (ev) => {
        if (ev.target === wrap) cerrarModal();
    });
    wrap.querySelector('#gn-wa-user-save')?.addEventListener('click', async () => {
        const raw = (inp?.value || '').trim();
        const telNorm = normalizarTelefonoWhatsapp(raw.startsWith('+') ? raw : raw.replace(/\s/g, ''));
        if (telNorm && !esTelefonoWhatsappValido(telNorm)) {
            toast('Formato inválido. Ejemplo: 543434123456 o +543434123456', 'error');
            return;
        }
        const hab = !!(cb && cb.checked);
        try {
            await p.sqlSimple(
                `UPDATE usuarios SET telefono_whatsapp = ${esc(telNorm || null)}, whatsapp_notificaciones = ${esc(hab)} WHERE id = ${esc(userId)}`
            );
            toast('WhatsApp actualizado', 'success');
            cerrarModal();
            await p.onAfterSave();
        } catch (e) {
            toastError('usuario-whatsapp-modal', e, 'No se pudo guardar.');
        }
    });
    setTimeout(() => inp?.focus(), 80);
}
