/**
 * Modal: pedidos abiertos sin coordenadas (desde Estadísticas / geo-calidad).
 * made by leavera77
 */

const MODAL_ID = 'gn-sin-coords-modal';

function esc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;
    const mo = document.createElement('div');
    mo.id = MODAL_ID;
    mo.className = 'mo gn-sin-coords-modal';
    mo.innerHTML = `
<div class="mc" style="max-width:min(26rem,96vw)">
  <div class="mh">
    <h3><i class="fas fa-map-pin"></i> Sin ubicación en mapa</h3>
    <button type="button" class="cm" data-gn-sc-close aria-label="Cerrar"><i class="fas fa-times"></i></button>
  </div>
  <div class="mb gn-sin-coords-body" style="padding:.75rem 1rem 1rem;max-height:min(55vh,22rem);overflow-y:auto"></div>
</div>`;
    document.body.appendChild(mo);
    mo.querySelector('[data-gn-sc-close]')?.addEventListener('click', () => mo.classList.remove('active'));
    mo.addEventListener('click', (e) => {
        if (e.target === mo) mo.classList.remove('active');
    });
}

function abrirPedido(id) {
    const pid = String(id);
    const p = (window.app?.p || []).find((x) => String(x.id) === pid);
    if (p && typeof window.detalle === 'function') {
        document.getElementById(MODAL_ID)?.classList.remove('active');
        void window.detalle(p);
        return;
    }
    if (typeof window.toast === 'function') {
        window.toast('Pedido no cargado en la lista. Actualizá el mapa e intentá de nuevo.', 'info');
    }
}

/**
 * @param {{ apiUrl: function, getApiToken: function }} ctx
 */
export async function abrirModalPedidosSinCoords(ctx) {
    ensureModal();
    const mo = document.getElementById(MODAL_ID);
    const body = mo?.querySelector('.gn-sin-coords-body');
    if (!mo || !body) return;
    const tok = ctx.getApiToken?.();
    if (!tok) return;
    body.innerHTML =
        '<p style="font-size:.85rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Cargando…</p>';
    mo.classList.add('active');
    try {
        const r = await fetch(ctx.apiUrl('/api/admin/pedidos-sin-coords?limit=30'), {
            headers: { Authorization: `Bearer ${tok}` },
            cache: 'no-store',
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText);
        const items = data.items || [];
        if (!items.length) {
            body.innerHTML =
                '<p style="font-size:.85rem;color:var(--ok)"><i class="fas fa-check"></i> No hay pedidos abiertos sin coordenadas.</p>';
            return;
        }
        body.innerHTML = `<p style="font-size:.72rem;color:var(--tl);margin:0 0 .5rem">${esc(items.length)} pedido(s) — tocá para abrir detalle</p>
<ul class="gn-sin-coords-list">${items
            .map(
                (it) =>
                    `<li><button type="button" class="gn-sin-coords-row" data-pid="${esc(it.id)}">
<span class="gn-sin-coords-num">${esc(it.numero_pedido || '#' + it.id)}</span>
<span class="gn-sin-coords-meta">${esc(it.estado)} · ${esc(it.tipo_trabajo || it.cliente || '')}</span>
</button></li>`
            )
            .join('')}</ul>`;
        body.querySelectorAll('[data-pid]').forEach((btn) => {
            btn.addEventListener('click', () => abrirPedido(btn.getAttribute('data-pid')));
        });
    } catch (e) {
        body.innerHTML = `<p style="font-size:.85rem;color:var(--re)">${esc(e.message || 'Error')}</p>`;
    }
}
