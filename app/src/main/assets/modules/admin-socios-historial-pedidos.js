/**
 * Búsqueda de reclamos por NIS/medidor en pestaña Socios (admin): todos los estados, abrir detalle sin cerrar panel.
 * made by leavera77
 */

import { toast } from './ui-utils.js';
import { abrirDetallePedidoPorId } from './gn-abrir-detalle-pedido.js';

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   esc: (v: unknown) => string,
 *   pedidosFiltroTenantSql: () => Promise<string>,
 *   fmtInformeFecha: (v: unknown) => string,
 *   neonOk: () => boolean,
 * }} deps
 */
export function installAdminSociosHistorialPedidos(deps) {
    window.buscarHistorialPorNIS = async function buscarHistorialPorNIS() {
        const raw = (document.getElementById('historial-nis-input')?.value || '').trim();
        const out = document.getElementById('historial-nis-result');
        if (!raw) {
            toast('Ingresá NIS, medidor o N° de socio', 'warning');
            return;
        }
        if (!out) return;
        if (!deps.neonOk() || typeof deps.sqlSimple !== 'function') {
            toast('Se requiere conexión a la base (Neon).', 'error');
            return;
        }
        out.innerHTML =
            '<div style="padding:.5rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Buscando reclamos (incluye cerrados y resueltos)…</div>';
        try {
            const tsql = await deps.pedidosFiltroTenantSql();
            const q = deps.esc(raw);
            const r = await deps.sqlSimple(
                `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, fecha_cierre, descripcion, tipo_trabajo
                 FROM pedidos
                 WHERE 1=1 ${tsql}
                   AND (
                     UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM(${q}))
                     OR UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${q}))
                     OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${q}))
                   )
                 ORDER BY COALESCE(fecha_cierre, fecha_creacion) DESC NULLS LAST
                 LIMIT 200`
            );
            const rows = r.rows || [];
            if (!rows.length) {
                out.innerHTML =
                    '<p style="color:var(--tm);margin:.25rem 0;padding:.35rem .5rem;background:var(--bg);border-radius:.4rem;border:1px dashed var(--bo)">Sin reclamos para ese identificador (todos los estados).</p>';
                return;
            }
            const head = `<div style="font-size:.72rem;color:var(--tm);margin-bottom:.45rem"><strong>${rows.length}</strong> pedido(s) — tocá uno para ver el detalle (el panel Socios sigue abierto)</div>`;
            const lines = rows
                .map((row) => {
                    const np = escHtml(row.numero_pedido || '');
                    const tipo = escHtml(row.tipo_trabajo || '—');
                    const desc = escHtml(String(row.descripcion || '').substring(0, 140));
                    const fecha = escHtml(deps.fmtInformeFecha(row.fecha_creacion));
                    const fc = row.fecha_cierre ? escHtml(deps.fmtInformeFecha(row.fecha_cierre)) : '';
                    const pid = Number(row.id);
                    const est = escHtml(row.estado || '');
                    const clickAttr =
                        Number.isFinite(pid) && pid > 0
                            ? `data-pid="${pid}" class="gn-hist-pedido-open"`
                            : '';
                    return `<button type="button" ${clickAttr} style="width:100%;text-align:left;cursor:pointer;padding:.55rem .65rem;border:1px solid var(--bo);border-radius:.5rem;background:var(--bg);font:inherit;color:inherit;line-height:1.35;margin-bottom:.4rem">
  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .6rem;margin-bottom:.2rem">
    <strong style="color:var(--bd);font-size:.88rem">#${np}</strong>
    <span style="font-size:.74rem;padding:.12rem .4rem;border-radius:999px;background:#e0e7ff;color:#3730a3">${est}</span>
    <span style="font-size:.74rem;color:var(--tm)">${escHtml(row.prioridad || '')}</span>
  </div>
  <div style="font-size:.78rem;color:var(--tm)"><strong>Tipo:</strong> ${tipo}</div>
  <div style="font-size:.78rem;color:var(--tl);margin-top:.15rem">${desc}${row.descripcion && String(row.descripcion).length > 140 ? '…' : ''}</div>
  <div style="font-size:.72rem;color:var(--tl);margin-top:.2rem">Alta: ${fecha}${fc ? ` · Cierre: ${fc}` : ''}</div>
</button>`;
                })
                .join('');
            out.innerHTML = `<div>${head}<div style="display:flex;flex-direction:column">${lines}</div></div>`;
            out.querySelectorAll('.gn-hist-pedido-open').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const pid = Number(btn.getAttribute('data-pid'));
                    void abrirDetallePedidoPorId(pid, {
                        adminTab: 'socios',
                        sqlSimple: deps.sqlSimple,
                        esc: deps.esc,
                        neonOk: deps.neonOk,
                    });
                });
            });
        } catch (e) {
            const msg = escHtml(e?.message || e);
            out.innerHTML = `<span style="color:var(--re)">${msg}</span>`;
        }
    };
}
