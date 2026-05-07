/**
 * Admin: desestimar reclamo (detalle + lista). PUT pedidos; sin WA al reclamante.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

const BTN_ID = 'gn-btn-desestimar-reclamo';

const MOTIVOS = [
    {
        value: '📸 Imagen inapropiada (desnudos, violencia, odio)',
        label: '📸 Imagen inapropiada (desnudos, violencia, odio)',
    },
    { value: '🤡 Broma / reclamo falso', label: '🤡 Broma / reclamo falso' },
    { value: '📝 Reclamo improcedente', label: '📝 Reclamo improcedente' },
    {
        value: '📸 Foto no relacionada (meme, selfie, paisaje)',
        label: '📸 Foto no relacionada (meme, selfie, paisaje)',
    },
    { value: '📝 Otro motivo', label: '📝 Otro motivo' },
];

function normEstado(raw) {
    try {
        if (typeof window.normalizarEstadoPedidoUi === 'function') {
            return window.normalizarEstadoPedidoUi(raw);
        }
    } catch (_) {}
    return String(raw || '').trim();
}

function esAdminGestor() {
    try {
        if (typeof window.esAdmin === 'function') return window.esAdmin();
    } catch (_) {}
    try {
        const r = String(window.app?.u?.rol || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        return r === 'admin' || r === 'administrador';
    } catch (_) {
        return false;
    }
}

function estadoPermiteDesestimar(estadoRaw) {
    return normEstado(estadoRaw) === 'Pendiente';
}

function pedidoAbiertoEnDetalle() {
    try {
        const id = window.app?.cid;
        const list = window.app?.p;
        if (id == null || !Array.isArray(list)) return null;
        return list.find((x) => x && String(x.id) === String(id)) || null;
    } catch (_) {
        return null;
    }
}

function buscarPedidoPorId(id) {
    const list = window.app?.p;
    if (!Array.isArray(list)) return null;
    return list.find((x) => x && String(x.id) === String(id)) || null;
}

function escOpt(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

function abrirModalMotivo(onPick) {
    const backdrop = document.createElement('div');
    backdrop.className = 'mo active';
    backdrop.style.zIndex = '100001';
    backdrop.setAttribute('role', 'dialog');
    backdrop.innerHTML = `<div class="mc" style="max-width:22rem;width:92vw">
      <div class="mh"><h3>Desestimar reclamo</h3><button type="button" class="cm" aria-label="Cerrar">&times;</button></div>
      <div class="mb" style="padding:1rem">
        <p style="margin:0 0 .65rem;font-size:.85rem;color:var(--tm)">Elegí el motivo. Se eliminan las fotos del reclamo en el servidor.</p>
        <label style="display:block;font-size:.78rem;font-weight:600;margin-bottom:.25rem">Motivo</label>
        <select id="gn-desest-motivo-sel" style="width:100%;padding:.4rem;border-radius:.5rem;border:1px solid var(--bo)">
          ${MOTIVOS.map((m) => `<option value="${escOpt(m.value)}">${escOpt(m.label)}</option>`).join('')}
        </select>
        <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
          <button type="button" class="ba2" id="gn-desest-cancel">Cancelar</button>
          <button type="button" class="bp" id="gn-desest-ok">Confirmar</button>
        </div>
      </div>
    </div>`;
    const close = () => {
        try {
            backdrop.remove();
        } catch (_) {}
    };
    backdrop.querySelector('.cm')?.addEventListener('click', close);
    backdrop.querySelector('#gn-desest-cancel')?.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });
    backdrop.querySelector('#gn-desest-ok')?.addEventListener('click', () => {
        const sel = backdrop.querySelector('#gn-desest-motivo-sel');
        const v = sel ? String(sel.value || '').trim() : '';
        close();
        if (v) onPick(v);
    });
    document.body.appendChild(backdrop);
}

async function putDesestimar(pedidoId, motivo) {
    const tok = typeof window.getApiToken === 'function' ? window.getApiToken() : '';
    const apiUrlFn = typeof window.apiUrl === 'function' ? window.apiUrl : null;
    if (!tok || !apiUrlFn) throw new Error('Sin sesión API');
    const r = await fetch(apiUrlFn(`/api/pedidos/${encodeURIComponent(String(pedidoId))}`), {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${tok}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            estado: 'Desestimado',
            motivo_desestimacion: motivo,
            foto_urls: null,
            foto_base64: null,
        }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        const msg = j.error || j.detail || `Error ${r.status}`;
        throw new Error(msg);
    }
    return j;
}

async function refrescarTrasDesestimar(p, motivo) {
    toast('✅ Reclamo desestimado', 'success', 3200);
    try {
        const list = window.app?.p;
        if (Array.isArray(list)) {
            const hit = list.find((x) => x && String(x.id) === String(p.id));
            if (hit) {
                hit.estado = 'Desestimado';
                hit.motivo_desestimacion = motivo;
                hit.foto_urls = null;
                hit.foto_base64 = null;
            }
        }
    } catch (_) {}
    if (typeof window.cargarPedidos === 'function') await window.cargarPedidos();
    if (typeof window.render === 'function') window.render();
    if (typeof window.detalle === 'function' && window.app?.cid != null && String(window.app.cid) === String(p.id)) {
        const p2 = buscarPedidoPorId(p.id);
        if (p2) await window.detalle(p2);
    }
}

function flujoDesestimarPedido(p) {
    if (!p) return;
    abrirModalMotivo(async (motivo) => {
        try {
            await putDesestimar(p.id, motivo);
            await refrescarTrasDesestimar(p, motivo);
        } catch (e) {
            toast(e?.message || 'Error', 'error', 5200);
        }
    });
}

function quitarBoton() {
    document.getElementById(BTN_ID)?.remove();
}

function inyectarBotonSiCorresponde() {
    const dm = document.getElementById('dm');
    const da = document.querySelector('.gn-dm-actions-bar .da');
    if (!dm?.classList.contains('active') || !da) {
        quitarBoton();
        return;
    }
    if (!esAdminGestor()) {
        quitarBoton();
        return;
    }
    const p = pedidoAbiertoEnDetalle();
    if (!p || !estadoPermiteDesestimar(p.es ?? p.estado)) {
        quitarBoton();
        return;
    }
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'ba2';
    btn.style.cssText = 'background:#b91c1c;color:#fff;border-color:#991b1b';
    btn.innerHTML = '<i class="fas fa-ban"></i> 🚫 Desestimar';
    btn.title = 'Marcar como desestimado (sin aviso al reclamante)';
    btn.addEventListener('click', () => {
        flujoDesestimarPedido(p);
    });
    da.insertBefore(btn, da.firstChild);
}

function instalarClickDesestimarEnLista() {
    if (typeof document === 'undefined' || document.documentElement.dataset.gnDesestListaBound === '1') return;
    document.documentElement.dataset.gnDesestListaBound = '1';
    document.addEventListener(
        'click',
        (e) => {
            const pl = document.getElementById('pl');
            const btn = e.target.closest('[data-gn-desestimar-pid]');
            if (!pl || !btn || !pl.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            if (!esAdminGestor()) {
                toast('Solo administrador', 'error');
                return;
            }
            const pid = btn.getAttribute('data-gn-desestimar-pid');
            const p = buscarPedidoPorId(pid);
            if (!p) {
                toast('Pedido no encontrado', 'error');
                return;
            }
            if (!estadoPermiteDesestimar(p.es ?? p.estado)) {
                toast('Solo se puede desestimar en estado Pendiente.', 'info');
                return;
            }
            flujoDesestimarPedido(p);
        },
        true
    );
}

function boot() {
    instalarClickDesestimarEnLista();
    const obs = new MutationObserver(() => {
        try {
            inyectarBotonSiCorresponde();
        } catch (_) {}
    });
    const dmc = document.getElementById('dmc');
    if (dmc) obs.observe(dmc, { childList: true, subtree: true });
    const dm = document.getElementById('dm');
    if (dm) obs.observe(dm, { attributes: true, attributeFilter: ['class'] });
    try {
        inyectarBotonSiCorresponde();
    } catch (_) {}
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
}
