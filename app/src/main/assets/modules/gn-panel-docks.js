/**
 * Dock izquierdo para paneles minimizados (Pedidos, aviso comunidad) + FAB comunidad robusto.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

const DOCK_ID = 'gn-minimized-panels-dock';
const DOCK_HOST_CLUSTER = 'gn-map-dock-extras';

/** Chips debajo de «Capas» en `#map-slide-tabs-cluster`; fallback body si no hay mapa. */
function ensureDock() {
    const cluster = document.getElementById('map-slide-tabs-cluster');
    if (cluster) {
        let host = document.getElementById(DOCK_HOST_CLUSTER);
        if (!host) {
            host = document.createElement('div');
            host.id = DOCK_HOST_CLUSTER;
            host.className = 'gn-map-dock-extras';
            host.setAttribute('aria-label', 'Pedidos y avisos');
            const capas = document.getElementById('map-tab-capas-osm');
            if (capas && capas.parentElement === cluster) {
                capas.insertAdjacentElement('afterend', host);
            } else {
                cluster.appendChild(host);
            }
        }
        return host;
    }
    let dock = document.getElementById(DOCK_ID);
    if (!dock) {
        dock = document.createElement('div');
        dock.id = DOCK_ID;
        dock.setAttribute('aria-label', 'Paneles minimizados');
        document.body.appendChild(dock);
    }
    return dock;
}

/** Clic sin movimiento → acción; arrastre → posición fixed clamp al viewport (sin persistencia). */
function bindGnDockChipDrag(chip, onActivate) {
    if (!chip || chip.dataset.gnDockDragInit === '1') return;
    chip.dataset.gnDockDragInit = '1';
    try {
        chip.style.touchAction = 'none';
    } catch (_) {}
    let ptr = null;
    chip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const r = chip.getBoundingClientRect();
        ptr = {
            pid: e.pointerId,
            x0: e.clientX,
            y0: e.clientY,
            moved: false,
            sl: r.left,
            st: r.top,
        };
        try {
            chip.setPointerCapture(e.pointerId);
        } catch (_) {}
    });
    chip.addEventListener('pointermove', (e) => {
        if (!ptr || e.pointerId !== ptr.pid) return;
        const dx = Math.abs(e.clientX - ptr.x0);
        const dy = Math.abs(e.clientY - ptr.y0);
        if (dx + dy > 6) ptr.moved = true;
        if (!ptr.moved) return;
        if (e.cancelable) e.preventDefault();
        let nl = ptr.sl + (e.clientX - ptr.x0);
        let nt = ptr.st + (e.clientY - ptr.y0);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rr = chip.getBoundingClientRect();
        const w = rr.width || 48;
        const h = rr.height || 48;
        nl = Math.min(Math.max(8, nl), vw - w - 8);
        nt = Math.min(Math.max(8, nt), vh - h - 8);
        chip.style.position = 'fixed';
        chip.style.left = `${Math.round(nl)}px`;
        chip.style.top = `${Math.round(nt)}px`;
        chip.style.right = 'auto';
        chip.style.bottom = 'auto';
        chip.style.zIndex = '12070';
    });
    chip.addEventListener('pointerup', (e) => {
        if (!ptr || e.pointerId !== ptr.pid) return;
        const moved = ptr.moved;
        ptr = null;
        try {
            chip.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (!moved) onActivate();
    });
    chip.addEventListener('pointercancel', (e) => {
        ptr = null;
        try {
            chip.releasePointerCapture(e.pointerId);
        } catch (_) {}
    });
}

/** Primer chip del dock = arriba en pantalla (flex-direction: column). */
function dockInsertPedidosChip(chip, dock) {
    if (dock.firstChild) dock.insertBefore(chip, dock.firstChild);
    else dock.appendChild(chip);
}

function dockInsertCommunityChip(chip, dock) {
    const p = document.getElementById('gn-dock-chip-pedidos');
    if (p && p.parentElement === dock) {
        if (p.nextSibling) dock.insertBefore(chip, p.nextSibling);
        else dock.appendChild(chip);
    } else {
        dock.appendChild(chip);
    }
}

export function syncPedidosDockChip() {
    const bp2 = document.getElementById('bp2');
    const dock = ensureDock();
    const hidden = bp2 && bp2.classList.contains('bp2-fullhide');
    let chip = document.getElementById('gn-dock-chip-pedidos');
    if (hidden) {
        if (!chip) {
            chip = document.createElement('button');
            chip.type = 'button';
            chip.id = 'gn-dock-chip-pedidos';
            chip.className = 'gn-dock-chip gn-dock-chip--pedidos';
            chip.setAttribute('aria-label', 'Mostrar lista de pedidos');
            chip.innerHTML = '<span aria-hidden="true">📋</span><span class="gn-dock-chip-label">Pedidos</span>';
            chip.title = 'Mostrar lista de pedidos (arrastrá para mover)';
            bindGnDockChipDrag(chip, () => {
                try {
                    if (typeof window.setBp2PanelHidden === 'function') window.setBp2PanelHidden(false);
                    scheduleClampBp2PanelIntoViewport();
                } catch (_) {}
            });
            dockInsertPedidosChip(chip, dock);
        }
        document.body.classList.add('gn-dock-pedidos-active');
    } else {
        try {
            chip?.remove();
        } catch (_) {}
        document.body.classList.remove('gn-dock-pedidos-active');
    }
}

let _bp2DockObsInstalled = false;

function gnFloatingBp2ClampEnabled() {
    try {
        return (
            window.matchMedia('(min-width:1024px)').matches ||
            (typeof window.esAndroidWebViewMapa === 'function' && window.esAndroidWebViewMapa())
        );
    } catch (_) {
        return typeof window.esAndroidWebViewMapa === 'function' && window.esAndroidWebViewMapa();
    }
}

function gnClampBp2PadTopPx() {
    try {
        const hd = document.querySelector('#ms .hd');
        if (hd) {
            const r = hd.getBoundingClientRect();
            if (r.height > 0 && r.bottom > 0) return Math.ceil(r.bottom) + 6;
        }
    } catch (_) {}
    return 64;
}

function gnClampBp2PadBottomPx() {
    try {
        if (typeof window.esAndroidWebViewMapa === 'function' && window.esAndroidWebViewMapa()) {
            const vv = window.visualViewport;
            const ob =
                vv && Number.isFinite(Number(vv.offsetBottom)) ? Number(vv.offsetBottom) : 0;
            return Math.round(152 + ob);
        }
    } catch (_) {}
    return 12;
}

/** Panel bp2 (fixed en escritorio / WebView): mantener dentro del viewport al salir de minimizado. */
export function clampBp2PanelIntoViewport() {
    const bp2 = document.getElementById('bp2');
    if (!bp2 || bp2.classList.contains('bp2-fullhide')) return;
    if (!gnFloatingBp2ClampEnabled()) {
        try {
            bp2.style.zIndex = '10030';
        } catch (_) {}
        return;
    }
    const padX = 8;
    const padTop = gnClampBp2PadTopPx();
    const padBottom = gnClampBp2PadBottomPx();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const br = bp2.getBoundingClientRect();
    const w = br.width || bp2.offsetWidth || 320;
    const h = br.height || bp2.offsetHeight || 200;
    let left = br.left;
    let top = br.top;
    const minL = padX;
    const maxL = Math.max(minL, vw - w - padX);
    const minT = padTop;
    const maxT = Math.max(minT, vh - h - padBottom);
    left = Math.min(Math.max(left, minL), maxL);
    top = Math.min(Math.max(top, minT), maxT);
    try {
        bp2.style.right = 'auto';
        bp2.style.bottom = 'auto';
        bp2.style.left = `${Math.round(left)}px`;
        bp2.style.top = `${Math.round(top)}px`;
        bp2.style.zIndex = '10025';
    } catch (_) {}
}

function scheduleClampBp2PanelIntoViewport() {
    const run = () => clampBp2PanelIntoViewport();
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 50);
    setTimeout(run, 340);
}

function installBp2ShowClampObserver() {
    if (typeof window !== 'undefined' && window.__gnBp2ShowClampObs) return;
    const attach = () => {
        const bp2 = document.getElementById('bp2');
        if (!bp2) return false;
        if (typeof window !== 'undefined' && window.__gnBp2ShowClampObs) return true;
        try {
            const mo = new MutationObserver(() => {
                if (bp2.classList.contains('bp2-fullhide')) return;
                scheduleClampBp2PanelIntoViewport();
            });
            mo.observe(bp2, { attributes: true, attributeFilter: ['class'] });
            if (typeof window !== 'undefined') window.__gnBp2ShowClampObs = mo;
            return true;
        } catch (_) {}
        return false;
    };
    if (!attach()) {
        const iv = setInterval(() => {
            if (attach()) clearInterval(iv);
        }, 250);
        setTimeout(() => {
            try {
                clearInterval(iv);
            } catch (_) {}
        }, 8000);
    }
}

export function installGnPanelDockObservers() {
    if (_bp2DockObsInstalled) return;
    _bp2DockObsInstalled = true;
    const boot = () => {
        const bp2 = document.getElementById('bp2');
        if (!bp2) return;
        try {
            installBp2ShowClampObserver();
            syncPedidosDockChip();
            const mo = new MutationObserver(() => syncPedidosDockChip());
            mo.observe(bp2, { attributes: true, attributeFilter: ['class'] });
        } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
}

function normalizarRubroCfg(tipo) {
    const t = String(tipo || '')
        .trim()
        .toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t === 'cooperativa de agua') return 'cooperativa_agua';
    if (t === 'cooperativa_electrica' || t === 'cooperativa eléctrica' || t === 'cooperativa electrica')
        return 'cooperativa_electrica';
    return null;
}

function businessTypeBroadcast() {
    const rub = normalizarRubroCfg(window.EMPRESA_CFG?.tipo);
    return (
        String(window.EMPRESA_CFG?.active_business_type || '').trim() ||
        (rub === 'cooperativa_agua' ? 'agua' : rub === 'municipio' ? 'municipio' : 'electricidad')
    );
}

function syncCommunityDock(root, st, modal) {
    const dock = ensureDock();
    const modalOpen = modal && modal.style.display === 'flex';
    const showChip = st.minimized || modalOpen;
    let chip = document.getElementById('gn-dock-chip-community');
    if (showChip) {
        if (!chip) {
            chip = document.createElement('button');
            chip.type = 'button';
            chip.id = 'gn-dock-chip-community';
            chip.className = 'gn-dock-chip gn-dock-chip--community';
            chip.setAttribute('aria-label', 'Aviso a la comunidad');
            chip.title = 'Aviso a la comunidad';
            chip.innerHTML = '<span aria-hidden="true">📢</span>';
            chip.title = 'Aviso a la comunidad (arrastrá para mover)';
            bindGnDockChipDrag(chip, () => {
                st.minimized = false;
                modal.style.display = 'flex';
                syncCommunityDock(root, st, modal);
                try {
                    modal.querySelector('#gn-bc-msg')?.focus?.();
                } catch (_) {}
            });
            dockInsertCommunityChip(chip, dock);
        }
        document.body.classList.add('gn-dock-community-active');
    } else {
        try {
            chip?.remove();
        } catch (_) {}
        document.body.classList.remove('gn-dock-community-active');
    }
    const btn = root.querySelector('#gn-fab-community-btn');
    const hideBtn = root.querySelector('#gn-fab-community-hide');
    const showFab = !st.minimized && !modalOpen;
    if (btn) btn.style.display = showFab ? '' : 'none';
    if (hideBtn) hideBtn.style.display = showFab ? '' : 'none';
}

/**
 * @param {{ esAdmin: () => boolean, getApiToken: () => string|null|undefined, asegurarJwtApiRest: () => Promise<unknown>, apiUrl: (path: string) => string }} deps
 */
export function initCommunityBroadcastFab(deps) {
    const { esAdmin, getApiToken, asegurarJwtApiRest, apiUrl } = deps;
    if (!esAdmin() || document.getElementById('gn-fab-community-root')) return;
    const root = document.createElement('div');
    root.id = 'gn-fab-community-root';
    root.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:9997;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-family:system-ui,sans-serif';
    root.innerHTML = `
<button type="button" id="gn-fab-community-hide" title="Minimizar (icono a la izquierda)" style="font-size:.7rem;padding:2px 6px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#475569">−</button>
<button type="button" id="gn-fab-community-btn" title="Aviso a la comunidad" style="width:52px;height:52px;border-radius:50%;border:none;background:#128C7E;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;font-size:1.35rem;touch-action:none">📢</button>
<div id="gn-fab-community-modal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9998;align-items:center;justify-content:center;padding:16px">
  <div style="background:var(--pa,#fff);color:var(--tx,#111);max-width:420px;width:100%;border-radius:12px;padding:1rem 1.1rem;box-shadow:0 12px 40px rgba(0,0,0,.25)">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Aviso masivo (WhatsApp)</h3>
    <p style="font-size:.78rem;margin:0 0 .65rem;color:var(--tm,#64748b)">Se envía a los teléfonos de contacto de <strong>pedidos</strong> del tenant y línea activa. Máx. ~10 msg/s. Requiere confirmación.</p>
    <label style="font-size:.78rem;font-weight:600">Título</label>
    <input id="gn-bc-titulo" type="text" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1" maxlength="120" />
    <label style="font-size:.78rem;font-weight:600">Mensaje <span style="color:#64748b">({ciudad} {fecha} {horario} {direccion} {telefono})</span></label>
    <textarea id="gn-bc-msg" rows="5" style="width:100%;margin:.2rem 0 .5rem;padding:.45rem;border-radius:8px;border:1px solid #cbd5e1"></textarea>
    <label style="font-size:.78rem;display:flex;align-items:center;gap:.35rem"><input type="checkbox" id="gn-bc-corte" /> Corte programado (solo electricidad/agua)</label>
    <div id="gn-bc-corte-fields" style="display:none;margin-top:.45rem;font-size:.78rem">
      <input id="gn-bc-zona" placeholder="Zona afectada" style="width:100%;margin:.25rem 0;padding:.35rem;border-radius:6px;border:1px solid #cbd5e1" />
      <input id="gn-bc-fi" type="datetime-local" style="width:100%;margin:.25rem 0;padding:.35rem" />
      <input id="gn-bc-ff" type="datetime-local" style="width:100%;margin:.25rem 0;padding:.35rem" />
      <input id="gn-bc-mot" placeholder="Motivo" style="width:100%;margin:.25rem 0;padding:.35rem;border-radius:6px;border:1px solid #cbd5e1" />
    </div>
    <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.6rem">
      <button type="button" id="gn-bc-cancel" class="ba2" style="background:#e2e8f0;border-color:#cbd5e1;color:#334155">Cancelar</button>
      <button type="button" id="gn-bc-send" class="ba2" style="background:#128C7E;color:#fff;border-color:#128C7E">Enviar</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(root);

    const st = { minimized: false };
    const btn = root.querySelector('#gn-fab-community-btn');
    const modal = root.querySelector('#gn-fab-community-modal');

    const closeModal = () => {
        modal.style.display = 'none';
        syncCommunityDock(root, st, modal);
    };

    const openModal = () => {
        modal.style.display = 'flex';
        syncCommunityDock(root, st, modal);
    };

    /** Arrastre con coordenadas correctas (fixed + right/bottom); clic sin movimiento abre modal. */
    let ptrDrag = null;
    btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const r = root.getBoundingClientRect();
        ptrDrag = {
            pid: e.pointerId,
            x0: e.clientX,
            y0: e.clientY,
            moved: false,
            sl: r.left,
            st: r.top,
        };
        try {
            btn.setPointerCapture(e.pointerId);
        } catch (_) {}
    });
    btn.addEventListener('pointermove', (e) => {
        if (!ptrDrag || e.pointerId !== ptrDrag.pid) return;
        const dx = Math.abs(e.clientX - ptrDrag.x0);
        const dy = Math.abs(e.clientY - ptrDrag.y0);
        if (dx + dy > 6) ptrDrag.moved = true;
        if (!ptrDrag.moved) return;
        e.preventDefault();
        let nl = ptrDrag.sl + (e.clientX - ptrDrag.x0);
        let nt = ptrDrag.st + (e.clientY - ptrDrag.y0);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rr = root.getBoundingClientRect();
        const w = rr.width || 56;
        const h = rr.height || 56;
        nl = Math.min(Math.max(8, nl), vw - w - 8);
        nt = Math.min(Math.max(8, nt), vh - h - 8);
        root.style.left = `${nl}px`;
        root.style.top = `${nt}px`;
        root.style.right = 'auto';
        root.style.bottom = 'auto';
    });
    btn.addEventListener('pointerup', (e) => {
        if (!ptrDrag || e.pointerId !== ptrDrag.pid) return;
        const moved = ptrDrag.moved;
        ptrDrag = null;
        try {
            btn.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (!moved) openModal();
    });
    btn.addEventListener('pointercancel', (e) => {
        ptrDrag = null;
        try {
            btn.releasePointerCapture(e.pointerId);
        } catch (_) {}
    });

    root.querySelector('#gn-fab-community-hide').onclick = () => {
        st.minimized = true;
        modal.style.display = 'none';
        syncCommunityDock(root, st, modal);
    };

    modal.querySelector('#gn-bc-cancel').onclick = () => {
        closeModal();
    };
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    const chkCorte = modal.querySelector('#gn-bc-corte');
    const corteFields = modal.querySelector('#gn-bc-corte-fields');
    chkCorte.addEventListener('change', () => {
        corteFields.style.display = chkCorte.checked ? 'block' : 'none';
    });
    modal.querySelector('#gn-bc-send').onclick = async () => {
        const titulo = (modal.querySelector('#gn-bc-titulo').value || '').trim();
        const mensaje = (modal.querySelector('#gn-bc-msg').value || '').trim();
        if (!mensaje) {
            toast('Completá el mensaje', 'warning');
            return;
        }
        if (!confirm('¿Confirmás el envío masivo por WhatsApp a los contactos de pedidos?')) return;
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) {
            toast('Sin sesión API', 'error');
            return;
        }
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
        const business_type = businessTypeBroadcast();
        try {
            if (chkCorte.checked) {
                const zona = (modal.querySelector('#gn-bc-zona').value || '').trim();
                const motivo = (modal.querySelector('#gn-bc-mot').value || '').trim();
                const fi = modal.querySelector('#gn-bc-fi').value;
                const ff = modal.querySelector('#gn-bc-ff').value;
                const r = await fetch(apiUrl('/api/whatsapp/broadcast/corte-programado'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        confirm: true,
                        business_type,
                        zona_afectada: zona,
                        motivo,
                        fecha_inicio: fi || null,
                        fecha_fin: ff || null,
                        mensaje,
                    }),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.error || d.detail || `HTTP ${r.status}`);
                toast('Corte programado enviado', 'success');
            } else {
                const r = await fetch(apiUrl('/api/whatsapp/broadcast/community'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ confirm: true, titulo, mensaje, business_type }),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.error || d.detail || `HTTP ${r.status}`);
                toast(`Enviado: ok ${d.enviados_ok}, error ${d.enviados_error}`, 'success');
            }
            closeModal();
        } catch (e) {
            toast(String(e.message || e), 'error');
        }
    };

    syncCommunityDock(root, st, modal);
}

if (typeof document !== 'undefined') {
    const bootDock = () => {
        try {
            installGnPanelDockObservers();
        } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootDock);
    else bootDock();
}
