/**
 * Modal único: credenciales del admin creado con el tenant (solo en memoria, no localStorage).
 * made by leavera77
 */

import { toast } from './ui-utils.js';
import { copiarTextoContenido } from './gn-clipboard-copy.js';

function credsTexto({ usuario, password }) {
  return (
    `Tenant creado exitosamente.\n\n` +
    `Usuario administrador:\n  Usuario: ${usuario}\n  Contraseña: ${password}\n\n` +
    `Compartí estas credenciales con el administrador de la empresa.\n` +
    `Deberá cambiarlas al iniciar sesión por primera vez.`
  );
}

/** @returns {Promise<void>} */
export function mostrarModalCredencialesAdminNuevoTenant({ usuario, password, nombre, onContinue }) {
  const modal = document.getElementById('modal-cfgi-tenant-admin-creds');
  const uEl = document.getElementById('cfgi-tenant-admin-creds-usuario');
  const pEl = document.getElementById('cfgi-tenant-admin-creds-password');
  const nEl = document.getElementById('cfgi-tenant-admin-creds-nombre');
  const copyBtn = document.getElementById('cfgi-tenant-admin-creds-copy');
  const contBtn = document.getElementById('cfgi-tenant-admin-creds-continue');
  if (!modal || !uEl || !pEl || !copyBtn || !contBtn) {
    toast('No se pudo mostrar el aviso de credenciales (falta el modal en la página).', 'error');
    onContinue?.();
    return Promise.resolve();
  }
  uEl.textContent = usuario || '—';
  pEl.textContent = password || '—';
  if (nEl) nEl.textContent = nombre || '';

  return new Promise((resolve) => {
    const done = () => {
      copyBtn.removeEventListener('click', onCopy);
      contBtn.removeEventListener('click', onCont);
      modal.classList.remove('active');
      resolve();
    };
    const onCopy = async () => {
      await copiarTextoContenido(credsTexto({ usuario, password }), {
        okMessage: 'Credenciales copiadas al portapapeles.',
      });
    };
    const onCont = async () => {
      done();
      try {
        await onContinue?.();
      } catch (_) {}
    };
    copyBtn.addEventListener('click', onCopy);
    contBtn.addEventListener('click', onCont);
    modal.classList.add('active');
  });
}
