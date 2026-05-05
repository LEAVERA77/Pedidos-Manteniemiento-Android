/**
 * Asociación de pedidos en incidencias (badges, selección múltiple admin, modales).
 * Requiere API + migración `docs/NEON_incidencias.sql`.
 * made by leavera77
 */

import { toast } from './ui-utils.js';

/** @type {Record<string, number>} */
let _mapPedidoIncidencia = {};
/** Mapa numero_pedido → objeto compatible con norm() para UI de incidencias (la app no expone `window.app`). */
let _pedidosByNp = new Map();
let _prefetchPedidosAt = 0;
const _PREFETCH_PEDIDOS_TTL_MS = 20000;

let _fabEl = null;
let _modalAssoc = null;
let _modalVista = null;
/** Modal administrativo: cierre masivo con foto/materiales/observaciones heredados a cada pedido. */
let _modalCierreMasivo = null;
/** Modal admin: asignar un técnico a todos los pedidos abiertos de una incidencia. */
let _modalAsignarInc = null;
/** Tras cancelar/backdrop del modal cierre masivo, volver a mostrar la vista de incidencia (evita dos `.mo` en WebView). */
let _gnDismissVistaIncidencia = null;
let _moPl = null;
let _debTimer = null;

function closeModalCierreMasivoUI() {
    const root = _modalCierreMasivo;
    if (!root) return;
    const cb = _gnDismissVistaIncidencia;
    _gnDismissVistaIncidencia = null;
    try {
        root.classList.remove('active');
    } catch (_) {}
    if (typeof cb === 'function') {
        try {
            cb();
        } catch (_) {}
    }
}

function apiUrl(p) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(p) : p;
}
function getTok() {
    return typeof window.getApiToken === 'function' ? window.getApiToken() : '';
}
function esAdmin() {
    return typeof window.esAdmin === 'function' && window.esAdmin();
}

/** Payload JWT local (sin verificar firma): rol, userId, etc. */
function parseJwtPayloadCliente() {
    try {
        let tok = '';
        if (typeof window.getApiToken === 'function') tok = String(window.getApiToken() || '').trim();
        if (!tok) {
            try {
                tok = String(localStorage.getItem('pmg_api_token') || '').trim();
            } catch (_) {}
        }
        const parts = tok.split('.');
        if (parts.length < 2 || !parts[1]) return null;
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
        b64 += pad;
        const p = JSON.parse(atob(b64));
        return p && typeof p === 'object' ? p : null;
    } catch (_) {
        return null;
    }
}

/**
 * Lee `rol` del JWT guardado (misma fuente que la API en login). Sin verificar firma; solo UI/WebView.
 * Cubre casos donde `window.app.u` no está poblado aún en Android WebView.
 */
function leerRolDesdeJwtCliente() {
    const p = parseJwtPayloadCliente();
    return p ? String(p.rol ?? p.role ?? '').trim().toLowerCase() : '';
}

/** Id usuario para comparar con `tecnico_asignado_id`. Prioriza JWT (sesión real) sobre `app.u` (puede desincronizarse en WebView). */
function obtenerUserIdParaIncidencias() {
    const parseId = (v) => {
        if (v == null || v === '') return null;
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v | 0;
        const n = parseInt(String(v).trim(), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    const fromJwt = () => {
        const p = parseJwtPayloadCliente();
        if (!p) return null;
        const candidates = [p.userId, p.sub, p.id, p.usuario_id, p.usuarioId, p.uid];
        for (const c of candidates) {
            const n = parseId(c);
            if (n != null) return n;
        }
        return null;
    };
    const j = fromJwt();
    if (j != null) return j;
    try {
        const id = window.app?.u?.id;
        const n = parseId(id);
        if (n != null) return n;
    } catch (_) {}
    return null;
}

/** Rol efectivo para permisos del módulo: `app.u` si existe, si no payload JWT. Solo lectura. */
function obtenerRolUsuarioParaIncidencias() {
    try {
        const a = String(window.app?.u?.rol ?? '').trim().toLowerCase();
        if (a) return a;
    } catch (_) {}
    return leerRolDesdeJwtCliente();
}

function esAdminIncModule() {
    if (esAdmin()) return true;
    const r = obtenerRolUsuarioParaIncidencias();
    return r === 'admin' || r === 'administrador';
}

/** Misma regla que `esTecnicoOSupervisor` en app.js. */
function esTecnicoOSupervisorIncModule() {
    const r = obtenerRolUsuarioParaIncidencias();
    return r === 'tecnico' || r === 'supervisor';
}

/** Checkboxes, FAB asociar, badges, vista/cierre masivo y desasociar (admin + técnico/supervisor). */
function puedeGestionarIncidencias() {
    return esAdminIncModule() || esTecnicoOSupervisorIncModule();
}

/**
 * Misma lógica canónica que la API (`normalizarEstadoPedidoOperativo` en pedidos).
 * Evita que técnicos queden sin pedidos filtrables si Neon devuelve variantes de texto.
 */
function normalizarEstadoOperativoInc(raw) {
    const s0 = raw == null || raw === '' ? '' : String(raw).trim();
    if (!s0) return '';
    const low = s0.toLowerCase().replace(/\s+/g, ' ');
    const compact = low.replace(/[\s_-]/g, '');
    if (low === 'derivado externo' || compact === 'derivadoexterno') return 'Derivado externo';
    if (low === 'cerrado') return 'Cerrado';
    if (low === 'pendiente') return 'Pendiente';
    if (low === 'asignado') return 'Asignado';
    if (
        low === 'en ejecución' ||
        low === 'en ejecucion' ||
        compact === 'enejecución' ||
        compact === 'enejecucion' ||
        compact === 'enprogreso' ||
        low === 'en progreso' ||
        low === 'en curso'
    ) {
        return 'En ejecución';
    }
    return s0;
}

function estadoPedidoInc(p) {
    return normalizarEstadoOperativoInc(p?.es ?? p?.estado ?? '');
}

/** `tecnico_asignado_id` en filas API (snake / camel) o objeto lite con `tai`. */
function rawTecnicoAsignadoIdFromPedidoRow(row) {
    if (!row || typeof row !== 'object') return null;
    const raw = row.tai ?? row.tecnico_asignado_id ?? row.tecnicoAsignadoId ?? row.Tecnico_asignado_id;
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function taiPedidoInc(p) {
    return rawTecnicoAsignadoIdFromPedidoRow(p);
}

/**
 * ¿Se puede marcar el pedido para armar una incidencia?
 * - Admin/superadmin web: todos salvo cerrados.
 * - Técnico/supervisor: solo Asignado o En ejecución, asignados a sí mismo; nunca Pendiente ni Cerrado ni derivado externo.
 */
function puedeSeleccionarPedidoParaIncidencias(p) {
    if (!p || !puedeGestionarIncidencias()) return false;
    const es = estadoPedidoInc(p);
    if (es === 'Cerrado') return false;
    if (esAdminIncModule()) return true;
    if (!esTecnicoOSupervisorIncModule()) return false;
    if (es === 'Pendiente' || es === 'Derivado externo') return false;
    if (es !== 'Asignado' && es !== 'En ejecución') return false;
    const uid = obtenerUserIdParaIncidencias();
    const tai = taiPedidoInc(p);
    if (uid == null || tai == null) return false;
    return Number(tai) === Number(uid);
}

/**
 * Cierre masivo desde vista incidencia: técnico solo pedidos Asignado/En ejecución a su nombre (fila GET /api/incidencias/:id).
 * Separado de `puedeSeleccionarPedidoParaIncidencias` para leer bien columnas crudas del servidor.
 */
function pedidoPermiteCierreMasivoIncidenciaParaUsuarioActual(row) {
    if (!row || row.id == null || !puedeGestionarIncidencias()) return false;
    const es = normalizarEstadoOperativoInc(row.estado);
    if (es === 'Cerrado' || es === 'Derivado externo' || es === 'Pendiente') return false;
    if (es !== 'Asignado' && es !== 'En ejecución') return false;
    if (esAdminIncModule()) return true;
    if (!esTecnicoOSupervisorIncModule()) return false;
    const uid = obtenerUserIdParaIncidencias();
    const tai = rawTecnicoAsignadoIdFromPedidoRow(row);
    if (uid == null || tai == null) return false;
    return Number(uid) === Number(tai);
}
function rubroPanel() {
    const t = String(window.EMPRESA_CFG?.tipo || '').toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t.includes('agua')) return 'cooperativa_agua';
    if (t.includes('electric') || t.includes('eléctrica')) return 'cooperativa_electrica';
    return 'municipio';
}

async function fetchPedidoMap() {
    const tok = getTok();
    if (!tok || typeof window.apiUrl !== 'function') return;
    try {
        const r = await fetch(apiUrl('/api/incidencias/pedido-map'), { headers: { Authorization: `Bearer ${tok}` } });
        if (!r.ok) return;
        const j = await r.json();
        _mapPedidoIncidencia = j.map && typeof j.map === 'object' ? j.map : {};
    } catch (_) {}
}

/** Respuesta GET /api/pedidos → forma corta usada por badges / modal / FAB (mismos aliases que `norm()`). */
function rowApiToPedidoLite(row) {
    if (!row || row.id == null) return null;
    const np = String(row.numero_pedido ?? '').trim();
    if (!np) return null;
    const incRaw = row.incidencia_id;
    let inci = null;
    if (incRaw != null && incRaw !== '') {
        const n = parseInt(String(incRaw), 10);
        inci = Number.isFinite(n) ? n : null;
    }
    const taiRaw = row.tecnico_asignado_id;
    let tai = null;
    if (taiRaw != null && taiRaw !== '') {
        const n = parseInt(String(taiRaw), 10);
        tai = Number.isFinite(n) && n > 0 ? n : null;
    }
    return {
        id: row.id,
        np,
        nis: row.nis_medidor,
        tt: row.tipo_trabajo,
        es: row.estado,
        br: row.barrio,
        ccal: row.cliente_calle,
        dis: row.distribuidor,
        trf: row.trafo,
        inci,
        tai,
    };
}

function invalidatePedidosIncidenciasCache() {
    _pedidosByNp = new Map();
    _prefetchPedidosAt = 0;
}

/**
 * Carga pedidos vía API para poder resolver filas sin `window.app` (el estado vive en el módulo cerrado de app.js).
 */
async function prefetchPedidosParaIncidencias(force) {
    const tok = getTok();
    if (!tok || typeof window.apiUrl !== 'function') return;
    const now = Date.now();
    if (
        !force &&
        _pedidosByNp.size > 0 &&
        now - _prefetchPedidosAt < _PREFETCH_PEDIDOS_TTL_MS
    ) {
        return;
    }
    try {
        const r = await fetch(apiUrl('/api/pedidos?limit=800'), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        if (!r.ok) return;
        const rows = await r.json();
        if (!Array.isArray(rows)) return;
        const m = new Map();
        for (const row of rows) {
            const lite = rowApiToPedidoLite(row);
            if (lite?.np) m.set(lite.np, lite);
        }
        _pedidosByNp = m;
        _prefetchPedidosAt = Date.now();
    } catch (_) {}
}

function findPedidoLiteById(pid) {
    const idStr = String(pid ?? '');
    try {
        const list = window.app?.p;
        if (Array.isArray(list)) {
            const hit = list.find((x) => x && String(x.id) === idStr);
            if (hit) return hit;
        }
    } catch (_) {}
    for (const v of _pedidosByNp.values()) {
        if (v && String(v.id) === idStr) return v;
    }
    return null;
}

function recargarPedidosYMapa() {
    try {
        if (typeof window.__gnRecargarPedidos === 'function') window.__gnRecargarPedidos({ silent: true });
    } catch (_) {}
    invalidatePedidosIncidenciasCache();
    void fetchPedidoMap().then(() => {
        try {
            document.querySelectorAll('.pi[data-gn-inc-done="1"]').forEach((el) => {
                el.removeAttribute('data-gn-inc-done');
            });
        } catch (_) {}
        debouncedEnhance();
    });
}

/** Alineado con `MATERIAL_UNIDADES` en app.js (selector de unidades en materiales). */
const MATERIAL_UNIDADES = [
    'PZA',
    'MTR',
    'LTR',
    'KG',
    'M3',
    'M2',
    'ML',
    'JGO',
    'UN',
    'BOL',
    'TN',
    'BOB',
    'TR',
    'CJ',
    'PAR',
    'KIT',
    'TAM',
];

function esTipoPedidoFactibilidad(tipoTrabajo) {
    return String(tipoTrabajo || '')
        .trim()
        .toLowerCase()
        .includes('factibilidad');
}

/** Misma regla que `tipoPedidoExcluyeMateriales` en app.js (sin importar app.js). */
function tipoPedidoExcluyeMaterialesModule(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    if (!v) return false;
    if (v === 'Otros') return true;
    if (esTipoPedidoFactibilidad(v)) return true;
    return false;
}

function htmlOptsUnidadMaterial(u0) {
    const uNorm = String(u0 || '').trim();
    let html = MATERIAL_UNIDADES.map(
        (u) => `<option value="${u}"${u === uNorm ? ' selected' : ''}>${u}</option>`
    ).join('');
    if (uNorm && MATERIAL_UNIDADES.indexOf(uNorm) < 0) {
        html += `<option value="${uNorm.replace(/"/g, '&quot;')}" selected>${uNorm.replace(/</g, '&lt;')}</option>`;
    }
    return html;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
    });
}

function collectMaterialesRows(root) {
    const wrap = root.querySelector('#gn-inc-cierre-mat-rows');
    if (!wrap) return [];
    const out = [];
    wrap.querySelectorAll('[data-gn-mat-row]').forEach((row) => {
        const d = row.querySelector('.gn-inc-mat-desc')?.value?.trim() || '';
        const c = Number(row.querySelector('.gn-inc-mat-cant')?.value);
        const un = row.querySelector('.gn-inc-mat-un')?.value?.trim() || null;
        if (!d || !Number.isFinite(c)) return;
        out.push({ descripcion: d, cantidad: c, unidad: un });
    });
    return out;
}

function addMaterialRow(wrap, opts = {}) {
    const d = opts.descripcion || '';
    const c = opts.cantidad != null && opts.cantidad !== '' ? opts.cantidad : '';
    const u = opts.unidad || 'PZA';
    const row = document.createElement('div');
    row.setAttribute('data-gn-mat-row', '1');
    row.style.cssText =
        'display:grid;grid-template-columns:1fr 5rem 5.5rem auto;gap:.35rem;align-items:center;margin-bottom:.35rem';
    row.innerHTML = `
    <input type="text" class="gn-inc-mat-desc" placeholder="Descripción" style="min-width:0">
    <input type="number" class="gn-inc-mat-cant" min="0" step="any" placeholder="Cant." style="min-width:0">
    <select class="gn-inc-mat-un">${htmlOptsUnidadMaterial(u)}</select>
    <button type="button" class="btn-sm sec gn-inc-mat-del" title="Quitar"><i class="fas fa-times"></i></button>`;
    const di = row.querySelector('.gn-inc-mat-desc');
    const ci = row.querySelector('.gn-inc-mat-cant');
    if (di) di.value = d;
    if (ci && c !== '') ci.value = String(c);
    wrap.appendChild(row);
    row.querySelector('.gn-inc-mat-del')?.addEventListener('click', () => row.remove());
}

function ensureModalCierreMasivo() {
    if (_modalCierreMasivo) return _modalCierreMasivo;
    const root = document.createElement('div');
    root.id = 'gn-modal-inc-cierre-masivo';
    root.className = 'mo';
    root.style.zIndex = '10070';
    root.innerHTML = `
<div class="mc lg gn-inc-modal-mc" style="max-width:min(96vw,34rem)">
  <div class="mh"><h3 id="gn-inc-cierre-tit"><i class="fas fa-check-double"></i> Cerrar incidencia</h3><button type="button" class="cm" data-close="1"><i class="fas fa-times"></i></button></div>
  <div class="mb" style="padding:0 1rem 1rem">
    <p id="gn-inc-cierre-sub" style="font-size:.8rem;color:var(--tm);margin:0 0 .65rem"></p>
    <label style="display:block;font-size:.85rem;margin-bottom:.25rem"><i class="fas fa-camera"></i> Foto del cierre (opcional)</label>
    <div style="display:flex;flex-wrap:wrap;gap:.45rem;margin-bottom:.35rem">
      <button type="button" id="gn-inc-foto-cam" class="btn-foto"><i class="fas fa-camera"></i> Tomar foto</button>
      <label for="gn-inc-foto-gal" class="btn-foto" style="cursor:pointer;display:inline-flex;align-items:center;gap:.5rem"><i class="fas fa-upload"></i> Galería</label>
    </div>
    <input type="file" id="gn-inc-foto-cam-inp" accept="image/*" capture="environment" class="gn-inc-file-input-hidden" aria-hidden="true" tabindex="-1">
    <input type="file" id="gn-inc-foto-gal" accept="image/*" style="display:none">
    <div id="gn-inc-foto-prev" class="fotos-container" style="margin-bottom:.65rem;min-height:0"></div>
    <div id="gn-inc-mat-wrap">
      <label style="display:block;font-size:.85rem;margin-bottom:.25rem"><i class="fas fa-wrench"></i> Materiales utilizados</label>
      <div id="gn-inc-cierre-mat-rows"></div>
      <button type="button" id="gn-inc-mat-add" class="btn-sm sec" style="margin-top:.35rem"><i class="fas fa-plus"></i> Agregar material</button>
    </div>
    <label for="gn-inc-tr" style="display:block;font-size:.85rem;margin:.65rem 0 .25rem"><i class="fas fa-clipboard"></i> Trabajo realizado / Observaciones</label>
    <textarea id="gn-inc-tr" rows="4" style="width:100%;box-sizing:border-box" placeholder="Describe el trabajo realizado…"></textarea>
    <div style="margin-top:.85rem;display:flex;flex-wrap:wrap;gap:.45rem">
      <button type="button" id="gn-inc-cierre-cancel" class="btn-sm sec" style="flex:1">Cancelar</button>
      <button type="button" id="gn-inc-cierre-ok" class="bp" style="flex:1"><i class="fas fa-check"></i> Cerrar todos</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
        if (e.target === root) closeModalCierreMasivoUI();
    });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModalCierreMasivoUI()));
    _modalCierreMasivo = root;
    return root;
}

/**
 * @param {{ incId: number, incNombre: string, pedidosAbiertos: Array<Record<string, unknown>>, tok: string, dismissVistaIncidencia?: () => void }} args
 */
function openModalCierreMasivoIncidencia(args) {
    const { incId, incNombre, pedidosAbiertos, tok, dismissVistaIncidencia } = args;
    const putFn = typeof window.pedidoPutApi === 'function' ? window.pedidoPutApi : null;
    if (!putFn) {
        toast('No se pudo usar el guardado de pedidos (pedidoPutApi). Recargá la app.', 'error');
        if (typeof dismissVistaIncidencia === 'function') {
            try {
                dismissVistaIncidencia();
            } catch (_) {}
        }
        return;
    }
    _gnDismissVistaIncidencia = typeof dismissVistaIncidencia === 'function' ? dismissVistaIncidencia : null;
    const mc = ensureModalCierreMasivo();
    const tit = mc.querySelector('#gn-inc-cierre-tit');
    const sub = mc.querySelector('#gn-inc-cierre-sub');
    const prev = mc.querySelector('#gn-inc-foto-prev');
    const tr = mc.querySelector('#gn-inc-tr');
    const rowsWrap = mc.querySelector('#gn-inc-cierre-mat-rows');
    const matWrap = mc.querySelector('#gn-inc-mat-wrap');
    const btnOk0 = mc.querySelector('#gn-inc-cierre-ok');
    const btnCancel0 = mc.querySelector('#gn-inc-cierre-cancel');

    let fotoDataUrl = '';
    const nombreEsc = String(incNombre || '').trim();
    const titulo =
        nombreEsc.length > 0
            ? `Cerrar incidencia #${incId} — ${nombreEsc}`
            : `Cerrar incidencia #${incId}`;
    if (tit) tit.innerHTML = `<i class="fas fa-check-double"></i> ${titulo.replace(/</g, '&lt;')}`;
    if (sub) sub.textContent = `Se aplicará a ${pedidosAbiertos.length} pedido(s) abierto(s).`;
    if (tr) tr.value = '';
    if (prev) prev.innerHTML = '';
    if (rowsWrap) {
        rowsWrap.innerHTML = '';
        addMaterialRow(rowsWrap);
    }

    const algunPermiteMat = pedidosAbiertos.some((p) => {
        const tt = String(p.tipo_trabajo ?? p.tt ?? '').trim();
        return !tipoPedidoExcluyeMaterialesModule(tt);
    });
    if (matWrap) matWrap.style.display = algunPermiteMat ? '' : 'none';

    const setPreview = (dataUrl) => {
        fotoDataUrl = dataUrl || '';
        if (!prev) return;
        if (!fotoDataUrl) {
            prev.innerHTML = '';
            return;
        }
        prev.innerHTML = `<img alt="" src="${fotoDataUrl.replace(/"/g, '&quot;')}" style="max-width:100%;max-height:200px;border-radius:.35rem;border:1px solid var(--bo);object-fit:contain"/>`;
    };

    const MAX_FOTO_CIERRE_BYTES = 14 * 1024 * 1024;
    const onPick = async (file) => {
        if (!file || !String(file.type || '').startsWith('image/')) {
            if (file) toast('Elegí un archivo de imagen.', 'info');
            return;
        }
        if (typeof file.size === 'number' && file.size > MAX_FOTO_CIERRE_BYTES) {
            toast('La imagen es demasiado grande (máx. ~14 MB). Probá otra foto o comprimila.', 'error');
            return;
        }
        try {
            const u = await readFileAsDataUrl(file);
            if (!String(u || '').startsWith('data:image/')) {
                toast('No se pudo leer la imagen.', 'error');
                return;
            }
            setPreview(u);
        } catch (e) {
            toast(String(e?.message || e || 'No se pudo cargar la imagen'), 'error');
        }
    };

    const btnCam0 = mc.querySelector('#gn-inc-foto-cam');
    if (btnCam0?.parentNode) {
        const nb = btnCam0.cloneNode(true);
        btnCam0.parentNode.replaceChild(nb, btnCam0);
        nb.addEventListener('click', () => mc.querySelector('#gn-inc-foto-cam-inp')?.click());
    }
    const inpCam0 = mc.querySelector('#gn-inc-foto-cam-inp');
    if (inpCam0?.parentNode) {
        const ni = inpCam0.cloneNode(true);
        inpCam0.parentNode.replaceChild(ni, inpCam0);
        ni.addEventListener('change', () => {
            const f = ni.files?.[0];
            ni.value = '';
            void onPick(f);
        });
    }
    const inpGal0 = mc.querySelector('#gn-inc-foto-gal');
    if (inpGal0?.parentNode) {
        const ng = inpGal0.cloneNode(true);
        inpGal0.parentNode.replaceChild(ng, inpGal0);
        ng.addEventListener('change', () => {
            const f = ng.files?.[0];
            ng.value = '';
            void onPick(f);
        });
    }

    const addBtn0 = mc.querySelector('#gn-inc-mat-add');
    if (addBtn0?.parentNode) {
        const nb = addBtn0.cloneNode(true);
        addBtn0.parentNode.replaceChild(nb, addBtn0);
        nb.addEventListener('click', () => {
            const w = mc.querySelector('#gn-inc-cierre-mat-rows');
            if (w) addMaterialRow(w);
        });
    }

    if (btnCancel0?.parentNode) {
        const nb = btnCancel0.cloneNode(true);
        btnCancel0.parentNode.replaceChild(nb, btnCancel0);
        nb.addEventListener('click', () => closeModalCierreMasivoUI());
    }
    if (btnOk0?.parentNode) {
        const nb = btnOk0.cloneNode(true);
        btnOk0.parentNode.replaceChild(nb, btnOk0);
        nb.addEventListener('click', async () => {
            const trabajo = mc.querySelector('#gn-inc-tr')?.value?.trim() || '';
            if (!trabajo) {
                toast('Describí el trabajo realizado', 'error');
                return;
            }
            const matsAll = algunPermiteMat ? collectMaterialesRows(mc) : [];
            nb.disabled = true;
            try {
                let okCount = 0;
                for (const p of pedidosAbiertos) {
                    const pid = p.id;
                    const tt = String(p.tipo_trabajo ?? p.tt ?? '').trim();
                    const body = {
                        estado: 'Cerrado',
                        avance: 100,
                        trabajo_realizado: trabajo,
                        incidencia_id: incId,
                    };
                    if (fotoDataUrl) body.foto_cierre_base64 = fotoDataUrl;
                    if (!tipoPedidoExcluyeMaterialesModule(tt) && matsAll.length) body.materiales = matsAll;
                    const row = await putFn(pid, body);
                    if (!row) throw new Error(`No se pudo cerrar el pedido ${pid}`);
                    okCount += 1;
                }
                const rr = await fetch(apiUrl(`/api/incidencias/${encodeURIComponent(String(incId))}`), {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ estado: 'cerrada' }),
                });
                const jj = await rr.json().catch(() => ({}));
                if (!rr.ok) throw new Error(jj.error || jj.detail || `Incidencia HTTP ${rr.status}`);
                toast(`✅ Incidencia #${incId} cerrada. ${okCount} pedido(s) actualizado(s).`, 'success');
                _gnDismissVistaIncidencia = null;
                mc.classList.remove('active');
                invalidatePedidosIncidenciasCache();
                recargarPedidosYMapa();
                void openVistaIncidencia(incId);
            } catch (e) {
                toast(String(e?.message || e), 'error');
            } finally {
                nb.disabled = false;
            }
        });
    }

    mc.classList.add('active');
}

function ensureModalAsignarTecnicoIncidencia() {
    if (_modalAsignarInc) return _modalAsignarInc;
    const root = document.createElement('div');
    root.id = 'gn-modal-inc-asignar-tecnico';
    root.className = 'mo';
    root.style.zIndex = '10062';
    root.innerHTML = `
<div class="mc lg gn-inc-modal-mc" style="max-width:min(96vw,28rem)">
  <div class="mh"><h3 id="gn-inc-asig-tit"><i class="fas fa-user-plus"></i> Asignar técnico</h3><button type="button" class="cm" data-close="1"><i class="fas fa-times"></i></button></div>
  <div class="mb" style="padding:0 1rem 1rem">
    <p id="gn-inc-asig-sub" style="font-size:.8rem;color:var(--tm);margin:0 0 .65rem"></p>
    <label for="gn-inc-asig-sel" style="display:block;font-size:.85rem;margin-bottom:.25rem">Técnico</label>
    <select id="gn-inc-asig-sel" style="width:100%;padding:.45rem;border-radius:.45rem;border:1px solid var(--bo);margin-bottom:.85rem"></select>
    <div style="display:flex;flex-wrap:wrap;gap:.45rem">
      <button type="button" id="gn-inc-asig-cancel" class="btn-sm sec" style="flex:1">Cancelar</button>
      <button type="button" id="gn-inc-asig-ok" class="bp" style="flex:1"><i class="fas fa-check"></i> Asignar a todos</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
        if (e.target === root) root.classList.remove('active');
    });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => root.classList.remove('active')));
    _modalAsignarInc = root;
    return root;
}

/**
 * Admin: PUT `/api/pedidos/:id/asignar` en cada pedido abierto de la incidencia.
 * @param {{ incId: number, pedidoIds: number[], tok: string, onDone?: () => void }} args
 */
async function openModalAsignarTecnicoIncidencia(args) {
    const { incId, pedidoIds, tok, onDone } = args;
    if (!Array.isArray(pedidoIds) || !pedidoIds.length) {
        toast('No hay pedidos para asignar.', 'info');
        return;
    }
    const mc = ensureModalAsignarTecnicoIncidencia();
    const tit = mc.querySelector('#gn-inc-asig-tit');
    const sub = mc.querySelector('#gn-inc-asig-sub');
    const sel = mc.querySelector('#gn-inc-asig-sel');
    const btnOk0 = mc.querySelector('#gn-inc-asig-ok');
    const btnCancel0 = mc.querySelector('#gn-inc-asig-cancel');

    if (tit) tit.innerHTML = `<i class="fas fa-user-plus"></i> Asignar técnico — incidencia #${incId}`;
    if (sub) sub.textContent = `Se asignará el mismo técnico a ${pedidoIds.length} pedido(s) abierto(s).`;
    if (sel) {
        sel.innerHTML = '<option value="">Elegí un técnico…</option>';
    }

    try {
        const r = await fetch(apiUrl('/api/usuarios/tecnicos'), { headers: { Authorization: `Bearer ${tok}` } });
        const rows = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(rows.error || rows.detail || `HTTP ${r.status}`);
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
            toast('No hay técnicos activos.', 'error');
            return;
        }
        for (const u of list) {
            const id = u.id;
            const nom = String(u.nombre || u.email || `Usuario ${id}`).trim();
            const opt = document.createElement('option');
            opt.value = String(id);
            opt.textContent = nom;
            sel?.appendChild(opt);
        }
    } catch (e) {
        toast(String(e?.message || e), 'error');
        return;
    }

    const close = () => mc.classList.remove('active');

    if (btnCancel0?.parentNode) {
        const nb = btnCancel0.cloneNode(true);
        btnCancel0.parentNode.replaceChild(nb, btnCancel0);
        nb.addEventListener('click', close);
    }
    if (btnOk0?.parentNode) {
        const nb = btnOk0.cloneNode(true);
        btnOk0.parentNode.replaceChild(nb, btnOk0);
        nb.addEventListener('click', async () => {
            const tid = parseInt(String(sel?.value || ''), 10);
            if (!Number.isFinite(tid) || tid <= 0) {
                toast('Elegí un técnico.', 'error');
                return;
            }
            nb.disabled = true;
            try {
                let ok = 0;
                for (const pid of pedidoIds) {
                    const rr = await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(pid))}/asignar`), {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tecnico_asignado_id: tid }),
                    });
                    const jj = await rr.json().catch(() => ({}));
                    if (!rr.ok) throw new Error(jj.error || jj.detail || `Pedido ${pid}: HTTP ${rr.status}`);
                    ok += 1;
                }
                toast(`✅ Técnico asignado en ${ok} pedido(s).`, 'success');
                close();
                invalidatePedidosIncidenciasCache();
                recargarPedidosYMapa();
                if (typeof onDone === 'function') onDone();
            } catch (e) {
                toast(String(e?.message || e), 'error');
            } finally {
                nb.disabled = false;
            }
        });
    }

    mc.classList.add('active');
}

function parseNpFromRow(row) {
    const fromDs = row.dataset?.gnNp;
    if (fromDs != null && String(fromDs).trim() !== '') return String(fromDs).trim();
    const t = row.querySelector('.pn')?.textContent || '';
    const m = t.match(/#(\d+)/);
    if (m) return String(parseInt(m[1], 10));
    const raw = t.replace(/\s+/g, ' ').trim();
    const hash = raw.indexOf('#');
    if (hash === -1) return null;
    let token = raw.slice(hash + 1).trim();
    token = token.replace(/LOCAL$/i, '').trim();
    return token || null;
}
function findPedidoForIncidenciasUi(np) {
    if (np == null || np === '') return null;
    const key = String(np).trim();
    if (!key) return null;
    try {
        const list = window.app?.p;
        if (Array.isArray(list)) {
            const hit = list.find((x) => x && String(x.np ?? '').trim() === key);
            if (hit) return hit;
        }
    } catch (_) {}
    return _pedidosByNp.get(key) || null;
}

function uniqueNonEmpty(...vals) {
    const s = new Set();
    for (const v of vals) {
        const t = String(v || '').trim();
        if (t) s.add(t);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
}

function criterioOptionsForRubro(pedidos) {
    const r = rubroPanel();
    if (r === 'municipio') {
        return {
            criterios: [
                { value: 'calle', label: 'Calle (cliente)' },
                { value: 'barrio', label: 'Barrio' },
            ],
            valuesByCriterio: (c) => {
                if (c === 'barrio') return uniqueNonEmpty(...pedidos.map((p) => p.br));
                return uniqueNonEmpty(...pedidos.map((p) => p.ccal));
            },
        };
    }
    if (r === 'cooperativa_agua') {
        return {
            criterios: [
                { value: 'calle', label: 'Calle' },
                { value: 'ramal', label: 'Ramal (zona / distribuidor en pedido)' },
            ],
            valuesByCriterio: (c) => {
                if (c === 'ramal') return uniqueNonEmpty(...pedidos.map((p) => p.dis));
                return uniqueNonEmpty(...pedidos.map((p) => p.ccal));
            },
        };
    }
    return {
        criterios: [
            { value: 'transformador', label: 'Transformador' },
            { value: 'distribuidor', label: 'Distribuidor' },
        ],
        valuesByCriterio: (c) => {
            if (c === 'transformador') return uniqueNonEmpty(...pedidos.map((p) => p.trf));
            return uniqueNonEmpty(...pedidos.map((p) => p.dis));
        },
    };
}

function ensureFab() {
    if (_fabEl) return _fabEl;
    const el = document.createElement('button');
    el.type = 'button';
    el.id = 'gn-incidencias-fab';
    el.className = 'gn-inc-fab';
    el.style.cssText =
        'display:none;position:fixed;bottom:5.5rem;left:50%;transform:translateX(-50%);z-index:10040;padding:.55rem 1rem;border-radius:999px;border:none;background:#0ea5e9;color:#fff;font-weight:700;font-size:.82rem;cursor:pointer;box-shadow:0 4px 14px rgba(14,165,233,.45);align-items:center;gap:.35rem;touch-action:manipulation;-webkit-tap-highlight-color:transparent';
    el.innerHTML = '<i class="fas fa-link"></i> <span id="gn-incidencias-fab-txt"></span>';
    el.addEventListener('click', () => void openModalAsociar());
    document.body.appendChild(el);
    _fabEl = el;
    return el;
}

const _selectedNp = new Set();

function countSelectableSelectedNp() {
    let n = 0;
    for (const k of _selectedNp) {
        const px = findPedidoForIncidenciasUi(k);
        if (px && puedeSeleccionarPedidoParaIncidencias(px)) n += 1;
    }
    return n;
}

function getVisibleRowCheckboxes(pl) {
    return [...pl.querySelectorAll(':scope > .pi .gn-pi-cb-wrap input.gn-pi-cb, :scope > .pi input.gn-pi-cb')];
}

function updateSelectAllLabel(pl, allSelected) {
    const lbl = document.getElementById('gn-inc-select-all-lbl');
    if (!lbl) return;
    lbl.textContent = allSelected ? '☑ Deseleccionar todos' : '☐ Seleccionar todos';
}

/** Sincroniza el checkbox maestro con el estado de las filas visibles (reglas 5 y 6). */
function syncSelectAllMasterState(pl) {
    const wrap = pl.querySelector('#gn-inc-select-all-wrap');
    const master = document.getElementById('gn-inc-select-all-cb');
    if (!wrap || !master) return;
    const cbs = getVisibleRowCheckboxes(pl);
    if (!cbs.length) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';
    const allOn = cbs.every((cb) => cb.checked);
    master.checked = allOn;
    updateSelectAllLabel(pl, allOn);
}

function onMasterSelectAllChange(ev) {
    const pl = document.getElementById('pl');
    if (!pl) return;
    const master = ev.target;
    const on = master.checked;
    const cbs = getVisibleRowCheckboxes(pl);
    cbs.forEach((cb) => {
        const k = cb.dataset.np;
        if (!k) return;
        cb.checked = on;
        if (on) _selectedNp.add(k);
        else _selectedNp.delete(k);
    });
    updateFab();
    syncSelectAllMasterState(pl);
}

function ensureSelectAllBar(pl) {
    if (!puedeGestionarIncidencias()) {
        try {
            pl.querySelector('#gn-inc-select-all-wrap')?.remove();
        } catch (_) {}
        return;
    }
    const cbs = getVisibleRowCheckboxes(pl);
    if (!cbs.length) {
        try {
            pl.querySelector('#gn-inc-select-all-wrap')?.remove();
        } catch (_) {}
        return;
    }

    let wrap = pl.querySelector('#gn-inc-select-all-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'gn-inc-select-all-wrap';
        wrap.className = 'gn-inc-select-all-wrap';
        wrap.style.cssText =
            'display:flex;align-items:center;gap:.5rem;padding:.45rem .65rem;margin:0 0 .4rem;background:var(--bg);border-radius:.5rem;border:1px solid var(--bo);flex-shrink:0';
        wrap.innerHTML = `<label class="gn-inc-select-all-lbl" style="display:flex;align-items:center;gap:.45rem;margin:0;cursor:pointer;font-size:.82rem;font-weight:600;color:var(--bd);user-select:none">
<input type="checkbox" id="gn-inc-select-all-cb" />
<span id="gn-inc-select-all-lbl">☐ Seleccionar todos</span>
</label>`;
        const master = wrap.querySelector('#gn-inc-select-all-cb');
        if (master) {
            master.addEventListener('change', onMasterSelectAllChange);
            master.addEventListener('click', (e) => e.stopPropagation());
        }
        pl.prepend(wrap);
    } else if (wrap !== pl.firstElementChild) {
        try {
            pl.prepend(wrap);
        } catch (_) {}
    }
    syncSelectAllMasterState(pl);
}

function updateFab() {
    const fab = ensureFab();
    const n = countSelectableSelectedNp();
    if (!puedeGestionarIncidencias() || n < 2) {
        fab.style.display = 'none';
        return;
    }
    fab.style.display = 'flex';
    const sp = document.getElementById('gn-incidencias-fab-txt');
    if (sp) sp.textContent = `Asociar reclamos (${n})`;
}

function enhanceListaPedidosInner() {
    const pl = document.getElementById('pl');
    if (!pl) return;

    const rows = pl.querySelectorAll(':scope > .pi');
    rows.forEach((row) => {
        const np = parseNpFromRow(row);
        const p = findPedidoForIncidenciasUi(np);
        const wantCb = puedeGestionarIncidencias() && p && puedeSeleccionarPedidoParaIncidencias(p);
        const hasCb = !!row.querySelector('.gn-pi-cb-wrap');

        if (row.dataset.gnIncDone === '1') {
            if (wantCb === hasCb) return;
            row.removeAttribute('data-gn-inc-done');
            row.querySelector('.gn-pi-cb-wrap')?.remove();
            const mv0 = row.querySelector(':scope > .gn-pi-inc-move');
            if (mv0) {
                while (mv0.firstChild) row.insertBefore(mv0.firstChild, mv0);
                mv0.remove();
            }
            row.classList.remove('gn-pi-inc');
            row.style.display = '';
            row.style.alignItems = '';
            row.style.gap = '';
        }
        if (!p) {
            return;
        }

        row.dataset.pedidoId = String(p.id);
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.style.gap = '6px';
        row.classList.add('gn-pi-inc');

        const move = document.createElement('div');
        move.className = 'gn-pi-inc-move';
        move.style.cssText = 'flex:1;min-width:0';
        while (row.firstChild) move.appendChild(row.firstChild);

        if (wantCb) {
            const wrapCb = document.createElement('label');
            wrapCb.className = 'gn-pi-cb-wrap';
            wrapCb.setAttribute('aria-label', 'Seleccionar pedido para incidencia');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'gn-pi-cb';
            const npKey = String(np);
            cb.dataset.np = npKey;
            cb.checked = _selectedNp.has(npKey);
            cb.addEventListener('click', (e) => e.stopPropagation());
            cb.addEventListener('change', () => {
                if (cb.checked) _selectedNp.add(npKey);
                else _selectedNp.delete(npKey);
                updateFab();
                syncSelectAllMasterState(pl);
            });
            wrapCb.appendChild(cb);
            wrapCb.addEventListener('click', (e) => e.stopPropagation());
            row.appendChild(wrapCb);
        }

        row.appendChild(move);

        const incId = p.inci ?? _mapPedidoIncidencia[String(p.id)];
        if (incId) {
            const badge = document.createElement('span');
            badge.className = 'incidencia-badge';
            badge.textContent = `🔗 Incidencia #${incId}`;
            badge.title = 'Ver pedidos de la incidencia';
            badge.style.cursor = 'pointer';
            badge.setAttribute('role', 'button');
            badge.tabIndex = 0;
            /** Captura: evita que el click llegue al `.pi` y abra el detalle del pedido (WebView / táctil). */
            const openInc = (e) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                } catch (_) {}
                void openVistaIncidencia(incId);
            };
            badge.addEventListener('click', openInc, true);
            badge.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    openInc(e);
                }
            });
            const ph2 = move.querySelector('.ph2');
            if (ph2) ph2.appendChild(badge);
            else move.insertBefore(badge, move.firstChild);
        }

        row.dataset.gnIncDone = '1';
    });
    try {
        for (const k of [..._selectedNp]) {
            const px = findPedidoForIncidenciasUi(k);
            if (!px || !puedeSeleccionarPedidoParaIncidencias(px)) _selectedNp.delete(k);
        }
    } catch (_) {}
    updateFab();
    ensureSelectAllBar(pl);
}

async function enhanceListaPedidos() {
    await prefetchPedidosParaIncidencias(false);
    enhanceListaPedidosInner();
}

function debouncedEnhance() {
    if (_debTimer) clearTimeout(_debTimer);
    _debTimer = setTimeout(() => {
        _debTimer = null;
        void enhanceListaPedidos();
    }, 80);
}

/** Contenido del modal de asociación (se repinta en cada apertura para garantizar selects/input en el DOM). */
const GN_ASSOC_MC_INNER_HTML = `
  <div class="mh"><h3><i class="fas fa-link"></i> Asociar reclamos</h3><button type="button" class="cm" data-close="1"><i class="fas fa-times"></i></button></div>
  <div class="mb" style="padding:0 1rem 1rem">
    <p style="font-size:.78rem;color:var(--tm);margin:0 0 .5rem">Pedidos seleccionados:</p>
    <ul id="gn-inc-lista-sel" style="font-size:.8rem;max-height:8rem;overflow:auto;margin:0 0 .75rem;padding-left:1.1rem"></ul>
    <div class="fg" style="padding:0">
      <label for="gn-inc-criterio" style="font-size:.78rem">Criterio de agrupación</label>
      <select id="gn-inc-criterio" name="gn-inc-criterio" style="width:100%;margin-top:.25rem;padding:.4rem;border-radius:.45rem;border:1px solid var(--bo)"></select>
    </div>
    <div class="fg" style="padding:0;margin-top:.5rem">
      <label for="gn-inc-valor-criterio" style="font-size:.78rem">Valor</label>
      <select id="gn-inc-valor-criterio" name="gn-inc-valor-criterio" style="width:100%;margin-top:.25rem;padding:.4rem;border-radius:.45rem;border:1px solid var(--bo)"></select>
    </div>
    <div class="fg" style="padding:0;margin-top:.5rem">
      <label for="gn-inc-nombre" style="font-size:.78rem">Nombre de la incidencia (opcional)</label>
      <input type="text" id="gn-inc-nombre" name="gn-inc-nombre" maxlength="200" placeholder="Autogenerado si lo dejás vacío" style="width:100%;margin-top:.25rem;padding:.4rem;border-radius:.45rem;border:1px solid var(--bo)" />
    </div>
    <div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap">
      <button type="button" class="sec" data-close="1" style="flex:1">Cancelar</button>
      <button type="button" id="gn-inc-confirm" class="bp" style="flex:1.2"><i class="fas fa-check"></i> Confirmar asociación</button>
    </div>
  </div>`;

function ensureAssocModalRoot() {
    let root = document.getElementById('gn-modal-incidencias-assoc');
    if (root && document.body.contains(root)) {
        _modalAssoc = root;
        return root;
    }
    root = document.createElement('div');
    root.id = 'gn-modal-incidencias-assoc';
    root.className = 'mo';
    root.style.zIndex = '10050';
    root.innerHTML = '<div class="mc gn-inc-modal-mc" style="max-width:min(96vw,26rem)"></div>';
    root.addEventListener('click', (e) => {
        if (e.target === root) closeModalAssoc();
    });
    document.body.appendChild(root);
    _modalAssoc = root;
    return root;
}

/** Repinta el formulario dentro de .mc cada vez que se abre el modal (evita DOM vacío / caché rota). */
function paintAssocModalContent() {
    const root = ensureAssocModalRoot();
    const mc = root.querySelector('.mc');
    if (!mc) return root;
    mc.innerHTML = GN_ASSOC_MC_INNER_HTML;
    mc.classList.add('gn-inc-modal-mc');
    mc.style.maxWidth = 'min(96vw,26rem)';
    root.querySelectorAll('[data-close]').forEach((b) => {
        b.onclick = () => closeModalAssoc();
    });
    _modalAssoc = root;
    return root;
}

function closeModalAssoc() {
    if (_modalAssoc) _modalAssoc.classList.remove('active');
}

async function openModalAsociar() {
    if (!puedeGestionarIncidencias()) return;
    await prefetchPedidosParaIncidencias(true);
    const peds = [..._selectedNp]
        .map((np) => findPedidoForIncidenciasUi(np))
        .filter(Boolean)
        .filter((x) => puedeSeleccionarPedidoParaIncidencias(x));
    if (peds.length < 2) {
        toast('Seleccioná al menos 2 pedidos que podás asociar (según tu rol).', 'error');
        return;
    }
    const m = paintAssocModalContent();
    const ul = m.querySelector('#gn-inc-lista-sel');
    if (ul)
        ul.innerHTML = peds
            .map(
                (p) =>
                    `<li><strong>#${p.np}</strong> — ${String(p.nis || '—').replace(/</g, '&lt;')} — ${String(p.tt || '').replace(/</g, '&lt;')} — <em>${String(p.es || '').replace(/</g, '&lt;')}</em></li>`
            )
            .join('');

    const { criterios, valuesByCriterio } = criterioOptionsForRubro(peds);
    const selC = m.querySelector('#gn-inc-criterio');
    const selV = m.querySelector('#gn-inc-valor-criterio');
    const inpNombre = m.querySelector('#gn-inc-nombre');
    if (!selC || !selV || !inpNombre) {
        toast('No se pudo cargar el formulario de asociación. Reintentá.', 'error');
        return;
    }

    selC.innerHTML = criterios.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
    const syncVal = () => {
        const c = selC.value || criterios[0]?.value;
        const opts = valuesByCriterio(c) || [];
        selV.innerHTML = opts.length
            ? opts.map((o) => `<option value="${o.replace(/"/g, '&quot;')}">${o.replace(/</g, '&lt;')}</option>`).join('')
            : '<option value="">— Sin valores comunes —</option>';
    };
    selC.onchange = syncVal;
    syncVal();

    const confirmBtn = m.querySelector('#gn-inc-confirm');
    if (!confirmBtn) {
        toast('Falta el botón de confirmación en el formulario.', 'error');
        return;
    }
    const confirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(confirm, confirmBtn);

    confirm.addEventListener('click', async () => {
        const criterio = selC.value.trim();
        const valor = selV.value.trim();
        const nombre = inpNombre.value.trim();
        if (!criterio || !valor) {
            toast('Elegí criterio y valor', 'error');
            return;
        }
        const tok = getTok();
        if (!tok) {
            toast('Sin sesión', 'error');
            return;
        }
        confirm.disabled = true;
        try {
            const body = {
                pedido_ids: peds.map((p) => p.id),
                criterio_agrupacion: criterio,
                valor_criterio: valor,
            };
            if (nombre) body.nombre = nombre;
            const r = await fetch(apiUrl('/api/incidencias'), {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
            const nid = j.id;
            toast(`✅ Incidencia #${nid} creada con ${peds.length} pedidos`, 'success');
            _selectedNp.clear();
            updateFab();
            closeModalAssoc();
            recargarPedidosYMapa();
        } catch (e) {
            toast(String(e?.message || e), 'error');
        } finally {
            confirm.disabled = false;
        }
    });

    m.classList.add('active');
}

function buildModalVista() {
    if (_modalVista) return _modalVista;
    const root = document.createElement('div');
    root.id = 'gn-modal-incidencias-vista';
    root.className = 'mo';
    root.style.zIndex = '10050';
    root.innerHTML = `
<div class="mc lg gn-inc-modal-mc" style="max-width:min(96vw,36rem)">
  <div class="mh"><h3 id="gn-inc-v-tit"><i class="fas fa-project-diagram"></i> Incidencia</h3><button type="button" class="cm" data-close="1"><i class="fas fa-times"></i></button></div>
  <div class="mb" style="padding:0 1rem 1rem">
    <div id="gn-inc-v-meta" style="font-size:.8rem;color:var(--tm);margin-bottom:.65rem"></div>
    <div id="gn-inc-v-prog" style="font-size:.85rem;font-weight:600;margin-bottom:.5rem"></div>
    <div id="gn-inc-v-list" style="max-height:min(50vh,320px);overflow:auto;font-size:.82rem;border:1px solid var(--bo);border-radius:.5rem;padding:.35rem"></div>
    <div style="margin-top:.75rem;display:flex;flex-wrap:wrap;gap:.45rem">
      <button type="button" id="gn-inc-v-asignar-tecnico" class="btn-sm sec" style="flex:1;min-width:12rem;display:none;justify-content:center;gap:.35rem;font-size:.9rem;font-weight:600"><i class="fas fa-user-plus"></i> Asignar técnico a incidencia</button>
      <button type="button" id="gn-inc-v-cerrar-todos" class="bp" style="flex:1;min-width:12rem"><i class="fas fa-check-double"></i> Cerrar todos los pedidos</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
        if (e.target === root) root.classList.remove('active');
    });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => root.classList.remove('active')));
    _modalVista = root;
    return root;
}

async function openVistaIncidencia(incId) {
    const tok = getTok();
    if (!tok) {
        toast('Sin sesión', 'error');
        return;
    }
    const m = buildModalVista();
    const meta = m.querySelector('#gn-inc-v-meta');
    const prog = m.querySelector('#gn-inc-v-prog');
    const list = m.querySelector('#gn-inc-v-list');
    const tit = m.querySelector('#gn-inc-v-tit');
    if (meta) meta.textContent = 'Cargando…';
    if (list) list.innerHTML = '';
    m.classList.add('active');

    try {
        const r = await fetch(apiUrl(`/api/incidencias/${encodeURIComponent(String(incId))}`), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
        const inc = j.incidencia || {};
        const pedidos = Array.isArray(j.pedidos) ? j.pedidos : [];
        const pr = j.progreso || {};

        const nombreInc = String(inc.nombre || '').trim();
        const titulo =
            nombreInc.length > 0
                ? `Incidencia #${inc.id} – ${nombreInc}`
                : `Incidencia #${inc.id}`;
        if (tit) tit.innerHTML = `<i class="fas fa-project-diagram"></i> ${titulo.replace(/</g, '&lt;')}`;
        let fcTxt = '';
        if (inc.fecha_cierre) {
            try {
                fcTxt = new Date(inc.fecha_cierre).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                });
            } catch (_) {
                fcTxt = String(inc.fecha_cierre);
            }
        }
        const ucInc = inc.usuario_cierre_id;
        const estIncLow = String(inc.estado || '').trim().toLowerCase();
        const lineCierre =
            estIncLow === 'cerrada' || fcTxt || ucInc != null
                ? `<span style="display:block;margin-top:.35rem;font-size:.78rem;border-top:1px solid var(--bo);padding-top:.35rem"><strong>Fecha cierre:</strong> ${(fcTxt || '—').replace(/</g, '&lt;')} · <strong>Usuario cierre:</strong> ${ucInc != null ? `id ${String(ucInc).replace(/</g, '&lt;')}` : '—'}</span>`
                : '';
        if (meta)
            meta.innerHTML = `<span style="display:block"><strong>Criterio:</strong> ${String(inc.criterio_agrupacion || '—').replace(/</g, '&lt;')} · <strong>Valor:</strong> ${String(inc.valor_criterio || '—').replace(/</g, '&lt;')}</span><span style="display:block;margin-top:.25rem"><strong>Estado incidencia:</strong> ${String(inc.estado || '—').replace(/</g, '&lt;')}</span>${lineCierre}`;
        const totProg = pr.total ?? pedidos.length;
        const cerProg = pr.cerrados ?? 0;
        if (prog) prog.textContent = `Progreso: ${cerProg} de ${totProg} pedidos cerrados`;

        if (list) {
            list.innerHTML = pedidos
                .map((row) => {
                    const id = row.id;
                    const np = row.numero_pedido ?? row.np ?? id;
                    const est = String(row.estado || '').trim();
                    const nom = String(row.cliente_nombre || row.cliente || '').trim() || '—';
                    const tt = String(row.tipo_trabajo || '').trim();
                    return `<div style="display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;padding:.35rem;border-bottom:1px solid var(--bo)" data-pid="${id}">
            <span style="flex:1;min-width:10rem;line-height:1.35"><strong>#${String(np).replace(/</g, '&lt;')}</strong> · <em>${est.replace(/</g, '&lt;')}</em><br><span style="font-size:.78rem;color:var(--tm)">${nom.replace(/</g, '&lt;')} · ${tt.replace(/</g, '&lt;')}</span></span>
            <button type="button" class="btn-sm" data-ver="${id}" style="padding:.2rem .45rem;font-size:.72rem">Ver</button>
            ${esAdminIncModule() ? `<button type="button" class="btn-sm sec" data-des="${id}" style="padding:.2rem .45rem;font-size:.72rem">Desasociar</button>` : ''}
          </div>`;
                })
                .join('');
            list.querySelectorAll('button[data-ver]').forEach((b) => {
                b.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const pid = b.getAttribute('data-ver');
                    const pidNum = Number(pid);
                    const loc =
                        findPedidoLiteById(pid) ||
                        (Number.isFinite(pidNum) && pidNum > 0 ? { id: pidNum } : null);
                    if (loc && typeof window.detalle === 'function') {
                        m.classList.remove('active');
                        void window.detalle(loc);
                    } else {
                        toast('No se pudo abrir el pedido.', 'error');
                    }
                });
            });
            list.querySelectorAll('button[data-des]').forEach((b) => {
                b.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const pid = b.getAttribute('data-des');
                    if (!confirm('¿Desasociar este pedido de la incidencia?')) return;
                    try {
                        const rr = await fetch(apiUrl(`/api/incidencias/${encodeURIComponent(String(incId))}/desasociar`), {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pedido_id: Number(pid) }),
                        });
                        const jj = await rr.json().catch(() => ({}));
                        if (!rr.ok) throw new Error(jj.error || jj.detail || `HTTP ${rr.status}`);
                        toast('Pedido desasociado', 'success');
                        recargarPedidosYMapa();
                        void openVistaIncidencia(incId);
                    } catch (e) {
                        toast(String(e?.message || e), 'error');
                    }
                });
            });
        }

        const btnAsig0 = m.querySelector('#gn-inc-v-asignar-tecnico');
        const pedidosNoCerrados = pedidos.filter((p) => String(p.estado || '').trim() !== 'Cerrado');
        const pedidosIdsAsignar = pedidosNoCerrados.map((p) => Number(p.id)).filter((id) => Number.isFinite(id) && id > 0);
        if (btnAsig0) {
            if (!esAdminIncModule() || !pedidosIdsAsignar.length) {
                btnAsig0.style.display = 'none';
            } else {
                btnAsig0.style.display = '';
                const btnAsig = btnAsig0.cloneNode(true);
                btnAsig0.parentNode.replaceChild(btnAsig, btnAsig0);
                btnAsig.addEventListener('click', () => {
                    void openModalAsignarTecnicoIncidencia({
                        incId,
                        pedidoIds: pedidosIdsAsignar,
                        tok,
                        onDone: () => void openVistaIncidencia(incId),
                    });
                });
            }
        }

        const btnAll0 = m.querySelector('#gn-inc-v-cerrar-todos');
        if (btnAll0) {
            if (!puedeGestionarIncidencias()) {
                btnAll0.style.display = 'none';
            } else {
                btnAll0.style.display = '';
                const btnAll = btnAll0.cloneNode(true);
                btnAll0.parentNode.replaceChild(btnAll, btnAll0);
                btnAll.addEventListener('click', async (ev) => {
                    try {
                        ev.stopPropagation();
                    } catch (_) {}
                    if (!puedeGestionarIncidencias()) {
                        toast('Sin permiso para cerrar incidencias.', 'error');
                        return;
                    }
                    const abiertosAll = pedidos.filter((p) => normalizarEstadoOperativoInc(p.estado) !== 'Cerrado');
                    const abiertos = esAdminIncModule()
                        ? abiertosAll
                        : abiertosAll.filter((row) => pedidoPermiteCierreMasivoIncidenciaParaUsuarioActual(row));
                    if (!abiertos.length) {
                        toast(
                            esAdminIncModule() ? 'No hay pedidos abiertos' : 'No hay pedidos abiertos que puedas cerrar con tu usuario.',
                            'info'
                        );
                        return;
                    }
                    try {
                        m.classList.remove('active');
                    } catch (_) {}
                    openModalCierreMasivoIncidencia({
                        incId,
                        incNombre: nombreInc,
                        pedidosAbiertos: abiertos,
                        tok,
                        dismissVistaIncidencia: () => {
                            try {
                                m.classList.add('active');
                            } catch (_) {}
                        },
                    });
                });
            }
        }
    } catch (e) {
        if (meta) meta.textContent = String(e?.message || e);
        toast(String(e?.message || e), 'error');
    }
}

function bootObserver() {
    const pl = document.getElementById('pl');
    if (!pl || _moPl) return;
    _moPl = new MutationObserver(() => debouncedEnhance());
    _moPl.observe(pl, { childList: true });
}

export function installIncidenciasUI() {
    try {
        window.__gnIncidenciasInit = true;
        window.__gnIncidenciasRefresh = debouncedEnhance;
        window.__gnIncidenciasInvalidateCache = invalidatePedidosIncidenciasCache;
        window.puedeGestionarIncidencias = puedeGestionarIncidencias;
        window.puedeSeleccionarPedidoParaIncidencias = puedeSeleccionarPedidoParaIncidencias;
        window.obtenerRolUsuarioParaIncidencias = obtenerRolUsuarioParaIncidencias;
    } catch (_) {}
    void fetchPedidoMap().then(() => debouncedEnhance());
    bootObserver();
    document.addEventListener(
        'visibilitychange',
        () => {
            if (document.visibilityState === 'visible') {
                invalidatePedidosIncidenciasCache();
                void fetchPedidoMap().then(() => debouncedEnhance());
            }
        },
        false
    );
}

if (typeof window !== 'undefined') {
    try {
        window.puedeGestionarIncidencias = puedeGestionarIncidencias;
        window.puedeSeleccionarPedidoParaIncidencias = puedeSeleccionarPedidoParaIncidencias;
        window.obtenerRolUsuarioParaIncidencias = obtenerRolUsuarioParaIncidencias;
    } catch (_) {}
    const run = () => {
        try {
            installIncidenciasUI();
        } catch (e) {
            console.warn('[incidencias]', e);
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
}
