/**
 * HTML derivación / terceros en modal detalle de pedido.
 * made by leavera77
 */

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setPedidoDetalleDerivacionHtmlDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function d(k) {
    const v = _deps?.[k];
    return typeof v === 'function' ? v : () => v;
}

export function htmlSolicitudDerivacionCoopElectricaTecnico(p) {
    if (!d("esTecnicoOSupervisor")() || d("esAdmin")()) return '';
    if (!d("debeMostrarBotonDerivacion")(p)) return '';
    if (d("pedidoEsDerivadoFuera")(p)) return '';
    const esN = d("normalizarEstadoPedidoUi")(p?.es);
    const esOk = esN === 'Asignado' || esN === 'En ejecución';
    if (!esOk) return '';
    const uid = String((_deps?.getAppUser?.() || {})?.id ?? '');
    if (p.tai == null || String(p.tai) !== uid) return '';
    const escD = (t) => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const pidEsc = String(p.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    let borradorTec = '';
    try {
        borradorTec = sessionStorage.getItem('gn-tec-deriv-motivo-' + p.id) || '';
    } catch (_) {}
    const taIniTec = borradorTec ? escD(borradorTec) : '';
    if (p.sdpen) {
        const fxs = p.sdf ? d("fmtInformeFecha")(p.sdf) : '—';
        return `<div class="ds" style="border-left:4px solid #f59e0b">
            <h4>⏳ Derivación a terceros — solicitud enviada</h4>
            <p style="font-size:.8rem;color:var(--tm);margin:0;line-height:1.45">El administrador debe aprobar la derivación operativa. Mientras tanto no podés cargar materiales en este pedido.</p>
            <p style="font-size:.76rem;color:var(--tl);margin:.45rem 0 0">${escD(p.sdm || 'Sin motivo breve')}</p>
            <p style="font-size:.72rem;color:var(--tl);margin:.35rem 0 0">Pedida: ${escD(fxs)}</p>
        </div>`;
    }
    return `<div class="ds" style="border-left:4px solid #6366f1">
        <h4>🛠 Solicitar derivación a terceros</h4>
        <p style="font-size:.78rem;color:var(--tm);margin:0 0 .55rem;line-height:1.45">Si el reclamo corresponde a otra empresa (gas, agua, etc.), pedí la derivación. El <strong>administrador</strong> la confirma y arma el mismo texto que se envía por WhatsApp al contacto configurado.</p>
        <label style="font-size:.76rem;font-weight:600">Observaciones de campo <span style="color:var(--re)">*</span> <span style="font-weight:500;color:var(--tl)">(mín. 8 caracteres)</span></label>
        <textarea id="tec-sol-deriv-motivo-${p.id}" rows="3" maxlength="2000" style="width:100%;margin:.25rem 0 .55rem;padding:.45rem;border:1px solid var(--bo);border-radius:.45rem;resize:vertical" placeholder="Obligatorio: qué viste en visita y por qué corresponde derivar (ej.: cable de otra distribuidora, riesgo en vía pública a cargo de otro organismo…).">${taIniTec}</textarea>
        <button type="button" class="ba2 p2" onclick="solicitarDerivacionTerceroDesdeTecnico('${pidEsc}')"><i class="fas fa-paper-plane"></i> Enviar solicitud al administrador</button>
    </div>`;
}

/** Bloque en detalle de pedido: enlaces wa.me a terceros (municipio, agua, eléctrica); admin y supervisor. */
export function htmlDerivacionTercerosPedidoDetalle() {
    if (!(d("esAdmin")() || d("esTecnicoOSupervisor")())) return '';
    const escD = (t) => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const slots = [
        { key: 'energia', def: 'Empresa de energía' },
        { key: 'agua', def: 'Cooperativa de agua' },
    ];
    const links = [];
    for (const { key, def } of slots) {
        const url = d("obtenerWaMeUrlDerivacionEmpresaCfg")(key);
        if (!url) continue;
        const nom = String((window.EMPRESA_CFG?.derivaciones || {})[key]?.nombre || '').trim() || def;
        const href = String(url).replace(/"/g, '&quot;');
        links.push(
            `<a class="ba2" style="display:inline-block;margin:.25rem .5rem .25rem 0;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${href}"><i class="fab fa-whatsapp"></i> Contactar ${escD(nom)}</a>`
        );
    }
    // No exigir rubro normalizado: si `tipo` en BD quedó legacy tras el wizard, igual mostramos contactos configurados.
    if (!links.length) return '';
    const labPer = escD(d("etiquetaFirmaPersona")());
    return `<div class="ds gn-deriv-terceros-pedido">
            <h4>📞 Derivación a terceros</h4>
            <p style="font-size:.76rem;color:var(--tm);margin:0 0 .5rem;line-height:1.4">Contactos configurados en <strong>Admin → Empresa</strong> para orientar al ${labPer}. <strong>No</strong> son el número Meta del bot.</p>
            ${links.join('')}
        </div>`;
}

