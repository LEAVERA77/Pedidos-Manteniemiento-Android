/**
 * Búsqueda de socios por apellido (campo nombre) e historial de reclamos vía Neon.
 * made by leavera77
 */

import { esc } from './utils.js';
import { toast } from './ui-utils.js';
import { abrirDetallePedidoPorId } from './gn-abrir-detalle-pedido.js';
import { sqlPedidosCoincidenConPersona } from './gn-pedido-match-identificador.js';
import { buscarPersonasPadronPorApellidoFuzzy } from './socios-busqueda-apellido-padron.js';

let _installed = false;
/** @type {{ html: string, q: string } | null} */
let _volverApellido = null;

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** @param {{ sqlSimple: Function, tenantIdActual: () => number|string }} d @param {string} alias */
async function sociosWhereTenantSql(d, alias = 's') {
    try {
        const chk = await d.sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='socios_catalogo' AND column_name='tenant_id' LIMIT 1`
        );
        if (chk.rows && chk.rows.length) return ` AND ${alias}.tenant_id = ${esc(d.tenantIdActual())}`;
    } catch (_) {}
    return '';
}

function estadoEmoji(estado) {
    const e = String(estado || '').toLowerCase();
    if (e.includes('cerr') || e.includes('resuel')) return '✅';
    if (e.includes('deriv')) return '🔄';
    if (e.includes('pend')) return '⏳';
    if (e.includes('asign') || e.includes('ejec')) return '🔧';
    return '•';
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   pedidosFiltroTenantSql: () => Promise<string>,
 *   tenantIdActual: () => number|string,
 *   fmtInformeFecha: (v: unknown) => string,
 *   neonOk: () => boolean,
 *   etiquetaNisSocio: () => string,
 *   normalizarRubroEmpresa?: () => string|null,
 * }} deps
 */
export function installBusquedaApellidoHistorial(deps) {
    if (_installed) return;
    _installed = true;

    const outEl = () => document.getElementById('historial-apellido-result');

    window.buscarPorApellido = async function buscarPorApellido() {
        const raw = (document.getElementById('historial-apellido-input')?.value || '').trim();
        const out = outEl();
        if (!raw) {
            toast('Ingresá un apellido para buscar', 'warning');
            return;
        }
        if (!out) return;
        if (!deps.neonOk() || typeof deps.sqlSimple !== 'function') {
            toast('Se requiere conexión a la base (Neon).', 'error');
            return;
        }
        _volverApellido = null;
        out.innerHTML =
            '<div style="padding:.5rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Buscando socios…</div>';
        try {
            const tsql = await deps.pedidosFiltroTenantSql();
            const candidatos = await buscarPersonasPadronPorApellidoFuzzy(
                {
                    sqlSimple: deps.sqlSimple,
                    tenantIdActual: deps.tenantIdActual,
                    esc,
                    normalizarRubroEmpresa: deps.normalizarRubroEmpresa,
                },
                raw
            );
            if (!candidatos.length) {
                out.innerHTML = `<p style="color:var(--tm);margin:.25rem 0;padding:.35rem .5rem;background:var(--bg);border-radius:.4rem;border:1px dashed var(--bo)">Sin socios o vecinos en el padrón que coincidan con «${escHtml(raw)}».</p>`;
                return;
            }
            const rows = [];
            for (const c of candidatos) {
                const src = c.padronSource === 'clientes_finales' ? 'clientes_finales' : 'socios_catalogo';
                const lit = sqlPedidosCoincidenConPersona(esc, c);
                let reclamos_count = 0;
                try {
                    const cr = await deps.sqlSimple(
                        `SELECT COUNT(DISTINCT id)::int AS c FROM pedidos WHERE 1=1 ${tsql} AND ${lit}`
                    );
                    reclamos_count = Number(cr.rows?.[0]?.c) || 0;
                } catch (_) {}
                rows.push({ ...c, padronSource: src, reclamos_count });
            }
            const truncado = candidatos.length >= 80;
            const lblNis = escHtml(deps.etiquetaNisSocio());
            const avisoLim = truncado
                ? `<p style="font-size:.72rem;color:#b45309;margin:0 0 .4rem;line-height:1.35">Se alcanzó el límite de <strong>80</strong> resultados. Refiná la búsqueda si falta alguien.</p>`
                : '';
            const head = `<div style="font-size:.78rem;color:var(--tm);margin-bottom:.45rem">${avisoLim}<strong>📋 ${rows.length}</strong> resultado(s) para «${escHtml(raw)}»</div>`;
            const cards = rows
                .map((row) => {
                    const id = Number(row.id);
                    const nom = escHtml(row.nombre || '—');
                    const nis = escHtml(
                        String(row.nis_medidor || '').trim() ||
                            String(row.nis || '').trim() ||
                            String(row.medidor || '').trim() ||
                            '—'
                    );
                    const loc = escHtml([row.localidad, row.provincia].filter(Boolean).join(' — ') || '');
                    const calle = escHtml(
                        [row.calle, row.numero].filter((x) => String(x || '').trim()).join(' ') || ''
                    );
                    const tel = escHtml(String(row.telefono || '').trim());
                    const cnt = Number(row.reclamos_count) || 0;
                    const src = row.padronSource === 'clientes_finales' ? 'clientes_finales' : 'socios_catalogo';
                    const srcJs = src.replace(/'/g, "\\'");
                    const btn =
                        Number.isFinite(id) && id > 0
                            ? `<button type="button" class="btn-sm primary" style="margin-top:.35rem;font-size:.76rem" onclick="verReclamosSocio(${id},'${srcJs}')"><i class="fas fa-list"></i> Ver reclamos (${cnt})</button>`
                            : '';
                    return `<div style="padding:.55rem .65rem;border:1px solid var(--bo);border-radius:.5rem;background:var(--bg);margin-bottom:.45rem;line-height:1.45">
  <div style="font-weight:700;color:var(--bd)">👤 ${nom}</div>
  <div style="font-size:.78rem;color:var(--tm);margin-top:.15rem"><strong>${lblNis}:</strong> ${nis}${loc ? ` — ${loc}` : ''}</div>
  ${calle ? `<div style="font-size:.76rem;color:var(--tl);margin-top:.12rem">📍 ${calle}</div>` : ''}
  ${tel ? `<div style="font-size:.76rem;color:var(--tl);margin-top:.08rem">📞 ${tel}</div>` : ''}
  ${btn}
</div>`;
                })
                .join('');
            out.innerHTML = `<div style="display:flex;flex-direction:column;gap:.2rem">${head}${cards}</div>`;
            _volverApellido = { html: out.innerHTML, q: raw };
        } catch (e) {
            const msg = String(e && e.message != null ? e.message : e)
                .replace(/</g, '&lt;')
                .replace(/&/g, '&amp;');
            out.innerHTML = `<span style="color:var(--re)">${msg}</span>`;
        }
    };

    window.verReclamosSocio = async function verReclamosSocio(socioId, padronSource) {
        const out = outEl();
        const sid = Number(socioId);
        const src = padronSource === 'clientes_finales' ? 'clientes_finales' : 'socios_catalogo';
        if (!out || !Number.isFinite(sid) || sid <= 0) return;
        if (!deps.neonOk() || typeof deps.sqlSimple !== 'function') {
            toast('Se requiere conexión a la base (Neon).', 'error');
            return;
        }
        out.innerHTML =
            '<div style="padding:.5rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Cargando reclamos…</div>';
        try {
            let socio = null;
            if (src === 'clientes_finales') {
                const tid = deps.tenantIdActual();
                const sr = await deps.sqlSimple(
                    `SELECT id, nis, medidor, numero_cliente, nombre, apellido
                     FROM clientes_finales
                     WHERE id = ${esc(sid)} AND cliente_id = ${esc(tid)} AND COALESCE(activo, TRUE) = TRUE
                     LIMIT 1`
                );
                const row = sr.rows?.[0];
                if (row) {
                    socio = {
                        nombre: [row.nombre, row.apellido]
                            .map((x) => (x != null ? String(x).trim() : ''))
                            .filter(Boolean)
                            .join(' '),
                        nis: row.nis,
                        medidor: row.medidor,
                        nis_medidor: row.medidor || row.nis || row.numero_cliente,
                        numero_cliente: row.numero_cliente,
                    };
                }
            } else {
                const wSoc = await sociosWhereTenantSql(deps, 's');
                const sr = await deps.sqlSimple(
                    `SELECT id, nis_medidor, nis, medidor, nombre FROM socios_catalogo s WHERE s.id = ${esc(sid)} ${wSoc} LIMIT 1`
                );
                socio = sr.rows && sr.rows[0];
            }
            if (!socio) {
                out.innerHTML = '<span style="color:var(--re)">Socio no encontrado.</span>';
                return;
            }
            const nombre = socio.nombre || 'Socio';
            const tsql = await deps.pedidosFiltroTenantSql();
            const lit = sqlPedidosCoincidenConPersona(esc, socio);
            const qr = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, fecha_cierre, descripcion, tipo_trabajo
                FROM pedidos
                WHERE 1=1 ${tsql} AND ${lit}
                ORDER BY COALESCE(fecha_cierre, fecha_creacion) DESC NULLS LAST
                LIMIT 500`;
            const pr = await deps.sqlSimple(qr);
            const rows = pr.rows || [];

            const escH = escHtml;
            const nomEsc = escHtml(nombre);
            const back =
                _volverApellido && _volverApellido.html
                    ? `<button type="button" class="btn-sm" style="margin:.35rem 0 .55rem;font-size:.78rem;background:var(--bg);border:1px solid var(--bo)" onclick="volverResultadosApellido()">⬅ Volver a resultados</button>`
                    : '';
            if (!rows.length) {
                out.innerHTML = `<div style="font-size:.85rem;color:var(--bd);font-weight:700">📋 Reclamos de ${nomEsc} (0)</div>${back}<p style="color:var(--tm);margin-top:.35rem">Sin reclamos vinculados por NIS/medidor en este tenant.</p>`;
                return;
            }
            const lines = rows
                .map((row) => {
                    const np = escH(row.numero_pedido || '');
                    const tipo = escH(row.tipo_trabajo || '—');
                    const desc = escH(String(row.descripcion || '').substring(0, 160));
                    const fecha = escH(deps.fmtInformeFecha(row.fecha_creacion));
                    const est = escH(row.estado || '');
                    const emoji = estadoEmoji(row.estado);
                    const pid = Number(row.id);
                    const dataPid =
                        Number.isFinite(pid) && pid > 0 ? `data-pid="${pid}" class="gn-hist-pedido-open"` : '';
                    return `<button type="button" class="nis-historial-item" ${dataPid} style="width:100%;text-align:left;cursor:pointer;padding:.55rem .65rem;border:1px solid var(--bo);border-radius:.5rem;background:var(--bg);font:inherit;color:inherit;line-height:1.35;margin-bottom:.4rem">
  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .5rem;margin-bottom:.2rem">
    <strong style="color:var(--bd);font-size:.88rem">#${np}</strong>
    <span style="font-size:.78rem;color:var(--tm)">${tipo}</span>
    <span style="font-size:.72rem;color:var(--tl);margin-left:auto">${fecha}</span>
  </div>
  <div style="font-size:.78rem;color:var(--tm)"><strong>Estado:</strong> ${est} ${emoji}</div>
  <div style="font-size:.76rem;color:var(--tl);margin-top:.15rem">${desc}${row.descripcion && String(row.descripcion).length > 160 ? '…' : ''}</div>
</button>`;
                })
                .join('');
            out.innerHTML = `<div style="font-size:.85rem;color:var(--bd);font-weight:700;margin-bottom:.25rem">📋 Reclamos de ${nomEsc} (${rows.length}) — tocá para abrir detalle</div>${back}<div style="display:flex;flex-direction:column" id="gn-reclamos-socio-list">${lines}</div>`;
            out.querySelectorAll('.gn-hist-pedido-open').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const pid = Number(btn.getAttribute('data-pid'));
                    void abrirDetallePedidoPorId(pid, {
                        adminTab: 'socios',
                        sqlSimple: deps.sqlSimple,
                        esc,
                        neonOk: deps.neonOk,
                    });
                });
            });
        } catch (e) {
            const msg = String(e && e.message != null ? e.message : e)
                .replace(/</g, '&lt;')
                .replace(/&/g, '&amp;');
            out.innerHTML = `<span style="color:var(--re)">${msg}</span>`;
        }
    };

    window.volverResultadosApellido = function volverResultadosApellido() {
        const out = outEl();
        if (!out || !_volverApellido || !_volverApellido.html) return;
        out.innerHTML = _volverApellido.html;
    };

    const bindApellidoEnter = () => {
        const inp = document.getElementById('historial-apellido-input');
        if (!inp || inp.dataset.gnApellidoEnter === '1') return;
        inp.dataset.gnApellidoEnter = '1';
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const fn = window.buscarPorApellido;
                if (typeof fn === 'function') void fn();
            }
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindApellidoEnter);
    else bindApellidoEnter();
}
