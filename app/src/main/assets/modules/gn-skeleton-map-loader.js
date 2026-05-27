/**
 * Placeholder liviano en #mc hasta que Leaflet inicialice el mapa.
 * made by leavera77
 */

const SKELETON_CLASS = 'gn-map-skeleton';
const MAX_WAIT_MS = 9000;

function mapaListo() {
  const mc = document.getElementById('mc');
  if (!mc) return true;
  if (mc.querySelector('.leaflet-container')) return true;
  try {
    if (window.app?.map) return true;
  } catch (_) {}
  return false;
}

function quitarSkeleton(el) {
  if (!el) return;
  el.classList.add('is-hidden');
  setTimeout(() => el.remove(), 280);
}

function ensureSkeleton() {
  const mc = document.getElementById('mc');
  if (!mc || mc.querySelector(`.${SKELETON_CLASS}`)) return null;

  const pos = getComputedStyle(mc).position;
  if (pos === 'static') {
    try {
      mc.style.position = 'relative';
    } catch (_) {}
  }

  const sk = document.createElement('div');
  sk.className = SKELETON_CLASS;
  sk.setAttribute('aria-hidden', 'true');
  sk.innerHTML = '<span class="gn-map-skeleton-label"><i class="fas fa-map"></i> Cargando mapa…</span>';
  mc.appendChild(sk);
  return sk;
}

function watchMapa() {
  const sk = ensureSkeleton();
  if (!sk) return;

  const started = Date.now();

  const tick = () => {
    if (mapaListo() || Date.now() - started > MAX_WAIT_MS) {
      quitarSkeleton(sk);
      return;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function initGnSkeletonMapLoader() {
  const mc = document.getElementById('mc');
  if (!mc) return;

  watchMapa();

  const ms = document.getElementById('ms');
  if (ms && typeof MutationObserver !== 'undefined') {
    try {
      const mo = new MutationObserver(() => {
        if (ms.classList.contains('active') && !mapaListo()) watchMapa();
      });
      mo.observe(ms, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGnSkeletonMapLoader, { once: true });
  } else initGnSkeletonMapLoader();
}
