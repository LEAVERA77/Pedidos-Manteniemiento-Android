/**
 * Admin → pestaña Históricos: reclamos resueltos del tenant actual (Neon),
 * filtros solo refinan la lista ya cargada; enlace a detalle (#dm).
 */
import {
    runQuincenaHistCheck,
    desactivarOcultarHistoricosResueltosBp2,
} from './vaciado-quincenal.js';
import { nombreCoincideFuzzy } from './gn-fuzzy-texto-levenshtein.js';
import { historicoTipoCoincideFuzzy, historicoIdCoincideParcial } from './admin-historicos-filtros.js';
import {
    fetchHistoricosResueltosTenant,
    historicosResueltosDesdeAppP,
    LIM_HIST_GLOBAL,
} from './admin-historicos-neon-fetch.js';
import { gnForceModalZFront } from './gn-modal-z-index-stack.js';

function _tidTenant() {
    if (typeof window._gnTenantId === 'function') {
        const n = Number(window._gnTenantId());
        if (Number.isFinite(n) && n > 0) return n;
    }
    const u = window.app?.u;
    const n = Number(u?.tenant_id ?? u?.tenantId);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function _rubroHist() {
    const fn = window.normalizarRubroEmpresa;
    if (typeof fn === 'function') return fn(window.EMPRESA_CFG?.tipo) || '';
    const t = String(window.EMPRESA_CFG?.tipo || '').toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t.includes('agua')) return 'cooperativa_agua';
    if (t.includes('electric')) return 'cooperativa_electrica';
    return '';
}

function _labelsHistoricosRubro() {
    const r = _rubroHist();
    if (r === 'municipio') {
        return {
            idFiltro: 'NIS / ID / N° pedido',
            colId: 'ID vecino',
            tipoPh: 'Ej. Alumbrado*',
        };
    }
    if (r === 'cooperativa_agua') {
        return {
            idFiltro: 'N° socio / medidor / N° pedido',
            colId: 'N° Socio / Medidor',
            tipoPh: 'Ej. Rotura de cañería*',
        };
    }
    return {
        idFiltro: 'NIS / medidor / N° pedido',
        colId: 'NIS / Medidor',
        tipoPh: 'Ej. Corte de Energía*',
    };
}

function _esHistorico(p) {
    if (!p || typeof p !== 'object') return false;
    const es = String(p.es || '');
    if (es === 'Cerrado' || es === 'Desestimado' || es === 'Derivado externo') return true;
    return p.dex === true || p.dex === 1;
}

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _direccionPedido(p) {
    const calleNum = [p.ccal, p.cnum].filter(Boolean).map((x) => String(x).trim()).filter(Boolean).join(' ');
    const loc = [calleNum, p.cloc].filter(Boolean).map((x) => String(x).trim()).filter(Boolean).join(', ');
    if (loc) return loc;
    const cdir = String(p.cdir || '').trim();
    return cdir || '—';
}

function _idColumna(p) {
    const r = _rubroHist();
    const nm = String(p.nis_med || '').trim();
    if (r === 'municipio' && nm) return nm;
    const n = String(p.nis || '').trim();
    const m = String(p.med || '').trim();
    if (n && m) return `${n} · ${m}`;
    if (n) return n;
    if (m) return m;
    if (nm) return nm;
    if (p.np != null && String(p.np).trim() !== '') return String(p.np).trim();
    return String(p.id ?? '—');
}

function _fechaCierreMostrar(p) {
    const es = String(p.es || '');
    if (es === 'Derivado externo' && p.fder) {
        try {
            return new Date(p.fder).toLocaleString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour12: false,
            });
        } catch (_) {
            return String(p.fder);
        }
    }
    if (p.fc) {
        try {
            return new Date(p.fc).toLocaleString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                hour12: false,
            });
        } catch (_) {
            return String(p.fc);
        }
    }
    return '—';
}

function _fechaCreacion(p) {
    if (!p.f) return '—';
    try {
        return new Date(p.f).toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            hour12: false,
        });
    } catch (_) {
        return String(p.f);
    }
}

function _filtrarLista(list, f) {
    const fd = f.fDesde ? new Date(f.fDesde + 'T00:00:00') : null;
    const fh = f.fHasta ? new Date(f.fHasta + 'T23:59:59') : null;
    const idQ = String(f.idTxt || '').trim().toLowerCase();
    const nomQ = String(f.nombreTxt || '').trim();
    const tipoQ = String(f.tipoPat || '').trim();
    const st = String(f.estadoSel || 'todos');
    const soloAg = !!f.soloAgrupados;

    return list.filter((p) => {
        if (!_esHistorico(p)) return false;
        if (soloAg && !(p.inci != null && Number(p.inci) > 0)) return false;
        if (st !== 'todos' && String(p.es || '') !== st) return false;
        if (tipoQ && !historicoTipoCoincideFuzzy(tipoQ, String(p.tt || ''))) return false;
        if (idQ && !historicoIdCoincideParcial(idQ, p)) return false;
        if (nomQ) {
            const nm = String(p.cnom || p.cl || '').trim();
            if (!nombreCoincideFuzzy(nomQ, nm)) return false;
        }
        if (fd && Number.isFinite(fd.getTime())) {
            const t = p.f ? new Date(p.f).getTime() : NaN;
            if (!Number.isFinite(t) || t < fd.getTime()) return false;
        }
        if (fh && Number.isFinite(fh.getTime())) {
            const t = p.f ? new Date(p.f).getTime() : NaN;
            if (!Number.isFinite(t) || t > fh.getTime()) return false;
        }
        return true;
    });
}

function _hayFiltrosActivos(f) {
    return !!(
        (f.fDesde && String(f.fDesde).trim()) ||
        (f.fHasta && String(f.fHasta).trim()) ||
        String(f.idTxt || '').trim() ||
        (f.estadoSel && f.estadoSel !== 'todos') ||
        String(f.tipoPat || '').trim() ||
        f.soloAgrupados ||
        String(f.nombreTxt || '').trim()
    );
}

function _leerFiltrosDesdeDom(root) {
    return {
        fDesde: root.querySelector('#gn-hist-f-desde')?.value || '',
        fHasta: root.querySelector('#gn-hist-f-hasta')?.value || '',
        idTxt: root.querySelector('#gn-hist-id')?.value || '',
        estadoSel: root.querySelector('#gn-hist-estado')?.value || 'todos',
        tipoPat: root.querySelector('#gn-hist-tipo')?.value || '',
        nombreTxt: root.querySelector('#gn-hist-nombre')?.value || '',
        soloAgrupados: !!root.querySelector('#gn-hist-solo-ag')?.checked,
    };
}

function _pintarMensajeTabla(tbody, texto, esError) {
    const col = esError ? 'var(--re)' : 'var(--tl)';
    tbody.innerHTML = `<tr><td colspan="11" style="padding:.75rem;color:${col};font-size:.85rem;line-height:1.45">${texto}</td></tr>`;
}

function _pintarTabla(tbody, rows, onRowClick) {
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const p of rows) {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        const tnom = String(p._histTenantNom || '—').trim() || '—';
        tr.innerHTML = `
            <td style="padding:.45rem .35rem;font-weight:600">#${_esc(p.np)}</td>
            <td style="padding:.45rem .35rem;font-size:.76rem;color:var(--tm);max-width:9rem;word-break:break-word">${_esc(tnom)}</td>
            <td style="padding:.45rem .35rem;font-size:.78rem">${_esc(_fechaCreacion(p))}</td>
            <td style="padding:.45rem .35rem;font-size:.78rem">${_esc(_fechaCierreMostrar(p))}</td>
            <td style="padding:.45rem .35rem;font-size:.78rem">${_esc(p.es)}</td>
            <td style="padding:.45rem .35rem;font-size:.78rem">${_esc(p.tt || '—')}</td>
            <td style="padding:.45rem .35rem;font-size:.78rem">${_esc(p.pr || '—')}</td>
            <td style="padding:.45rem .35rem;font-size:.78rem">${_esc(String(p.cnom || p.cl || '—'))}</td>
            <td style="padding:.45rem .35rem;font-size:.78rem">${_esc(_direccionPedido(p))}</td>
            <td style="padding:.45rem .35rem;font-size:.78rem;word-break:break-all">${_esc(_idColumna(p))}</td>
            <td style="padding:.45rem .35rem;font-size:.72rem;color:var(--tl)">${p.inci != null && Number(p.inci) > 0 ? 'Sí' : '—'}</td>`;
        tr.addEventListener('click', () => onRowClick(p));
        frag.appendChild(tr);
    }
    tbody.appendChild(frag);
}

/**
 * @param {{
 *   toast?: function,
 *   refrescarPedidos?: function,
 *   cerrarAdminPanel?: function,
 *   sqlSimple?: function,
 *   neonOk?: () => boolean,
 * }} deps
 */
export function initAdminHistoricosPanel(deps) {
    const toast = deps?.toast;
    const refrescarPedidos = deps?.refrescarPedidos;
    const cerrarAdminPanel = deps?.cerrarAdminPanel;
    const sqlSimple = deps?.sqlSimple;
    const neonOk = typeof deps?.neonOk === 'function' ? deps.neonOk : () => true;

    const root = document.getElementById('admin-historicos-root');
    if (!root || root.dataset.gnHistInit === '1') return;
    root.dataset.gnHistInit = '1';

    /** @type {unknown[] | null} */
    let _histCacheNeon = null;
    let _histCargando = false;
    let _histErrorCarga = null;
    let _renderGen = 0;

    const L = _labelsHistoricosRubro();
    root.innerHTML = `
      <p style="font-size:.78rem;color:var(--tl);margin:0 0 .75rem;line-height:1.45">
        Listado desde <strong>Neon</strong> solo del <strong>tenant en sesión</strong>: reclamos <strong>cerrados</strong>, <strong>desestimados</strong> o <strong>derivados a terceros</strong> (hasta <strong>${LIM_HIST_GLOBAL}</strong> más recientes por fecha de derivación / cierre). Los filtros <strong>acotan</strong> esa lista ya cargada. Tocá <strong>Recargar lista</strong> para volver a leer la base.
      </p>
      <div id="gn-hist-aviso" style="display:none;margin:0 0 .55rem;padding:.45rem .55rem;font-size:.76rem;line-height:1.45;color:#1e40af;background:#eff6ff;border:1px solid #93c5fd;border-radius:.4rem"></div>
      <div class="gn-admin-hist-filtros" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:flex-end;margin-bottom:.75rem;padding:.55rem .65rem;background:var(--bg);border:1px solid var(--bo);border-radius:.5rem">
        <div><label for="gn-hist-f-desde" style="font-size:.72rem;color:var(--tm)">Fecha creación desde</label><br><input type="date" id="gn-hist-f-desde" style="margin-top:.2rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <div><label for="gn-hist-f-hasta" style="font-size:.72rem;color:var(--tm)">Fecha creación hasta</label><br><input type="date" id="gn-hist-f-hasta" style="margin-top:.2rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <div><label for="gn-hist-id" id="gn-hist-id-lbl" style="font-size:.72rem;color:var(--tm)">${_esc(L.idFiltro)}</label><br><input type="text" id="gn-hist-id" placeholder="Ej. 700000 o 56 (parcial)" autocomplete="off" autocapitalize="off" style="margin-top:.2rem;min-width:8rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <div><label for="gn-hist-estado" style="font-size:.72rem;color:var(--tm)">Estado</label><br>
          <select id="gn-hist-estado" style="margin-top:.2rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem">
            <option value="todos">Todos</option>
            <option value="Cerrado">Cerrado</option>
            <option value="Desestimado">Desestimado</option>
            <option value="Derivado externo">Derivado externo</option>
          </select>
        </div>
        <div style="flex:1;min-width:10rem"><label for="gn-hist-tipo" style="font-size:.72rem;color:var(--tm)">Tipo de reclamo (fuzzy)</label><br><input type="text" id="gn-hist-tipo" placeholder="Ej. Corte de Energía" autocomplete="off" autocapitalize="off" style="margin-top:.2rem;width:100%;max-width:16rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <div style="flex:1;min-width:11rem"><label for="gn-hist-nombre" style="font-size:.72rem;color:var(--tm)">Nombre / vecino (fuzzy)</label><br><input type="text" id="gn-hist-nombre" placeholder="Ej. Garcia" autocomplete="off" autocapitalize="off" style="margin-top:.2rem;width:100%;max-width:16rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <label style="display:flex;align-items:center;gap:.35rem;font-size:.78rem;cursor:pointer;margin-bottom:.15rem"><input type="checkbox" id="gn-hist-solo-ag"> Solo agrupados (<code>inci</code>)</label>
        <button type="button" class="btn-sm primary" id="gn-hist-buscar"><i class="fas fa-search"></i> Buscar</button>
        <button type="button" class="btn-sm" id="gn-hist-refrescar" style="background:var(--bg);border:1px solid var(--bo)" title="Vuelve a cargar históricos desde Neon (solo este tenant)"><i class="fas fa-sync"></i> Recargar lista</button>
        <button type="button" class="btn-sm" id="gn-hist-mostrar-bp2" style="background:var(--bg);border:1px solid var(--bo);color:var(--tm)" title="Vuelve a mostrar cerrados/desestimados/derivados en el panel de pedidos">Mostrar históricos en panel pedidos</button>
      </div>
      <div style="overflow:auto;max-height:min(62vh,560px);border:1px solid var(--bo);border-radius:.5rem">
        <table class="gn-admin-hist-table" style="width:100%;border-collapse:collapse;font-size:.8rem">
          <thead style="position:sticky;top:0;background:#f8fafc;z-index:1">
            <tr>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">N°</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Tenant</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Creación</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Cierre / deriv.</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Estado</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Tipo</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Prioridad</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Nombre</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Dirección</th>
              <th id="gn-hist-th-idcol" style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">${_esc(L.colId)}</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Agr.</th>
            </tr>
          </thead>
          <tbody id="gn-hist-tbody"></tbody>
        </table>
      </div>`;

    const tbody = root.querySelector('#gn-hist-tbody');
    const avisoEl = root.querySelector('#gn-hist-aviso');

    const onRowClick = (p) => {
        try {
            const ap = document.getElementById('admin-panel');
            if (ap) {
                ap.classList.add('active');
                window.__gnAdminReopenTabTrasDetalle = 'historicos';
            }
        } catch (_) {}
        try {
            if (typeof window.detalle === 'function') {
                void window.detalle(p).then(() => {
                    try {
                        gnForceModalZFront(document.getElementById('dm'));
                    } catch (_) {}
                });
            }
        } catch (_) {
            if (typeof toast === 'function') toast('No se pudo abrir el detalle.', 'error');
        }
    };

    const pintarDesdeCache = () => {
        const f = _leerFiltrosDesdeDom(root);
        const base = Array.isArray(_histCacheNeon) ? _histCacheNeon : [];
        const rowsFiltrados = _filtrarLista(base, f).sort((a, b) => {
            const ta = a.f ? new Date(a.f).getTime() : 0;
            const tb = b.f ? new Date(b.f).getTime() : 0;
            return tb - ta;
        });
        if (avisoEl) {
            if (base.length >= LIM_HIST_GLOBAL) {
                avisoEl.style.display = 'block';
                avisoEl.textContent =
                    'Se alcanzó el límite de filas mostradas (' +
                    LIM_HIST_GLOBAL +
                    '). Los más viejos no aparecen hasta que acotes con filtros o uses consultas en Neon.';
            } else if (base.length > 0) {
                avisoEl.style.display = 'block';
                avisoEl.textContent =
                    'Cargados ' + base.length + ' reclamo(s) histórico(s) de este tenant. Usá los filtros para buscar entre ellos.';
            } else {
                avisoEl.style.display = 'none';
                avisoEl.textContent = '';
            }
        }
        if (!rowsFiltrados.length && base.length && _hayFiltrosActivos(f)) {
            _pintarMensajeTabla(
                tbody,
                'Sin coincidencias con los filtros entre los <strong>' +
                    base.length +
                    '</strong> reclamos históricos ya cargados. Probá limpiar criterios o tocá <strong>Recargar lista</strong>.',
                false
            );
            return;
        }
        if (!rowsFiltrados.length && base.length && !_hayFiltrosActivos(f)) {
            _pintarMensajeTabla(tbody, 'No hay filas para mostrar (lista vacía).', false);
            return;
        }
        if (!rowsFiltrados.length) {
            _pintarMensajeTabla(
                tbody,
                'No hay reclamos cerrados, desestimados o derivados en la base (o aún no se cargaron).',
                false
            );
            return;
        }
        _pintarTabla(tbody, rowsFiltrados, onRowClick);
    };

    const render = () => {
        const gen = ++_renderGen;
        if (!tbody) return;
        const tid = _tidTenant();
        if (!tid) {
            _histCacheNeon = null;
            _pintarMensajeTabla(
                tbody,
                'No hay <strong>tenant</strong> en sesión para cargar históricos. Iniciá sesión de nuevo o recargá la página.',
                true
            );
            return;
        }
        if (!neonOk() || typeof sqlSimple !== 'function') {
            _histCacheNeon = null;
            _pintarMensajeTabla(
                tbody,
                'Históricos requieren <strong>Neon conectado</strong> y <code>sqlSimple</code>. Revisá la conexión o el modo offline.',
                true
            );
            return;
        }
        if (_histErrorCarga) {
            _pintarMensajeTabla(tbody, _esc(String(_histErrorCarga)), true);
            return;
        }
        if (_histCacheNeon !== null && !_histCargando) {
            pintarDesdeCache();
            return;
        }
        if (_histCargando) {
            _pintarMensajeTabla(
                tbody,
                '<i class="fas fa-circle-notch fa-spin"></i> Cargando reclamos históricos desde Neon (tenant actual)…',
                false
            );
            return;
        }
        const prefill = historicosResueltosDesdeAppP(tid);
        if (prefill.length) {
            _pintarTabla(tbody, prefill, onRowClick);
            if (avisoEl) {
                avisoEl.style.display = 'block';
                avisoEl.textContent =
                    'Mostrando ' +
                    prefill.length +
                    ' histórico(s) ya en memoria. Sincronizando el listado completo desde Neon…';
            }
        } else {
            _pintarMensajeTabla(
                tbody,
                '<i class="fas fa-circle-notch fa-spin"></i> Cargando reclamos históricos desde Neon (tenant actual)…',
                false
            );
        }
        _histCargando = true;
        const timeoutMs = 90000;
        const fetchP = fetchHistoricosResueltosTenant({ sqlSimple }, tid);
        const timeoutP = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('La consulta tardó demasiado. Probá Recargar lista o acotá con filtros.')), timeoutMs);
        });
        void Promise.race([fetchP, timeoutP])
            .then((rows) => {
                if (gen !== _renderGen) return;
                _histCacheNeon = rows;
                _histErrorCarga = null;
                _histCargando = false;
                pintarDesdeCache();
            })
            .catch((e) => {
                if (gen !== _renderGen) return;
                _histErrorCarga = String(e && e.message ? e.message : e);
                _histCargando = false;
                if (!prefill.length) _histCacheNeon = null;
                if (prefill.length) {
                    pintarDesdeCache();
                    if (typeof toast === 'function') {
                        toast('No se pudo actualizar desde Neon; se muestran los históricos en memoria.', 'warning', 4500);
                    }
                } else {
                    _pintarMensajeTabla(tbody, _esc(_histErrorCarga), true);
                }
            });
    };

    let _histFilterT = 0;
    const scheduleRenderFiltros = () => {
        try {
            clearTimeout(_histFilterT);
        } catch (_) {}
        _histFilterT = setTimeout(() => {
            _histFilterT = 0;
            if (_histCacheNeon !== null) pintarDesdeCache();
        }, 220);
    };
    ['#gn-hist-f-desde', '#gn-hist-f-hasta', '#gn-hist-estado', '#gn-hist-solo-ag'].forEach((sel) => {
        const el = root.querySelector(sel);
        if (!el) return;
        el.addEventListener('change', () => {
            if (_histCacheNeon !== null) pintarDesdeCache();
        });
    });
    root.querySelector('#gn-hist-id')?.addEventListener('input', scheduleRenderFiltros);
    root.querySelector('#gn-hist-tipo')?.addEventListener('input', scheduleRenderFiltros);
    root.querySelector('#gn-hist-nombre')?.addEventListener('input', scheduleRenderFiltros);

    root.querySelector('#gn-hist-buscar')?.addEventListener('click', () => {
        if (_histCacheNeon !== null) pintarDesdeCache();
    });
    root.querySelector('#gn-hist-refrescar')?.addEventListener('click', () => {
        _histCacheNeon = null;
        _histErrorCarga = null;
        _histCargando = false;
        try {
            if (typeof refrescarPedidos === 'function') void Promise.resolve(refrescarPedidos());
        } catch (_) {}
        render();
    });
    root.querySelector('#gn-hist-mostrar-bp2')?.addEventListener('click', () => {
        desactivarOcultarHistoricosResueltosBp2();
        if (typeof toast === 'function') toast('Listo: volvés a ver los históricos en el panel de pedidos.', 'success', 3200);
        try {
            if (typeof window.render === 'function') window.render();
        } catch (_) {}
    });

    window.__gnAdminHistoricosRefresh = render;
    window.__gnResetAdminHistoricosUi = () => {
        try {
            root.dataset.gnHistTid = '';
        } catch (_) {}
        _histCacheNeon = null;
        _histErrorCarga = null;
        _histCargando = false;
        if (tbody) {
            _pintarMensajeTabla(
                tbody,
                'Cambiando de contexto… Volvé a abrir <strong>Históricos</strong> o tocá <strong>Recargar lista</strong> para cargar de nuevo desde Neon.',
                false
            );
        }
    };

    window.__gnAdminTabHistoricos = () => {
        runQuincenaHistCheck(toast);
        const tidNow = String(_tidTenant());
        if (root.dataset.gnHistTid !== tidNow) {
            _histCacheNeon = null;
            _histErrorCarga = null;
            _histCargando = false;
            root.dataset.gnHistTid = tidNow;
        }
        const L2 = _labelsHistoricosRubro();
        const lbl = root.querySelector('#gn-hist-id-lbl');
        if (lbl) lbl.textContent = L2.idFiltro;
        const th = root.querySelector('#gn-hist-th-idcol');
        if (th) th.textContent = L2.colId;
        const tipoInp = root.querySelector('#gn-hist-tipo');
        if (tipoInp) tipoInp.placeholder = L2.tipoPh;
        try {
            if (typeof refrescarPedidos === 'function') void Promise.resolve(refrescarPedidos());
        } catch (_) {}
        render();
    };

    if (document.getElementById('admin-historicos')?.classList.contains('active')) {
        try {
            window.__gnAdminTabHistoricos?.();
        } catch (_) {
            render();
        }
    }
}
