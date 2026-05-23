/**
 * Admin → Socios: búsqueda en padrón por identificador (NIS / socio / vecino) y reclamos.
 * made by leavera77
 */

import { esc } from './utils.js';
import { toast } from './ui-utils.js';
import { sqlPedidosCoincidenConPersona } from './gn-pedido-match-identificador.js';
import { buscarPersonasPadronPorApellidoFuzzy } from './socios-busqueda-apellido-padron.js';
import { etiquetaHistorialNisBusquedaAdmin } from './pedido-form-labels-rubro.js';

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * @param {{
 *   sqlSimple: Function,
 *   tenantIdActual: () => number|string,
 *   pedidosFiltroTenantSql: () => Promise<string>,
 *   neonOk: () => boolean,
 *   normalizarRubroEmpresa?: () => string|null,
 *   apiUrl?: (path: string) => string,
 *   getApiToken?: () => string|null|undefined,
 *   etiquetaNisSocio?: () => string,
 * }} deps
 */
export function installAdminSociosBusquedaPadron(deps) {
    function lblIdent() {
        if (typeof deps.etiquetaNisSocio === 'function') return deps.etiquetaNisSocio();
        return etiquetaHistorialNisBusquedaAdmin();
    }

    function syncBotonesIdentificador() {
        const t = lblIdent();
        const b1 = document.getElementById('btn-buscar-padron-ident');
        const b2 = document.getElementById('btn-buscar-padron-ident-apellido');
        const txt = `Buscar por ${t}`;
        if (b1) b1.textContent = txt.replace(/^Buscar por /, '').length < 24 ? txt : `Buscar ${t}`;
        if (b2) {
            b2.title = txt;
            b2.innerHTML = `<i class="fas fa-id-card"></i> <span class="btn-padron-ident-lbl">${escHtml(t)}</span>`;
        }
    }

    async function fetchPadronIdentificadorApi(q) {
        const token = typeof deps.getApiToken === 'function' ? deps.getApiToken() : null;
        if (!token || typeof deps.apiUrl !== 'function') return null;
        const url = `${deps.apiUrl('/api/padron-pedido/buscar-identificador')}?q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return null;
        const data = await r.json();
        return data?.matches || [];
    }

    async function buscarIdentificadorSqlLocal(raw) {
        const tid = Number(deps.tenantIdActual());
        if (!Number.isFinite(tid) || tid < 1) return [];
        const rubro =
            typeof deps.normalizarRubroEmpresa === 'function' ? deps.normalizarRubroEmpresa() : null;
        const matches = [];
        const seen = new Set();
        const push = (m) => {
            const k = `${m.padronSource}:${m.id}`;
            if (seen.has(k)) return;
            seen.add(k);
            matches.push(m);
        };

        let wSoc = '';
        try {
            const chk = await deps.sqlSimple(
                `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='socios_catalogo' AND column_name='tenant_id' LIMIT 1`
            );
            if (chk.rows?.length) wSoc = ` AND tenant_id = ${esc(tid)}`;
        } catch (_) {}

        try {
            const r = await deps.sqlSimple(
                `SELECT id, nombre, nis, medidor, nis_medidor, calle, numero, localidad, barrio, telefono,
                        transformador, distribuidor_codigo
                 FROM socios_catalogo
                 WHERE COALESCE(activo, TRUE) = TRUE${wSoc}
                   AND (
                     UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM(${esc(raw)}))
                     OR UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${esc(raw)}))
                     OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${esc(raw)}))
                   )
                 LIMIT 12`
            );
            for (const row of r.rows || []) {
                push({ ...row, padronSource: 'socios_catalogo' });
            }
        } catch (_) {}

        if ((rubro === 'municipio' || rubro === 'cooperativa_agua') && matches.length < 12) {
            try {
                const r2 = await deps.sqlSimple(
                    `SELECT id, nombre, apellido, nis, medidor, numero_cliente, calle, numero_puerta, localidad, barrio, telefono
                     FROM clientes_finales
                     WHERE COALESCE(activo, TRUE) = TRUE AND cliente_id = ${esc(tid)}
                       AND (
                         UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${esc(raw)}))
                         OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${esc(raw)}))
                         OR UPPER(TRIM(COALESCE(numero_cliente,''))) = UPPER(TRIM(${esc(raw)}))
                       )
                     LIMIT 12`
                );
                for (const row of r2.rows || []) {
                    const nom = [row.nombre, row.apellido]
                        .map((x) => (x != null ? String(x).trim() : ''))
                        .filter(Boolean)
                        .join(' ');
                    push({
                        id: row.id,
                        nombre: nom,
                        nis_medidor: row.medidor || row.nis || row.numero_cliente,
                        nis: row.nis,
                        medidor: row.medidor,
                        numero_cliente: row.numero_cliente,
                        calle: row.calle,
                        numero: row.numero_puerta,
                        localidad: row.localidad,
                        barrio: row.barrio,
                        telefono: row.telefono,
                        padronSource: 'clientes_finales',
                    });
                }
            } catch (_) {}
        }
        return matches;
    }

    window.buscarPadronPorIdentificador = async function buscarPadronPorIdentificador() {
        const raw = (
            document.getElementById('historial-nis-input')?.value ||
            document.getElementById('historial-apellido-input')?.value ||
            ''
        ).trim();
        const out = document.getElementById('historial-apellido-result');
        if (!raw || raw.length < 2) {
            toast(`Ingresá ${lblIdent()} (mín. 2 caracteres)`, 'warning');
            return;
        }
        if (!out) return;
        if (!deps.neonOk()) {
            toast('Se requiere conexión a la base (Neon).', 'error');
            return;
        }
        out.innerHTML =
            '<div style="padding:.5rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Buscando en el padrón…</div>';
        try {
            let matches = (await fetchPadronIdentificadorApi(raw)) || [];
            if (!matches.length) {
                matches = await buscarIdentificadorSqlLocal(raw);
            }
            if (!matches.length) {
                out.innerHTML = `<p style="color:var(--tm);margin:.25rem 0;padding:.35rem .5rem;background:var(--bg);border-radius:.4rem;border:1px dashed var(--bo)">Sin coincidencias en el padrón para «${escHtml(raw)}».</p>`;
                return;
            }
            const tsql = await deps.pedidosFiltroTenantSql();
            const lblNis = escHtml(lblIdent());
            const cards = [];
            for (const row of matches.slice(0, 25)) {
                const id = Number(row.id);
                const src =
                    row.source === 'clientes_finales' || row.padronSource === 'clientes_finales'
                        ? 'clientes_finales'
                        : 'socios_catalogo';
                const lit = sqlPedidosCoincidenConPersona(esc, row);
                let cnt = 0;
                try {
                    const cr = await deps.sqlSimple(
                        `SELECT COUNT(DISTINCT id)::int AS c FROM pedidos WHERE 1=1 ${tsql} AND ${lit}`
                    );
                    cnt = Number(cr.rows?.[0]?.c) || 0;
                } catch (_) {}
                const nom = escHtml(row.nombre || '—');
                const nis = escHtml(
                    String(row.identificador || '').trim() ||
                        String(row.nis_medidor || '').trim() ||
                        String(row.nis || '').trim() ||
                        String(row.medidor || '').trim() ||
                        String(row.numero_cliente || '').trim() ||
                        '—'
                );
                const loc = escHtml([row.localidad, row.provincia].filter(Boolean).join(' — ') || '');
                const calle = escHtml(
                    [row.calle, row.numero].filter((x) => String(x || '').trim()).join(' ') || ''
                );
                const srcJs = src.replace(/'/g, "\\'");
                const btns = [];
                if (Number.isFinite(id) && id > 0) {
                    btns.push(
                        `<button type="button" class="btn-sm primary" style="margin-top:.35rem;font-size:.76rem;margin-right:.35rem" onclick="verReclamosSocio(${id},'${srcJs}')"><i class="fas fa-list"></i> Ver reclamos (${cnt})</button>`
                    );
                    btns.push(
                        `<button type="button" class="btn-sm" style="margin-top:.35rem;font-size:.76rem;background:#eff6ff;border:1px solid #93c5fd;color:#1e40af" onclick="usarSocioEnPedidoNuevo(${id},'${srcJs}')"><i class="fas fa-map-marker-alt"></i> Cargar en pedido del mapa</button>`
                    );
                }
                cards.push(`<div style="padding:.55rem .65rem;border:1px solid var(--bo);border-radius:.5rem;background:var(--bg);margin-bottom:.45rem;line-height:1.45">
  <div style="font-weight:700;color:var(--bd)">👤 ${nom}</div>
  <div style="font-size:.78rem;color:var(--tm);margin-top:.15rem"><strong>${lblNis}:</strong> ${nis}${loc ? ` — ${loc}` : ''}</div>
  ${calle ? `<div style="font-size:.76rem;color:var(--tl);margin-top:.12rem">📍 ${calle}</div>` : ''}
  <div style="display:flex;flex-wrap:wrap;gap:.25rem">${btns.join('')}</div>
</div>`);
            }
            out.innerHTML = `<div style="font-size:.78rem;color:var(--tm);margin-bottom:.45rem"><strong>📋 ${cards.length}</strong> en padrón para «${escHtml(raw)}»</div>${cards.join('')}`;
            const inpNis = document.getElementById('historial-nis-input');
            if (inpNis && !inpNis.value.trim()) inpNis.value = raw;
            if (typeof window.buscarHistorialPorNIS === 'function') void window.buscarHistorialPorNIS();
        } catch (e) {
            out.innerHTML = `<span style="color:var(--re)">${escHtml(e?.message || e)}</span>`;
        }
    };

    window.buscarPorApellidoOIdentificador = async function buscarPorApellidoOIdentificador() {
        const apellido = (document.getElementById('historial-apellido-input')?.value || '').trim();
        if (!apellido) {
            toast('Ingresá un apellido o nombre', 'warning');
            return;
        }
        const digits = apellido.replace(/\D/g, '');
        if (digits.length >= 6 && digits.length >= apellido.replace(/\s/g, '').length * 0.6) {
            const nisInp = document.getElementById('historial-nis-input');
            if (nisInp) nisInp.value = apellido;
            return window.buscarPadronPorIdentificador();
        }
        if (typeof window.buscarPorApellido === 'function') return window.buscarPorApellido();
    };

    syncBotonesIdentificador();
    window.syncSociosBusquedaPadronLabels = syncBotonesIdentificador;
}
