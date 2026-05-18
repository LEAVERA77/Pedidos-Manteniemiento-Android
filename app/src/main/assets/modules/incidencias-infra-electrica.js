/**
 * Cooperativa eléctrica: asociar reclamos por transformador/distribuidor (reutiliza incidencias).
 * made by leavera77
 */

import { toast } from './ui-utils.js';

let _wiredToolbar = false;
let _modalSug = null;

function apiUrl(p) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(p) : p;
}
function getTok() {
    return typeof window.getApiToken === 'function' ? window.getApiToken() : '';
}

function esCoopElectrica() {
    const t = String(window.EMPRESA_CFG?.tipo || '').toLowerCase();
    return t.includes('electric') || t.includes('eléctrica');
}

function puedeGestionar() {
    return typeof window.puedeGestionarIncidencias === 'function' && window.puedeGestionarIncidencias();
}

function pedidoTieneInfra(p) {
    if (!p) return false;
    return Boolean(String(p.trf || '').trim() || String(p.dis || '').trim());
}

function pedidoAbiertoParaInc(p) {
    const es = String(p?.es || '').trim();
    return es && es !== 'Cerrado' && es !== 'Derivado externo' && es !== 'Desestimado';
}

function esc(s) {
    const d = document.createElement('span');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

async function fetchSugerirPorInfra(pedidoId) {
    const tok = getTok();
    if (!tok) throw new Error('Sin sesión');
    const r = await fetch(
        apiUrl(`/api/incidencias/sugerir-por-infra?pedido_id=${encodeURIComponent(String(pedidoId))}`),
        { headers: { Authorization: `Bearer ${tok}` } }
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
    return j;
}

function ensureModalSugerir() {
    if (_modalSug && document.body.contains(_modalSug)) return _modalSug;
    const m = document.createElement('div');
    m.id = 'gn-modal-inc-infra-sugerir';
    m.className = 'mo';
    m.style.zIndex = '10052';
    m.innerHTML =
        '<div class="mc gn-inc-modal-mc" style="max-width:min(96vw,28rem)">' +
        '<div class="mh"><h3><i class="fas fa-bolt"></i> Asociar por transformador / distribuidor</h3>' +
        '<button type="button" class="cm" data-close="1"><i class="fas fa-times"></i></button></div>' +
        '<div class="mb" style="padding:0 1rem 1rem">' +
        '<p id="gn-inc-infra-meta" style="font-size:.78rem;color:var(--tm);margin:0 0 .55rem"></p>' +
        '<div id="gn-inc-infra-list" style="max-height:min(45vh,280px);overflow:auto;font-size:.8rem;border:1px solid var(--bo);border-radius:.45rem;padding:.35rem .5rem"></div>' +
        '<div style="display:flex;gap:.5rem;margin-top:.85rem;flex-wrap:wrap">' +
        '<button type="button" class="sec" data-close="1" style="flex:1;min-height:44px">Cancelar</button>' +
        '<button type="button" id="gn-inc-infra-confirm" class="bp" style="flex:1.3;min-height:44px"><i class="fas fa-link"></i> Asociar seleccionados</button>' +
        '</div></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('active');
    });
    m.querySelectorAll('[data-close]').forEach((b) => {
        b.addEventListener('click', () => m.classList.remove('active'));
    });
    _modalSug = m;
    return m;
}

function labelCriterio(c) {
    if (c === 'transformador') return 'Transformador';
    if (c === 'distribuidor') return 'Distribuidor';
    return String(c || '—');
}

/**
 * @param {object} p pedido activo (app norm)
 * @param {{ fromDetalle?: boolean }} opts
 */
export async function abrirAsociacionPorInfraDesdePedido(p, opts = {}) {
    if (!esCoopElectrica()) {
        toast('Solo disponible para cooperativas eléctricas.', 'info');
        return;
    }
    if (!puedeGestionar()) {
        toast('Sin permisos para asociar reclamos.', 'error');
        return;
    }
    if (!p?.id) {
        toast('Pedido inválido.', 'error');
        return;
    }
    const incId = p.inci != null ? parseInt(String(p.inci), 10) : null;
    if (incId && Number.isFinite(incId) && incId > 0) {
        if (typeof window.__gnIncidenciasOpenVista === 'function') {
            void window.__gnIncidenciasOpenVista(incId);
        } else {
            toast(`Este reclamo ya está en la incidencia #${incId}.`, 'info');
        }
        return;
    }
    if (!pedidoTieneInfra(p)) {
        toast('El pedido no tiene transformador ni distribuidor cargado.', 'error');
        return;
    }
    if (!pedidoAbiertoParaInc(p)) {
        toast('Solo se pueden asociar reclamos abiertos.', 'error');
        return;
    }

    const m = ensureModalSugerir();
    const meta = m.querySelector('#gn-inc-infra-meta');
    const list = m.querySelector('#gn-inc-infra-list');
    const btnOk = m.querySelector('#gn-inc-infra-confirm');
    if (meta) meta.textContent = 'Buscando reclamos con la misma infraestructura…';
    if (list) list.innerHTML = '';
    m.classList.add('active');

    let data;
    try {
        data = await fetchSugerirPorInfra(p.id);
    } catch (e) {
        if (meta) meta.textContent = '';
        m.classList.remove('active');
        toast(String(e?.message || e), 'error');
        return;
    }

    const ref = data.pedido_referencia || {};
    const candidatos = Array.isArray(data.candidatos) ? data.candidatos : [];
    const crit = data.criterio_agrupacion || '';
    const val = data.valor_criterio || '';
    const allRows = [ref, ...candidatos.filter((r) => Number(r.id) !== Number(ref.id))];

    if (allRows.length < 2) {
        if (meta)
            meta.textContent = `No hay otros reclamos abiertos con el mismo ${labelCriterio(crit).toLowerCase()} (${esc(val)}).`;
        if (list) list.innerHTML = '<p style="margin:.35rem 0;color:var(--tl)">Solo este pedido coincide.</p>';
        if (btnOk) btnOk.disabled = true;
        return;
    }

    if (meta) {
        meta.innerHTML = `Mismo <strong>${esc(labelCriterio(crit))}</strong>: <strong>${esc(val)}</strong>. Marcá los reclamos a asociar (mínimo 2).`;
    }

    const selected = new Set(allRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0));

    const paintList = () => {
        if (!list) return;
        list.innerHTML = allRows
            .map((row) => {
                const id = Number(row.id);
                const np = row.numero_pedido ?? row.np ?? id;
                const est = String(row.estado || '').trim();
                const nom = String(row.cliente_nombre || row.cliente || '').trim() || '—';
                const chk = selected.has(id) ? 'checked' : '';
                return `<label style="display:flex;gap:.45rem;align-items:flex-start;padding:.4rem 0;border-bottom:1px solid var(--bo);cursor:pointer;touch-action:manipulation">
          <input type="checkbox" class="gn-inc-infra-cb" data-pid="${id}" ${chk} style="margin-top:.2rem;min-width:18px;min-height:18px" />
          <span style="flex:1;line-height:1.35"><strong>#${esc(np)}</strong> · <em>${esc(est)}</em><br><span style="font-size:.76rem;color:var(--tm)">${esc(nom)}</span></span>
        </label>`;
            })
            .join('');
        list.querySelectorAll('.gn-inc-infra-cb').forEach((cb) => {
            cb.addEventListener('change', () => {
                const pid = Number(cb.getAttribute('data-pid'));
                if (!Number.isFinite(pid)) return;
                if (cb.checked) selected.add(pid);
                else selected.delete(pid);
                if (btnOk) btnOk.disabled = selected.size < 2;
            });
        });
    };
    paintList();
    if (btnOk) btnOk.disabled = selected.size < 2;

    const freshBtn = btnOk?.cloneNode(true);
    if (btnOk && freshBtn) {
        btnOk.parentNode.replaceChild(freshBtn, btnOk);
        freshBtn.disabled = selected.size < 2;
        freshBtn.addEventListener('click', async () => {
            if (selected.size < 2) {
                toast('Seleccioná al menos 2 reclamos.', 'error');
                return;
            }
            m.classList.remove('active');
            const preset = {
                criterio_agrupacion: crit,
                valor_criterio: val,
                nombre:
                    crit && val
                        ? `Corte ${labelCriterio(crit)} ${val}`.slice(0, 200)
                        : '',
            };
            if (typeof window.__gnIncidenciasAbrirAsociacionPorIds === 'function') {
                await window.__gnIncidenciasAbrirAsociacionPorIds([...selected], preset);
            } else {
                toast('Módulo de incidencias no cargado.', 'error');
            }
        });
    }
}

/** Hook desde detalle(): botón en barra de acciones. */
export function incidenciasInfraDetalleHook(p) {
    if (!esCoopElectrica() || !puedeGestionar() || !p?.id) return;
    const bar = document.querySelector('#dm .gn-dm-actions-bar .da');
    if (!bar) return;
    const old = document.getElementById('gn-btn-inc-infra-detalle');
    if (old) old.remove();

    const incId = p.inci != null ? parseInt(String(p.inci), 10) : null;
    const enGrupo = incId && Number.isFinite(incId) && incId > 0;

    if (enGrupo) {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'gn-btn-inc-infra-detalle';
        b.className = 'ba2';
        b.style.cssText = 'background:#0369a1;color:#fff;border-color:#0369a1';
        b.innerHTML = '<i class="fas fa-project-diagram"></i> Ver incidencia / cerrar grupo';
        b.addEventListener('click', () => {
            if (typeof window.__gnIncidenciasOpenVista === 'function') void window.__gnIncidenciasOpenVista(incId);
        });
        bar.insertBefore(b, bar.firstChild);
        return;
    }

    if (!pedidoTieneInfra(p) || !pedidoAbiertoParaInc(p)) return;

    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'gn-btn-inc-infra-detalle';
    b.className = 'ba2';
    b.style.cssText = 'background:#0ea5e9;color:#fff;border-color:#0ea5e9';
    b.innerHTML = '<i class="fas fa-bolt"></i> Asociar por transformador';
    b.addEventListener('click', () => void abrirAsociacionPorInfraDesdePedido(p, { fromDetalle: true }));
    bar.insertBefore(b, bar.firstChild);
}

function wireToolbarBp2() {
    if (!esCoopElectrica() || !puedeGestionar()) return;
    if (document.getElementById('btn-inc-infra-bp2')) {
        _wiredToolbar = true;
        return;
    }
    const toolbar = document.querySelector('.gn-bp2-toolbar');
    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-inc-infra-bp2';
    btn.title = 'Asociar por transformador/distribuidor (pedido en detalle)';
    btn.innerHTML = '<i class="fas fa-bolt"></i>';
    btn.style.cssText =
        'background:#0ea5e9;color:#fff;border:none;border-radius:.35rem;width:28px;height:28px;' +
        'display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:.82rem;flex-shrink:0';
    btn.addEventListener('click', () => {
        const p = window.__gnDetallePedidoActivo;
        if (p && document.getElementById('dm')?.classList.contains('active')) {
            void abrirAsociacionPorInfraDesdePedido(p);
            return;
        }
        toast('Abrí el detalle de un reclamo con trafo o distribuidor para usar esta acción.', 'info');
    });

    const spacer = toolbar.querySelector('.gn-bp2-toolbar-spacer');
    if (spacer) toolbar.insertBefore(btn, spacer);
    else toolbar.appendChild(btn);
    _wiredToolbar = true;
}

export function installIncidenciasInfraElectrica() {
    try {
        window.__gnIncidenciasInfraDetalleHook = incidenciasInfraDetalleHook;
        window.__gnAbrirAsociacionPorInfra = abrirAsociacionPorInfraDesdePedido;
    } catch (_) {}
    wireToolbarBp2();
}

if (typeof window !== 'undefined') {
    window._gnInitIncidenciasInfraElectrica = installIncidenciasInfraElectrica;
    const run = () => {
        try {
            installIncidenciasInfraElectrica();
        } catch (e) {
            console.warn('[incidencias-infra]', e);
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
}
