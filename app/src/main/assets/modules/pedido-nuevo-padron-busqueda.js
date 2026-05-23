/**
 * Búsqueda en padrón al cargar pedido nuevo (#pm): NIS/socio + apellido (Levenshtein vía API).
 * Admin web y técnico Android (misma UI). made by leavera77
 */

import { toast } from './ui-utils.js';
import { nombreCoincideFuzzy } from './gn-fuzzy-texto-levenshtein.js';
import { aplicarPadronAlFormularioNuevoPedido } from './pedido-nuevo-aplicar-padron.js';
import { aplicarPadronAlPedidoNuevo } from './padron-aplicar-a-pedido-nuevo.js';
import { sqlWhereSocioCatalogoCoincideIdentificador } from './gn-socio-catalogo-match-sql.js';
import { tipoReclamoEsFraudeAnonimo } from './catalogoReclamoPorRubro.js';
import { limpiarProteccionPadronPedidoNuevo } from './pedido-nuevo-nominatim-padron-guard.js';

let _installed = false;
let _nisUltimoValor = '';
let _nisDebounce = null;
let _nisCommitTimer = null;
let _aplicandoPadron = false;

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
 *   tenantIdActual: () => number,
 *   sociosCatalogoTieneTenantId: () => Promise<boolean>,
 *   neonOk: () => boolean,
 *   modoOffline: () => boolean,
 *   apiUrl: (path: string) => string,
 *   getApiToken: () => string|null|undefined,
 *   normalizarRubroEmpresa: (tipo?: unknown) => string|null,
 *   esCooperativaElectricaRubro: () => boolean,
 *   esMunicipioRubro: () => boolean,
 *   esCooperativaAguaRubro: () => boolean,
 *   ensureDistribuidoresCargados?: () => Promise<void>,
 * }} deps
 */
export function initPedidoNuevoPadronBusqueda(deps) {
    if (_installed) return;
    _installed = true;

    const rubro = () => deps.normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
    const padronOpts = () => ({
        esCooperativaElectrica: deps.esCooperativaElectricaRubro(),
        esMunicipio: deps.esMunicipioRubro(),
        esAgua: deps.esCooperativaAguaRubro(),
        ensureDistribuidoresCargados: deps.ensureDistribuidoresCargados,
    });

    function syncFraudeAnonimoUI() {
        const tt = document.getElementById('tt');
        const wrap = document.getElementById('ped-padron-busqueda-wrap');
        const esFraude = tipoReclamoEsFraudeAnonimo(tt?.value || '');
        if (wrap) wrap.style.display = esFraude ? 'none' : '';
        if (esFraude) {
            const cl = document.getElementById('cl');
            const nis = document.getElementById('nis');
            if (cl) {
                cl.removeAttribute('required');
                cl.value = '';
            }
            if (nis) {
                nis.removeAttribute('required');
                nis.value = '';
            }
        }
    }

    async function fetchPadronApi(path, q) {
        const token = deps.getApiToken();
        if (!token) return null;
        const url = `${deps.apiUrl(path)}?q=${encodeURIComponent(q)}`;
        const r = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return null;
        const data = await r.json();
        return data?.matches || [];
    }

    function renderResultados(matches, onPick) {
        const out = document.getElementById('ped-padron-resultados');
        if (!out) return;
        if (!matches?.length) {
            out.innerHTML =
                '<p class="ped-padron-sin-resultados">Sin coincidencias en el padrón. Podés cargar el reclamo igual (NIS/socio opcional).</p>';
            return;
        }
        const items = matches
            .map((m, i) => {
                const id = escHtml(m.identificador || '—');
                const nom = escHtml(m.nombre || '');
                const dom = [m.calle, m.numero, m.localidad].filter(Boolean).join(' ');
                const sub = dom ? `<span class="ped-padron-item-dom">${escHtml(dom)}</span>` : '';
                return `<button type="button" class="ped-padron-item" data-idx="${i}">
          <strong>${nom}</strong> <span class="ped-padron-item-id">${id}</span>${sub}
        </button>`;
            })
            .join('');
        out.innerHTML = items;
        out.querySelectorAll('.ped-padron-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-idx'));
                const row = matches[idx];
                if (row) void onPick(row);
            });
        });
    }

    async function aplicarMatch(row) {
        _aplicandoPadron = true;
        const padronDeps = {
            sqlSimple: deps.sqlSimple,
            esc: deps.esc,
            tenantIdActual: deps.tenantIdActual,
            sociosCatalogoTieneTenantId: deps.sociosCatalogoTieneTenantId,
            normalizarRubroEmpresa: deps.normalizarRubroEmpresa,
            esCooperativaElectricaRubro: deps.esCooperativaElectricaRubro,
            esMunicipioRubro: deps.esMunicipioRubro,
            esCooperativaAguaRubro: deps.esCooperativaAguaRubro,
            ensureDistribuidoresCargados: deps.ensureDistribuidoresCargados,
        };
        try {
            const ident = await aplicarPadronAlPedidoNuevo(padronDeps, row);
            _nisUltimoValor = ident || _nisUltimoValor;
            const out = document.getElementById('ped-padron-resultados');
            if (out) out.innerHTML = '';
            toast('Datos del padrón aplicados al formulario', 'success');
        } finally {
            _aplicandoPadron = false;
        }
    }

    async function buscarPorApellidoDesdeUI() {
        const inp = document.getElementById('ped-padron-apellido');
        const raw = (inp?.value || '').trim();
        const out = document.getElementById('ped-padron-resultados');
        if (!raw || raw.length < 2) {
            toast('Ingresá al menos 2 letras del apellido', 'warning');
            return;
        }
        if (out) {
            out.innerHTML =
                '<div class="ped-padron-cargando"><i class="fas fa-circle-notch fa-spin"></i> Buscando…</div>';
        }
        try {
            let matches = [];
            if (deps.neonOk() && typeof deps.sqlSimple === 'function') {
                matches = await buscarNombreSqlLocal(raw);
            }
            if (!matches.length && !deps.modoOffline()) {
                matches = (await fetchPadronApi('/api/padron-pedido/buscar-nombre', raw)) || [];
            }
            renderResultados(matches, (m) => void aplicarMatch(m));
        } catch (e) {
            if (out) out.innerHTML = '';
            toast('No se pudo buscar en el padrón', 'error');
            console.warn('[ped-padron-apellido]', e?.message || e);
        }
    }

    async function buscarNombreSqlLocal(raw) {
        const tid = deps.tenantIdActual();
        if (!Number.isFinite(tid)) return [];
        const r = rubro();
        const matches = [];
        if (r === 'municipio' || r === 'cooperativa_agua') {
            const rCf = await deps.sqlSimple(
                `SELECT id, nombre, apellido, nis, medidor, numero_cliente, calle, numero_puerta, localidad, barrio
                 FROM clientes_finales
                 WHERE activo = TRUE AND cliente_id = ${deps.esc(tid)}
                 ORDER BY apellido NULLS LAST, nombre NULLS LAST
                 LIMIT 2500`
            );
            for (const row of rCf.rows || []) {
                const nom = [row.nombre, row.apellido]
                    .map((x) => (x != null ? String(x).trim() : ''))
                    .filter(Boolean)
                    .join(' ');
                if (!nombreCoincideFuzzy(raw, nom)) continue;
                matches.push({
                    source: 'clientes_finales',
                    id: row.id,
                    nombre: nom,
                    identificador: row.numero_cliente || row.medidor || row.nis || '',
                    nis: row.nis,
                    medidor: row.medidor,
                    nis_medidor: row.medidor || row.nis,
                    numero_cliente: row.numero_cliente,
                    calle: row.calle,
                    numero: row.numero_puerta,
                    localidad: row.localidad,
                    barrio: row.barrio,
                });
                if (matches.length >= 15) break;
            }
            return matches;
        }
        const hasT = await deps.sociosCatalogoTieneTenantId();
        const wf = hasT ? ` AND tenant_id = ${deps.esc(tid)}` : '';
        const rSc = await deps.sqlSimple(
            `SELECT id, nombre, nis, medidor, nis_medidor, calle, numero, localidad, barrio, telefono,
                    transformador, distribuidor_codigo, tipo_conexion, fases
             FROM socios_catalogo
             WHERE activo = TRUE${wf}
             ORDER BY nombre NULLS LAST
             LIMIT 3200`
        );
        for (const row of rSc.rows || []) {
            if (!nombreCoincideFuzzy(raw, row.nombre)) continue;
            matches.push({
                source: 'socios_catalogo',
                id: row.id,
                nombre: row.nombre,
                identificador: row.nis_medidor || row.medidor || row.nis || '',
                nis: row.nis,
                medidor: row.medidor,
                nis_medidor: row.nis_medidor,
                calle: row.calle,
                numero: row.numero,
                localidad: row.localidad,
                barrio: row.barrio,
                transformador: row.transformador,
                distribuidor_codigo: row.distribuidor_codigo,
                tipo_conexion: row.tipo_conexion,
                fases: row.fases,
            });
            if (matches.length >= 15) break;
        }
        return matches;
    }

    async function rellenarDesdeClientesFinales(raw) {
        const tid = deps.tenantIdActual();
        if (!Number.isFinite(tid)) return;
        const r = await deps.sqlSimple(
            `SELECT nombre, apellido, calle, numero_puerta, barrio, localidad, nis, medidor, numero_cliente
             FROM clientes_finales
             WHERE activo = TRUE AND cliente_id = ${deps.esc(tid)}
               AND (
                 UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${deps.esc(raw)}))
                 OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${deps.esc(raw)}))
                 OR UPPER(TRIM(COALESCE(numero_cliente,''))) = UPPER(TRIM(${deps.esc(raw)}))
               )
             LIMIT 1`
        );
        const row = r.rows?.[0];
        if (!row) return;
        await aplicarPadronAlPedidoNuevo(
            {
                sqlSimple: deps.sqlSimple,
                esc: deps.esc,
                tenantIdActual: deps.tenantIdActual,
                sociosCatalogoTieneTenantId: deps.sociosCatalogoTieneTenantId,
                normalizarRubroEmpresa: deps.normalizarRubroEmpresa,
                esCooperativaElectricaRubro: deps.esCooperativaElectricaRubro,
                esMunicipioRubro: deps.esMunicipioRubro,
                esCooperativaAguaRubro: deps.esCooperativaAguaRubro,
                ensureDistribuidoresCargados: deps.ensureDistribuidoresCargados,
            },
            {
                nombre: [row.nombre, row.apellido]
                    .map((x) => (x != null ? String(x).trim() : ''))
                    .filter(Boolean)
                    .join(' '),
                nis: row.nis,
                medidor: row.medidor,
                nis_medidor: row.medidor || row.nis || row.numero_cliente,
                numero_cliente: row.numero_cliente,
                calle: row.calle,
                numero: row.numero_puerta,
                localidad: row.localidad,
                barrio: row.barrio,
            }
        );
        _nisUltimoValor = raw;
    }

    async function rellenarDesdeSociosCatalogo(raw, opts = {}) {
        if (_aplicandoPadron) return;
        const forzar = !!(opts && opts.forzar);
        const r = rubro();
        if (!r || deps.modoOffline() || !deps.neonOk()) return;
        const inpN = document.getElementById('nis');
        if (!inpN) return;
        const val = (inpN.value || '').trim();
        if (!val) {
            _nisUltimoValor = '';
            limpiarProteccionPadronPedidoNuevo();
            if (r === 'cooperativa_electrica') {
                const tfC = document.getElementById('trafo-pedido');
                if (tfC) tfC.value = '';
            }
            return;
        }
        if (!forzar && val === _nisUltimoValor) return;

        if (r === 'municipio' || r === 'cooperativa_agua') {
            try {
                await rellenarDesdeClientesFinales(val);
            } catch (e) {
                console.warn('[nis→clientes_finales]', e.message);
            }
            return;
        }

        if (r !== 'cooperativa_electrica') return;

        try {
            let matches = (await fetchPadronApi('/api/padron-pedido/buscar-identificador', val)) || [];
            if (!matches.length) {
                const hasSocTNis = await deps.sociosCatalogoTieneTenantId();
                const wfNis = hasSocTNis ? ` AND tenant_id = ${deps.esc(deps.tenantIdActual())}` : '';
                const idMatch = sqlWhereSocioCatalogoCoincideIdentificador(deps.esc, val, '');
                const q = await deps.sqlSimple(
                    `SELECT nombre, telefono, transformador, distribuidor_codigo, tipo_conexion, fases,
                            calle, numero, localidad, barrio, nis, medidor, nis_medidor
                     FROM socios_catalogo
                     WHERE activo = TRUE${wfNis}
                       AND ${idMatch}
                     LIMIT 1`
                );
                const row = q.rows?.[0];
                if (row) {
                    matches = [
                        {
                            source: 'socios_catalogo',
                            id: 0,
                            nombre: row.nombre,
                            identificador: row.nis_medidor || row.medidor || row.nis,
                            ...row,
                        },
                    ];
                }
            }
            if (!matches.length) return;
            if (matches.length > 1) {
                renderResultados(matches, (m) => void aplicarMatch(m));
                _nisUltimoValor = val;
                return;
            }
            await aplicarMatch(matches[0]);
            _nisUltimoValor = val;
        } catch (e) {
            console.warn('[nis→socio]', e.message);
        }
    }

    function programarRellenoDebounced() {
        if (_aplicandoPadron || !rubro()) return;
        clearTimeout(_nisDebounce);
        _nisDebounce = setTimeout(() => {
            void rellenarDesdeSociosCatalogo({ forzar: false });
        }, 480);
    }

    function onNisCommit() {
        clearTimeout(_nisDebounce);
        clearTimeout(_nisCommitTimer);
        _nisCommitTimer = setTimeout(() => {
            void rellenarDesdeSociosCatalogo({ forzar: true });
        }, 90);
    }

    const nisInp = document.getElementById('nis');
    if (nisInp) {
        nisInp.addEventListener('blur', onNisCommit);
        nisInp.addEventListener('focusout', onNisCommit);
        nisInp.addEventListener('input', programarRellenoDebounced);
        nisInp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                onNisCommit();
            }
        });
        nisInp.addEventListener('keyup', (ev) => {
            if (ev.key === 'Enter' || ev.keyCode === 13) {
                ev.preventDefault();
                onNisCommit();
            }
        });
    }

    const pf = document.getElementById('pf');
    const pm = document.getElementById('pm');
    if (pf && pm && nisInp) {
        pf.addEventListener(
            'focusin',
            (ev) => {
                const id = ev.target && ev.target.id;
                if (!id || id === 'nis') return;
                onNisCommit();
            },
            true
        );
        pm.addEventListener(
            'pointerdown',
            (ev) => {
                try {
                    if (document.activeElement !== nisInp) return;
                    const t = ev.target;
                    if (t && (t === nisInp || nisInp.contains(t))) return;
                    onNisCommit();
                } catch (_) {}
            },
            true
        );
    }

    document.getElementById('ped-padron-btn-buscar')?.addEventListener('click', () => {
        void buscarPorApellidoDesdeUI();
    });
    document.getElementById('ped-padron-apellido')?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            void buscarPorApellidoDesdeUI();
        }
    });

    const tt = document.getElementById('tt');
    if (tt) tt.addEventListener('change', syncFraudeAnonimoUI);
    syncFraudeAnonimoUI();

    window.buscarPadronApellidoNuevoPedido = buscarPorApellidoDesdeUI;
}

/** Limpieza al cerrar modales (pegamento en app.js closeAll). */
export function resetPadronNuevoPedidoNisTimers() {
    _nisUltimoValor = '';
    clearTimeout(_nisDebounce);
    clearTimeout(_nisCommitTimer);
    _nisDebounce = null;
    _nisCommitTimer = null;
    limpiarProteccionPadronPedidoNuevo();
}
