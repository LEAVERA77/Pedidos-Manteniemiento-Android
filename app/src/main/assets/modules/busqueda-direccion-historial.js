/**
 * Búsqueda de socios por dirección en padrón (todos los rubros) e historial de reclamos.
 * made by leavera77
 */

import { esc } from './utils.js';
import { toast } from './ui-utils.js';
import { sqlPedidosCoincidenConPersona } from './gn-pedido-match-identificador.js';
import { buscarPersonasPadronPorDireccionFuzzy } from './socios-busqueda-direccion-padron.js';
import { mostrarChipBusquedaDireccionSocios } from './admin-socios-busqueda-limpieza.js';

let _installed = false;
/** @type {{ html: string, q: string } | null} */
let _volverDireccion = null;

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   pedidosFiltroTenantSql: () => Promise<string>,
 *   tenantIdActual: () => number|string,
 *   neonOk: () => boolean,
 *   etiquetaNisSocio: () => string,
 *   normalizarRubroEmpresa?: () => string|null,
 * }} deps
 */
export function installBusquedaDireccionHistorial(deps) {
    if (_installed) return;
    _installed = true;

    const outEl = () => document.getElementById('historial-direccion-result');

    window.buscarPorDireccion = async function buscarPorDireccion() {
        const raw = (document.getElementById('historial-direccion-input')?.value || '').trim();
        const out = outEl();
        if (!raw) {
            toast('Ingresá una calle o dirección para buscar', 'warning');
            return;
        }
        if (raw.length < 2) {
            toast('Ingresá al menos 2 caracteres de dirección', 'warning');
            return;
        }
        if (!out) return;
        if (!deps.neonOk() || typeof deps.sqlSimple !== 'function') {
            toast('Se requiere conexión a la base (Neon).', 'error');
            return;
        }
        _volverDireccion = null;
        out.innerHTML =
            '<div style="padding:.5rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Buscando en el padrón…</div>';
        try {
            const tsql = await deps.pedidosFiltroTenantSql();
            const candidatos = await buscarPersonasPadronPorDireccionFuzzy(
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
            const head = `<div style="font-size:.78rem;color:var(--tm);margin-bottom:.45rem">${avisoLim}<strong>📍 ${rows.length}</strong> resultado(s) para «${escHtml(raw)}»</div>`;
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
                    const btns = [];
                    if (Number.isFinite(id) && id > 0) {
                        btns.push(
                            `<button type="button" class="btn-sm primary" style="margin-top:.35rem;font-size:.76rem;margin-right:.35rem" onclick="verReclamosSocio(${id},'${srcJs}')"><i class="fas fa-list"></i> Ver reclamos (${cnt})</button>`
                        );
                        btns.push(
                            `<button type="button" class="btn-sm" style="margin-top:.35rem;font-size:.76rem;background:#eff6ff;border:1px solid #93c5fd;color:#1e40af" onclick="usarSocioEnPedidoNuevo(${id},'${srcJs}')" title="Si tenés un pedido nuevo abierto en el mapa"><i class="fas fa-map-marker-alt"></i> Cargar en pedido del mapa</button>`
                        );
                    }
                    return `<div style="padding:.55rem .65rem;border:1px solid var(--bo);border-radius:.5rem;background:var(--bg);margin-bottom:.45rem;line-height:1.45">
  <div style="font-weight:700;color:var(--bd)">👤 ${nom}</div>
  <div style="font-size:.78rem;color:var(--tm);margin-top:.15rem"><strong>${lblNis}:</strong> ${nis}${loc ? ` — ${loc}` : ''}</div>
  ${calle ? `<div style="font-size:.76rem;color:var(--tl);margin-top:.12rem">📍 ${calle}</div>` : ''}
  ${tel ? `<div style="font-size:.76rem;color:var(--tl);margin-top:.08rem">📞 ${tel}</div>` : ''}
  <div style="display:flex;flex-wrap:wrap;gap:.25rem">${btns.join('')}</div>
</div>`;
                })
                .join('');
            out.innerHTML = `<div style="display:flex;flex-direction:column;gap:.2rem">${head}${cards}</div>`;
            _volverDireccion = { html: out.innerHTML, q: raw };
            mostrarChipBusquedaDireccionSocios(raw, rows.length);
        } catch (e) {
            const msg = String(e && e.message != null ? e.message : e)
                .replace(/</g, '&lt;')
                .replace(/&/g, '&amp;');
            out.innerHTML = `<span style="color:var(--re)">${msg}</span>`;
        }
    };

    window.volverResultadosDireccion = function volverResultadosDireccion() {
        const out = outEl();
        if (!out || !_volverDireccion || !_volverDireccion.html) return;
        out.innerHTML = _volverDireccion.html;
    };

    const bindDireccionEnter = () => {
        const inp = document.getElementById('historial-direccion-input');
        if (!inp || inp.dataset.gnDireccionEnter === '1') return;
        inp.dataset.gnDireccionEnter = '1';
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const fn = window.buscarPorDireccion;
                if (typeof fn === 'function') void fn();
            }
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindDireccionEnter);
    else bindDireccionEnter();
}
