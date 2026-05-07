/**
 * Toolbar pedidos (admin): desestimados / derivados fuera / solo agrupados — como máximo uno activo.
 * Claves localStorage deben coincidir con app.js (LS_MOSTRAR_* / LS_SOLO_*).
 */

const LS_DERIV = 'pmg_pedidos_mostrar_derivados_fuera';
const LS_DESEST = 'pmg_pedidos_mostrar_desestimados_lista';
const LS_SOLO_AG = 'pmg_pedidos_solo_agrupados_incidencia_lista';

const ID_DERIV = 'chk-mostrar-derivados-fuera';
const ID_DESEST = 'chk-lista-mostrar-desestimados';
const ID_SOLO_AG = 'chk-lista-solo-agrupados-incidencia';

const LS_POR_ID = {
    [ID_DERIV]: LS_DERIV,
    [ID_DESEST]: LS_DESEST,
    [ID_SOLO_AG]: LS_SOLO_AG,
};

function _lsSet(key, on) {
    try {
        localStorage.setItem(key, on ? '1' : '0');
    } catch (_) {}
}

function _lsRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (_) {}
}

function _lsOn(key) {
    try {
        return localStorage.getItem(key) === '1';
    } catch (_) {
        return false;
    }
}

function _els() {
    const deriv = document.getElementById(ID_DERIV);
    const desest = document.getElementById(ID_DESEST);
    const soloAg = document.getElementById(ID_SOLO_AG);
    if (!deriv || !desest || !soloAg) return null;
    return { deriv, desest, soloAg };
}

/**
 * Si había más de un LS en "1", prioridad: desestimados > derivados > solo agrupados.
 */
export function syncPedidosToolbarFiltrosExclusivosFromLs(esAdminBool) {
    const els = _els();
    if (!els) return;
    if (!esAdminBool) {
        _lsRemove(LS_DERIV);
        _lsRemove(LS_DESEST);
        _lsRemove(LS_SOLO_AG);
        els.deriv.checked = false;
        els.desest.checked = false;
        els.soloAg.checked = false;
        return;
    }
    let vD = _lsOn(LS_DERIV);
    let vDes = _lsOn(LS_DESEST);
    let vAg = _lsOn(LS_SOLO_AG);
    const n = (vD ? 1 : 0) + (vDes ? 1 : 0) + (vAg ? 1 : 0);
    if (n > 1) {
        if (vDes) {
            vD = false;
            vAg = false;
        } else if (vD) {
            vAg = false;
        } else {
            /* solo vAg */
        }
        _lsSet(LS_DERIV, vD);
        _lsSet(LS_DESEST, vDes);
        _lsSet(LS_SOLO_AG, vAg);
    }
    els.deriv.checked = vD;
    els.desest.checked = vDes;
    els.soloAg.checked = vAg;
}

function _persistDesdeChecks(derivOn, desestOn, soloAgOn) {
    _lsSet(LS_DERIV, derivOn);
    _lsSet(LS_DESEST, desestOn);
    _lsSet(LS_SOLO_AG, soloAgOn);
}

/**
 * @param {() => void} [onAfter] — p. ej. render + renderMk
 */
export function initPedidosToolbarFiltrosExclusivos(onAfter) {
    const toolbar = document.querySelector('.gn-bp2-toolbar');
    if (!toolbar) return;
    toolbar.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t || t.type !== 'checkbox' || !LS_POR_ID[t.id]) return;
        const els = _els();
        if (!els) return;
        if (t.checked) {
            if (t !== els.deriv) els.deriv.checked = false;
            if (t !== els.desest) els.desest.checked = false;
            if (t !== els.soloAg) els.soloAg.checked = false;
            _persistDesdeChecks(els.deriv.checked, els.desest.checked, els.soloAg.checked);
        } else {
            _lsSet(LS_POR_ID[t.id], false);
        }
        try {
            if (typeof onAfter === 'function') onAfter();
        } catch (_) {}
    });
}
