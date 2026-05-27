/**
 * UI admin: evento de corte masivo por transformador o distribuidor.
 * made by leavera77
 */
import { toast } from './ui-utils.js';
import { ensureCorteMasivoLauncher, syncCorteMasivoLauncher } from './gn-evento-corte-masivo-launcher.js';

const API = '/api/evento-corte-masivo';

function apiUrl(p) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(p) : p;
}

function getTok() {
    return typeof window.getApiToken === 'function' ? String(window.getApiToken() || '').trim() : '';
}

function esAdminOperador() {
    if (typeof window.esAdmin === 'function' && window.esAdmin()) return true;
    const r = String(
        (typeof window !== 'undefined' && window.USUARIO?.rol) ||
            (typeof window !== 'undefined' && window._gnUserRol) ||
            ''
    )
        .toLowerCase()
        .trim();
    return r === 'admin' || r === 'administrador';
}

function authHeaders(tok) {
    return { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
}

function recargarMapa() {
    try {
        if (typeof window.__gnIncidenciasInvalidateCache === 'function') {
            window.__gnIncidenciasInvalidateCache();
        }
    } catch (_) {}
    try {
        if (typeof window.recargarPedidosYMapa === 'function') window.recargarPedidosYMapa();
        else if (typeof window.cargarPedidos === 'function') window.cargarPedidos();
    } catch (_) {}
}

/** @type {HTMLElement|null} */
let _modal = null;

/** @type {{ transformadores: Array<{valor:string}>, distribuidores: Array<{codigo:string,nombre:string}> }} */
let _catalogos = { transformadores: [], distribuidores: [] };
/** @type {Array<{id:number,numero_pedido:number,estado:string,cliente:string}>} */
let _previewPedidos = [];

function syncLauncherVisibility() {
    const tok = getTok();
    const show = !!tok && esAdminOperador();
    ensureCorteMasivoLauncher({
        visible: show,
        onOpen: () => void openWizard(),
    });
}

function ensureModal() {
    if (_modal) return _modal;
    const root = document.createElement('div');
    root.id = 'gn-modal-evento-corte';
    root.className = 'mo';
    root.style.zIndex = '10065';
    root.innerHTML = `
<div class="mc lg gn-inc-modal-mc" style="max-width:min(96vw,32rem);max-height:min(92vh,640px);display:flex;flex-direction:column">
  <div class="mh">
    <h3><i class="fas fa-cloud-bolt"></i> Evento de corte masivo</h3>
    <button type="button" class="cm" data-close="1"><i class="fas fa-times"></i></button>
  </div>
  <div class="mb" style="padding:0 1rem 1rem;overflow:auto;flex:1">
    <p style="font-size:.78rem;color:var(--tm);margin:0 0 .75rem;line-height:1.35">
      Agrupá reclamos abiertos del mismo <strong>transformador</strong> (padrón socios) o <strong>distribuidor</strong> (red eléctrica),
      creá una incidencia y asigná un técnico. Al resolver la incidencia, podés cerrar todos juntos.
    </p>
    <div id="gn-ecm-step-ind" style="font-size:.72rem;color:var(--tm);margin-bottom:.5rem">Paso 1 de 3 — Infraestructura</div>

    <div id="gn-ecm-panel-1">
      <label style="display:block;font-size:.85rem;margin-bottom:.35rem">Tipo</label>
      <div style="display:flex;gap:.5rem;margin-bottom:.75rem">
        <label style="flex:1;font-size:.82rem;cursor:pointer"><input type="radio" name="gn-ecm-tipo" value="transformador" checked> Transformador</label>
        <label style="flex:1;font-size:.82rem;cursor:pointer"><input type="radio" name="gn-ecm-tipo" value="distribuidor"> Distribuidor</label>
      </div>
      <label for="gn-ecm-buscar" style="display:block;font-size:.85rem;margin-bottom:.25rem">Buscar</label>
      <input id="gn-ecm-buscar" type="search" placeholder="Escribí código o nombre…" autocomplete="off"
        style="width:100%;padding:.45rem;border-radius:.45rem;border:1px solid var(--bo);margin-bottom:.35rem">
      <select id="gn-ecm-valor" size="8" style="width:100%;min-height:9rem;padding:.35rem;border-radius:.45rem;border:1px solid var(--bo)"></select>
    </div>

    <div id="gn-ecm-panel-2" style="display:none">
      <p id="gn-ecm-prev-resumen" style="font-size:.85rem;font-weight:600;margin:0 0 .5rem"></p>
      <label style="font-size:.78rem;display:flex;align-items:center;gap:.35rem;margin-bottom:.5rem">
        <input type="checkbox" id="gn-ecm-solo-sin-inc" checked> Solo reclamos sin incidencia previa
      </label>
      <div id="gn-ecm-prev-lista" style="max-height:12rem;overflow:auto;font-size:.78rem;border:1px solid var(--bo);border-radius:.45rem;padding:.35rem"></div>
    </div>

    <div id="gn-ecm-panel-3" style="display:none">
      <label for="gn-ecm-nombre" style="display:block;font-size:.85rem;margin-bottom:.25rem">Nombre de la incidencia</label>
      <input id="gn-ecm-nombre" type="text" maxlength="200" style="width:100%;padding:.45rem;border-radius:.45rem;border:1px solid var(--bo);margin-bottom:.65rem">
      <label for="gn-ecm-tecnico" style="display:block;font-size:.85rem;margin-bottom:.25rem">Técnico responsable</label>
      <select id="gn-ecm-tecnico" style="width:100%;padding:.45rem;border-radius:.45rem;border:1px solid var(--bo);margin-bottom:.65rem"></select>
      <p style="font-size:.75rem;color:var(--tm);margin:0">Se creará la incidencia, se asociarán los reclamos y se asignará el técnico en un solo paso.</p>
    </div>
  </div>
  <div style="padding:0 1rem 1rem;display:flex;flex-wrap:wrap;gap:.45rem">
    <button type="button" id="gn-ecm-back" class="btn-sm sec" style="flex:1;display:none">Atrás</button>
    <button type="button" id="gn-ecm-cancel" class="btn-sm sec" style="flex:1">Cancelar</button>
    <button type="button" id="gn-ecm-next" class="bp" style="flex:1"><i class="fas fa-arrow-right"></i> Siguiente</button>
  </div>
</div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
        if (e.target === root) root.classList.remove('active');
    });
    root.querySelectorAll('[data-close]').forEach((b) =>
        b.addEventListener('click', () => root.classList.remove('active'))
    );
    _modal = root;
    return root;
}

function getTipo() {
    const m = _modal?.querySelector('input[name="gn-ecm-tipo"]:checked');
    return m ? String(m.value) : 'transformador';
}

function fillSelectValor() {
    const sel = _modal?.querySelector('#gn-ecm-valor');
    const q = String(_modal?.querySelector('#gn-ecm-buscar')?.value || '')
        .trim()
        .toLowerCase();
    if (!sel) return;
    sel.innerHTML = '';
    const tipo = getTipo();
    const list =
        tipo === 'distribuidor'
            ? _catalogos.distribuidores.map((d) => ({
                  value: d.codigo,
                  label: d.nombre ? `${d.codigo} — ${d.nombre}` : d.codigo,
              }))
            : _catalogos.transformadores.map((t) => ({
                  value: t.valor,
                  label: t.socios != null ? `${t.valor} (${t.socios} socios)` : t.valor,
              }));
    const filtered = q
        ? list.filter((x) => x.value.toLowerCase().includes(q) || x.label.toLowerCase().includes(q))
        : list;
    if (!filtered.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = q ? 'Sin coincidencias' : 'Sin datos en catálogo';
        sel.appendChild(o);
        return;
    }
    for (const item of filtered.slice(0, 400)) {
        const o = document.createElement('option');
        o.value = item.value;
        o.textContent = item.label;
        sel.appendChild(o);
    }
}

async function loadCatalogos(tok) {
    const r = await fetch(apiUrl(`${API}/catalogos`), { headers: { Authorization: `Bearer ${tok}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
    _catalogos = {
        transformadores: Array.isArray(j.transformadores) ? j.transformadores : [],
        distribuidores: Array.isArray(j.distribuidores) ? j.distribuidores : [],
    };
}

let _step = 1;

function setStep(n) {
    _step = n;
    const ind = _modal?.querySelector('#gn-ecm-step-ind');
    const p1 = _modal?.querySelector('#gn-ecm-panel-1');
    const p2 = _modal?.querySelector('#gn-ecm-panel-2');
    const p3 = _modal?.querySelector('#gn-ecm-panel-3');
    const back = _modal?.querySelector('#gn-ecm-back');
    const next = _modal?.querySelector('#gn-ecm-next');
    if (p1) p1.style.display = n === 1 ? '' : 'none';
    if (p2) p2.style.display = n === 2 ? '' : 'none';
    if (p3) p3.style.display = n === 3 ? '' : 'none';
    if (back) back.style.display = n > 1 ? '' : 'none';
    if (ind) {
        const titles = ['Infraestructura', 'Vista previa', 'Confirmar'];
        ind.textContent = `Paso ${n} de 3 — ${titles[n - 1] || ''}`;
    }
    if (next) {
        if (n === 3) next.innerHTML = '<i class="fas fa-check"></i> Crear y asignar';
        else if (n === 2) next.innerHTML = '<i class="fas fa-arrow-right"></i> Confirmar';
        else next.innerHTML = '<i class="fas fa-arrow-right"></i> Vista previa';
    }
}

function valorSeleccionado() {
    const sel = _modal?.querySelector('#gn-ecm-valor');
    return String(sel?.value || '').trim();
}

async function fetchPreview(tok) {
    const tipo = getTipo();
    const valor = valorSeleccionado();
    if (!valor) throw new Error('Elegí un transformador o distribuidor de la lista.');
    const soloSin = !!_modal?.querySelector('#gn-ecm-solo-sin-inc')?.checked;
    const r = await fetch(apiUrl(`${API}/vista-previa`), {
        method: 'POST',
        headers: authHeaders(tok),
        body: JSON.stringify({ tipo, valor, solo_sin_incidencia: soloSin }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
    _previewPedidos = Array.isArray(j.pedidos) ? j.pedidos : [];
    const resumen = _modal?.querySelector('#gn-ecm-prev-resumen');
    const lista = _modal?.querySelector('#gn-ecm-prev-lista');
    const tipoLbl = tipo === 'transformador' ? 'Transformador' : 'Distribuidor';
    if (resumen) {
        resumen.textContent = `${tipoLbl} «${valor}»: ${_previewPedidos.length} reclamo(s) abierto(s)${j.truncado ? ' (máx. 500 mostrados)' : ''}`;
    }
    if (lista) {
        if (!_previewPedidos.length) {
            lista.innerHTML = '<p style="margin:0;color:var(--tm)">No hay reclamos que coincidan. Probá otro criterio o desmarcá «sin incidencia».</p>';
        } else {
            lista.innerHTML = _previewPedidos
                .slice(0, 80)
                .map(
                    (p) =>
                        `<div style="padding:.2rem 0;border-bottom:1px solid var(--bo)">#${p.numero_pedido} · ${String(p.estado || '').trim()} · ${String(p.cliente || '').slice(0, 40)}</div>`
                )
                .join('');
            if (_previewPedidos.length > 80) {
                lista.innerHTML += `<p style="margin:.35rem 0 0;color:var(--tm)">… y ${_previewPedidos.length - 80} más</p>`;
            }
        }
    }
    const nom = _modal?.querySelector('#gn-ecm-nombre');
    if (nom && !String(nom.value || '').trim()) {
        const pref = tipo === 'transformador' ? 'Corte masivo — Trafo' : 'Corte masivo — Dist.';
        nom.value = `${pref} ${valor}`.slice(0, 200);
    }
}

async function loadTecnicos(tok) {
    const sel = _modal?.querySelector('#gn-ecm-tecnico');
    if (!sel) return;
    sel.innerHTML = '<option value="">Cargando…</option>';
    const r = await fetch(apiUrl('/api/usuarios/tecnicos'), { headers: { Authorization: `Bearer ${tok}` } });
    const rows = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(rows.error || rows.detail || `HTTP ${r.status}`);
    const list = Array.isArray(rows) ? rows : [];
    sel.innerHTML = '<option value="">Elegí un técnico…</option>';
    for (const u of list) {
        const opt = document.createElement('option');
        opt.value = String(u.id);
        opt.textContent = String(u.nombre || u.email || `Usuario ${u.id}`).trim();
        sel.appendChild(opt);
    }
}

async function ejecutar(tok) {
    const tipo = getTipo();
    const valor = valorSeleccionado();
    const tid = parseInt(String(_modal?.querySelector('#gn-ecm-tecnico')?.value || ''), 10);
    const nombre = String(_modal?.querySelector('#gn-ecm-nombre')?.value || '').trim();
    const soloSin = !!_modal?.querySelector('#gn-ecm-solo-sin-inc')?.checked;
    if (!Number.isFinite(tid) || tid <= 0) throw new Error('Elegí un técnico.');
    if (!_previewPedidos.length) throw new Error('No hay reclamos para agrupar.');
    const r = await fetch(apiUrl(`${API}/ejecutar`), {
        method: 'POST',
        headers: authHeaders(tok),
        body: JSON.stringify({
            tipo,
            valor,
            tecnico_asignado_id: tid,
            nombre: nombre || undefined,
            solo_sin_incidencia: soloSin,
            pedido_ids: _previewPedidos.map((p) => p.id),
        }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
    return j;
}

async function openWizard() {
    const tok = getTok();
    if (!tok) {
        toast('Iniciá sesión como administrador.', 'error');
        return;
    }
    const mc = ensureModal();
    _step = 1;
    _previewPedidos = [];
    setStep(1);
    mc.classList.add('active');
    try {
        await loadCatalogos(tok);
        fillSelectValor();
    } catch (e) {
        toast(String(e?.message || e), 'error');
    }
    const buscar = mc.querySelector('#gn-ecm-buscar');
    if (buscar && !buscar.dataset.gnEcmBound) {
        buscar.dataset.gnEcmBound = '1';
        buscar.addEventListener('input', () => fillSelectValor());
    }
    mc.querySelectorAll('input[name="gn-ecm-tipo"]').forEach((inp) => {
        if (inp.dataset.gnEcmBound) return;
        inp.dataset.gnEcmBound = '1';
        inp.addEventListener('change', () => fillSelectValor());
    });
}

function bindModalActions() {
    const mc = ensureModal();
    const cancel = mc.querySelector('#gn-ecm-cancel');
    const back = mc.querySelector('#gn-ecm-back');
    const next = mc.querySelector('#gn-ecm-next');

    if (cancel && !cancel.dataset.gnEcmBound) {
        cancel.dataset.gnEcmBound = '1';
        cancel.addEventListener('click', () => mc.classList.remove('active'));
    }
    if (back && !back.dataset.gnEcmBound) {
        back.dataset.gnEcmBound = '1';
        back.addEventListener('click', () => {
            if (_step > 1) setStep(_step - 1);
        });
    }
    if (next && !next.dataset.gnEcmBound) {
        next.dataset.gnEcmBound = '1';
        next.addEventListener('click', async () => {
            const tok = getTok();
            if (!tok) return;
            next.disabled = true;
            try {
                if (_step === 1) {
                    await fetchPreview(tok);
                    if (!_previewPedidos.length) {
                        toast('No hay reclamos abiertos para ese criterio.', 'info');
                        return;
                    }
                    setStep(2);
                } else if (_step === 2) {
                    const soloChk = mc.querySelector('#gn-ecm-solo-sin-inc');
                    if (soloChk && !soloChk.dataset.gnEcmPrevBound) {
                        soloChk.dataset.gnEcmPrevBound = '1';
                        soloChk.addEventListener('change', async () => {
                            try {
                                await fetchPreview(tok);
                            } catch (e) {
                                toast(String(e?.message || e), 'error');
                            }
                        });
                    }
                    await loadTecnicos(tok);
                    setStep(3);
                } else {
                    const j = await ejecutar(tok);
                    const incId = j?.incidencia?.id;
                    toast(
                        `✅ Incidencia #${incId} creada: ${j.pedidos_asociados || 0} reclamo(s), ${j.pedidos_asignados || 0} asignado(s).`,
                        'success'
                    );
                    mc.classList.remove('active');
                    recargarMapa();
                    if (incId && typeof window.__gnIncidenciasOpenVista === 'function') {
                        void window.__gnIncidenciasOpenVista(incId);
                    }
                }
            } catch (e) {
                toast(String(e?.message || e), 'error');
            } finally {
                next.disabled = false;
            }
        });
    }
}

function install() {
    bindModalActions();
    syncLauncherVisibility();
    document.addEventListener('visibilitychange', syncLauncherVisibility, false);
    document.addEventListener('gn-ms-visible', () => {
        syncLauncherVisibility();
        syncCorteMasivoLauncher();
    }, false);
    const obs = () => syncLauncherVisibility();
    try {
        setInterval(obs, 8000);
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    try {
        window.__gnEventoCorteMasivoOpen = () => void openWizard();
    } catch (_) {}
    const run = () => {
        try {
            install();
        } catch (e) {
            console.warn('[gn-evento-corte-masivo]', e);
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
}
