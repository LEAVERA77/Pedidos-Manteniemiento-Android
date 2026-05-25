/**
 * Botón ojo para mostrar/ocultar contraseña (login, primer ingreso, admin).
 * made by leavera77
 */

const DEFAULT_SELECTORS = [
  '#pw',
  '#forzar-cambio-pw-nueva',
  '#forzar-cambio-pw-nueva2',
  '#pw-actual',
  '#pw-nueva',
  '#pw-confirmar',
  '#micuenta-pw-actual',
  '#micuenta-pw-nueva',
  '#micuenta-pw-nueva2',
  '#reabrir-asistente-pw',
  '#gn-acceso-tec-clave',
  '#reset-pw-nueva',
  '#reset-pw-nueva2',
];

function injectStylesOnce() {
  if (document.getElementById('gn-pw-toggle-style')) return;
  const st = document.createElement('style');
  st.id = 'gn-pw-toggle-style';
  st.textContent = `
.ig.gn-has-pw-toggle input { padding-right: 2.65rem !important; }
.ig .gn-pw-toggle-btn {
  position: absolute; right: .5rem; top: 50%; transform: translateY(-50%);
  border: none; background: transparent; color: var(--tl); cursor: pointer;
  padding: .25rem .35rem; line-height: 1; z-index: 2; pointer-events: auto;
}
.ig .gn-pw-toggle-btn:hover { color: var(--bd); }
.fg.gn-has-pw-toggle { position: relative; }
.fg.gn-has-pw-toggle input { padding-right: 2.65rem; }
.fg .gn-pw-toggle-btn {
  position: absolute; right: .45rem; bottom: .42rem;
  border: none; background: transparent; color: var(--tl); cursor: pointer;
  padding: .2rem .3rem; z-index: 2;
}`;
  document.head.appendChild(st);
}

/**
 * @param {HTMLInputElement} input
 */
function attachPasswordToggle(input) {
  if (!input || input.dataset.gnPwToggle === '1') return;
  input.dataset.gnPwToggle = '1';
  const parent = input.parentElement;
  if (!parent) return;
  const inIg = parent.classList.contains('ig');
  const inFg = parent.classList.contains('fg');
  if (inIg) parent.classList.add('gn-has-pw-toggle');
  else if (inFg) parent.classList.add('gn-has-pw-toggle');
  else {
    const wrap = document.createElement('div');
    wrap.className = 'gn-has-pw-toggle';
    wrap.style.cssText = 'position:relative;display:block';
    input.parentNode?.insertBefore(wrap, input);
    wrap.appendChild(input);
  }
  const host = input.parentElement;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gn-pw-toggle-btn';
  btn.setAttribute('aria-label', 'Mostrar contraseña');
  btn.setAttribute('title', 'Mostrar contraseña');
  btn.innerHTML = '<i class="fas fa-eye"></i>';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    btn.setAttribute('title', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
  host?.appendChild(btn);
}

/**
 * @param {ParentNode} [root]
 * @param {string[]} [selectors]
 */
export function initPasswordVisibilityToggles(root = document, selectors = DEFAULT_SELECTORS) {
  injectStylesOnce();
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el && el.tagName === 'INPUT') attachPasswordToggle(el);
  }
}

function boot() {
  initPasswordVisibilityToggles();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
