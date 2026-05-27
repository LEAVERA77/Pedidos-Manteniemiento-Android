/**
 * Tooltips opt-in vía data-gn-tooltip (no reemplaza todos los title nativos).
 * made by leavera77
 */

let _floating = null;

function esTouchUi() {
  try {
    return window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  } catch (_) {
    return false;
  }
}

function ensureFloating() {
  if (_floating) return _floating;
  const el = document.createElement('div');
  el.className = 'gn-tooltip-floating';
  el.hidden = true;
  document.body.appendChild(el);
  _floating = el;
  return el;
}

function ocultarTooltip() {
  if (_floating) {
    _floating.hidden = true;
    _floating.textContent = '';
  }
}

function mostrarTooltip(texto, anchor) {
  const tip = ensureFloating();
  tip.textContent = String(texto || '').trim();
  if (!tip.textContent) return;
  tip.hidden = false;
  const r = anchor.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 8, r.bottom + 6);
  let left = r.left + r.width / 2 - 40;
  left = Math.max(8, Math.min(left, window.innerWidth - tip.offsetWidth - 8));
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

function bindOptInTooltips() {
  document.querySelectorAll('[data-gn-tooltip]:not([data-gn-tooltip-bound])').forEach((el) => {
    el.setAttribute('data-gn-tooltip-bound', '1');
    const texto = el.getAttribute('data-gn-tooltip') || '';

    if (esTouchUi()) {
      if (el.getAttribute('data-gn-tooltip-help') === '1') return;
      const help = document.createElement('span');
      help.className = 'gn-tooltip-help';
      help.setAttribute('role', 'button');
      help.setAttribute('tabindex', '0');
      help.setAttribute('aria-label', 'Ayuda');
      help.textContent = '?';
      help.addEventListener('click', (e) => {
        e.stopPropagation();
        mostrarTooltip(texto, help);
        setTimeout(ocultarTooltip, 4000);
      });
      el.insertAdjacentElement('beforeend', help);
      return;
    }

    el.addEventListener('mouseenter', () => mostrarTooltip(texto, el));
    el.addEventListener('focus', () => mostrarTooltip(texto, el));
    el.addEventListener('mouseleave', ocultarTooltip);
    el.addEventListener('blur', ocultarTooltip);
  });
}

function initGnTooltips() {
  bindOptInTooltips();
  document.addEventListener('scroll', ocultarTooltip, true);
  window.addEventListener('resize', ocultarTooltip);
  if (typeof MutationObserver !== 'undefined') {
    try {
      const mo = new MutationObserver(() => bindOptInTooltips());
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGnTooltips, { once: true });
  } else initGnTooltips();
}
