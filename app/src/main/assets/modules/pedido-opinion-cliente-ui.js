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
import { guardarDescargoOpinionCompleto } from './pedido-opinion-descargo-save.js';
import {
    estrellasOpinionPedido,
    esValoracionBajaOpinion,
    puedeMostrarFormularioDescargoEmpresa,
    descargoYaGuardadoParaValoracionActual,
    mapDescargoTexto,
    textoInicialTextareaDescargo,
} from './pedido-opinion-descargo-ciclo.js';

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
    return mapDescargoTexto(p);
}

function syncDescargoSaveButtonState() {
    const ta = document.getElementById('dm-opinion-descargo-input');
    const btn = document.querySelector('[data-gn-opinion-descargo-save]');
    if (!btn) return;
    const texto = ta ? String(ta.value || '').trim() : '';
    const guardado = btn.dataset.descargoGuardado === '1';
    if (guardado || ta?.disabled) {
        btn.disabled = true;
        return;
    }
    btn.disabled = !texto;
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
    const estrellasDet = estrellasOpinionPedido(p);
    const descTxt = mapDescargoPedido(p);
    const hasCliente = estrellasDet != null || !!opinTxtDet;
    const hasDescargo = !!descTxt;
    const esAdm = esAdminUi();
    const muestraForm = puedeMostrarFormularioDescargoEmpresa(p, esAdm);
    const descargoGuardado = descargoYaGuardadoParaValoracionActual(p);
    const valoracionBaja = esValoracionBajaOpinion(estrellasDet);

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

    const bloqueDescargoLectura =
        hasDescargo && (descargoGuardado || !muestraForm)
            ? `<div class="trb" style="margin-top:.5rem;background:rgba(15,23,42,.04);border-radius:8px;padding:.55rem .65rem">
            <p style="font-size:.72rem;font-weight:600;color:var(--tm);margin:0 0 .25rem">Descargo de la empresa</p>
            <div style="font-size:.85rem;white-space:pre-wrap">${escDet(descTxt)}</div>
            ${p.fodesc ? `<p style="font-size:.72rem;color:var(--tm);margin:.35rem 0 0">Guardado: ${escDet(fmtFechaOpinion(p.fodesc))}</p>` : ''}
           </div>`
            : '';

    const pid = p.id != null ? String(p.id) : '';
    const taIni = textoInicialTextareaDescargo(p, esAdm);
    const bloqueDescargoEdicion = muestraForm
        ? `<div class="gn-opinion-descargo-edit" style="margin-top:.65rem;padding-top:.55rem;border-top:1px dashed var(--bd)">
            <label for="dm-opinion-descargo-input" style="display:block;font-size:.72rem;font-weight:600;color:var(--tm);margin-bottom:.3rem">Descargo de la empresa</label>
            <p style="font-size:.72rem;color:var(--tm);margin:0 0 .35rem;line-height:1.35">Escribí el descargo y guardá <strong>una sola vez</strong> por esta valoración. Luego el pedido vuelve a pendiente para asignar técnico.</p>
            <textarea id="dm-opinion-descargo-input" data-pedido-id="${escDet(pid)}" rows="3" maxlength="4000" placeholder="Respuesta o aclaración de la empresa ante esta valoración…" style="width:100%;font-size:.82rem;resize:vertical;min-height:4.2rem">${escDet(taIni)}</textarea>
            <div style="display:flex;gap:.4rem;align-items:center;margin-top:.4rem;flex-wrap:wrap">
              <button type="button" class="btn btn-s" data-gn-opinion-descargo-save data-pedido-id="${escDet(pid)}" data-descargo-guardado="0" disabled>Guardar descargo</button>
              <span class="gn-opinion-descargo-status" style="font-size:.72rem;color:var(--tm)"></span>
            </div>
           </div>`
        : descargoGuardado && esAdm && valoracionBaja
          ? `<p style="font-size:.72rem;color:var(--tm);margin-top:.55rem;line-height:1.35">Descargo enviado. El pedido sigue en gestión; si el cliente vuelve a calificar bajo tras un nuevo cierre, podrá cargar otro descargo.</p>`
          : '';

    return `<div class="ds" style="border-left:4px solid #0d9488;background:linear-gradient(90deg,rgba(13,148,136,.06),transparent)">
            <h4>💬 Valoración del cliente (WhatsApp)</h4>
            ${bloqueCliente}
            ${htmlProvinciaCpEnBloqueOpinion(p, escDet)}
            ${!esAdm ? bloqueDescargoLectura : ''}
            ${bloqueDescargoEdicion}
            ${!muestraForm ? bloqueDescargoLectura : ''}
           </div>`;
}

export function actualizarHostOpinionClienteDetalleModal(p, opts = {}) {
    const host = document.getElementById('dm-opinion-cliente-host');
    if (!host) return;
    const escDet = t => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    host.innerHTML = construirHtmlBloqueOpinionClienteDetalle(p, escDet);
    syncDescargoSaveButtonState();
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

async function postGuardarDescargoUi(pid, row, texto) {
    const desc =
        row?.opinion_descargo_empresa != null ? String(row.opinion_descargo_empresa).trim() : texto;
    const fecha = row?.fecha_descargo_empresa || (desc ? new Date().toISOString() : null);
    aplicarDescargoEnPedidoLocal(pid, desc, fecha);
    aplicarReaperturaPedidoLocal(pid, row);
    const cur = pedidoEnApp(pid);
    if (cur) actualizarHostOpinionClienteDetalleModal(cur);
    if (row?.pedidoReabierto || row?.estado === 'Pendiente') {
        refrescarDetalleModalPedido(pid);
    }

    if (row?._soloNeon && !row?.pedidoReabierto) {
        try {
            _deps?.toast?.(
                desc
                    ? 'Descargo guardado en la base. Para WhatsApp y chat operador hace falta la API activa.'
                    : 'Descargo eliminado.',
                desc ? 'warning' : 'ok'
            );
        } catch (_) {}
        return;
    }

    let msg = desc ? 'Descargo guardado.' : 'Descargo eliminado.';
    if (row?.pedidoReabierto || (desc && row?.estado === 'Pendiente')) {
        msg += ' Pedido reabierto: podés asignar técnico.';
    }
    if (desc) {
        if (row?.whatsappEnviado) msg += ' Enviado por WhatsApp al cliente.';
        else if (row?.notifyWarning === 'sin_telefono_contacto')
            msg += ' Sin teléfono de contacto en el pedido para WhatsApp.';
        else msg += ' No se pudo enviar por WhatsApp (revisá teléfono del pedido o la API).';
    }
    try {
        _deps?.toast?.(msg, desc && row?.whatsappEnviado ? 'ok' : desc ? 'warning' : 'ok');
    } catch (_) {}

    const sid = row?.humanChatSessionId;
    if (sid != null && typeof _deps?.abrirModalWhatsappHumanChat === 'function') {
        try {
            await _deps.abrirModalWhatsappHumanChat(Number(sid));
        } catch (_) {}
    } else if (desc && !row?.whatsappEnviado) {
        try {
            _deps?.toast?.(
                'Podés abrir WhatsApp → Chat operador cuando el mensaje al cliente esté configurado.',
                'info'
            );
        } catch (_) {}
    }
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

function aplicarReaperturaPedidoLocal(pid, row) {
    const cur = pedidoEnApp(pid);
    if (!cur || !row) return;
    const est = row.estado != null ? String(row.estado).trim() : '';
    if (est) cur.es = est;
    if (row.tecnico_asignado_id !== undefined && row.tecnico_asignado_id !== null) {
        cur.tai = Number(row.tecnico_asignado_id);
    } else if (row.tai !== undefined) {
        cur.tai = row.tai;
    } else if (est === 'Pendiente' || row.pedidoReabierto) {
        cur.tai = null;
    }
    if (row.avance !== undefined) cur.av = Number(row.avance) || 0;
    else if (row.av !== undefined) cur.av = Number(row.av) || 0;
    else if (est === 'Pendiente' || row.pedidoReabierto) cur.av = 0;
}

function refrescarDetalleModalPedido(pid) {
    const cur = pedidoEnApp(pid);
    if (!cur) return;
    try {
        if (typeof window.gnDmEncolarRepintadoDetalle === 'function') {
            window.gnDmEncolarRepintadoDetalle(cur, { skipBackgroundRefetch: true });
            return;
        }
        if (typeof window.detalle === 'function') {
            void window.detalle(cur, { skipBackgroundRefetch: true });
        }
    } catch (_) {}
}

export function installPedidoOpinionDescargoUi() {
    if (_boundSave) return;
    _boundSave = true;
    document.addEventListener('input', ev => {
        if (ev.target?.id === 'dm-opinion-descargo-input') syncDescargoSaveButtonState();
    });
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
        if (!texto || btn.disabled || btn.dataset.descargoGuardado === '1') return;
        btn.disabled = true;
        if (statusEl) statusEl.textContent = 'Guardando…';
        try {
            const row = await guardarDescargoOpinionCompleto(_deps, pid, texto);
            btn.dataset.descargoGuardado = '1';
            await postGuardarDescargoUi(pid, row, texto);
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            try {
                _deps?.toast?.(e?.message || 'No se pudo guardar el descargo.', 'err');
            } catch (_) {}
            if (statusEl) statusEl.textContent = '';
            syncDescargoSaveButtonState();
        }
    });
}
