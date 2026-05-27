/**
 * Ayuda de atajos de teclado (?).
 * made by leavera77
 */

const MODAL_ID = 'gn-shortcuts-modal';

const SHORTCUTS = [
    { keys: 'Ctrl + K', desc: 'Buscar pedido' },
    { keys: '?', desc: 'Esta ayuda' },
    { keys: 'Esc', desc: 'Cerrar modal activo (si aplica)' },
    { keys: 'Estado', desc: 'Footer → enlace Estado del servicio (API, BD, geo)' },
];

function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;
    const mo = document.createElement('div');
    mo.id = MODAL_ID;
    mo.className = 'mo gn-shortcuts-modal';
    mo.innerHTML = `
<div class="mc" style="max-width:22rem">
  <div class="mh">
    <h3><i class="fas fa-keyboard"></i> Atajos de teclado</h3>
    <button type="button" class="cm" data-gn-sh-close aria-label="Cerrar"><i class="fas fa-times"></i></button>
  </div>
  <div class="mb" style="padding:.85rem 1rem 1rem">
    <ul class="gn-shortcuts-list">${SHORTCUTS.map(
        (s) =>
            `<li><kbd>${esc(s.keys)}</kbd><span>${esc(s.desc)}</span></li>`
    ).join('')}</ul>
  </div>
</div>`;
    document.body.appendChild(mo);
    mo.querySelector('[data-gn-sh-close]')?.addEventListener('click', () => mo.classList.remove('active'));
    mo.addEventListener('click', (e) => {
        if (e.target === mo) mo.classList.remove('active');
    });
}

export function abrirAyudaAtajos() {
    ensureModal();
    document.getElementById(MODAL_ID)?.classList.add('active');
}

function injectHelpButton() {
    if (document.getElementById('btn-keyboard-shortcuts')) return;
    const slot = document.querySelector('#ms .hd-slot-right');
    const ref = document.getElementById('btn-global-search');
    if (!slot || !ref) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-keyboard-shortcuts';
    btn.className = 'ib';
    btn.title = 'Atajos de teclado (?)';
    btn.innerHTML = '<i class="fas fa-keyboard" aria-hidden="true"></i>';
    btn.addEventListener('click', () => abrirAyudaAtajos());
    ref.insertAdjacentElement('afterend', btn);
}

function isTypingTarget(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function initGnKeyboardShortcutsHelp() {
    injectHelpButton();
    window.addEventListener('keydown', (e) => {
        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (isTypingTarget(document.activeElement)) return;
            e.preventDefault();
            abrirAyudaAtajos();
        }
    });
    window.abrirAyudaAtajos = abrirAyudaAtajos;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGnKeyboardShortcutsHelp, { once: true });
    } else initGnKeyboardShortcutsHelp();
}
