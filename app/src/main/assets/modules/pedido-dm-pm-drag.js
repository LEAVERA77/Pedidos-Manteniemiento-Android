/**
 * Arrastre del modal #dm / #pm por la barra .mh (similar a paneles moui).
 * made by leavera77
 */

function clampModalMc(mc, leftPx, topPx) {
    const pad = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const br = mc.getBoundingClientRect();
    const w = br.width || mc.offsetWidth || 320;
    const h = br.height || mc.offsetHeight || 200;
    const minL = pad;
    const maxL = Math.max(minL, vw - w - pad);
    const minT = pad;
    const maxT = Math.max(minT, vh - h - pad);
    const l = Math.min(Math.max(Number(leftPx), minL), maxL);
    const t = Math.min(Math.max(Number(topPx), minT), maxT);
    return { left: l, top: t };
}

function bindModalDrag(modalId, storageKey) {
    const root = document.getElementById(modalId);
    if (!root || root.dataset.gnMcDragInit === '1') return;
    const mc = root.querySelector(':scope > .mc');
    const hd = mc?.querySelector(':scope > .mh');
    if (!mc || !hd) return;
    root.dataset.gnMcDragInit = '1';

    const applySaved = () => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
            mc.style.position = 'fixed';
            mc.style.margin = '0';
            const c = clampModalMc(mc, p.left, p.top);
            mc.style.left = `${c.left}px`;
            mc.style.top = `${c.top}px`;
            mc.style.right = 'auto';
            mc.style.bottom = 'auto';
        } catch (_) {}
    };

    let drag = null;
    const onMove = (ev) => {
        if (!drag) return;
        const cx = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
        const cy = ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0);
        if (Math.abs(cx - drag.sx) + Math.abs(cy - drag.sy) > 5) drag.moved = true;
        if (drag.moved && ev.cancelable) ev.preventDefault();
        mc.style.position = 'fixed';
        mc.style.margin = '0';
        mc.style.right = 'auto';
        mc.style.bottom = 'auto';
        const c = clampModalMc(mc, drag.sl + (cx - drag.sx), drag.st + (cy - drag.sy));
        mc.style.left = `${c.left}px`;
        mc.style.top = `${c.top}px`;
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        document.removeEventListener('touchcancel', onUp);
        if (drag?.moved) {
            try {
                const br = mc.getBoundingClientRect();
                const c = clampModalMc(mc, br.left, br.top);
                mc.style.left = `${c.left}px`;
                mc.style.top = `${c.top}px`;
                localStorage.setItem(storageKey, JSON.stringify({ left: c.left, top: c.top }));
            } catch (_) {}
        }
        drag = null;
    };

    hd.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const r = mc.getBoundingClientRect();
        if (mc.style.position !== 'fixed') {
            mc.style.width = `${Math.min(r.width, window.innerWidth - 20)}px`;
            mc.style.position = 'fixed';
            mc.style.left = `${r.left}px`;
            mc.style.top = `${r.top}px`;
            mc.style.margin = '0';
            mc.style.right = 'auto';
            mc.style.bottom = 'auto';
        }
        const r2 = mc.getBoundingClientRect();
        drag = { sx: e.clientX, sy: e.clientY, sl: r2.left, st: r2.top, moved: false };
        e.preventDefault();
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    hd.addEventListener(
        'touchstart',
        (e) => {
            if (e.touches.length !== 1 || e.target.closest('button')) return;
            const t = e.touches[0];
            const r = mc.getBoundingClientRect();
            if (mc.style.position !== 'fixed') {
                mc.style.width = `${Math.min(r.width, window.innerWidth - 20)}px`;
                mc.style.position = 'fixed';
                mc.style.left = `${r.left}px`;
                mc.style.top = `${r.top}px`;
                mc.style.margin = '0';
                mc.style.right = 'auto';
                mc.style.bottom = 'auto';
            }
            const r2 = mc.getBoundingClientRect();
            drag = { sx: t.clientX, sy: t.clientY, sl: r2.left, st: r2.top, moved: false };
            e.preventDefault();
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
            document.addEventListener('touchcancel', onUp);
        },
        { passive: false }
    );

    root.addEventListener('click', () => {
        try {
            if (root.classList.contains('active')) requestAnimationFrame(applySaved);
        } catch (_) {}
    });
    applySaved();
}

function boot() {
    bindModalDrag('dm', 'pmg_dm_mc_pos');
    bindModalDrag('pm', 'pmg_pm_mc_pos');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
