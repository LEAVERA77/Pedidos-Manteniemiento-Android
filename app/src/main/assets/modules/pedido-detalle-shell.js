/**
 * Esqueleto persistente de #dmc: se monta una vez por sesión; el contenido se hidrata por sección.
 * made by leavera77
 */

export const GN_DM_SHELL_ATTR = 'data-gn-dm-shell-mounted';

const SHELL_HTML = `
<div class="gn-dm-detail-scroll">
    <div class="ds gn-dm-block-info" data-gn-dm-block="info" data-gn-dm-section="info"></div>
    <div class="ds" data-gn-dm-section="trabajo"></div>
    <div id="dm-opinion-cliente-host" data-gn-dm-section="opinion"></div>
    <div data-gn-dm-section="derivacion"></div>
    <div data-gn-dm-section="cierre" hidden></div>
    <div class="ds" id="materiales-detalle-wrap" data-gn-dm-section="materiales" data-pid="" hidden>
        <h4>🔧 Materiales</h4>
        <div id="materiales-detalle-body"><p style="font-size:.8rem;color:var(--tl)">Cargando…</p></div>
    </div>
    <div class="ds" data-gn-dm-section="ubicacion"></div>
    <div data-gn-dm-section="top3"></div>
    <div data-gn-dm-section="auditoria"></div>
    <div data-gn-dm-section="fotos"></div>
</div>
<div class="gn-dm-actions-bar">
    <div class="da" data-gn-dm-section="acciones"></div>
</div>`;

/**
 * Monta el shell vacío en #dmc si aún no existe (único innerHTML masivo de #dmc por sesión).
 * @returns {boolean}
 */
export function ensureDetallePedidoShellMounted() {
    const dmc = document.getElementById('dmc');
    if (!dmc) return false;
    if (dmc.getAttribute(GN_DM_SHELL_ATTR) === '1') return true;
    dmc.innerHTML = SHELL_HTML;
    dmc.setAttribute(GN_DM_SHELL_ATTR, '1');
    return true;
}

/** @param {string} name */
export function queryDetalleSection(name) {
    return document.querySelector(`#dmc [data-gn-dm-section="${name}"]`);
}
