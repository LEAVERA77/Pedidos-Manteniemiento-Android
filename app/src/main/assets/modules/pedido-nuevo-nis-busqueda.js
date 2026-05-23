/**
 * Campo #nis en pedido nuevo: búsqueda al Enter / blur con errores claros y carga completa del padrón.
 * made by leavera77
 */

import { toast } from './ui-utils.js';
import { sqlWhereSocioCatalogoCoincideIdentificador } from './gn-socio-catalogo-match-sql.js';
import { limpiarProteccionPadronPedidoNuevo } from './pedido-nuevo-nominatim-padron-guard.js';

const COLS_SOCIO = `id, nombre, telefono, transformador, distribuidor_codigo, tipo_conexion, fases,
        calle, numero, localidad, barrio, nis, medidor, nis_medidor`;

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
 * }} deps
 * @param {{
 *   getRubro: () => string|null,
 *   getAplicandoPadron: () => boolean,
 *   aplicarMatch: (row: Record<string, unknown>) => Promise<void>,
 *   renderResultados: (matches: unknown[], onPick: (row: unknown) => void) => void,
 * }} hooks
 */
export function installPedidoNuevoNisBusqueda(deps, hooks) {
    let _nisUltimoValor = '';
    let _nisDebounce = null;
    let _nisCommitEnCurso = false;
    let _nisBuscando = false;

    function setNisEstadoUi(estado) {
        const inp = document.getElementById('nis');
        if (!inp) return;
        if (estado === 'buscando') {
            inp.setAttribute('aria-busy', 'true');
            inp.classList.add('gn-nis-buscando');
        } else {
            inp.removeAttribute('aria-busy');
            inp.classList.remove('gn-nis-buscando');
        }
    }

    /**
     * @param {string} q
     */
    async function fetchIdentificadorApi(q) {
        const token = deps.getApiToken();
        if (!token) return { matches: [], error: null, skipped: true };
        const url = `${deps.apiUrl('/api/padron-pedido/buscar-identificador')}?q=${encodeURIComponent(q)}`;
        try {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                const msg =
                    (data && typeof data.error === 'string' && data.error) ||
                    `No se pudo buscar en el servidor (${r.status}).`;
                return { matches: [], error: msg, skipped: false };
            }
            if (data && data.ok === false) {
                return {
                    matches: [],
                    error: (data.error && String(data.error)) || 'Búsqueda rechazada por el servidor.',
                    skipped: false,
                };
            }
            return { matches: data?.matches || [], error: null, skipped: false };
        } catch (e) {
            return {
                matches: [],
                error: 'Sin respuesta del servidor. Revisá la conexión o volvé a intentar.',
                skipped: false,
            };
        }
    }

    /**
     * @param {string} val
     */
    async function buscarIdentificadorSqlLocal(val) {
        const tid = deps.tenantIdActual();
        if (!Number.isFinite(tid) || typeof deps.sqlSimple !== 'function') return [];
        const matches = [];
        const seen = new Set();

        const push = (row) => {
            const key = `${row.source}:${row.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            matches.push(row);
        };

        try {
            const rCf = await deps.sqlSimple(
                `SELECT id, nombre, apellido, nis, medidor, numero_cliente, calle, numero_puerta, localidad, barrio, telefono
                 FROM clientes_finales
                 WHERE COALESCE(activo, TRUE) = TRUE AND cliente_id = ${deps.esc(tid)}
                   AND (
                     UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${deps.esc(val)}))
                     OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${deps.esc(val)}))
                     OR UPPER(TRIM(COALESCE(numero_cliente,''))) = UPPER(TRIM(${deps.esc(val)}))
                   )
                 ORDER BY id ASC
                 LIMIT 12`
            );
            for (const row of rCf.rows || []) {
                const nom = [row.nombre, row.apellido]
                    .map((x) => (x != null ? String(x).trim() : ''))
                    .filter(Boolean)
                    .join(' ');
                push({
                    source: 'clientes_finales',
                    id: row.id,
                    nombre: nom || 'Vecino',
                    identificador: row.numero_cliente || row.medidor || row.nis || '',
                    nis: row.nis,
                    medidor: row.medidor,
                    nis_medidor: row.medidor || row.nis || row.numero_cliente,
                    numero_cliente: row.numero_cliente,
                    calle: row.calle,
                    numero: row.numero_puerta,
                    localidad: row.localidad,
                    barrio: row.barrio,
                    telefono: row.telefono,
                });
            }
        } catch (e) {
            console.warn('[nis-sql] clientes_finales', e?.message || e);
        }

        try {
            const hasT = await deps.sociosCatalogoTieneTenantId();
            const wf = hasT ? ` AND tenant_id = ${deps.esc(tid)}` : '';
            const idMatch = sqlWhereSocioCatalogoCoincideIdentificador(deps.esc, val, '');
            const rSc = await deps.sqlSimple(
                `SELECT ${COLS_SOCIO}
                 FROM socios_catalogo
                 WHERE COALESCE(activo, TRUE) = TRUE${wf}
                   AND ${idMatch}
                 ORDER BY id ASC
                 LIMIT 12`
            );
            for (const row of rSc.rows || []) {
                push({
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
                });
            }
        } catch (e) {
            console.warn('[nis-sql] socios_catalogo', e?.message || e);
        }

        return matches;
    }

    /**
     * @param {string} val
     */
    async function buscarMatchesPorIdentificador(val) {
        const avisos = [];
        let matches = [];

        const api = await fetchIdentificadorApi(val);
        if (api.error) avisos.push(api.error);
        if (api.matches?.length) matches = api.matches;

        if (!matches.length && deps.neonOk()) {
            try {
                const local = await buscarIdentificadorSqlLocal(val);
                if (local.length) matches = local;
            } catch (e) {
                avisos.push('No se pudo consultar el padrón en la base local.');
                console.warn('[nis-sql]', e?.message || e);
            }
        }

        return { matches, avisos };
    }

    /**
     * @param {{ forzar?: boolean, silencioso?: boolean }} [opts]
     */
    async function buscarNisDesdeInput(opts = {}) {
        if (hooks.getAplicandoPadron() || _nisBuscando) return;
        const rubro = hooks.getRubro();
        if (!rubro) return;

        const inpN = document.getElementById('nis');
        if (!inpN) return;
        const val = String(inpN.value || '').trim();

        if (!val) {
            _nisUltimoValor = '';
            limpiarProteccionPadronPedidoNuevo();
            const out = document.getElementById('ped-padron-resultados');
            if (out) out.innerHTML = '';
            if (rubro === 'cooperativa_electrica') {
                const tfC = document.getElementById('trafo-pedido');
                if (tfC) tfC.value = '';
            }
            return;
        }

        if (!opts.forzar && val === _nisUltimoValor) return;

        if (val.length < 2) {
            if (!opts.silencioso) {
                toast('Ingresá al menos 2 caracteres (NIS, medidor o número de cliente).', 'warning');
            }
            return;
        }

        if (deps.modoOffline()) {
            toast('Sin conexión: no se puede buscar en el padrón.', 'warning');
            return;
        }

        if (!deps.getApiToken() && !deps.neonOk()) {
            toast('Iniciá sesión o activá la conexión a la base para buscar en el padrón.', 'error');
            return;
        }

        _nisBuscando = true;
        setNisEstadoUi('buscando');
        const out = document.getElementById('ped-padron-resultados');
        if (out && !opts.silencioso) {
            out.innerHTML =
                '<div class="ped-padron-cargando"><i class="fas fa-circle-notch fa-spin"></i> Buscando en el padrón…</div>';
        }

        try {
            const { matches, avisos } = await buscarMatchesPorIdentificador(val);

            if (!matches.length) {
                if (out) {
                    out.innerHTML = `<p class="ped-padron-sin-resultados">No hay coincidencias para «${val}» en el padrón.</p>`;
                }
                const extra = avisos.length ? ` ${avisos[0]}` : '';
                toast(`No se encontró «${val}» en el padrón.${extra}`, 'warning');
                _nisUltimoValor = val;
                return;
            }

            if (matches.length > 1) {
                hooks.renderResultados(matches, (m) => void hooks.aplicarMatch(m));
                _nisUltimoValor = val;
                toast(`${matches.length} coincidencias: elegí la fila correcta.`, 'info');
                return;
            }

            if (out) out.innerHTML = '';
            await hooks.aplicarMatch(matches[0]);
            _nisUltimoValor = val;
        } catch (e) {
            if (out) out.innerHTML = '';
            toast('Error al buscar en el padrón. Intentá de nuevo.', 'error');
            console.warn('[nis-busqueda]', e?.message || e);
        } finally {
            _nisBuscando = false;
            setNisEstadoUi('idle');
        }
    }

    function onNisCommit() {
        if (_nisCommitEnCurso) return;
        clearTimeout(_nisDebounce);
        _nisDebounce = null;
        _nisCommitEnCurso = true;
        void buscarNisDesdeInput({ forzar: true }).finally(() => {
            _nisCommitEnCurso = false;
        });
    }

    function programarRellenoDebounced() {
        if (hooks.getAplicandoPadron() || !hooks.getRubro()) return;
        clearTimeout(_nisDebounce);
        _nisDebounce = setTimeout(() => {
            void buscarNisDesdeInput({ forzar: false, silencioso: true });
        }, 520);
    }

    const nisInp = document.getElementById('nis');
    if (nisInp) {
        nisInp.addEventListener('blur', onNisCommit);
        nisInp.addEventListener('input', programarRellenoDebounced);
        nisInp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
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

    return {
        resetNisBusquedaState() {
            _nisUltimoValor = '';
            clearTimeout(_nisDebounce);
            _nisDebounce = null;
            _nisCommitEnCurso = false;
            _nisBuscando = false;
            setNisEstadoUi('idle');
            limpiarProteccionPadronPedidoNuevo();
        },
        buscarNisDesdeInput,
    };
}
