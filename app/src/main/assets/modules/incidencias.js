/**
 * Asociación de pedidos en incidencias (badges, selección múltiple admin, modales).
 * Requiere API + migración `docs/NEON_incidencias.sql`.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

/** @type {Record<string, number>} */
let _mapPedidoIncidencia = {};
let _fabEl = null;
let _modalAssoc = null;
let _modalVista = null;
let _moPl = null;
let _debTimer = null;

function apiUrl(p) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(p) : p;
}
function getTok() {
    return typeof window.getApiToken === 'function' ? window.getApiToken() : '';
}
function esAdmin() {
    return typeof window.esAdmin === 'function' && window.esAdmin();
}
function rubroPanel() {
    const t = String(window.EMPRESA_CFG?.tipo || '').toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t.includes('agua')) return 'cooperativa_agua';
    if (t.includes('electric') || t.includes('eléctrica')) return 'cooperativa_electrica';
    return 'municipio';
}

async function fetchPedidoMap() {
    const tok = getTok();
    if (!tok || typeof window.apiUrl !== 'function') return;
    try {
        const r = await fetch(apiUrl('/api/incidencias/pedido-map'), { headers: { Authorization: `Bearer ${tok}` } });
        if (!r.ok) return;
        const j = await r.json();
        _mapPedidoIncidencia = j.map && typeof j.map === 'object' ? j.map : {};
    } catch (_) {}
}

function recargarPedidosYMapa() {
    try {
        if (typeof window.__gnRecargarPedidos === 'function') window.__gnRecargarPedidos({ silent: true });
    } catch (_) {}
    void fetchPedidoMap().then(() => {
        try {
            document.querySelectorAll('.pi[data-gn-inc-done="1"]').forEach((el) => {
                el.removeAttribute('data-gn-inc-done');
            });
        } catch (_) {}
        debouncedEnhance();
    });
}

function parseNpFromRow(row) {
    const t = row.querySelector('.pn')?.textContent || '';
    const m = t.match(/#(\d+)/);
    if (!m) return null;
    return parseInt(m[1], 10);
}
function findPedidoLocal(np) {
    if (np == null || !Number.isFinite(np)) return null;
    const list = window.app?.p;
    if (!Array.isArray(list)) return null;
    return list.find((x) => x && Number(x.np) === np) || null;
}

function uniqueNonEmpty(...vals) {
    const s = new Set();
    for (const v of vals) {
        const t = String(v || '').trim();
        if (t) s.add(t);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
}

function criterioOptionsForRubro(pedidos) {
    const r = rubroPanel();
    if (r === 'municipio') {
        return {
            criterios: [
                { value: 'calle', label: 'Calle (cliente)' },
                { value: 'barrio', label: 'Barrio' },
            ],
            valuesByCriterio: (c) => {
                if (c === 'barrio') return uniqueNonEmpty(...pedidos.map((p) => p.br));
                return uniqueNonEmpty(...pedidos.map((p) => p.ccal));
            },
        };
    }
    if (r === 'cooperativa_agua') {
        return {
            criterios: [
                { value: 'calle', label: 'Calle' },
                { value: 'ramal', label: 'Ramal (zona / distribuidor en pedido)' },
            ],
            valuesByCriterio: (c) => {
                if (c === 'ramal') return uniqueNonEmpty(...pedidos.map((p) => p.dis));
                return uniqueNonEmpty(...pedidos.map((p) => p.ccal));
            },
        };
    }
    return {
        criterios: [
            { value: 'transformador', label: 'Transformador' },
            { value: 'distribuidor', label: 'Distribuidor' },
        ],
        valuesByCriterio: (c) => {
            if (c === 'transformador') return uniqueNonEmpty(...pedidos.map((p) => p.trf));
            return uniqueNonEmpty(...pedidos.map((p) => p.dis));
        },
    };
}

function ensureFab() {
    if (_fabEl) return _fabEl;
    const el = document.createElement('button');
    el.type = 'button';
    el.id = 'gn-incidencias-fab';
    el.style.cssText =
        'display:none;position:fixed;bottom:5.5rem;left:50%;transform:translateX(-50%);z-index:10040;padding:.55rem 1rem;border-radius:999px;border:none;background:#0ea5e9;color:#fff;font-weight:700;font-size:.82rem;cursor:pointer;box-shadow:0 4px 14px rgba(14,165,233,.45);align-items:center;gap:.35rem';
    el.innerHTML = '<i class="fas fa-link"></i> <span id="gn-incidencias-fab-txt"></span>';
    el.addEventListener('click', () => openModalAsociar());
    document.body.appendChild(el);
    _fabEl = el;
    return el;
}

const _selectedNp = new Set();

function updateFab() {
    const fab = ensureFab();
    const n = _selectedNp.size;
    if (!esAdmin() || n < 2) {
        fab.style.display = 'none';
        return;
    }
    fab.style.display = 'flex';
    const sp = document.getElementById('gn-incidencias-fab-txt');
    if (sp) sp.textContent = `Asociar reclamos (${n})`;
}

function enhanceListaPedidos() {
    const pl = document.getElementById('pl');
    if (!pl) return;

    const rows = pl.querySelectorAll(':scope > .pi');
    rows.forEach((row) => {
        if (row.dataset.gnIncDone === '1') return;
        const np = parseNpFromRow(row);
        const p = findPedidoLocal(np);
        if (!p) {
            row.dataset.gnIncDone = '1';
            return;
        }

        row.dataset.pedidoId = String(p.id);
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.style.gap = '6px';
        row.classList.add('gn-pi-inc');

        const move = document.createElement('div');
        move.style.cssText = 'flex:1;min-width:0';
        while (row.firstChild) move.appendChild(row.firstChild);

        if (esAdmin()) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'gn-pi-cb';
            cb.style.marginTop = '4px';
            cb.dataset.np = String(np);
            cb.checked = _selectedNp.has(np);
            cb.addEventListener('click', (e) => e.stopPropagation());
            cb.addEventListener('change', () => {
                if (cb.checked) _selectedNp.add(np);
                else _selectedNp.delete(np);
                updateFab();
            });
            row.appendChild(cb);
        }

        row.appendChild(move);

        const incId = p.inci ?? _mapPedidoIncidencia[String(p.id)];
        if (incId) {
            const badge = document.createElement('span');
            badge.className = 'incidencia-badge';
            badge.textContent = `🔗 Incidencia #${incId}`;
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                void openVistaIncidencia(incId);
            });
            const ph2 = move.querySelector('.ph2');
            if (ph2) ph2.appendChild(badge);
            else move.insertBefore(badge, move.firstChild);
        }

        row.addEventListener(
            'click',
            (e) => {
                if (e.target.closest('.gn-pi-cb') || e.target.closest('.incidencia-badge')) {
                    e.stopPropagation();
                }
            },
            true
        );

        row.dataset.gnIncDone = '1';
    });
    updateFab();
}

function debouncedEnhance() {
    if (_debTimer) clearTimeout(_debTimer);
    _debTimer = setTimeout(() => {
        _debTimer = null;
        enhanceListaPedidos();
    }, 80);
}

function buildModalAssoc() {
    if (_modalAssoc) return _modalAssoc;
    const root = document.createElement('div');
    root.id = 'gn-modal-incidencias-assoc';
    root.className = 'mo';
    root.style.zIndex = '10050';
    root.innerHTML = `
<div class="mc" style="max-width:min(96vw,26rem)">
  <div class="mh"><h3><i class="fas fa-link"></i> Asociar reclamos</h3><button type="button" class="cm" data-close="1"><i class="fas fa-times"></i></button></div>
  <div class="mb" style="padding:0 1rem 1rem">
    <p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem">Pedidos seleccionados:</p>
    <ul id="gn-inc-lista-sel" style="font-size:.8rem;max-height:8rem;overflow:auto;margin:0 0 .75rem;padding-left:1.1rem"></ul>
    <div class="fg" style="padding:0">
      <label for="gn-inc-criterio" style="font-size:.78rem">Criterio de agrupación</label>
      <select id="gn-inc-criterio" style="width:100%;margin-top:.25rem;padding:.4rem;border-radius:.45rem;border:1px solid var(--bo)"></select>
    </div>
    <div class="fg" style="padding:0;margin-top:.5rem">
      <label for="gn-inc-valor" style="font-size:.78rem">Valor</label>
      <select id="gn-inc-valor" style="width:100%;margin-top:.25rem;padding:.4rem;border-radius:.45rem;border:1px solid var(--bo)"></select>
    </div>
    <div class="fg" style="padding:0;margin-top:.5rem">
      <label for="gn-inc-nombre" style="font-size:.78rem">Nombre de la incidencia (opcional)</label>
      <input type="text" id="gn-inc-nombre" maxlength="200" placeholder="Autogenerado si lo dejás vacío" style="width:100%;margin-top:.25rem;padding:.4rem;border-radius:.45rem;border:1px solid var(--bo)" />
    </div>
    <div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap">
      <button type="button" class="sec" data-close="1" style="flex:1">Cancelar</button>
      <button type="button" id="gn-inc-confirm" class="bp" style="flex:1.2"><i class="fas fa-check"></i> Confirmar asociación</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
        if (e.target === root) closeModalAssoc();
    });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModalAssoc()));
    _modalAssoc = root;
    return root;
}

function closeModalAssoc() {
    if (_modalAssoc) _modalAssoc.classList.remove('active');
}

function openModalAsociar() {
    if (!esAdmin()) return;
    const peds = [..._selectedNp]
        .map((np) => findPedidoLocal(np))
        .filter(Boolean);
    if (peds.length < 2) {
        toast('Seleccioná al menos 2 pedidos', 'error');
        return;
    }
    const m = buildModalAssoc();
    const ul = m.querySelector('#gn-inc-lista-sel');
    if (ul)
        ul.innerHTML = peds
            .map(
                (p) =>
                    `<li><strong>#${p.np}</strong> — ${String(p.nis || '—').replace(/</g, '&lt;')} — ${String(p.tt || '').replace(/</g, '&lt;')} — <em>${String(p.es || '').replace(/</g, '&lt;')}</em></li>`
            )
            .join('');

    const { criterios, valuesByCriterio } = criterioOptionsForRubro(peds);
    const selC = m.querySelector('#gn-inc-criterio');
    const selV = m.querySelector('#gn-inc-valor');
    if (selC) {
        selC.innerHTML = criterios.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
    }
    const syncVal = () => {
        const c = selC?.value || criterios[0]?.value;
        const opts = valuesByCriterio(c) || [];
        if (selV) {
            selV.innerHTML = opts.length
                ? opts.map((o) => `<option value="${o.replace(/"/g, '&quot;')}">${o.replace(/</g, '&lt;')}</option>`).join('')
                : '<option value="">— Sin valores comunes —</option>';
        }
    };
    if (selC) selC.onchange = syncVal;
    syncVal();

    const confirm = m.querySelector('#gn-inc-confirm');
    if (confirm) {
        confirm.onclick = async () => {
            const criterio = (selC?.value || '').trim();
            const valor = (selV?.value || '').trim();
            const nombre = (m.querySelector('#gn-inc-nombre')?.value || '').trim();
            if (!criterio || !valor) {
                toast('Elegí criterio y valor', 'error');
                return;
            }
            const tok = getTok();
            if (!tok) {
                toast('Sin sesión', 'error');
                return;
            }
            confirm.disabled = true;
            try {
                const body = {
                    pedido_ids: peds.map((p) => p.id),
                    criterio_agrupacion: criterio,
                    valor_criterio: valor,
                };
                if (nombre) body.nombre = nombre;
                const r = await fetch(apiUrl('/api/incidencias'), {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
                const nid = j.id;
                toast(`✅ Incidencia #${nid} creada con ${peds.length} pedidos`, 'success');
                _selectedNp.clear();
                updateFab();
                closeModalAssoc();
                recargarPedidosYMapa();
            } catch (e) {
                toast(String(e?.message || e), 'error');
            } finally {
                confirm.disabled = false;
            }
        };
    }
    m.classList.add('active');
}

function buildModalVista() {
    if (_modalVista) return _modalVista;
    const root = document.createElement('div');
    root.id = 'gn-modal-incidencias-vista';
    root.className = 'mo';
    root.style.zIndex = '10050';
    root.innerHTML = `
<div class="mc lg" style="max-width:min(96vw,36rem)">
  <div class="mh"><h3 id="gn-inc-v-tit"><i class="fas fa-project-diagram"></i> Incidencia</h3><button type="button" class="cm" data-close="1"><i class="fas fa-times"></i></button></div>
  <div class="mb" style="padding:0 1rem 1rem">
    <div id="gn-inc-v-meta" style="font-size:.8rem;color:var(--tm);margin-bottom:.65rem"></div>
    <div id="gn-inc-v-prog" style="font-size:.85rem;font-weight:600;margin-bottom:.5rem"></div>
    <div id="gn-inc-v-list" style="max-height:min(50vh,320px);overflow:auto;font-size:.82rem;border:1px solid var(--bo);border-radius:.5rem;padding:.35rem"></div>
    <div style="margin-top:.75rem;display:flex;flex-wrap:wrap;gap:.45rem">
      <button type="button" id="gn-inc-v-cerrar-todos" class="bp" style="flex:1;min-width:12rem"><i class="fas fa-check-double"></i> Cerrar todos los pedidos</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
        if (e.target === root) root.classList.remove('active');
    });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => root.classList.remove('active')));
    _modalVista = root;
    return root;
}

async function openVistaIncidencia(incId) {
    const tok = getTok();
    if (!tok) {
        toast('Sin sesión', 'error');
        return;
    }
    const m = buildModalVista();
    const meta = m.querySelector('#gn-inc-v-meta');
    const prog = m.querySelector('#gn-inc-v-prog');
    const list = m.querySelector('#gn-inc-v-list');
    const tit = m.querySelector('#gn-inc-v-tit');
    if (meta) meta.textContent = 'Cargando…';
    if (list) list.innerHTML = '';
    m.classList.add('active');

    try {
        const r = await fetch(apiUrl(`/api/incidencias/${encodeURIComponent(String(incId))}`), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
        const inc = j.incidencia || {};
        const pedidos = Array.isArray(j.pedidos) ? j.pedidos : [];
        const pr = j.progreso || {};

        if (tit) tit.innerHTML = `<i class="fas fa-project-diagram"></i> ${String(inc.nombre || `Incidencia #${inc.id}`).replace(/</g, '&lt;')}`;
        if (meta)
            meta.innerHTML = `<span style="display:block"><strong>Criterio:</strong> ${String(inc.criterio_agrupacion || '—').replace(/</g, '&lt;')} · <strong>Valor:</strong> ${String(inc.valor_criterio || '—').replace(/</g, '&lt;')}</span><span style="display:block;margin-top:.25rem"><strong>Estado:</strong> ${String(inc.estado || '—').replace(/</g, '&lt;')}</span>`;
        if (prog) prog.textContent = `Progreso: ${pr.cerrados ?? 0}/${pr.total ?? pedidos.length} cerrados`;

        if (list) {
            list.innerHTML = pedidos
                .map((row) => {
                    const id = row.id;
                    const np = row.numero_pedido ?? row.np ?? id;
                    const est = String(row.estado || '').trim();
                    const tt = String(row.tipo_trabajo || '').trim();
                    return `<div style="display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;padding:.35rem;border-bottom:1px solid var(--bo)" data-pid="${id}">
            <span style="flex:1;min-width:10rem"><strong>#${np}</strong> · ${tt.replace(/</g, '&lt;')} · <em>${est.replace(/</g, '&lt;')}</em></span>
            <button type="button" class="btn-sm" data-ver="${id}" style="padding:.2rem .45rem;font-size:.72rem">Ver</button>
            ${
                esAdmin()
                    ? `<button type="button" class="btn-sm sec" data-des="${id}" style="padding:.2rem .45rem;font-size:.72rem">Desasociar</button>`
                    : ''
            }
          </div>`;
                })
                .join('');
            list.querySelectorAll('button[data-ver]').forEach((b) => {
                b.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const pid = b.getAttribute('data-ver');
                    const loc = window.app?.p?.find((x) => String(x.id) === String(pid));
                    if (loc && typeof window.detalle === 'function') {
                        m.classList.remove('active');
                        void window.detalle(loc);
                    } else toast('Pedido no está en la lista local. Actualizá la vista.', 'info');
                });
            });
            list.querySelectorAll('button[data-des]').forEach((b) => {
                b.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const pid = b.getAttribute('data-des');
                    if (!confirm('¿Desasociar este pedido de la incidencia?')) return;
                    try {
                        const rr = await fetch(apiUrl(`/api/incidencias/${encodeURIComponent(String(incId))}/desasociar`), {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pedido_id: Number(pid) }),
                        });
                        const jj = await rr.json().catch(() => ({}));
                        if (!rr.ok) throw new Error(jj.error || jj.detail || `HTTP ${rr.status}`);
                        toast('Pedido desasociado', 'success');
                        recargarPedidosYMapa();
                        void openVistaIncidencia(incId);
                    } catch (e) {
                        toast(String(e?.message || e), 'error');
                    }
                });
            });
        }

        const btnAll = m.querySelector('#gn-inc-v-cerrar-todos');
        if (btnAll) {
            btnAll.onclick = async () => {
                if (!esAdmin()) {
                    toast('Solo administradores', 'error');
                    return;
                }
                const abiertos = pedidos.filter((p) => String(p.estado || '').trim() !== 'Cerrado');
                if (!abiertos.length) {
                    toast('No hay pedidos abiertos', 'info');
                    return;
                }
                if (!confirm(`¿Cerrar ${abiertos.length} pedido(s) y marcar la incidencia como cerrada?`)) return;
                btnAll.disabled = true;
                try {
                    for (const p of abiertos) {
                        const pid = p.id;
                        const rr = await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(pid))}`), {
                            method: 'PUT',
                            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ estado: 'Cerrado', avance: 100 }),
                        });
                        if (!rr.ok) {
                            const jj = await rr.json().catch(() => ({}));
                            throw new Error(jj.error || `Pedido ${pid}: HTTP ${rr.status}`);
                        }
                    }
                    await fetch(apiUrl(`/api/incidencias/${encodeURIComponent(String(incId))}`), {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ estado: 'cerrada' }),
                    }).catch(() => {});
                    toast('Pedidos cerrados e incidencia archivada', 'success');
                    m.classList.remove('active');
                    recargarPedidosYMapa();
                } catch (e) {
                    toast(String(e?.message || e), 'error');
                } finally {
                    btnAll.disabled = false;
                }
            };
        }
    } catch (e) {
        if (meta) meta.textContent = String(e?.message || e);
        toast(String(e?.message || e), 'error');
    }
}

function bootObserver() {
    const pl = document.getElementById('pl');
    if (!pl || _moPl) return;
    _moPl = new MutationObserver(() => debouncedEnhance());
    _moPl.observe(pl, { childList: true });
}

export function installIncidenciasUI() {
    void fetchPedidoMap().then(() => debouncedEnhance());
    bootObserver();
    document.addEventListener(
        'visibilitychange',
        () => {
            if (document.visibilityState === 'visible') void fetchPedidoMap().then(() => debouncedEnhance());
        },
        false
    );
}

if (typeof window !== 'undefined') {
    const run = () => {
        try {
            installIncidenciasUI();
        } catch (e) {
            console.warn('[incidencias]', e);
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
}
