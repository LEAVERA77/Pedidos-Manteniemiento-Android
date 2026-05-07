/**
 * Admin → pestaña Históricos: reclamos resueltos (Cerrado, Desestimado, Derivado externo), filtros y enlace a detalle (#dm).
 */
import { runQuincenaHistCheck, marcarVaciadoQuincenaHecho } from './vaciado-quincenal.js';

function _tidTenant() {
    const u = window.app?.u;
    const n = Number(u?.tenant_id ?? u?.tenantId);
    return Number.isFinite(n) && n > 0 ? n : 0;
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
    const n = String(p.nis || '').trim();
    const m = String(p.med || '').trim();
    if (n && m) return `${n} · ${m}`;
    if (n) return n;
    if (m) return m;
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

function _patronTipoWild(patRaw) {
    const pat = String(patRaw || '').trim();
    if (!pat) return null;
    const escaped = pat
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    try {
        return new RegExp(`^${escaped}$`, 'i');
    } catch (_) {
        return null;
    }
}

function _filtrarLista(list, f) {
    const fd = f.fDesde ? new Date(f.fDesde + 'T00:00:00') : null;
    const fh = f.fHasta ? new Date(f.fHasta + 'T23:59:59') : null;
    const idQ = String(f.idTxt || '').trim().toLowerCase();
    const st = String(f.estadoSel || 'todos');
    const tipoRe = _patronTipoWild(f.tipoPat);
    const soloAg = !!f.soloAgrupados;

    return list.filter((p) => {
        if (!_esHistorico(p)) return false;
        if (soloAg && !(p.inci != null && Number(p.inci) > 0)) return false;
        if (st !== 'todos' && String(p.es || '') !== st) return false;
        if (tipoRe && !tipoRe.test(String(p.tt || '').trim())) return false;
        if (idQ) {
            const hay =
                String(p.id ?? '')
                    .toLowerCase()
                    .includes(idQ) ||
                String(p.nis || '')
                    .toLowerCase()
                    .includes(idQ) ||
                String(p.med || '')
                    .toLowerCase()
                    .includes(idQ) ||
                String(p.np ?? '')
                    .toLowerCase()
                    .includes(idQ);
            if (!hay) return false;
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

function _leerFiltrosDesdeDom(root) {
    return {
        fDesde: root.querySelector('#gn-hist-f-desde')?.value || '',
        fHasta: root.querySelector('#gn-hist-f-hasta')?.value || '',
        idTxt: root.querySelector('#gn-hist-id')?.value || '',
        estadoSel: root.querySelector('#gn-hist-estado')?.value || 'todos',
        tipoPat: root.querySelector('#gn-hist-tipo')?.value || '',
        soloAgrupados: !!root.querySelector('#gn-hist-solo-ag')?.checked,
    };
}

function _pintarTabla(tbody, rows, onRowClick) {
    tbody.innerHTML = '';
    if (!rows.length) {
        tbody.innerHTML =
            '<tr><td colspan="10" style="padding:.75rem;color:var(--tl);font-size:.85rem">Sin resultados con los filtros actuales.</td></tr>';
        return;
    }
    const frag = document.createDocumentFragment();
    for (const p of rows) {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td style="padding:.45rem .35rem;font-weight:600">#${_esc(p.np)}</td>
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
 * @param {{ toast?: function, refrescarPedidos?: function, cerrarAdminPanel?: function }} deps
 */
export function initAdminHistoricosPanel(deps) {
    const toast = deps?.toast;
    const refrescarPedidos = deps?.refrescarPedidos;
    const cerrarAdminPanel = deps?.cerrarAdminPanel;

    const root = document.getElementById('admin-historicos-root');
    if (!root || root.dataset.gnHistInit === '1') return;
    root.dataset.gnHistInit = '1';

    root.innerHTML = `
      <p style="font-size:.78rem;color:var(--tl);margin:0 0 .75rem;line-height:1.45">
        Reclamos <strong>cerrados</strong>, <strong>desestimados</strong> o <strong>derivados a terceros</strong> del tenant actual (misma fuente que el mapa y la lista principal). No se borran datos en el servidor.
      </p>
      <div class="gn-admin-hist-filtros" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:flex-end;margin-bottom:.75rem;padding:.55rem .65rem;background:var(--bg);border:1px solid var(--bo);border-radius:.5rem">
        <div><label for="gn-hist-f-desde" style="font-size:.72rem;color:var(--tm)">Fecha creación desde</label><br><input type="date" id="gn-hist-f-desde" style="margin-top:.2rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <div><label for="gn-hist-f-hasta" style="font-size:.72rem;color:var(--tm)">Fecha creación hasta</label><br><input type="date" id="gn-hist-f-hasta" style="margin-top:.2rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <div><label for="gn-hist-id" style="font-size:.72rem;color:var(--tm)">ID / NIS / N° pedido</label><br><input type="text" id="gn-hist-id" placeholder="Texto parcial" style="margin-top:.2rem;min-width:8rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <div><label for="gn-hist-estado" style="font-size:.72rem;color:var(--tm)">Estado</label><br>
          <select id="gn-hist-estado" style="margin-top:.2rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem">
            <option value="todos">Todos</option>
            <option value="Cerrado">Cerrado</option>
            <option value="Desestimado">Desestimado</option>
            <option value="Derivado externo">Derivado externo</option>
          </select>
        </div>
        <div style="flex:1;min-width:10rem"><label for="gn-hist-tipo" style="font-size:.72rem;color:var(--tm)">Tipo reclamo (<code>*</code> <code>?</code>)</label><br><input type="text" id="gn-hist-tipo" placeholder="Ej. Alumbrado*" style="margin-top:.2rem;width:100%;max-width:16rem;padding:.35rem;border:1px solid var(--bo);border-radius:.35rem"></div>
        <label style="display:flex;align-items:center;gap:.35rem;font-size:.78rem;cursor:pointer;margin-bottom:.15rem"><input type="checkbox" id="gn-hist-solo-ag"> Solo agrupados (<code>inci</code>)</label>
        <button type="button" class="btn-sm primary" id="gn-hist-buscar"><i class="fas fa-search"></i> Buscar</button>
        <button type="button" class="btn-sm" id="gn-hist-refrescar" style="background:var(--bg);border:1px solid var(--bo)" title="Vuelve a pedir pedidos al servidor si hay API"><i class="fas fa-sync"></i> Recargar lista</button>
        <button type="button" class="btn-sm" id="gn-hist-quincena" style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e" title="Actualiza el recordatorio quincenal (no borra Neon)"><i class="fas fa-calendar-check"></i> Marcar recordatorio quincenal</button>
      </div>
      <div style="overflow:auto;max-height:min(62vh,560px);border:1px solid var(--bo);border-radius:.5rem">
        <table class="gn-admin-hist-table" style="width:100%;border-collapse:collapse;font-size:.8rem">
          <thead style="position:sticky;top:0;background:#f8fafc;z-index:1">
            <tr>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">N°</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Creación</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Cierre / deriv.</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Estado</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Tipo</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Prioridad</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Nombre</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Dirección</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">ID / NIS / med.</th>
              <th style="text-align:left;padding:.45rem .35rem;border-bottom:1px solid var(--bo)">Agr.</th>
            </tr>
          </thead>
          <tbody id="gn-hist-tbody"></tbody>
        </table>
      </div>`;

    const tbody = root.querySelector('#gn-hist-tbody');

    const onRowClick = (p) => {
        try {
            if (typeof cerrarAdminPanel === 'function') cerrarAdminPanel();
        } catch (_) {}
        try {
            if (typeof window.detalle === 'function') void window.detalle(p);
        } catch (_) {
            if (typeof toast === 'function') toast('No se pudo abrir el detalle.', 'error');
        }
    };

    const render = () => {
        const tidNow = _tidTenant();
        const list = Array.isArray(window.app?.p) ? window.app.p : [];
        const historicos = list.filter(_esHistorico);
        const f = _leerFiltrosDesdeDom(root);
        const rows = _filtrarLista(historicos, f).sort((a, b) => {
            const ta = a.f ? new Date(a.f).getTime() : 0;
            const tb = b.f ? new Date(b.f).getTime() : 0;
            return tb - ta;
        });
        _pintarTabla(tbody, rows, onRowClick);
    };

    root.querySelector('#gn-hist-buscar')?.addEventListener('click', () => render());
    root.querySelector('#gn-hist-refrescar')?.addEventListener('click', () => {
        try {
            if (typeof refrescarPedidos === 'function') void Promise.resolve(refrescarPedidos()).then(() => render());
            else render();
        } catch (_) {
            render();
        }
    });
    root.querySelector('#gn-hist-quincena')?.addEventListener('click', () => {
        marcarVaciadoQuincenaHecho(toast);
    });

    window.__gnAdminHistoricosRefresh = render;
    window.__gnResetAdminHistoricosUi = () => {
        try {
            root.dataset.gnHistTid = '';
        } catch (_) {}
        if (tbody) tbody.innerHTML = '';
    };

    window.__gnAdminTabHistoricos = () => {
        runQuincenaHistCheck(toast);
        const tidNow = String(_tidTenant());
        if (root.dataset.gnHistTid !== tidNow) {
            root.dataset.gnHistTid = tidNow;
        }
        render();
    };
}
