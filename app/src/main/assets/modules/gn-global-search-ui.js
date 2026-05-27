/**
 * Búsqueda global de pedidos (Ctrl+K) — oleada 3.
 * made by leavera77
 */

import { abrirDetallePedidoPorId } from './gn-abrir-detalle-pedido.js';

const MODAL_ID = 'gn-global-search-modal';
let _debounce = null;

function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function apiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

function getTok() {
    return typeof window.getApiToken === 'function' ? window.getApiToken() : '';
}

function isTypingTarget(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'select' || el.isContentEditable) return true;
    if (tag !== 'input' && tag !== 'textarea') return false;
    if (el.id === 'gn-global-search-input') return false;
    const type = String(el.type || '').toLowerCase();
    return type !== 'checkbox' && type !== 'radio' && type !== 'button';
}

function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;
    const mo = document.createElement('div');
    mo.id = MODAL_ID;
    mo.className = 'mo gn-global-search-modal';
    mo.innerHTML = `
<div class="mc gn-global-search-mc">
  <div class="mh">
    <h3><i class="fas fa-search" aria-hidden="true"></i> Buscar pedido</h3>
    <button type="button" class="cm" data-gn-gs-close aria-label="Cerrar"><i class="fas fa-times"></i></button>
  </div>
  <div class="mb" style="padding:.75rem 1rem 1rem">
    <input type="search" id="gn-global-search-input" class="gn-global-search-input" placeholder="Nº, NIS, medidor, teléfono, nombre o dirección…" autocomplete="off" />
    <p class="gn-global-search-hint">Mínimo 2 caracteres · atajo <kbd>Ctrl</kbd>+<kbd>K</kbd></p>
    <div id="gn-global-search-results" class="gn-global-search-results" role="listbox"></div>
  </div>
</div>`;
    document.body.appendChild(mo);
    mo.querySelector('[data-gn-gs-close]')?.addEventListener('click', cerrarBusquedaGlobal);
    mo.addEventListener('click', (e) => {
        if (e.target === mo) cerrarBusquedaGlobal();
    });
    const inp = mo.querySelector('#gn-global-search-input');
    inp?.addEventListener('input', () => {
        clearTimeout(_debounce);
        _debounce = setTimeout(() => void ejecutarBusquedaGlobal(), 280);
    });
    inp?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cerrarBusquedaGlobal();
        }
        if (e.key === 'Enter') {
            const first = document.querySelector('#gn-global-search-results [data-pid]');
            if (first) {
                e.preventDefault();
                void abrirPedidoDesdeFila(first.getAttribute('data-pid'));
            }
        }
    });
}

async function abrirPedidoDesdeFila(pidAttr) {
    const pid = Number(pidAttr);
    if (!Number.isFinite(pid)) return;
    cerrarBusquedaGlobal();
    await abrirDetallePedidoPorId(pid);
}

export function abrirBusquedaGlobal() {
    const tok = getTok();
    if (!tok) {
        window.toast?.('Iniciá sesión para buscar pedidos', 'warn');
        return;
    }
    ensureModal();
    injectSearchButton();
    const mo = document.getElementById(MODAL_ID);
    if (!mo) return;
    mo.classList.add('active');
    const inp = document.getElementById('gn-global-search-input');
    if (inp) {
        inp.value = '';
        setTimeout(() => inp.focus(), 50);
    }
    const res = document.getElementById('gn-global-search-results');
    if (res) res.innerHTML = '<p class="gn-global-search-empty">Escribí para buscar…</p>';
}

export function cerrarBusquedaGlobal() {
    document.getElementById(MODAL_ID)?.classList.remove('active');
}

async function ejecutarBusquedaGlobal() {
    const host = document.getElementById('gn-global-search-results');
    const q = document.getElementById('gn-global-search-input')?.value?.trim() || '';
    if (!host) return;
    if (q.length < 2) {
        host.innerHTML = '<p class="gn-global-search-empty">Escribí al menos 2 caracteres</p>';
        return;
    }
    host.innerHTML = '<p class="gn-global-search-empty"><i class="fas fa-circle-notch fa-spin"></i> Buscando…</p>';
    try {
        if (typeof window.asegurarJwtApiRest === 'function') {
            await window.asegurarJwtApiRest();
        }
        const r = await fetch(apiUrl(`/api/pedidos/buscar-global?q=${encodeURIComponent(q)}&limit=30`), {
            headers: { Authorization: `Bearer ${getTok()}` },
            cache: 'no-store',
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || data.detail || r.statusText);
        const rows = data.resultados || [];
        if (!rows.length) {
            host.innerHTML = '<p class="gn-global-search-empty">Sin resultados</p>';
            return;
        }
        host.innerHTML = rows
            .map((p) => {
                const id = p.id;
                const num =
                    p.numero_pedido != null && String(p.numero_pedido).trim()
                        ? `#${p.numero_pedido}`
                        : `#${id}`;
                const sub = [p.nis, p.medidor, p.telefono_contacto].filter(Boolean).join(' · ');
                const nom = p.cliente_nombre || p.cliente || 'Sin nombre';
                return `<button type="button" class="gn-global-search-row" data-pid="${esc(id)}" role="option">
  <span class="gn-global-search-row-t">${esc(num)} · ${esc(p.estado || '—')}</span>
  <span class="gn-global-search-row-s">${esc(nom)}</span>
  <span class="gn-global-search-row-m">${esc(p.cliente_direccion || '')}${sub ? ` · ${esc(sub)}` : ''}</span>
</button>`;
            })
            .join('');
        host.querySelectorAll('[data-pid]').forEach((btn) => {
            btn.addEventListener('click', () => void abrirPedidoDesdeFila(btn.getAttribute('data-pid')));
        });
    } catch (e) {
        host.innerHTML = `<p class="gn-global-search-empty">${esc(e.message || 'Error')}</p>`;
    }
}

function injectSearchButton() {
    if (document.getElementById('btn-global-search')) return;
    const slot = document.querySelector('#ms .hd-slot-right');
    if (!slot) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-global-search';
    btn.className = 'ib';
    btn.title = 'Buscar pedido (Ctrl+K)';
    btn.innerHTML = '<i class="fas fa-search" aria-hidden="true"></i>';
    btn.addEventListener('click', () => abrirBusquedaGlobal());
    const ref = document.getElementById('btn-keyboard-shortcuts') || document.getElementById('btn-dashboard-gerencia') || document.getElementById('btn-admin');
    if (ref) slot.insertBefore(btn, ref);
    else slot.prepend(btn);
}

function onGlobalShortcut(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key !== 'k' && e.key !== 'K') return;
    if (isTypingTarget(document.activeElement)) return;
    e.preventDefault();
    e.stopPropagation();
    abrirBusquedaGlobal();
}

function initGnGlobalSearch() {
    injectSearchButton();
    window.addEventListener('keydown', onGlobalShortcut, true);
    document.addEventListener('gn-ms-visible', injectSearchButton);
    window.abrirBusquedaGlobal = abrirBusquedaGlobal;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGnGlobalSearch, { once: true });
    } else initGnGlobalSearch();
}
