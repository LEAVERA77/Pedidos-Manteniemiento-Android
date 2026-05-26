/**
 * Valoración WhatsApp + descargo de la empresa (todos los rubros).
 * Provincia / CP por reverse Nominatim si faltan y hay coordenadas.
 * made by leavera77
 */

import {
    inferirProvinciaCpDetallePedidoSiFalta,
    pedidoNecesitaInferirProvinciaCp,
    coordsPedidoParaReverse,
} from './pedido-detalle-infer-ubicacion-nominatim.js';

let _deps = null;
let _boundSave = false;

export function setPedidoOpinionClienteUiDeps(deps) {
    _deps = deps || null;
}

function esAdminUi() {
    try {
        return typeof _deps?.esAdmin === 'function' && _deps.esAdmin();
    } catch (_) {
        return false;
    }
}

function fmtFechaOpinion(v) {
    if (v == null || v === '') return '';
    try {
        if (typeof _deps?.fmtInformeFecha === 'function') return _deps.fmtInformeFecha(v);
    } catch (_) {}
    return String(v);
}

function mapDescargoPedido(p) {
    const v = p?.odesc ?? p?.opinion_descargo_empresa;
    if (v == null || v === '') return '';
    return String(v).trim();
}

function depsInferUbicacion() {
    if (!_deps) return null;
    const app = typeof _deps.getApp === 'function' ? _deps.getApp() : _deps.app;
    return {
        app,
        NEON_OK: _deps.NEON_OK,
        modoOffline: typeof _deps.modoOffline === 'function' ? _deps.modoOffline() : !!_deps.modoOffline,
        sqlSimple: _deps.sqlSimple,
        esc: _deps.esc,
        coordsEfectivasPedidoMapa: _deps.coordsEfectivasPedidoMapa,
    };
}

function htmlProvinciaCpEnBloqueOpinion(p, escDet) {
    const prov = String(p?.cpcia || '').trim();
    const cp = String(p?.ccp || '').trim();
    const inferDeps = depsInferUbicacion();
    const puedeInferir =
        pedidoNecesitaInferirProvinciaCp(p) && !!coordsPedidoParaReverse(p, inferDeps || undefined);
    if (!prov && !cp && !puedeInferir) return '';
    const partes = [];
    if (prov) partes.push(`Provincia: ${escDet(prov)}`);
    else if (puedeInferir) partes.push('Provincia: …');
    if (cp) partes.push(`CP: ${escDet(cp)}`);
    else if (puedeInferir) partes.push('CP: …');
    return `<p class="gn-opinion-prov-cp" style="font-size:.75rem;color:var(--tm);margin:.45rem 0 0;line-height:1.35">${partes.join(' · ')}</p>`;
}

async function inferirProvinciaCpParaBloqueOpinionSiCorresponde(p) {
    if (!p || !pedidoNecesitaInferirProvinciaCp(p)) return;
    const inferDeps = depsInferUbicacion();
    if (!inferDeps || !coordsPedidoParaReverse(p, inferDeps)) return;
    const pid = String(p.id ?? '');
    const dm = document.getElementById('dm');
    if (!dm?.classList.contains('active') || String(dm.dataset.detallePedidoId || '') !== pid) return;
    await inferirProvinciaCpDetallePedidoSiFalta(p, inferDeps);
    if (!dm.classList.contains('active') || String(dm.dataset.detallePedidoId || '') !== pid) return;
    const host = document.getElementById('dm-opinion-cliente-host');
    if (!host?.querySelector('h4')) return;
    const cur =
        typeof _deps?.getApp === 'function'
            ? _deps.getApp()?.p?.find((x) => String(x.id) === pid)
            : p;
    if (cur) actualizarHostOpinionClienteDetalleModal(cur, { skipInfer: true });
}

/**
 * @param {object} p — pedido normalizado (opin, oes, fopin, odesc, fodesc, cpcia, ccp)
 * @param {(s: string) => string} escDet
 */
export function construirHtmlBloqueOpinionClienteDetalle(p, escDet) {
    const opinTxtDet = p.opin != null && String(p.opin).trim() ? String(p.opin).trim() : '';
    const estrellasDet = p.oes != null && p.oes >= 1 && p.oes <= 5 ? p.oes : null;
    const descTxt = mapDescargoPedido(p);
    const hasCliente = estrellasDet != null || !!opinTxtDet;
    const hasDescargo = !!descTxt;
    const esAdm = esAdminUi();

    if (!hasCliente && !hasDescargo) return '';

    const lineaEstrellas =
        estrellasDet != null
            ? `<p style="font-size:.9rem;margin:0 0 .35rem;font-weight:600;color:var(--bm)">Valoración: ${'⭐'.repeat(estrellasDet)} <span style="color:var(--tm);font-weight:500">(${estrellasDet}/5)</span></p>`
            : '';

    const bloqueCliente = hasCliente
        ? `${lineaEstrellas}
            ${opinTxtDet ? `<div class="trb">${escDet(opinTxtDet)}</div>` : '<p style="font-size:.78rem;color:var(--tm);margin:0">Sin comentario de texto.</p>'}
            ${p.fopin ? `<p style="font-size:.78rem;color:var(--tm);margin-top:.45rem">Registrada: ${escDet(fmtFechaOpinion(p.fopin))}</p>` : ''}`
        : '';

    const bloqueDescargoLectura = hasDescargo
        ? `<div class="trb" style="margin-top:.5rem;background:rgba(15,23,42,.04);border-radius:8px;padding:.55rem .65rem">
            <p style="font-size:.72rem;font-weight:600;color:var(--tm);margin:0 0 .25rem">Descargo de la empresa</p>
            <div style="font-size:.85rem;white-space:pre-wrap">${escDet(descTxt)}</div>
            ${p.fodesc ? `<p style="font-size:.72rem;color:var(--tm);margin:.35rem 0 0">Guardado: ${escDet(fmtFechaOpinion(p.fodesc))}</p>` : ''}
           </div>`
        : '';

    const pid = p.id != null ? String(p.id) : '';
    const bloqueDescargoEdicion =
        esAdm && (hasCliente || hasDescargo)
            ? `<div class="gn-opinion-descargo-edit" style="margin-top:.65rem;padding-top:.55rem;border-top:1px dashed var(--bd)">
            <label for="dm-opinion-descargo-input" style="display:block;font-size:.72rem;font-weight:600;color:var(--tm);margin-bottom:.3rem">Descargo de la empresa</label>
            <textarea id="dm-opinion-descargo-input" data-pedido-id="${escDet(pid)}" rows="3" maxlength="4000" placeholder="Respuesta o aclaración de la empresa ante esta valoración…" style="width:100%;font-size:.82rem;resize:vertical;min-height:4.2rem">${escDet(descTxt)}</textarea>
            <div style="display:flex;gap:.4rem;align-items:center;margin-top:.4rem;flex-wrap:wrap">
              <button type="button" class="btn btn-s" data-gn-opinion-descargo-save data-pedido-id="${escDet(pid)}">Guardar descargo</button>
              <span class="gn-opinion-descargo-status" style="font-size:.72rem;color:var(--tm)"></span>
            </div>
           </div>`
            : '';

    return `<div class="ds" style="border-left:4px solid #0d9488;background:linear-gradient(90deg,rgba(13,148,136,.06),transparent)">
            <h4>💬 Valoración del cliente (WhatsApp)</h4>
            ${bloqueCliente}
            ${htmlProvinciaCpEnBloqueOpinion(p, escDet)}
            ${!esAdm ? bloqueDescargoLectura : ''}
            ${bloqueDescargoEdicion || (esAdm && hasDescargo ? bloqueDescargoLectura : '')}
           </div>`;
}

export function actualizarHostOpinionClienteDetalleModal(p, opts = {}) {
    const host = document.getElementById('dm-opinion-cliente-host');
    if (!host) return;
    const escDet = t => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    host.innerHTML = construirHtmlBloqueOpinionClienteDetalle(p, escDet);
    if (!opts.skipInfer) void inferirProvinciaCpParaBloqueOpinionSiCorresponde(p);
}

/** HTML impresión / PDF */
export function construirHtmlOpinionClientePrint(p, escHtml) {
    const opin = p?.opin != null && String(p.opin).trim() ? String(p.opin).trim() : '';
    const est =
        p?.oes != null && p.oes >= 1 && p.oes <= 5 ? Math.round(Number(p.oes)) : null;
    const desc = mapDescargoPedido(p);
    if (!opin && est == null && !desc) return '';
    const stars =
        est != null
            ? `<p style="font-size:9pt;margin:0 0 4px"><strong>Valoración:</strong> ${'★'.repeat(est)} (${est}/5)</p>`
            : '';
    const cli = opin
        ? `<p style="font-size:9pt;white-space:pre-wrap">${escHtml(opin)}</p>`
        : est != null
          ? '<p style="font-size:9pt;color:#64748b"><em>Sin comentario de texto.</em></p>'
          : '';
    const fop =
        p?.fopin && (opin || est != null)
            ? `<p style="font-size:8pt;color:#64748b">Registrada: ${escHtml(fmtFechaOpinion(p.fopin))}</p>`
            : '';
    const descH = desc
        ? `<h3 style="font-size:10pt;margin:.65rem 0 .25rem">Descargo de la empresa</h3>
           <p style="font-size:9pt;white-space:pre-wrap">${escHtml(desc)}</p>
           ${p?.fodesc ? `<p style="font-size:8pt;color:#64748b">Guardado: ${escHtml(fmtFechaOpinion(p.fodesc))}</p>` : ''}`
        : '';
    return `<h2>💬 Valoración del cliente (WhatsApp)</h2>
            ${stars}${cli}${fop}${descH}`;
}

function pedidoEnApp(pid) {
    try {
        const app = _deps?.getApp?.();
        if (!app?.p || pid == null) return null;
        const key = String(pid);
        return app.p.find(x => String(x.id) === key) || null;
    } catch (_) {
        return null;
    }
}

async function guardarDescargoOpinion(pid, texto) {
    const apiUrl = _deps?.apiUrl;
    const asegurarJwt = _deps?.asegurarJwtApiRest;
    const puede = _deps?.puedeEnviarApiRestPedidos;
    const getToken = _deps?.getApiToken;
    if (typeof apiUrl !== 'function' || typeof asegurarJwt !== 'function') {
        throw new Error('API no configurada');
    }
    if (typeof puede === 'function' && !puede()) {
        throw new Error('Sin conexión con el servidor');
    }
    await asegurarJwt();
    const token = typeof getToken === 'function' ? getToken() : '';
    const url = apiUrl(`/api/pedidos/${encodeURIComponent(String(pid))}/opinion-descargo`);
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ descargo: texto }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || data?.detail || `Error ${res.status}`);
    }
    return data;
}

function aplicarDescargoEnPedidoLocal(pid, texto, fecha) {
    const cur = pedidoEnApp(pid);
    if (!cur) return;
    const t = String(texto || '').trim();
    cur.odesc = t || null;
    cur.fodesc = t ? fecha || new Date().toISOString() : null;
    if (cur.opinion_descargo_empresa !== undefined) cur.opinion_descargo_empresa = cur.odesc;
    if (cur.fecha_descargo_empresa !== undefined) cur.fecha_descargo_empresa = cur.fodesc;
}

export function installPedidoOpinionDescargoUi() {
    if (_boundSave) return;
    _boundSave = true;
    document.addEventListener('click', async ev => {
        const btn = ev.target?.closest?.('[data-gn-opinion-descargo-save]');
        if (!btn) return;
        ev.preventDefault();
        const pid = btn.getAttribute('data-pedido-id') || btn.dataset?.pedidoId;
        if (!pid) return;
        if (!esAdminUi()) {
            try {
                _deps?.toast?.('Solo administradores pueden guardar el descargo.', 'warning');
            } catch (_) {}
            return;
        }
        const ta = document.getElementById('dm-opinion-descargo-input');
        const statusEl = btn.closest('.gn-opinion-descargo-edit')?.querySelector('.gn-opinion-descargo-status');
        const texto = ta ? String(ta.value || '').trim() : '';
        btn.disabled = true;
        if (statusEl) statusEl.textContent = 'Guardando…';
        try {
            const row = await guardarDescargoOpinion(pid, texto);
            const desc =
                row?.opinion_descargo_empresa != null ? String(row.opinion_descargo_empresa).trim() : texto;
            const fecha = row?.fecha_descargo_empresa || (desc ? new Date().toISOString() : null);
            aplicarDescargoEnPedidoLocal(pid, desc, fecha);
            const cur = pedidoEnApp(pid);
            if (cur) actualizarHostOpinionClienteDetalleModal(cur);
            try {
                _deps?.toast?.(desc ? 'Descargo guardado.' : 'Descargo eliminado.', 'ok');
            } catch (_) {}
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            try {
                _deps?.toast?.(e?.message || 'No se pudo guardar el descargo.', 'err');
            } catch (_) {}
            if (statusEl) statusEl.textContent = '';
        } finally {
            btn.disabled = false;
        }
    });
}
