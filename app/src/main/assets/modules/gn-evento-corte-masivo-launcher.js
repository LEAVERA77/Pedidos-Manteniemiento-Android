/**
 * Panel «Corte masivo» en #mapa-overlay-ui: minimizado al inicio, pestaña lateral, arrastre moui-card.
 * made by leavera77
 */
const CARD_ID = 'mapa-card-corte-masivo';
const TAB_ID = 'map-tab-corte-masivo';
const LS_SLID = 'pmg_map_corte_masivo_slid';

function hideCorteSlideoff() {
    if (typeof window.toggleMapaCardSlideoff === 'function') {
        window.toggleMapaCardSlideoff(CARD_ID, true);
        return;
    }
    const root = document.getElementById(CARD_ID);
    const tab = document.getElementById(TAB_ID);
    if (root) root.classList.add('moui-card-slideoff');
    if (tab) tab.classList.add('visible');
    try {
        localStorage.setItem(LS_SLID, '1');
    } catch (_) {}
}

function showCorteSlideoff() {
    if (typeof window.toggleMapaCardSlideoff === 'function') {
        window.toggleMapaCardSlideoff(CARD_ID, false);
        return;
    }
    const root = document.getElementById(CARD_ID);
    const tab = document.getElementById(TAB_ID);
    if (root) root.classList.remove('moui-card-slideoff');
    if (tab) tab.classList.remove('visible');
    try {
        localStorage.setItem(LS_SLID, '0');
    } catch (_) {}
}

function ensureMapTab() {
    const cluster = document.getElementById('map-slide-tabs-cluster');
    if (!cluster || document.getElementById(TAB_ID)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = TAB_ID;
    btn.className = 'map-slide-tab map-slide-tab--corte';
    btn.textContent = 'Corte';
    btn.title = 'Evento de corte masivo (tormenta / sector)';
    btn.onclick = () => showCorteSlideoff();
    const colores = document.getElementById('map-tab-colores');
    if (colores && colores.parentElement === cluster) {
        if (colores.nextSibling) cluster.insertBefore(btn, colores.nextSibling);
        else cluster.appendChild(btn);
    } else {
        cluster.appendChild(btn);
    }
}

function ensureCard(onOpen) {
    const overlay = document.getElementById('mapa-overlay-ui');
    if (!overlay) return null;

    try {
        document.getElementById('gn-evento-corte-root')?.remove();
        document.getElementById('gn-evento-corte-fab')?.remove();
    } catch (_) {}

    let root = document.getElementById(CARD_ID);
    if (!root) {
        root = document.createElement('div');
        root.id = CARD_ID;
        root.className = 'moui-card moui-card-slideoff gn-evento-corte-launcher';
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Evento de corte masivo');
        root.innerHTML = `
  <div class="moui-hd">
    <i class="fas fa-grip-vertical moui-drag-handle" title="Arrastrar desde la barra"></i>
    <i class="fas fa-cloud-bolt" aria-hidden="true" style="color:#dc2626"></i>
    <span style="font-weight:700;flex:1;min-width:0">Corte masivo</span>
    <button type="button" class="ib-mini" title="Ocultar panel" onclick="event.stopPropagation();toggleMapaCardSlideoff('${CARD_ID}',true)"><i class="fas fa-eye-slash"></i></button>
  </div>
  <div class="moui-bd gn-evento-corte-masivo-bd">
    <p class="gn-evento-corte-hint">Tormenta o corte de sector: agrupá reclamos y asigná un técnico.</p>
    <button type="button" class="bp gn-evento-corte-open"><i class="fas fa-bolt"></i> Iniciar evento</button>
  </div>`;
        overlay.appendChild(root);
        root.querySelector('.gn-evento-corte-open')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof onOpen === 'function') onOpen();
        });
    }
    return root;
}

function initMouiDragWhenReady() {
    const run = () => {
        try {
            if (typeof window.initMouiCardDraggable === 'function') {
                window.initMouiCardDraggable(CARD_ID);
            }
        } catch (_) {}
    };
    if (typeof window.initMouiCardDraggable === 'function') run();
    else {
        document.addEventListener('gn-ms-visible', run, { once: true });
        setTimeout(run, 800);
    }
}

function syncCorteFromStorage() {
    try {
        if (localStorage.getItem(LS_SLID) === null) localStorage.setItem(LS_SLID, '1');
    } catch (_) {}
    if (typeof window.syncMapSlideTabsFromStorage === 'function') {
        window.syncMapSlideTabsFromStorage();
        return;
    }
    const root = document.getElementById(CARD_ID);
    const tab = document.getElementById(TAB_ID);
    const slid = (() => {
        try {
            return localStorage.getItem(LS_SLID) !== '0';
        } catch (_) {
            return true;
        }
    })();
    if (root) root.classList.toggle('moui-card-slideoff', slid);
    if (tab) tab.classList.toggle('visible', slid);
}

/**
 * @param {{ visible: boolean, onOpen: () => void }} opts
 */
export function ensureCorteMasivoLauncher(opts) {
    const { visible, onOpen } = opts;
    const root = document.getElementById(CARD_ID);
    const tab = document.getElementById(TAB_ID);

    if (!visible) {
        if (root) root.style.display = 'none';
        if (tab) tab.style.display = 'none';
        try {
            document.body.classList.remove('gn-dock-corte-masivo-active');
        } catch (_) {}
        return null;
    }

    ensureCard(onOpen);
    ensureMapTab();
    const card = document.getElementById(CARD_ID);
    const tabEl = document.getElementById(TAB_ID);
    if (card) card.style.display = 'block';
    if (tabEl) tabEl.style.display = '';
    syncCorteFromStorage();
    initMouiDragWhenReady();
    return card;
}

export function syncCorteMasivoLauncher() {
    const card = document.getElementById(CARD_ID);
    if (!card || card.style.display === 'none') return;
    syncCorteFromStorage();
}
