/**
 * Búsqueda en padrón al cargar pedido nuevo (#pm / #pm-oficina): NIS, nombre y titular.
 * Admin web y técnico Android (misma UI). made by leavera77
 */

import { nombreCoincideFuzzy } from './gn-fuzzy-texto-levenshtein.js';
import { aplicarPadronAlPedidoNuevo } from './padron-aplicar-a-pedido-nuevo.js';
import { notificarResultadoAplicarPadron } from './padron-aplicar-resultado-ui.js';
import { cargarFilaPadronCompletaDesdeBd } from './padron-fetch-socio-completo.js';
import { tipoReclamoEsFraudeAnonimo } from './catalogoReclamoPorRubro.js';
import { installPedidoNuevoNisBusqueda } from './pedido-nuevo-nis-busqueda.js';
import { toastPedidoPadron, resetToastPedidoPadronDedupe } from './pedido-nuevo-padron-toast.js';
import { normalizarFilaPadronSocio } from './padron-socio-campos-resolver.js';
import { limpiarSuministroPadronPendiente } from './pedido-nuevo-suministro-padron.js';

let _installed = false;
let _aplicandoPadron = false;
/** @type {{ resetNisBusquedaState?: () => void, buscarNisDesdeInput?: (o?: object) => Promise<void> } | null} */
let _nisCtrl = null;
let _ultimoPadronIdentAplicado = '';

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
    const padronDeps = () => ({
        sqlSimple: deps.sqlSimple,
        esc: deps.esc,
        tenantIdActual: deps.tenantIdActual,
        sociosCatalogoTieneTenantId: deps.sociosCatalogoTieneTenantId,
        normalizarRubroEmpresa: deps.normalizarRubroEmpresa,
        esCooperativaElectricaRubro: deps.esCooperativaElectricaRubro,
        esMunicipioRubro: deps.esMunicipioRubro,
        esCooperativaAguaRubro: deps.esCooperativaAguaRubro,
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
                '<p class="ped-padron-sin-resultados">Sin coincidencias. Podés completar el reclamo igual.</p>';
            return;
        }
        const items = matches
            .map((m, i) => {
                const id = escHtml(m.identificador || '—');
                const nom = escHtml(m.nombre || '');
                const dom = [m.calle, m.numero, m.localidad].filter(Boolean).join(' ');
                const dist =
                    m.distribuidor_codigo != null && String(m.distribuidor_codigo).trim()
                        ? `<span class="ped-padron-item-dist">${escHtml(String(m.distribuidor_codigo).trim())}</span>`
                        : '';
                const sub = dom ? `<span class="ped-padron-item-dom">${escHtml(dom)}</span>` : '';
                return `<button type="button" class="ped-padron-item" data-idx="${i}">
          <strong>${nom}</strong> <span class="ped-padron-item-id">${id}</span>${dist}${sub}
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
        if (deps.neonOk() && typeof deps.sqlSimple === 'function') {
            try {
                row = await cargarFilaPadronCompletaDesdeBd(
                    {
                        sqlSimple: deps.sqlSimple,
                        esc: deps.esc,
                        tenantIdActual: deps.tenantIdActual,
                        sociosCatalogoTieneTenantId: deps.sociosCatalogoTieneTenantId,
                    },
                    row
                );
            } catch (_) {}
        }
        try {
            const identKey = String(
                row.nis_medidor || row.medidor || row.nis || row.identificador || ''
            ).trim();
            const mismoSocio = identKey && identKey === _ultimoPadronIdentAplicado;
            const res = await aplicarPadronAlPedidoNuevo(padronDeps(), row);
            const out = document.getElementById('ped-padron-resultados');
            if (out) out.innerHTML = '';
            if (identKey) _ultimoPadronIdentAplicado = identKey;

            notificarResultadoAplicarPadron({
                row: res.row || row,
                rubro: {
                    esCooperativaElectrica: deps.esCooperativaElectricaRubro(),
                    esMunicipio: deps.esMunicipioRubro(),
                    esAgua: deps.esCooperativaAguaRubro(),
                },
                distribuidorOk: res.distribuidorOk,
                identKey,
                mismoSocio,
            });
        } catch (e) {
            toastPedidoPadron('No se pudieron cargar los datos del padrón.', 'error');
            console.warn('[ped-padron-aplicar]', e?.message || e);
        } finally {
            _aplicandoPadron = false;
        }
    }

  async function buscarNombreEnPadron(raw, opts = {}) {
        const q = String(raw || '').trim();
        const out = document.getElementById('ped-padron-resultados');
        if (!q || q.length < 2) {
            if (!opts.silencioso) {
                toastPedidoPadron('Ingresá al menos 2 letras para buscar.', 'warning');
            }
            return;
        }
        if (deps.modoOffline()) {
            toastPedidoPadron('Sin conexión: no se puede buscar en el padrón.', 'warning');
            return;
        }
        if (!deps.getApiToken() && !deps.neonOk()) {
            toastPedidoPadron('Iniciá sesión o activá la base para buscar en el padrón.', 'error');
            return;
        }
        if (out) {
            out.innerHTML =
                '<div class="ped-padron-cargando"><i class="fas fa-circle-notch fa-spin"></i> Buscando en el padrón…</div>';
        }
        try {
            let matches = [];
            if (deps.neonOk() && typeof deps.sqlSimple === 'function') {
                matches = await buscarNombreSqlLocal(q);
            }
            if (!matches.length && !deps.modoOffline()) {
                matches = (await fetchPadronApi('/api/padron-pedido/buscar-nombre', q)) || [];
            }
            if (!matches.length) {
                if (out) {
                    out.innerHTML = `<p class="ped-padron-sin-resultados">No hay coincidencias para «${escHtml(q)}».</p>`;
                }
                if (!opts.silencioso) {
                    toastPedidoPadron(`No se encontró «${q}» en el padrón.`, 'warning');
                }
                return;
            }
            if (matches.length === 1 && opts.autoAplicarUnico) {
                if (out) out.innerHTML = '';
                await aplicarMatch(matches[0]);
                return;
            }
            renderResultados(matches, (m) => void aplicarMatch(m));
            if (!opts.silencioso && matches.length > 1) {
                toastPedidoPadron(`${matches.length} coincidencias: elegí la fila correcta.`, 'info', 3500);
            }
        } catch (e) {
            if (out) out.innerHTML = '';
            toastPedidoPadron('No se pudo buscar en el padrón.', 'error');
            console.warn('[ped-padron-nombre]', e?.message || e);
        }
    }

    async function buscarPorApellidoDesdeUI() {
        const inp = document.getElementById('ped-padron-apellido');
        await buscarNombreEnPadron(inp?.value || '', { silencioso: false });
    }

    async function buscarPorTitularDesdeUI() {
        const inp = document.getElementById('cl');
        await buscarNombreEnPadron(inp?.value || '', { silencioso: false });
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
                    transformador, distribuidor_codigo, tipo_conexion, fases, datos_extra
             FROM socios_catalogo
             WHERE activo = TRUE${wf}
             ORDER BY nombre NULLS LAST
             LIMIT 3200`
        );
        for (const row of rSc.rows || []) {
            if (!nombreCoincideFuzzy(raw, row.nombre)) continue;
            matches.push(
                normalizarFilaPadronSocio({
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
                    telefono: row.telefono,
                    transformador: row.transformador,
                    distribuidor_codigo: row.distribuidor_codigo,
                    tipo_conexion: row.tipo_conexion,
                    fases: row.fases,
                    datos_extra: row.datos_extra,
                })
            );
            if (matches.length >= 15) break;
        }
        return matches;
    }

    _nisCtrl = installPedidoNuevoNisBusqueda(deps, {
        getRubro: rubro,
        getAplicandoPadron: () => _aplicandoPadron,
        aplicarMatch,
        renderResultados,
        toastPedidoPadron,
    });

    document.getElementById('ped-nis-btn-buscar')?.addEventListener('click', () => {
        void _nisCtrl?.buscarNisDesdeInput?.({ forzar: true, silencioso: false });
    });
    document.getElementById('ped-padron-btn-buscar')?.addEventListener('click', () => {
        void buscarPorApellidoDesdeUI();
    });
    document.getElementById('ped-cl-btn-buscar')?.addEventListener('click', () => {
        void buscarPorTitularDesdeUI();
    });

    document.getElementById('ped-padron-apellido')?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            void buscarPorApellidoDesdeUI();
        }
    });
    document.getElementById('cl')?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            void buscarPorTitularDesdeUI();
        }
    });

    const tt = document.getElementById('tt');
    if (tt) tt.addEventListener('change', syncFraudeAnonimoUI);
    syncFraudeAnonimoUI();

    window.buscarPadronApellidoNuevoPedido = buscarPorApellidoDesdeUI;
    window.buscarPadronTitularNuevoPedido = buscarPorTitularDesdeUI;
    window.buscarPadronNisNuevoPedido = () =>
        void _nisCtrl?.buscarNisDesdeInput?.({ forzar: true, silencioso: false });
}

/** Limpieza al cerrar modales (pegamento en app.js closeAll). */
export function resetPadronNuevoPedidoNisTimers() {
    try {
        _nisCtrl?.resetNisBusquedaState?.();
    } catch (_) {}
    try {
        const out = document.getElementById('ped-padron-resultados');
        if (out) out.innerHTML = '';
    } catch (_) {}
    _ultimoPadronIdentAplicado = '';
    try {
        limpiarSuministroPadronPendiente();
    } catch (_) {}
    try {
        resetToastPedidoPadronDedupe();
    } catch (_) {}
}
