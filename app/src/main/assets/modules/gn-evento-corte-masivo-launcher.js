/**
 * Panel lateral «Corte masivo» (moui-card): izquierda, arrastrable, ocultable con chip en dock.
 * made by leavera77
 */
import { ensureGnMapDock, bindGnDockChipDrag } from './gn-panel-docks.js';

const CARD_ID = 'gn-evento-corte-root';
const LS_SLIDEOFF = 'pmg_evento_corte_slideoff';

/** @type {{ slideoff: boolean }} */
const _st = { slideoff: false };

function dockInsertCorteChip(chip, dock) {
    const comm = document.getElementById('gn-dock-chip-community');
    if (comm && comm.parentElement === dock) {
        if (comm.nextSibling) dock.insertBefore(chip, comm.nextSibling);
        else dock.appendChild(chip);
        return;
    }
    const ped = document.getElementById('gn-dock-chip-pedidos');
    if (ped && ped.parentElement === dock) {
        if (ped.nextSibling) dock.insertBefore(chip, ped.nextSibling);
        else dock.appendChild(chip);
        return;
    }
    dock.appendChild(chip);
}

function syncCorteMasivoDock(onRestore) {
    const dock = ensureGnMapDock();
    let chip = document.getElementById('gn-dock-chip-corte-masivo');
    if (_st.slideoff) {
        if (!chip) {
            chip = document.createElement('button');
            chip.type = 'button';
            chip.id = 'gn-dock-chip-corte-masivo';
            chip.className = 'gn-dock-chip gn-dock-chip--corte-masivo';
            chip.setAttribute('aria-label', 'Evento de corte masivo');
            chip.title = 'Corte masivo (arrastrá para mover)';
            chip.innerHTML =
                '<span aria-hidden="true">⚡</span><span class="gn-dock-chip-label">Corte</span>';
            bindGnDockChipDrag(chip, () => {
                _st.slideoff = false;
                try {
                    localStorage.setItem(LS_SLIDEOFF, '0');
                } catch (_) {}
                syncCorteMasivoLauncher(onRestore);
            });
            dockInsertCorteChip(chip, dock);
        }
        document.body.classList.add('gn-dock-corte-masivo-active');
    } else {
        try {
            chip?.remove();
        } catch (_) {}
        document.body.classList.remove('gn-dock-corte-masivo-active');
    }
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
        setTimeout(run, 1200);
    }
}

/**
 * @param {{ visible: boolean, onOpen: () => void }} opts
 */
export function ensureCorteMasivoLauncher(opts) {
    const { visible, onOpen } = opts;
    let root = document.getElementById(CARD_ID);
    try {
        document.getElementById('gn-evento-corte-fab')?.remove();
    } catch (_) {}
    if (!root) {
        root = document.createElement('div');
        root.id = CARD_ID;
        root.className = 'moui-card gn-evento-corte-launcher';
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Evento de corte masivo');
        root.innerHTML = `
  <div class="moui-hd" title="Arrastrá desde la barra para mover">
    <i class="fas fa-grip-vertical moui-drag-handle" aria-hidden="true"></i>
    <i class="fas fa-cloud-bolt" aria-hidden="true" style="color:#dc2626"></i>
    <span style="font-weight:700;flex:1;min-width:0">Corte masivo</span>
    <button type="button" class="ib-mini gn-evento-corte-hide" title="Ocultar panel (icono a la izquierda)" aria-label="Ocultar">
      <i class="fas fa-eye-slash"></i>
    </button>
  </div>
  <div class="moui-bd" style="padding:.45rem .55rem .55rem">
    <p style="font-size:.7rem;color:var(--tm);margin:0 0 .45rem;line-height:1.3">Tormenta o corte de sector: agrupá reclamos y asigná un técnico.</p>
    <button type="button" class="bp gn-evento-corte-open" style="width:100%;font-size:.78rem;background:#dc2626;border-color:#b91c1c">
      <i class="fas fa-bolt"></i> Iniciar evento
    </button>
  </div>`;
        document.body.appendChild(root);
        root.querySelector('.gn-evento-corte-hide')?.addEventListener('click', (e) => {
            e.stopPropagation();
            _st.slideoff = true;
            try {
                localStorage.setItem(LS_SLIDEOFF, '1');
            } catch (_) {}
            syncCorteMasivoLauncher(onOpen);
        });
        root.querySelector('.gn-evento-corte-open')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof onOpen === 'function') onOpen();
        });
        try {
            _st.slideoff = localStorage.getItem(LS_SLIDEOFF) === '1';
        } catch (_) {
            _st.slideoff = false;
        }
        initMouiDragWhenReady();
    }
    root.style.display = visible ? 'block' : 'none';
    root.classList.toggle('moui-card-slideoff', !!_st.slideoff && visible);
    syncCorteMasivoDock(onOpen);
    return root;
}

export function syncCorteMasivoLauncher(onOpen) {
    const root = document.getElementById(CARD_ID);
    if (!root) return;
    root.classList.toggle('moui-card-slideoff', !!_st.slideoff);
    syncCorteMasivoDock(onOpen);
}
