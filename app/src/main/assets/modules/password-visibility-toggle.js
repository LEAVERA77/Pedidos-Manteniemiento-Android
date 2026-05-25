/**
 * Botón ojo para mostrar/ocultar contraseña (login, primer ingreso, admin).
 * made by leavera77
 */

const DEFAULT_SELECTORS = [
  '#pw',
  '#forzar-cambio-pw-nueva',
  '#forzar-cambio-pw-nueva2',
  '#forzar-cambio-pw-usuario',
  '#pw-actual',
  '#pw-nueva',
  '#pw-confirmar',
  '#micuenta-pw-actual',
  '#micuenta-pw-nueva',
  '#micuenta-pw-nueva2',
  '#reabrir-asistente-pw',
  '#gn-acceso-tec-clave',
];

function injectStylesOnce() {
  if (document.getElementById('gn-pw-toggle-style')) return;
  const st = document.createElement('style');
  st.id = 'gn-pw-toggle-style';
  st.textContent = `
.gn-has-pw-toggle { position: relative !important; }
.gn-has-pw-toggle > input[type="password"],
.gn-has-pw-toggle > input[type="text"].gn-pw-toggle-input {
  padding-right: 2.85rem !important;
  box-sizing: border-box;
}
.gn-has-pw-toggle .gn-pw-toggle-btn {
  position: absolute;
  right: 0.2rem;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  pointer-events: auto;
  touch-action: manipulation;
  border: none;
  background: rgba(255,255,255,.92);
  color: var(--tl, #64748b);
  cursor: pointer;
  width: 2.35rem;
  height: 2.35rem;
  min-width: 2.35rem;
  min-height: 2.35rem;
  padding: 0;
  margin: 0;
  border-radius: 0.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-shadow: 0 0 0 1px rgba(0,0,0,.06);
}
.gn-has-pw-toggle .gn-pw-toggle-btn:hover,
.gn-has-pw-toggle .gn-pw-toggle-btn:focus {
  color: var(--bd, #1e293b);
  outline: none;
  background: #fff;
}
.fg.gn-has-pw-toggle .gn-pw-toggle-btn { bottom: auto; top: auto; transform: translateY(-50%); }
`;
  document.head.appendChild(st);
}

/**
 * @param {HTMLInputElement} input
 */
export function attachPasswordToggle(input) {
  if (!input || input.type !== 'password' && input.type !== 'text') return;
  if (input.dataset.gnPwToggle === '1') return;

  const host = input.closest('.ig') || input.closest('.fg');
  if (!host) return;

  input.dataset.gnPwToggle = '1';
  host.classList.add('gn-has-pw-toggle');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gn-pw-toggle-btn';
  btn.setAttribute('aria-label', 'Mostrar contraseña');
  btn.setAttribute('title', 'Mostrar contraseña');
  btn.tabIndex = 0;
  btn.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i>';

  const toggle = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    input.classList.toggle('gn-pw-toggle-input', show);
    btn.innerHTML = show
      ? '<i class="fas fa-eye-slash" aria-hidden="true"></i>'
      : '<i class="fas fa-eye" aria-hidden="true"></i>';
    const label = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  };

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('click', toggle);
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') toggle(e);
  });

  host.appendChild(btn);
}

/**
 * @param {ParentNode} [root]
 * @param {string[]} [selectors]
 */
export function initPasswordVisibilityToggles(root = document, selectors = DEFAULT_SELECTORS) {
  injectStylesOnce();
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el && el.tagName === 'INPUT') attachPasswordToggle(/** @type {HTMLInputElement} */ (el));
  }
  root.querySelectorAll?.('input[type="password"]')?.forEach?.((el) => {
    if (el.id && selectors.some((s) => s === `#${el.id}`)) return;
    attachPasswordToggle(/** @type {HTMLInputElement} */ (el));
  });
}

/** Re-aplica en modales que se abren después del boot. */
export function refreshPasswordVisibilityToggles(root = document) {
  injectStylesOnce();
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('input[type="password"]').forEach((el) => attachPasswordToggle(el));
}

function boot() {
  initPasswordVisibilityToggles();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

if (typeof window !== 'undefined') {
  window.refreshPasswordVisibilityToggles = refreshPasswordVisibilityToggles;
}
