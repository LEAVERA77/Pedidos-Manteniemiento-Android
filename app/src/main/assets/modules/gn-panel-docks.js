/**
 * Dock izquierdo para paneles minimizados (Pedidos, aviso comunidad) + FAB comunidad robusto.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

/**
 * Consulta GET /api/whatsapp/broadcast/status/:id hasta que termine (envío en segundo plano).
 * made by leavera77
 */
async function pollBroadcastJobStatus(comunicacionId) {
    const apiUrl = typeof window.apiUrl === 'function' ? window.apiUrl : (p) => p;
    const getToken = () => (typeof window.getApiToken === 'function' ? window.getApiToken() : null);
    const asegurar =
        typeof window.asegurarJwtApiRest === 'function' ? window.asegurarJwtApiRest : async () => {};
    const max = 400;
    const delayMs = 10000;
    for (let i = 0; i < max; i++) {
        await new Promise((r) => setTimeout(r, delayMs));
        const tok = getToken();
        if (!tok) break;
        try {
            const r = await fetch(apiUrl(`/api/whatsapp/broadcast/status/${comunicacionId}`), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) continue;
            const st = d.broadcast_status;
            if (st === 'done' || st === 'error') {
                toast(
                    `Aviso masivo finalizado: ${d.enviados_ok ?? 0} enviados, ${d.enviados_error ?? 0} error(es).`,
                    st === 'error' ? 'warning' : 'success'
                );
                void maybeToastBroadcastMetricsLow(apiUrl, asegurar, getToken);
                return;
            }
        } catch (_) {}
    }
    toast('El envío masivo puede seguir en curso (ritmo lento anti-bloqueo). Revisá más tarde.', 'info');
}

async function maybeToastBroadcastMetricsLow(apiUrl, asegurarJwtApiRest, getApiToken) {
    try {
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) return;
        const r = await fetch(apiUrl('/api/whatsapp/broadcast/metrics'), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) return;
        if (d.low_ratio_alert) {
            toast(
                `Atención: ratio de respuestas bajo varios días (promedio 7d: ${d.metrics_avg_ratio_7d ?? '—'}%). Revisá contenido y frecuencia. Guía: ${d.guide_url || ''}`,
                'warning'
            );
        }
    } catch (_) {}
}

async function refreshBroadcastComplianceBanner(modal, { asegurarJwtApiRest, getApiToken, apiUrl }) {
    const el = modal.querySelector('#gn-bc-compliance');
    if (!el) return;
    try {
        el.style.display = 'none';
        el.textContent = '';
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) return;
        const r = await fetch(apiUrl('/api/whatsapp/broadcast/metrics'), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) return;
        const parts = [];
        if (d.warmup?.is_warming) {
            parts.push(
                `⚠️ Warm-up Whapi: día ${d.warmup.days_since_activation ?? '?'}/${d.warmup.days_required}. Evitá mailings agresivos hasta completar el período.`
            );
            try {
                window._gnBcWarmupConfirm = `Warm-up activo (${d.warmup.days_since_activation ?? '?'}/${d.warmup.days_required} días). Confirmá solo si el mensaje es necesario y acotado.`;
            } catch (_) {}
        } else {
            try {
                window._gnBcWarmupConfirm = '';
            } catch (_) {}
        }
        if (d.low_ratio_alert) {
            parts.push(
                `⚠️ Ratio de respuestas bajo (promedio 7d: ${d.metrics_avg_ratio_7d ?? '—'}%). Mejorá interacción o pausá campañas.`
            );
        }
        if (d.guards?.local_window && d.guards.in_window === false) {
            parts.push(
                `⏱️ Fuera de la ventana horaria de masivos (${d.guards.local_window}, ${d.guards.local_tz}). Hora local: ${d.guards.local_time_hhmm}.`
            );
        }
        if (d.guards?.block_on_low_ratio) {
            parts.push(
                '🔒 El servidor puede bloquear nuevos masivos si el ratio sigue bajo (WHAPI_BROADCAST_BLOCK_ON_LOW_RATIO).'
            );
        }
        const guia = d.guide_url || 'https://support.whapi.cloud/help-desk/blocking/how-to-do-mailings-without-the-risk-of-being-blocked';
        parts.push(`📖 Guía anti-baneo Whapi: ${guia}`);
        if (parts.length) {
            el.innerHTML = parts.map((p) => `<div style="margin:.2rem 0">${p}</div>`).join('');
            el.style.display = 'block';
        }
    } catch (_) {}
}

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
            const filtrosTab = document.getElementById('map-tab-filtros');
            if (filtrosTab && filtrosTab.parentElement === cluster) {
                filtrosTab.insertAdjacentElement('afterend', host);
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
                try {
                    const fn = root.__gnCommunityOnShow;
                    if (typeof fn === 'function') fn();
                } catch (_) {}
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
<button type="button" id="gn-fab-community-btn" title="Aviso a la comunidad" style="width:52px;height:52px;border-radius:50%;border:none;background:#128C7E;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;font-size:1.35rem;touch-action:manipulation">📢</button>
<div id="gn-fab-community-modal" style="display:none;position:fixed;inset:0;z-index:9998;padding:16px;pointer-events:none">
  <div id="gn-bc-panel" style="pointer-events:auto;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--pa,#fff);color:var(--tx,#111);max-width:540px;width:94%;border-radius:14px;padding:1.1rem 1.25rem;box-shadow:0 16px 48px rgba(0,0,0,.3);touch-action:none">
    <div id="gn-bc-drag-handle" style="cursor:grab;display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;user-select:none">
      <h3 style="margin:0;font-size:1.05rem">Aviso masivo (WhatsApp)</h3>
      <span style="font-size:.7rem;color:var(--tm,#94a3b8);letter-spacing:.03em">Arrastrá para mover</span>
    </div>
    <p style="font-size:.78rem;margin:0 0 .65rem;color:var(--tm,#64748b)">Se envía a los teléfonos de contacto de <strong>pedidos</strong> del tenant y línea activa. Máx. ~10 msg/s. Requiere confirmación.</p>
    <div id="gn-bc-compliance" style="display:none;font-size:.74rem;margin:0 0 .65rem;padding:.5rem .55rem;border-radius:8px;border:1px solid #e2e8f0;background:#f1f5f9;color:#334155"></div>
    <label style="font-size:.78rem;font-weight:600">Estilo del aviso</label>
    <div style="display:flex;gap:.35rem;align-items:center;margin:.2rem 0 .5rem">
      <input id="gn-bc-titulo" type="text" style="flex:1;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1" maxlength="500" placeholder="Ej: Inundaciones, Corte de agua, Fiesta patronal…" />
      <button type="button" id="gn-bc-ia" title="Generar mensaje con IA" style="flex-shrink:0;padding:.4rem .65rem;border-radius:8px;border:1px solid #a78bfa;background:#f5f3ff;color:#7c3aed;cursor:pointer;font-size:.82rem;font-weight:600;display:flex;align-items:center;gap:.25rem">✨ IA</button>
    </div>
    <label style="font-size:.78rem;font-weight:600">Mensaje</label>
    <textarea id="gn-bc-msg" rows="8" style="width:100%;margin:.2rem 0 .5rem;padding:.45rem;border-radius:8px;border:1px solid #cbd5e1;resize:vertical" placeholder="Escribí o generá con IA…"></textarea>
    <div id="gn-bc-firma-preview" style="font-size:.72rem;color:var(--tm,#64748b);margin-bottom:.5rem;font-style:italic"></div>
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
    const bcPanel = modal.querySelector('#gn-bc-panel');

    const closeModal = () => {
        modal.style.display = 'none';
        syncCommunityDock(root, st, modal);
    };

    function openModal() {
        modal.style.display = 'block';
        try {
            const fn = root.__gnCommunityOnShow;
            if (typeof fn === 'function') fn();
        } catch (_) {}
        syncCommunityDock(root, st, modal);
    }

    /* --- Drag del panel interior (como otros paneles) --- */
    let panelDrag = null;
    const dragHandle = modal.querySelector('#gn-bc-drag-handle');
    if (dragHandle && bcPanel) {
        dragHandle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const r = bcPanel.getBoundingClientRect();
            panelDrag = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, sl: r.left, st: r.top, moved: false };
            bcPanel.style.transform = 'none';
            bcPanel.style.left = `${r.left}px`;
            bcPanel.style.top = `${r.top}px`;
            try { dragHandle.setPointerCapture(e.pointerId); } catch (_) {}
        });
        dragHandle.addEventListener('pointermove', (e) => {
            if (!panelDrag || e.pointerId !== panelDrag.pid) return;
            if (e.cancelable) e.preventDefault();
            panelDrag.moved = true;
            let nl = panelDrag.sl + (e.clientX - panelDrag.x0);
            let nt = panelDrag.st + (e.clientY - panelDrag.y0);
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const pw = bcPanel.offsetWidth || 420;
            const ph = bcPanel.offsetHeight || 300;
            nl = Math.min(Math.max(4, nl), vw - pw - 4);
            nt = Math.min(Math.max(4, nt), vh - ph - 4);
            bcPanel.style.left = `${Math.round(nl)}px`;
            bcPanel.style.top = `${Math.round(nt)}px`;
        });
        dragHandle.addEventListener('pointerup', (e) => {
            if (!panelDrag || e.pointerId !== panelDrag.pid) return;
            panelDrag = null;
            try { dragHandle.releasePointerCapture(e.pointerId); } catch (_) {}
        });
        dragHandle.addEventListener('pointercancel', (e) => {
            panelDrag = null;
            try { dragHandle.releasePointerCapture(e.pointerId); } catch (_) {}
        });
    }

    /* --- Firma automática según tipo de negocio y nombre del tenant --- */
    function obtenerFirmaTenant() {
        const cfg = window.EMPRESA_CFG || {};
        const nombre = String(cfg.nombre || '').trim();
        if (!nombre) return '';
        const low = nombre.toLowerCase();
        const rub = normalizarRubroCfg(cfg.tipo);
        if (rub === 'municipio') return low.startsWith('municipalidad') ? nombre : `Municipalidad de ${nombre}`;
        if (rub === 'cooperativa_agua') return low.startsWith('cooperativa') ? nombre : `Cooperativa de Agua ${nombre}`;
        if (rub === 'cooperativa_electrica') return low.startsWith('cooperativa') ? nombre : `Cooperativa Eléctrica ${nombre}`;
        return nombre;
    }

    function actualizarFirmaPreview() {
        const el = modal.querySelector('#gn-bc-firma-preview');
        if (!el) return;
        const firma = obtenerFirmaTenant();
        el.textContent = firma ? `Firma automática al final: ${firma}` : '';
    }

    root.__gnCommunityOnShow = () => {
        actualizarFirmaPreview();
        void refreshBroadcastComplianceBanner(modal, { asegurarJwtApiRest, getApiToken, apiUrl });
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
    modal.querySelector('#gn-bc-ia').onclick = async () => {
        const titulo = (modal.querySelector('#gn-bc-titulo').value || '').trim();
        if (!titulo) {
            toast('Escribí el estilo del aviso primero (ej: Inundaciones, Fiesta patronal)', 'warning');
            modal.querySelector('#gn-bc-titulo').focus();
            return;
        }
        const btnIa = modal.querySelector('#gn-bc-ia');
        btnIa.disabled = true;
        btnIa.textContent = '⏳…';
        try {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) throw new Error('Sin sesión');
            const cfg = window.EMPRESA_CFG || {};
            const tipo_negocio = cfg.tipo || 'municipio';
            const nombre_tenant = String(cfg.nombre || '').trim();
            const r = await fetch(apiUrl('/api/ia/generar-aviso'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                body: JSON.stringify({ titulo, tipo_negocio, nombre_tenant }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
            const telCfg = document.getElementById('cfg-telefono');
            let msg = d.mensaje || '';
            if (telCfg && telCfg.value) {
                msg = msg.replace(/\{telefono\}/g, telCfg.value.trim());
            }
            const firma = obtenerFirmaTenant();
            if (firma && !msg.includes(firma)) {
                msg = msg.trimEnd() + '\n\n' + firma;
            }
            modal.querySelector('#gn-bc-msg').value = msg;
            toast('Mensaje generado. Editalo si hace falta.', 'success');
        } catch (e) {
            toast('IA: ' + String(e.message || e), 'error');
        } finally {
            btnIa.disabled = false;
            btnIa.innerHTML = '✨ IA';
        }
    };

    modal.querySelector('#gn-bc-send').onclick = async () => {
        const titulo = (modal.querySelector('#gn-bc-titulo').value || '').trim();
        let mensaje = (modal.querySelector('#gn-bc-msg').value || '').trim();
        if (!mensaje) {
            toast('Completá el mensaje', 'warning');
            return;
        }
        const firma = obtenerFirmaTenant();
        if (firma && !mensaje.includes(firma)) {
            mensaje = mensaje + '\n\n' + firma;
        }
        const warmExtra =
            typeof window._gnBcWarmupConfirm === 'string' && window._gnBcWarmupConfirm.trim()
                ? '\n\n' + window._gnBcWarmupConfirm.trim()
                : '';
        if (!confirm('¿Confirmás el envío masivo por WhatsApp a los contactos de pedidos?' + warmExtra)) return;
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) {
            toast('Sin sesión API', 'error');
            return;
        }
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
        const business_type = businessTypeBroadcast();
        try {
            const r = await fetch(apiUrl('/api/whatsapp/broadcast/community'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ confirm: true, titulo, mensaje, business_type }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || d.detail || `HTTP ${r.status}`);
            if (r.status === 202 && d.async && d.comunicacion_id) {
                toast(
                    `Envío masivo iniciado en segundo plano (${d.destinatarios} destinatarios, ritmo seguro). Te avisamos al terminar.`,
                    'success'
                );
                if (d.warmup_warning) toast(String(d.warmup_warning), 'warning');
                closeModal();
                void pollBroadcastJobStatus(Number(d.comunicacion_id));
                return;
            }
            toast(`Enviado: ok ${d.enviados_ok}, error ${d.enviados_error}`, 'success');
            if (d.warmup_warning) toast(String(d.warmup_warning), 'warning');
            closeModal();
            void maybeToastBroadcastMetricsLow(apiUrl, asegurarJwtApiRest, getApiToken);
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
