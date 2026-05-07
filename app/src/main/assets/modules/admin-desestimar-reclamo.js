/**
 * Admin: desestimar reclamo desde el detalle (#dm), con o sin bloque de foto.
 * PUT pedidos; sin notificación WA (la API no agenda aviso para Desestimado).
 * made by leavera77
 */

import { toast } from './ui-utils.js';

const BAR_ID = 'gn-admin-desestimar-bar';

const MOTIVOS = [
    { value: '📸 Imagen inapropiada', label: '📸 Imagen inapropiada' },
    { value: '🤡 Broma / reclamo falso', label: '🤡 Broma / reclamo falso' },
    { value: '📝 Reclamo improcedente', label: '📝 Reclamo improcedente' },
    { value: '📸 Foto no relacionada', label: '📸 Foto no relacionada' },
    { value: 'Otro', label: 'Otro' },
];

function esAdminGestor() {
    try {
        const r = String(window.app?.u?.rol || '').toLowerCase();
        return r === 'admin' || r === 'administrador';
    } catch (_) {
        return false;
    }
}

function estadoPermiteDesestimar(estadoRaw) {
    const s = String(estadoRaw || '').trim();
    return !['Cerrado', 'Desestimado', 'Derivado externo'].includes(s);
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
          ${MOTIVOS.map((m) => `<option value="${String(m.value).replace(/"/g, '&quot;')}">${m.label}</option>`).join('')}
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

function quitarBarra() {
    document.getElementById(BAR_ID)?.remove();
}

function inyectarBarraSiCorresponde() {
    const dm = document.getElementById('dm');
    const scroll = document.querySelector('#dmc .gn-dm-detail-scroll') || document.getElementById('dmc');
    if (!dm?.classList.contains('active') || !scroll) {
        quitarBarra();
        return;
    }
    if (!esAdminGestor()) {
        quitarBarra();
        return;
    }
    const p = pedidoAbiertoEnDetalle();
    if (!p || !estadoPermiteDesestimar(p.estado)) {
        quitarBarra();
        return;
    }
    if (document.getElementById(BAR_ID)) return;

    const wrap = document.createElement('div');
    wrap.id = BAR_ID;
    wrap.style.cssText =
        'margin:.5rem 0 0;padding:.55rem;border:1px solid var(--bo);border-radius:8px;background:rgba(198,40,40,.06);display:flex;flex-wrap:wrap;gap:.5rem;align-items:center';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bp';
    btn.style.cssText = 'background:#b91c1c;border-color:#991b1b';
    btn.textContent = '🚫 Desestimar reclamo';
    btn.title = 'Marcar como desestimado (sin aviso al reclamante)';
    btn.addEventListener('click', () => {
        abrirModalMotivo(async (motivo) => {
            try {
                await putDesestimar(p.id, motivo);
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
                if (typeof window.detalle === 'function') await window.detalle(p);
            } catch (e) {
                toast(e?.message || 'Error', 'error', 5200);
            }
        });
    });
    wrap.appendChild(btn);
    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:.72rem;color:var(--tm)';
    hint.textContent = 'No se notifica por WhatsApp al reclamante.';
    wrap.appendChild(hint);
    const first = scroll.querySelector(':scope > .ds, :scope > h3, :scope > div');
    if (first) scroll.insertBefore(wrap, first);
    else scroll.appendChild(wrap);
}

function boot() {
    const obs = new MutationObserver(() => {
        try {
            inyectarBarraSiCorresponde();
        } catch (_) {}
    });
    const dmc = document.getElementById('dmc');
    if (dmc) obs.observe(dmc, { childList: true, subtree: true });
    const dm = document.getElementById('dm');
    if (dm) obs.observe(dm, { attributes: true, attributeFilter: ['class'] });
    try {
        inyectarBarraSiCorresponde();
    } catch (_) {}
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
}
