/**
 * Dashboard gerencia: modal arrastrable (misma UX que .moui-card).
 * made by leavera77
 */

const MOD_ID = 'modal-dashboard-gerencia';
const LS_KEY = 'pmg_dashboard_gerencia_mc_pos';

function dragEnabled() {
    try {
        return window.matchMedia('(min-width:1024px)').matches || (typeof window.esAndroidWebViewMapa === 'function' && window.esAndroidWebViewMapa());
    } catch (_) {
        return false;
    }
}

function clampMc(mc, leftPx, topPx) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const br = mc.getBoundingClientRect();
    const w = br.width || mc.offsetWidth || 320;
    const h = br.height || mc.offsetHeight || 200;
    const pad = 8;
    const l = Math.min(Math.max(leftPx, pad), Math.max(pad, vw - w - pad));
    const t = Math.min(Math.max(topPx, pad), Math.max(pad, vh - h - pad));
    return { left: l, top: t };
}

/**
 * Una sola vez: arrastrar desde .mh (sin iniciar en botones).
 */
export function initDashboardGerenciaModalDrag() {
    const mo = document.getElementById(MOD_ID);
    if (!mo || mo.dataset.gnDashDragInit === '1') return;
    const mc = mo.querySelector('.modal-dashboard-mc') || mo.querySelector('.mc');
    const mh = mo.querySelector('.mh');
    if (!mc || !mh) return;
    mo.dataset.gnDashDragInit = '1';

    const applySaved = () => {
        if (!dragEnabled()) return;
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
            if (mo.classList.contains('modal-dash--maximized')) return;
            mc.style.position = 'fixed';
            mc.style.margin = '0';
            const c = clampMc(mc, p.left, p.top);
            mc.style.left = `${c.left}px`;
            mc.style.top = `${c.top}px`;
            mc.style.transform = 'none';
        } catch (_) {}
    };

    const resetToCentered = () => {
        mc.style.position = '';
        mc.style.left = '';
        mc.style.top = '';
        mc.style.margin = '';
        mc.style.transform = '';
    };

    mo.addEventListener('transitionend', () => {
        try {
            if (!mo.classList.contains('active')) resetToCentered();
        } catch (_) {}
    });

    let state = null;
    const start = (clientX, clientY, ev) => {
        if (!dragEnabled() || mo.classList.contains('modal-dash--maximized')) return;
        if (ev && ev.target && ev.target.closest && ev.target.closest('button')) return;
        const r = mc.getBoundingClientRect();
        if (mc.style.position !== 'fixed') {
            mc.style.position = 'fixed';
            mc.style.margin = '0';
            mc.style.left = `${r.left}px`;
            mc.style.top = `${r.top}px`;
            mc.style.transform = 'none';
        }
        state = { sx: clientX, sy: clientY, sl: r.left, st: r.top, moved: false };
        const onMove = (e2) => {
            if (!state) return;
            const cx = e2.clientX != null ? e2.clientX : e2.touches?.[0]?.clientX ?? 0;
            const cy = e2.clientY != null ? e2.clientY : e2.touches?.[0]?.clientY ?? 0;
            if (Math.abs(cx - state.sx) + Math.abs(cy - state.sy) > 5) {
                state.moved = true;
                if (e2.cancelable) e2.preventDefault();
            }
            const c = clampMc(mc, state.sl + (cx - state.sx), state.st + (cy - state.sy));
            mc.style.left = `${c.left}px`;
            mc.style.top = `${c.top}px`;
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            document.removeEventListener('touchcancel', onUp);
            if (state && state.moved) {
                try {
                    const br = mc.getBoundingClientRect();
                    const c = clampMc(mc, br.left, br.top);
                    mc.style.left = `${c.left}px`;
                    mc.style.top = `${c.top}px`;
                    localStorage.setItem(LS_KEY, JSON.stringify({ left: c.left, top: c.top }));
                } catch (_) {}
            }
            state = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
    };

    mh.style.cursor = 'grab';
    mh.addEventListener('mousedown', (e) => start(e.clientX, e.clientY, e));
    mh.addEventListener(
        'touchstart',
        (e) => {
            if (e.touches.length !== 1) return;
            if (e.target.closest && e.target.closest('button')) return;
            e.preventDefault();
            start(e.touches[0].clientX, e.touches[0].clientY, e);
        },
        { passive: false }
    );

    const obs = new MutationObserver(() => {
        if (mo.classList.contains('active')) {
            if (!mo.classList.contains('modal-dash--maximized')) applySaved();
        } else {
            resetToCentered();
        }
    });
    obs.observe(mo, { attributes: true, attributeFilter: ['class'] });
}
