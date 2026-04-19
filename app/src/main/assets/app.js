import {
  OU_KEY,
  offlineQueue,
  offlineSave,
  offlinePedidos,
  offlinePedidosSave,
  enqueueOffline,
  actualizarBadgeOffline,
  guardarUsuarioOffline,
  verificarUsuarioOffline
} from './offline.js';

import {
  asegurarDefsProyeccionesARG,
  fajaArgentinaPorLongitud,
  registrarFajaInstalacionSiFalta,
  proyectarCoordPedido,
  tieneProyeccionEmpresaConfigurada,
  leerPreferenciaCoordsDisplayNuevoPedido,
  convertirAInchauspe,
  resolverFajaProyeccion,
  convertirProyectadasARGaWgs84,
  proyectarWgs84AFamiliaFaja,
  PMG_FAMILIAS_PROYECCION_LIST,
  etiquetaFamiliaProyeccionCorta,
  etiquetaFamiliaProyeccionLarga
} from './map.js';

/** Evita avisos del navegador al capturar con html2canvas (getImageData / readback). */
(function installCanvas2DWillReadFrequently() {
  if (typeof HTMLCanvasElement === 'undefined') return;
  const proto = HTMLCanvasElement.prototype;
  if (proto.__gestornovaWillReadPatch) return;
  const orig = proto.getContext;
  proto.getContext = function (type, attrib) {
    if (type === '2d') {
      const a =
        attrib && typeof attrib === 'object'
          ? { ...attrib, willReadFrequently: true }
          : { willReadFrequently: true };
      return orig.call(this, type, a);
    }
    return orig.call(this, type, attrib);
  };
  proto.__gestornovaWillReadPatch = true;
})();

/** Quita prefijos históricos «GestorNova Dice:» en toasts / alert / confirm (mensaje limpio). */
function stripGestornovaDicePrefix(s) {
    return String(s ?? '')
        .replace(/^\s*GestorNova\s+Dice\s*:\s*/i, '')
        .replace(/^\s*Gestornova\s+dice\s*:\s*/i, '')
        .trim();
}
function gnDice(msg) {
    return stripGestornovaDicePrefix(String(msg ?? ''));
}







/** Una sola línea para el formulario de pedido: WGS84 o planas según preferencia y empresa_config. */
function htmlLineaUbicacionFormulario(lat, lng, acc, modoForzado) {
    registrarFajaInstalacionSiFalta(lng);
    const accStr = acc
        ? ` <span style="opacity:.85;font-size:.9em">(±${acc < 1000 ? acc + 'm' : (acc / 1000).toFixed(1) + 'km'})</span>`
        : '';
    const modo = modoForzado != null && modoForzado !== '' ? modoForzado : leerPreferenciaCoordsDisplayNuevoPedido();
    const usarWgs = modo === 'wgs84' || !tieneProyeccionEmpresaConfigurada();
    let compact;
    if (usarWgs) {
        compact = `${Number(lat).toFixed(6).replace('.', ',')}, ${Number(lng).toFixed(6).replace('.', ',')} (WGS84)`;
    } else {
        const pc = proyectarCoordPedido(lat, lng);
        if (pc) {
            compact = `F${pc.z}: ${pc.vx} · ${pc.vy} m`;
        } else {
            const c = convertirAInchauspe(lat, lng);
            const z = fajaArgentinaPorLongitud(lng);
            compact = c.x !== 'Error' ? `F${z}: ${c.x} · ${c.y} m` : `${Number(lat).toFixed(6).replace('.', ',')}, ${Number(lng).toFixed(6).replace('.', ',')} (WGS84)`;
        }
    }
    return `<i class="fas fa-check-circle" style="color:#059669"></i> ${compact}${accStr}`;
}

function syncWrapCoordsDisplayNuevoPedido() {
    const w = document.getElementById('wrap-sel-coords-display');
    const sel = document.getElementById('sel-coords-display');
    if (!w || !sel) return;
    const ok = tieneProyeccionEmpresaConfigurada();
    w.style.display = ok ? '' : 'none';
    if (!ok) return;
    sel.value = leerPreferenciaCoordsDisplayNuevoPedido();
}

function onCambioVisualizacionCoordsNuevoPedido() {
    const sel = document.getElementById('sel-coords-display');
    if (sel) {
        try { localStorage.setItem('pmg_coords_display_pref', sel.value); } catch (_) {}
    }
    refrescarLineaUbicacionModalNuevoPedido();
}
window.onCambioVisualizacionCoordsNuevoPedido = onCambioVisualizacionCoordsNuevoPedido;

function refrescarLineaUbicacionModalNuevoPedido() {
    const pm = document.getElementById('pm');
    if (!pm || !pm.classList.contains('active')) return;
    const li = document.getElementById('li');
    const gi = document.getElementById('gi');
    const ui = document.getElementById('ui');
    if (!li || !gi || !ui || !ui.classList.contains('sel')) return;
    const lat = parseFloat(li.value);
    const lng = parseFloat(gi.value);
    if (!isFinite(lat) || !isFinite(lng)) return;
    const acc = ultimaUbicacion && Math.abs(ultimaUbicacion.lat - lat) < 1e-7 && Math.abs(ultimaUbicacion.lon - lng) < 1e-7
        ? ultimaUbicacion.acc
        : null;
    ui.innerHTML = htmlLineaUbicacionFormulario(lat, lng, acc);
}

function syncCoordModoVisibility() {
    const sel = document.getElementById('cfg-coord-familia');
    const w = document.getElementById('cfg-coord-modo-wrap');
    if (!sel || !w) return;
    w.style.display = sel.value === 'none' ? 'none' : '';
}
window.syncCoordModoVisibility = syncCoordModoVisibility;

let NEON_OK = false;
let _sql = null;
let mapaInicializado = false;
let fotosTemporales = [];
let fotoCierreTemp = null;    
let ultimaUbicacion = null;
let marcadorUbicacion = null;
/** En la app Android: hasta que llegue el primer fix GPS, el primer toque en el mapa fija posición (una vez por sesión). */
let _gpsRecibidoEstaSesion = false;
const MAP_SEED_SESSION_KEY = 'pmg_map_seed_done';
let pedidoActualParaAvance = null;
let modoOffline = false;      












async function notificarNeonConectadoParaUpdateCheck() {
    const esApp = window.AndroidConfig && (/GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:');
    if (!esApp) return;
    if (NEON_OK && _sql && typeof window.AndroidConfig.applyUpdateCheckFromNeon === 'function') {
        try {
            const r = await sqlSimple(`SELECT version_code, version_name, apk_url, COALESCE(release_notes,'') AS release_notes, COALESCE(force_update, false) AS force_update FROM app_version ORDER BY version_code DESC LIMIT 1`);
            const row = r.rows && r.rows[0];
            if (row && row.apk_url) {
                const fu = row.force_update === true || row.force_update === 't' || row.force_update === 1 || String(row.force_update).toLowerCase() === 'true';
                const payload = JSON.stringify({
                    versionCode: parseInt(row.version_code, 10) || 0,
                    versionName: String(row.version_name || ''),
                    apkUrl: String(row.apk_url || ''),
                    releaseNotes: String(row.release_notes || ''),
                    forceUpdate: fu
                });
                try { window.AndroidConfig.applyUpdateCheckFromNeon(payload); } catch (_) {}
                return;
            }
        } catch (e) {
            console.warn('[update] app_version Neon:', e.message || e);
        }
    }
    if (typeof window.AndroidConfig.requestUpdateCheck === 'function') {
        try { window.AndroidConfig.requestUpdateCheck(); } catch (_) {}
    }
}

function setModoOffline(offline) {
    modoOffline = offline;
    const hiddenPref = localStorage.getItem('pmg_offline_banner_hidden') === '1';
    const toggle = document.getElementById('offline-toggle');
    if (toggle) {
        if (esAndroidApp) toggle.className = '';
        else toggle.className = offline ? 'visible' : '';
    }
    const banner = document.getElementById('offline-banner');
    if (banner) {
        if (esAndroidApp) {
            banner.classList.remove('visible');
            banner.classList.add('hidden');
        } else if (offline) {
            banner.classList.add('visible');
            banner.classList.toggle('hidden', hiddenPref);
        } else {
            banner.classList.remove('visible');
            banner.classList.remove('hidden');
        }
    }
    const di = document.getElementById('di');
    if (di) {
        di.className = offline ? 'di er' : 'di ok';
        di.title = offline ? 'Sin conexión — modo offline' : 'Conectado a Neon';
    }
}


function yieldAnimationFrame() {
    return new Promise(r => requestAnimationFrame(() => r()));
}

let _syncWorkerPrepareSeq = 0;
function prepareOfflineQueueInWorker(rawQueue) {
    if (typeof Worker === 'undefined' || !Array.isArray(rawQueue)) return Promise.resolve(rawQueue);
    return new Promise(resolve => {
        const id = ++_syncWorkerPrepareSeq;
        let w;
        const done = (q) => {
            try { w && w.terminate(); } catch (_) {}
            resolve(Array.isArray(q) && q.length ? q : rawQueue);
        };
        const t = setTimeout(() => done(rawQueue), 12000);
        try {
            w = new Worker(new URL('./sync-worker.js', import.meta.url));
        } catch (_) {
            try {
                w = new Worker('sync-worker.js');
            } catch (e2) {
                clearTimeout(t);
                resolve(rawQueue);
                return;
            }
        }
        w.onmessage = (ev) => {
            const d = ev.data || {};
            if (d.id !== id) return;
            clearTimeout(t);
            done(d.ok && Array.isArray(d.queue) ? d.queue : rawQueue);
        };
        w.onerror = () => {
            clearTimeout(t);
            done(rawQueue);
        };
        try {
            w.postMessage({ id, queue: rawQueue });
        } catch (_) {
            clearTimeout(t);
            done(rawQueue);
        }
    });
}

async function sincronizarOffline() {
    let q = offlineQueue();
    if (q.length === 0) { toast('No hay pedidos offline pendientes', 'info'); return; }
    if (!NEON_OK || !_sql) {
        
        toast('Intentando conectar...', 'info');
        const ok = await initNeon();
        if (!ok) { toast('Sin conexión. Reintentá cuando tengas señal.', 'error'); return; }
        NEON_OK = true;
        setModoOffline(false);
    }

    q = await prepareOfflineQueueInWorker(q);

    toast('Sincronizando ' + q.length + ' pedido(s)...', 'info');
    let ok = 0, fail = 0;
    const remaining = [];

    for (let i = 0; i < q.length; i++) {
        const op = q[i];
        await yieldAnimationFrame();
        try {
            if (op.tipo === 'INSERT') {
                await sqlSimple(op.query);
            } else if (op.tipo === 'UPDATE') {
                await sqlSimple(op.query);
            }
            ok++;
        } catch(e) {
            console.error('Sync fallo op:', op._offlineId, e.message);
            remaining.push(op);
            fail++;
        }
    }

    offlineSave(remaining);
    actualizarBadgeOffline();

    if (ok > 0) {
        toast(`✓ ${ok} pedido(s) sincronizado(s)${fail ? ' · ' + fail + ' pendientes' : ''}`, 'success');
        await cargarPedidos(); 
    } else {
        toast('No se pudo sincronizar. Reintentá más tarde.', 'error');
    }
}


window.addEventListener('online', async () => {
    console.log('Navegador: online (verificando conectividad real...)');
    
    const hayRed = await hayInternet();
    if (!hayRed) { console.log('Evento online ignorado — sin red real'); return; }
    
    try {
        const ok = await initNeon();
        if (ok) {
            NEON_OK = true;
            setModoOffline(false);
            await notificarNeonConectadoParaUpdateCheck();
            if (app.u) {
                toast('Conexión restaurada ✓', 'success');
                const q = offlineQueue();
                if (q.length > 0) setTimeout(sincronizarOffline, 1500);
                else cargarPedidos();
            } else {
                
                const dbs2 = document.getElementById('dbs');
                if (dbs2) {
                    dbs2.className = 'dbs ok';
                    dbs2.innerHTML = '<i class="fas fa-check-circle"></i> Conectado - Neon PostgreSQL';
                }
            }
        }
    } catch(_) {}
});
window.addEventListener('offline', () => {
    console.log('Navegador: offline');
    _netCache = { ok: false, ts: Date.now() }; 
    NEON_OK = false;
    _sql = null;
    setModoOffline(true);
});




async function solicitarPermisos() {
    const resultados = {};
    
    try {
        await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(
                p => { ultimaUbicacion = { lat: p.coords.latitude, lon: p.coords.longitude };
                       try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}
                       registrarFajaInstalacionSiFalta(p.coords.longitude);
                       res(); },
                e => rej(e),
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            )
        );
        resultados.gps = true;
    } catch(_) { resultados.gps = false; }
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            stream.getTracks().forEach(t => t.stop()); 
            resultados.camara = true;
        } catch(_) { resultados.camara = false; }
    }
    return resultados;
}


window.sincronizarOffline = sincronizarOffline;


try {
    const ubicacionGuardada = localStorage.getItem('ultima_ubicacion');
    if (ubicacionGuardada) {
        ultimaUbicacion = JSON.parse(ubicacionGuardada);
    }
} catch(_) {}

function esc(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return "'" + String(v).replace(/'/g, "''") + "'";
}

/** Registro en consola con contexto (diagnóstico sin mostrar stack al usuario). */
function logErrorWeb(tag, err, extra) {
    const msg = err != null && err !== '' ? err.message || String(err) : String(err);
    const det = extra != null ? extra : '';
    if (err && err.stack) console.error(`[GestorNova:${tag}]`, msg, det, err.stack);
    else console.error(`[GestorNova:${tag}]`, msg, det);
}

/**
 * Convierte errores de red, Neon, HTTP o SQL en texto entendible para el operador.
 * No incluye stacks ni detalles técnicos largos.
 */
function mensajeErrorUsuario(err) {
    if (err == null) return 'Ocurrió un error. Probá de nuevo.';
    const raw = String(err.message != null ? err.message : err).trim() || 'Error desconocido';
    const m = raw.toLowerCase();
    if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') || m.includes('network request failed')) {
        return 'No hay conexión o el servidor no respondió. Comprobá internet y probá de nuevo.';
    }
    if (m.includes('aborted') || m.includes('abort') || m.includes('timeout')) {
        return 'La operación tardó demasiado. Intentá de nuevo.';
    }
    if (m.includes('neon no inicializado') || (m.includes('sin conexión') && m.includes('offline'))) {
        return 'Sin conexión a la base de datos. Revisá la red o la configuración.';
    }
    if (m.includes('401') || m.includes('unauthorized')) return 'Sesión vencida o sin permiso. Volvé a iniciar sesión.';
    if (m.includes('403') || m.includes('forbidden')) return 'No tenés permiso para esta acción.';
    if (m.includes('502') || m.includes('503') || m.includes('504') || m.includes('bad gateway')) {
        return 'El servidor está sobrecargado o en mantenimiento. Probá en unos minutos.';
    }
    if (m.includes('500') && m.includes('internal')) return 'Error en el servidor. Si persiste, avisá al administrador.';
    if (m.includes('permission denied') || m.includes('must be owner')) {
        return 'No se pudo acceder a ese dato con tu usuario.';
    }
    if (m.includes('unique') || m.includes('duplicate key')) {
        return 'Ese dato ya existe (no se puede duplicar).';
    }
    if (m.includes('violates foreign key') || m.includes('foreign key')) {
        return 'No se puede borrar o modificar: está vinculado a otros registros.';
    }
    if (raw.length <= 100 && !/^at\s/i.test(raw) && !m.startsWith('error:') && /[áéíóúñüa-z]/i.test(raw)) {
        return raw;
    }
    return 'Algo salió mal. Si se repite, anotá la hora y contactá al administrador.';
}

/**
 * Muestra toast de error amigable y deja traza en consola con etiqueta de contexto.
 * @param {string} tag - identificador corto (ej. "guardar-pedido")
 * @param {*} err - Error o valor lanzado
 * @param {string} [prefijo] - texto opcional antes del mensaje amigable (ej. "No se pudo guardar.")
 */
function toastError(tag, err, prefijo) {
    logErrorWeb(tag, err);
    const cuerpo = mensajeErrorUsuario(err);
    let msg = prefijo ? `${String(prefijo).trim()} ${cuerpo}` : cuerpo;
    msg = msg.replace(/\s+/g, ' ').trim();
    if (msg.length > 300) msg = msg.slice(0, 297) + '…';
    toast(msg, 'error');
}

async function ejecutarSQLConReintentos(query, params = [], maxIntentos = 3) {
    
    if (modoOffline || !NEON_OK) {
        throw new Error('Sin conexión — modo offline activo');
    }

    let ultimoError;
    let reintentosMostrados = false;
    
    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            if (!_sql) throw new Error('Neon no inicializado');
            
            
            if (intento === 2 && !reintentosMostrados) {
                toast('Reactivando base de datos...', 'info');
                reintentosMostrados = true;
            }
            
            let q = query;
            for (let i = 0; i < params.length; i++) {
                q = q.replace(new RegExp('\\{' + i + '\\}', 'g'), esc(params[i]));
            }
            
            return await _sql(q);
            
        } catch (error) {
            ultimoError = error;
            logErrorWeb(`sql-reintento-${intento}/${maxIntentos}`, error);
            
            if (intento < maxIntentos) {
                
                const espera = Math.pow(2, intento - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, espera));
                
                
                try {
                    if (_sql) await _sql('SELECT 1');
                } catch (_) {}
            }
        }
    }
    
    
    logErrorWeb('sql-reintentos-agotados', ultimoError);
    toast(mensajeErrorUsuario(ultimoError), 'error');
    throw ultimoError;
}


async function sqlSimple(query, params = []) {
    if (!_sql) throw new Error('Neon no inicializado');
    let q = query;
    for (let i = 0; i < params.length; i++)
        q = q.replace(new RegExp('\\{' + i + '\\}', 'g'), esc(params[i]));
    return _sql(q);
}

/** Neon / proxy pueden truncar respuestas grandes: paginar SELECT hasta traer todas las filas. */
const _SQL_PAGE_SIZE = 3500;
async function sqlSimpleSelectAllPages(selectSqlNoTrailingOrder, orderBySql) {
    const order = String(orderBySql || '').trim();
    const all = [];
    let offset = 0;
    const base = String(selectSqlNoTrailingOrder || '').trim();
    for (;;) {
        const q = `${base} ${order} OFFSET ${offset} LIMIT ${_SQL_PAGE_SIZE}`;
        const r = await sqlSimple(q);
        const rows = r.rows || [];
        all.push(...rows);
        if (rows.length < _SQL_PAGE_SIZE) break;
        offset += _SQL_PAGE_SIZE;
    }
    return { rows: all };
}

function mostrarOverlayImportacion(texto) {
    let el = document.getElementById('gn-import-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gn-import-overlay';
        el.className = 'gn-import-overlay';
        document.body.appendChild(el);
    }
    el.innerHTML =
        '<div class="gn-import-overlay-card" role="status" aria-live="polite">' +
        '<div class="gn-import-overlay-spin"><i class="fas fa-circle-notch fa-spin"></i></div>' +
        '<div class="gn-import-overlay-msg"></div></div>';
    const m = el.querySelector('.gn-import-overlay-msg');
    if (m) m.textContent = texto;
    el.style.display = 'flex';
}

function actualizarOverlayImportacion(texto) {
    const el = document.getElementById('gn-import-overlay');
    if (!el || el.style.display === 'none') return;
    const m = el.querySelector('.gn-import-overlay-msg');
    if (m) m.textContent = texto;
}

function ocultarOverlayImportacion() {
    const el = document.getElementById('gn-import-overlay');
    if (el) el.style.display = 'none';
}








let keepAliveInterval  = null;
let keepAliveStartTime = null;
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;  
const SESSION_MAX_MS        = 60 * 60 * 1000;  
let _syncCatalogosInterval = null;

function iniciarSyncCatalogos() {
    detenerSyncCatalogos();
    const run = async () => {
        if (!app.u || modoOffline || !NEON_OK || !_sql) return;
        try { await cargarDistribuidores(); } catch (_) {}
    };
    run();
    _syncCatalogosInterval = setInterval(run, 120000);
}

function detenerSyncCatalogos() {
    if (_syncCatalogosInterval) {
        clearInterval(_syncCatalogosInterval);
        _syncCatalogosInterval = null;
    }
}

async function heartbeat() {
    if (!app.u) return; 

    
    if (keepAliveStartTime && Date.now() - keepAliveStartTime >= SESSION_MAX_MS) {
        console.log('Keep-alive: sesión de 1 hora cumplida, cerrando sesión');
        detenerKeepAlive();
        toast('Sesión expirada (1 hora). Por seguridad, ingresá de nuevo.', 'info');
        setTimeout(() => {
            localStorage.removeItem('pmg');
            detenerTracking();
            detenerSyncCatalogos();
            detenerDashboardGerenciaPoll();
            detenerTecnicosMapaPrincipalPoll();
            detenerPollSincroPedidosTecnico();
            app.u = null;
            mapaInicializado = false;
            if (app.map) { app.map.remove(); app.map = null; }
            _marcadoresTecnicosPrincipal = [];
            const btnAdm = document.getElementById('btn-admin');
            if (btnAdm) btnAdm.style.display = 'none';
            const mapDashCard = document.getElementById('mapa-card-dashboard');
            if (mapDashCard) mapDashCard.style.display = 'none';
            document.getElementById('gw')?.classList.remove('active');
            document.getElementById('ls').classList.add('active');
            document.getElementById('ms').classList.remove('active');
        }, 3500);
        return;
    }

    try {
        await sqlSimple('SELECT 1');
        console.log('Keep-alive OK', new Date().toLocaleTimeString('es-AR', {hour12:false}));
        if (modoOffline) {
            
            NEON_OK = true;
            setModoOffline(false);
            toast('Conexión restaurada ✓', 'success');
            const q = offlineQueue();
            if (q.length > 0) {
                setTimeout(sincronizarOffline, 1500);
            } else {
                cargarPedidos();
            }
        }
    } catch (err) {
        console.warn('Keep-alive: fallo de red:', err.message);
        if (app.u) {
            void (async () => {
                try {
                    if (await hayInternet()) {
                        _sql = null;
                        const reconectado = await initNeon();
                        if (reconectado) {
                            NEON_OK = true;
                            setModoOffline(false);
                            toast('Conexión restaurada ✓', 'success');
                            if (offlineQueue().length > 0) sincronizarOffline();
                            else cargarPedidos();
                            return;
                        }
                    }
                } catch (_) {}
                NEON_OK = false;
                setModoOffline(true);
            })();
        } else {
            NEON_OK = false;
            setModoOffline(true);
        }
    }
}

function iniciarKeepAlive() {
    detenerKeepAlive(); 
    keepAliveStartTime = Date.now();
    keepAliveInterval  = setInterval(heartbeat, KEEPALIVE_INTERVAL_MS);
    console.log('Keep-alive iniciado, sesión máxima 1h');
}

function detenerKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    keepAliveStartTime = null;
    detenerPollNotifMovil();
}



document.addEventListener('visibilitychange', () => {
    if (!document.hidden && app.u) {
        console.log('Tab visible: heartbeat preventivo');
        heartbeat();
        window.pollNotificacionesMovil();
        if (!esAdmin() && esTecnicoOSupervisor() && !modoOffline && NEON_OK && _sql) {
            void cargarPedidos({ silent: true });
        }
    }
});






function conTimeout(promesa, ms, msg) {
    return Promise.race([
        promesa,
        new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'timeout')), ms))
    ]);
}












let _netCache = null;  
const NET_TTL  = 6000; 

async function hayInternet() {
    
    if (_netCache && Date.now() - _netCache.ts < NET_TTL) {
        return _netCache.ok;
    }

    
    
    
    
    // Evitar 1.1.1.1/cdn-cgi/trace: en algunos entornos resuelve mal o devuelve 404 en HEAD y ensucia la consola.
    const pruebas = [
        'https://connectivitycheck.gstatic.com/generate_204',
        'https://captive.apple.com/hotspot-detect.html',
        'https://www.cloudflare.com/cdn-cgi/trace',
    ];

    for (const url of pruebas) {
        try {
            await conTimeout(
                fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' }),
                3500,
                'sin respuesta'
            );
            
            _netCache = { ok: true, ts: Date.now() };
            console.log('[red] OK via', url.split('/')[2]);
            return true;
        } catch(_) {
            
        }
    }

    _netCache = { ok: false, ts: Date.now() };
    console.log('[red] SIN INTERNET — todos los endpoints fallaron');
    return false;
}


window.addEventListener('online',  () => { _netCache = null; });
window.addEventListener('offline', () => { _netCache = { ok: false, ts: Date.now() }; });




async function initNeon() {
    if (!window.APP_CONFIG?.neon?.connectionString) {
        console.warn('[neon] APP_CONFIG no disponible — esperando config.json');
        return false;
    }
    // WebView Android: a veces hayInternet() falla con HTML remoto o file:// aunque Neon sea alcanzable.
    const esWebViewLocal = typeof window.AndroidConfig !== 'undefined';
    const tieneRed = await hayInternet();
    if (!tieneRed && !esWebViewLocal) {
        console.log('[neon] sin red real — modo offline');
        NEON_OK = false;
        return false;
    }

    const versions = ['0.10.4', '0.9.5', '0.8.0'];
    const cdnFactories = [
        (ver) => `https://esm.sh/@neondatabase/serverless@${ver}`,
        (ver) => `https://cdn.jsdelivr.net/npm/@neondatabase/serverless@${ver}/+esm`,
        (ver) => `https://unpkg.com/@neondatabase/serverless@${ver}/index.mjs`
    ];
    for (const ver of versions) {
        for (const mkUrl of cdnFactories) {
            const sdkUrl = mkUrl(ver);
            try {
                const mod = await conTimeout(
                    import(sdkUrl),
                    12000,
                    `timeout import SDK ${ver}`
                );
                const { neon, neonConfig } = mod;
                if (neonConfig) {
                    try { neonConfig.fetchEndpoint = host => `https://${host}/sql`; } catch(_){}
                    try { delete neonConfig.fetchConnectionCache; } catch(_){}
                }
                const fn = neon(window.APP_CONFIG.neon.connectionString);
                _sql = async (q) => {
                    const rows = await fn([q]);
                    if (Array.isArray(rows)) return { rows };
                    if (rows && rows.rows) return rows;
                    return { rows: [] };
                };
                const test = await conTimeout(_sql('SELECT 1 AS ok'), 12000, 'timeout SELECT 1');
                if (!test || !Array.isArray(test.rows)) throw new Error('respuesta invalida');
                NEON_OK = true;
                console.log(`[neon] SDK ${ver} OK via ${sdkUrl}`);
                return true;
            } catch(e) {
                console.warn(`[neon] SDK ${ver} fallo en ${sdkUrl}:`, e.message);
                _sql = null;
            }
        }
    }
    NEON_OK = false;
    return false;
}

let DIST = []; // Se carga desde Neon: tabla distribuidores

const TIPOS_RECLAMO_POR_RUBRO = {
    municipio: [
        'Alumbrado Público',
        'Bacheo y Pavimento',
        'Recolección/Poda',
        'Espacios Verdes',
        'Señalización/Semáforos',
        'Limpieza de Zanjas',
        'Recolección (otros)',
        'Cloacas',
        'Otros'
    ],
    cooperativa_agua: [
        'Pérdida en Vereda/Calle',
        'Falta de Presión',
        'Calidad del Agua',
        'Obstrucción de Cloaca',
        'Consumo elevado',
        'Conexión Nueva',
        'Otros'
    ],
    cooperativa_electrica: [
        'Corte de Energía',
        'Cables Caídos/Peligro',
        'Problemas de Tensión',
        'Poste Inclinado/Dañado',
        'Consumo elevado',
        'Alumbrado Público (Mantenimiento)',
        'Riesgo en la vía pública',
        'Corrimiento de poste/columna',
        'Pedido de factibilidad (nuevo servicio)',
        'Otros'
    ]
};

const TIPOS_RECLAMO_LEGACY = [
    'Riesgo vía pública',
    'Mantenimiento preventivo',
    'Material averiado',
    'Poda de árboles',
    'Nidos',
    'Falla de Línea',
    'Inspección Termográfica',
    'Avería en Transformador',
    'Reclamo de Cliente',
    'Conexión Nueva',
    'Corte Programado',
    'Emergencia',
    'Otros'
];

const PRIORIDAD_RECLAMO_POR_TIPO = {
    'Alumbrado Público': 'Media',
    'Bacheo y Pavimento': 'Media',
    'Recolección/Poda': 'Baja',
    'Espacios Verdes': 'Baja',
    'Señalización/Semáforos': 'Alta',
    'Limpieza de Zanjas': 'Media',
    'Recolección (otros)': 'Media',
    'Cloacas': 'Alta',
    'Otros': 'Media',
    'Pérdida en Vereda/Calle': 'Alta',
    'Falta de Presión': 'Media',
    'Calidad del Agua': 'Alta',
    'Obstrucción de Cloaca': 'Alta',
    'Consumo elevado': 'Baja',
    'Conexión Nueva': 'Baja',
    'Corte de Energía': 'Alta',
    'Cables Caídos/Peligro': 'Crítica',
    'Problemas de Tensión': 'Alta',
    'Poste Inclinado/Dañado': 'Crítica',
    'Cambio de Medidor': 'Baja',
    'Alumbrado Público (Mantenimiento)': 'Baja',
    'Riesgo en la vía pública': 'Crítica',
    'Corrimiento de poste/columna': 'Crítica',
    'Pedido de factibilidad (nuevo servicio)': 'Baja',
    'Riesgo vía pública': 'Crítica',
    'Mantenimiento preventivo': 'Baja',
    'Material averiado': 'Media',
    'Poda de árboles': 'Baja',
    'Nidos': 'Baja',
    'Falla de Línea': 'Alta',
    'Inspección Termográfica': 'Baja',
    'Avería en Transformador': 'Alta',
    'Reclamo de Cliente': 'Media',
    'Corte Programado': 'Baja',
    'Emergencia': 'Crítica'
};
const _PRIORIDADES_VALIDAS_UI = new Set(['Baja', 'Media', 'Alta', 'Crítica']);

function prioridadPredeterminadaPorTipoTrabajoUI(tipoTrabajo) {
    const t = String(tipoTrabajo || '').trim();
    if (!t) return 'Media';
    const p = PRIORIDAD_RECLAMO_POR_TIPO[t];
    if (p && _PRIORIDADES_VALIDAS_UI.has(p)) return p;
    return 'Media';
}

function syncPrioridadConTipoReclamo() {
    const tt = document.getElementById('tt');
    const pr = document.getElementById('pr');
    if (!tt || !pr) return;
    const v = prioridadPredeterminadaPorTipoTrabajoUI(tt.value);
    if (Array.from(pr.options).some(o => o.value === v)) pr.value = v;
}

function normalizarRubroEmpresa(tipo) {
    const t = String(tipo || '').trim().toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t === 'cooperativa de agua') return 'cooperativa_agua';
    if (t === 'cooperativa_electrica' || t === 'cooperativa eléctrica' || t === 'cooperativa electrica') return 'cooperativa_electrica';
    return null;
}

function tiposReclamoSeleccionables() {
    const rubro = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
    if (rubro && TIPOS_RECLAMO_POR_RUBRO[rubro]) return [...TIPOS_RECLAMO_POR_RUBRO[rubro]];
    const u = new Set();
    Object.values(TIPOS_RECLAMO_POR_RUBRO).forEach(arr => arr.forEach(x => u.add(x)));
    return [...u];
}

/** Línea operativa activa: prioriza active_business_type sobre tipo legado de empresa. */
function lineaNegocioOperativaCodigo() {
    const abt = String(window.EMPRESA_CFG?.active_business_type || '').trim().toLowerCase();
    if (abt === 'electricidad' || abt === 'agua' || abt === 'municipio') return abt;
    const r = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo || '');
    if (r === 'cooperativa_agua') return 'agua';
    if (r === 'municipio') return 'municipio';
    return 'electricidad';
}

function esMunicipioRubro() {
    return lineaNegocioOperativaCodigo() === 'municipio';
}
function esCooperativaAguaRubro() {
    return lineaNegocioOperativaCodigo() === 'agua';
}

/** Cierre operativo (clientes afectados): no aplica a municipio ni coop. agua; u opción explícita en configuración. */
function debeOcultarTabClientesAfectadosInfraAdmin() {
    const cfg = window.EMPRESA_CFG || {};
    const o = cfg.ocultar_modulos_redes;
    if (o === true || o === 1 || String(o).toLowerCase() === 'true' || String(o) === '1') return true;
    const r = normalizarRubroEmpresa(cfg.tipo);
    return r === 'municipio' || r === 'cooperativa_agua';
}

/** Pestaña catálogo zona (Distribuidores / Barrios / Ramales): solo si el admin marca ocultar módulos de red eléctrica. */
function debeOcultarTabDistribuidoresAdmin() {
    const cfg = window.EMPRESA_CFG || {};
    const o = cfg.ocultar_modulos_redes;
    return o === true || o === 1 || String(o).toLowerCase() === 'true' || String(o) === '1';
}

function aplicarVisibilidadTabsAdminRedElectrica() {
    const hideDist = debeOcultarTabDistribuidoresAdmin();
    const d = document.getElementById('admin-tab-distribuidores');
    if (d) d.style.display = hideDist ? 'none' : '';
}

function aplicarConfiguracionJsonClienteEnEmpresaCfg(conf) {
    if (!conf || typeof conf !== 'object') return;
    const next = { ...(window.EMPRESA_CFG || {}) };
    if (conf.derivaciones && typeof conf.derivaciones === 'object') {
        next.derivaciones = conf.derivaciones;
    }
    if (conf.derivacion_reclamos && typeof conf.derivacion_reclamos === 'object') {
        next.derivacion_reclamos = conf.derivacion_reclamos;
    }
    if (Object.prototype.hasOwnProperty.call(conf, 'ocultar_modulos_redes')) {
        next.ocultar_modulos_redes = !!conf.ocultar_modulos_redes;
    }
    for (const k of ['provincia', 'state', 'provincia_nominatim']) {
        if (Object.prototype.hasOwnProperty.call(conf, k) && conf[k] != null && String(conf[k]).trim()) {
            next[k] = String(conf[k]).trim();
        }
    }
    for (const k of ['lat_base', 'lng_base', 'coord_proy_familia', 'coord_proy_modo', 'zoom_mapa', 'logo_url']) {
        if (Object.prototype.hasOwnProperty.call(conf, k) && conf[k] != null && String(conf[k]).trim() !== '') {
            next[k] = conf[k];
        }
    }
    next.subtitulo = GN_SUBTITULO_FIJO;
    window.EMPRESA_CFG = next;
    try {
        aplicarVisibilidadTabsAdminRedElectrica();
    } catch (_) {}
}

/** Provincia / estado para Nominatim (Argentina) desde coordenadas de la oficina. */
async function nominatimReverseProvinciaArgentina(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    await new Promise((res) => setTimeout(res, 1100));
    const backoffs = [1500, 4000, 9000, 16000, 22000];
    const maxAttempts = 5;
    try {
        if (modoOffline || typeof fetch !== 'function') return null;
        await asegurarJwtApiRest();
        const token = getApiToken();
        if (!token) return null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const r = await fetch(apiUrl('/api/geocode/nominatim/reverse'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ lat: la, lon: lo, zoom: 8 }),
            });
            const rateLimited = r.status === 503 || r.status === 429;
            if (r.ok) {
                const j = await r.json().catch(() => null);
                const hit = j && j.result;
                const a = hit && hit.address;
                if (!a || typeof a !== 'object') return null;
                const state = a.state || a.region || a['ISO3166-2-lvl4'];
                const s = state != null ? String(state).trim() : '';
                return s.length >= 2 ? s : null;
            }
            if (rateLimited && attempt < maxAttempts - 1) {
                console.info(
                    '[geocode-proxy] reverse HTTP',
                    r.status,
                    'reintento',
                    attempt + 1,
                    '/',
                    maxAttempts - 1,
                    'espera',
                    backoffs[attempt],
                    'ms'
                );
                await new Promise((res) => setTimeout(res, backoffs[attempt]));
                continue;
            }
            if (rateLimited) {
                console.warn('[geocode-proxy] reverse agotó reintentos (503/429) lat/lng oficina');
                return null;
            }
            console.warn('[geocode-proxy] reverse HTTP', r.status);
            return null;
        }
        return null;
    } catch (_) {
        return null;
    }
}

/**
 * Guarda provincia/state en clientes.configuracion (API) según lat/lng de la oficina.
 * No pisa el campo del formulario si el admin ya escribió una provincia.
 */
async function actualizarProvinciaTenantDesdeCoords(lat, lng) {
    if (!esAdmin() || modoOffline || typeof fetch !== 'function') return null;
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    try {
        const prov = await nominatimReverseProvinciaArgentina(la, lo);
        if (!prov) return null;
        await asegurarJwtApiRest();
        const token = getApiToken();
        if (!token) return null;
        const inp = document.getElementById('cfg-provincia-nominatim');
        if (inp && String(inp.value || '').trim().length >= 2) return String(inp.value).trim();
        const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                configuracion: { provincia: prov, state: prov, provincia_nominatim: prov },
            }),
        });
        if (!resp.ok) return null;
        const ec = window.EMPRESA_CFG || {};
        window.EMPRESA_CFG = { ...ec, provincia: prov, state: prov, provincia_nominatim: prov };
        if (inp) inp.value = prov;
        return prov;
    } catch (_) {
        return null;
    }
}

function initCommunityBroadcastFab() {
    if (!esAdmin() || document.getElementById('gn-fab-community-root')) return;
    const root = document.createElement('div');
    root.id = 'gn-fab-community-root';
    root.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:9997;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-family:system-ui,sans-serif';
    root.innerHTML = `
<button type="button" id="gn-fab-community-hide" title="Ocultar" style="font-size:.7rem;padding:2px 6px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#475569">−</button>
<button type="button" id="gn-fab-community-btn" title="Aviso a la comunidad" style="width:52px;height:52px;border-radius:50%;border:none;background:#128C7E;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;font-size:1.35rem">📢</button>
<div id="gn-fab-community-modal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9998;align-items:center;justify-content:center;padding:16px">
  <div style="background:var(--pa,#fff);color:var(--tx,#111);max-width:420px;width:100%;border-radius:12px;padding:1rem 1.1rem;box-shadow:0 12px 40px rgba(0,0,0,.25)">
    <h3 style="margin:0 0 .5rem;font-size:1rem">Aviso masivo (WhatsApp)</h3>
    <p style="font-size:.78rem;margin:0 0 .65rem;color:var(--tm,#64748b)">Se envía a los teléfonos de contacto de <strong>pedidos</strong> del tenant y línea activa. Máx. ~10 msg/s. Requiere confirmación.</p>
    <label style="font-size:.78rem;font-weight:600">Tipo aviso</label>
    <select id="gn-bc-tipo-aviso" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1">
      <option value="general">General</option>
      <option value="corte_programado">Corte programado</option>
    </select>
    <label style="font-size:.78rem;font-weight:600">Fenómeno/Contingencia</label>
    <select id="gn-bc-fenomeno" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1">
      <option value="">-- Seleccionar --</option>
      <option>Inundaciones</option><option>Tormenta</option><option>Corte de calles</option><option>Incendio</option><option>Otro</option>
    </select>
    <label style="font-size:.78rem;font-weight:600">Ciudad</label>
    <input id="gn-bc-ciudad" list="gn-bc-cities" type="text" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1" />
    <datalist id="gn-bc-cities"></datalist>
    <label style="font-size:.78rem;font-weight:600">Provincia</label>
    <input id="gn-bc-provincia" type="text" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1" />
    <label style="font-size:.78rem;font-weight:600">Calles afectadas (coma separadas)</label>
    <input id="gn-bc-calles" list="gn-bc-streets" type="text" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1" />
    <datalist id="gn-bc-streets"></datalist>
    <label style="font-size:.78rem;font-weight:600">Título</label>
    <input id="gn-bc-titulo" type="text" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1" maxlength="120" />
    <label style="font-size:.78rem;font-weight:600">Mensaje <span style="color:#64748b">({ciudad} {fecha} {horario} {direccion} {telefono})</span></label>
    <textarea id="gn-bc-msg" rows="5" style="width:100%;margin:.2rem 0 .5rem;padding:.45rem;border-radius:8px;border:1px solid #cbd5e1"></textarea>
    <label style="font-size:.78rem;font-weight:600">Áreas responsables (coma separadas)</label>
    <input id="gn-bc-areas" type="text" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1" placeholder="Servicios Públicos, Defensa Civil" />
    <label style="font-size:.78rem;font-weight:600">Teléfonos de contacto (coma separados)</label>
    <input id="gn-bc-telefonos" type="text" style="width:100%;margin:.2rem 0 .5rem;padding:.4rem;border-radius:8px;border:1px solid #cbd5e1" placeholder="3436..., 3435..." />
    <label style="font-size:.78rem;display:flex;align-items:center;gap:.35rem"><input type="checkbox" id="gn-bc-corte" /> Corte programado (solo electricidad/agua)</label>
    <div id="gn-bc-corte-fields" style="display:none;margin-top:.45rem;font-size:.78rem">
      <input id="gn-bc-zona" placeholder="Zona afectada" style="width:100%;margin:.25rem 0;padding:.35rem;border-radius:6px;border:1px solid #cbd5e1" />
      <input id="gn-bc-fi" type="datetime-local" style="width:100%;margin:.25rem 0;padding:.35rem" />
      <input id="gn-bc-ff" type="datetime-local" style="width:100%;margin:.25rem 0;padding:.35rem" />
      <input id="gn-bc-mot" placeholder="Motivo" style="width:100%;margin:.25rem 0;padding:.35rem;border-radius:6px;border:1px solid #cbd5e1" />
    </div>
    <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.6rem">
      <button type="button" id="gn-bc-cancel" class="ba2" style="background:#e2e8f0;border-color:#cbd5e1;color:#334155">Cancelar</button>
      <button type="button" id="gn-bc-send" class="ba2" style="background:#128C7E;color:#fff;border-color:#128C7E">Enviar</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(root);
    let drag = false;
    let dx = 0;
    let dy = 0;
    const btn = root.querySelector('#gn-fab-community-btn');
    btn.addEventListener('mousedown', (e) => {
        drag = true;
        dx = e.clientX - root.offsetLeft;
        dy = e.clientY - root.offsetTop;
    });
    window.addEventListener('mousemove', (e) => {
        if (!drag) return;
        root.style.left = `${e.clientX - dx}px`;
        root.style.top = `${e.clientY - dy}px`;
        root.style.right = 'auto';
        root.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', () => {
        drag = false;
    });
    root.querySelector('#gn-fab-community-hide').onclick = () => {
        root.style.display = 'none';
    };
    btn.onclick = () => {
        document.getElementById('gn-fab-community-modal').style.display = 'flex';
    };
    const modal = root.querySelector('#gn-fab-community-modal');
    modal.querySelector('#gn-bc-cancel').onclick = () => {
        modal.style.display = 'none';
    };
    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };
    const tipoAvisoSel = modal.querySelector('#gn-bc-tipo-aviso');
    const chkCorte = modal.querySelector('#gn-bc-corte');
    const corteFields = modal.querySelector('#gn-bc-corte-fields');
    const cityInp = modal.querySelector('#gn-bc-ciudad');
    const provInp = modal.querySelector('#gn-bc-provincia');
    const callesInp = modal.querySelector('#gn-bc-calles');
    const citiesDl = modal.querySelector('#gn-bc-cities');
    const streetsDl = modal.querySelector('#gn-bc-streets');
    const parseCsv = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
    const debounce = (fn, ms = 350) => {
        let t = 0;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    };
    const fallbackCities = ['Cerrito', 'Paraná', 'Hasenkamp', 'María Grande', 'Viale'];
    const fallbackStreets = ['San Martín', 'Belgrano', 'Sarmiento', '25 de Mayo', '9 de Julio'];
    const setOptions = (el, arr) => {
        el.innerHTML = '';
        (arr || []).slice(0, 20).forEach((v) => {
            const o = document.createElement('option');
            o.value = typeof v === 'string' ? v : String(v?.ciudad || '');
            el.appendChild(o);
        });
    };
    const fetchCities = debounce(async () => {
        const q = cityInp.value.trim();
        if (q.length < 2) return;
        try {
            const r = await fetch(apiUrl(`/api/nominatim/search/cities?q=${encodeURIComponent(q)}&countrycode=ar`));
            const d = await r.json().catch(() => []);
            setOptions(citiesDl, Array.isArray(d) ? d.map((x) => x.ciudad) : fallbackCities);
            const hit = Array.isArray(d) && d.find((x) => String(x.ciudad || '').toLowerCase() === q.toLowerCase());
            if (hit && !provInp.value.trim()) provInp.value = hit.provincia || '';
        } catch (_) {
            setOptions(citiesDl, fallbackCities);
        }
    }, 380);
    const fetchStreets = debounce(async () => {
        const q = callesInp.value.trim().split(',').pop().trim();
        const city = cityInp.value.trim();
        if (q.length < 2 || city.length < 2) return;
        try {
            const r = await fetch(apiUrl(`/api/nominatim/search/streets?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`));
            const d = await r.json().catch(() => []);
            setOptions(streetsDl, Array.isArray(d) ? d : fallbackStreets);
        } catch (_) {
            setOptions(streetsDl, fallbackStreets);
        }
    }, 380);
    cityInp.addEventListener('input', fetchCities);
    callesInp.addEventListener('input', fetchStreets);
    tipoAvisoSel.addEventListener('change', () => {
        chkCorte.checked = tipoAvisoSel.value === 'corte_programado';
        chkCorte.dispatchEvent(new Event('change'));
    });
    chkCorte.addEventListener('change', () => {
        corteFields.style.display = chkCorte.checked ? 'block' : 'none';
    });
    modal.querySelector('#gn-bc-send').onclick = async () => {
        const titulo = (modal.querySelector('#gn-bc-titulo').value || '').trim();
        let tipo_aviso = (tipoAvisoSel.value || 'general').trim();
        const fenomeno = (modal.querySelector('#gn-bc-fenomeno').value || '').trim();
        const ciudad = (cityInp.value || '').trim();
        const provincia = (provInp.value || '').trim();
        const calles = parseCsv(callesInp.value);
        const areas = parseCsv((modal.querySelector('#gn-bc-areas').value || '').trim());
        const telefonos = parseCsv((modal.querySelector('#gn-bc-telefonos').value || '').trim());
        const mensaje = (modal.querySelector('#gn-bc-msg').value || '').trim();
        if (!mensaje) {
            toast('Completá el mensaje', 'warning');
            return;
        }
        if (!confirm('¿Confirmás el envío masivo por WhatsApp a los contactos de pedidos?')) return;
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) {
            toast('Sin sesión API', 'error');
            return;
        }
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
        const business_type =
            String(window.EMPRESA_CFG?.active_business_type || '').trim() ||
            (normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) === 'cooperativa_agua'
                ? 'agua'
                : normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) === 'municipio'
                  ? 'municipio'
                  : 'electricidad');
        if (business_type === 'municipio') {
            tipoAvisoSel.querySelector('option[value="corte_programado"]')?.setAttribute('disabled', 'disabled');
            if (tipoAvisoSel.value === 'corte_programado') tipoAvisoSel.value = 'general';
            chkCorte.checked = false;
            chkCorte.dispatchEvent(new Event('change'));
            tipo_aviso = 'general';
        }
        try {
            const corteElegido = chkCorte.checked || tipo_aviso === 'corte_programado';
            if (corteElegido) {
                const zona = (modal.querySelector('#gn-bc-zona').value || '').trim();
                const motivo = (modal.querySelector('#gn-bc-mot').value || '').trim();
                const fi = modal.querySelector('#gn-bc-fi').value;
                const ff = modal.querySelector('#gn-bc-ff').value;
                const r = await fetch(apiUrl('/api/whatsapp/broadcast/corte-programado'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        confirm: true,
                        business_type,
                        tipo_aviso: 'corte_programado',
                        fenomeno,
                        ciudad,
                        provincia,
                        calles,
                        areas,
                        telefonos,
                        zona_afectada: zona,
                        motivo,
                        fecha_inicio: fi || null,
                        fecha_fin: ff || null,
                        mensaje,
                    }),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.error || d.detail || `HTTP ${r.status}`);
                toast('Corte programado enviado', 'success');
            } else {
                const r = await fetch(apiUrl('/api/whatsapp/broadcast/community'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        confirm: true,
                        tipo_aviso,
                        titulo,
                        fenomeno,
                        ciudad,
                        provincia,
                        calles,
                        areas,
                        telefonos,
                        mensaje,
                        business_type,
                    }),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.error || d.detail || `HTTP ${r.status}`);
                toast(`Enviado: ok ${d.enviados_ok}, error ${d.enviados_error}`, 'success');
            }
            modal.style.display = 'none';
        } catch (e) {
            toast(String(e.message || e), 'error');
        }
    };
}

async function fetchMiConfiguracionYAplicarEnEmpresaCfg() {
    if (!esAdmin() || !getApiToken()) return;
    try {
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) return;
        const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
            headers: { Authorization: `Bearer ${tok}` },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        let conf = data?.cliente?.configuracion;
        if (typeof conf === 'string') {
            try {
                conf = JSON.parse(conf);
            } catch {
                conf = {};
            }
        }
        aplicarConfiguracionJsonClienteEnEmpresaCfg(conf && typeof conf === 'object' ? conf : {});
        const cli = data?.cliente;
        if (cli && typeof cli === 'object') {
            window.EMPRESA_CFG = {
                ...(window.EMPRESA_CFG || {}),
                tipo: cli.tipo != null ? cli.tipo : window.EMPRESA_CFG?.tipo,
                active_business_type: cli.active_business_type != null ? cli.active_business_type : window.EMPRESA_CFG?.active_business_type,
            };
        }
        try {
            initCommunityBroadcastFab();
        } catch (_) {}
    } catch (_) {}
}

function normalizarWhatsappInternacionalDesdeInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const digits = s.replace(/\D/g, '');
    if (!digits) return '';
    return `+${digits}`;
}

function actualizarBotonesWhatsappDerivacionesUi() {
    ['energia', 'agua'].forEach((slot) => {
        const btn = document.getElementById(`cfg-deriv-${slot}-btn-wa`);
        if (!btn) return;
        const act = !!document.getElementById(`cfg-deriv-${slot}-activo`)?.checked;
        const raw = (document.getElementById(`cfg-deriv-${slot}-whatsapp`)?.value || '').trim();
        const w = normalizarWhatsappInternacionalDesdeInput(raw);
        const ok = /^\+\d{8,22}$/.test(w);
        btn.disabled = !(act && ok);
    });
}

let _cfgDerivWaInputBound = false;
(function bindPersistenciaTextosDerivacion() {
    try {
        document.addEventListener(
            'input',
            (ev) => {
                const t = ev.target;
                if (!t || !t.id) return;
                if (t.id === 'admin-derivar-motivo') {
                    const dm = document.getElementById('dm');
                    const pid = dm?.dataset?.detallePedidoId;
                    if (pid) {
                        try {
                            sessionStorage.setItem('gn-admin-deriv-motivo-' + pid, t.value);
                        } catch (_) {}
                    }
                    return;
                }
                if (String(t.id).startsWith('tec-sol-deriv-motivo-')) {
                    const pid = String(t.id).replace('tec-sol-deriv-motivo-', '');
                    try {
                        sessionStorage.setItem('gn-tec-deriv-motivo-' + pid, t.value);
                    } catch (_) {}
                }
            },
            true
        );
    } catch (_) {}
})();

function bindDerivacionesFormInputsOnce() {
    if (_cfgDerivWaInputBound) return;
    _cfgDerivWaInputBound = true;
    ['energia', 'agua'].forEach((slot) => {
        const el = document.getElementById(`cfg-deriv-${slot}-whatsapp`);
        if (el) el.addEventListener('input', () => actualizarBotonesWhatsappDerivacionesUi());
        const nm = document.getElementById(`cfg-deriv-${slot}-nombre`);
        if (nm) nm.addEventListener('input', () => actualizarBotonesWhatsappDerivacionesUi());
        const ac = document.getElementById(`cfg-deriv-${slot}-activo`);
        if (ac) ac.addEventListener('change', () => actualizarBotonesWhatsappDerivacionesUi());
    });
}

function poblarFormDerivacionesDesdeEmpresaCfg() {
    const dr = (window.EMPRESA_CFG && window.EMPRESA_CFG.derivacion_reclamos) || null;
    let energia = { activo: false, nombre: '', whatsapp: '' };
    let agua = { activo: false, nombre: '', whatsapp: '' };
    if (dr && typeof dr === 'object' && (dr.empresa_energia || dr.cooperativa_agua)) {
        const ee = dr.empresa_energia || {};
        const ca = dr.cooperativa_agua || {};
        energia = {
            activo: !!(ee.whatsapp || ee.nombre),
            nombre: String(ee.nombre != null ? ee.nombre : ''),
            whatsapp: String(ee.whatsapp != null ? ee.whatsapp : ''),
        };
        agua = {
            activo: !!(ca.whatsapp || ca.nombre),
            nombre: String(ca.nombre != null ? ca.nombre : ''),
            whatsapp: String(ca.whatsapp != null ? ca.whatsapp : ''),
        };
    } else {
        const der = (window.EMPRESA_CFG && window.EMPRESA_CFG.derivaciones) || {};
        const e = der.energia || {};
        const a = der.agua || {};
        energia = {
            activo: !!e.activo,
            nombre: String(e.nombre != null ? e.nombre : ''),
            whatsapp: String(e.whatsapp != null ? e.whatsapp : ''),
        };
        agua = {
            activo: !!a.activo,
            nombre: String(a.nombre != null ? a.nombre : ''),
            whatsapp: String(a.whatsapp != null ? a.whatsapp : ''),
        };
    }
    const slots = [
        { key: 'energia', s: energia },
        { key: 'agua', s: agua },
    ];
    slots.forEach(({ key, s }) => {
        const ca = document.getElementById(`cfg-deriv-${key}-activo`);
        const cn = document.getElementById(`cfg-deriv-${key}-nombre`);
        const cw = document.getElementById(`cfg-deriv-${key}-whatsapp`);
        if (ca) ca.checked = !!s.activo;
        if (cn) cn.value = s.nombre;
        if (cw) cw.value = s.whatsapp;
    });
    const om = document.getElementById('cfg-ocultar-modulos-redes');
    if (om) om.checked = !!(window.EMPRESA_CFG && window.EMPRESA_CFG.ocultar_modulos_redes);
    actualizarBotonesWhatsappDerivacionesUi();
}

function abrirWhatsappDerivacionForm(slot) {
    const act = !!document.getElementById(`cfg-deriv-${slot}-activo`)?.checked;
    const raw = (document.getElementById(`cfg-deriv-${slot}-whatsapp`)?.value || '').trim();
    const w = normalizarWhatsappInternacionalDesdeInput(raw);
    if (!act) {
        toast('Activá la derivación para usar WhatsApp.', 'info');
        return;
    }
    if (!w || !/^\+\d{8,22}$/.test(w)) {
        toast('WhatsApp no válido: usá formato internacional con + (8 a 22 dígitos).', 'error');
        return;
    }
    window.open(`https://wa.me/${w.slice(1)}`, '_blank', 'noopener,noreferrer');
}
window.abrirWhatsappDerivacionForm = abrirWhatsappDerivacionForm;

/** Dígitos wa.me desde `EMPRESA_CFG.derivaciones` (+ opcional o solo dígitos). */
function digitosWhatsAppDerivacionEmpresaCfg(slot) {
    const d = (window.EMPRESA_CFG?.derivaciones || {})[slot];
    if (!d || !d.activo) return '';
    const raw = String(d.whatsapp || '').trim();
    if (!raw) return '';
    const dg = raw.replace(/\D/g, '');
    if (dg.length >= 10 && dg.length <= 15) return dg;
    return '';
}

function obtenerWaMeUrlDerivacionEmpresaCfg(slot) {
    const dg = digitosWhatsAppDerivacionEmpresaCfg(slot);
    return dg ? `https://wa.me/${dg}` : '';
}

const TIPOS_RECLAMO_SOLICITUD_DERIVACION_TERCERO = new Set([
    'Cables Caídos/Peligro',
    'Poste Inclinado/Dañado',
    'Alumbrado Público (Mantenimiento)',
    'Riesgo en la vía pública',
    'Corrimiento de poste/columna',
]);

function tipoPermiteSolicitudDerivacionTercero(tt) {
    return TIPOS_RECLAMO_SOLICITUD_DERIVACION_TERCERO.has(String(tt || '').trim());
}

/** Cooperativa eléctrica: técnico asignado puede pedir al admin que derive a un tercero (cola de aprobación). */
function htmlSolicitudDerivacionCoopElectricaTecnico(p) {
    if (!esCooperativaElectricaRubro()) return '';
    if (!esTecnicoOSupervisor() || esAdmin()) return '';
    if (!tipoPermiteSolicitudDerivacionTercero(p.tt)) return '';
    if (pedidoEsDerivadoFuera(p)) return '';
    const esOk = p.es === 'Asignado' || p.es === 'En ejecución';
    if (!esOk) return '';
    const uid = String(app.u?.id ?? '');
    if (p.tai == null || String(p.tai) !== uid) return '';
    const escD = (t) => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const pidEsc = String(p.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    let borradorTec = '';
    try {
        borradorTec = sessionStorage.getItem('gn-tec-deriv-motivo-' + p.id) || '';
    } catch (_) {}
    const taIniTec = borradorTec ? escD(borradorTec) : '';
    if (p.sdpen) {
        const fxs = p.sdf ? fmtInformeFecha(p.sdf) : '—';
        return `<div class="ds" style="border-left:4px solid #f59e0b">
            <h4>⏳ Derivación a terceros — solicitud enviada</h4>
            <p style="font-size:.8rem;color:var(--tm);margin:0;line-height:1.45">El administrador debe aprobar la derivación operativa. Mientras tanto no podés cargar materiales en este pedido.</p>
            <p style="font-size:.76rem;color:var(--tl);margin:.45rem 0 0">${escD(p.sdm || 'Sin motivo breve')}</p>
            <p style="font-size:.72rem;color:var(--tl);margin:.35rem 0 0">Pedida: ${escD(fxs)}</p>
        </div>`;
    }
    return `<div class="ds" style="border-left:4px solid #6366f1">
        <h4>🛠 Solicitar derivación a terceros</h4>
        <p style="font-size:.78rem;color:var(--tm);margin:0 0 .55rem;line-height:1.45">Si el reclamo corresponde a otra empresa (gas, agua, etc.), pedí la derivación. El <strong>administrador</strong> la confirma y arma el mismo texto que se envía por WhatsApp al contacto configurado.</p>
        <label style="font-size:.76rem;font-weight:600">Observaciones de campo <span style="color:var(--re)">*</span> <span style="font-weight:500;color:var(--tl)">(mín. 8 caracteres)</span></label>
        <textarea id="tec-sol-deriv-motivo-${p.id}" rows="3" maxlength="2000" style="width:100%;margin:.25rem 0 .55rem;padding:.45rem;border:1px solid var(--bo);border-radius:.45rem;resize:vertical" placeholder="Obligatorio: qué viste en visita y por qué corresponde derivar (ej.: cable de otra distribuidora, riesgo en vía pública a cargo de otro organismo…).">${taIniTec}</textarea>
        <button type="button" class="ba2 p2" onclick="solicitarDerivacionTerceroDesdeTecnico('${pidEsc}')"><i class="fas fa-paper-plane"></i> Enviar solicitud al administrador</button>
    </div>`;
}

/** Bloque en detalle de pedido: municipio / coop. agua; admin y supervisor. */
function htmlDerivacionTercerosPedidoDetalle() {
    if (!(esAdmin() || esTecnicoOSupervisor())) return '';
    if (esCooperativaElectricaRubro()) return '';
    const rubro = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
    if (rubro !== 'municipio' && rubro !== 'cooperativa_agua') return '';
    const escD = (t) => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const slots = [
        { key: 'energia', def: 'Empresa de energía' },
        { key: 'agua', def: 'Cooperativa de agua' },
    ];
    const links = [];
    for (const { key, def } of slots) {
        const url = obtenerWaMeUrlDerivacionEmpresaCfg(key);
        if (!url) continue;
        const nom = String((window.EMPRESA_CFG?.derivaciones || {})[key]?.nombre || '').trim() || def;
        const href = String(url).replace(/"/g, '&quot;');
        links.push(
            `<a class="ba2" style="display:inline-block;margin:.25rem .5rem .25rem 0;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${href}"><i class="fab fa-whatsapp"></i> Contactar ${escD(nom)}</a>`
        );
    }
    if (!links.length) return '';
    const labPer = escD(etiquetaFirmaPersona());
    return `<div class="ds gn-deriv-terceros-pedido">
            <h4>📞 Derivación a terceros</h4>
            <p style="font-size:.76rem;color:var(--tm);margin:0 0 .5rem;line-height:1.4">Contactos configurados en <strong>Admin → Empresa</strong> para orientar al ${labPer}. <strong>No</strong> son el número Meta del bot.</p>
            ${links.join('')}
        </div>`;
}

/** Distribuidor (eléctrica) | Ramal (agua) | Barrio (municipio). */
function etiquetaZonaPedido() {
    if (esMunicipioRubro()) return 'Barrio';
    if (esCooperativaAguaRubro()) return 'Ramal';
    return 'Distribuidor';
}
function valorZonaPedidoUI(p) {
    const br = String(p?.br || '').trim();
    const dis = String(p?.dis || '').trim();
    if (esMunicipioRubro()) return br || dis || '';
    return dis || br || '';
}

/** Municipio → vecino; cooperativas → socio (etiquetas UI / impresión). */
function etiquetaFirmaPersona() {
    return String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio' ? 'vecino' : 'socio';
}
function etiquetaCampoClientePedido() {
    return String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio' ? 'Vecino' : 'Cliente';
}

function poblarSelectTiposReclamo() {
    const st = document.getElementById('tt');
    if (!st) return;
    const prev = st.value;
    const lista = tiposReclamoSeleccionables();
    st.innerHTML = '';
    lista.forEach(t => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        st.appendChild(o);
    });
    if (prev && lista.includes(prev)) st.value = prev;
    else if (lista.length) st.selectedIndex = 0;
    syncNisClienteReclamoConexionUI();
    syncSuministroElectricoUI();
    syncPrioridadConTipoReclamo();
}

const MATERIAL_UNIDADES = ['PZA','MTR','LTR','KG','M3','M2','ML','JGO','UN','BOL','TN','BOB','TR','CJ','PAR','KIT','TAM'];

const CN = new Set(['numero_pedido','fecha_creacion','fecha_cierre','distribuidor','trafo','barrio',
    'cliente','tipo_trabajo','descripcion','prioridad','estado','avance','lat','lng',
    'usuario_id','usuario_creador_id','usuario_inicio_id','usuario_cierre_id','usuario_avance_id',
    'trabajo_realizado','tecnico_cierre','foto_base64','x_inchauspe','y_inchauspe',
    'fecha_avance','foto_cierre','nis_medidor','tecnico_asignado_id','fecha_asignacion','firma_cliente','checklist_seguridad','telefono_contacto',
    'cliente_nombre','cliente_direccion','cliente_calle','cliente_numero_puerta','cliente_localidad','provincia','codigo_postal',
    'suministro_tipo_conexion','suministro_fases',
    'derivado_externo','derivado_a','derivado_destino_nombre','fecha_derivacion','usuario_derivacion_id','derivacion_nota','derivacion_mensaje_snapshot',
    'solicitud_derivacion_pendiente','solicitud_derivacion_fecha','solicitud_derivacion_usuario_id','solicitud_derivacion_motivo','solicitud_derivacion_destino_sugerido']);

const app = {
    u: null,
    apiToken: null,
    p: [],
    map: null,
    mk: [],
    sel: null,
    tab: 'p',
    cid: null,
    ok: false
};

function normalizarRolStr(r) {
    const x = String(r == null ? '' : r).trim().toLowerCase();
    if (x === 'administrador') return 'admin';
    return x || 'tecnico';
}
function getApiBaseUrl() {
    const fromCfg = String(window.APP_CONFIG?.api?.baseUrl || '').trim();
    if (!fromCfg) return '';
    return fromCfg.replace(/\/+$/, '');
}
function apiUrl(path) {
    const p = String(path || '');
    const base = getApiBaseUrl();
    if (!base) return p;
    return base + (p.startsWith('/') ? p : '/' + p);
}
window.apiUrl = apiUrl;
/** Tras cerrar por SQL directo (Neon), dispara el aviso WA en la API sin bloquear la UI. */
async function notificarCierreWhatsappApi(pedidoId, telefonoOverride) {
    if (modoOffline) return;
    const base = getApiBaseUrl();
    if (!base || pedidoId == null) return;
    await asegurarJwtApiRest();
    const tok = getApiToken() || app.apiToken;
    if (!tok) return;
    const pid = Number(pedidoId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    const body = telefonoOverride ? { telefono_contacto: telefonoOverride } : {};
    const url = apiUrl(`/api/pedidos/${pid}/notify-cierre-whatsapp`);
    const headers = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
    await new Promise((r) => setTimeout(r, 500));
    for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 400 + 350 * attempt));
        try {
            const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
            if (resp.ok) return;
            const t = await resp.text();
            const maybeRace =
                resp.status === 400 &&
                /Cerrado|cerrado/i.test(t) &&
                /debe estar|must be|pedido/i.test(t);
            if (maybeRace && attempt < 3) continue;
            console.warn('[wa-cierre] API', resp.status, t.slice(0, 200));
            return;
        } catch (e) {
            if (attempt === 3) console.warn('[wa-cierre]', e && e.message);
        }
    }
}

/** La API Node (JWT) es independiente de Neon en el cliente: no usar NEON_OK aquí. */
function puedeEnviarApiRestPedidos() {
    return !modoOffline && !!getApiBaseUrl() && !!getApiToken();
}

/** Reobtiene JWT con la contraseña guardada en pmg_offline_user (mismo login que offline). */
async function intentarRefrescarJwtDesdeCredencialesGuardadas() {
    if (modoOffline || !getApiBaseUrl() || !app.u || !app.u.email) return false;
    let pw = null;
    try {
        const lista = JSON.parse(localStorage.getItem(OU_KEY) || '[]');
        const entry = lista.find(u => u.email === app.u.email && u._pw);
        pw = entry && entry._pw;
    } catch (_) {}
    if (!pw) return false;
    const data = await loginApiJwt(app.u.email, pw);
    return !!(data && data.token);
}

async function asegurarJwtApiRest() {
    if (modoOffline || !getApiBaseUrl()) return false;
    if (getApiToken()) return true;
    return await intentarRefrescarJwtDesdeCredencialesGuardadas();
}

async function pedidoPutApi(id, body) {
    const base = getApiBaseUrl();
    if (!base || modoOffline) return null;
    await asegurarJwtApiRest();
    let tok = getApiToken();
    if (!tok) return null;
    const pid = parseInt(id, 10);
    if (!Number.isFinite(pid) || pid <= 0 || String(id).startsWith('off_')) return null;
    const url = apiUrl(`/api/pedidos/${pid}`);
    const opts = () => ({
        method: 'PUT',
        headers: { Authorization: `Bearer ${getApiToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    try {
        let resp = await fetch(url, opts());
        if (resp.status === 401) {
            await intentarRefrescarJwtDesdeCredencialesGuardadas();
            if (getApiToken()) resp = await fetch(url, opts());
        }
        if (!resp.ok) {
            const t = await resp.text();
            console.warn('[pedido-put-api]', resp.status, t.slice(0, 400));
            return null;
        }
        return await resp.json();
    } catch (e) {
        console.warn('[pedido-put-api]', e && e.message);
        return null;
    }
}

async function notificarWhatsappClienteEventoApi(pedidoId, event) {
    if (modoOffline) return;
    const base = getApiBaseUrl();
    if (!base || pedidoId == null) return;
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    const pid = Number(pedidoId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
        const resp = await fetch(apiUrl(`/api/pedidos/${pid}/whatsapp-aviso-cliente`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ event }),
        });
        if (!resp.ok) {
            const t = await resp.text();
            console.warn('[wa-cliente-event]', resp.status, t.slice(0, 200));
        }
    } catch (e) {
        console.warn('[wa-cliente-event]', e && e.message);
    }
}

/** Aviso WA al cliente: reclamo recién cargado (INSERT vía Neon + JWT). */
async function notificarAltaReclamoWhatsappApi(pedidoId) {
    if (modoOffline) return;
    const base = getApiBaseUrl();
    if (!base || pedidoId == null) return;
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    const pid = Number(pedidoId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
        const resp = await fetch(apiUrl(`/api/pedidos/${pid}/notify-alta-cliente-whatsapp`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        if (!resp.ok) {
            const t = await resp.text();
            console.warn('[wa-alta-reclamo]', resp.status, t.slice(0, 200));
        }
    } catch (e) {
        console.warn('[wa-alta-reclamo]', e && e.message);
    }
}
async function loginApiJwt(email, password) {
    const ms = 28000;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
        const resp = await fetch(apiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            signal: ctl.signal
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!data?.token) return null;
        app.apiToken = String(data.token);
        try { localStorage.setItem('pmg_api_token', app.apiToken); } catch(_) {}
        return data;
    } catch (e) {
        if (e && e.name === 'AbortError') console.warn('[login] API JWT timeout', ms + 'ms — continuando sin token');
        return null;
    } finally {
        clearTimeout(t);
    }
}

/** Login vía API sin guardar token ni tocar `app.u` (p. ej. reabrir asistente con credenciales de admin). */
async function verificarLoginSoloAdminSinPersistir(email, password) {
    const ms = 28000;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
        const resp = await fetch(apiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }),
            signal: ctl.signal
        });
        if (!resp.ok) return { ok: false, error: 'Email o contraseña incorrectos' };
        const data = await resp.json();
        const rol = normalizarRolStr(data.user?.rol || '');
        if (rol !== 'admin') return { ok: false, error: 'Solo un administrador puede reabrir el asistente.' };
        return { ok: true };
    } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, error: 'Tiempo de espera agotado' };
        return { ok: false, error: 'No se pudo verificar con el servidor' };
    } finally {
        clearTimeout(t);
    }
}

const GESTORNOVA_LS_PULSE = 'gestornova_ls_pulse';
const GESTORNOVA_ONBOARDING_DONE = 'gestornova_onboarding_done';
/** Primera vez del asistente solo en navegador / PWA (no WebView empaquetado). */
const PMG_ONBOARDING_WEB_DONE = 'pmg_onboarding_web_done';
let _gnWizardEsReapertura = false;

function esGestorNovaWebPublico() {
    return typeof window.AndroidConfig === 'undefined';
}

function onboardingWebMarcadoCompletado() {
    try {
        if (localStorage.getItem(PMG_ONBOARDING_WEB_DONE) === '1') return true;
        if (localStorage.getItem(GESTORNOVA_ONBOARDING_DONE) === '1') return true;
    } catch (_) {}
    return false;
}

function limpiarPersistenciaClienteGestorNovaMigracionV2() {
    try {
        if (typeof localStorage === 'undefined') return;
        if (localStorage.getItem(GESTORNOVA_LS_PULSE) === '2') return;
        const quitar = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || k === GESTORNOVA_LS_PULSE) continue;
            if (
                k.startsWith('pmg') ||
                k === 'gestornova_saved_login' ||
                k === 'ultima_ubicacion' ||
                k === GESTORNOVA_ONBOARDING_DONE
            ) {
                quitar.push(k);
            }
        }
        quitar.forEach((k) => {
            try {
                localStorage.removeItem(k);
            } catch (_) {}
        });
        try {
            sessionStorage.clear();
        } catch (_) {}
        try {
            app.apiToken = null;
        } catch (_) {}
        localStorage.setItem(GESTORNOVA_LS_PULSE, '2');
    } catch (_) {}
}

function aplicarCapaOnboardingVsLoginInicial() {
    try {
        const gw = document.getElementById('gw');
        const ls = document.getElementById('ls');
        if (!gw || !ls) return;
        if (!esGestorNovaWebPublico()) {
            gw.classList.remove('active');
            ls.classList.add('active');
            _gnWizardEsReapertura = false;
            sincronizarTextosBotonesWizardOnboarding();
            return;
        }
        if (onboardingWebMarcadoCompletado()) {
            gw.classList.remove('active');
            ls.classList.add('active');
        } else {
            ls.classList.remove('active');
            gw.classList.add('active');
            _gnWizardEsReapertura = false;
            sincronizarTextosBotonesWizardOnboarding();
        }
    } catch (_) {}
}

function sincronizarTextosBotonesWizardOnboarding() {
    try {
        const p = document.getElementById('wizard-btn-primary');
        const sec = document.getElementById('wizard-btn-secondary');
        if (!p || !sec) return;
        if (_gnWizardEsReapertura) {
            p.innerHTML = '<i class="fas fa-check"></i> Listo';
            sec.style.display = 'block';
        } else {
            p.innerHTML = '<i class="fas fa-arrow-right"></i> Ir al inicio de sesión';
            sec.style.display = 'none';
        }
    } catch (_) {}
}

function cerrarVistaWizardMostrarLogin() {
    try {
        _gnWizardEsReapertura = false;
        const gw = document.getElementById('gw');
        const ls = document.getElementById('ls');
        gw?.classList.remove('active');
        ls?.classList.add('active');
        sincronizarTextosBotonesWizardOnboarding();
        try {
            hydrateBrandingForPublicScreen();
        } catch (_) {}
        try {
            aplicarMarcaVisualCompleta();
        } catch (_) {}
    } catch (_) {}
}

function finalizarOnboardingPrimeraVezGestorNova() {
    try {
        if (esGestorNovaWebPublico()) {
            localStorage.setItem(PMG_ONBOARDING_WEB_DONE, '1');
            localStorage.setItem(GESTORNOVA_ONBOARDING_DONE, '1');
        }
    } catch (_) {}
    cerrarVistaWizardMostrarLogin();
}

function onWizardPrimaryClick() {
    if (_gnWizardEsReapertura) cerrarVistaWizardMostrarLogin();
    else finalizarOnboardingPrimeraVezGestorNova();
}

function abrirModalReabrirAsistenteAdmin() {
    try {
        const m = document.getElementById('modal-reabrir-asistente');
        const pw = document.getElementById('reabrir-asistente-pw');
        const em = document.getElementById('reabrir-asistente-em');
        if (pw) pw.value = '';
        if (em) em.value = '';
        m?.classList.add('active');
    } catch (_) {}
}
window.abrirModalReabrirAsistenteAdmin = abrirModalReabrirAsistenteAdmin;

function cerrarModalReabrirAsistente() {
    document.getElementById('modal-reabrir-asistente')?.classList.remove('active');
}
window.cerrarModalReabrirAsistente = cerrarModalReabrirAsistente;

async function confirmarReabrirAsistenteConCredenciales(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const em = (document.getElementById('reabrir-asistente-em')?.value || '').trim();
    const pw = document.getElementById('reabrir-asistente-pw')?.value || '';
    const err = document.getElementById('reabrir-asistente-err');
    if (err) err.textContent = '';
    if (!em || !pw) {
        if (err) err.textContent = 'Completá email y contraseña de administrador.';
        return;
    }
    const btn = document.getElementById('reabrir-asistente-submit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';
    }
    try {
        const r = await verificarLoginSoloAdminSinPersistir(em, pw);
        if (!r.ok) {
            if (err) err.textContent = r.error || 'No autorizado';
            return;
        }
        cerrarModalReabrirAsistente();
        _gnWizardEsReapertura = true;
        const gw = document.getElementById('gw');
        const ls = document.getElementById('ls');
        gw?.classList.add('active');
        ls?.classList.remove('active');
        sincronizarTextosBotonesWizardOnboarding();
    } catch (e) {
        if (err) err.textContent = String(e?.message || e) || 'Error';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Abrir asistente';
        }
    }
}
window.confirmarReabrirAsistenteConCredenciales = confirmarReabrirAsistenteConCredenciales;

function getApiToken() {
    if (app.apiToken) return app.apiToken;
    try {
        const t = localStorage.getItem('pmg_api_token');
        if (t) {
            app.apiToken = t;
            return t;
        }
    } catch (_) {}
    return null;
}
window.getApiToken = getApiToken;

/** API Render: geocerca, chat interno y fotos clasificadas (ver docs/PLAN_TOP3_COOPERATIVA_GEOCERCA_CHAT_FOTOS.md). */
async function gnOperativaFetch(path, opts = {}) {
    const tok = getApiToken();
    if (!tok) throw new Error('Sin token API (iniciá sesión con backend activo).');
    const r = await fetch(apiUrl(path), {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tok}`,
            ...(opts.headers || {}),
        },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.detail || r.statusText || 'Error API');
    return j;
}
window.gnOperativaGeocercaVerificar = async function (pedidoId, lat, lng) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/geocerca/verificar`, {
        method: 'POST',
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng) }),
    });
};
window.gnOperativaGeocercaEventos = async function (pedidoId) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/geocerca/eventos`, { method: 'GET' });
};
window.gnOperativaChatListar = async function (pedidoId) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/chat-interno/mensajes`, { method: 'GET' });
};
window.gnOperativaChatEnviar = async function (pedidoId, cuerpo) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/chat-interno/mensajes`, {
        method: 'POST',
        body: JSON.stringify({ cuerpo: String(cuerpo || '').trim() }),
    });
};
window.gnOperativaFotosListar = async function (pedidoId) {
    const id = parseInt(pedidoId, 10);
    return gnOperativaFetch(`/api/pedidos/${id}/fotos-clasificadas`, { method: 'GET' });
};
/** tipo: antes | despues | otro — fotosBase64: string[] data URLs */
window.gnOperativaFotosSubir = async function (pedidoId, tipo, fotosBase64) {
    const id = parseInt(pedidoId, 10);
    const arr = Array.isArray(fotosBase64) ? fotosBase64 : [];
    return gnOperativaFetch(`/api/pedidos/${id}/fotos-clasificadas`, {
        method: 'POST',
        body: JSON.stringify({ tipo: String(tipo || 'otro').toLowerCase(), fotos_base64: arr }),
    });
};
window.gnOperativaTenantGeocercaGet = async function () {
    return gnOperativaFetch('/api/tenant-operativa/geocerca-settings', { method: 'GET' });
};
window.gnOperativaTenantGeocercaPut = async function (habilitada, radioMetros) {
    return gnOperativaFetch('/api/tenant-operativa/geocerca-settings', {
        method: 'PUT',
        body: JSON.stringify({
            habilitada: habilitada !== false,
            radio_metros: Number(radioMetros) || 100,
        }),
    });
};
/**
 * Android: pide GPS y llama callback(json). En navegador usa navigator.geolocation si existe.
 * callbackName ejemplo: "window.__gnGeoCb"
 */
function gnOperativaInvokeCallback(callbackPath, payload) {
    const raw = String(callbackPath || '').trim();
    if (!raw) return;
    const path = raw.startsWith('window.') ? raw.slice(7) : raw;
    try {
        const segs = path.split('.').filter(Boolean);
        let o = window;
        for (const s of segs) o = o?.[s];
        if (typeof o === 'function') o(payload);
    } catch (_) {}
}
window.gnOperativaObtenerUbicacionDispositivo = function (callbackName) {
    const cb = String(callbackName || '').trim();
    if (!/^[a-zA-Z0-9_.]+$/.test(cb)) return;
    try {
        if (window.AndroidDevice && typeof window.AndroidDevice.getCurrentLocationForGeocerca === 'function') {
            window.AndroidDevice.getCurrentLocationForGeocerca(cb);
            return;
        }
    } catch (_) {}
    if (!navigator.geolocation) {
        gnOperativaInvokeCallback(cb, { ok: false, error: 'sin_geolocation' });
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => {
            gnOperativaInvokeCallback(cb, {
                ok: true,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
            });
        },
        () => {
            gnOperativaInvokeCallback(cb, { ok: false, error: 'denied_or_unavailable' });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
};

function rolApp() {
    return app.u ? normalizarRolStr(app.u.rol) : '';
}
function esAdmin() {
    return rolApp() === 'admin';
}
function esTecnicoOSupervisor() {
    const r = rolApp();
    return r === 'tecnico' || r === 'supervisor';
}
function esAndroidWebViewMapa() {
    try {
        return /GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:';
    } catch (_) {
        return false;
    }
}

/** Admin en navegador (GitHub Pages / PWA), no en WebView empaquetado. */
function esAdminSesionWebPublica() {
    try {
        return esAdmin() && !esAndroidWebViewMapa();
    } catch (_) {
        return false;
    }
}

/** Marca por defecto hasta que el admin complete el setup inicial en servidor (setup_wizard_completado). */
const BRAND_DEFAULT_NAME = 'GestorNova';
/** Subtítulo fijo del producto (login, wizard, informes); no se personaliza por tenant. */
const GN_SUBTITULO_FIJO = 'Sistema de gestión de pedidos y reclamos';
/** Versión de la interfaz web/PWA (la app Android muestra la versión nativa en Acerca de). */
const GN_VERSION_WEB = '2.0';

/** Persiste nombre/logo/subtítulo entre sesiones (incl. tras cerrar sesión en la web pública). */
const PMG_BRANDING_LS_KEY = 'pmg_tenant_branding_v1';

/** Logo por defecto embebido (evita 404 de branding/*.png en GitHub Pages). */
const BRANDING_DEFAULT_LOGO_DATA_URL =
    'data:image/svg+xml,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#2563eb"/><text x="24" y="33" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="13" font-weight="700">GN</text></svg>'
    );

function basePathAssets() {
    try {
        let p = window.location.pathname || '/';
        if (p === '/' || p === '') return '/';
        if (!p.endsWith('/')) {
            const lastSeg = p.split('/').pop() || '';
            if (lastSeg.includes('.')) {
                p = p.slice(0, p.lastIndexOf('/') + 1);
            } else {
                p = p + '/';
            }
        }
        return p;
    } catch (_) {
        return '/';
    }
}

function defaultGestorNovaLogoUrl() {
    try {
        const base = basePathAssets();
        const rel = (base && base !== '/' ? base : '') + 'gestornova-logo.png';
        return rel || 'gestornova-logo.png';
    } catch (_) {
        return BRANDING_DEFAULT_LOGO_DATA_URL;
    }
}

function persistTenantBrandingCache(extra) {
    try {
        const b = window.__PMG_TENANT_BRANDING__ || {};
        const o = {
            setup_wizard_completado: !!b.setup_wizard_completado,
            marca_publicada_admin: !!b.marca_publicada_admin,
            nombre_cliente: String(b.nombre_cliente || '').trim(),
            logo_url: String(b.logo_url || '').trim(),
            tipo: String(b.tipo || '').trim(),
            subtitulo: GN_SUBTITULO_FIJO,
            from_local_cache: !!b.from_local_cache
        };
        localStorage.setItem(PMG_BRANDING_LS_KEY, JSON.stringify(o));
    } catch (_) {}
}

function loadTenantBrandingCache() {
    try {
        const raw = localStorage.getItem(PMG_BRANDING_LS_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        return o && typeof o === 'object' ? o : null;
    } catch (_) {
        return null;
    }
}

/** Pantalla de login o post-logout: restaurar marca guardada (API o última sesión). */
function hydrateBrandingForPublicScreen() {
    const c = loadTenantBrandingCache();
    if (c && (String(c.nombre_cliente || '').trim() || String(c.logo_url || '').trim())) {
        window.__PMG_TENANT_BRANDING__ = {
            setup_wizard_completado: !!c.setup_wizard_completado,
            marca_publicada_admin: !!c.marca_publicada_admin,
            nombre_cliente: String(c.nombre_cliente || ''),
            logo_url: String(c.logo_url || ''),
            tipo: String(c.tipo || ''),
            from_local_cache: !!c.from_local_cache
        };
        window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), subtitulo: GN_SUBTITULO_FIJO };
    } else {
        resetBrandingSesionNoAutenticada();
    }
    syncEmpresaCfgNombreLogoDesdeMarca();
}

/** Si hay nombre en empresa_config local pero aún no hay marca en memoria, mostrar cabecera sin depender solo de la API. */
function ensureBrandingFromLocalEmpresaCfg() {
    const nSql = String(window.EMPRESA_CFG?.nombre || '').trim();
    if (!nSql) return;
    const b = window.__PMG_TENANT_BRANDING__ || {};
    if (String(b.nombre_cliente || '').trim()) return;
    window.__PMG_TENANT_BRANDING__ = {
        ...b,
        nombre_cliente: nSql,
        logo_url: String(b.logo_url || window.EMPRESA_CFG?.logo_url || '').trim(),
        marca_publicada_admin: true,
        setup_wizard_completado: true,
        from_local_cache: true
    };
    syncEmpresaCfgNombreLogoDesdeMarca();
}

/**
 * Datos de marca efectivos: nombre/logo si el admin publicó en API, completó wizard,
 * o hay caché local (última sesión / empresa_config).
 */
function resolveMarcaTenantUI() {
    const b = window.__PMG_TENANT_BRANDING__ || {};
    const setup = !!b.setup_wizard_completado;
    const marcaPub = !!b.marca_publicada_admin;
    const fromCache = !!b.from_local_cache;
    const nombreApi = String(b.nombre_cliente || '').trim();
    const logoApi = String(b.logo_url || '').trim();
    const tipoApi = String(b.tipo || '').trim();
    const trusted = marcaPub || setup || fromCache;
    if (trusted && (nombreApi || logoApi)) {
        return {
            nombre: nombreApi || BRAND_DEFAULT_NAME,
            logo_url: logoApi || defaultGestorNovaLogoUrl(),
            tipo: tipoApi,
            esPersonalizado: true
        };
    }
    return {
        nombre: BRAND_DEFAULT_NAME,
        logo_url: defaultGestorNovaLogoUrl(),
        tipo: tipoApi,
        esPersonalizado: false
    };
}

function syncEmpresaCfgNombreLogoDesdeMarca() {
    const m = resolveMarcaTenantUI();
    const prev = window.EMPRESA_CFG || {};
    window.EMPRESA_CFG = { ...prev, nombre: m.nombre, logo_url: m.logo_url };
    if (m.tipo) window.EMPRESA_CFG.tipo = m.tipo;
}

/** Sin marca conocida: volver a valores por defecto (no borra localStorage; usar solo si no hay caché). */
function resetBrandingSesionNoAutenticada() {
    window.__PMG_TENANT_BRANDING__ = {
        setup_wizard_completado: false,
        marca_publicada_admin: false,
        nombre_cliente: '',
        logo_url: '',
        tipo: '',
        from_local_cache: false
    };
    syncEmpresaCfgNombreLogoDesdeMarca();
}

function aplicarMarcaVisualCompleta() {
    const m = resolveMarcaTenantUI();
    document.title = m.nombre + ' — Pedidos';
    document.querySelectorAll('#app-titulo, #gw .gn-wizard-card h1').forEach((h1) => {
        if (h1) h1.textContent = m.nombre;
    });
    try {
        window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), subtitulo: GN_SUBTITULO_FIJO };
    } catch (_) {}
    document.querySelectorAll('#app-subtitulo, #gw .gn-wizard-card .sub').forEach((subEl) => {
        if (subEl) subEl.textContent = GN_SUBTITULO_FIJO;
    });
    const h2 = document.querySelector('.hd h2');
    if (h2) {
        h2.textContent = '';
        const ic = document.createElement('i');
        ic.className = 'fas fa-network-wired';
        h2.appendChild(ic);
        h2.appendChild(document.createTextNode(' ' + m.nombre));
    }
    const ll = document.querySelector('#ls .ll');
    if (ll) {
        const u = String(m.logo_url || '').replace(/"/g, '&quot;').replace(/</g, '');
        ll.innerHTML = `<img src="${u}" alt="" style="width:42px;height:42px;object-fit:contain;border-radius:6px;background:#fff;display:block;mix-blend-mode:normal">`;
    }
}

/** Admin: incluir pedidos en estado «Derivado externo» en listas y mapa (histórico operativo). */
const LS_MOSTRAR_DERIVADOS_FUERA = 'pmg_pedidos_mostrar_derivados_fuera';
let _resolveAdminTipoModal = null;

function invalidateCachesTrasCambioRubro(tipoAnterior, tipoNuevo, lineaNegocioAntes, lineaNegocioDespues) {
    const a = normalizarRubroEmpresa(tipoAnterior);
    const b = normalizarRubroEmpresa(tipoNuevo);
    const la = lineaNegocioAntes != null ? String(lineaNegocioAntes).trim() : '';
    const ln = lineaNegocioDespues != null ? String(lineaNegocioDespues).trim() : '';
    const tipoCambio = a !== b;
    const lineaCambio = la !== '' && ln !== '' && la !== ln;
    if (!tipoCambio && !lineaCambio) return;
    invalidatePedidosTenantSqlCache();
    try {
        _sociosCatalogoTieneTenantIdCache = null;
    } catch (_) {}
    try {
        DIST = [];
    } catch (_) {}
    try {
        if (typeof syncMapaFiltroTiposRebuild === 'function') syncMapaFiltroTiposRebuild();
    } catch (_) {}
    try {
        void cargarDistribuidores();
    } catch (_) {}
    try {
        render();
    } catch (_) {}
    try {
        renderMk();
    } catch (_) {}
    try {
        window._sociosVirtualRows = null;
        if (document.getElementById('admin-socios')?.classList.contains('active')) void cargarListaSociosAdmin();
    } catch (_) {}
    try {
        if (document.getElementById('admin-estadisticas')?.classList.contains('active')) void cargarEstadisticas();
    } catch (_) {}
    try {
        if (document.getElementById('admin-kpi')?.classList.contains('active')) void cargarKpiSnapshotsAdmin();
    } catch (_) {}
    try {
        if (_mapaUsuariosAdmin && document.getElementById('admin-mapa-usuarios')?.classList.contains('active')) {
            void cargarUbicacionesUsuarios();
        }
    } catch (_) {}
    try {
        if ((tipoCambio || lineaCambio) && app.u && NEON_OK && _sql && !modoOffline) {
            void cargarPedidos({ silent: true });
        }
    } catch (_) {}
}

/** Borra claves locales típicas de la app (pmg*, ubicación). Las cookies HttpOnly no se pueden invalidar desde JS. */
function limpiarAlmacenamientoClienteAmplioParaCambioNegocio() {
    try {
        const kill = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (
                k.startsWith('pmg') ||
                k.startsWith('gestornova') ||
                k.startsWith('GESTORNOVA') ||
                k === 'ultima_ubicacion'
            ) {
                kill.push(k);
            }
        }
        kill.forEach((k) => {
            try {
                localStorage.removeItem(k);
            } catch (_) {}
        });
    } catch (_) {}
}

/** Tras confirmar cambio de rubro/línea en servidor: sessionStorage + caché local amplia + mismo teardown que logout. */
function ejecutarCerrarSesionTrasCambioNegocioAdmin() {
    try {
        sessionStorage.clear();
    } catch (_) {}
    limpiarAlmacenamientoClienteAmplioParaCambioNegocio();
    ejecutarCerrarSesion();
}

async function promptAdminTipoNegocioWebIfNeeded(force = false) {
    if (!esAdminSesionWebPublica()) return;
    if (!force) return;
    const modal = document.getElementById('modal-admin-tipo-negocio');
    const sel = document.getElementById('admin-sesion-tipo');
    if (!modal || !sel) return;
    let tipoDesdeServidor = '';
    try {
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (tok) {
            const rb = await fetch(apiUrl('/api/tenant/businesses'), {
                headers: { Authorization: `Bearer ${tok}` }
            });
            if (rb.ok) {
                const jd = await rb.json().catch(() => ({}));
                const act = String(jd?.active_business_type || '').trim();
                if (act === 'electricidad') tipoDesdeServidor = 'cooperativa_electrica';
                else if (act === 'agua') tipoDesdeServidor = 'cooperativa_agua';
                else if (act === 'municipio') tipoDesdeServidor = 'municipio';
            }
        }
    } catch (_) {}
    const actual = String(window.EMPRESA_CFG?.tipo || '').trim();
    sel.value = actual || tipoDesdeServidor || '';
    return new Promise((resolve) => {
        _resolveAdminTipoModal = resolve;
        modal.classList.add('active');
    });
}

function abrirModalCambioRubroAdminConPassword() {
    if (!esAdminSesionWebPublica()) return;
    const inp = document.getElementById('admin-verify-pw-rubro-input');
    if (inp) inp.value = '';
    document.getElementById('modal-admin-verify-pw-rubro')?.classList.add('active');
}
window.abrirModalCambioRubroAdminConPassword = abrirModalCambioRubroAdminConPassword;

async function confirmarPasswordYAbrirRubroAdmin() {
    const pw = (document.getElementById('admin-verify-pw-rubro-input')?.value || '').trim();
    if (!pw) {
        toast('Ingresá tu contraseña de administrador', 'error');
        return;
    }
    await asegurarJwtApiRest();
    const token = getApiToken();
    if (!token) {
        toast('No hay token de API. Volvé a iniciar sesión.', 'error');
        return;
    }
    try {
        const resp = await fetch(apiUrl('/api/auth/verify-password'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ password: pw })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }
    } catch (e) {
        toast(String(e?.message || e) || 'Contraseña incorrecta', 'error');
        return;
    }
    document.getElementById('modal-admin-verify-pw-rubro')?.classList.remove('active');
    try {
        window.__PMG_RUBRO_REENTRY__ = true;
    } catch (_) {}
    await promptAdminTipoNegocioWebIfNeeded(true);
}
window.confirmarPasswordYAbrirRubroAdmin = confirmarPasswordYAbrirRubroAdmin;

async function confirmarAdminTipoNegocioWeb() {
    const sel = document.getElementById('admin-sesion-tipo');
    const chk = document.getElementById('admin-sesion-tipo-persistir');
    const modal = document.getElementById('modal-admin-tipo-negocio');
    const tipo = (sel?.value || '').trim();
    if (!tipo) {
        toast('Elegí un tipo de negocio', 'error');
        return;
    }
    const tipoAntes = String(window.EMPRESA_CFG?.tipo || '').trim();
    const mapTipoABusiness = (t) => {
        const n = normalizarRubroEmpresa(t);
        if (n === 'cooperativa_agua') return 'agua';
        if (n === 'municipio') return 'municipio';
        return 'electricidad';
    };
    const businessSel = mapTipoABusiness(tipo);
    const lineaNegAntes = lineaNegocioOperativaCodigo();
    let persistir = !!(chk && chk.checked);
    let guardadoServidor = false;
    /** Si el tipo elegido difería del guardado en cliente (servidor); dispara logout tras guardar. */
    let cambioRubroVsServidor = false;
    if (persistir) {
        await asegurarJwtApiRest();
        if (!getApiToken()) await intentarRefrescarJwtDesdeCredencialesGuardadas();
        let token = getApiToken();
        if (!token) {
            toast('La API aún no respondió: el tipo se aplica solo en esta sesión. Reintentá guardar en servidor desde Admin → Empresa cuando haya conexión.', 'warning');
            persistir = false;
        } else {
            try {
                let serverTipo = '';
                try {
                    const gr = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (gr.ok) {
                        const jd = await gr.json().catch(() => ({}));
                        serverTipo = String(jd?.cliente?.tipo || '').trim();
                    }
                } catch (_) {}

                cambioRubroVsServidor =
                    !!tipo && !!serverTipo && String(tipo).trim() !== String(serverTipo).trim();

                if (cambioRubroVsServidor) {
                    if (!confirm('¿Cambiar la vista activa del negocio en el servidor? Los datos existentes no se borran; solo cambia qué reclamos y socios ves según la línea (electricidad / agua / municipio).')) {
                        toast('Cambio cancelado', 'warning');
                        return;
                    }
                }

                const sw = await fetch(apiUrl('/api/tenant/switch-business'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ business_type: businessSel })
                });
                if (!sw.ok) {
                    const er = await sw.json().catch(() => ({}));
                    if (sw.status === 404) {
                        const w = await fetch(apiUrl('/api/setup/wizard'), {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                tenant_nombre: String(window.EMPRESA_CFG?.nombre || '').trim() || undefined,
                                business_type: businessSel
                            })
                        });
                        if (!w.ok) {
                            const ew = await w.json().catch(() => ({}));
                            throw new Error(ew.error || ew.detail || `wizard HTTP ${w.status}`);
                        }
                    } else {
                        throw new Error(er.error || er.detail || `switch-business HTTP ${sw.status}`);
                    }
                }

                const bodyObj = { tipo, active_business_type: businessSel };
                const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(bodyObj)
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${resp.status}`);
                }
                guardadoServidor = true;
            } catch (e) {
                toast('No se pudo guardar en servidor: ' + (e?.message || e) + ' — queda aplicado en esta sesión.', 'warning');
                persistir = false;
            }
        }
    }
    const tipoCambioUi = normalizarRubroEmpresa(tipoAntes) !== normalizarRubroEmpresa(tipo);
    if (guardadoServidor && (tipoCambioUi || cambioRubroVsServidor)) {
        toast(
            'Línea de negocio actualizada en el servidor. Cerramos sesión para cargar datos del rubro activo; volvé a iniciar sesión.',
            'info'
        );
        ejecutarCerrarSesionTrasCambioNegocioAdmin();
        return;
    }
    window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), tipo, active_business_type: businessSel };
    window.__PMG_TENANT_BRANDING__ = { ...(window.__PMG_TENANT_BRANDING__ || {}), tipo };
    try {
        persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
    } catch (_) {}
    invalidateCachesTrasCambioRubro(tipoAntes, tipo, lineaNegAntes, lineaNegocioOperativaCodigo());
    aplicarEtiquetasPorTipo(tipo);
    poblarSelectTiposReclamo();
    syncZonaPedidoFormLabels();
    syncEmpresaCfgNombreLogoDesdeMarca();
    aplicarMarcaVisualCompleta();
    if (modal) modal.classList.remove('active');
    if (_resolveAdminTipoModal) {
        _resolveAdminTipoModal();
        _resolveAdminTipoModal = null;
    }
    try {
        window.__PMG_RUBRO_REENTRY__ = false;
    } catch (_) {}
    toast(guardadoServidor ? 'Tipo guardado en servidor y en pantalla' : 'Tipo aplicado en esta sesión', 'success');
}
window.confirmarAdminTipoNegocioWeb = confirmarAdminTipoNegocioWeb;

/** Menos tiles y menos trabajo en WebView / emulador. */
function gnMapaLigero() {
    try {
        return esAndroidWebViewMapa();
    } catch (_) {
        return false;
    }
}

let _gnLastWatchUbicacionMs = 0;
let _mapEscalaDebounceTimer = null;

function mapTapUbicacionInicialHechaSesion() {
    try { return sessionStorage.getItem(MAP_SEED_SESSION_KEY) === '1'; } catch (_) { return false; }
}
function marcarMapTapUbicacionInicialHecha() {
    try { sessionStorage.setItem(MAP_SEED_SESSION_KEY, '1'); } catch (_) {}
}
let _mapLazyIo = null;
function teardownMapLazyObserver() {
    if (_mapLazyIo) {
        try { _mapLazyIo.disconnect(); } catch (_) {}
        _mapLazyIo = null;
    }
}

function setupMapLazyWhenVisibleOnce() {
    teardownMapLazyObserver();
    const mc = document.getElementById('mc');
    const ms = document.getElementById('ms');
    if (!mc || !ms || !ms.classList.contains('active')) return;
    if (typeof IntersectionObserver === 'undefined') {
        queueLazyInitMap();
        return;
    }
    _mapLazyIo = new IntersectionObserver((entries) => {
        for (const en of entries) {
            if (en.isIntersecting && en.intersectionRatio > 0.02) {
                queueLazyInitMap();
                teardownMapLazyObserver();
                return;
            }
        }
    }, { root: ms, rootMargin: '0px', threshold: [0, 0.02, 0.08] });
    _mapLazyIo.observe(mc);
}

function limpiarEstadoMapaSesion() {
    _gpsRecibidoEstaSesion = false;
    teardownMapLazyObserver();
    try { sessionStorage.removeItem(MAP_SEED_SESSION_KEY); } catch (_) {}
}
function marcarGpsRecibidoEstaSesion() {
    _gpsRecibidoEstaSesion = true;
}

/** Barra superior Android eliminada: mapa = mismas paletas que admin (pestañas laterales). */
function toggleAndroidMapStripCollapsed() {}
window.toggleAndroidMapStripCollapsed = toggleAndroidMapStripCollapsed;

limpiarPersistenciaClienteGestorNovaMigracionV2();
aplicarCapaOnboardingVsLoginInicial();
(function reaplicarCapaOnboardingTrasDomReady() {
    const run = () => {
        try {
            aplicarCapaOnboardingVsLoginInicial();
        } catch (_) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
})();

const dbs = document.getElementById('dbs');
const lb  = document.getElementById('lb');


lb.disabled = false;
actualizarBadgeOffline();
(function limpiarLoginSinPersistenciaUsuario() {
    try {
        localStorage.removeItem('gestornova_saved_login');
        const em = document.getElementById('em');
        const pw = document.getElementById('pw');
        if (em) em.value = '';
        if (pw) pw.value = '';
    } catch (_) {}
})();
(function antiAutofillCredencialesLogin() {
    const em = document.getElementById('em');
    const pw = document.getElementById('pw');
    const lf = document.getElementById('lf');
    const lb = document.getElementById('lb');
    if (!em || !pw) return;
    let usuarioEditoLogin = false;
    let detenerBarridoLogin = false;
    const marcarEdicionLogin = () => { usuarioEditoLogin = true; };
    [em, pw].forEach((el) => {
        ['input', 'keydown', 'paste', 'cut'].forEach((ev) => el.addEventListener(ev, marcarEdicionLogin, { passive: true }));
    });
    lb?.addEventListener('mousedown', () => { detenerBarridoLogin = true; }, { capture: true });
    lb?.addEventListener('touchstart', () => { detenerBarridoLogin = true; }, { capture: true, passive: true });
    const strip = () => {
        try {
            em.value = '';
            pw.value = '';
        } catch (_) {}
    };
    const unlock = (el) => {
        try { el.removeAttribute('readonly'); } catch (_) {}
    };
    em.setAttribute('readonly', 'readonly');
    pw.setAttribute('readonly', 'readonly');
    try {
        pw.setAttribute('autocomplete', 'new-password');
    } catch (_) {}
    const armUnlock = (el) => {
        const go = () => unlock(el);
        el.addEventListener('focus', go, { once: true });
        el.addEventListener('mousedown', go, { once: true });
        el.addEventListener('touchstart', go, { once: true, passive: true });
    };
    armUnlock(em);
    armUnlock(pw);
    lf?.addEventListener('submit', () => {
        unlock(em);
        unlock(pw);
    }, { capture: true });
    const barridoSiAutofill = () => {
        if (detenerBarridoLogin || usuarioEditoLogin) return;
        if (document.activeElement === em || document.activeElement === pw) return;
        if (!document.getElementById('ls')?.classList.contains('active')) return;
        strip();
    };
    let antiAutofillIntervalId = null;
    const programarBarridos = () => {
        strip();
        requestAnimationFrame(strip);
        requestAnimationFrame(() => requestAnimationFrame(strip));
        [0, 50, 150, 400, 800, 1500, 2500, 4000, 6000].forEach((ms) => setTimeout(barridoSiAutofill, ms));
        if (antiAutofillIntervalId != null) clearInterval(antiAutofillIntervalId);
        let n = 0;
        antiAutofillIntervalId = setInterval(() => {
            barridoSiAutofill();
            if (++n >= 35) {
                clearInterval(antiAutofillIntervalId);
                antiAutofillIntervalId = null;
            }
        }, 200);
    };
    programarBarridos();
    window.addEventListener('load', () => {
        strip();
        [80, 300, 900, 2000].forEach((ms) => setTimeout(barridoSiAutofill, ms));
    });
    window.addEventListener('pageshow', () => {
        strip();
        [100, 400, 1200].forEach((ms) => setTimeout(barridoSiAutofill, ms));
    });
})();
(function pintarMarcaLoginAlCargarModulo() {
    try {
        if (document.getElementById('ls')?.classList.contains('active')) {
            hydrateBrandingForPublicScreen();
            aplicarMarcaVisualCompleta();
        }
    } catch (_) {}
})();
(function bindWizardOnboardingUi() {
    document.getElementById('wizard-btn-primary')?.addEventListener('click', (e) => {
        e.preventDefault();
        onWizardPrimaryClick();
    });
    document.getElementById('wizard-btn-secondary')?.addEventListener('click', (e) => {
        e.preventDefault();
        cerrarVistaWizardMostrarLogin();
    });
    document.getElementById('form-reabrir-asistente')?.addEventListener('submit', confirmarReabrirAsistenteConCredenciales);
})();
dbs.className = 'dbs c';
dbs.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando red...';


async function conectarNeon() {
    try {
        const ok = await initNeon();
        if (ok) {
            try {
                await sqlSimple(`CREATE TABLE IF NOT EXISTS pedidos(
                    id SERIAL PRIMARY KEY,
                    numero_pedido TEXT NOT NULL,
                    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
                    fecha_cierre TIMESTAMPTZ,
                    distribuidor TEXT NOT NULL,
                    cliente TEXT, tipo_trabajo TEXT,
                    descripcion TEXT NOT NULL,
                    prioridad TEXT NOT NULL DEFAULT 'Media',
                    estado TEXT NOT NULL DEFAULT 'Pendiente',
                    avance INT DEFAULT 0,
                    lat DOUBLE PRECISION, lng DOUBLE PRECISION,
                    usuario_id INT, trabajo_realizado TEXT,
                    tecnico_cierre TEXT, foto_base64 TEXT,
                    x_inchauspe NUMERIC, y_inchauspe NUMERIC,
                    fecha_avance TIMESTAMPTZ, foto_cierre TEXT
                )`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS foto_cierre TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nis_medidor TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tecnico_asignado_id INTEGER`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMPTZ`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS firma_cliente TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS checklist_seguridad TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS usuario_creador_id INTEGER`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS telefono_contacto TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_direccion TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(200)`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_calle TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_numero_puerta VARCHAR(20)`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_localidad TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS provincia TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS provincia TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS codigo_postal TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS codigo_postal TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS suministro_tipo_conexion TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS suministro_fases TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS trafo TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS barrio TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_cliente TEXT`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_opinion_cliente TIMESTAMPTZ`);
                await sqlSimple(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_cliente_estrellas SMALLINT`);
                try {
                    await sqlSimple(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS barrio TEXT`);
                } catch (_) {}
                try {
                    await sqlSimple(`ALTER TABLE pedidos ALTER COLUMN distribuidor DROP NOT NULL`);
                } catch (_) {}
                await sqlSimple(`CREATE TABLE IF NOT EXISTS socios_catalogo(
                    id SERIAL PRIMARY KEY,
                    nis_medidor TEXT NOT NULL UNIQUE,
                    nombre TEXT,
                    calle TEXT,
                    numero TEXT,
                    telefono TEXT,
                    distribuidor_codigo TEXT,
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS localidad TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS tipo_tarifa TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS urbano_rural TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS transformador TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS tipo_conexion TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS fases TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS calle TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS numero TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS barrio TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS latitud NUMERIC(12, 8)`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS longitud NUMERIC(12, 8)`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS nis TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS medidor TEXT`);
                await sqlSimple(`CREATE TABLE IF NOT EXISTS pedido_materiales(
                    id SERIAL PRIMARY KEY,
                    pedido_id INTEGER NOT NULL,
                    descripcion TEXT NOT NULL,
                    cantidad NUMERIC,
                    unidad TEXT,
                    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )`);
                
                await sqlSimple(`CREATE TABLE IF NOT EXISTS pedido_contador(
                    anio INT PRIMARY KEY,
                    ultimo_numero INT NOT NULL DEFAULT 0
                )`);
            } catch(_) {}
            try {
                await sqlSimple(
                    'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE'
                );
            } catch (_) {}
            app.ok = true;
            NEON_OK = true;
            dbs.className = 'dbs ok';
            dbs.innerHTML = '<i class="fas fa-check-circle"></i> Conectado - Neon PostgreSQL';
            setModoOffline(false);
            await notificarNeonConectadoParaUpdateCheck();
            if (app.u && offlineQueue().length > 0) setTimeout(sincronizarOffline, 1500);
            else if (app.u) cargarPedidos();
        } else {
            throw new Error('Sin red');
        }
    } catch(e) {
        console.warn('[Neon]', e.message);
        app.ok = false;
        NEON_OK = false;
        const tieneCache = (() => {
            try { return JSON.parse(localStorage.getItem('pmg_offline_user') || '[]').length > 0; } catch(_) { return false; }
        })();
        dbs.className = 'dbs er';
        dbs.innerHTML = tieneCache
            ? '<i class="fas fa-wifi-slash"></i> Sin conexión — podés ingresar offline'
            : '<i class="fas fa-wifi-slash"></i> Sin conexión — ingresá con internet primero';
        setModoOffline(true);
    }
}




function resetPreferenciasPanelesInicioCerrados() {
    try {
        localStorage.setItem('pmg_slideoff_filtros', '1');
        localStorage.setItem('pmg_slideoff_filtro_tipo', '1');
        localStorage.setItem('pmg_slideoff_colores', '1');
        localStorage.setItem('pmg_slideoff_dash', '1');
        localStorage.setItem('pmg_bp2_hidden', '1');
    } catch (_) {}
}

function decimalToDmsLite(decimal, isLat) {
    const n = Number(decimal);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    const hemi = isLat ? (n >= 0 ? 'N' : 'S') : (n >= 0 ? 'E' : 'O');
    return `${deg}° ${min}' ${sec}" ${hemi}`;
}

function dmsToDecimalLite(raw) {
    const s = String(raw || '').trim();
    if (!s) return Number.NaN;
    if (!/[°º'′´"″]/.test(s)) return parseFloat(s.replace(',', '.'));
    const m = s.match(/^\s*(\d+)[°º]\s*(\d+)['′´]\s*([\d.,]+)\s*["″]?\s*([NnSsEeOoWw])\s*$/);
    if (!m) return Number.NaN;
    const deg = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseFloat(String(m[3]).replace(',', '.'));
    const hemi = m[4].toUpperCase();
    if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return Number.NaN;
    let dec = deg + min / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W' || hemi === 'O') dec = -dec;
    return dec;
}

function initWebCoordsConverterBar() {
    const wrap = document.getElementById('web-coords-converter');
    const mode = document.getElementById('web-coords-converter-mode');
    const a = document.getElementById('web-coords-converter-a');
    const b = document.getElementById('web-coords-converter-b');
    const run = document.getElementById('web-coords-converter-run');
    const out = document.getElementById('web-coords-converter-out');
    if (!wrap || !mode || !a || !b || !run || !out) return;
    const visible = !esAndroidWebViewMapa();
    wrap.style.display = visible ? 'inline-flex' : 'none';
    out.style.display = visible ? 'inline' : 'none';
    if (!visible || run.dataset.bound === '1') return;
    run.dataset.bound = '1';
    let prevMode = mode.value;
    const applyPlaceholders = () => {
        if (mode.value === 'dec_to_dms') {
            a.placeholder = 'Latitud decimal';
            b.placeholder = 'Longitud decimal';
        } else {
            a.placeholder = 'Latitud GMS';
            b.placeholder = 'Longitud GMS';
        }
    };
    const convertirInputs = (fromMode) => {
        if (fromMode === 'dec_to_dms') {
            const lat = parseFloat(String(a.value || '').trim().replace(',', '.'));
            const lng = parseFloat(String(b.value || '').trim().replace(',', '.'));
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                out.textContent = 'Ingresá lat/lng decimales válidos';
                return false;
            }
            const latDms = decimalToDmsLite(lat, true);
            const lngDms = decimalToDmsLite(lng, false);
            a.value = latDms;
            b.value = lngDms;
            out.textContent = `${latDms} · ${lngDms}`;
            return true;
        }
        const lat = dmsToDecimalLite(a.value);
        const lng = dmsToDecimalLite(b.value);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            out.textContent = 'Ingresá lat/lng en formato GMS válido';
            return false;
        }
        const latDec = lat.toFixed(7);
        const lngDec = lng.toFixed(7);
        a.value = latDec;
        b.value = lngDec;
        out.textContent = `${latDec}, ${lngDec}`;
        return true;
    };
    const intercambiarConversion = () => {
        const ok = convertirInputs(mode.value);
        if (!ok) return;
        mode.value = mode.value === 'dec_to_dms' ? 'dms_to_dec' : 'dec_to_dms';
        prevMode = mode.value;
        applyPlaceholders();
    };
    run.addEventListener('click', intercambiarConversion);
    mode.addEventListener('change', () => {
        if (mode.value === prevMode) return;
        const hayDatos = String(a.value || '').trim() || String(b.value || '').trim();
        if (hayDatos) {
            const ok = convertirInputs(prevMode);
            if (!ok) {
                mode.value = prevMode;
                return;
            }
        }
        prevMode = mode.value;
        applyPlaceholders();
    });
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter') intercambiarConversion(); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') intercambiarConversion(); });
    applyPlaceholders();
}

document.getElementById('lf').addEventListener('submit', async e => {
    e.preventDefault();
    
    const em = document.getElementById('em').value.trim();
    const pw = document.getElementById('pw').value;
    const le = document.getElementById('le');
    const lb = document.getElementById('lb');
    
    lb.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';
    lb.disabled = true;
    le.textContent = '';
    
    
    function entrarConUsuario(u, offline = false) {
        u.rol = normalizarRolStr(u.rol);
        invalidatePedidosTenantSqlCache();
        app.u = u;
        localStorage.setItem('pmg', JSON.stringify(app.u));
        document.getElementById('un').textContent = u.nombre.split(' ')[0];
        document.getElementById('ls').classList.remove('active');
        document.getElementById('ms').classList.add('active');
        resetPreferenciasPanelesInicioCerrados();
        try { aplicarUIMapaPlataforma(); } catch (_) {}
        try { initWebCoordsConverterBar(); } catch (_) {}
        iniciarKeepAlive();
        iniciarTracking();
        iniciarPollNotifMovil();
        iniciarSyncCatalogos();
        const btnAdm = document.getElementById('btn-admin');
        if (btnAdm) btnAdm.style.display = esAdmin() ? 'flex' : 'none';
        try {
            gnGeocodeAdminLogSyncDockVisibility();
        } catch (_) {}
        const btnRubro = document.getElementById('btn-admin-cambiar-rubro');
        if (btnRubro) btnRubro.style.display = esAdminSesionWebPublica() ? 'flex' : 'none';
        const btnDash = document.getElementById('btn-dashboard-gerencia');
        if (btnDash) btnDash.style.display = esAdmin() ? 'flex' : 'none';
        const mtBtn = document.getElementById('mt');
        if (mtBtn) {
            mtBtn.innerHTML = '<i class="fas fa-list"></i>';
            mtBtn.title = esAdmin()
                ? 'Marca, logo y ubicación base (solicita contraseña de administrador)'
                : 'Panel de pedidos';
        }
        const btnDerivPend = document.getElementById('btn-derivaciones-pendientes');
        if (btnDerivPend) btnDerivPend.style.display = esAdmin() ? 'inline-flex' : 'none';
        const mapDashCard = document.getElementById('mapa-card-dashboard');
        if (mapDashCard) mapDashCard.style.display = esAdmin() ? 'block' : 'none';
        const wrapTog = document.getElementById('wrap-toggle-ver-todos');
        const chkTod = document.getElementById('toggle-ver-todos-pedidos');
        if (wrapTog && chkTod) {
            wrapTog.style.display = esTecnicoOSupervisor() ? 'inline-flex' : 'none';
            chkTod.checked = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
        }
        const wrapDf = document.getElementById('wrap-chk-derivados-fuera');
        const chkDf = document.getElementById('chk-mostrar-derivados-fuera');
        if (wrapDf && chkDf) {
            wrapDf.style.display = esAdmin() ? 'inline-flex' : 'none';
            chkDf.checked = esAdmin() && localStorage.getItem(LS_MOSTRAR_DERIVADOS_FUERA) === '1';
            if (!esAdmin()) {
                try {
                    localStorage.removeItem(LS_MOSTRAR_DERIVADOS_FUERA);
                } catch (_) {}
                chkDf.checked = false;
            }
        }
        try {
            if (window.AndroidSession && typeof AndroidSession.setUser === 'function') {
                AndroidSession.setUser(parseInt(u.id, 10) || 0, String(u.rol || ''));
            }
        } catch (_) {}
        if (esAdmin()) {
            iniciarDashboardGerenciaPoll();
            iniciarPollWhatsappHumanChat();
            detenerPollSincroPedidosTecnico();
        } else {
            detenerDashboardGerenciaPoll();
            detenerPollWhatsappHumanChat();
            destruirTodasVentanasWaHc();
            detenerTecnicosMapaPrincipalPoll();
            iniciarPollSincroPedidosTecnico();
            detenerPollBannerReclamoCliente();
        }
        setTimeout(async () => {

            solicitarPermisos().then(r => {
                if (!r.gps) toast('GPS no disponible — ubicación manual', 'info');
                if (ultimaUbicacion) {
                    const enviarAl_SW = () => {
                        if (navigator.serviceWorker?.controller) {
                            navigator.serviceWorker.controller.postMessage({
                                tipo: 'CACHEAR_ZONA',
                                lat: ultimaUbicacion.lat,
                                lng: ultimaUbicacion.lon,
                                radioKm: 150
                            });
                        }
                    };
                    // Esperar a que el SW esté activo
                    if (navigator.serviceWorker?.controller) enviarAl_SW();
                    else setTimeout(enviarAl_SW, 4000);
                }
            });
            setupMapLazyWhenVisibleOnce();
            if (!offline) {
                await asegurarJwtApiRest();
                await cargarDistribuidores();
                const cfgLista = await verificarConfiguracionInicialObligatoria();
                if (!cfgLista) return;
                await cargarConfigEmpresa();
                await cargarPedidos();
                if (esAdmin()) iniciarPollBannerReclamoCliente();
                
                offlinePedidosSave(app.p);
            } else {
                
                app.p = offlinePedidos();
                render();
                toast('📴 Modo offline — mostrando pedidos en caché', 'info');
            }
            await consumirPedidoPendienteDesdeNotif();
        }, 200);
    }
    
    
    function intentarOffline() {
        const u = verificarUsuarioOffline(em, pw);
        if (u) {
            entrarConUsuario({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol }, true);
            toast('📴 Modo offline — ' + u.nombre, 'info');
            return true;
        }
        return false;
    }

    try {
        
        if (modoOffline || !NEON_OK || !_sql) {
            try {
                const reconectado = await initNeon();
                if (reconectado) {
                    NEON_OK = true;
                    setModoOffline(false);
                    await notificarNeonConectadoParaUpdateCheck();
                }
            } catch(_) {}
        }
        if (modoOffline || !NEON_OK || !_sql) {
            if (!intentarOffline()) {
                le.textContent = 'Sin conexión. Ingresá con internet al menos una vez para habilitar el modo offline.';
            }
            return;
        }

        
        let resultado = null;
        const loginWhere = `FROM usuarios WHERE email = ${esc(em)} AND password_hash = ${esc(pw)}`;
        const mustCol = ', COALESCE(must_change_password, false) AS must_change_password';
        // Primero la consulta mínima (evita 400 en Neon si no existen tenant_id / cliente_id).
        const loginSqlAttempts = [
            `SELECT id, email, nombre, rol${mustCol} ${loginWhere}`,
            `SELECT id, email, nombre, rol, tenant_id${mustCol} ${loginWhere}`,
            `SELECT id, email, nombre, rol, COALESCE(cliente_id, 1) AS tenant_id${mustCol} ${loginWhere}`
        ];
        try {
            let lastErr = null;
            for (const sel of loginSqlAttempts) {
                try {
                    resultado = await conTimeout(sqlSimple(sel), 8000, 'timeout login');
                    break;
                } catch (err) {
                    lastErr = err;
                    console.warn('[login] variante SQL:', err && err.message ? err.message : err);
                }
            }
            if (!resultado) throw lastErr || new Error('Login SQL no disponible');
        } catch (netErr) {
            
            console.warn('Login: red caída, usando cache:', netErr.message);
            setModoOffline(true);
            if (!intentarOffline()) {
                le.textContent = 'Se perdió la conexión. Si ingresaste antes, ya podés entrar sin internet.';
            }
            return;
        }

        const usuario = resultado.rows?.[0];
        if (usuario) {
            const u = {
                id: usuario.id,
                email: usuario.email,
                nombre: usuario.nombre || 'Administrador',
                rol: normalizarRolStr(usuario.rol || 'tecnico'),
                tenant_id: usuario.tenant_id != null ? Number(usuario.tenant_id) : tenantIdActual(),
                must_change_password: !!usuario.must_change_password
            };
            guardarUsuarioOffline(u, pw);
            await loginApiJwt(em, pw);
            if (!getApiToken()) {
                toast('La API (JWT) no respondió: el setup SaaS y datos del tenant pueden no cargar hasta que revises API_BASE_URL o la red.', 'warning');
            }
            const rolL = normalizarRolStr(u.rol);
            const forzarCambioAndroid =
                u.must_change_password &&
                esAndroidWebViewMapa() &&
                (rolL === 'tecnico' || rolL === 'supervisor');
            if (forzarCambioAndroid) {
                window._pendingAndroidPasswordChange = { u, passwordActual: pw };
                document.getElementById('modal-forzar-cambio-pw')?.classList.add('active');
                lb.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
                lb.disabled = false;
                toast('Debés definir una nueva contraseña para continuar.', 'info');
                return;
            }
            entrarConUsuario(u, false);
            toast('Bienvenido ' + u.nombre, 'success');
        } else {
            
            le.textContent = 'Email o contraseña incorrectos.';
        }
    } catch (error) {
        console.error('Error inesperado en login:', error);
        if (!intentarOffline()) {
            le.textContent = 'Error inesperado. Intentá de nuevo.';
        }
    } finally {
        lb.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
        lb.disabled = false;
    }
});

function toast(msg, tipo = 'info', durationMs) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
    }
    let s = gnDice(String(msg ?? ''));
    const isRich = s.includes('<div') || s.includes('<p');
    const maxLen = tipo === 'error' ? (isRich ? 12000 : 600) : 2200;
    if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
    
    // Usar innerHTML para renderizar HTML (el contenido ya viene sanitizado)
    if (s.includes('<div') || s.includes('<p')) {
        el.innerHTML = s;
    } else {
        el.textContent = s;
    }
    
    el.className = 'show ' + tipo + (s.length > 100 ? ' toast-multiline' : '');
    try {
        el.style.whiteSpace = s.length > 100 ? 'normal' : 'nowrap';
        el.style.maxWidth = s.length > 100 ? 'min(92vw, 32rem)' : '';
    } catch (_) {}
    if (tipo === 'error') el.setAttribute('role', 'alert');
    else el.removeAttribute('role');
    const dur =
        durationMs != null && Number.isFinite(Number(durationMs)) && Number(durationMs) > 0
            ? Number(durationMs)
            : 5200;
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        el.className = tipo;
        try {
            el.style.whiteSpace = '';
            el.style.maxWidth = '';
        } catch (_) {}
        if (tipo === 'error') el.removeAttribute('role');
    }, dur);
}
window.toast = toast;

(function wrapConfirmGestorNova() {
    if (typeof window === 'undefined' || window.__gnConfirmWrapped) return;
    const orig = window.confirm.bind(window);
    window.confirm = function (msg) {
        return orig(gnDice(msg));
    };
    window.__gnConfirmWrapped = true;
})();

(function wrapAlertGestorNova() {
    if (typeof window === 'undefined' || window.__gnAlertWrapped) return;
    const orig = window.alert.bind(window);
    window.alert = function (msg) {
        orig(gnDice(msg));
    };
    window.__gnAlertWrapped = true;
})();

const norm = p => ({
    id: p.id,
    np: p.numero_pedido,
    f: p.fecha_creacion || p.fecha || new Date().toISOString(),
    fc: p.fecha_cierre || null,
    fa: p.fecha_avance || null,
    dis: p.distribuidor || '',
    br: String(p.barrio || '').trim(),
    trf: String(p.trafo || p.setd || '').trim(),
    cl: p.cliente || '',
    tt: p.tipo_trabajo || '',
    de: p.descripcion || '',
    pr: p.prioridad || 'Media',
    es: p.estado || 'Pendiente',
    av: parseInt(p.avance) || 0,
    la: (() => {
        const raw = p.lat != null && p.lat !== '' ? p.lat : p.latitud;
        if (raw == null || raw === '') return null;
        const v = parseFloat(String(raw).trim().replace(',', '.'));
        return Number.isFinite(v) ? v : null;
    })(),
    ln: (() => {
        const raw = p.lng != null && p.lng !== '' ? p.lng : p.longitud;
        if (raw == null || raw === '') return null;
        const v = parseFloat(String(raw).trim().replace(',', '.'));
        return Number.isFinite(v) ? v : null;
    })(),
    ui: p.usuario_id,
    tr: p.trabajo_realizado || null,
    tc: p.tecnico_cierre || null,
    fotos: p.foto_base64 ? p.foto_base64.split('||') : [],
    foto_cierre: p.foto_cierre || null,
    uc: p.usuario_creador_id,
    ui2: p.usuario_inicio_id,
    uav: p.usuario_avance_id,
    uci: p.usuario_cierre_id,
    x_inchauspe: p.x_inchauspe,
    y_inchauspe: p.y_inchauspe,
    nis: (p.nis || '').trim(),
    med: (p.medidor || '').trim(),
    nis_med: (p.nis_medidor || '').trim(),
    cdir: (p.cliente_direccion || '').trim(),
    cnom: (p.cliente_nombre || p.cliente || '').trim(),
    ccal: (p.cliente_calle || '').trim(),
    cnum: (p.cliente_numero_puerta || '').trim(),
    cloc: (p.cliente_localidad || '').trim(),
    cpcia: (p.provincia || '').trim(),
    ccp: (p.codigo_postal || '').trim(),
    stc: (p.suministro_tipo_conexion || '').trim(),
    sfs: (p.suministro_fases || '').trim(),
    tai: p.tecnico_asignado_id != null ? parseInt(p.tecnico_asignado_id, 10) : null,
    fasi: p.fecha_asignacion || null,
    firma: p.firma_cliente || null,
    chkl: p.checklist_seguridad || null,
    tel: (p.telefono_contacto || '').trim(),
    opin: (() => {
        const v = p.opinion_cliente;
        if (v == null || v === '') return null;
        const s = String(v).trim();
        return s || null;
    })(),
    fopin: p.fecha_opinion_cliente || null,
    oes: (() => {
        const n = parseInt(p.opinion_cliente_estrellas, 10);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
    })(),
    orc: String(p.origen_reclamo || '').trim().toLowerCase(),
    dex: !!(
        p.derivado_externo === true ||
        p.derivado_externo === 't' ||
        p.derivado_externo === 1 ||
        String(p.estado || '') === 'Derivado externo'
    ),
    dda: String(p.derivado_a || '').trim(),
    ddn: String(p.derivado_destino_nombre || '').trim(),
    fder: p.fecha_derivacion || null,
    uider: p.usuario_derivacion_id != null ? parseInt(p.usuario_derivacion_id, 10) : null,
    dnota: String(p.derivacion_nota || '').trim(),
    dsnap: String(p.derivacion_mensaje_snapshot || '').trim(),
    sdpen: !!(
        p.solicitud_derivacion_pendiente === true ||
        p.solicitud_derivacion_pendiente === 't' ||
        p.solicitud_derivacion_pendiente === 1
    ),
    sdm: String(p.solicitud_derivacion_motivo || '').trim(),
    sdf: p.solicitud_derivacion_fecha || null,
    sduid:
        p.solicitud_derivacion_usuario_id != null
            ? parseInt(p.solicitud_derivacion_usuario_id, 10)
            : null,
    sddsu: String(p.solicitud_derivacion_destino_sugerido || '').trim(),
    wgeo: (() => {
        const g = p.geocode_log_whatsapp;
        if (g == null || g === '') return null;
        if (typeof g === 'object' && !Array.isArray(g)) return g;
        try {
            return JSON.parse(String(g));
        } catch (_) {
            return null;
        }
    })(),
    gaudit: (() => {
        const g = p.geocoding_audit;
        if (g == null || g === '') return null;
        if (typeof g === 'object' && !Array.isArray(g)) return g;
        try {
            return JSON.parse(String(g));
        } catch (_) {
            return null;
        }
    })(),
    pbt: String(p.business_type || '')
        .trim()
        .toLowerCase(),
});

if (typeof window !== 'undefined' && !window._pedidoCoordsInferidas) window._pedidoCoordsInferidas = {};

/** WGS84 finito, no (0,0), dentro de rango — pin útil en mapa (no confundir con domicilio exacto). */
function coordsSonPinValidasMapaWgs84(la, ln) {
    const a = Number(la);
    const b = Number(ln);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (a === 0 && b === 0) return false;
    if (a < -90 || a > 90 || b < -180 || b > 180) return false;
    return true;
}

/** Texto admin: cómo se obtuvo el pin (política A / re-geocodificación). */
function etiquetaModoUbicPedido(a) {
    if (!a || typeof a !== 'object') return '';
    const ma = String(a.metodo_ancla || '').trim();
    const anclaEtq = {
        nominatim_inicio_num1: 'Ancla Nominatim (n°1 como inicio aprox.)',
        overpass_addr_min: 'Ancla Overpass (menor addr:housenumber en la zona)',
        overpass_geom_first_node: 'Ancla Overpass (primer nodo, vía más larga)',
    };
    const preAncla = ma ? `${anclaEtq[ma] || `Ancla: ${ma}`}. ` : '';
    const m = String(a.modo || '').trim();
    if (m === 'interpolado_via') {
        return `${preAncla}Aproximada — interpolación sobre vía OSM y vereda por paridad (heurística; no es medición catastral).`;
    }
    if (m === 'localidad') {
        return `${preAncla}Aproximada — centro o búsqueda por localidad / ciudad.`;
    }
    if (m === 'tenant') {
        return `${preAncla}Aproximada — sede o área de referencia del tenant.`;
    }
    if (m === 'region') {
        return `${preAncla}Muy aproximada — región o respaldo geográfico (último recurso).`;
    }
    if (m === 'exacto_aprox') {
        return `${preAncla}Según mapas / catálogo; puede no coincidir con la puerta exacta.`;
    }
    if (m === 'aprox') return `${preAncla}Aproximada (ver fuente en auditoría).`;
    if (preAncla) return preAncla.trim();
    return '';
}

/** Coordenadas para mapa: columnas del pedido; si faltan, último log WA en servidor (`geocode_log_whatsapp`). */
function coordsEfectivasPedidoMapa(p) {
    if (!p) return { la: null, ln: null };
    if (coordsSonPinValidasMapaWgs84(p.la, p.ln)) return { la: Number(p.la), ln: Number(p.ln) };
    const w = p.wgeo;
    if (w && typeof w === 'object') {
        const wla = Number(w.lat);
        const wln = Number(w.lng);
        const pinOk =
            w.pin_ok === true || (w.success === true && coordsSonPinValidasMapaWgs84(wla, wln));
        if (pinOk && coordsSonPinValidasMapaWgs84(wla, wln)) {
            return { la: wla, ln: wln };
        }
    }
    const inf = window._pedidoCoordsInferidas && window._pedidoCoordsInferidas[String(p.id)];
    if (inf && coordsSonPinValidasMapaWgs84(inf.la, inf.ln)) return { la: Number(inf.la), ln: Number(inf.ln) };
    return { la: null, ln: null };
}

/** Igual que api/utils/parseDomicilioArg.js — texto libre tipo "Doctor Haedo 365, Hasenkamp". */
function parseDomicilioLibreArgentinaFront(cdir, localidadFallback) {
    const raw = String(cdir || '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,.;-]+|[\s,.;-]+$/g, '')
        .trim();
    if (!raw) return null;
    const fb =
        localidadFallback != null && String(localidadFallback).trim() ? String(localidadFallback).trim() : null;
    const mComa = raw.match(/^(.+?)\s+(\d{1,6})\s*[,;]\s*(.+)$/i);
    if (mComa) {
        return { calle: mComa[1].trim(), numero: mComa[2].trim(), localidad: mComa[3].trim() };
    }
    const soloNum = raw.match(/^(.+?)\s+(\d{1,6})$/);
    if (soloNum && fb) {
        return { calle: soloNum[1].trim(), numero: soloNum[2].trim(), localidad: fb };
    }
    const triple = raw.match(
        /^(.+?)\s+(\d{1,6})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s\-.]{2,79})$/u
    );
    if (triple) {
        const locCand = triple[3].trim();
        if (!/^\d+$/.test(locCand) && locCand.length >= 3) {
            return { calle: triple[1].trim(), numero: triple[2].trim(), localidad: locCand };
        }
    }
    return null;
}

function domicilioParaGeocodePedido(p) {
    if (!p) return null;
    let calle = (p.ccal || '').trim();
    let loc = (p.cloc || '').trim();
    let num = (p.cnum || '').trim();
    const cdir = (p.cdir || '').trim();
    if (calle && loc) return { calle, loc, num };
    const parsed = cdir ? parseDomicilioLibreArgentinaFront(cdir, loc || null) : null;
    if (parsed && parsed.calle && parsed.localidad) {
        return {
            calle: parsed.calle,
            loc: parsed.localidad,
            num: num || parsed.numero || '',
        };
    }
    return null;
}

/** URL de la UI pública de Nominatim (solo admin / diagnóstico; el proxy sigue siendo la API Node). */
function nominatimUiSearchUrlFromTexto(texto) {
    let q = String(texto || '')
        .replace(/\s+/g, ' ')
        .trim();
    const m = q.match(/^q="([^"]+)"/);
    if (m) q = m[1];
    if (q.length < 2) return '';
    return `https://nominatim.openstreetmap.org/ui/search.html?q=${encodeURIComponent(q)}`;
}

function _normGeoTxt(s) {
    try {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    } catch (_) {
        return String(s || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }
}

/* ——— Log visible admin: geocodificación / proxy Nominatim (GitHub Pages; no OSM directo) ——— */
const GN_GEOCODE_LOG_STORAGE_KEY = 'gn_geocode_admin_ui_log_v1';
const GN_GEOCODE_LOG_MAX_LINES = 380;
let _gnGeocodeUiLogDepth = 0;
let _gnGeocodeLogLines = [];
let _gnGeocodeLogPersistTimer = null;
let _gnGeocodeLogDockBound = false;
/** Polling lista operaciones geocod WA (panel admin abierto). */
let _gnWaGeoOpsPollTimer = null;
/** Usuario pausó explícitamente el auto-refresh. */
let _gnWaGeoOpsUserPaused = false;

function _gnWaGeoOpsListHasOpenDetails(listEl) {
    if (!listEl) return false;
    try {
        return !!listEl.querySelector('details.gn-wa-geo-op[open]');
    } catch (_) {
        return false;
    }
}

function _gnWaGeoOpsShouldSkipAutoRefresh(listEl) {
    return _gnWaGeoOpsUserPaused || _gnWaGeoOpsListHasOpenDetails(listEl);
}

function _gnWaGeoOpsSyncPauseButtonUi() {
    const btn = document.getElementById('gn-wa-geo-ops-pause');
    if (!btn) return;
    const paused = _gnWaGeoOpsUserPaused;
    btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    btn.textContent = paused ? 'Reanudar auto' : 'Pausar auto';
    btn.title = paused ? 'Reanudar actualización automática cada ~2,5 s' : 'Pausar el refresco automático (podés seguir leyendo o copiando)';
}

function _gnEscWaHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Admin: GET /api/admin/geocod-wa-operaciones (últimas N filas del tenant).
 * @param {boolean} [force] — si true, ignora pausa y `<details open>` (p. ej. "Actualizar ahora").
 */
function gnWaGeoOpsRefresh(force) {
    const wrap = document.getElementById('gn-wa-geo-ops-list');
    if (!wrap) return;
    if (typeof esAdmin !== 'function' || !esAdmin()) {
        wrap.innerHTML = '';
        return;
    }
    if (modoOffline) {
        wrap.innerHTML = '<p class="gn-wa-geo-ops-msg">No disponible en modo offline.</p>';
        return;
    }
    const tok = getApiToken();
    if (!tok) {
        wrap.innerHTML = '<p class="gn-wa-geo-ops-msg">Iniciá sesión para ver operaciones del servidor.</p>';
        return;
    }
    if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) {
        return;
    }
    (async () => {
        try {
            const r = await fetch(apiUrl('/api/admin/geocod-wa-operaciones?limit=15'), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (!r.ok) {
                if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) return;
                wrap.innerHTML = `<p class="gn-wa-geo-ops-msg">${_gnEscWaHtml(`No se pudo cargar (${r.status}).`)}</p>`;
                return;
            }
            const j = await r.json();
            const items = j.items || [];
            if (!items.length) {
                if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) return;
                wrap.innerHTML =
                    '<p class="gn-wa-geo-ops-msg">Sin operaciones recientes (o migración <code>geocod_wa_operaciones</code> pendiente en la API).</p>';
                return;
            }
            if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) return;
            wrap.innerHTML = items
                .map((row) => {
                    const st = String(row.estado || '');
                    const cid = String(row.correlation_id || '');
                    const pasos = Array.isArray(row.pasos) ? row.pasos : [];
                    const last = pasos.length ? pasos[pasos.length - 1] : null;
                    const lastSlug = last && last.slug ? last.slug : '—';
                    const phone = row.telefono_masked || '—';
                    const t0 = row.started_at ? new Date(row.started_at).toLocaleString('es-AR') : '';
                    let badge = 'En curso';
                    let badgeClass = 'gn-wa-badge-run';
                    if (st === 'ok') {
                        badge = 'OK';
                        badgeClass = 'gn-wa-badge-ok';
                    } else if (st === 'error') {
                        badge = 'Error';
                        badgeClass = 'gn-wa-badge-err';
                    }
                    const fuente = row.fuente_final ? _gnEscWaHtml(String(row.fuente_final)) : '';
                    const errBlock = row.mensaje_error
                        ? `<p class="gn-wa-geo-op-err">${_gnEscWaHtml(String(row.mensaje_error).slice(0, 2000))}</p>`
                        : '';
                    const preLines = pasos
                        .slice(-40)
                        .map((p) => _gnEscWaHtml(JSON.stringify(p)))
                        .join('\n');
                    const ms = last && last.ms != null ? ` · ${last.ms} ms` : '';
                    const pedidoLine =
                        row.numero_pedido || row.pedido_id
                            ? `<p class="gn-wa-geo-op-last">Pedido: ${_gnEscWaHtml(String(row.numero_pedido || row.pedido_id || ''))}</p>`
                            : '';
                    return `<details class="gn-wa-geo-op"><summary><span class="${badgeClass}">${_gnEscWaHtml(badge)}</span> · ${_gnEscWaHtml(phone)} · <code>${_gnEscWaHtml(cid)}</code> · ${_gnEscWaHtml(t0)}${fuente ? ` · ${fuente}` : ''}</summary><div class="gn-wa-geo-op-body"><p class="gn-wa-geo-op-last">Último paso: <code>${_gnEscWaHtml(String(lastSlug))}</code>${_gnEscWaHtml(ms)}</p>${pedidoLine}<pre class="gn-wa-geo-op-pre">${preLines}</pre>${errBlock}</div></details>`;
                })
                .join('');
        } catch (e) {
            if (!force && _gnWaGeoOpsShouldSkipAutoRefresh(wrap)) return;
            wrap.innerHTML = `<p class="gn-wa-geo-ops-msg">${_gnEscWaHtml(String(e && e.message ? e.message : e))}</p>`;
        }
    })();
}

function gnWaGeoOpsStartPoll() {
    gnWaGeoOpsStopPoll();
    gnWaGeoOpsRefresh(true);
    _gnWaGeoOpsPollTimer = setInterval(() => gnWaGeoOpsRefresh(false), 2500);
}

function gnWaGeoOpsStopPoll() {
    if (_gnWaGeoOpsPollTimer) {
        clearInterval(_gnWaGeoOpsPollTimer);
        _gnWaGeoOpsPollTimer = null;
    }
}

function _gnGeocodeLogTs() {
    try {
        return new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    } catch (_) {
        return '';
    }
}

function gnGeocodeUiLogIsActive() {
    return _gnGeocodeUiLogDepth > 0;
}

function gnGeocodeUiLogStartSession(mensaje) {
    if (typeof esAdmin !== 'function' || !esAdmin()) return;
    _gnGeocodeUiLogDepth++;
    if (_gnGeocodeUiLogDepth === 1) {
        gnGeocodeUiLogAppend('info', mensaje || 'Sesión de geocodificación iniciada.');
    }
}

function gnGeocodeUiLogEndSession() {
    if (typeof esAdmin !== 'function' || !esAdmin()) return;
    if (_gnGeocodeUiLogDepth > 0) _gnGeocodeUiLogDepth--;
    if (_gnGeocodeUiLogDepth === 0) {
        gnGeocodeUiLogAppend('info', 'Sesión de geocodificación finalizada.');
    }
}

function _gnGeocodeLogPersistSoon() {
    if (_gnGeocodeLogPersistTimer) clearTimeout(_gnGeocodeLogPersistTimer);
    _gnGeocodeLogPersistTimer = setTimeout(() => {
        _gnGeocodeLogPersistTimer = null;
        try {
            const tail = _gnGeocodeLogLines.slice(-120).map((x) => ({ ts: x.ts, level: x.level, text: x.text }));
            sessionStorage.setItem(GN_GEOCODE_LOG_STORAGE_KEY, JSON.stringify(tail));
        } catch (_) {}
    }, 400);
}

function gnGeocodeUiLogAppend(level, message, opts) {
    if (typeof esAdmin !== 'function' || !esAdmin()) return;
    const o = opts && typeof opts === 'object' ? opts : {};
    const lv = level === 'warn' || level === 'error' || level === 'info' ? level : 'info';
    const text = String(message || '').trim() || '—';
    const line = { t: Date.now(), ts: _gnGeocodeLogTs(), level: lv, text };
    _gnGeocodeLogLines.push(line);
    if (_gnGeocodeLogLines.length > GN_GEOCODE_LOG_MAX_LINES) {
        _gnGeocodeLogLines.splice(0, _gnGeocodeLogLines.length - GN_GEOCODE_LOG_MAX_LINES);
    }
    const body = document.getElementById('gn-geocode-log-body');
    if (body) {
        const row = document.createElement('div');
        row.className = `gn-geocode-log-line gn-geocode-log-line--${lv}`;
        row.setAttribute('role', 'listitem');
        row.textContent = `[${line.ts}] [${lv.toUpperCase()}] ${text}`;
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
    }
    if (o.openPanel) gnGeocodeAdminLogOpenPanel();
    if (lv === 'error' && typeof toast === 'function' && o.toast !== false) {
        const short = text.length > 160 ? `${text.slice(0, 157)}…` : text;
        toast(short, 'error', 9000);
    }
    if (lv === 'warn' && typeof toast === 'function' && o.toast === true) {
        toast(text.length > 180 ? `${text.slice(0, 177)}…` : text, 'warning', 7000);
    }
    _gnGeocodeLogPersistSoon();
}

function gnGeocodeUiLogClear() {
    _gnGeocodeLogLines = [];
    const body = document.getElementById('gn-geocode-log-body');
    if (body) body.innerHTML = '';
    try {
        sessionStorage.removeItem(GN_GEOCODE_LOG_STORAGE_KEY);
    } catch (_) {}
}

function gnGeocodeUiLogCopyAll() {
    const txt = _gnGeocodeLogLines.map((x) => `[${x.ts}] [${x.level}] ${x.text}`).join('\n');
    if (!txt.trim()) {
        if (typeof toast === 'function') toast('No hay líneas para copiar.', 'info');
        return;
    }
    const run = () => {
        if (typeof toast === 'function') toast('Registro copiado al portapapeles.', 'success');
    };
    if (window.AndroidDevice && typeof window.AndroidDevice.copyText === 'function') {
        try {
            window.AndroidDevice.copyText(txt);
            run();
            return;
        } catch (_) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(run).catch(() => {
            if (typeof toast === 'function') toast('No se pudo copiar (permiso del navegador).', 'warning');
        });
        return;
    }
    if (typeof toast === 'function') toast('Copiar no disponible en este entorno.', 'warning');
}

function gnGeocodeAdminLogOpenPanel() {
    const panel = document.getElementById('gn-geocode-log-panel');
    const fab = document.getElementById('gn-geocode-log-fab');
    if (!panel || !fab) return;
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    gnWaGeoOpsStartPoll();
}

function gnGeocodeAdminLogClosePanel() {
    const panel = document.getElementById('gn-geocode-log-panel');
    const fab = document.getElementById('gn-geocode-log-fab');
    if (!panel || !fab) return;
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    gnWaGeoOpsStopPoll();
}

function gnGeocodeAdminLogSyncDockVisibility() {
    const root = document.getElementById('gn-geocode-log-root');
    if (!root) return;
    const show = typeof esAdmin === 'function' && esAdmin() && !modoOffline;
    if (show) {
        root.hidden = false;
        gnGeocodeAdminLogBindDockOnce();
    } else {
        root.hidden = true;
        gnGeocodeAdminLogClosePanel();
    }
}

function gnGeocodeAdminLogBindDockOnce() {
    if (_gnGeocodeLogDockBound) return;
    _gnGeocodeLogDockBound = true;
    document.getElementById('gn-geocode-log-fab')?.addEventListener('click', () => {
        const panel = document.getElementById('gn-geocode-log-panel');
        if (!panel) return;
        if (panel.hidden) gnGeocodeAdminLogOpenPanel();
        else gnGeocodeAdminLogClosePanel();
    });
    document.getElementById('gn-geocode-log-collapse')?.addEventListener('click', gnGeocodeAdminLogClosePanel);
    document.getElementById('gn-geocode-log-clear')?.addEventListener('click', () => {
        gnGeocodeUiLogClear();
        if (typeof toast === 'function') toast('Registro de geocodificación vaciado.', 'info');
    });
    document.getElementById('gn-geocode-log-copy')?.addEventListener('click', gnGeocodeUiLogCopyAll);
    document.getElementById('gn-wa-geo-ops-refresh')?.addEventListener('click', () => gnWaGeoOpsRefresh(true));
    document.getElementById('gn-wa-geo-ops-pause')?.addEventListener('click', () => {
        _gnWaGeoOpsUserPaused = !_gnWaGeoOpsUserPaused;
        _gnWaGeoOpsSyncPauseButtonUi();
        if (!_gnWaGeoOpsUserPaused) gnWaGeoOpsRefresh(false);
    });
    _gnWaGeoOpsSyncPauseButtonUi();
    try {
        const raw = sessionStorage.getItem(GN_GEOCODE_LOG_STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : null;
        const body = document.getElementById('gn-geocode-log-body');
        if (Array.isArray(arr) && body && !body.childElementCount && arr.length) {
            for (const row of arr) {
                if (!row || !row.text) continue;
                const lv = row.level === 'warn' || row.level === 'error' ? row.level : 'info';
                const ts = row.ts != null ? String(row.ts) : _gnGeocodeLogTs();
                _gnGeocodeLogLines.push({ t: Date.now(), ts, level: lv, text: String(row.text) });
                const el = document.createElement('div');
                el.className = `gn-geocode-log-line gn-geocode-log-line--${lv}`;
                el.textContent = `[${ts}] [${lv.toUpperCase()}] ${String(row.text)}`;
                body.appendChild(el);
            }
            body.scrollTop = body.scrollHeight;
        }
    } catch (_) {}
}

/** Admin: inyecta en el dock el log de re-geocodificación guardado en servidor (WhatsApp o pedido sin pin). Una vez por sesión de navegador y pedido cuando hay `wgeo`. */
function gnGeocodePrecargarWhatsappRegeoLog(p) {
    if (typeof esAdmin !== 'function' || !esAdmin()) return;
    if (!p) return;
    const wa = String(p.orc || '').toLowerCase() === 'whatsapp';
    const sinPin = !coordsSonPinValidasMapaWgs84(p.la, p.ln);
    if (!wa && !sinPin) return;
    const w = p.wgeo;
    if (!w || typeof w !== 'object') {
        if (wa && sinPin) {
            try {
                const kw = `gn_nogeolog_warn_${p.id}`;
                if (sessionStorage.getItem(kw) === '1') return;
                sessionStorage.setItem(kw, '1');
                gnGeocodeAdminLogBindDockOnce();
                gnGeocodeUiLogStartSession(`Re-geocodificación servidor — pedido #${p.id}`);
                gnGeocodeUiLogAppend(
                    'warn',
                    'Aún no hay registro de re-geocodificación en el servidor (puede estar en curso). Volvé a abrir el pedido en unos segundos o usá Re-geocodificar.'
                );
                gnGeocodeUiLogEndSession();
                gnGeocodeAdminLogOpenPanel();
            } catch (_) {}
        }
        return;
    }
    const key = `gn_wa_geolog_done_${p.id}`;
    try {
        if (sessionStorage.getItem(key) === '1') return;
        sessionStorage.setItem(key, '1');
    } catch (_) {}
    gnGeocodeAdminLogBindDockOnce();
    gnGeocodeUiLogStartSession(
        `Re-geocodificación en servidor — pedido #${p.id}${wa ? ' (WhatsApp)' : ' (sin pin)'}`
    );
    if (w.at) gnGeocodeUiLogAppend('info', `Instante: ${w.at}`);
    if (w.pipeline) gnGeocodeUiLogAppend('info', `Pipeline: ${String(w.pipeline)}`);
    gnGeocodeUiLogAppend(
        'info',
        `Resumen servidor: ${w.success ? 'coords OK' : 'sin coords'} · fuente: ${
            w.fuente_final != null ? String(w.fuente_final) : w.fuente != null ? String(w.fuente) : '—'
        }`
    );
    if (w.mensaje) gnGeocodeUiLogAppend(w.success ? 'info' : 'warn', String(w.mensaje));
    const lines = Array.isArray(w.log) ? w.log : [];
    for (const line of lines.slice(0, 150)) {
        gnGeocodeUiLogAppend('info', String(line));
    }
    const errs = Array.isArray(w.errores) ? w.errores : [];
    for (const e of errs.slice(0, 30)) {
        gnGeocodeUiLogAppend('warn', typeof e === 'object' ? JSON.stringify(e) : String(e));
    }
    const pinOk = w.pin_ok === true || (w.success && coordsSonPinValidasMapaWgs84(w.lat, w.lng));
    if (pinOk && Number.isFinite(Number(w.lat)) && Number.isFinite(Number(w.lng))) {
        gnGeocodeUiLogAppend(
            'info',
            `Pin (servidor): SÍ (${Number(w.lat).toFixed(5)}, ${Number(w.lng).toFixed(5)})`
        );
    } else {
        gnGeocodeUiLogAppend(
            'warn',
            'Pin (servidor): NO — revisá domicilio o usá Re-geocodificar en el detalle.'
        );
    }
    gnGeocodeUiLogEndSession();
    gnGeocodeAdminLogOpenPanel();
}

if (typeof window !== 'undefined') {
    window.etiquetaModoUbicPedido = etiquetaModoUbicPedido;
    window.gnGeocodeUiLogAppend = gnGeocodeUiLogAppend;
    window.gnGeocodeUiLogStartSession = gnGeocodeUiLogStartSession;
    window.gnGeocodeUiLogEndSession = gnGeocodeUiLogEndSession;
    window.gnGeocodeUiLogClear = gnGeocodeUiLogClear;
    window.gnGeocodeUiLogCopyAll = gnGeocodeUiLogCopyAll;
    window.gnGeocodeAdminLogSyncDockVisibility = gnGeocodeAdminLogSyncDockVisibility;
    window.gnGeocodeAdminLogOpenPanel = gnGeocodeAdminLogOpenPanel;
    window.gnGeocodeAdminLogClosePanel = gnGeocodeAdminLogClosePanel;
    window.coordsSonPinValidasMapaWgs84 = coordsSonPinValidasMapaWgs84;
    window.coordsEfectivasPedidoMapa = coordsEfectivasPedidoMapa;
    window.nominatimUiSearchUrlFromTexto = nominatimUiSearchUrlFromTexto;
}

/** Campos de Nominatim donde suele aparecer la localidad declarada por el cliente. */
function _nominatimCamposLocalidad(addr) {
    if (!addr || typeof addr !== 'object') return [];
    const keys = [
        'city',
        'town',
        'village',
        'hamlet',
        'municipality',
        'city_district',
        'suburb',
        'neighbourhood',
        'county',
    ];
    const out = [];
    for (const k of keys) {
        const v = addr[k];
        if (v != null && String(v).trim()) out.push(String(v).trim());
    }
    return out;
}

function _nominatimResultadoCoincideLocalidad(r, locPedido) {
    const want = _normGeoTxt(locPedido);
    if (!want) return true;
    const dn = _normGeoTxt(r.display_name || '');
    if (dn.includes(want)) return true;
    const addr = r && r.address ? r.address : {};
    const fields = _nominatimCamposLocalidad(addr);
    for (const f of fields) {
        const nf = _normGeoTxt(f);
        if (!nf) continue;
        if (nf === want || nf.includes(want) || want.includes(nf)) return true;
    }
    return false;
}

function _filtrarNominatimPorLocalidad(results, locPedido) {
    const arr = Array.isArray(results) ? results : [];
    return arr.filter((r) => _nominatimResultadoCoincideLocalidad(r, locPedido));
}

/** Cola global: una búsqueda proxy a la vez + pausa entre fin de una y la siguiente (política OSM ~1 req/s). */
const _NOMINATIM_PROXY_MIN_GAP_MS = 1800;
let _nominatimSearchQueue = Promise.resolve();
let _nominatimSearchLastEnd = 0;

/** Caché en memoria: misma consulta no golpea el proxy durante 5 min tras un OK. */
const _NOMINATIM_CLIENT_CACHE_MS = 5 * 60 * 1000;
const _nominatimClientSearchCache = new Map();

function _nominatimSearchCacheKey(merged) {
    const o = merged && typeof merged === 'object' ? merged : {};
    const keys = Object.keys(o).sort();
    const norm = {};
    for (const k of keys) {
        const v = o[k];
        if (v == null) continue;
        const s = String(v).trim();
        if (!s) continue;
        norm[String(k).toLowerCase()] = s;
    }
    return JSON.stringify(norm);
}

function _nominatimSearchEnqueue(run) {
    _nominatimSearchQueue = _nominatimSearchQueue.then(async () => {
        const wait = _nominatimSearchLastEnd + _NOMINATIM_PROXY_MIN_GAP_MS - Date.now();
        if (wait > 0) {
            await new Promise((r) => setTimeout(r, wait));
        }
        try {
            return await run();
        } finally {
            _nominatimSearchLastEnd = Date.now();
        }
    });
    return _nominatimSearchQueue;
}

/** Nominatim solo desde la API Node (GitHub Pages / navegador: CORS bloquea openstreetmap.org). */
async function _nominatimFetchSearch(params) {
    return _nominatimSearchEnqueue(async () => {
        const merged = params && typeof params === 'object' ? { ...params } : {};
        const ctx = String(merged.q || merged.street || '').trim() || '(sin q/street)';
        const cacheKey = _nominatimSearchCacheKey(merged);
        const now = Date.now();
        const mem = _nominatimClientSearchCache.get(cacheKey);
        if (mem && now - mem.at < _NOMINATIM_CLIENT_CACHE_MS && Array.isArray(mem.results)) {
            if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
                gnGeocodeUiLogAppend(
                    'info',
                    `Caché en memoria (~5 min): se reutilizan resultados sin nueva llamada al proxy. ${ctx.slice(0, 100)}${ctx.length > 100 ? '…' : ''}`
                );
            }
            return mem.results;
        }
        const backoffs = [1500, 4000, 9000, 16000, 22000];
        const maxAttempts = 5;
        try {
            if (modoOffline || typeof fetch !== 'function') {
                if (typeof esAdmin === 'function' && esAdmin()) {
                    gnGeocodeUiLogAppend(
                        'warn',
                        'Sin conexión (modo offline o sin fetch): no se puede consultar el mapa. Activá Internet o desactivá modo offline.',
                        { openPanel: gnGeocodeUiLogIsActive() }
                    );
                }
                return [];
            }
            await asegurarJwtApiRest();
            const token = getApiToken();
            if (!token) {
                if (typeof esAdmin === 'function' && esAdmin()) {
                    gnGeocodeUiLogAppend(
                        'error',
                        'Sin token de API para geocodificar. Cerrá sesión y volvé a entrar; si usás solo GitHub Pages, comprobá que el login haya obtenido JWT.',
                        { openPanel: true }
                    );
                }
                return [];
            }
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive() && attempt === 0) {
                    gnGeocodeUiLogAppend('info', `Consulta al proxy de mapas: ${ctx.slice(0, 140)}${ctx.length > 140 ? '…' : ''}`);
                }
                const r = await fetch(apiUrl('/api/geocode/nominatim/search'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ params: merged }),
                });
                const rateLimited = r.status === 503 || r.status === 429;
                if (r.ok) {
                    const j = await r.json().catch(() => ({}));
                    const out = Array.isArray(j.results) ? j.results : [];
                    _nominatimClientSearchCache.set(cacheKey, { at: Date.now(), results: out });
                    if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
                        if (out.length) {
                            const top = out[0];
                            const dn =
                                top && top.display_name != null
                                    ? String(top.display_name).slice(0, 140)
                                    : '(sin nombre en resultado)';
                            const fullDn = top && top.display_name != null ? String(top.display_name) : '';
                            gnGeocodeUiLogAppend(
                                'info',
                                `Respuesta OK: ${out.length} resultado(s). Primer candidato: ${dn}${fullDn.length > 140 ? '…' : ''}`
                            );
                        } else {
                            gnGeocodeUiLogAppend(
                                'warn',
                                'El servidor respondió bien pero sin coincidencias para esta búsqueda. Revisá calle, número y localidad en el pedido.'
                            );
                        }
                    }
                    return out;
                }
                if (rateLimited && attempt < maxAttempts - 1) {
                    console.info(
                        '[geocode-proxy] search HTTP',
                        r.status,
                        'reintento',
                        attempt + 1,
                        '/',
                        maxAttempts - 1,
                        'espera',
                        backoffs[attempt],
                        'ms',
                        ctx
                    );
                    if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
                        gnGeocodeUiLogAppend(
                            'info',
                            `Servicio de mapas ocupado (código ${r.status}). Reintento ${attempt + 1}/${maxAttempts - 1} tras ${Math.round(
                                backoffs[attempt] / 1000
                            )} s (límite del proveedor OSM).`
                        );
                    }
                    await new Promise((res) => setTimeout(res, backoffs[attempt]));
                    continue;
                }
                if (rateLimited) {
                    console.warn('[geocode-proxy] search agotó reintentos (503/429) para:', ctx);
                    if (typeof esAdmin === 'function' && esAdmin()) {
                        gnGeocodeUiLogAppend(
                            'error',
                            'El mapa no respondió a tiempo (503 o 429 tras reintentos). Esperá unos minutos y reintentá; si sigue igual, verificá que la API en Render esté activa.',
                            { openPanel: true }
                        );
                    }
                    return [];
                }
                console.warn('[geocode-proxy] search HTTP', r.status, '—', ctx);
                if (typeof esAdmin === 'function' && esAdmin()) {
                    if (r.status === 401 || r.status === 403) {
                        gnGeocodeUiLogAppend(
                            'error',
                            `Acceso denegado (${r.status}) al proxy de mapas: sesión o permisos. Cerrá sesión y volvé a entrar con usuario administrador.`,
                            { openPanel: true }
                        );
                    } else if (r.status >= 500) {
                        gnGeocodeUiLogAppend(
                            'error',
                            `Error del servidor (${r.status}) al geocodificar. Revisá el estado de la API (Render) o los logs del backend.`,
                            { openPanel: true }
                        );
                    } else {
                        gnGeocodeUiLogAppend(
                            'warn',
                            `Respuesta HTTP ${r.status} al buscar en el mapa. Revisá datos del pedido o probá más tarde.`,
                            { openPanel: gnGeocodeUiLogIsActive() }
                        );
                    }
                }
                return [];
            }
            return [];
        } catch (e) {
            console.warn('[geocode-proxy] search excepción', e && e.message ? e.message : e, ctx);
            if (typeof esAdmin === 'function' && esAdmin()) {
                const em = e && e.message ? String(e.message) : String(e);
                const low = em.toLowerCase();
                const isAbort = low.includes('abort') || (e && e.name === 'AbortError');
                gnGeocodeUiLogAppend(
                    'error',
                    isAbort
                        ? 'La búsqueda de mapa se cortó por tiempo o cancelación. Probá de nuevo con buena conexión.'
                        : `No se pudo contactar a la API (red o navegador): ${em}. Comprobá conexión y URL de la API.`,
                    { openPanel: true }
                );
            }
            return [];
        }
    });
}

/** viewbox = min_lon, max_lat, max_lon, min_lat (Nominatim). */
async function _nominatimViewboxLocalidad(loc) {
    const arr = await _nominatimFetchSearch({
        q: `${loc}, Argentina`,
        countrycodes: 'ar',
        limit: '2',
    });
    const hit = arr[0];
    if (!hit || !hit.boundingbox || hit.boundingbox.length < 4) return null;
    const [south, north, west, east] = hit.boundingbox.map((x) => Number(x));
    if (![south, north, west, east].every((n) => Number.isFinite(n))) return null;
    return `${west},${north},${east},${south}`;
}

function _nominatimMetaFromHit(r) {
    if (!r) return {};
    const addr = r.address && typeof r.address === 'object' ? r.address : {};
    return {
        display_name: String(r.display_name || '').trim(),
        type: r.type != null ? String(r.type) : '',
        house_number: addr.house_number != null ? String(addr.house_number).trim() : '',
    };
}

function _parseHouseNumberNominatim(addr) {
    const raw = addr && addr.house_number != null ? String(addr.house_number).trim() : '';
    if (!raw) return null;
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

function _nominatimTipoRankPedido(r) {
    const t = String((r && r.type) || '').toLowerCase();
    if (t === 'house') return 0;
    if (t === 'building' || t === 'apartments' || t === 'residential') return 1;
    return 2;
}

function _elegirMejorResultadoNominatimPorPuerta(results, numeroPuertaStr) {
    const arr = Array.isArray(results) ? results : [];
    if (!arr.length) return null;
    const target = parseInt(String(numeroPuertaStr || '').replace(/\D/g, ''), 10);
    const rows = [];
    for (const r of arr) {
        const la = Number(r.lat);
        const lo = Number(r.lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
        const hn = _parseHouseNumberNominatim(r.address || {});
        const typeR = _nominatimTipoRankPedido(r);
        let hnTier = 2;
        let hnDist = 9999;
        if (Number.isFinite(target)) {
            if (hn === target) hnTier = 0;
            else if (hn != null) {
                hnTier = 1;
                hnDist = Math.abs(hn - target);
            }
        } else if (hn != null) hnTier = 1;
        const sortKey = typeR * 10000 + hnTier * 1000 + hnDist;
        rows.push({ la, lo, hn, r, sortKey });
    }
    if (!rows.length) {
        const r0 = arr[0];
        const la = Number(r0.lat);
        const lo = Number(r0.lon);
        return Number.isFinite(la) && Number.isFinite(lo)
            ? {
                  lat: la,
                  lng: lo,
                  src: 'aprox',
                  nominatimMeta: _nominatimMetaFromHit(r0),
                  nominatimClass: r0.class != null ? String(r0.class) : '',
              }
            : null;
    }
    rows.sort((a, b) => a.sortKey - b.sortKey);
    const best = rows[0];
    let src = 'aprox';
    if (Number.isFinite(target) && best.hn === target) src = 'exacta';
    else if (Number.isFinite(target) && best.hn != null) src = 'vecino';
    else if (_nominatimTipoRankPedido(best.r) === 0) src = 'casa';
    else if (!Number.isFinite(target)) src = 'calle';
    return {
        lat: best.la,
        lng: best.lo,
        src,
        nominatimMeta: _nominatimMetaFromHit(best.r),
        nominatimClass: best.r.class != null ? String(best.r.class) : '',
    };
}

/** Línea final obligatoria del flujo de georreferenciación (sesión de log admin activa). */
function _gnGeocodeRegistrarResultadoPinPedido(p, hit, motivoNoPin) {
    if (typeof esAdmin !== 'function' || !esAdmin() || !gnGeocodeUiLogIsActive()) return;
    const id = p && p.id != null ? `#${p.id}` : '(sin id)';
    const lat = hit && hit.lat != null ? Number(hit.lat) : NaN;
    const lng = hit && hit.lng != null ? Number(hit.lng) : NaN;
    if (hit && coordsSonPinValidasMapaWgs84(lat, lng)) {
        const m = hit.nominatimMeta || {};
        const provIso = hit.src === 'ciudad_centro' ? ' · aprox. centro de localidad (no domicilio exacto en puerta)' : '';
        gnGeocodeUiLogAppend(
            'info',
            `Resultado elegido: type=${m.type || '—'}, class=${hit.nominatimClass != null ? String(hit.nominatimClass) : '—'}, house_number(OSM)=${m.house_number || '—'}.`
        );
        if (m.display_name) {
            const dn = m.display_name;
            gnGeocodeUiLogAppend('info', `display_name: ${dn.length > 200 ? `${dn.slice(0, 197)}…` : dn}`);
        }
        if (hit.qUsed) {
            const qu = String(hit.qUsed);
            gnGeocodeUiLogAppend('info', `Consulta / params que orientaron el hit: ${qu.length > 200 ? `${qu.slice(0, 197)}…` : qu}`);
        }
        const linkQ = (hit.qNominatimUi != null && String(hit.qNominatimUi).trim()) || (hit.qUsed != null && String(hit.qUsed).trim()) || '';
        const urlDemo = typeof nominatimUiSearchUrlFromTexto === 'function' ? nominatimUiSearchUrlFromTexto(linkQ) : '';
        if (urlDemo) gnGeocodeUiLogAppend('info', `Abrir en Nominatim (referencia): ${urlDemo}`);
        gnGeocodeUiLogAppend('info', `Pin: SÍ ${id} → (${lat.toFixed(6)}, ${lng.toFixed(6)}) [${hit.src || '—'}]${provIso}.`);
    } else {
        const mot = motivoNoPin || 'sin coordenadas válidas para el mapa';
        gnGeocodeUiLogAppend('warn', `Pin: NO ${id} — ${mot}.`);
    }
}

async function nominatimGeocodeDomicilioPedido(p) {
    const dom = domicilioParaGeocodePedido(p);
    if (!dom) {
        if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend(
                'warn',
                `Pin: NO pedido #${p && p.id != null ? p.id : '?'} — sin domicilio estructurado (calle + localidad o texto cdir con patrón reconocible).`
            );
        }
        return null;
    }
    const adminSess = typeof esAdmin === 'function' && esAdmin();
    const startOwnUiSession = adminSess && !gnGeocodeUiLogIsActive();
    if (startOwnUiSession) {
        gnGeocodeUiLogStartSession(
            `Geocodificación Nominatim (domicilio) — pedido #${p && p.id != null ? p.id : '?'} · ${dom.calle || ''} / ${dom.loc || ''}`
        );
    }
    try {
        const calle = dom.calle;
        const loc = dom.loc;
        const num = (dom.num || '').trim();
        const streetLine = num ? `${num} ${calle}` : calle;
        let calleSinTilde = calle;
        try {
            calleSinTilde = String(calle)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        } catch (_) {}

        if (adminSess && gnGeocodeUiLogIsActive()) {
            const prov = p && String(p.cpcia || '').trim() ? ` · provincia decl.="${String(p.cpcia).trim()}"` : '';
            const cp = p && String(p.ccp || '').trim() ? ` · CP="${String(p.ccp).trim()}"` : '';
            gnGeocodeUiLogAppend(
                'info',
                `Datos recibidos: calle="${calle}", número="${num || '—'}", localidad="${loc}"${prov}${cp}.`
            );
            gnGeocodeUiLogAppend(
                'info',
                'Estrategia: variantes con parámetro q (Nominatim “simple”), luego street+city+country, búsqueda con viewbox de la localidad, y último recurso centro de la localidad (aprox., no puerta exacta).'
            );
        }

        const intentar = async (lista, qUsedLabel, qNominatimUi) => {
            const fil = _filtrarNominatimPorLocalidad(lista, loc);
            const h = _elegirMejorResultadoNominatimPorPuerta(fil.length ? fil : [], num);
            if (!h) return null;
            const out = { ...h, qUsed: qUsedLabel };
            if (qNominatimUi) out.qNominatimUi = qNominatimUi;
            return out;
        };

        const baseSearch = { countrycodes: 'ar', limit: '25', addressdetails: '1' };
        const qList = [];
        const pushQ = (q) => {
            const s = String(q || '')
                .replace(/\s+/g, ' ')
                .trim();
            if (s.length >= 4 && !qList.includes(s)) qList.push(s);
        };
        if (num) {
            pushQ(`${calle} ${num}, ${loc}`);
            pushQ(`${calle} ${num}, ${loc}, Argentina`);
            if (calleSinTilde !== calle) pushQ(`${calleSinTilde} ${num}, ${loc}, Argentina`);
            pushQ(`${num} ${calle}, ${loc}, Argentina`);
            pushQ(`${streetLine}, ${loc}, Argentina`);
            pushQ(`${streetLine}, ${loc}`);
        } else {
            pushQ(`${calle}, ${loc}, Argentina`);
            pushQ(`${calle}, ${loc}`);
        }

        let qi = 0;
        for (const q of qList) {
            if (adminSess && gnGeocodeUiLogIsActive() && qi === 0) {
                gnGeocodeUiLogAppend(
                    'info',
                    `Primera consulta (param q, coherente con “simple search”): ${q.length > 160 ? `${q.slice(0, 157)}…` : q}`
                );
            }
            qi++;
            const raw = await _nominatimFetchSearch({ ...baseSearch, q });
            const hit = await intentar(raw, `q="${q}" (countrycodes=ar, limit)`, q);
            if (hit) {
                _gnGeocodeRegistrarResultadoPinPedido(p, hit, null);
                return hit;
            }
        }

        if (adminSess && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend(
                'info',
                `Búsqueda estructurada: street="${streetLine}", city="${loc}", country=Argentina (limit 15).`
            );
        }
        let raw = await _nominatimFetchSearch({
            street: streetLine,
            city: loc,
            country: 'Argentina',
            ...baseSearch,
            limit: '15',
        });
        const qUiStruct = `${streetLine}, ${loc}, Argentina`;
        let hit = await intentar(
            raw,
            `street=${JSON.stringify(streetLine)}, city=${JSON.stringify(loc)}, country=Argentina`,
            qUiStruct
        );
        if (hit) {
            _gnGeocodeRegistrarResultadoPinPedido(p, hit, null);
            return hit;
        }

        if (adminSess && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend('info', `Reintento estructurado: street="${calle}" (sin n° en street), city="${loc}".`);
        }
        raw = await _nominatimFetchSearch({
            street: calle,
            city: loc,
            country: 'Argentina',
            ...baseSearch,
            limit: '15',
        });
        const qUiStruct2 = `${calle}, ${loc}, Argentina`;
        hit = await intentar(raw, `street=${JSON.stringify(calle)}, city=${JSON.stringify(loc)}`, qUiStruct2);
        if (hit) {
            _gnGeocodeRegistrarResultadoPinPedido(p, hit, null);
            return hit;
        }

        const vb = await _nominatimViewboxLocalidad(loc);
        if (vb) {
            if (adminSess && gnGeocodeUiLogIsActive()) {
                gnGeocodeUiLogAppend('info', 'Viewbox de la localidad obtenido; búsquedas q acotadas (bounded=1).');
            }
            for (const q of qList) {
                raw = await _nominatimFetchSearch({
                    ...baseSearch,
                    q,
                    viewbox: vb,
                    bounded: '1',
                });
                const hitV = await intentar(raw, `q="${q}" + viewbox acotado + bounded=1`, q);
                if (hitV) {
                    _gnGeocodeRegistrarResultadoPinPedido(p, hitV, null);
                    return hitV;
                }
            }
        }

        if (num) {
            raw = await _nominatimFetchSearch({ ...baseSearch, q: `${calle}, ${loc}, Argentina` });
            hit = await intentar(
                raw,
                `q="${calle}, ${loc}, Argentina" (sin n° en calle, sólo q)`,
                `${calle}, ${loc}, Argentina`
            );
            if (hit) {
                _gnGeocodeRegistrarResultadoPinPedido(p, hit, null);
                return hit;
            }
        }

        if (adminSess && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend('info', `Último recurso: centro aproximado de localidad con q="${loc}, Argentina".`);
        }
        raw = await _nominatimFetchSearch({
            q: `${loc}, Argentina`,
            countrycodes: 'ar',
            limit: '5',
            addressdetails: '1',
        });
        if (raw && raw.length > 0) {
            const locLow = loc.toLowerCase();
            const cityHit =
                raw.find((h) => {
                    const n = String(h.display_name || '').toLowerCase();
                    return n.includes(locLow) && n.includes('argentina');
                }) || raw[0];
            if (cityHit) {
                const la = Number(cityHit.lat);
                const lo = Number(cityHit.lon);
                if (Number.isFinite(la) && Number.isFinite(lo)) {
                    const hitCentro = {
                        lat: la,
                        lng: lo,
                        src: 'ciudad_centro',
                        qUsed: `q="${loc}, Argentina" (centro localidad, aprox.)`,
                        qNominatimUi: `${loc}, Argentina`,
                        nominatimMeta: _nominatimMetaFromHit(cityHit),
                        nominatimClass: cityHit.class != null ? String(cityHit.class) : '',
                    };
                    if (adminSess && gnGeocodeUiLogIsActive()) {
                        gnGeocodeUiLogAppend(
                            'info',
                            `Se usa centro aproximado de "${loc}" (Nominatim sin puerta exacta en mapa).`
                        );
                    }
                    _gnGeocodeRegistrarResultadoPinPedido(p, hitCentro, null);
                    return hitCentro;
                }
            }
        }

        const noTok = typeof getApiToken === 'function' && !getApiToken();
        _gnGeocodeRegistrarResultadoPinPedido(
            p,
            null,
            noTok
                ? 'sin token JWT para el proxy de mapas (cerrá sesión y volvé a entrar como admin)'
                : 'sin resultados tras variantes q + street/city + viewbox; Nominatim vacío o sin coincidencia con la localidad indicada'
        );
        return null;
    } finally {
        if (startOwnUiSession) gnGeocodeUiLogEndSession();
    }
}

async function persistirCoordsGeocodePedidoPanel(pedidoId, la, ln) {
    if (!esAdmin() || !puedeEnviarApiRestPedidos()) return;
    if (!coordsSonPinValidasMapaWgs84(la, ln)) {
        if (typeof esAdmin === 'function' && esAdmin() && gnGeocodeUiLogIsActive()) {
            gnGeocodeUiLogAppend(
                'warn',
                `Pin: NO pedido #${pedidoId} — coordenadas inválidas, (0,0) o fuera de WGS84; no se envían al servidor (coords-geocode-panel).`
            );
        }
        return;
    }
    await asegurarJwtApiRest();
    const token = getApiToken();
    if (!token) return;
    try {
        const r = await fetch(
            apiUrl(`/api/pedidos/${encodeURIComponent(String(pedidoId))}/coords-geocode-panel`),
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ lat: la, lng: ln }),
            }
        );
        if (!r.ok) {
            let detail = `HTTP ${r.status}`;
            try {
                const j = await r.json().catch(() => ({}));
                if (j && (j.error || j.detail || j.mensaje)) {
                    detail += `: ${String(j.error || j.detail || j.mensaje)}`;
                }
            } catch (_) {}
            if (typeof esAdmin === 'function' && esAdmin()) {
                gnGeocodeUiLogAppend(
                    'error',
                    `No se guardaron coordenadas en el servidor para el pedido #${pedidoId}. ${detail}. Si es 401/403, renová sesión; si es 5xx, revisá la API.`,
                    { openPanel: true }
                );
            }
            return;
        }
        const row = await r.json().catch(() => null);
        if (!row || row.lat == null || row.lng == null) return;
        const nla = Number(row.lat);
        const nln = Number(row.lng);
        if (!Number.isFinite(nla) || !Number.isFinite(nln)) return;
        const idStr = String(pedidoId);
        const idx = app.p.findIndex((x) => String(x.id) === idStr);
        if (idx >= 0) {
            app.p[idx].la = nla;
            app.p[idx].ln = nln;
        }
        try {
            render();
            renderMk();
        } catch (_) {}
        try {
            refrescarDetalleSiAbiertoTrasSync();
        } catch (_) {}
        if (typeof esAdmin === 'function' && esAdmin()) {
            gnGeocodeUiLogAppend(
                'info',
                `Guardado en API (coords-geocode-panel): pedido #${pedidoId} → (${nla.toFixed(6)}, ${nln.toFixed(6)}); pin WGS84 válido para mapa/lista.`
            );
        }
    } catch (e) {
        if (typeof esAdmin === 'function' && esAdmin()) {
            gnGeocodeUiLogAppend(
                'error',
                `Error al guardar geocodificación del pedido #${pedidoId}: ${e && e.message ? e.message : e}`,
                { openPanel: true }
            );
        }
    }
}

/** Admin: corrección manual WGS84 (sobrescribe lat/lng en servidor). */
async function persistirCoordsManualPedidoPanel(pedidoId, la, ln) {
    if (!esAdmin() || !puedeEnviarApiRestPedidos()) return;
    await asegurarJwtApiRest();
    const token = getApiToken();
    if (!token) return;
    try {
        const r = await fetch(
            apiUrl(`/api/pedidos/${encodeURIComponent(String(pedidoId))}/coords-manual`),
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ lat: la, lng: ln }),
            }
        );
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
            toast(String(body.error || 'No se pudieron guardar las coordenadas'), 'error');
            return;
        }
        const row = body;
        if (!row || row.lat == null || row.lng == null) return;
        const nla = Number(row.lat);
        const nln = Number(row.lng);
        if (!Number.isFinite(nla) || !Number.isFinite(nln)) return;
        const idStr = String(pedidoId);
        const idx = app.p.findIndex((x) => String(x.id) === idStr);
        if (idx >= 0) {
            app.p[idx].la = nla;
            app.p[idx].ln = nln;
            if (row.descripcion != null) app.p[idx].de = String(row.descripcion);
        } else {
            try {
                const merged = norm(row);
                app.p.push(merged);
                offlinePedidosSave(app.p);
            } catch (_) {}
        }
        try {
            if (window._pedidoCoordsInferidas && window._pedidoCoordsInferidas[idStr]) {
                delete window._pedidoCoordsInferidas[idStr];
            }
        } catch (_) {}
        try {
            render();
            renderMk();
        } catch (_) {}
        try {
            refrescarDetalleSiAbiertoTrasSync();
        } catch (_) {}
        if (row._correccionDireccionGuardada) {
            toast(
                'Ubicación guardada. Los próximos reclamos en esta misma dirección usarán esta posición automáticamente.',
                'success'
            );
        } else {
            toast('Ubicación del pedido actualizada en el mapa.', 'success');
        }
    } catch (e) {
        toastError('coords-manual', e);
    }
}

async function enriquecerCoordsGeocodificadasPedidos() {
    if (modoOffline || typeof fetch !== 'function') return;
    if (!app.p || !app.p.length) return;
    const candidatos = (app.p || []).filter((p) => {
        if (Number.isFinite(p.la) && Number.isFinite(p.ln)) return false;
        const id = String(p.id);
        const prev = window._pedidoCoordsInferidas[id];
        if (prev && (prev.skip || (Number.isFinite(prev.la) && Number.isFinite(prev.ln)))) return false;
        return !!domicilioParaGeocodePedido(p);
    });
    const adminBatch = typeof esAdmin === 'function' && esAdmin() && candidatos.length > 0;
    if (adminBatch) {
        gnGeocodeUiLogStartSession(
            `Geocodificación automática en mapa: ${candidatos.length} pedido(s) sin coordenadas con domicilio cargado.`
        );
    }
    try {
        for (const p of candidatos) {
            try {
                if (adminBatch) {
                    gnGeocodeUiLogAppend('info', `Procesando pedido #${p.id}…`);
                }
                const hit = await nominatimGeocodeDomicilioPedido(p);
                const id = String(p.id);
                if (hit && coordsSonPinValidasMapaWgs84(hit.lat, hit.lng)) {
                    window._pedidoCoordsInferidas[id] = { la: hit.lat, ln: hit.lng, src: hit.src || 'aprox' };
                    if (esAdmin()) {
                        void persistirCoordsGeocodePedidoPanel(p.id, hit.lat, hit.lng);
                    }
                    if (adminBatch) {
                        gnGeocodeUiLogAppend(
                            'info',
                            `Pedido #${p.id}: coordenadas aproximadas (${hit.src || 'aprox'}); persistencia disparada si aplica.`
                        );
                    }
                } else if (hit) {
                    window._pedidoCoordsInferidas[id] = { skip: true };
                    if (adminBatch) {
                        gnGeocodeUiLogAppend(
                            'warn',
                            `Pedido #${p.id}: resultado con lat/lng no válidos para mapa (NaN, 0,0 o fuera de rango); no se persiste.`
                        );
                    }
                } else {
                    window._pedidoCoordsInferidas[id] = { skip: true };
                    if (adminBatch) {
                        gnGeocodeUiLogAppend('warn', `Pedido #${p.id}: sin resultado de mapa para el domicilio cargado.`);
                    }
                }
                try {
                    renderMk();
                } catch (_) {}
            } catch (e) {
                console.warn('[geocode-pedido]', p.id, e && e.message ? e.message : e);
                if (adminBatch) {
                    gnGeocodeUiLogAppend(
                        'error',
                        `Pedido #${p.id}: error inesperado — ${e && e.message ? e.message : e}`
                    );
                }
            }
        }
    } finally {
        if (adminBatch) gnGeocodeUiLogEndSession();
    }
}

function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toR = x => x * Math.PI / 180;
    const dLat = toR(lat2 - lat1);
    const dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Fechas en informes / tablas sin texto tipo GMT-0300 */
function fmtInformeFecha(v) {
    if (v == null || v === '') return '';
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    try {
        return new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).format(d);
    } catch (_) {
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
}

let _modoFijarUbicacionAdmin = false;
let _marcadoresTecnicosPrincipal = [];

function _escOpt(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

const WEB_MAP_FILTRO_TIPOS_KEY = 'pmg_map_filtro_tipos_json';

function leerMapFiltroTiposSet() {
    const tipos = tiposReclamoSeleccionables();
    let sel = null;
    try {
        const raw = localStorage.getItem(WEB_MAP_FILTRO_TIPOS_KEY);
        if (raw == null) return null;
        sel = JSON.parse(raw);
    } catch (_) {}
    if (!Array.isArray(sel)) return null;
    if (sel.length === 0) return new Set();
    const ok = new Set(tipos);
    const filtered = sel.filter((t) => ok.has(t));
    return filtered.length ? new Set(filtered) : new Set();
}

function pedidoPasaFiltroTipoReclamoMapa(p) {
    const allowed = leerMapFiltroTiposSet();
    if (allowed == null) return true;
    if (allowed.size === 0) return false;
    const tt = String(p?.tt || '').trim();
    if (!tt) return allowed.has('__sin_tipo__');
    return allowed.has(tt);
}

function syncMapaFiltroTiposRebuild() {
    const host = document.getElementById('mapa-filtro-tipo-body');
    if (!host) return;
    const tipos = tiposReclamoSeleccionables();
    const prev = leerMapFiltroTiposSet();
    const allMasterChecked =
        tipos.length === 0 ? true : prev == null || (prev.size > 0 && prev.size === tipos.length);
    const lines = tipos.map((t) => {
        const id = 'mapa-flt-tt-' + t.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
        const checked = prev == null || prev.has(t);
        return `<label class="mapa-flt-tipo-row" for="${id}"><input type="checkbox" id="${id}" data-tt="${_escOpt(t)}" ${checked ? 'checked' : ''} onchange="onMapaFiltroTipoTrabajoChange()"><span class="mapa-flt-tipo-lbl">${_escOpt(t)}</span></label>`;
    });
    host.innerHTML =
        `<p class="mapa-filtro-tipo-hint">Mostrar en el mapa solo los tipos marcados (según el rubro actual). <b>Todos los tipos</b> marca o desmarca la lista completa.</p>` +
        `<label class="mapa-flt-tipo-row mapa-flt-tipo-row-all" for="mapa-flt-tt-all"><input type="checkbox" id="mapa-flt-tt-all" ${allMasterChecked ? 'checked' : ''} onchange="onMapaFiltroTipoTrabajoChange(true)"><span class="mapa-flt-tipo-lbl">Todos los tipos</span></label>` +
        lines.join('');
    onMapaFiltroTipoTrabajoChange();
}

function onMapaFiltroTipoTrabajoChange(allMode) {
    const host = document.getElementById('mapa-filtro-tipo-body');
    if (!host) return;
    const all = document.getElementById('mapa-flt-tt-all');
    const boxes = [...host.querySelectorAll('input[type=checkbox][data-tt]')];
    if (allMode && all) {
        if (all.checked) {
            boxes.forEach((c) => {
                c.checked = true;
            });
        } else {
            boxes.forEach((c) => {
                c.checked = false;
            });
        }
    }
    const tipos = tiposReclamoSeleccionables();
    let picked = boxes.filter((c) => c.checked).map((c) => c.getAttribute('data-tt') || '');
    if (all) {
        all.checked = picked.length === tipos.length && tipos.length > 0;
    }
    try {
        if (picked.length === tipos.length && tipos.length > 0) localStorage.removeItem(WEB_MAP_FILTRO_TIPOS_KEY);
        else localStorage.setItem(WEB_MAP_FILTRO_TIPOS_KEY, JSON.stringify(picked));
    } catch (_) {}
    try {
        onMapaFiltroChange();
    } catch (_) {}
}
window.onMapaFiltroTipoTrabajoChange = onMapaFiltroTipoTrabajoChange;

function pedidosParaMarcadoresMapa() {
    const chk = (id) => {
        const el = document.getElementById(id);
        return !el || el.checked;
    };
    const anyChecked = ['mapa-flt-pendiente', 'mapa-flt-asignado', 'mapa-flt-ejecucion', 'mapa-flt-cerrado']
        .some(id => document.getElementById(id)?.checked);
    const allowEstado = (es) => {
        if (!anyChecked) return true;
        if (es === 'Pendiente') return chk('mapa-flt-pendiente');
        if (es === 'Asignado') return chk('mapa-flt-asignado');
        if (es === 'En ejecución') return chk('mapa-flt-ejecucion');
        if (es === 'Cerrado' || es === 'Derivado externo') return chk('mapa-flt-cerrado');
        return true;
    };
    const selU = document.getElementById('mapa-filtro-usuario');
    const selA = document.getElementById('mapa-filtro-asignado');
    const uidF = selU?.value || '';
    const asigF = selA?.value || '';
    return app.p.filter(p => {
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
        if (!allowEstado(p.es || '')) return false;
        if (uidF) {
            const cre = p.uc != null ? String(p.uc) : (p.ui != null ? String(p.ui) : '');
            if (cre !== uidF) return false;
        }
        if (asigF === '__sin__') {
            if (p.tai != null) return false;
        } else if (asigF) {
            if (String(p.tai ?? '') !== asigF) return false;
        }
        const prioOk = (() => {
            const chkP = (id) => {
                const el = document.getElementById(id);
                return !el || el.checked;
            };
            if ((p.es || '') === 'Cerrado' || (p.es || '') === 'Derivado externo') return chkP('mapa-flt-prio-cerrado');
            const mapPr = { 'Crítica': 'mapa-flt-prio-critica', 'Alta': 'mapa-flt-prio-alta', 'Media': 'mapa-flt-prio-media', 'Baja': 'mapa-flt-prio-baja' };
            return chkP(mapPr[p.pr] || 'mapa-flt-prio-baja');
        })();
        if (!prioOk) return false;
        if (!pedidoVisibleSegunLineaNegocio(p)) return false;
        if (!pedidoVisibleSegunRubro(p)) return false;
        if (pedidoEsDerivadoFuera(p) && !adminMuestraPedidosDerivadosFuera()) return false;
        if (!pedidoPasaFiltroTipoReclamoMapa(p)) return false;
        return true;
    });
}

function llenarSelectsFiltroMapa() {
    const selU = document.getElementById('mapa-filtro-usuario');
    const selA = document.getElementById('mapa-filtro-asignado');
    if (!selU || !selA) return;
    const prevU = selU.value;
    const prevA = selA.value;
    selU.innerHTML = '<option value="">Todos los creadores</option>';
    selA.innerHTML = '<option value="">Todos los asignados</option><option value="__sin__">Sin asignar</option>';
    const nombrePorId = new Map();
    (app.usuariosCache || []).forEach(u => nombrePorId.set(String(u.id), u.nombre || u.email || ('#' + u.id)));
    const seenCre = new Set();
    pedidosVisiblesEnUI().forEach(p => {
        const id = p.uc != null ? p.uc : p.ui;
        if (id == null || seenCre.has(String(id))) return;
        seenCre.add(String(id));
        const name = nombrePorId.get(String(id)) || ('Usuario #' + id);
        selU.insertAdjacentHTML('beforeend', `<option value="${id}">${_escOpt(name)}</option>`);
    });
    if (esAdmin()) {
        (app.usuariosCache || []).forEach(u => {
            if (seenCre.has(String(u.id))) return;
            selU.insertAdjacentHTML('beforeend', `<option value="${u.id}">${_escOpt(u.nombre || u.email)}</option>`);
        });
    }
    const seenTec = new Set();
    (app.usuariosCache || []).forEach(u => {
        const r = String(u.rol || '').toLowerCase();
        if (r !== 'tecnico' && r !== 'supervisor') return;
        selA.insertAdjacentHTML('beforeend', `<option value="${u.id}">${_escOpt((u.nombre || '') + ' (' + u.rol + ')')}</option>`);
        seenTec.add(String(u.id));
    });
    pedidosVisiblesEnUI().forEach(p => {
        if (p.tai == null) return;
        const sid = String(p.tai);
        if (seenTec.has(sid)) return;
        seenTec.add(sid);
        const name = nombrePorId.get(sid) || ('#' + sid);
        selA.insertAdjacentHTML('beforeend', `<option value="${p.tai}">${_escOpt(name)}</option>`);
    });
    if ([...selU.options].some(o => o.value === prevU)) selU.value = prevU;
    if ([...selA.options].some(o => o.value === prevA)) selA.value = prevA;
}

function onMapaFiltroChange() {
    try {
        renderMk();
    } catch (_) {}
}

const MAPA_PRIO_CHK_IDS = ['mapa-flt-prio-critica', 'mapa-flt-prio-alta', 'mapa-flt-prio-media', 'mapa-flt-prio-baja', 'mapa-flt-prio-cerrado'];

function onMapaFiltroPrioridadChange() {
    MAPA_PRIO_CHK_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        try { localStorage.setItem('pmg_' + id, el.checked ? '1' : '0'); } catch (_) {}
    });
    try { onMapaFiltroChange(); } catch (_) {}
}
window.onMapaFiltroPrioridadChange = onMapaFiltroPrioridadChange;

function syncMapaPrioFiltrosFromStorage() {
    MAPA_PRIO_CHK_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        try {
            const v = localStorage.getItem('pmg_' + id);
            if (v === '0') el.checked = false;
            else if (v === '1') el.checked = true;
        } catch (_) {}
    });
}

/** Android WebView: abre el panel de filtros (misma paleta que admin web). */
function abrirAndroidFiltrosMapaRapidos() {
    try {
        toggleMapaCardSlideoff('mapa-card-filtros', false);
    } catch (_) {}
    try {
        onMapaFiltroChange();
    } catch (_) {}
}
window.abrirAndroidFiltrosMapaRapidos = abrirAndroidFiltrosMapaRapidos;

function resetMapaFiltros() {
    ['mapa-flt-pendiente', 'mapa-flt-asignado', 'mapa-flt-ejecucion', 'mapa-flt-cerrado'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
    });
    MAPA_PRIO_CHK_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
        try { localStorage.removeItem('pmg_' + id); } catch (_) {}
    });
    const u = document.getElementById('mapa-filtro-usuario');
    const a = document.getElementById('mapa-filtro-asignado');
    if (u) u.value = '';
    if (a) a.value = '';
    onMapaFiltroChange();
}

function onToggleMapaLabelsNp() {
    try {
        localStorage.setItem('pmg_map_labels_np', document.getElementById('mapa-chk-label-np')?.checked ? '1' : '0');
    } catch (_) {}
    try { renderMk(); } catch (_) {}
}
window.onToggleMapaLabelsNp = onToggleMapaLabelsNp;

function syncMapaLabelsNpCheckbox() {
    const el = document.getElementById('mapa-chk-label-np');
    if (!el) return;
    try { el.checked = localStorage.getItem('pmg_map_labels_np') === '1'; } catch (_) {}
}

function onToggleAndroidFiltrosMapa() {
    const chk = document.getElementById('chk-android-filtros-av');
    if (!chk) return;
    const card = document.getElementById('mapa-card-filtros');
    const cardTipo = document.getElementById('mapa-card-filtro-tipo');
    const cardCol = document.getElementById('mapa-card-colores');
    if (!card) return;
    const on = !!chk?.checked;
    try {
        localStorage.setItem('pmg_show_map_filters', on ? '1' : '0');
    } catch (_) {}
    card.style.display = on ? 'block' : 'none';
    if (cardTipo) cardTipo.style.display = on ? 'block' : 'none';
    if (cardCol) cardCol.style.display = on ? 'block' : 'none';
    if (!on) {
        document.getElementById('map-tab-filtros')?.classList.remove('visible');
        document.getElementById('map-tab-filtro-tipo')?.classList.remove('visible');
        document.getElementById('map-tab-colores')?.classList.remove('visible');
        document.getElementById('map-tab-dash')?.classList.remove('visible');
    }
}

function onAndroidPedidosScopeChange() {
    const v = document.getElementById('sel-android-pedidos-scope')?.value;
    try {
        localStorage.setItem('pmg_tecnico_ver_todos', v === 'todos' ? '1' : '0');
    } catch (_) {}
    const wt = document.getElementById('toggle-ver-todos-pedidos');
    if (wt) wt.checked = v === 'todos';
    cargarPedidos();
}

function setBp2PanelHidden(hidden) {
    const bp2 = document.getElementById('bp2');
    const fab = document.getElementById('fab-show-pedidos');
    if (bp2) bp2.classList.toggle('bp2-fullhide', !!hidden);
    if (fab) fab.classList.toggle('visible', !!hidden);
    try { localStorage.setItem('pmg_bp2_hidden', hidden ? '1' : '0'); } catch (_) {}
    if (hidden) queueLazyInitMap();
}

function mapTabIdForCard(cardId) {
    if (cardId === 'mapa-card-filtros') return 'map-tab-filtros';
    if (cardId === 'mapa-card-filtro-tipo') return 'map-tab-filtro-tipo';
    if (cardId === 'mapa-card-colores') return 'map-tab-colores';
    return 'map-tab-dash';
}

function toggleMapaCardSlideoff(cardId, hide) {
    const el = document.getElementById(cardId);
    const tab = document.getElementById(mapTabIdForCard(cardId));
    if (!el) return;
    if (hide === undefined) hide = !el.classList.contains('moui-card-slideoff');
    el.classList.toggle('moui-card-slideoff', !!hide);
    if (tab) tab.classList.toggle('visible', !!hide);
    try {
        if (cardId === 'mapa-card-filtros') localStorage.setItem('pmg_slideoff_filtros', hide ? '1' : '0');
        if (cardId === 'mapa-card-filtro-tipo') localStorage.setItem('pmg_slideoff_filtro_tipo', hide ? '1' : '0');
        if (cardId === 'mapa-card-colores') localStorage.setItem('pmg_slideoff_colores', hide ? '1' : '0');
        if (cardId === 'mapa-card-dashboard') localStorage.setItem('pmg_slideoff_dash', hide ? '1' : '0');
    } catch (_) {}
}

/** Android/WebView: al abrir detalle de pedido, ocultar paneles del mapa para que no tapen el modal. */
function gnMinimizeMapPanelsParaDetallePedido() {
    try {
        if (!esAndroidWebViewMapa()) return;
        ['mapa-card-filtros', 'mapa-card-filtro-tipo', 'mapa-card-colores', 'mapa-card-dashboard'].forEach((id) => {
            toggleMapaCardSlideoff(id, true);
        });
        try {
            setBp2PanelHidden(true);
        } catch (_) {}
    } catch (_) {}
}
window.gnMinimizeMapPanelsParaDetallePedido = gnMinimizeMapPanelsParaDetallePedido;

function syncMapSlideTabsFromStorage() {
    const cf = document.getElementById('mapa-card-filtros');
    if (cf && localStorage.getItem('pmg_slideoff_filtros') === '1') toggleMapaCardSlideoff('mapa-card-filtros', true);
    const cft = document.getElementById('mapa-card-filtro-tipo');
    if (cft && localStorage.getItem('pmg_slideoff_filtro_tipo') === '1') toggleMapaCardSlideoff('mapa-card-filtro-tipo', true);
    const cc = document.getElementById('mapa-card-colores');
    if (cc && cc.style.display !== 'none' && localStorage.getItem('pmg_slideoff_colores') === '1') toggleMapaCardSlideoff('mapa-card-colores', true);
    const cd = document.getElementById('mapa-card-dashboard');
    if (cd && cd.style.display !== 'none' && localStorage.getItem('pmg_slideoff_dash') === '1') toggleMapaCardSlideoff('mapa-card-dashboard', true);
}

let _bp2DragState = null;

/** Borde superior seguro para paneles `position:fixed` (mapa escritorio): debajo de la barra .hd. */
function mapFloatingPanelPadTopPx() {
    try {
        const hd = document.querySelector('#ms .hd');
        if (hd) {
            const r = hd.getBoundingClientRect();
            if (r.height > 0 && r.bottom > 0) return Math.ceil(r.bottom) + 6;
        }
    } catch (_) {}
    return 64;
}

/** Mantiene el panel completo dentro del viewport; permite llevarlo hasta los bordes (margen mínimo). */
function clampFloatingPanelToViewport(el, leftPx, topPx, opts) {
    const padX = (opts && opts.padX) != null ? opts.padX : 0;
    const padTop = (opts && opts.padTop) != null ? opts.padTop : mapFloatingPanelPadTopPx();
    const padBottom = (opts && opts.padBottom) != null ? opts.padBottom : 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const br = el.getBoundingClientRect();
    const w = br.width || el.offsetWidth || 160;
    const h = br.height || el.offsetHeight || 80;
    let l = Number(leftPx);
    let t = Number(topPx);
    const minL = padX;
    const maxL = Math.max(minL, vw - w - padX);
    const minT = padTop;
    const maxT = Math.max(minT, vh - h - padBottom);
    l = Math.min(Math.max(l, minL), maxL);
    t = Math.min(Math.max(t, minT), maxT);
    return { left: l, top: t };
}

/** Escritorio ancho o WebView Android: mismos paneles arrastrables (ratón, DeX, tablet). */
function floatingPanelsDragEnabled() {
    try {
        /* Ventanas < 1024px (laptop compacto / panel DevTools): siguen pudiendo mover paneles como el FAB Pedidos */
        return window.matchMedia('(min-width:520px)').matches || esAndroidWebViewMapa();
    } catch (_) {
        return esAndroidWebViewMapa();
    }
}

/** Paneles moui sobre el mapa: arrastrar solo desde el ícono «grip» (.moui-drag-handle), así el resto del encabezado puede plegar sin robar el gesto (incl. Android). */
function floatingMapMouiDragEnabled() {
    try {
        return window.matchMedia('(min-width:520px)').matches || esAndroidWebViewMapa();
    } catch (_) {
        return esAndroidWebViewMapa();
    }
}

function aplicarPosicionBp2Guardada() {
    const bp2 = document.getElementById('bp2');
    if (!bp2 || !floatingPanelsDragEnabled()) return;
    try {
        const raw = localStorage.getItem('pmg_bp2_pos');
        if (!raw) {
            bp2.style.removeProperty('left');
            bp2.style.removeProperty('top');
            bp2.style.removeProperty('right');
            bp2.style.removeProperty('bottom');
            return;
        }
        const p = JSON.parse(raw);
        if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
        bp2.style.right = 'auto';
        bp2.style.bottom = 'auto';
        const c = clampFloatingPanelToViewport(bp2, p.left, p.top, { padX: 0, padBottom: 0 });
        bp2.style.left = c.left + 'px';
        bp2.style.top = c.top + 'px';
    } catch (_) {}
}

function initBp2PanelFlotanteDesktop() {
    const bp2 = document.getElementById('bp2');
    const ph = document.getElementById('ph');
    if (!bp2 || !ph || ph.dataset.bp2DragInit === '1') return;
    if (!floatingPanelsDragEnabled()) return;
    ph.dataset.bp2DragInit = '1';
    aplicarPosicionBp2Guardada();
    const startDrag = (clientX, clientY) => {
        const r = bp2.getBoundingClientRect();
        const hadCol = bp2.classList.contains('col');
        if (hadCol) bp2.classList.remove('col');
        _bp2DragState = {
            sx: clientX,
            sy: clientY,
            sl: r.left,
            st: r.top,
            moved: false,
            hadCol
        };
        let rafMove = null;
        const onMove = (ev) => {
            if (!_bp2DragState) return;
            const cx = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
            const cy = ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0);
            if (Math.abs(cx - _bp2DragState.sx) + Math.abs(cy - _bp2DragState.sy) > 5) _bp2DragState.moved = true;
            if (_bp2DragState.moved && ev.cancelable) ev.preventDefault();
            if (rafMove) cancelAnimationFrame(rafMove);
            rafMove = requestAnimationFrame(() => {
                rafMove = null;
                if (!_bp2DragState) return;
                const dx = cx - _bp2DragState.sx;
                const dy = cy - _bp2DragState.sy;
                bp2.style.right = 'auto';
                bp2.style.bottom = 'auto';
                const c = clampFloatingPanelToViewport(bp2, _bp2DragState.sl + dx, _bp2DragState.st + dy, { padX: 0, padBottom: 0 });
                bp2.style.left = c.left + 'px';
                bp2.style.top = c.top + 'px';
            });
        };
        const onUp = () => {
            if (rafMove) cancelAnimationFrame(rafMove);
            rafMove = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            document.removeEventListener('touchcancel', onUp);
            if (_bp2DragState) {
                if (!_bp2DragState.moved && _bp2DragState.hadCol) bp2.classList.add('col');
                if (_bp2DragState.moved) {
                    try {
                        const br = bp2.getBoundingClientRect();
                        const c = clampFloatingPanelToViewport(bp2, br.left, br.top, { padX: 0, padBottom: 0 });
                        bp2.style.left = c.left + 'px';
                        bp2.style.top = c.top + 'px';
                        localStorage.setItem('pmg_bp2_pos', JSON.stringify({ left: c.left, top: c.top }));
                    } catch (_) {}
                    window.__bp2DragJustEnded = true;
                    setTimeout(() => { window.__bp2DragJustEnded = false; }, 450);
                }
            }
            _bp2DragState = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
    };
    ph.addEventListener('mousedown', (e) => {
        if (!floatingPanelsDragEnabled()) return;
        if (e.button !== 0 || e.target.closest('button')) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
    });
    ph.addEventListener('touchstart', (e) => {
        if (!floatingPanelsDragEnabled()) return;
        if (e.touches.length !== 1 || e.target.closest('button')) return;
        e.preventDefault();
        const t = e.touches[0];
        startDrag(t.clientX, t.clientY);
    }, { passive: false });
}

let _mouiCardDragState = null;

/** Misma lógica que el panel de pedidos (bp2): umbral 5px, clamp al viewport, flag anti-clic al soltar. Solo escritorio ancho (ver floatingMapMouiDragEnabled). */
function initMouiCardDraggable(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const hd = card.querySelector('.moui-hd');
    if (!hd || card.dataset.mouiCardDragInit === '1') return;
    card.dataset.mouiCardDragInit = '1';
    const key = 'pmg_moui_' + cardId.replace(/-/g, '_');
    const applySaved = () => {
        if (!floatingMapMouiDragEnabled()) return;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const p = JSON.parse(raw);
            if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
            card.style.right = 'auto';
            card.style.bottom = 'auto';
            const c = clampFloatingPanelToViewport(card, p.left, p.top, { padX: 0, padBottom: 0 });
            card.style.left = c.left + 'px';
            card.style.top = c.top + 'px';
        } catch (_) {}
    };
    applySaved();
    const dragHandle = hd.querySelector('.moui-drag-handle');
    /** En WebView Android el «asa» es angosta: permitir arrastrar desde toda la cabecera (los botones siguen excluidos). */
    const dragTarget = esAndroidWebViewMapa() ? hd : dragHandle || hd;
    const startDrag = (clientX, clientY) => {
        const r = card.getBoundingClientRect();
        _mouiCardDragState = {
            sx: clientX,
            sy: clientY,
            sl: r.left,
            st: r.top,
            moved: false
        };
        let rafMove = null;
        const onMove = (ev) => {
            if (!_mouiCardDragState) return;
            const cx = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0);
            const cy = ev.clientY != null ? ev.clientY : (ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0);
            if (Math.abs(cx - _mouiCardDragState.sx) + Math.abs(cy - _mouiCardDragState.sy) > 5) _mouiCardDragState.moved = true;
            if (_mouiCardDragState.moved && ev.cancelable) ev.preventDefault();
            if (rafMove) cancelAnimationFrame(rafMove);
            rafMove = requestAnimationFrame(() => {
                rafMove = null;
                if (!_mouiCardDragState) return;
                const dx = cx - _mouiCardDragState.sx;
                const dy = cy - _mouiCardDragState.sy;
                card.style.right = 'auto';
                card.style.bottom = 'auto';
                const c = clampFloatingPanelToViewport(card, _mouiCardDragState.sl + dx, _mouiCardDragState.st + dy, {
                    padX: 0,
                    padBottom: 0
                });
                card.style.left = c.left + 'px';
                card.style.top = c.top + 'px';
            });
        };
        const onUp = () => {
            if (rafMove) cancelAnimationFrame(rafMove);
            rafMove = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            document.removeEventListener('touchcancel', onUp);
            if (_mouiCardDragState && _mouiCardDragState.moved) {
                try {
                    const br = card.getBoundingClientRect();
                    const c = clampFloatingPanelToViewport(card, br.left, br.top, { padX: 0, padBottom: 0 });
                    card.style.left = c.left + 'px';
                    card.style.top = c.top + 'px';
                    localStorage.setItem(key, JSON.stringify({ left: c.left, top: c.top }));
                } catch (_) {}
                window.__mouiCardDragJustEnded = true;
                setTimeout(() => {
                    window.__mouiCardDragJustEnded = false;
                }, 450);
            }
            _mouiCardDragState = null;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
    };
    dragTarget.addEventListener('mousedown', (e) => {
        if (!floatingMapMouiDragEnabled()) return;
        if (e.button !== 0 || e.target.closest('button')) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
    });
    dragTarget.addEventListener(
        'touchstart',
        (e) => {
            if (!floatingMapMouiDragEnabled()) return;
            if (e.touches.length !== 1 || e.target.closest('button')) return;
            e.preventDefault();
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);
        },
        { passive: false }
    );
}

/** Clic en la barra del panel = plegar/desplegar cuerpo (sin onclick inline, para no chocar con el arrastre). */
function bindMouiCardHeaderToggles() {
    const pairs = [
        ['mapa-card-filtros', toggleMapaFiltrosBody],
        ['mapa-card-filtro-tipo', toggleMapaFiltroTipoBody],
        ['mapa-card-colores', toggleMapaColoresBody],
        ['mapa-card-dashboard', toggleMapaDashBody]
    ];
    for (const [id, fn] of pairs) {
        const hd = document.getElementById(id)?.querySelector('.moui-hd');
        if (!hd || hd.dataset.mouiToggleBound === '1') continue;
        hd.dataset.mouiToggleBound = '1';
        hd.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (window.__mouiCardDragJustEnded) return;
            try {
                fn();
            } catch (_) {}
        });
    }
}

function aplicarUIMapaPlataforma() {
    syncMapaLabelsNpCheckbox();
    syncMapaPrioFiltrosFromStorage();
    const card = document.getElementById('mapa-card-filtros');
    const cardTipo = document.getElementById('mapa-card-filtro-tipo');
    const cardCol = document.getElementById('mapa-card-colores');
    if (!card) return;
    if (esAndroidWebViewMapa()) {
        try {
            document.documentElement.classList.add('gn-android-webview');
        } catch (_) {}
        try {
            ['mapa-card-filtros', 'mapa-card-filtro-tipo', 'mapa-card-colores', 'mapa-card-dashboard'].forEach((cid) => {
                const pan = document.getElementById(cid);
                if (!pan) return;
                pan.style.removeProperty('left');
                pan.style.removeProperty('top');
                pan.style.removeProperty('right');
                pan.style.removeProperty('bottom');
            });
        } catch (_) {}
        /* Mismas paletas que admin: paneles en DOM; mostrar/ocultar con pestañas + ojo (slideoff). */
        card.style.display = 'block';
        if (cardTipo) cardTipo.style.display = 'block';
        if (cardCol) cardCol.style.display = 'block';
        const mapDash = document.getElementById('mapa-card-dashboard');
        if (mapDash) mapDash.style.display = esAdmin() ? 'block' : 'none';
        const tabDash = document.getElementById('map-tab-dash');
        if (tabDash) {
            if (!esAdmin()) {
                tabDash.classList.remove('visible');
                tabDash.style.setProperty('display', 'none', 'important');
            } else {
                tabDash.style.removeProperty('display');
            }
        }
        const wrap = document.getElementById('wrap-android-scope');
        if (wrap) {
            wrap.style.display = 'flex';
            const sel = document.getElementById('sel-android-pedidos-scope');
            if (sel) sel.value = localStorage.getItem('pmg_tecnico_ver_todos') === '1' ? 'todos' : 'asignados';
        }
        const cc = document.getElementById('gn-cursor-coords');
        if (cc) cc.style.display = 'none';
    } else {
        try {
            document.documentElement.classList.remove('gn-android-webview');
        } catch (_) {}
        card.style.display = 'block';
        if (cardTipo) cardTipo.style.display = 'block';
        if (cardCol) cardCol.style.display = 'block';
        const cc = document.getElementById('gn-cursor-coords');
        if (cc) cc.style.display = '';
    }
    try {
        if (esAndroidWebViewMapa()) {
            setBp2PanelHidden(true);
        } else {
            setBp2PanelHidden(localStorage.getItem('pmg_bp2_hidden') === '1');
        }
    } catch (_) {}
    syncMapSlideTabsFromStorage();
    try { initBp2PanelFlotanteDesktop(); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-filtros'); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-filtro-tipo'); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-colores'); } catch (_) {}
    try { initMouiCardDraggable('mapa-card-dashboard'); } catch (_) {}
    try { bindMouiCardHeaderToggles(); } catch (_) {}
    try { syncMapaFiltroTiposRebuild(); } catch (_) {}
    try { initWebCoordsConverterBar(); } catch (_) {}
}
window.setBp2PanelHidden = setBp2PanelHidden;
window.toggleMapaCardSlideoff = toggleMapaCardSlideoff;

function toggleMapaFiltrosBody() {
    const b = document.getElementById('mapa-filtros-body');
    const ch = document.getElementById('mapa-filtros-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
}

function toggleMapaFiltroTipoBody() {
    const b = document.getElementById('mapa-filtro-tipo-body');
    const ch = document.getElementById('mapa-filtro-tipo-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
}
window.toggleMapaFiltroTipoBody = toggleMapaFiltroTipoBody;

function toggleMapaDashBody() {
    const b = document.getElementById('mapa-dash-body');
    const ch = document.getElementById('mapa-dash-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
}

function toggleMapaColoresBody() {
    const b = document.getElementById('mapa-colores-body');
    const ch = document.getElementById('mapa-colores-chevron');
    if (!b) return;
    b.classList.toggle('collapsed');
    if (ch) ch.textContent = b.classList.contains('collapsed') ? '▶' : '▼';
}
window.toggleMapaColoresBody = toggleMapaColoresBody;

function iniciarTecnicosMapaPrincipalPoll() {
    detenerTecnicosMapaPrincipalPoll();
    if (!esAdmin()) return;
    void refrescarTecnicosMapaPrincipal();
    _pollTecnicosMapaInterval = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        void refrescarTecnicosMapaPrincipal();
    }, 8000);
}

async function refrescarTecnicosMapaPrincipal() {
    if (!app.map || modoOffline || !NEON_OK || !_sql) {
        _marcadoresTecnicosPrincipal.forEach(m => { try { app.map && app.map.removeLayer(m); } catch (_) {} });
        _marcadoresTecnicosPrincipal = [];
        return;
    }
    if (!esAdmin()) {
        _marcadoresTecnicosPrincipal.forEach(m => { try { app.map.removeLayer(m); } catch (_) {} });
        _marcadoresTecnicosPrincipal = [];
        return;
    }
    try {
        const wf = await sqlFiltroUsuariosPorTenant();
        let btSql = '';
        try {
            const rBt = await sqlSimple(
                `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'business_type' LIMIT 1`
            );
            if (rBt.rows?.length) {
                const line = esc(lineaNegocioOperativaCodigo());
                btSql = ` AND (u.business_type IS NULL OR u.business_type = ${line})`;
            }
        } catch (_) {}
        const r = await sqlSimple(`SELECT DISTINCT ON (uu.usuario_id) uu.usuario_id, uu.lat, uu.lng, uu.timestamp, u.nombre, u.email, u.rol
            FROM ubicaciones_usuarios uu
            JOIN usuarios u ON u.id = uu.usuario_id AND u.activo = TRUE${wf}${btSql}
            WHERE uu.timestamp > NOW() - INTERVAL '2 hours'
            AND LOWER(COALESCE(u.rol,'')) IN ('tecnico','supervisor')
            ORDER BY uu.usuario_id, uu.timestamp DESC`);
        _marcadoresTecnicosPrincipal.forEach(m => { try { app.map.removeLayer(m); } catch (_) {} });
        _marcadoresTecnicosPrincipal = [];
        (r.rows || []).forEach(row => {
            const lat = parseFloat(row.lat);
            const lng = parseFloat(row.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return;
            const nom = String(row.nombre || '').trim() || row.email || 'Técnico';
            const short = nom.split(/\s+/)[0] || nom;
            const icon = L.divIcon({
                className: '',
                html: `<div class="user-marker-admin" style="border-color:#0f766e;background:#ecfdf5;box-shadow:0 2px 8px rgba(0,0,0,.2)"><i class="fas fa-hard-hat" style="font-size:.65rem;color:#0f766e"></i> ${_escOpt(short)}</div>`,
                iconAnchor: [0, 12]
            });
            const ts = row.timestamp ? new Date(row.timestamp) : null;
            const haceMin = ts ? Math.round((Date.now() - ts.getTime()) / 60000) : null;
            const horaStr =
                ts && !isNaN(ts.getTime())
                    ? ts.toLocaleString('es-AR', {
                          timeZone: 'America/Argentina/Buenos_Aires',
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                      })
                    : '—';
            const m = L.marker([lat, lng], { icon, zIndexOffset: 750 })
                .addTo(app.map)
                .bindPopup(
                    `<b>${_escOpt(nom)}</b><br>${_escOpt(row.rol || '')}<br>` +
                        `<strong>Última posición GPS:</strong> hace ${haceMin != null ? haceMin : '—'} min<br>` +
                        `<span style="font-size:11px;color:#64748b">Registrada: ${horaStr}</span>`
                );
            _marcadoresTecnicosPrincipal.push(m);
        });
    } catch (e) {
        console.warn('[tecnicos mapa]', e);
    }
}

function activarModoFijarUbicacionAdmin() {
    if (!app.u || !esAdmin()) return;
    document.getElementById('admin-panel')?.classList.remove('active');
    _modoFijarUbicacionAdmin = true;
    document.body.classList.add('modo-fijar-ubicacion');
    toast('Tocá el mapa principal para fijar tu ubicación (oficina)', 'info');
}

async function registrarUbicacionManualAdmin(lat, lng) {
    if (!app.u || !esAdmin() || modoOffline || !NEON_OK) return;
    try {
        await sqlSimple(`INSERT INTO ubicaciones_usuarios(usuario_id, lat, lng, precision_m, timestamp)
            VALUES(${esc(app.u.id)}, ${esc(lat)}, ${esc(lng)}, ${esc(80)}, NOW())`);
        await sqlSimple(`DELETE FROM ubicaciones_usuarios WHERE usuario_id = ${esc(app.u.id)} AND timestamp < NOW() - INTERVAL '2 hours'`);
        toast('Ubicación de oficina registrada', 'success');
        void actualizarProvinciaTenantDesdeCoords(lat, lng);
    } catch (e) {
        toastError('ubicacion-oficina-admin', e, 'No se pudo guardar la ubicación.');
    }
}

let _pollDashInterval = null;
let _pollPedidosActividadInterval = null;
let _pedidosActividadFinger = '';
let _pollTecnicosMapaInterval = null;
/** Sincroniza lista Neon → técnico/supervisor cuando el admin cambia estados desde la web. */
let _pollTecnicoPedidosInterval = null;
const TECNICO_PEDIDOS_SYNC_MS = 12000;
let _seenClosedIds = new Set();
let _dashCierresInit = false;

function detenerPollSincroPedidosTecnico() {
    if (_pollTecnicoPedidosInterval) {
        clearInterval(_pollTecnicoPedidosInterval);
        _pollTecnicoPedidosInterval = null;
    }
}

async function tickSincroPedidosTecnico() {
    if (!app.u || esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    if (!esTecnicoOSupervisor()) return;
    try {
        await cargarPedidos({ silent: true });
    } catch (_) {}
}

function iniciarPollSincroPedidosTecnico() {
    detenerPollSincroPedidosTecnico();
    if (!app.u || esAdmin()) return;
    if (!esTecnicoOSupervisor()) return;
    void tickSincroPedidosTecnico();
    _pollTecnicoPedidosInterval = setInterval(() => void tickSincroPedidosTecnico(), TECNICO_PEDIDOS_SYNC_MS);
}

/** Si el detalle está abierto, repinta con la fila actual de app.p (p. ej. cierre remoto). */
function refrescarDetalleSiAbiertoTrasSync() {
    const dm = document.getElementById('dm');
    if (!dm || !dm.classList.contains('active')) return;
    const pidKey = dm.dataset?.detallePedidoId;
    if (!pidKey || pidKey === '') return;
    const fresh = app.p.find(x => String(x.id) === pidKey);
    if (fresh) {
        if (fresh.es === 'Cerrado' || fresh.es === 'Derivado externo') {
            return;
        }
        try {
            void detalle(fresh);
        } catch (_) {}
    } else {
        try {
            closeAll();
        } catch (_) {}
        toast('El pedido ya no está en tu listado (actualizado desde la central).', 'info');
    }
}

function notificarCambiosPedidoTecnico(prevSnap) {
    if (!prevSnap || !app.u || esAdmin() || modoOffline) return;
    if (!esTecnicoOSupervisor()) return;
    const uid = String(app.u.id);
    for (const p of app.p) {
        const prev = prevSnap.get(String(p.id));
        if (!prev) continue;
        if (prev.es === p.es) continue;
        const eraAbierto = ['Pendiente', 'Asignado', 'En ejecución'].includes(prev.es);
        const ahoraCerrado = p.es === 'Cerrado';
        if (eraAbierto && ahoraCerrado && p.tai != null && String(p.tai) === uid) {
            const quien = (p.tc || '').trim() || 'Administración';
            toast(`Pedido #${p.np || p.id}: cerrado desde la central (${quien}). Revisá «Cerrados».`, 'success');
        }
    }
}

function detenerPedidosActividadPollAdmin() {
    if (_pollPedidosActividadInterval) {
        clearInterval(_pollPedidosActividadInterval);
        _pollPedidosActividadInterval = null;
    }
    _pedidosActividadFinger = '';
}

async function pollPedidosActividadAdmin() {
    if (!app.u || !esAdmin() || modoOffline || !NEON_OK) return;
    try {
        const tsql = await pedidosFiltroTenantSql();
        const qFull = `SELECT COALESCE(MAX(id),0)::bigint AS mid,
                COUNT(*) FILTER (WHERE estado='Pendiente')::bigint AS np,
                COUNT(*) FILTER (WHERE estado='Asignado')::bigint AS na,
                COUNT(*) FILTER (WHERE estado='En ejecución')::bigint AS ne,
                COUNT(*) FILTER (WHERE estado='Cerrado')::bigint AS nc,
                COALESCE(SUM(COALESCE(avance,0)),0)::bigint AS sav,
                COALESCE(MAX(fecha_avance), to_timestamp(0)) AS mfa,
                COALESCE(MAX(fecha_asignacion), to_timestamp(0)) AS mfas,
                COALESCE(MAX(fecha_cierre), to_timestamp(0)) AS mfc
             FROM pedidos WHERE 1=1${tsql}`;
        const qMin = `SELECT COALESCE(MAX(id),0)::bigint AS mid,
                COUNT(*) FILTER (WHERE estado='Pendiente')::bigint AS np,
                COUNT(*) FILTER (WHERE estado='Asignado')::bigint AS na,
                COUNT(*) FILTER (WHERE estado='En ejecución')::bigint AS ne,
                COUNT(*) FILTER (WHERE estado='Cerrado')::bigint AS nc,
                COALESCE(SUM(COALESCE(avance,0)),0)::bigint AS sav
             FROM pedidos WHERE 1=1${tsql}`;
        let r;
        try {
            r = await sqlSimple(qFull);
        } catch (e) {
            const m = String(e && e.message ? e.message : e);
            if (
                m.includes('fecha_avance') ||
                m.includes('fecha_asignacion') ||
                m.includes('fecha_cierre') ||
                m.includes('does not exist') ||
                m.includes('column')
            ) {
                r = await sqlSimple(qMin);
            } else {
                throw e;
            }
        }
        const row = r.rows?.[0] || {};
        let msdf = '0';
        let nsdp = '0';
        try {
            const rDer = await sqlSimple(
                `SELECT COALESCE(MAX(solicitud_derivacion_fecha), to_timestamp(0)) AS msdf,
                 COUNT(*) FILTER (WHERE COALESCE(solicitud_derivacion_pendiente, FALSE))::bigint AS nsdp
                 FROM pedidos WHERE 1=1${tsql}`
            );
            const rd = rDer.rows?.[0] || {};
            msdf = rd.msdf != null ? String(rd.msdf) : '0';
            nsdp = rd.nsdp != null ? String(rd.nsdp) : '0';
        } catch (_) {
            /* columnas solicitud_derivacion_* ausentes en BD antigua */
        }
        const f = [
            row.mid,
            row.np,
            row.na,
            row.ne,
            row.nc,
            row.sav,
            row.mfa != null ? row.mfa : '0',
            row.mfas != null ? row.mfas : '0',
            row.mfc != null ? row.mfc : '0',
            msdf,
            nsdp,
        ]
            .map((x) => String(x))
            .join('|');
        if (!_pedidosActividadFinger) {
            _pedidosActividadFinger = f;
            return;
        }
        if (f !== _pedidosActividadFinger) {
            _pedidosActividadFinger = f;
            await cargarPedidos({ silent: true });
            try { await refrescarTecnicosMapaPrincipal(); } catch (_) {}
        }
    } catch (_) {}
}

function iniciarPedidosActividadPollAdmin() {
    detenerPedidosActividadPollAdmin();
    if (!esAdmin()) return;
    pollPedidosActividadAdmin();
    _pollPedidosActividadInterval = setInterval(pollPedidosActividadAdmin, 8000);
    void pollBannerOpinionCliente();
    setInterval(() => void pollBannerOpinionCliente(), 15000);
}

function detenerTecnicosMapaPrincipalPoll() {
    if (_pollTecnicosMapaInterval) {
        clearInterval(_pollTecnicosMapaInterval);
        _pollTecnicosMapaInterval = null;
    }
}

/** Supervisor (sin panel KPI): solo técnicos en mapa principal. */
function iniciarDashboardGerenciaPoll() {
    detenerDashboardGerenciaPoll();
    if (!esAdmin()) return;
    const tick = () => { pollCierresGerencia(); refrescarDashboardGerencia(true); };
    tick();
    _pollDashInterval = setInterval(tick, 25000);
    iniciarPedidosActividadPollAdmin();
    iniciarTecnicosMapaPrincipalPoll();
}

function detenerDashboardGerenciaPoll() {
    if (_pollDashInterval) {
        clearInterval(_pollDashInterval);
        _pollDashInterval = null;
    }
    detenerPedidosActividadPollAdmin();
    detenerTecnicosMapaPrincipalPoll();
}

async function pollCierresGerencia() {
    if (!app.u || !esAdmin() || modoOffline || !NEON_OK) return;
    try {
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(`SELECT id, numero_pedido, fecha_cierre, trabajo_realizado, tecnico_cierre, nis_medidor, descripcion
            FROM pedidos WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > NOW() - INTERVAL '14 days'${tsql}
            ORDER BY fecha_cierre DESC LIMIT 50`);
        const rows = r.rows || [];
        if (!_dashCierresInit) {
            rows.forEach(row => _seenClosedIds.add(String(row.id)));
            _dashCierresInit = true;
            return;
        }
        let huboNuevo = false;
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            const sid = String(row.id);
            if (_seenClosedIds.has(sid)) continue;
            _seenClosedIds.add(sid);
            mostrarToastCierreGerencia(row);
            huboNuevo = true;
        }
        if (huboNuevo) {
            try { await cargarPedidos(); } catch (_) {}
        }
    } catch (_) {}
}

let _waHcPollInterval = null;
let _waHcKnownSessionIds = new Set();
let _waHcPollPrimed = false;
/** @type {Map<string, { root: HTMLElement, visible: boolean, dockChip: HTMLElement|null, metaEl: HTMLElement, msgBox: HTMLElement, ta: HTMLTextAreaElement, titleEl: HTMLElement }>} */
let _waHcWindows = new Map();
let _waHcMessagePollInterval = null;
/** Por encima de pestañas fijas del mapa (≈9600); coincide con .wa-hc-float en styles.css */
let _waHcFloatZ = 10060;

function detenerRefrescoMensajesWaHcVentanas() {
    if (_waHcMessagePollInterval) {
        clearInterval(_waHcMessagePollInterval);
        _waHcMessagePollInterval = null;
    }
}

function asegurarRefrescoMensajesWaHcVentanas() {
    if (_waHcMessagePollInterval || _waHcWindows.size === 0) return;
    _waHcMessagePollInterval = setInterval(() => {
        for (const [sid, st] of _waHcWindows) {
            if (st.visible) refrescarMensajesWaHcVentana(Number(sid));
        }
    }, 3500);
}

function destruirTodasVentanasWaHc() {
    for (const st of _waHcWindows.values()) {
        try { st.root.remove(); } catch (_) {}
        try { if (st.dockChip && st.dockChip.parentElement) st.dockChip.remove(); } catch (_) {}
    }
    _waHcWindows.clear();
    const dock = document.getElementById('wa-human-chat-dock');
    if (dock) dock.innerHTML = '';
    detenerRefrescoMensajesWaHcVentanas();
}

function detenerPollWhatsappHumanChat() {
    if (_waHcPollInterval) {
        clearInterval(_waHcPollInterval);
        _waHcPollInterval = null;
    }
}

function iniciarPollWhatsappHumanChat() {
    detenerPollWhatsappHumanChat();
    if (!esAdmin()) return;
    _waHcPollPrimed = false;
    _waHcKnownSessionIds.clear();
    const tick = () => { pollWhatsappHumanChatCola(); };
    tick();
    _waHcPollInterval = setInterval(tick, 5000);
}

const SESS_KEY_WA_HC_BANNER_DISMISS = 'gn_sess_wa_hc_banner_dismiss_v1';

function waHcBannerDismissIdSet() {
    try {
        const j = sessionStorage.getItem(SESS_KEY_WA_HC_BANNER_DISMISS);
        const a = JSON.parse(j || '[]');
        return new Set((Array.isArray(a) ? a : []).map(String));
    } catch (_) {
        return new Set();
    }
}

function waHcMarcarBannerDescartado(sessionIdStr) {
    const sid = String(sessionIdStr || '').trim();
    if (!sid) return;
    const s = waHcBannerDismissIdSet();
    s.add(sid);
    try {
        sessionStorage.setItem(SESS_KEY_WA_HC_BANNER_DISMISS, JSON.stringify([...s]));
    } catch (_) {}
}

function ocultarTodosToastsWaHumanChat() {
    try {
        document.querySelectorAll('#wa-human-chat-toast-host .wa-human-chat-toast').forEach((el) => {
            try {
                el.remove();
            } catch (_) {}
        });
    } catch (_) {}
}

async function pollWhatsappHumanChatCola() {
    if (!app.u || !esAdmin() || modoOffline || !puedeEnviarApiRestPedidos()) return;
    try {
        await asegurarJwtApiRest();
        const tok = getApiToken();
        if (!tok) return;
        const r = await fetch(apiUrl('/api/whatsapp/human-chat/sessions'), {
            headers: { Authorization: `Bearer ${tok}` }
        });
        if (!r.ok) return;
        const data = await r.json();
        const list = data.sessions || [];
        const idsNow = new Set(list.map(s => String(s.id)));
        for (const k of [..._waHcKnownSessionIds]) {
            if (!idsNow.has(k)) _waHcKnownSessionIds.delete(k);
        }
        const dismissed = waHcBannerDismissIdSet();
        if (!_waHcPollPrimed) {
            _waHcPollPrimed = true;
            for (const s of list) {
                const id = String(s.id);
                _waHcKnownSessionIds.add(id);
                if (dismissed.has(id)) continue;
                mostrarToastWaHumanChatNuevo(s);
            }
            return;
        }
        for (const s of list) {
            const id = String(s.id);
            if (_waHcKnownSessionIds.has(id)) continue;
            _waHcKnownSessionIds.add(id);
            if (dismissed.has(id)) continue;
            mostrarToastWaHumanChatNuevo(s);
        }
    } catch (_) {}
}

function mostrarToastWaHumanChatNuevo(s) {
    const sidStr = String(s?.id ?? '').trim();
    if (sidStr && waHcBannerDismissIdSet().has(sidStr)) return;
    const host = document.getElementById('wa-human-chat-toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'wa-human-chat-toast';
    const name = String(s.contact_name || '').trim() || 'Cliente';
    const ph = String(s.phone_canonical || '');
    el.innerHTML = `<button type="button" class="wa-hc-toast-close" aria-label="Cerrar aviso">&times;</button><strong><i class="fas fa-comments"></i> Cliente pide chat</strong><br>${_escOpt(name)} · ${_escOpt(ph)}<br><span style="font-size:.76rem;opacity:.9">Tocá para abrir</span>`;
    const go = () => {
        waHcMarcarBannerDescartado(sidStr);
        ocultarTodosToastsWaHumanChat();
        try {
            el.remove();
        } catch (_) {}
        abrirModalWhatsappHumanChat(Number(s.id));
    };
    el.onclick = (ev) => {
        if (ev.target.closest('.wa-hc-toast-close')) return;
        go();
    };
    const x = el.querySelector('.wa-hc-toast-close');
    if (x) x.onclick = (ev) => { ev.stopPropagation(); try { el.remove(); } catch (_) {} };
    host.appendChild(el);
}

function traerAlFrenteVentanaWaHc(floatEl) {
    _waHcFloatZ++;
    floatEl.style.zIndex = String(_waHcFloatZ);
}

function attachWaHcDrag(headerEl, floatEl) {
    headerEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const r = floatEl.getBoundingClientRect();
        const ox = r.left;
        const oy = r.top;
        const sx = e.clientX;
        const sy = e.clientY;
        traerAlFrenteVentanaWaHc(floatEl);
        const onMove = (ev) => {
            floatEl.style.left = (ox + ev.clientX - sx) + 'px';
            floatEl.style.top = (oy + ev.clientY - sy) + 'px';
            floatEl.style.right = 'auto';
            floatEl.style.bottom = 'auto';
        };
        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    });
    headerEl.addEventListener('touchstart', (e) => {
        if (e.target.closest('button')) return;
        const t0 = e.touches[0];
        if (!t0) return;
        const r = floatEl.getBoundingClientRect();
        const ox = r.left;
        const oy = r.top;
        const sx = t0.clientX;
        const sy = t0.clientY;
        traerAlFrenteVentanaWaHc(floatEl);
        const onMove = (ev) => {
            const t = ev.touches[0];
            if (!t) return;
            floatEl.style.left = (ox + t.clientX - sx) + 'px';
            floatEl.style.top = (oy + t.clientY - sy) + 'px';
            floatEl.style.right = 'auto';
            floatEl.style.bottom = 'auto';
        };
        const onEnd = () => {
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('touchcancel', onEnd);
        };
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('touchcancel', onEnd);
    }, { passive: true });
}

function actualizarTituloYChipDockWaHc(sidStr, titulo) {
    const st = _waHcWindows.get(sidStr);
    if (!st) return;
    const t = String(titulo || '').trim() || ('Chat #' + sidStr);
    st.titleEl.textContent = t;
    if (st.dockChip && st.dockChip.isConnected) {
        const short = t.length > 40 ? t.slice(0, 38) + '…' : t;
        st.dockChip.textContent = short;
    }
}

function ensureDockChipWaHc(sidStr, st) {
    if (st.dockChip && st.dockChip.isConnected) return;
    const dock = document.getElementById('wa-human-chat-dock');
    if (!dock) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'wa-hc-dock-chip';
    chip.setAttribute('aria-label', 'Volver al chat de WhatsApp');
    const t = String(st.titleEl.textContent || 'Chat').trim() || ('Chat #' + sidStr);
    chip.textContent = t.length > 40 ? t.slice(0, 38) + '…' : t;
    chip.onclick = () => restaurarVentanaWaHc(sidStr);
    dock.appendChild(chip);
    st.dockChip = chip;
}

function minimizarVentanaWaHc(sidStr) {
    const st = _waHcWindows.get(sidStr);
    if (!st) return;
    st.root.style.display = 'none';
    st.visible = false;
    ensureDockChipWaHc(sidStr, st);
}

function restaurarVentanaWaHc(sidStr) {
    const st = _waHcWindows.get(sidStr);
    if (!st) return;
    st.root.style.display = 'flex';
    st.visible = true;
    if (st.dockChip) {
        try { st.dockChip.remove(); } catch (_) {}
        st.dockChip = null;
    }
    traerAlFrenteVentanaWaHc(st.root);
    refrescarMensajesWaHcVentana(Number(sidStr));
    asegurarRefrescoMensajesWaHcVentanas();
}

function crearVentanaFlotanteWaHc(sidNum) {
    const sidStr = String(sidNum);
    const idx = _waHcWindows.size;
    const root = document.createElement('div');
    root.className = 'wa-hc-float';
    root.style.left = 'auto';
    root.style.right = (10 + (idx % 3) * 14) + 'px';
    root.style.top = (70 + (idx % 5) * 34) + 'px';
    root.dataset.waHcSession = sidStr;

    const header = document.createElement('div');
    header.className = 'wa-hc-float-h';
    const titleEl = document.createElement('span');
    titleEl.style.flex = '1';
    titleEl.style.minWidth = '0';
    titleEl.style.overflow = 'hidden';
    titleEl.style.textOverflow = 'ellipsis';
    titleEl.style.whiteSpace = 'nowrap';
    titleEl.textContent = 'Chat #' + sidStr;

    const actions = document.createElement('div');
    actions.className = 'wa-hc-float-actions';

    const btnMin = document.createElement('button');
    btnMin.type = 'button';
    btnMin.title = 'Minimizar: el chat sigue a la izquierda';
    btnMin.setAttribute('aria-label', 'Minimizar chat');
    btnMin.textContent = '–';
    btnMin.onclick = (e) => { e.stopPropagation(); minimizarVentanaWaHc(sidStr); };

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.title = 'Cerrar ventana: el chat no se pierde; tocá el aviso a la izquierda';
    btnClose.setAttribute('aria-label', 'Cerrar ventana del chat');
    btnClose.innerHTML = '<i class="fas fa-times"></i>';
    btnClose.onclick = (e) => { e.stopPropagation(); minimizarVentanaWaHc(sidStr); };

    actions.appendChild(btnMin);
    actions.appendChild(btnClose);
    header.appendChild(titleEl);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'wa-hc-float-body';
    const metaEl = document.createElement('div');
    metaEl.className = 'wa-hc-float-meta';
    metaEl.textContent = 'Cargando…';
    const msgBox = document.createElement('div');
    msgBox.className = 'wa-hc-thread';
    const ta = document.createElement('textarea');
    ta.className = 'wa-hc-float-ta';
    ta.rows = 3;
    ta.placeholder = 'Respuesta… Enter envía · Shift+Enter nueva línea';
    ta.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        enviarMensajeWaHcDesdeVentana(sidNum);
    });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:.45rem;flex-wrap:wrap;align-items:center';
    const btnSend = document.createElement('button');
    btnSend.type = 'button';
    btnSend.className = 'bp btn-sm';
    btnSend.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
    btnSend.onclick = () => enviarMensajeWaHcDesdeVentana(sidNum);

    const btnDeact = document.createElement('button');
    btnDeact.type = 'button';
    btnDeact.className = 'btn-sm warning';
    btnDeact.textContent = 'Desactivar chat';
    btnDeact.title = 'Cierra la sesión humana: el bot vuelve a atender solo';
    btnDeact.onclick = () => desactivarChatWaHc(sidNum);

    row.appendChild(btnSend);
    row.appendChild(btnDeact);
    body.appendChild(metaEl);
    body.appendChild(msgBox);
    body.appendChild(ta);
    body.appendChild(row);

    root.appendChild(header);
    root.appendChild(body);
    document.body.appendChild(root);

    attachWaHcDrag(header, root);
    traerAlFrenteVentanaWaHc(root);

    const st = { root, visible: true, dockChip: null, metaEl, msgBox, ta, titleEl };
    _waHcWindows.set(sidStr, st);
    return st;
}

/** Etiqueta legible para teléfonos guardados como dígitos (WhatsApp / Meta). */
function fmtTelWaMeta(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (!d) return '—';
    if (d.startsWith('54')) return '+' + d;
    return '+' + d;
}

async function refrescarMensajesWaHcVentana(sidNum) {
    const sidStr = String(sidNum);
    const st = _waHcWindows.get(sidStr);
    if (!st || !st.visible) return;
    const tok = getApiToken();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${sidNum}/messages`), {
            headers: { Authorization: `Bearer ${tok}` }
        });
        if (!r.ok) {
            if (r.status === 404) toast('Conversación no encontrada', 'error');
            return;
        }
        const data = await r.json();
        if (data.session) {
            const cn = String(data.session.contact_name || '').trim();
            const line = (cn ? cn + ' · ' : '') +
                'Tel: ' + fmtTelWaMeta(data.session.phone_canonical) +
                ' · Estado: ' + (data.session.estado || '');
            st.metaEl.textContent = line;
            actualizarTituloYChipDockWaHc(sidStr, cn || ('Chat · ' + fmtTelWaMeta(data.session.phone_canonical)));
        }
        if (Array.isArray(data.messages)) {
            st.msgBox.innerHTML = data.messages.map(m =>
                `<div class="${m.direction === 'in' ? 'wa-hc-bubble-in' : 'wa-hc-bubble-out'}">${_escOpt(m.body)}</div>`
            ).join('');
            st.msgBox.scrollTop = st.msgBox.scrollHeight;
        }
    } catch (_) {}
}

async function enviarMensajeWaHcDesdeVentana(sidNum) {
    const sidStr = String(sidNum);
    const st = _waHcWindows.get(sidStr);
    if (!st) return;
    const text = String(st.ta?.value || '').trim();
    if (!text) return;
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${sidNum}/send`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.error || 'HTTP ' + r.status);
        }
        st.ta.value = '';
        await refrescarMensajesWaHcVentana(sidNum);
        toast('Mensaje enviado', 'success');
    } catch (e) {
        toastError('wa-hc-enviar', e, 'No se pudo enviar el mensaje.');
    }
}

async function desactivarChatWaHc(sidNum) {
    const sidStr = String(sidNum);
    if (!confirm('¿Desactivar este chat? El bot volverá a atender al cliente solo.')) return;
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${sidNum}/close`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
        });
        if (!r.ok) throw new Error('close');
        waHcMarcarBannerDescartado(sidStr);
        ocultarTodosToastsWaHumanChat();
        _waHcKnownSessionIds.delete(sidStr);
        const st = _waHcWindows.get(sidStr);
        if (st) {
            try { st.dockChip?.remove(); } catch (_) {}
            try { st.root.remove(); } catch (_) {}
            _waHcWindows.delete(sidStr);
        }
        if (_waHcWindows.size === 0) detenerRefrescoMensajesWaHcVentanas();
        toast('Chat desactivado', 'success');
    } catch (e) {
        toast('No se pudo desactivar el chat', 'error');
    }
}

function cerrarModalWaHumanChat() {
    for (const sidStr of [..._waHcWindows.keys()]) {
        minimizarVentanaWaHc(sidStr);
    }
}

async function abrirModalWhatsappHumanChat(prefSessionId) {
    ocultarTodosToastsWaHumanChat();
    if (prefSessionId != null && Number.isFinite(Number(prefSessionId))) {
        waHcMarcarBannerDescartado(String(prefSessionId));
    }
    if (!puedeEnviarApiRestPedidos()) {
        toast('Sin conexión a la API para el chat', 'warning');
        return;
    }
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    const prefNum = prefSessionId != null ? Number(prefSessionId) : NaN;
    if (Number.isFinite(prefNum)) {
        const k = String(prefNum);
        if (_waHcWindows.has(k)) {
            try {
                await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${prefNum}/activate`), {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
                });
            } catch (_) {}
            restaurarVentanaWaHc(k);
            await refrescarMensajesWaHcVentana(prefNum);
            asegurarRefrescoMensajesWaHcVentanas();
            return;
        }
    }
    try {
        const r = await fetch(apiUrl('/api/whatsapp/human-chat/sessions'), {
            headers: { Authorization: `Bearer ${tok}` }
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        let data = await r.json();
        let list = data.sessions || [];
        let useId = null;
        if (prefSessionId && list.some(x => Number(x.id) === Number(prefSessionId))) {
            useId = Number(prefSessionId);
        } else if (list[0]) {
            useId = Number(list[0].id);
        } else if (prefSessionId) {
            useId = Number(prefSessionId);
        }
        if (!useId || !Number.isFinite(useId)) {
            toast('No hay conversaciones en cola para abrir', 'info');
            return;
        }
        const ar = await fetch(apiUrl(`/api/whatsapp/human-chat/sessions/${useId}/activate`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }
        });
        if (!ar.ok) {
            const err = await ar.json().catch(() => ({}));
            toast(err.error || ('No se pudo activar la sesión (' + ar.status + ')'), 'warning');
        }
        if (!_waHcWindows.has(String(useId))) crearVentanaFlotanteWaHc(useId);
        else restaurarVentanaWaHc(String(useId));
        await refrescarMensajesWaHcVentana(useId);
        asegurarRefrescoMensajesWaHcVentanas();
    } catch (e) {
        toastError('wa-hc-abrir', e, 'No se pudo abrir el chat.');
    }
}

function onWaHcPickerChange() {}

async function enviarMensajeWaHumanChatAdmin() {
    toast('Abrí el chat desde el aviso o el panel flotante.', 'info');
}

async function finalizarChatWaHumanChatAdmin() {
    toast('Usá «Desactivar chat» en la ventana de esa conversación.', 'info');
}

window.cerrarModalWaHumanChat = cerrarModalWaHumanChat;
window.abrirModalWhatsappHumanChat = abrirModalWhatsappHumanChat;
window.onWaHcPickerChange = onWaHcPickerChange;
window.enviarMensajeWaHumanChatAdmin = enviarMensajeWaHumanChatAdmin;
window.finalizarChatWaHumanChatAdmin = finalizarChatWaHumanChatAdmin;

function mostrarToastCierreGerencia(row) {
    const host = document.getElementById('cierre-toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'cierre-toast';
    const np = String(row.numero_pedido || '').replace(/</g, '&lt;');
    el.innerHTML = `<strong>Concluido #${np}</strong><br><span style="opacity:.9">${fmtInformeFecha(row.fecha_cierre)} · ${String(row.tecnico_cierre || '').replace(/</g, '&lt;')}</span><br><span style="font-size:.76rem;opacity:.85">Tocá para ver el cierre</span>`;
        el.onclick = async () => {
        try { el.remove(); } catch (_) {}
        await cargarPedidos();
        const p = app.p.find(x => String(x.id) === String(row.id));
        if (p) {
            app.tab = 'c';
            document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === app.tab));
            render();
            void detalle(p);
        } else {
            toast('Actualizá la lista — pedido no encontrado en caché', 'info');
        }
    };
    host.appendChild(el);
    setTimeout(() => { try { if (el.parentNode) el.remove(); } catch (_) {} }, 90000);
}

function abrirModalDashboardGerencia() {
    if (!app.u || !esAdmin()) return;
    const m = document.getElementById('modal-dashboard-gerencia');
    if (m) m.classList.add('active');
    syncDashboardModalMaxButtons();
    refrescarDashboardGerencia(false);
}

function bindDashboardKpiClicks(gridEl, hostId) {
    if (!gridEl || gridEl._gnDashKpiBound) return;
    gridEl._gnDashKpiBound = true;
    gridEl.addEventListener('click', ev => {
        const card = ev.target.closest('[data-dash-filter]');
        if (!card) return;
        gridEl.querySelectorAll('.dash-kpi-click.active-ring').forEach(x => x.classList.remove('active-ring'));
        card.classList.add('active-ring');
        ejecutarDashboardFiltroLista(card.dataset.dashFilter, hostId);
    });
}

async function ejecutarDashboardFiltroLista(filter, hostId) {
    const host = document.getElementById(hostId || 'dashboard-filtro-lista-host');
    if (!host) return;
    if (filter === 'tecnicos_gps') {
        host.style.display = 'block';
        host.innerHTML = '<span style="color:var(--tm)">Listado de técnicos con GPS reciente arriba (sección «Técnicos en calle»).</span>';
        return;
    }
    host.style.display = 'block';
    host.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const lim = hostId === 'mapa-main-dash-filtro-host' ? 25 : 100;
    const tsql = await pedidosFiltroTenantSql();
    let q = '';
    if (filter === 'pendientes') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'Pendiente'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'asignados') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'Asignado'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'en_ejecucion') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'En ejecución'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'cerrados_hoy') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_cierre, descripcion FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre::date = CURRENT_DATE${tsql} ORDER BY fecha_cierre DESC LIMIT ${lim}`;
    } else if (filter === 'derivados_terceros') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion, derivado_destino_nombre FROM pedidos WHERE (estado = 'Derivado externo' OR COALESCE(derivado_externo, FALSE) = TRUE)${tsql} ORDER BY COALESCE(fecha_derivacion, fecha_creacion) DESC NULLS LAST LIMIT ${lim}`;
    } else {
        host.style.display = 'none';
        host.innerHTML = '';
        return;
    }
    try {
        const r = await sqlSimple(q);
        const rows = r.rows || [];
        if (!rows.length) {
            host.innerHTML = '<span style="color:var(--tl)">Sin pedidos en esta categoría.</span>';
            return;
        }
        host.innerHTML = rows.map(row => {
            const np = String(row.numero_pedido || '').replace(/</g, '&lt;');
            const pr = String(row.prioridad || '').replace(/</g, '&lt;');
            const es = String(row.estado || '').replace(/</g, '&lt;');
            const de = String(row.descripcion || '').replace(/</g, '&lt;').substring(0, 72);
            const fe = row.fecha_cierre ? fmtInformeFecha(row.fecha_cierre) : fmtInformeFecha(row.fecha_creacion);
            const ddn = row.derivado_destino_nombre
                ? ` · → ${String(row.derivado_destino_nombre).replace(/</g, '&lt;')}`
                : '';
            return `<div style="padding:.3rem 0;border-bottom:1px solid var(--bo);cursor:pointer;color:var(--bm)" onclick="cerrarModalDashYAbrirPedido(${row.id})"><strong>#${np}</strong> · ${es} · ${pr}${ddn}<br><span style="color:var(--tm);font-size:.78rem">${fe} — ${de}${(row.descripcion && row.descripcion.length > 72) ? '…' : ''}</span></div>`;
        }).join('');
    } catch (e) {
        logErrorWeb('dashboard-filtro-lista', e);
        host.innerHTML = '<span style="color:var(--re)">' + escHtmlPrint(mensajeErrorUsuario(e)) + '</span>';
    }
}

async function refrescarDashboardGerencia(silent) {
    if (!app.u || !esAdmin() || modoOffline || !NEON_OK) return;
    const kpi = document.getElementById('dashboard-kpi-grid');
    const lt = document.getElementById('dashboard-lista-tecnicos');
    const lc = document.getElementById('dashboard-lista-cierres');
    const kpiM = document.getElementById('mapa-main-dash-kpi');
    const ltM = document.getElementById('mapa-main-dash-tecnicos');
    const lcM = document.getElementById('mapa-main-dash-cierres');
    const hostF = document.getElementById('dashboard-filtro-lista-host');
    const hostMap = document.getElementById('mapa-main-dash-filtro-host');
    if (hostF) { hostF.style.display = 'none'; hostF.innerHTML = ''; }
    if (hostMap) { hostMap.style.display = 'none'; hostMap.innerHTML = ''; }
    if (!silent && kpi) kpi.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    if (!silent && kpiM) kpiM.innerHTML = '<div class="ll2" style="padding:.5rem"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const tsql = await pedidosFiltroTenantSql();
        const [rAct, rTec, rCi] = await Promise.all([
            sqlSimple(`SELECT
                COUNT(*) FILTER (WHERE estado = 'Asignado') AS asignados,
                COUNT(*) FILTER (WHERE estado = 'En ejecución') AS en_ejec,
                COUNT(*) FILTER (WHERE estado = 'Pendiente') AS pendientes,
                COUNT(*) FILTER (WHERE estado = 'Cerrado' AND fecha_cierre::date = CURRENT_DATE) AS cerrados_hoy,
                COUNT(*) FILTER (WHERE estado = 'Derivado externo' OR COALESCE(derivado_externo, FALSE) = TRUE) AS derivados_terceros
                FROM pedidos WHERE 1=1${tsql}`),
            sqlSimple(`SELECT DISTINCT ON (uu.usuario_id) uu.usuario_id, uu.lat, uu.lng, uu.timestamp, u.nombre, u.email, u.rol
                FROM ubicaciones_usuarios uu
                JOIN usuarios u ON u.id = uu.usuario_id AND u.activo = TRUE
                WHERE uu.timestamp > NOW() - INTERVAL '20 minutes'
                AND LOWER(COALESCE(u.rol,'')) IN ('tecnico','supervisor')
                ORDER BY uu.usuario_id, uu.timestamp DESC`),
            sqlSimple(`SELECT id, numero_pedido, fecha_cierre, tecnico_cierre, nis_medidor FROM pedidos
                WHERE estado='Cerrado' AND fecha_cierre IS NOT NULL${tsql} ORDER BY fecha_cierre DESC LIMIT 12`)
        ]);
        const a = rAct.rows[0] || {};
        const cards = [
            { val: a.pendientes || 0, lbl: 'Pendiente', cls: 'orange', filter: 'pendientes' },
            { val: a.asignados || 0, lbl: 'Asignados', cls: 'dash-kpi-blue', filter: 'asignados' },
            { val: a.en_ejec || 0, lbl: 'En ejecución', cls: 'dash-kpi-blue', filter: 'en_ejecucion' },
            { val: a.derivados_terceros || 0, lbl: 'Derivados (terceros)', cls: 'dash-kpi-slate', filter: 'derivados_terceros' },
            { val: a.cerrados_hoy || 0, lbl: 'Cerrados hoy', cls: 'green', filter: 'cerrados_hoy' },
            { val: (rTec.rows || []).length, lbl: 'Con posición &lt;20 min', cls: '', filter: 'tecnicos_gps' }
        ];
        const htmlKpi = cards.map(s => `<div class="stat-card dash-kpi-click ${s.cls}" data-dash-filter="${s.filter}" tabindex="0" role="button"><div class="val">${s.val}</div><div class="lbl">${s.lbl}</div></div>`).join('');
        const tr = rTec.rows || [];
        const htmlLt = tr.length
            ? tr.map(row => {
                const min = Math.round((Date.now() - new Date(row.timestamp)) / 60000);
                return `<div style="padding:.35rem 0;border-bottom:1px solid var(--bo)"><b>${String(row.nombre || '').replace(/</g, '&lt;')}</b> <span style="color:var(--tl)">${row.rol || ''}</span> — hace ${min} min</div>`;
            }).join('')
            : '<span style="color:var(--tl)">Sin posiciones en los últimos 20 min (técnicos con app / GPS apagado).</span>';
        const cr = rCi.rows || [];
        const htmlLc = cr.length
            ? cr.map(row => `<div style="padding:.35rem 0;border-bottom:1px solid var(--bo);cursor:pointer;color:var(--bm)" onclick="cerrarModalDashYAbrirPedido(${row.id})">
                    <strong>#${String(row.numero_pedido || '').replace(/</g, '&lt;')}</strong> · ${fmtInformeFecha(row.fecha_cierre)} · ${String(row.tecnico_cierre || '—').replace(/</g, '&lt;')} · NIS ${String(row.nis_medidor || '—').replace(/</g, '&lt;')}
                </div>`).join('')
            : '—';
        if (kpi) kpi.innerHTML = htmlKpi;
        if (lt) lt.innerHTML = htmlLt;
        if (lc) lc.innerHTML = htmlLc;
        if (kpiM) kpiM.innerHTML = htmlKpi;
        if (ltM) ltM.innerHTML = htmlLt;
        if (lcM) lcM.innerHTML = htmlLc;
        bindDashboardKpiClicks(kpi, 'dashboard-filtro-lista-host');
        bindDashboardKpiClicks(kpiM, 'mapa-main-dash-filtro-host');
        try { await refrescarTecnicosMapaPrincipal(); } catch (_) {}
        try {
            const rMx = await sqlSimple(`SELECT COALESCE(MAX(id),0)::bigint AS m FROM pedidos WHERE 1=1${tsql}`);
            const m = Number(rMx.rows?.[0]?.m) || 0;
            if (m > (app._lastMaxPedidoIdSynced || 0)) {
                await cargarPedidos({ silent: true });
            }
        } catch (_) {}
    } catch (e) {
        logErrorWeb('dashboard-kpi', e);
        const em = escHtmlPrint(mensajeErrorUsuario(e));
        if (kpi && !silent) kpi.innerHTML = '<span style="color:var(--re)">' + em + '</span>';
        if (kpiM && !silent) kpiM.innerHTML = '<span style="color:var(--re)">' + em + '</span>';
    }
}

window.cerrarModalDashYAbrirPedido = async function (pid) {
    cerrarModalDashboardGerencia();
    cerrarAdminPanel();
    await cargarPedidos();
    const p = app.p.find(x => String(x.id) === String(pid));
    if (!p) { toast('Pedido no encontrado', 'error'); return; }
    app.tab = tabPedidoListaPorEstado(p.es);
    document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === app.tab));
    render();
    void detalle(p);
};
window.cerrarModalDashYVerCierre = window.cerrarModalDashYAbrirPedido;

async function intentarAutoInicioEjecucionTecnico(lat, lng) {
    if (!app.u || !esTecnicoOSupervisor() || modoOffline || !NEON_OK) return;
    const uid = parseInt(app.u.id, 10);
    const umbral = 0.015;
    for (const p of app.p) {
        if (p.es !== 'Asignado' || p.tai !== uid) continue;
        const { la: pla, ln: pln } = coordsEfectivasPedidoMapa(p);
        if (pla == null || pln == null) continue;
        if (distanciaKm(lat, lng, pla, pln) > umbral) continue;
        const now = new Date().toISOString();
        const av = Math.max(parseInt(p.av, 10) || 0, 5);
        await updPedido(p.id, { estado: 'En ejecución', fecha_avance: now, avance: av }, app.u.id);
        const pidNum = parseInt(p.id, 10);
        if (Number.isFinite(pidNum) && pidNum > 0) {
            await asegurarJwtApiRest();
            if (puedeEnviarApiRestPedidos()) void notificarWhatsappClienteEventoApi(pidNum, 'inicio');
        }
        toast('Llegada al lugar: pedido #' + p.np + ' en ejecución', 'success');
    }
}

/** Filtro SQL por tenant cuando `usuarios` tiene tenant_id o cliente_id (misma lógica que la API). */
async function sqlFiltroUsuariosPorTenant() {
    try {
        const r = await sqlSimple(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name IN ('tenant_id','cliente_id')`
        );
        const names = new Set((r.rows || []).map((x) => x.column_name));
        const col = names.has('tenant_id') ? 'tenant_id' : names.has('cliente_id') ? 'cliente_id' : null;
        if (!col) return '';
        return ` AND ${col} = ${esc(tenantIdActual())}`;
    } catch (_) {
        return '';
    }
}

/** Lista de usuarios para mapas / asignación / nombres — siempre acotada al tenant actual si la columna existe. */
async function refrescarUsuariosCacheDesdeNeon() {
    if (!NEON_OK || modoOffline || !_sql) return;
    const wf = await sqlFiltroUsuariosPorTenant();
    const ru = await sqlSimple(`SELECT id, nombre, email, rol, telefono, COALESCE(whatsapp_notificaciones, true) AS whatsapp_notificaciones
        FROM usuarios WHERE activo = TRUE${wf} ORDER BY nombre`);
    app.usuariosCache = (ru.rows || []).map((row) => ({ ...row, rol: normalizarRolStr(row.rol) }));
}

async function asegurarNombreUsuariosParaFiltros() {
    if (!NEON_OK || modoOffline || !app.u || !_sql) return;
    if (app.usuariosCache && app.usuariosCache.length) return;
    try {
        await refrescarUsuariosCacheDesdeNeon();
    } catch (_) {}
}

async function cargarPedidos(opts) {
    const silent = !!(opts && opts.silent);
    if (!silent) {
        document.getElementById('pl').innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i> Cargando...</div>';
    }
    if (modoOffline) {
        
        app.p = offlinePedidos();
        render();
        return;
    }
    try {
        await asegurarNombreUsuariosParaFiltros();
        const tsql = await pedidosFiltroTenantSql();
        let qPed = `SELECT * FROM pedidos WHERE 1=1${tsql} ORDER BY fecha_creacion ASC`;
        if (esTecnicoOSupervisor()) {
            const verTodos = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
            if (!verTodos) {
                qPed = `SELECT * FROM pedidos WHERE tecnico_asignado_id = ${esc(parseInt(app.u.id, 10))}${tsql} ORDER BY fecha_creacion ASC`;
            }
        }
        const prevSnapTecnico =
            !esAdmin() && esTecnicoOSupervisor() && (app.p || []).length
                ? new Map((app.p || []).map(p => [String(p.id), { es: p.es, np: p.np, tai: p.tai }]))
                : null;
        const r = await ejecutarSQLConReintentos(qPed);
        const prevIds = new Set((app.p || []).map(p => p.id));
        app.p = (r.rows || []).map(norm);
        if (prevSnapTecnico) notificarCambiosPedidoTecnico(prevSnapTecnico);
        if (esAdmin() && app.p.length) {
            const mx = app.p.reduce((a, p) => Math.max(a, Number(p.id) || 0), 0);
            if (Number.isFinite(mx) && mx > 0) app._lastMaxPedidoIdSynced = mx;
        }
        // Nuevos pedidos: aviso al admin (lista + dashboard a veces se desincronizaban)
        if (esAdmin() && prevIds.size > 0) {
            const dosMinutosAtras = Date.now() - 2 * 60 * 1000;
            const nuevos = app.p.filter(p => !prevIds.has(p.id));
            nuevos.forEach(p => {
                const urgente = ['Crítica', 'Alta'].includes(p.pr) && p.es === 'Pendiente' &&
                    new Date(p.f).getTime() > dosMinutosAtras;
                if (urgente) {
                    mostrarAlertaPedidoUrgente(p);
                } else {
                    const tit = (p.tt || p.de || '').toString().trim().slice(0, 52);
                    toast(`Nuevo reclamo #${p.np || p.id}${tit ? ' — ' + tit : ''}`, 'info');
                }
            });
        }
        
        offlinePedidosSave(app.p);
    } catch(e) {
        console.warn('cargarPedidos: error, usando cache', e.message);
        setModoOffline(true);
        app.p = offlinePedidos();
        toast('Sin conexión — mostrando pedidos en caché', 'info');
    }
    render();
    try {
        refrescarDetalleSiAbiertoTrasSync();
    } catch (_) {}
    void enriquecerCoordsGeocodificadasPedidos();
}

/** Llamado desde Android (onResume) para traer cierres/cambios hechos por el admin en la web. */
window.gnSincronizarPedidosDesdeAndroid = function gnSincronizarPedidosDesdeAndroid() {
    if (!app.u || modoOffline || !NEON_OK || !_sql) return;
    void cargarPedidos({ silent: true });
};




function calcularEscalaReal(zoom) {
    
    
    const lat = app.map ? app.map.getCenter().lat : -31.5;
    const latRad = lat * Math.PI / 180;
    
    const resolucion = (40075016.686 * Math.cos(latRad)) / (256 * Math.pow(2, zoom));
    
    const el = document.getElementById('mc');
    const anchoPantalla = el ? el.clientWidth : 800;
    const metrosVisibles = resolucion * anchoPantalla;
    
    if (metrosVisibles < 1) return (metrosVisibles * 100).toFixed(0) + ' cm';
    if (metrosVisibles < 10) return metrosVisibles.toFixed(1) + ' m';
    if (metrosVisibles < 1000) return Math.round(metrosVisibles) + ' m';
    if (metrosVisibles < 10000) return (metrosVisibles / 1000).toFixed(1) + ' km';
    return Math.round(metrosVisibles / 1000) + ' km';
}










let _watchId         = null;  
let _circuloAcc      = null;  
let _mejorPrecision  = Infinity; 


function mostrarMarcadorUbicacion(lat, lon, acc, opts) {
    if (!app.map) return;

    
    if (marcadorUbicacion) {
        try { app.map.removeLayer(marcadorUbicacion); } catch(_) {}
        marcadorUbicacion = null;
    }
    
    if (_circuloAcc) {
        try { app.map.removeLayer(_circuloAcc); } catch(_) {}
        _circuloAcc = null;
    }

    const esBaseOficina = opts && opts.tipo === 'base_oficina';
    if (esBaseOficina) {
        const precisionZoom = 15;
        const svgIcon = L.divIcon({
            className: '',
            html: `<div style="
            width:18px;height:18px;
            background:#1d4ed8;
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 0 0 3px rgba(29,78,216,.35);
            position:relative;
        "></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            popupAnchor: [0, -10]
        });
        const paneGps = app.map.getPane && app.map.getPane('gnPaneGpsUser') ? 'gnPaneGpsUser' : undefined;
        const mk = { icon: svgIcon, zIndexOffset: 220 };
        if (paneGps) mk.pane = paneGps;
        marcadorUbicacion = L.marker([lat, lon], mk)
            .addTo(app.map)
            .bindPopup(`<div style="font-family:system-ui;min-width:180px">
                <b style="color:#1d4ed8">🏢 Ubicación base de oficina</b><br>
                <span style="font-size:10px;color:#94a3b8">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
            </div>`);
        return precisionZoom;
    }

    
    
    
    
    
    const precisionZoom = !acc ? 15
        : acc < 50   ? 17
        : acc < 500  ? 15
        : acc < 5000 ? 13
        : 11;

    
    const svgIcon = L.divIcon({
        className: '',
        html: `<div style="
            width:16px;height:16px;
            background:#10b981;
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 0 0 3px rgba(16,185,129,.4);
            ${gnMapaLigero() ? '' : 'animation:pulse-gps 2s infinite;'}
            position:relative;
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10]
    });

    const accTexto = acc
        ? (acc < 1000 ? `±${Math.round(acc)} m` : `±${(acc/1000).toFixed(1)} km`)
        : 'precisión desconocida';

    const tipoGps = !acc ? 'GPS'
        : acc < 100  ? '🛰️ GPS'
        : acc < 2000 ? '📶 WiFi/Red celular'
        : '🌐 Geolocalización por IP';

    const paneGps = app.map.getPane && app.map.getPane('gnPaneGpsUser') ? 'gnPaneGpsUser' : undefined;
    const mkGps = { icon: svgIcon, zIndexOffset: 200 };
    if (paneGps) mkGps.pane = paneGps;
    marcadorUbicacion = L.marker([lat, lon], mkGps)
        .addTo(app.map)
        .bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
                <b style="color:#059669">📍 Tu ubicación</b><br>
                <span style="font-size:11px;color:#475569">${tipoGps} — ${accTexto}</span><br>
                <span style="font-size:10px;color:#94a3b8">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
            </div>
        `);

    
    if (acc && acc > 50 && !gnMapaLigero()) {
        const radioVisual = Math.min(Math.max(acc * 0.12, 10), 38);
        const cOpt = {
            radius: radioVisual,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.07,
            weight: 1,
            dashArray: '4,6',
            interactive: false,
            bubblingMouseEvents: true
        };
        if (paneGps) cOpt.pane = paneGps;
        _circuloAcc = L.circle([lat, lon], cOpt).addTo(app.map);
    }

    return precisionZoom;
}






function solicitarUbicacion(centrarMapa = true, modoSilencioso = false, opts) {
    if (!navigator.geolocation) {
        if (!modoSilencioso) toast('Geolocalización no disponible en este dispositivo', 'error');
        return;
    }

    const fastUserAction = !!(opts && opts.fastUserAction);
    let intentos = 0;
    const MAX_INTENTOS = gnMapaLigero() ? 2 : 3;
    let centroInicialAplicado = false;

    function procesarPosicion(position, esWatchUpdate = false) {
        const { latitude, longitude, accuracy } = position.coords;
        const acc = Math.round(accuracy);
        registrarFajaInstalacionSiFalta(longitude);
        marcarGpsRecibidoEstaSesion();

        
        if (esWatchUpdate && acc >= _mejorPrecision && acc > 200) return;
        _mejorPrecision = Math.min(_mejorPrecision, acc);

        ultimaUbicacion = { lat: latitude, lon: longitude, acc };
        try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}

        if (app.map) {
            const zoomSugerido = mostrarMarcadorUbicacion(latitude, longitude, acc);
            if (centrarMapa && !centroInicialAplicado) {
                app.map.invalidateSize({ animate: false });
                
                const actualCenter = app.map.getCenter();
                const distLat = Math.abs(actualCenter.lat - latitude);
                const distLon = Math.abs(actualCenter.lng - longitude);
                const estaLejos = distLat > 0.05 || distLon > 0.05;
                if (estaLejos || !esWatchUpdate) {
                    const doAnimate = !fastUserAction && !gnMapaLigero();
                    app.map.setView([latitude, longitude], zoomSugerido, { animate: doAnimate });
                }
                centroInicialAplicado = true;
                setTimeout(() => {
                    document.getElementById('zoom-altura').textContent = calcularEscalaReal(app.map.getZoom());
                }, 300);
            }
        }

        
        if (!modoSilencioso && !esWatchUpdate) {
            const msg = acc < 100
                ? `📍 GPS: ±${acc}m`
                : acc < 2000
                ? `📶 WiFi/Red: ±${acc}m`
                : `🌐 IP: ±${(acc/1000).toFixed(0)}km — precisión baja`;
            toast(msg, acc < 2000 ? 'success' : 'info');
        }
    }

    function manejarError(error) {
        const msgs = {
            1: 'Permiso de ubicación denegado — activalo en Configuración',
            2: 'GPS no disponible',
            3: 'Tiempo de espera agotado'
        };
        if (!modoSilencioso) {
            toast(msgs[error.code] || 'Error de GPS', 'error');
        }
        
        if (ultimaUbicacion && app.map && centrarMapa) {
            app.map.invalidateSize({ animate: false });
            mostrarMarcadorUbicacion(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc);
            app.map.setView([ultimaUbicacion.lat, ultimaUbicacion.lon], 14, { animate: !fastUserAction && !gnMapaLigero() });
            if (!modoSilencioso) toast('📍 Mostrando última ubicación conocida', 'info');
        }
    }

    const geoOptsPrincipal = fastUserAction
        ? { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 }
        : { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };

    navigator.geolocation.getCurrentPosition(
        pos => {
            procesarPosicion(pos, false);

            if (!fastUserAction && pos.coords.accuracy > 100 && intentos < MAX_INTENTOS) {
                const intentarMejorar = () => {
                    if (intentos >= MAX_INTENTOS) return;
                    intentos++;
                    navigator.geolocation.getCurrentPosition(
                        p2 => {
                            procesarPosicion(p2, false);

                            if (p2.coords.accuracy > 100 && intentos < MAX_INTENTOS) {
                                setTimeout(intentarMejorar, 2000);
                            }
                        },
                        () => {},
                        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
                    );
                };
                setTimeout(intentarMejorar, 1500);
            }
        },
        manejarError,
        geoOptsPrincipal
    );

    
    
    
    
    if (!_watchId) {
        _watchId = navigator.geolocation.watchPosition(
            pos => {
                
                const { latitude, longitude, accuracy } = pos.coords;
                const acc = Math.round(accuracy);
                registrarFajaInstalacionSiFalta(longitude);
                ultimaUbicacion = { lat: latitude, lon: longitude, acc };
                try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}
                
                if (!app.map) return;
                marcarGpsRecibidoEstaSesion();
                if (gnMapaLigero()) {
                    const now = Date.now();
                    if (now - _gnLastWatchUbicacionMs < 45000) return;
                    _gnLastWatchUbicacionMs = now;
                }
                mostrarMarcadorUbicacion(latitude, longitude, acc);
            },
            err => console.warn('[GPS watch]', err.message),
            gnMapaLigero()
                ? { enableHighAccuracy: false, maximumAge: 20000, timeout: 20000 }
                : { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }
}

/** Lat/lng de oficina definidos por administrador (EMPRESA_CFG o columnas legadas). */
function parseEmpresaCfgLatLngBase() {
    const ec = window.EMPRESA_CFG || {};
    const latRaw =
        ec.lat_base != null && String(ec.lat_base).trim() !== ''
            ? ec.lat_base
            : ec.latitud != null && String(ec.latitud).trim() !== ''
              ? ec.latitud
              : null;
    const lngRaw =
        ec.lng_base != null && String(ec.lng_base).trim() !== ''
            ? ec.lng_base
            : ec.longitud != null && String(ec.longitud).trim() !== ''
              ? ec.longitud
              : null;
    const lat = latRaw != null ? Number.parseFloat(String(latRaw).trim()) : Number.NaN;
    const lng = lngRaw != null ? Number.parseFloat(String(lngRaw).trim()) : Number.NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) < 1e-7 && Math.abs(lng) < 1e-7) return null;
    return { lat, lng };
}

/**
 * Ubicación central del tenant (manual / admin). Prioridad sobre GPS al usar «Ir a mi ubicación» en el mapa.
 * Primero memoria (EMPRESA_CFG); si falta, GET público /api/config/ubicacion-central (p. ej. técnicos sin merge admin).
 */
async function resolverUbicacionCentralTenantParaMapa() {
    const direct = parseEmpresaCfgLatLngBase();
    if (direct) return { ...direct, source: 'empresa_cfg' };
    const base = String(getApiBaseUrl() || '').trim();
    if (!base || typeof fetch !== 'function') return null;
    const tid = tenantIdActual();
    if (!Number.isFinite(tid) || tid < 1) return null;
    try {
        const headers = { Accept: 'application/json' };
        const tok = typeof getApiToken === 'function' ? getApiToken() : null;
        if (tok) headers.Authorization = `Bearer ${tok}`;
        const url = `${base.replace(/\/+$/, '')}/api/config/ubicacion-central?tenant_id=${encodeURIComponent(String(tid))}`;
        const r = await fetch(url, { cache: 'no-store', headers });
        if (!r.ok) return null;
        const j = await r.json();
        const lat = Number(j.lat);
        const lng = Number(j.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng, source: 'api' };
    } catch (_) {
        return null;
    }
}

async function irAMiUbicacionEnMapa() {
    await ensureMapReady();
    if (!app.map) {
        toast('No se pudo cargar el mapa', 'error');
        return;
    }
    if (esAndroidWebViewMapa()) {
        if (ultimaUbicacion && Number.isFinite(ultimaUbicacion.lat) && Number.isFinite(ultimaUbicacion.lon)) {
            const z = mostrarMarcadorUbicacion(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc || 0);
            app.map.invalidateSize({ animate: false });
            app.map.setView([ultimaUbicacion.lat, ultimaUbicacion.lon], z, { animate: false });
            try {
                const zEl = document.getElementById('zoom-altura');
                if (zEl) zEl.textContent = calcularEscalaReal(app.map.getZoom());
            } catch (_) {}
        }
        solicitarUbicacion(true, false, { fastUserAction: true });
        return;
    }
    const central = await resolverUbicacionCentralTenantParaMapa();
    if (central && Number.isFinite(central.lat) && Number.isFinite(central.lng)) {
        const z = mostrarMarcadorUbicacion(central.lat, central.lng, 0, { tipo: 'base_oficina' });
        app.map.invalidateSize({ animate: false });
        app.map.setView([central.lat, central.lng], Math.max(z || 15, 14), { animate: false });
        try {
            const zEl = document.getElementById('zoom-altura');
            if (zEl) zEl.textContent = calcularEscalaReal(app.map.getZoom());
        } catch (_) {}
        toast('📍 Centro en ubicación base de oficina (configuración del administrador)', 'info');
        return;
    }
    if (ultimaUbicacion && Number.isFinite(ultimaUbicacion.lat) && Number.isFinite(ultimaUbicacion.lon)) {
        const z = mostrarMarcadorUbicacion(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc || 0);
        app.map.invalidateSize({ animate: false });
        app.map.setView([ultimaUbicacion.lat, ultimaUbicacion.lon], z, { animate: false });
        try {
            const zEl = document.getElementById('zoom-altura');
            if (zEl) zEl.textContent = calcularEscalaReal(app.map.getZoom());
        } catch (_) {}
        solicitarUbicacion(true, true, { fastUserAction: true });
        return;
    }
    solicitarUbicacion(true, false, { fastUserAction: true });
}
window.irAMiUbicacionEnMapa = irAMiUbicacionEnMapa;

async function abrirNuevoPedidoEnCoordenadas(lat, lng, acc) {
    if (typeof window.gnMapaDebeBloquearCargaPedidoDesdeMapa === 'function' && window.gnMapaDebeBloquearCargaPedidoDesdeMapa()) {
        toast('Esperá unos segundos: aviso de reclamo nuevo.', 'info');
        return;
    }
    await ensureMapReady();
    if (!app.map) {
        toast('No se pudo cargar el mapa', 'error');
        return;
    }
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
        toast('Coordenadas no válidas', 'error');
        return;
    }
    const Lref = window.L;
    if (!Lref || typeof Lref.latLng !== 'function') {
        toast('Mapa no listo', 'error');
        return;
    }
    app.sel = Lref.latLng(latN, lngN);
    limpiarFotosYPreviewNuevoPedido();
    const li = document.getElementById('li');
    const gi = document.getElementById('gi');
    const pm = document.getElementById('pm');
    if (!li || !gi || !pm) return;
    li.value = String(latN);
    gi.value = String(lngN);
    syncWrapCoordsDisplayNuevoPedido();
    const ui = document.getElementById('ui');
    if (ui) {
        ui.innerHTML = htmlLineaUbicacionFormulario(latN, lngN, acc != null && acc !== '' ? acc : null);
        ui.className = 'ud sel';
    }
    try {
        poblarSelectTiposReclamo();
        syncNisClienteReclamoConexionUI();
    } catch (_) {}
    pm.classList.add('active');
    const z = mostrarMarcadorUbicacion(latN, lngN, acc != null ? acc : null);
    app.map.invalidateSize({ animate: false });
    app.map.setView([latN, lngN], z || 16, { animate: !gnMapaLigero() });
    try {
        const zEl = document.getElementById('zoom-altura');
        if (zEl) zEl.textContent = calcularEscalaReal(app.map.getZoom());
    } catch (_) {}
}
window.abrirNuevoPedidoEnCoordenadas = abrirNuevoPedidoEnCoordenadas;

async function nuevoPedidoDesdeUbicacionActual() {
    await ensureMapReady();
    if (ultimaUbicacion && Number.isFinite(ultimaUbicacion.lat) && Number.isFinite(ultimaUbicacion.lon)) {
        await abrirNuevoPedidoEnCoordenadas(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc);
        return;
    }
    if (!navigator.geolocation) {
        toast('GPS no disponible en este dispositivo', 'error');
        return;
    }
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 14000,
                maximumAge: 0
            });
        });
        const { latitude, longitude, accuracy } = pos.coords;
        registrarFajaInstalacionSiFalta(longitude);
        const accR = Math.round(accuracy || 0);
        ultimaUbicacion = { lat: latitude, lon: longitude, acc: accR };
        try {
            localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion));
        } catch (_) {}
        await abrirNuevoPedidoEnCoordenadas(latitude, longitude, accR);
    } catch (_) {
        toast('No se pudo obtener la ubicación. Probá «Ir a mi ubicación» primero.', 'error');
    }
}
window.nuevoPedidoDesdeUbicacionActual = nuevoPedidoDesdeUbicacionActual;

let mapViewImportPromise = null;
function loadMapViewModule() {
    if (!mapViewImportPromise) mapViewImportPromise = import('./map-view.js');
    return mapViewImportPromise;
}

function buildMapViewCtx() {
    return {
        app,
        getApiBaseUrl,
        tenantIdActual,
        get L() { return window.L; },
        document,
        window,
        toast,
        gnMapaLigero,
        aplicarUIMapaPlataforma,
        renderMk,
        registrarFajaInstalacionSiFalta,
        htmlLineaUbicacionFormulario,
        syncWrapCoordsDisplayNuevoPedido,
        poblarSelectTiposReclamo,
        syncNisClienteReclamoConexionUI,
        limpiarFotosYPreviewNuevoPedido,
        esAndroidWebViewMapa,
        mapTapUbicacionInicialHechaSesion,
        get _gpsRecibidoEstaSesion() { return _gpsRecibidoEstaSesion; },
        marcarMapTapUbicacionInicialHecha,
        solicitarUbicacion,
        registrarUbicacionManualAdmin,
        get _modoFijarUbicacionAdmin() { return _modoFijarUbicacionAdmin; },
        set _modoFijarUbicacionAdmin(v) { _modoFijarUbicacionAdmin = v; },
        get mapaInicializado() { return mapaInicializado; },
        set mapaInicializado(v) { mapaInicializado = v; },
        get marcadorUbicacion() { return marcadorUbicacion; },
        set marcadorUbicacion(v) { marcadorUbicacion = v; },
        get _circuloAcc() { return _circuloAcc; },
        set _circuloAcc(v) { _circuloAcc = v; },
        get _mapEscalaDebounceTimer() { return _mapEscalaDebounceTimer; },
        set _mapEscalaDebounceTimer(v) { _mapEscalaDebounceTimer = v; },
        get ultimaUbicacion() { return ultimaUbicacion; },
        set ultimaUbicacion(v) { ultimaUbicacion = v; },
        calcularEscalaReal,
        mostrarMarcadorUbicacion,
        scheduleMapRetry: () => { void initMap(); }
    };
}

async function refreshMapAdminBaseMarkerIfReady() {
    try {
        if (!mapaInicializado || !app.map) return;
        const mod = await loadMapViewModule();
        if (typeof mod.gnRefreshMarcadorUbicacionBaseAdmin === 'function') {
            await mod.gnRefreshMarcadorUbicacionBaseAdmin();
        }
    } catch (_) {}
}

async function initMap() {
    const mod = await loadMapViewModule();
    mod.setMapViewContext(buildMapViewCtx());
    await mod.runInitMap();
}

let _mapLazyQueued = false;
function queueLazyInitMap() {
    if (_mapLazyQueued) return;
    _mapLazyQueued = true;
    const run = () => {
        void initMap().finally(() => {
            try { renderMk(); } catch (_) {}
        });
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 3500 });
    } else {
        setTimeout(run, 400);
    }
}

async function ensureMapReady() {
    if (mapaInicializado && app.map) return;
    _mapLazyQueued = true;
    await initMap();
    try { renderMk(); } catch (_) {}
}
window.ensureMapReady = ensureMapReady;

const btnMapaIrGps = document.getElementById('btn-mapa-ir-gps');
if (btnMapaIrGps) btnMapaIrGps.addEventListener('click', () => irAMiUbicacionEnMapa());
const btnMapaNuevoGps = document.getElementById('btn-mapa-nuevo-gps');
if (btnMapaNuevoGps) btnMapaNuevoGps.addEventListener('click', () => void nuevoPedidoDesdeUbicacionActual());

function renderMk() {
    if (!app.map) return;
    app.mk.forEach(m => m.remove());
    app.mk = [];
    
    const fill = {
        'Crítica': '#ef4444',
        'Alta': '#f97316',
        'Media': '#eab308',
        'Baja': '#3b82f6'
    };
    const panePed = app.map.getPane && app.map.getPane('gnPanePedidos') ? 'gnPanePedidos' : undefined;

    const chkNp = document.getElementById('mapa-chk-label-np');
    const showNp = chkNp ? chkNp.checked : (localStorage.getItem('pmg_map_labels_np') === '1');
    pedidosParaMarcadoresMapa().forEach(p => {
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
        const cer = p.es === 'Cerrado' || p.es === 'Derivado externo';
        const col = cer ? '#94a3b8' : (fill[p.pr] || '#3b82f6');
        const npEsc = String(p.np || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        let m;
        if (showNp) {
            const icon = L.divIcon({
                className: '',
                html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
                    <div style="margin-bottom:2px;background:${col};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(255,255,255,.85)">#${npEsc}</div>
                    <div style="width:13px;height:13px;background:${col};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>
                </div>`,
                iconSize: [100, 36],
                iconAnchor: [50, 36]
            });
            const mkOpt = { icon, zIndexOffset: cer ? 200 : 500 };
            if (panePed) mkOpt.pane = panePed;
            m = L.marker([la, ln], mkOpt).addTo(app.map);
        } else {
            const cmOpt = {
                radius: cer ? 6 : 9,
                fillColor: col,
                color: '#fff',
                weight: 2,
                fillOpacity: cer ? 0.5 : 0.9
            };
            if (panePed) cmOpt.pane = panePed;
            m = L.circleMarker([la, ln], cmOpt).addTo(app.map);
        }
        try {
            m._gnPedidoId = p.id;
        } catch (_) {}
        m.bindPopup(`
            <div style="min-width:160px;font-family:system-ui">
                <b style="color:#1e3a8a">#${p.np}</b> · <span style="font-size:11px;color:#475569">${p.pr}</span><br>
                <span style="font-size:11px;color:#334155">${p.tt}</span><br>
                <span style="font-size:11px;font-weight:600;color:#0f172a">${p.es}</span>${p.es !== 'Cerrado' ? ` · Av. ${p.av}%` : ''}<br>
                <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
                    <button style="flex:1;min-width:72px;padding:4px;background:#1e3a8a;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_d('${p.id}')">Detalle</button>
                    <button style="flex:1;min-width:72px;padding:4px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:11px" onclick="_z('${p.id}')">Zoom</button>
                    ${esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && (p.tai == null) ? `<button style="flex:1;min-width:72px;padding:4px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_assignMapa('${p.id}')">Asignar</button>` : ''}
                    ${esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && (p.tai != null) ? `<button style="flex:1;min-width:72px;padding:4px;background:#ea580c;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_assignMapa('${p.id}')">Reasignar</button><button style="flex:1;min-width:72px;padding:4px;background:#64748b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_desasignarMapa('${p.id}')">Desasignar</button>` : ''}
                    ${esAdmin() && puedeEnviarApiRestPedidos() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && !pedidoEsDerivadoFuera(p) ? `<button style="flex:1;min-width:100%;padding:4px;background:#7c3aed;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px;margin-top:4px" onclick="_moverUbicMapa('${p.id}')"><i class="fas fa-arrows-alt"></i> Corregir posición</button>` : ''}
                </div>
            </div>`, { maxWidth: 260 });
        
        app.mk.push(m);
    });
}

/** Tras tocar un botón del popup de Leaflet, el mismo gesto puede generar un click en el mapa (p. ej. WebView Android). */
function suppressNextMapClickFromPopup(ms = 520) {
    try {
        window._gnSuppressMapClickUntil = Date.now() + ms;
    } catch (_) {}
}
window.suppressNextMapClickFromPopup = suppressNextMapClickFromPopup;

window._d = id => {
    suppressNextMapClickFromPopup(550);
    app.map?.closePopup();
    const p = app.p.find(x => String(x.id) === String(id));
    if (p) void detalle(p);
    else toast('No se encontró el pedido en la lista actual. Actualizá el listado e intentá de nuevo.', 'warning');
};

window._z = id => {
    suppressNextMapClickFromPopup(550);
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) return;
    void (async () => {
        await ensureMapReady();
        if (!app.map) return;
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) {
            toast('Este pedido no tiene ubicación GPS ni domicilio geocodificable aún.', 'warning');
            return;
        }
        app.map.closePopup();
        app.map.setView([la, ln], 17, { animate: true });
        setTimeout(() => {
            document.getElementById('zoom-altura').textContent = calcularEscalaReal(app.map.getZoom());
        }, 300);
    })();
};

window._assignMapa = id => {
    suppressNextMapClickFromPopup(550);
    try { app.map?.closePopup(); } catch (_) {}
    abrirModalAsignarTecnico(id);
};

window._desasignarMapa = id => {
    suppressNextMapClickFromPopup(550);
    try { app.map?.closePopup(); } catch (_) {}
    ejecutarDesasignarPedidoPorId(id, { confirmar: true });
};

let _moverUbicMapaState = null;
try {
    window.__gnEsReubicarPedidoMapa = function () {
        return _moverUbicMapaState != null;
    };
} catch (_) {}

function cancelarMoverUbicacionMapa() {
    if (!_moverUbicMapaState) return;
    try {
        if (_moverUbicMapaState.marker) _moverUbicMapaState.marker.remove();
        if (_moverUbicMapaState.onMapClick && app.map) app.map.off('click', _moverUbicMapaState.onMapClick);
    } catch (_) {}
    if (_moverUbicMapaState.barEl?.parentNode) _moverUbicMapaState.barEl.remove();
    _moverUbicMapaState = null;
    try {
        if (app.map) {
            app.map.getContainer().style.cursor = '';
            app.map.dragging.enable();
        }
    } catch (_) {}
}

async function confirmarMoverUbicacionMapa() {
    if (!_moverUbicMapaState?.marker || !_moverUbicMapaState.pedidoId) return;
    const ll = _moverUbicMapaState.marker.getLatLng();
    const la = ll.lat;
    const ln = ll.lng;
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
        toast('Coordenadas inválidas.', 'error');
        return;
    }
    if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) {
        toast('No se acepta la posición 0,0.', 'error');
        return;
    }
    const pid = _moverUbicMapaState.pedidoId;
    cancelarMoverUbicacionMapa();
    await persistirCoordsManualPedidoPanel(pid, la, ln);
}

window._moverUbicMapa = function (pedidoId) {
    if (!esAdmin() || !puedeEnviarApiRestPedidos()) {
        toast('Solo administrador con API activa puede corregir la posición.', 'warning');
        return;
    }
    const p = app.p.find((x) => String(x.id) === String(pedidoId));
    if (!p) {
        toast('Pedido no encontrado en la lista.', 'error');
        return;
    }
    if (p.es === 'Cerrado' || p.es === 'Derivado externo' || pedidoEsDerivadoFuera(p)) {
        toast('No se puede mover la ubicación de un pedido cerrado o derivado.', 'warning');
        return;
    }
    void (async () => {
        suppressNextMapClickFromPopup(550);
        await ensureMapReady();
        if (!app.map || typeof L === 'undefined') return;
        cancelarMoverUbicacionMapa();
        try {
            app.map.closePopup();
        } catch (_) {}
        const { la: la0, ln: ln0 } = coordsEfectivasPedidoMapa(p);
        let la = la0;
        let ln = ln0;
        if (!Number.isFinite(la) || !Number.isFinite(ln)) {
            const c = app.map.getCenter();
            la = c.lat;
            ln = c.lng;
        }
        const mk = L.marker([la, ln], { draggable: true, zIndexOffset: 900 }).addTo(app.map);
        app.map.panTo([la, ln], { animate: true });
        const bar = document.createElement('div');
        bar.setAttribute('role', 'toolbar');
        bar.style.cssText =
            'position:fixed;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:12000;background:#1e293b;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.35);font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:min(96vw,28rem)';
        bar.innerHTML =
            '<span style="opacity:.95">Arrastrá el pin o tocá el mapa para moverlo.</span>' +
            '<button type="button" style="background:#059669;color:#fff;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:600">Confirmar</button>' +
            '<button type="button" style="background:#64748b;color:#fff;border:none;padding:6px 12px;border-radius:8px;cursor:pointer">Cancelar</button>';
        document.body.appendChild(bar);
        const [btnOk, btnCan] = bar.querySelectorAll('button');
        btnOk.addEventListener('click', () => void confirmarMoverUbicacionMapa());
        btnCan.addEventListener('click', () => {
            cancelarMoverUbicacionMapa();
            toast('Corrección de posición cancelada.', 'info');
        });
        const onMapClick = (ev) => {
            if (!_moverUbicMapaState?.marker) return;
            _moverUbicMapaState.marker.setLatLng(ev.latlng);
        };
        app.map.on('click', onMapClick);
        try {
            app.map.getContainer().style.cursor = 'crosshair';
        } catch (_) {}
        _moverUbicMapaState = { pedidoId: p.id, marker: mk, onMapClick, barEl: bar };
    })();
};

window._a = (a, id) => {
    if (a === 'i') {
        void iniciar(id);
        return;
    }
    if (a === 'av') {
        abrirAvance(id);
        return;
    }
    closeAll();
    void abrirCierre(id);
};

window._zm = id => {
    void (async () => {
        const pid = String(id ?? '').trim();
        if (!pid) return;

        let p = app.p.find((x) => String(x.id) === pid);
        if (!p && !modoOffline && NEON_OK && _sql) {
            try {
                const pidNum = parseInt(pid, 10);
                if (Number.isFinite(pidNum)) {
                    const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(pidNum)} LIMIT 1`);
                    const row = rr.rows?.[0];
                    if (row) {
                        p = norm(row);
                        const idx = app.p.findIndex((x) => String(x.id) === String(p.id));
                        if (idx >= 0) app.p[idx] = p;
                        else app.p.unshift(p);
                    }
                }
            } catch (_) {}
        }
        if (!p) {
            toast('No se encontró el pedido para centrar el mapa.', 'warning');
            return;
        }

        try {
            document.getElementById('ls')?.classList.remove('active');
            document.getElementById('ms')?.classList.add('active');
            cerrarAdminPanel();
            document.getElementById('gw')?.classList.remove('active');
            const dm = document.getElementById('dm');
            if (dm?.classList.contains('active')) {
                dm.classList.remove('active');
                try {
                    delete dm.dataset.detallePedidoId;
                } catch (_) {}
            }
        } catch (_) {}

        await ensureMapReady();
        if (!app.map) return;
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) {
            toast('Este pedido no tiene coordenadas en el mapa (sin GPS ni geocódigo de calle).', 'warning');
            return;
        }
        const openPedidoPopup = () => {
            try {
                const layer = app.mk?.find(
                    (m) => m && m._gnPedidoId != null && String(m._gnPedidoId) === String(p.id)
                );
                if (layer && typeof layer.openPopup === 'function') layer.openPopup();
            } catch (_) {}
        };

        const leerZoomMaxMapa = () => {
            try {
                const mz = app.map.getMaxZoom();
                return Number.isFinite(mz) && mz > 0 ? mz : 18;
            } catch (_) {
                return 18;
            }
        };

        const runZoom = (withPopup) => {
            if (!app.map) return;
            try {
                app.map.invalidateSize({ animate: false });
            } catch (_) {}
            try {
                renderMk();
            } catch (_) {}
            const z = leerZoomMaxMapa();
            try {
                app.map.setView([la, ln], z, { animate: !esAndroidWebViewMapa() });
            } catch (_) {}
            if (withPopup) {
                openPedidoPopup();
                requestAnimationFrame(() => openPedidoPopup());
                setTimeout(openPedidoPopup, esAndroidWebViewMapa() ? 200 : 80);
            }
            setTimeout(() => {
                try {
                    document.getElementById('zoom-altura').textContent = calcularEscalaReal(app.map.getZoom());
                } catch (_) {}
            }, 320);
        };

        const delay0 = esAndroidWebViewMapa() ? 220 : 120;
        setTimeout(() => {
            runZoom(true);
            if (esAndroidWebViewMapa()) {
                setTimeout(() => {
                    try {
                        app.map.invalidateSize({ animate: false });
                    } catch (_) {}
                    try {
                        renderMk();
                    } catch (_) {}
                    const z2 = leerZoomMaxMapa();
                    try {
                        app.map.setView([la, ln], z2, { animate: false });
                    } catch (_) {}
                    openPedidoPopup();
                    requestAnimationFrame(() => {
                        try {
                            app.map.invalidateSize({ animate: false });
                        } catch (_) {}
                        try {
                            app.map.setView([la, ln], z2, { animate: false });
                        } catch (_) {}
                        openPedidoPopup();
                    });
                    setTimeout(openPedidoPopup, 180);
                }, 380);
            }
        }, delay0);
    })();
};

// ── Notificaciones a usuarios (admin → técnico, cola en Neon + Android) ──
let _pedidoNotifContext = null;
let _assignPedidoId = null;
let _pollNotifMovilInterval = null;
const KEY_PENDING_NOTIF_PEDIDO_ID = 'pmg_pending_notif_pedido_id';

function guardarPedidoPendienteDesdeNotif(pedidoId) {
    if (!pedidoId) return;
    try { localStorage.setItem(KEY_PENDING_NOTIF_PEDIDO_ID, String(pedidoId)); } catch(_) {}
}

function borrarPedidoPendienteDesdeNotif() {
    try { localStorage.removeItem(KEY_PENDING_NOTIF_PEDIDO_ID); } catch(_) {}
}

function leerPedidoPendienteDesdeNotif() {
    try { return localStorage.getItem(KEY_PENDING_NOTIF_PEDIDO_ID) || ''; } catch(_) { return ''; }
}

async function enfocarPedidoDesdeNotif(pedidoId, opts = {}) {
    const pid = String(pedidoId || '').trim();
    if (!pid || !app.u) return false;

    try {
        document.getElementById('ls')?.classList.remove('active');
        document.getElementById('ms')?.classList.add('active');
        cerrarAdminPanel();
        document.getElementById('gw')?.classList.remove('active');
    } catch (_) {}

    let pedido = app.p.find((x) => String(x.id) === pid);
    if (!pedido && !modoOffline && NEON_OK && _sql) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(parseInt(pid, 10))} LIMIT 1`);
            const row = rr.rows?.[0];
            if (row) {
                pedido = norm(row);
                const idx = app.p.findIndex((x) => String(x.id) === String(pedido.id));
                if (idx >= 0) app.p[idx] = pedido;
                else app.p.unshift(pedido);
            }
        } catch (_) {}
    }
    if (!pedido) return false;

    await ensureMapReady();
    if (!app.map) return false;

    try {
        closeAll();
        void detalle(pedido);
        _zm(String(pedido.id));
        if (opts.scrollDerivacion) {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const el = document.getElementById('gn-focus-derivacion-pedido');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 180);
            });
        }
        if (!opts.silent) toast('📍 Pedido #' + (pedido.np || pedido.id) + ' centrado en el mapa', 'info');
        return true;
    } catch (_) {
        return false;
    }
}

async function resolverFocoPedidoNotificacion(pedidoId, opts = {}) {
    const pid = String(pedidoId || '').trim();
    if (!pid) return;
    guardarPedidoPendienteDesdeNotif(pid);
    const ok = await enfocarPedidoDesdeNotif(pid, opts);
    if (ok) borrarPedidoPendienteDesdeNotif();
}

window.handleAndroidIntentPedidoId = function (pedidoId) {
    resolverFocoPedidoNotificacion(pedidoId, { silent: true });
};

async function consumirPedidoPendienteDesdeNotif() {
    const pid = leerPedidoPendienteDesdeNotif();
    if (!pid) return;
    const ok = await enfocarPedidoDesdeNotif(pid, { silent: true });
    if (ok) borrarPedidoPendienteDesdeNotif();
}

function llenarSelectUsuariosNotif() {
    const sel = document.getElementById('notif-usuario-select');
    if (!sel) return;
    sel.innerHTML = '';
    const list = app.usuariosCache || [];
    list.forEach(u => {
        if (String(u.id) === String(app.u?.id)) return;
        if (normalizarRolStr(u.rol) === 'admin') return;
        const o = document.createElement('option');
        o.value = u.id;
        const tel = (u.telefono || '').trim();
        o.textContent = (u.nombre || 'Usuario') + (u.email ? ' — ' + u.email : '') + (tel ? ' — ' + tel : ' — sin teléfono');
        sel.appendChild(o);
    });
    if (!sel.options.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'No hay técnicos activos';
        sel.appendChild(o);
    }
}

function normalizarTelefonoWhatsapp(raw) {
    let t = String(raw || '').trim();
    if (!t) return '';
    t = t.replace(/[^\d+]/g, '');
    if (t.startsWith('00')) t = '+' + t.substring(2);
    if (t.startsWith('+')) return t;
    return '+' + t;
}

function esTelefonoWhatsappValido(tel) {
    return /^\+\d{10,15}$/.test(String(tel || '').trim());
}
async function enviarWhatsappMetaTecnico(uid, pedidoId, mensaje) {
    try {
        const tk = getApiToken();
        if (!tk) return;
        const u = (app.usuariosCache || []).find(x => String(x.id) === String(uid));
        if (!u) return;
        const tel = normalizarTelefonoWhatsapp(u.telefono || '');
        if (!tel || u.whatsapp_notificaciones === false) return;
        await fetch(apiUrl('/api/whatsapp/meta/enviar-texto'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tk}`
            },
            body: JSON.stringify({
                telefono: tel,
                mensaje: String(mensaje || ''),
                destinatario_id: Number(uid),
                pedido_id: Number(pedidoId || 0) || null
            })
        });
    } catch (e) {
        console.warn('[whatsapp-meta]', e?.message || e);
    }
}

function cerrarModalNotifPedido() {
    _pedidoNotifContext = null;
}

function llenarSelectAssignTecnico() {
    const sel = document.getElementById('assign-tecnico-select');
    if (!sel) return;
    sel.innerHTML = '';
    const list = app.usuariosCache || [];
    list.forEach(u => {
        if (String(u.id) === String(app.u?.id)) return;
        if (normalizarRolStr(u.rol) === 'admin') return;
        const o = document.createElement('option');
        o.value = u.id;
        o.textContent = (u.nombre || 'Usuario') + ' (' + (u.rol || '') + ')';
        sel.appendChild(o);
    });
    if (!sel.options.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'No hay técnicos/supervisores';
        sel.appendChild(o);
    }
}

window.abrirModalAsignarTecnico = async function (pedidoId) {
    if (!esAdmin()) {
        toast('Solo administrador puede asignar', 'error');
        return;
    }
    _assignPedidoId = pedidoId;
    try {
        await refrescarUsuariosCacheDesdeNeon();
    } catch (e) {
        logErrorWeb('refresh-usuarios-cache-asignar', e);
    }
    llenarSelectAssignTecnico();
    const sel = document.getElementById('assign-tecnico-select');
    const p = app.p.find(x => String(x.id) === String(pedidoId));
    const tieneAsignado = p && p.tai != null;
    const tit = document.getElementById('assign-modal-title');
    if (tit) tit.innerHTML = tieneAsignado
        ? '<i class="fas fa-user-hard-hat"></i> Reasignar técnico'
        : '<i class="fas fa-user-hard-hat"></i> Asignar técnico';
    const btnDes = document.getElementById('btn-desasignar-tecnico');
    if (btnDes) btnDes.style.display = tieneAsignado ? 'inline-flex' : 'none';
    const btnOk = document.getElementById('btn-confirmar-asignar-tecnico');
    if (!sel) return;
    if (!tieneAsignado && !sel.value) {
        toast('Cargá usuarios en el panel o creá técnicos', 'error');
        return;
    }
    if (btnOk) btnOk.disabled = !sel.value;
    sel.onchange = () => { if (btnOk) btnOk.disabled = !sel.value; };
    const msg = document.getElementById('assign-tecnico-msg');
    if (msg) msg.value = '';
    document.getElementById('modal-asignar-tecnico')?.classList.add('active');
};

async function abrirModalNotificarPedidoPorId(pedidoId) {
    abrirModalAsignarTecnico(pedidoId);
}

window._notificarPedidoMapa = function (pid) {
    if (pid) abrirModalAsignarTecnico(pid);
};
window._notificarPedidoMapaAdmin = function (pid) {
    if (pid) abrirModalAsignarTecnico(pid);
};

async function confirmarEnviarNotifPedido() {
    const sel = document.getElementById('assign-tecnico-select');
    const uid = parseInt(sel?.value || '', 10);
    if (!uid || !_assignPedidoId) {
        toast('Elegí un técnico', 'error');
        return;
    }
    const msgExtra = (document.getElementById('assign-tecnico-msg')?.value || '').trim();
    const p = app.p.find(x => String(x.id) === String(_assignPedidoId));
    const oldTai = p && p.tai != null ? parseInt(p.tai, 10) : null;
    if (oldTai === uid) {
        toast('Ese técnico ya está asignado al pedido', 'info');
        return;
    }
    const titulo = oldTai && oldTai !== uid ? 'Pedido reasignado' : 'Pedido asignado';
    const cuerpo = msgExtra || ('Pedido ' + (p?.np || '#' + _assignPedidoId) + ' — revisá el mapa');
    const now = new Date().toISOString();
    const pidNum = parseInt(_assignPedidoId, 10);
    try {
        await updPedido(_assignPedidoId, {
            tecnico_asignado_id: uid,
            fecha_asignacion: now,
            estado: 'Asignado'
        }, app.u?.id);
        if (oldTai && oldTai !== uid) {
            const tOld = 'Pedido reasignado';
            const cOld = msgExtra || ('Ya no estás asignado a ' + (p?.np || '#' + _assignPedidoId));
            await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida) VALUES (${esc(oldTai)}, ${esc(pidNum)}, ${esc(tOld)}, ${esc(cOld)}, FALSE)`);
            await enviarWhatsappMetaTecnico(oldTai, pidNum, `${tOld}: ${cOld}`);
        }
        await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida) VALUES (${esc(uid)}, ${esc(pidNum)}, ${esc(titulo)}, ${esc(cuerpo)}, FALSE)`);
        await enviarWhatsappMetaTecnico(uid, pidNum, `${titulo}: ${cuerpo}`);
        document.getElementById('modal-asignar-tecnico')?.classList.remove('active');
        _assignPedidoId = null;
        try {
            const dm = document.getElementById('dm');
            if (dm?.classList.contains('active') && String(dm.dataset.detallePedidoId) === String(pidNum)) {
                dm.classList.remove('active');
                delete dm.dataset.detallePedidoId;
            }
        } catch (_) {}
        toast(oldTai && oldTai !== uid ? 'Reasignado y notificaciones enviadas' : 'Técnico asignado y notificación encolada', 'success');
        await cargarPedidos();
        render();
    } catch (e) {
        toastError('asignar-tecnico', e);
    }
}

async function ejecutarDesasignarPedidoPorId(pedidoId, opts) {
    const id = pedidoId != null ? String(pedidoId) : (_assignPedidoId != null ? String(_assignPedidoId) : '');
    if (!id) return;
    const p = app.p.find(x => String(x.id) === String(id));
    const oldUid = p && p.tai != null ? parseInt(p.tai, 10) : null;
    if (!oldUid) {
        toast('No hay técnico asignado', 'info');
        return;
    }
    if (opts && opts.confirmar && !confirm('¿Desasignar al técnico de este pedido? El estado volverá a Pendiente.')) return;
    const pidNum = parseInt(id, 10);
    try {
        await updPedido(id, {
            tecnico_asignado_id: null,
            fecha_asignacion: null,
            estado: 'Pendiente'
        }, app.u?.id);
        const tOld = 'Pedido desasignado';
        const cOld = 'Te quitaron la asignación de ' + (p?.np || '#' + id) + '. Revisá el mapa.';
        await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida) VALUES (${esc(oldUid)}, ${esc(pidNum)}, ${esc(tOld)}, ${esc(cOld)}, FALSE)`);
        await enviarWhatsappMetaTecnico(oldUid, pidNum, `${tOld}: ${cOld}`);
        document.getElementById('modal-asignar-tecnico')?.classList.remove('active');
        _assignPedidoId = null;
        toast('Técnico desasignado; notificación enviada', 'success');
        await cargarPedidos();
        render();
    } catch (e) {
        toastError('desasignar-tecnico', e);
    }
}

async function confirmarDesasignarPedido() {
    if (!_assignPedidoId) return;
    await ejecutarDesasignarPedidoPorId(_assignPedidoId, { confirmar: true });
}
window.confirmarDesasignarPedido = confirmarDesasignarPedido;
window.ejecutarDesasignarPedidoPorId = ejecutarDesasignarPedidoPorId;

let _pollNotifMovilUsaColumnaLeida = true;

window.pollNotificacionesMovil = async function () {
    if (!app.u || modoOffline || !NEON_OK || !_sql) return;
    const uid = app.u.id;
    const filtroLeida = _pollNotifMovilUsaColumnaLeida ? ' AND leida = FALSE' : '';
    try {
        const r = await sqlSimple(
            `SELECT id, titulo, cuerpo, pedido_id FROM notificaciones_movil WHERE usuario_id = ${esc(uid)}${filtroLeida} ORDER BY id ASC LIMIT 15`
        );
        const rows = r.rows || [];
        const tienePuente = window.AndroidLocalNotify && typeof window.AndroidLocalNotify.show === 'function';
        const esAdm = esAdmin();
        for (const row of rows) {
            const t = row.titulo || 'GestorNova';
            const b = row.cuerpo || '';
            const pid = row.pedido_id != null ? String(row.pedido_id) : '';
            const esNotifRegeo = typeof b === 'string' && b.startsWith('GN_REGEO_LOG_V1\n');
            if (esAdm && esNotifRegeo) {
                try {
                    const raw = b.slice('GN_REGEO_LOG_V1\n'.length);
                    const data = JSON.parse(raw);
                    const lines = Array.isArray(data.log) ? data.log : [];
                    let inner = `<div><p style="margin:0 0 .5rem;font-size:.9rem"><strong>${data.success ? '✅' : '⚠️'} Re-geocodificación automática</strong></p>`;
                    if (data.np) inner += `<p style="font-size:.82rem;color:var(--tm)">Pedido ${escHtmlPrint(String(data.np))}</p>`;
                    if (data.fuente) inner += `<p style="font-size:.78rem;color:var(--tm)">Fuente: ${escHtmlPrint(String(data.fuente))}</p>`;
                    if (data.mensaje && !data.success) inner += `<p style="font-size:.78rem;color:#b45309">${escHtmlPrint(String(data.mensaje))}</p>`;
                    inner += '<div style="background:var(--bg2,#f3f4f6);padding:.6rem;border-radius:.45rem;margin-top:.4rem;max-height:45vh;overflow:auto;font-family:ui-monospace,monospace;font-size:.7rem;line-height:1.4">';
                    for (const line of lines) {
                        const s = String(line);
                        const escaped = escHtmlPrint(s);
                        let color = 'var(--tm)';
                        if (s.includes('✓') || s.includes('✅')) color = '#059669';
                        else if (s.includes('⚠')) color = '#d97706';
                        else if (s.includes('❌')) color = '#dc2626';
                        else if (/PASO|📚|🌍|📐|═/.test(s)) color = '#2563eb';
                        inner += `<div style="color:${color}">${escaped}</div>`;
                    }
                    inner += '</div></div>';
                    if (typeof window.mostrarModalLogRegeocodificacion === 'function') {
                        window.mostrarModalLogRegeocodificacion(inner, { durationMs: 60000 });
                    } else {
                        toast('Re-geocodificación automática (ver consola)', 'info', 8000);
                    }
                } catch (e) {
                    logErrorWeb('notif-regeo-log', e);
                }
                if (_pollNotifMovilUsaColumnaLeida) {
                    await sqlSimple(`UPDATE notificaciones_movil SET leida = TRUE WHERE id = ${esc(row.id)}`);
                }
                continue;
            }
            const esNotifDerivacion =
                /derivaci/i.test(t) || /derivaci/i.test(b) || /solicita derivar/i.test(b);
            if (tienePuente) {
                try {
                    window.AndroidLocalNotify.show(String(row.id), t, b, pid);
                    if (_pollNotifMovilUsaColumnaLeida) {
                        await sqlSimple(`UPDATE notificaciones_movil SET leida = TRUE WHERE id = ${esc(row.id)}`);
                    }
                    if (pid) await resolverFocoPedidoNotificacion(pid, { silent: true, scrollDerivacion: esNotifDerivacion });
                } catch (_) {}
            } else if (esAdm) {
                try {
                    toast(t + (b ? ': ' + b : ''), 'info');
                    if (_pollNotifMovilUsaColumnaLeida) {
                        await sqlSimple(`UPDATE notificaciones_movil SET leida = TRUE WHERE id = ${esc(row.id)}`);
                    }
                    if (pid) {
                        await resolverFocoPedidoNotificacion(pid, {
                            silent: true,
                            scrollDerivacion: esNotifDerivacion,
                        });
                    }
                } catch (_) {}
            }
        }
    } catch (e) {
        const m = String(e.message || e);
        if (_pollNotifMovilUsaColumnaLeida && (m.includes('leida') || (m.includes('column') && m.includes('notificaciones_movil')))) {
            _pollNotifMovilUsaColumnaLeida = false;
            return window.pollNotificacionesMovil();
        }
        if (!m.includes('notificaciones_movil')) console.warn('[notif-movil]', m);
    }
};

function iniciarPollNotifMovil() {
    detenerPollNotifMovil();
    window.pollNotificacionesMovil();
    _pollNotifMovilInterval = setInterval(() => { window.pollNotificacionesMovil(); }, esAdmin() ? 12000 : 18000);
}

function detenerPollNotifMovil() {
    if (_pollNotifMovilInterval) {
        clearInterval(_pollNotifMovilInterval);
        _pollNotifMovilInterval = null;
    }
}

window.cerrarModalNotifPedido = cerrarModalNotifPedido;
window.confirmarEnviarNotifPedido = confirmarEnviarNotifPedido;
window.abrirModalNotificarPedidoPorId = abrirModalNotificarPedidoPorId;


window.cerrarVistaImpresion = function() {
    const contenedor = document.getElementById('print-container');
    if (!contenedor) return;
    contenedor.classList.remove('printing');
    contenedor.innerHTML = '';
};

window.confirmarImpresionPedido = function() {
    document.querySelectorAll('#print-container .print-preview-toolbar').forEach(el => { el.style.display = 'none'; });
    try {
        if (window.AndroidPrint && typeof window.AndroidPrint.printWebContent === 'function') {
            window.AndroidPrint.printWebContent();
            setTimeout(() => { window.cerrarVistaImpresion(); }, 900);
        } else {
            let listo = false;
            const fin = () => {
                if (listo) return;
                listo = true;
                window.cerrarVistaImpresion();
            };
            window.addEventListener('afterprint', fin, { once: true });
            window.print();
            setTimeout(fin, 60000);
        }
    } catch (_) {
        window.cerrarVistaImpresion();
    }
};

function tituloPedidoDocumento(p) {
    const tt = String(p?.tt ?? '').trim();
    const np = String(p?.np ?? '').trim();
    if (tt && np) return `${tt} N° ${np}`;
    if (np) return `Pedido N° ${np}`;
    return tt || 'Pedido';
}

function nombreArchivoExportPedidoUnico(p) {
    const base = tituloPedidoDocumento(p);
    let safe = base.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_');
    if (safe.length > 120) safe = safe.slice(0, 120);
    return safe || ('pedido_' + String(p?.np || 'export').replace(/[\\/:*?"<>|]/g, '-'));
}

function nombreHojaExcelPedidoUnico(p) {
    let s = tituloPedidoDocumento(p).replace(/[:\\/*?\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > 31) s = s.slice(0, 31).trim();
    return s || 'Pedidos';
}

async function imprimirPedidoAsync(p) {
    if (!p) { toast('Pedido inválido', 'error'); return; }
    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    const f = p.f ? new Date(p.f).toLocaleString('es-AR', {...tz, hour12:false}) : '--';
    const fc = p.fc ? new Date(p.fc).toLocaleString('es-AR', {...tz, hour12:false}) : '--';
    const fa = p.fa ? new Date(p.fa).toLocaleString('es-AR', {...tz, hour12:false}) : '--';

    const filasCoordsPrint = (() => {
        const pc = proyectarCoordPedido(p.la, p.ln);
        if (pc) {
            return `<tr><td colspan="2" style="font-size:10pt;color:#64748b;padding-bottom:4px"><b>${escHtmlPrint(pc.crsLinea)}</b> · ${escHtmlPrint(pc.titulo)}</td></tr>
                <tr><td>${escHtmlPrint(pc.lx)}</td><td>${escHtmlPrint(pc.vx)}</td></tr>
                <tr><td>${escHtmlPrint(pc.ly)}</td><td>${escHtmlPrint(pc.vy)}</td></tr>`;
        }
        const cf = ((window.EMPRESA_CFG || {}).coord_proy_familia || 'none').trim();
        if (cf === 'none' && p.x_inchauspe && p.y_inchauspe) {
            return `<tr><td>Inchauspe X (hist.)</td><td>${escHtmlPrint(String(p.x_inchauspe).replace('.', ','))}</td></tr>
                <tr><td>Inchauspe Y (hist.)</td><td>${escHtmlPrint(String(p.y_inchauspe).replace('.', ','))}</td></tr>`;
        }
        return '';
    })();

    let matSection = '';
    if (tipoPedidoExcluyeMateriales(p.tt)) {
        matSection = '';
    } else if (p.es === 'Cerrado' && !String(p.id).startsWith('off_') && NEON_OK && !modoOffline) {
        try {
            const r = await sqlSimple(`SELECT descripcion, cantidad, unidad FROM pedido_materiales WHERE pedido_id=${esc(parseInt(p.id, 10))} ORDER BY id`);
            const rows = r.rows || [];
            let rowsH = '';
            rows.forEach(row => {
                rowsH += `<tr><td>${escHtmlPrint(row.descripcion)}</td><td style="text-align:center;width:18%">${escHtmlPrint(row.unidad ?? '')}</td><td style="text-align:center;width:12%">${escHtmlPrint(String(row.cantidad ?? ''))}</td></tr>`;
            });
            matSection = rowsH
                ? `<h2>🔧 Materiales</h2><table><thead><tr><th>Ítem</th><th>Unidad</th><th>Cantidad</th></tr></thead><tbody>${rowsH}</tbody></table>`
                : `<h2>🔧 Materiales</h2><p style="font-size:9pt">Sin materiales registrados.</p>`;
        } catch (_) {
            matSection = `<h2>🔧 Materiales</h2><p style="font-size:9pt">No se pudieron cargar los materiales.</p>`;
        }
    } else if (p.es === 'Cerrado' && !tipoPedidoExcluyeMateriales(p.tt)) {
        matSection = `<h2>🔧 Materiales</h2><p style="font-size:9pt">Sin datos (sin conexión).</p>`;
    }

    const _labFirma = etiquetaFirmaPersona();
    const firmaSection = p.es === 'Cerrado'
        ? (p.firma
            ? `<h2>✍️ Firma del ${_labFirma}</h2><div><img src="${String(p.firma).replace(/"/g, '&quot;')}" class="firma-print" alt="Firma"/></div>`
            : `<h2>✍️ Firma del ${_labFirma}</h2><p style="font-size:9pt"><em>Sin firma registrada.</em></p>`)
        : '';

    const opinPrint =
        p.opin && String(p.opin).trim()
            ? `<h2>💬 Observación del cliente (WhatsApp)</h2>
            <p style="font-size:9pt;white-space:pre-wrap">${escHtmlPrint(String(p.opin).trim())}</p>
            ${p.fopin ? `<p style="font-size:8pt;color:#64748b">Registrada: ${escHtmlPrint(fmtInformeFecha(p.fopin))}</p>` : ''}`
            : '';

    const contenidoCuerpo = `
            <h1>${escHtmlPrint(tituloPedidoDocumento(p))}</h1>
            
            <h2>📋 Información General</h2>
            <table>
                <tr><td>Fecha de Creación:</td><td>${f}</td></tr>
                <tr><td>Estado:</td><td>${escHtmlPrint(p.es)}</td></tr>
                <tr><td>Prioridad:</td><td>${escHtmlPrint(p.pr)}</td></tr>
                <tr><td>Tipo:</td><td>${escHtmlPrint(p.tt || '--')}</td></tr>
                ${p.es === 'Cerrado' ? 
                    `<tr><td>Fecha de Cierre:</td><td>${fc}</td></tr>` : 
                    p.es === 'En ejecución' ? 
                    `<tr><td>Último Avance:</td><td>${fa} (${p.av}%)</td></tr>` : ''}
                <tr><td>Avance:</td><td>${p.av}%</td></tr>
            </table>
            
            <h2>🏢 Datos del Trabajo</h2>
            <table>
                <tr><td>${etiquetaZonaPedido()}:</td><td>${escHtmlPrint(valorZonaPedidoUI(p))}</td></tr>
                ${esCooperativaElectricaRubro() && String(p.trf || '').trim() ? `<tr><td>Trafo:</td><td>${escHtmlPrint(p.trf)}</td></tr>` : ''}
                ${String(p.nis || '').trim() ? `<tr><td>NIS</td><td>${escHtmlPrint(p.nis)}</td></tr>` : ''}
                ${String(p.cnom || p.cl || '').trim() ? `<tr><td>Nombre y apellido</td><td>${escHtmlPrint(p.cnom || p.cl)}</td></tr>` : ''}
                ${String(p.ccal || '').trim() ? `<tr><td>Calle</td><td>${escHtmlPrint(p.ccal)}</td></tr>` : ''}
                ${String(p.cnum || '').trim() ? `<tr><td>Número</td><td>${escHtmlPrint(p.cnum)}</td></tr>` : ''}
                ${String(p.cloc || '').trim() ? `<tr><td>Localidad</td><td>${escHtmlPrint(p.cloc)}</td></tr>` : ''}
                ${String(p.stc || '').trim() ? `<tr><td>Tipo de conexión</td><td>${escHtmlPrint(p.stc)}</td></tr>` : ''}
                ${String(p.sfs || '').trim() ? `<tr><td>Fases</td><td>${escHtmlPrint(p.sfs)}</td></tr>` : ''}
                ${String(p.cdir || '').trim() ? `<tr><td>Referencia / notas ubicación</td><td>${escHtmlPrint(p.cdir)}</td></tr>` : ''}
                <tr><td>Descripción:</td><td>${escHtmlPrint(p.de)}</td></tr>
            </table>
            
            ${p.es === 'Cerrado' ? `
            <h2>✅ Cierre del Pedido</h2>
            <table>
                <tr><td>Fecha cierre:</td><td>${fc}</td></tr>
                ${p.tc ? `<tr><td>Técnico:</td><td>${escHtmlPrint(p.tc)}</td></tr>` : ''}
                ${p.tr ? `<tr><td>Trabajo realizado:</td><td>${escHtmlPrint(p.tr)}</td></tr>` : ''}
            </table>
            ` : ''}
            ${opinPrint}
            ${matSection}
            ${firmaSection}
            
            <h2>📍 Ubicación</h2>
            <table>
                <tr><td>Provincia:</td><td>${escHtmlPrint(String(p.cpcia || '').trim() || '—')}</td></tr>
                <tr><td>Código postal:</td><td>${escHtmlPrint(String(p.ccp || '').trim() || '—')}</td></tr>
                <tr><td>WGS84 Lat:</td><td>${p.la != null ? escHtmlPrint(String(p.la.toFixed(5).replace('.', ','))) : '--'}</td></tr>
                <tr><td>WGS84 Lng:</td><td>${p.ln != null ? escHtmlPrint(String(p.ln.toFixed(5).replace('.', ','))) : '--'}</td></tr>
                ${filasCoordsPrint}
            </table>
            
            <div style="margin-top:1.2rem; text-align:center; color:#94a3b8; font-size:0.75rem;">
                Documento generado el ${new Date().toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires', hour12:false})}
            </div>`;

    const contenedor = document.getElementById('print-container');
    contenedor.innerHTML = `
        <div class="print-preview-wrap">
            <div class="print-preview-toolbar no-print">
                <button type="button" class="ppt-btn ppt-cancel" onclick="window.cerrarVistaImpresion()"><i class="fas fa-times"></i> Cancelar</button>
                <button type="button" class="ppt-btn ppt-ok" onclick="window.confirmarImpresionPedido()"><i class="fas fa-print"></i> Imprimir</button>
            </div>
            <div class="print-content print-a4-tight">${contenidoCuerpo}</div>
        </div>`;
    contenedor.classList.add('printing');
}

window.imprimirPedido = function(p) {
    imprimirPedidoAsync(p).catch(e => toastError('imprimir-pedido', e, 'Error al preparar impresión.'));
};
window.imprimirPedidoPorId = function(id) {
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) { toast('Pedido no encontrado', 'error'); return; }
    imprimirPedidoAsync(p).catch(e => toastError('imprimir-pedido', e, 'Error al preparar impresión.'));
};



function leerOrientacionEXIF(arrayBuffer) {
    try {
        const view = new DataView(arrayBuffer);
        if (view.getUint16(0, false) !== 0xFFD8) return 1; 
        const length = view.byteLength;
        let offset = 2;
        while (offset < length) {
            if (view.getUint16(offset, false) !== 0xFFE1) { offset += 2 + view.getUint16(offset + 2, false); continue; }
            if (view.getUint32(offset + 4, false) !== 0x45786966) return 1;
            const little = view.getUint16(offset + 10, false) === 0x4949;
            const ifdOffset = offset + 10 + view.getUint32(offset + 14, little);
            const entries = view.getUint16(ifdOffset, little);
            for (let i = 0; i < entries; i++) {
                if (view.getUint16(ifdOffset + 2 + i * 12, little) === 0x0112)
                    return view.getUint16(ifdOffset + 2 + i * 12 + 8, little);
            }
        }
    } catch(_) {}
    return 1;
}

function comprimirImagen(file, opts = {}) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = (evBuf) => {
            const usarExifRotacion = opts.usarExifRotacion !== false;
            const blob = new Blob([evBuf.target.result], { type: file.type });
            const urlObj = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(urlObj);
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;

                
                
                const portrait = h > w;
                const orientacion = usarExifRotacion ? leerOrientacionEXIF(evBuf.target.result) : 1;
                const rotar = portrait && [5,6,7,8].includes(orientacion);
                const maxSize = 1600; 
                const mayor = rotar ? Math.max(h, w) : Math.max(w, h);
                if (mayor > maxSize) {
                    const r = maxSize / mayor;
                    w = Math.round(w * r);
                    h = Math.round(h * r);
                }

                if (rotar) { canvas.width = h; canvas.height = w; }
                else       { canvas.width = w; canvas.height = h; }

                const ctx = canvas.getContext('2d');
                ctx.save();
                
                
                let ang = 0;
                let sx = 1;
                let sy = 1;
                if      (orientacion === 2) { sx = -1; }
                else if (orientacion === 3) { ang = Math.PI; }
                else if (orientacion === 4) { sy = -1; }
                else if (orientacion === 5) { ang = Math.PI / 2; sx = -1; }
                
                else if (orientacion === 6) { ang = -Math.PI / 2; }
                else if (orientacion === 7) { ang = -Math.PI / 2; sx = -1; }
                else if (orientacion === 8) { ang = Math.PI / 2; }

                ctx.translate(canvas.width / 2, canvas.height / 2);
                if (rotar) {
                    ctx.rotate(ang);
                    ctx.scale(sx, sy);
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                } else {
                    
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                }
                ctx.restore();

                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = urlObj;
        };
        reader.onerror = reject;
    });
}


(function() {
    const modal = document.getElementById('modal-foto-ampliada');
    const img   = document.getElementById('foto-ampliada');
    const cont  = document.getElementById('img-container');
    const info  = document.getElementById('foto-zoom-nivel');
    
    let scale = 1;       
    let tx = 0, ty = 0; 
    let rot = 0;         
    let isDragging = false;
    let lastX = 0, lastY = 0;
    
    let lastDist = 0;

    function applyTransform(animate) {
        img.style.transition = animate ? 'transform .2s' : 'none';
        img.style.transform  = `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rot}deg)`;
        info.textContent = Math.round(scale * 100) + '%';
        cont.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    }

    function clampTranslation() {
        if (scale <= 1) { tx = 0; ty = 0; return; }
        let imgW = img.naturalWidth  || img.offsetWidth;
        let imgH = img.naturalHeight || img.offsetHeight;
        
        const rotNorm = ((rot % 360) + 360) % 360;
        if (rotNorm === 90 || rotNorm === 270) {
            const t = imgW; imgW = imgH; imgH = t;
        }
        
        const maxX = Math.max(0, (imgW  * scale - cont.clientWidth)  / 2);
        const maxY = Math.max(0, (imgH  * scale - cont.clientHeight) / 2);
        tx = Math.max(-maxX, Math.min(maxX, tx));
        ty = Math.max(-maxY, Math.min(maxY, ty));
    }

    function resetZoom() {
        scale = 1; tx = 0; ty = 0; rot = 0;
        applyTransform(true);
        if (btnGuardar) btnGuardar.style.display = 'none';
    }
    function zoomBy(delta, cx, cy) {
        const prev = scale;
        scale = Math.max(1, Math.min(8, scale * delta));
        
        if (cx !== undefined) {
            const rect = cont.getBoundingClientRect();
            const ox = cx - rect.left - cont.clientWidth  / 2;
            const oy = cy - rect.top  - cont.clientHeight / 2;
            tx -= ox * (scale / prev - 1);
            ty -= oy * (scale / prev - 1);
        }
        clampTranslation();
        applyTransform(false);
    }

    
    
    
    
    
    
    
    window._fotoCtx = null; 
    window.verFotoAmpliada = function(src, ctx) {
        img.src = src;
        window._fotoCtx = ctx || null;
        resetZoom();
        modal.classList.add('active');
        img.style.transition = 'none';
        rot = 0; tx = 0; ty = 0; scale = 1;
        applyTransform(false);
        
        if (btnGuardarBD) btnGuardarBD.style.display = ctx ? 'flex' : 'none';
    };

    
    document.getElementById('cerrar-modal-foto').addEventListener('click', () => {
        modal.classList.remove('active');
        resetZoom();
    });
    
    modal.addEventListener('click', e => {
        if (e.target === modal) { modal.classList.remove('active'); resetZoom(); }
    });
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.classList.contains('active'))
            { modal.classList.remove('active'); resetZoom(); }
    });

    
    document.getElementById('foto-zoom-in').addEventListener('click', e => {
        e.stopPropagation(); zoomBy(1.4);
    });
    document.getElementById('foto-zoom-out').addEventListener('click', e => {
        e.stopPropagation(); zoomBy(1/1.4);
    });
    document.getElementById('foto-zoom-reset').addEventListener('click', e => {
        e.stopPropagation(); resetZoom();
    });

    
    const btnGuardar   = document.getElementById('foto-guardar');
    const btnGuardarBD = document.getElementById('foto-guardar-bd');

    
    function aplicarRotacionAlCanvas() {
        if (!img.src || img.src === window.location.href) return null;
        const rotNorm = ((rot % 360) + 360) % 360;
        if (rotNorm === 0) return null;
        const canvas = document.createElement('canvas');
        const swap = rotNorm === 90 || rotNorm === 270;
        canvas.width  = swap ? img.naturalHeight : img.naturalWidth;
        canvas.height = swap ? img.naturalWidth  : img.naturalHeight;
        const ctx2 = canvas.getContext('2d');
        ctx2.translate(canvas.width / 2, canvas.height / 2);
        ctx2.rotate(rotNorm * Math.PI / 180);
        ctx2.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        return canvas.toDataURL('image/jpeg', 0.92);
    }

    
    document.getElementById('foto-rotate-90').addEventListener('click', e => {
        e.stopPropagation();
        rot = ((rot + 90) % 360);
        tx = 0; ty = 0;
        clampTranslation();
        applyTransform(true);
        const hayRot = rot !== 0;
        btnGuardar.style.display   = hayRot ? 'flex' : 'none';
        
        if (btnGuardarBD) btnGuardarBD.style.display = (hayRot && window._fotoCtx) ? 'flex' : 'none';
    });

    
    if (btnGuardarBD) {
        btnGuardarBD.addEventListener('click', async e => {
            e.stopPropagation();
            const dataUrl = aplicarRotacionAlCanvas();
            if (!dataUrl) { toast('Sin rotación para guardar', 'info'); return; }
            const ctx3 = window._fotoCtx;
            if (!ctx3) { toast('Sin contexto de pedido', 'info'); return; }

            btnGuardarBD.disabled = true;
            btnGuardarBD.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

            try {
                if (ctx3.tipo === 'temporal') {
                    
                    fotosTemporales[ctx3.idx] = dataUrl;
                    actualizarVistaPreviaFotos();
                    
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    toast('✓ Rotación guardada en el pedido', 'success');

                } else if (ctx3.tipo === 'cierre_temp') {
                    
                    fotoCierreTemp = dataUrl;
                    actualizarVistaPreviaFotoCierre();
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    toast('✓ Rotación guardada en la foto de cierre', 'success');

                } else if (ctx3.tipo === 'pedido_fotos') {
                    
                    const pedido = app.p.find(x => String(x.id) === String(ctx3.id));
                    if (!pedido) throw new Error('Pedido no encontrado');
                    pedido.fotos[ctx3.idx] = dataUrl;
                    const nuevasCadena = pedido.fotos.join('||');
                    if (!modoOffline && NEON_OK) {
                        await ejecutarSQLConReintentos(
                            `UPDATE pedidos SET foto_base64 = ${esc(nuevasCadena)} WHERE id = ${esc(parseInt(ctx3.id))}`
                        );
                    } else {
                        enqueueOffline({ tipo:'UPDATE', query:`UPDATE pedidos SET foto_base64 = ${esc(nuevasCadena)} WHERE id = ${esc(parseInt(ctx3.id))}` });
                    }
                    offlinePedidosSave(app.p);
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    
                    const pedidoActual = app.p.find(x => String(x.id) === String(ctx3.id));
                    if (pedidoActual) void detalle(pedidoActual);
                    toast('✓ Rotación guardada en el pedido', 'success');

                } else if (ctx3.tipo === 'pedido_cierre') {
                    
                    const pedido = app.p.find(x => String(x.id) === String(ctx3.id));
                    if (!pedido) throw new Error('Pedido no encontrado');
                    pedido.foto_cierre = dataUrl;
                    if (!modoOffline && NEON_OK) {
                        await ejecutarSQLConReintentos(
                            `UPDATE pedidos SET foto_cierre = ${esc(dataUrl)} WHERE id = ${esc(parseInt(ctx3.id))}`
                        );
                    } else {
                        enqueueOffline({ tipo:'UPDATE', query:`UPDATE pedidos SET foto_cierre = ${esc(dataUrl)} WHERE id = ${esc(parseInt(ctx3.id))}` });
                    }
                    offlinePedidosSave(app.p);
                    img.src = dataUrl;
                    rot = 0; tx = 0; ty = 0; scale = 1; applyTransform(false);
                    btnGuardar.style.display = 'none';
                    btnGuardarBD.style.display = 'none';
                    const pedidoActual2 = app.p.find(x => String(x.id) === String(ctx3.id));
                    if (pedidoActual2) void detalle(pedidoActual2);
                    toast('✓ Rotación de foto de cierre guardada', 'success');
                }
            } catch(err) {
                console.error('Error guardando rotación:', err);
                toast('Error al guardar: ' + err.message, 'error');
            } finally {
                btnGuardarBD.disabled = false;
                btnGuardarBD.innerHTML = '<i class="fas fa-save"></i> Guardar';
            }
        });
    }

    
    btnGuardar.addEventListener('click', async e => {
        e.stopPropagation();
        if (!img.src || img.src === window.location.href) return;
        const rotNorm = ((rot % 360) + 360) % 360;
        
        let dataUrl;
        if (rotNorm !== 0) {
            dataUrl = aplicarRotacionAlCanvas();
        } else {
            dataUrl = img.src; 
        }
        if (!dataUrl) return;
        
        if (navigator.share && navigator.canShare) {
            try {
                const res  = await fetch(dataUrl);
                const blob = await res.blob();
                const file = new File([blob], 'foto_pedido.jpg', { type: 'image/jpeg' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'Foto Pedido MG' });
                    toast('Foto compartida/guardada', 'success');
                    return;
                }
            } catch(err) {
                if (err.name !== 'AbortError') console.warn('Share falló:', err.message);
            }
        }
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'foto_pedido' + (rotNorm !== 0 ? '_rotada' : '') + '.jpg';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); }, 500);
        toast('Foto descargada', 'success');
    });

    
    
    cont.addEventListener('click', e => {
        if (hasMoved) { hasMoved = false; return; } 
        if (scale < 1.5) zoomBy(2.5, e.clientX, e.clientY);
        else resetZoom();
    });

    
    cont.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.2 : 1/1.2;
        zoomBy(delta, e.clientX, e.clientY);
    }, { passive: false });

    
    
    let hasMoved = false;
    cont.addEventListener('mousedown', e => {
        if (scale < 1.05) return; 
        isDragging = true;
        hasMoved = false;
        lastX = e.clientX; lastY = e.clientY;
        cont.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
        tx += dx; ty += dy;
        lastX = e.clientX; lastY = e.clientY;
        clampTranslation();
        applyTransform(false);
    });
    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        
        cont.style.cursor = scale > 1.05 ? 'grab' : 'zoom-in';
    });

    
    cont.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            lastDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        } else if (e.touches.length === 1 && scale > 1) {
            isDragging = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
        }
        e.preventDefault();
    }, { passive: false });

    cont.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            if (lastDist > 0) zoomBy(dist / lastDist, cx, cy);
            lastDist = dist;
        } else if (e.touches.length === 1 && isDragging) {
            tx += e.touches[0].clientX - lastX;
            ty += e.touches[0].clientY - lastY;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            clampTranslation();
            applyTransform(false);
        }
        e.preventDefault();
    }, { passive: false });

    cont.addEventListener('touchend', e => {
        if (e.touches.length < 2) lastDist = 0;
        if (e.touches.length === 0) {
            isDragging = false;
            
        }
    });

})(); 


async function procesarFotoSeleccionada(file, opts = {}) {
    if (!file) return;
    try {
        toast('Procesando imagen...', 'info');
        const compressedImage = await comprimirImagen(file, opts);
        fotosTemporales.push(compressedImage);
        actualizarVistaPreviaFotos();
        
        const kb = Math.round(compressedImage.length * 0.75 / 1024);
        toast(`✓ Foto lista (≈${kb} KB)`, 'success');
    } catch (error) {
        console.error('Error al procesar imagen:', error);
        toast('Error al procesar la imagen', 'error');
    }
}
















const esMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const esAndroidApp = /GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:';

(function mostrarVersionEnLogin() {
    var el = document.getElementById('app-version');
    if (!el) return;
    if (esAndroidApp && window.AndroidConfig && typeof window.AndroidConfig.getAppVersion === 'function') {
        try {
            el.textContent = 'Versión ' + window.AndroidConfig.getAppVersion();
        } catch (_) {}
    } else {
        el.textContent = 'Versión web ' + GN_VERSION_WEB;
    }
})();

function dispararSelectorArchivos(input) {
    if (!input) return;
    try { input.value = ''; } catch(_) {}
    input.click();
}




function abrirCamara(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (esMobile) {
        
        
        input.setAttribute('capture', 'environment');
    } else {
        
        input.removeAttribute('capture');
    }
    dispararSelectorArchivos(input);
}


async function procesarFotoCierre(file, opts = {}) {
    if (!file) return;
    try {
        toast('Procesando foto de cierre...', 'info');
        fotoCierreTemp = await comprimirImagen(file, opts);
        actualizarVistaPreviaFotoCierre();
        const kb = Math.round(fotoCierreTemp.length * 0.75 / 1024);
        toast(`✓ Foto de cierre lista (≈${kb} KB)`, 'success');
    } catch (err) {
        console.error('Error procesando foto cierre:', err);
        toast('Error al procesar la foto', 'error');
    }
}


document.getElementById('btn-tomar-foto').addEventListener('click', () => {
    abrirCamara('input-foto-camara');
});




document.getElementById('input-foto-camara').addEventListener('change', async (e) => {
    if (e.target.files[0]) await procesarFotoSeleccionada(e.target.files[0], { usarExifRotacion: true });
    e.target.value = '';
});
document.getElementById('input-foto-galeria').addEventListener('change', async (e) => {
    
    if (e.target.files[0]) await procesarFotoSeleccionada(e.target.files[0], { usarExifRotacion: false });
    e.target.value = '';
});


document.getElementById('btn-foto-cierre-camara').addEventListener('click', () => {
    abrirCamara('input-foto-cierre-camara');
});




document.getElementById('input-foto-cierre-camara').addEventListener('change', async (e) => {
    if (e.target.files[0]) await procesarFotoCierre(e.target.files[0], { usarExifRotacion: true });
    e.target.value = '';
});
document.getElementById('input-foto-cierre-galeria').addEventListener('change', async (e) => {
    
    if (e.target.files[0]) await procesarFotoCierre(e.target.files[0], { usarExifRotacion: false });
    e.target.value = '';
});

function actualizarVistaPreviaFotos() {
    const container = document.getElementById('vista-previa-fotos');
    container.innerHTML = '';
    fotosTemporales.forEach((foto, index) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block';
        const img = document.createElement('img');
        img.src = foto;
        img.className = 'foto-miniatura';
        img.onclick = () => window.verFotoAmpliada(foto, { tipo: 'temporal', idx: index });
        
        const del = document.createElement('button');
        del.type = 'button';
        del.innerHTML = '✕';
        del.title = 'Eliminar foto';
        del.style.cssText = 'position:absolute;top:-5px;right:-5px;background:#ef4444;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;z-index:10';
        del.onclick = (e) => {
            e.stopPropagation();
            fotosTemporales.splice(index, 1);
            actualizarVistaPreviaFotos();
        };
        wrap.appendChild(img);
        wrap.appendChild(del);
        container.appendChild(wrap);
    });
    
    if (fotosTemporales.length > 0) {
        const cnt = document.createElement('div');
        cnt.style.cssText = 'width:100%;font-size:.75rem;color:#475569;margin-top:.25rem';
        cnt.textContent = fotosTemporales.length + ' foto(s) adjunta(s)';
        container.appendChild(cnt);
    }
}


function abrirAvance(id) {
    const pedido = app.p.find(x => String(x.id) === String(id));
    if (!pedido) return;
    
    pedidoActualParaAvance = id;
    const slider = document.getElementById('avance-slider');
    const input = document.getElementById('avance-input');
    slider.value = pedido.av;
    input.value = pedido.av;
    
    document.getElementById('avance-modal').classList.add('active');
}

document.getElementById('avance-slider').addEventListener('input', (e) => {
    document.getElementById('avance-input').value = e.target.value;
});

document.getElementById('avance-input').addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;
    e.target.value = val;
    document.getElementById('avance-slider').value = val;
});

document.getElementById('guardar-avance').addEventListener('click', async () => {
    if (!pedidoActualParaAvance) return;
    
    const avance = parseInt(document.getElementById('avance-input').value);
    await actualizarAvance(pedidoActualParaAvance, avance);
    document.getElementById('avance-modal').classList.remove('active');
    pedidoActualParaAvance = null;
});

document.getElementById('cancelar-avance').addEventListener('click', () => {
    document.getElementById('avance-modal').classList.remove('active');
    pedidoActualParaAvance = null;
});


document.getElementById('pf').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    
    if (!app.sel) {
        toast('Selecciona ubicación en el mapa', 'error');
        btn.disabled = false;
        return;
    }
    
    try {
        
        const anioActual = new Date().getFullYear();
        let numPedido;
        if (modoOffline || !NEON_OK) {
            
            const keyContador = 'pmg_contador_' + anioActual;
            const contadorLocal = parseInt(localStorage.getItem(keyContador) || '0') + 1;
            localStorage.setItem(keyContador, String(contadorLocal));
            numPedido = 'PM-' + anioActual + '-' + String(contadorLocal).padStart(4, '0');
        } else {
            
            try {
                await sqlSimple(`INSERT INTO pedido_contador(anio, ultimo_numero)
                    VALUES(${esc(anioActual)}, 1)
                    ON CONFLICT(anio) DO UPDATE SET ultimo_numero = pedido_contador.ultimo_numero + 1`);
                const r = await sqlSimple(`SELECT ultimo_numero FROM pedido_contador WHERE anio = ${esc(anioActual)}`);
                const num = r.rows[0]?.ultimo_numero || 1;
                numPedido = 'PM-' + anioActual + '-' + String(num).padStart(4, '0');
                
                localStorage.setItem('pmg_contador_' + anioActual, String(num));
            } catch(_) {
                
                const fallback = Date.now().toString().slice(-5);
                numPedido = 'PM-' + anioActual + '-' + fallback;
            }
        }
        const fotosString = fotosTemporales.join('||');
        let xInchauspe = null, yInchauspe = null;
        try {
            asegurarDefsProyeccionesARG();
            const zNuevo = fajaArgentinaPorLongitud(app.sel.lng);
            const xyNuevo = proj4('EPSG:4326', 'PMG_inchauspe_Z' + zNuevo, [app.sel.lng, app.sel.lat]);
            xInchauspe = xyNuevo[0].toFixed(2);
            yInchauspe = xyNuevo[1].toFixed(2);
        } catch (_) {}

        const tipoTr = document.getElementById('tt')?.value || '';
        const permitidos = tiposReclamoSeleccionables();
        if (!permitidos.includes(tipoTr)) {
            toast('Elegí un tipo de reclamo válido para el rubro de tu organización.', 'error');
            btn.disabled = false;
            return;
        }
        const reqNis = tipoReclamoRequiereNisYCliente(tipoTr);
        const reqNombreCli = tipoReclamoRequiereNombreClienteEnFormulario(tipoTr);
        const nisVal = (document.getElementById('nis').value || '').trim();
        const clVal = (document.getElementById('cl').value || '').trim();
        if (reqNis && !nisVal) {
            toast('Para este tipo de reclamo el NIS / medidor es obligatorio', 'error');
            btn.disabled = false;
            return;
        }
        if (reqNombreCli && !clVal) {
            toast('Para este tipo de reclamo el nombre de cliente es obligatorio', 'error');
            btn.disabled = false;
            return;
        }
        const uidCre = app.u?.id || 1;
        const telVal = (document.getElementById('ped-tel-contacto')?.value || '').trim();
        const cliNomVal = (document.getElementById('cl').value || '').trim();
        const calleVal = (document.getElementById('ped-cli-calle')?.value || '').trim();
        const numVal = (document.getElementById('ped-cli-num')?.value || '').trim();
        const locVal = (document.getElementById('ped-cli-loc')?.value || '').trim();
        const refUbicVal = (document.getElementById('ped-cli-ref')?.value || '').trim();
        let disVal = (document.getElementById('di2').value || '').trim();
        const trafoInp = document.getElementById('trafo-pedido');
        let trafoVal = (trafoInp && trafoInp.value ? trafoInp.value : '').trim();
        let barrioVal = null;
        const tieneNisMed = !!nisVal;
        if (esCooperativaElectricaRubro()) {
            if (!tieneNisMed) {
                trafoVal = '';
            }
        } else if (esMunicipioRubro()) {
            barrioVal = disVal || null;
            disVal = '';
            trafoVal = '';
        } else if (esCooperativaAguaRubro()) {
            trafoVal = '';
        }
        if (
            esCooperativaElectricaRubro() &&
            tieneNisMed &&
            (disVal || trafoVal) &&
            !modoOffline &&
            NEON_OK
        ) {
            const cZona = await contarPedidosCorteZonaNeon(disVal, trafoVal);
            if (cZona >= 4) {
                const wa = urlWhatsappAtencionDesdeCfg();
                const msg =
                    'En las últimas horas hay varios reclamos abiertos en la misma zona (mismo distribuidor o trafo). Podría tratarse de un corte de sector o general.\n\n' +
                    (wa ? '¿Abrimos WhatsApp para hablar con un representante de la cooperativa antes de cargar el reclamo?' : 'Contactá a la cooperativa antes de cargar otro reclamo.');
                if (wa && confirm(msg)) {
                    window.open(wa, '_blank', 'noopener');
                    btn.disabled = false;
                    return;
                }
                if (!confirm('¿Registrar el reclamo de todas formas?')) {
                    btn.disabled = false;
                    return;
                }
            }
        }
        const sumConVal = (document.getElementById('ped-sum-conexion')?.value || '').trim();
        const sumFasVal = (document.getElementById('ped-sum-fases')?.value || '').trim();
        if (
            esCooperativaElectricaRubro() &&
            tipoReclamoElectricoPideSuministroWhatsapp(tipoTr) &&
            (!sumConVal || !sumFasVal)
        ) {
            toast('Para este tipo de reclamo indicá tipo de conexión (aéreo/subterráneo) y fases (monofásico/trifásico).', 'error');
            btn.disabled = false;
            return;
        }

        const queryInsert = `INSERT INTO pedidos(
            numero_pedido, distribuidor, trafo, cliente, tipo_trabajo,
            descripcion, prioridad, lat, lng, usuario_id, usuario_creador_id, estado, avance, foto_base64,
            x_inchauspe, y_inchauspe, fecha_creacion, nis_medidor, telefono_contacto,
            cliente_nombre, cliente_calle, cliente_numero_puerta, cliente_localidad, cliente_direccion,
            suministro_tipo_conexion, suministro_fases, barrio
        ) VALUES(
            ${esc(numPedido)},
            ${esc(disVal || null)},
            ${esc(trafoVal || null)},
            ${esc(cliNomVal || null)},
            ${esc(document.getElementById('tt').value || null)},
            ${esc(document.getElementById('de').value)},
            ${esc(document.getElementById('pr').value)},
            ${esc(app.sel.lat)},
            ${esc(app.sel.lng)},
            ${esc(uidCre)},
            ${esc(uidCre)},
            'Pendiente', 0,
            ${esc(fotosString || null)},
            ${esc(xInchauspe)},
            ${esc(yInchauspe)},
            ${esc(new Date().toISOString())},
            ${esc(nisVal || null)},
            ${esc(telVal || null)},
            ${esc(cliNomVal || null)},
            ${esc(calleVal || null)},
            ${esc(numVal || null)},
            ${esc(locVal || null)},
            ${esc(refUbicVal || null)},
            ${esc(sumConVal || null)},
            ${esc(sumFasVal || null)},
            ${esc(barrioVal || null)}
        )`;

        if (modoOffline || !NEON_OK) {
            
            enqueueOffline({ tipo: 'INSERT', query: queryInsert });
            
            const pedidoLocal = {
                id: 'off_' + Date.now(),
                np: numPedido,
                f: new Date().toISOString(),
                fc: null, fa: null,
                dis: disVal,
                br: barrioVal || '',
                trf: trafoVal,
                cl: cliNomVal,
                cnom: cliNomVal,
                ccal: calleVal,
                cnum: numVal,
                cloc: locVal,
                tt: document.getElementById('tt').value || '',
                de: document.getElementById('de').value,
                pr: document.getElementById('pr').value,
                es: 'Pendiente', av: 0,
                la: app.sel.lat, ln: app.sel.lng,
                ui: app.u?.id || 1,
                tr: null, tc: null,
                fotos: fotosString ? fotosString.split('||') : [],
                foto_cierre: null,
                x_inchauspe: xInchauspe, y_inchauspe: yInchauspe,
                nis: nisVal,
                tel: telVal,
                cdir: refUbicVal,
                stc: sumConVal || '',
                sfs: sumFasVal || '',
                _offline: true
            };
            app.p.unshift(pedidoLocal);
            offlinePedidosSave(app.p);
            toast('📴 Pedido guardado localmente — se sincronizará al conectarse', 'success');
        } else {
            
            await ejecutarSQLConReintentos(queryInsert);
            toast('Pedido guardado', 'success');
            if (telVal && puedeEnviarApiRestPedidos()) {
                try {
                    const rNew = await sqlSimple(
                        `SELECT id FROM pedidos WHERE numero_pedido = ${esc(numPedido)} ORDER BY id DESC LIMIT 1`
                    );
                    const newId = rNew.rows?.[0]?.id;
                    if (newId != null) void notificarAltaReclamoWhatsappApi(Number(newId));
                } catch (e) {
                    console.warn('[wa-alta-reclamo] lookup id', e && e.message);
                }
            }
        }

        fotosTemporales = [];
        actualizarVistaPreviaFotos();
        closeAll();
        app.sel = null;
        render();
        if (!modoOffline) cargarPedidos();
    } catch(e) {
        logErrorWeb('guardar-pedido', e);
        const low = String(e && e.message ? e.message : e || '').toLowerCase();
        if (low.includes('fetch') || low.includes('network') || low.includes('failed')) {
            setModoOffline(true);
            toast('Sin conexión — reintentá guardar en modo offline', 'error');
        } else {
            toast(mensajeErrorUsuario(e), 'error');
        }
    } finally {
        btn.disabled = false;
    }
});

async function actualizarAvance(id, avance) {
    try {
        const now = new Date().toISOString();
        const idx0 = app.p.findIndex(p => String(p.id) === String(id));
        const avPrev = idx0 !== -1 ? Number(app.p[idx0].av) : null;

        const apiRow = await pedidoPutApi(id, { avance: avance });
        if (apiRow) {
            const idx = app.p.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) app.p[idx] = norm(apiRow);
            offlinePedidosSave(app.p);
            render();
            toast('Avance actualizado', 'success');
            void refrescarDetalleAbiertoSiMismoPedido(id);
            return;
        }

        await ejecutarSQLConReintentos(
            `UPDATE pedidos SET avance = {0}, fecha_avance = {1} WHERE id = {2}`,
            [avance, now, parseInt(id)]
        );

        const idx = app.p.findIndex(p => String(p.id) === String(id));
        if (idx !== -1) {
            app.p[idx].av = avance;
            app.p[idx].fa = now;
        }

        if (puedeEnviarApiRestPedidos() && avPrev !== Number(avance)) {
            const pidNum = parseInt(id, 10);
            if (Number.isFinite(pidNum) && pidNum > 0) void notificarWhatsappClienteEventoApi(pidNum, 'avance');
        }

        render();
        toast('Avance actualizado', 'success');
        void refrescarDetalleAbiertoSiMismoPedido(id);
    } catch(e) {
        console.error('Error actualizando avance:', e);
        toast('Error al actualizar avance', 'error');
    }
}

async function updPedido(id, campos, usuarioId) {
    const idxPre = app.p.findIndex(p => String(p.id) === String(id));
    const prevRow = idxPre !== -1 ? app.p[idxPre] : null;
    const estadoAntesUpd = prevRow ? String(prevRow.es || '') : '';
    const taiAsignado = prevRow != null && prevRow.tai != null ? prevRow.tai : null;

    // Agregar auditoría si corresponde
    if (usuarioId && app.u) {
        if (campos.estado === 'En ejecución') campos.usuario_inicio_id = app.u.id;
        if (campos.estado === 'Cerrado')      campos.usuario_cierre_id = app.u.id;
        if (campos.avance !== undefined && campos.estado === undefined) campos.usuario_avance_id = app.u.id;
    }
    const cv = {};
    for (const [k, v] of Object.entries(campos)) {
        if (CN.has(k)) cv[k] = v;
    }
    if (!Object.keys(cv).length) return;
    
    const s = [];
    for (const [k, val] of Object.entries(cv)) s.push(`${k}=${esc(val)}`);
    const queryUpdate = `UPDATE pedidos SET ${s.join(',')} WHERE id=${esc(parseInt(id))}`;

    if (modoOffline || !NEON_OK || String(id).startsWith('off_')) {
        
        if (!String(id).startsWith('off_')) {
            enqueueOffline({ tipo: 'UPDATE', query: queryUpdate });
        }
        
    } else {
        await ejecutarSQLConReintentos(queryUpdate);
        const cierreCentral =
            cv.estado === 'Cerrado' &&
            estadoAntesUpd !== 'Cerrado' &&
            taiAsignado != null &&
            String(taiAsignado) !== String(app.u?.id || '');
        if (cierreCentral && _sql) {
            try {
                const pidNum = parseInt(id, 10);
                const np = prevRow && prevRow.np ? String(prevRow.np) : '';
                const titulo = 'Pedido cerrado';
                const cuerpo = `El reclamo ${np || '#' + id} fue cerrado desde la central.`;
                await sqlSimple(
                    `INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo, leida) VALUES (${esc(
                        parseInt(taiAsignado, 10)
                    )}, ${esc(pidNum)}, ${esc(titulo)}, ${esc(cuerpo)}, FALSE)`
                );
            } catch (e) {
                if (!String(e.message || e).includes('notificaciones_movil')) {
                    console.warn('[notif-cierre-tecnico]', e.message || e);
                }
            }
        }
    }
    
    const idx = app.p.findIndex(p => String(p.id) === String(id));
    if (idx !== -1) {
        const pm = {
            estado: 'es',
            avance: 'av',
            trabajo_realizado: 'tr',
            tecnico_cierre: 'tc',
            fecha_cierre: 'fc',
            fecha_avance: 'fa',
            foto_cierre: 'foto_cierre',
            nis_medidor: 'nis',
            tecnico_asignado_id: 'tai',
            fecha_asignacion: 'fasi',
            firma_cliente: 'firma',
            checklist_seguridad: 'chkl',
            telefono_contacto: 'tel',
            cliente_nombre: 'cnom',
            cliente_direccion: 'cdir',
            cliente_calle: 'ccal',
            cliente_numero_puerta: 'cnum',
            cliente_localidad: 'cloc',
            provincia: 'cpcia',
            codigo_postal: 'ccp',
            suministro_tipo_conexion: 'stc',
            suministro_fases: 'sfs',
            trafo: 'trf',
            usuario_inicio_id: 'ui2',
            usuario_cierre_id: 'uci',
            usuario_avance_id: 'uav',
            derivado_externo: 'dex',
            derivado_a: 'dda',
            derivado_destino_nombre: 'ddn',
            fecha_derivacion: 'fder',
            usuario_derivacion_id: 'uider',
            derivacion_nota: 'dnota',
            derivacion_mensaje_snapshot: 'dsnap'
        };
        for (const [k, v2] of Object.entries(campos)) {
            if (pm[k]) app.p[idx][pm[k]] = v2;
        }
        if (campos.foto_base64) {
            app.p[idx].fotos = campos.foto_base64.split('||');
        }
        if (campos.x_inchauspe) app.p[idx].x_inchauspe = campos.x_inchauspe;
        if (campos.y_inchauspe) app.p[idx].y_inchauspe = campos.y_inchauspe;
    }
    
    offlinePedidosSave(app.p);
    render();
}

async function refrescarDetalleAbiertoSiMismoPedido(id) {
    const dm = document.getElementById('dm');
    if (!dm?.classList.contains('active') || String(dm.dataset.detallePedidoId) !== String(id)) return;
    const p = app.p.find((x) => String(x.id) === String(id));
    if (p) void detalle(p);
}

async function iniciar(id) {
    try {
        const now = new Date().toISOString();
        const apiRow = await pedidoPutApi(id, { estado: 'En ejecución', avance: 0 });
        if (apiRow) {
            const idx = app.p.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) app.p[idx] = norm(apiRow);
            offlinePedidosSave(app.p);
            render();
            toast('Pedido iniciado. Si hay teléfono de contacto y WhatsApp configurado, se avisó al cliente.', 'success');
            await refrescarDetalleAbiertoSiMismoPedido(id);
            return;
        }
        await updPedido(id, {
            estado: 'En ejecución',
            avance: 0,
            fecha_avance: now
        }, app.u?.id);
        if (puedeEnviarApiRestPedidos()) {
            const pidNum = parseInt(id, 10);
            if (Number.isFinite(pidNum) && pidNum > 0) void notificarWhatsappClienteEventoApi(pidNum, 'inicio');
        }
        toast('Pedido iniciado', 'info');
        await refrescarDetalleAbiertoSiMismoPedido(id);
    } catch(e) {
        toastError('iniciar-pedido', e);
    }
}

function actualizarVistaPreviaFotoCierre() {
    const container = document.getElementById('vista-previa-foto-cierre');
    if (!container) return;
    container.innerHTML = '';
    if (!fotoCierreTemp) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block';
    const img = document.createElement('img');
    img.src = fotoCierreTemp;
    img.className = 'foto-miniatura';
    img.onclick = () => window.verFotoAmpliada(fotoCierreTemp, { tipo: 'cierre_temp' });
    const del = document.createElement('button');
    del.type = 'button';
    del.innerHTML = '✕';
    del.title = 'Eliminar foto';
    del.style.cssText = 'position:absolute;top:-5px;right:-5px;background:#ef4444;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;z-index:10';
    del.onclick = (e) => { e.stopPropagation(); fotoCierreTemp = null; actualizarVistaPreviaFotoCierre(); };
    wrap.appendChild(img);
    wrap.appendChild(del);
    container.appendChild(wrap);
    const cnt = document.createElement('div');
    cnt.style.cssText = 'width:100%;font-size:.75rem;color:#475569;margin-top:.25rem';
    const kb = Math.round(fotoCierreTemp.length * 0.75 / 1024);
    cnt.textContent = `1 foto de cierre (≈${kb} KB)`;
    container.appendChild(cnt);
}

let _firmaCanvasBound = false;
function initFirmaCierreCanvas() {
    const c = document.getElementById('firma-canvas-cierre');
    if (!c) return;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (_firmaCanvasBound) return;
    _firmaCanvasBound = true;
    let draw = false;
    const pos = e => {
        const r = c.getBoundingClientRect();
        const scaleX = c.width / r.width;
        const scaleY = c.height / r.height;
        const cx = ('touches' in e ? e.touches[0].clientX : e.clientX) - r.left;
        const cy = ('touches' in e ? e.touches[0].clientY : e.clientY) - r.top;
        return { x: cx * scaleX, y: cy * scaleY };
    };
    const start = e => { draw = true; const p0 = pos(e); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); };
    const move = e => { if (!draw) return; const p0 = pos(e); ctx.lineTo(p0.x, p0.y); ctx.stroke(); };
    const end = () => { draw = false; };
    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', move);
    c.addEventListener('mouseup', end);
    c.addEventListener('mouseleave', end);
    c.addEventListener('touchstart', e => { e.preventDefault(); start(e); }, { passive: false });
    c.addEventListener('touchmove', e => { e.preventDefault(); move(e); }, { passive: false });
    c.addEventListener('touchend', end);
}
function limpiarFirmaCierreCanvas() {
    const c = document.getElementById('firma-canvas-cierre');
    if (!c) return;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
}
function firmaCierreCanvasVacio() {
    const c = document.getElementById('firma-canvas-cierre');
    if (!c) return true;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 32) {
        if (d[i] < 248 || d[i + 1] < 248 || d[i + 2] < 248) return false;
    }
    return true;
}

function htmlOptsUnidadMaterial(val) {
    const u0 = String(val ?? '').trim().toUpperCase();
    let html = MATERIAL_UNIDADES.map(u => `<option value="${u}"${u === u0 ? ' selected' : ''}>${u}</option>`).join('');
    if (u0 && MATERIAL_UNIDADES.indexOf(u0) < 0)
        html = `<option value="${u0.replace(/"/g, '&quot;')}" selected>${u0}</option>` + html;
    return html;
}

function escHtmlPrint(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Oculta en pantalla ruido técnico ([Sistema]…, caché, sugerencias GPS) ya persistido en descripción. */
function sanitizarTextoDescripcionPedidoVista(s) {
    if (s == null || s === '') return '';
    let t = String(s).replace(/\r\n/g, '\n');
    t = t.replace(/\n\nSi podés, enviá[\s\S]*?precisión\./gi, '');
    t = t.replace(/\n\n\[Sistema\][^\n]*/g, '');
    t = t.replace(/\n\[Sistema\][^\n]*/g, '');
    t = t.replace(/\[Sistema\][^\n]*/g, '');
    t = t.replace(/geocodificacion_cache[^\n]*/gi, '');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}

/** Sección materiales: solo en ejecución, con avance o ya cerrado (lectura en cerrado). */
function estadoPermiteSeccionMateriales(p) {
    if (!p || tipoPedidoExcluyeMateriales(p.tt)) return false;
    const es = String(p.es || '');
    if (es === 'En ejecución' || es === 'Cerrado') return true;
    if (Number(p.av) > 0) return true;
    return false;
}

/** Misma lógica que los botones «Iniciar» / «Cerrar» en detalle: admin, creador del pedido o técnico asignado. */
function puedeEditarMaterialesEnPedido(p) {
    if (!p || p.es === 'Cerrado') return false;
    if (tipoPedidoExcluyeMateriales(p.tt)) return false;
    if (!estadoPermiteSeccionMateriales(p)) return false;
    if (p.sdpen && esTecnicoOSupervisor() && !esAdmin()) return false;
    const es = String(p.es || '');
    const uid = String(app.u?.id ?? '');
    if (esAdmin()) {
        return es === 'En ejecución' || (Number(p.av) > 0 && es !== 'Pendiente');
    }
    if (es !== 'En ejecución') return false;
    return (
        String(p.ui) === uid ||
        (esTecnicoOSupervisor() && p.tai != null && String(p.tai) === uid)
    );
}

async function sqlMaterialesPedidoRows(pid) {
    const q = `SELECT id, descripcion, cantidad, unidad FROM pedido_materiales WHERE pedido_id=${esc(pid)} ORDER BY id`;
    let ult = null;
    for (let i = 0; i < 3; i++) {
        try {
            const r = await sqlSimple(q);
            return r.rows || [];
        } catch (e) {
            ult = e;
            if (i < 2) await new Promise(res => setTimeout(res, 500 * (i + 1)));
        }
    }
    throw ult;
}

function _materialesDetalleSigueSiendoPedidoActual(p) {
    const dm = document.getElementById('dm');
    if (!dm?.classList.contains('active')) return false;
    const cur = dm.dataset?.detallePedidoId;
    return cur != null && String(cur) === String(p.id);
}

function _materialesCierreModalSigueSiendoPedidoActual(p) {
    const cm2 = document.getElementById('cm2');
    if (!cm2?.classList.contains('active')) return false;
    return app.cid != null && String(app.cid) === String(p.id);
}

async function refrescarMaterialesEnDetalle(p) {
    const body = document.getElementById('materiales-detalle-body');
    if (!body) return;
    if (esTipoPedidoFactibilidad(p.tt)) return;
    if (!estadoPermiteSeccionMateriales(p)) {
        body.innerHTML =
            '<p style="font-size:.8rem;color:var(--tl)">La carga de materiales se habilita cuando el pedido está <strong>en ejecución</strong>, tiene <strong>avance</strong> o al <strong>cerrarlo</strong>.</p>';
        return;
    }
    const pid = parseInt(p.id, 10);
    
    // GUARD MEJORADO: si el pedido está cerrado y ya hay materiales renderizados, NO recargar
    // Esto previene el parpadeo cuando se llama recursivamente a detalle()
    if (p.es === 'Cerrado') {
        const yaRenderizado = body.dataset.stableMatPid === String(pid);
        const tieneTabla = body.querySelector('table.mat-det-table');
        if (yaRenderizado && tieneTabla) {
            console.debug('[materiales-detalle] Pedido cerrado ya renderizado, skip reload', pid);
            return;
        }
        // Si no tiene tabla pero dice stable, limpiar el estado
        if (yaRenderizado && !tieneTabla) {
            delete body.dataset.stableMatPid;
        }
    }
    
    if (String(p.id).startsWith('off_') || modoOffline || !NEON_OK) {
        body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Materiales: requiere conexión a Neon.</p>';
        return;
    }
    const excluyeMat = tipoPedidoExcluyeMateriales(p.tt);
    if (excluyeMat) {
        try {
            const rows = await sqlMaterialesPedidoRows(pid);
            if (!_materialesDetalleSigueSiendoPedidoActual(p)) return;
            const aviso = '<p style="font-size:.8rem;color:var(--tl);margin-bottom:.5rem">Este tipo de pedido no admite registrar ni editar materiales.</p>';
            if (!rows.length) {
                body.innerHTML = aviso;
                return;
            }
            let html = aviso + '<table class="mat-det-table"><thead><tr><th class="mat-col-item">Ítem</th><th class="mat-col-un">Unidad</th><th class="mat-col-cant">Cantidad</th></tr></thead><tbody>';
            rows.forEach((row) => {
                const des = String(row.descripcion || '').replace(/</g, '&lt;');
                const celUn = escHtmlPrint(row.unidad || '—');
                const celCant = row.cantidad != null && row.cantidad !== '' ? escHtmlPrint(String(row.cantidad)) : '—';
                html += `<tr><td class="mat-col-item">${des}</td><td class="mat-col-un">${celUn}</td><td class="mat-col-cant">${celCant}</td></tr>`;
            });
            html += '</tbody></table>';
            body.innerHTML = html;
            if (p.es === 'Cerrado') body.dataset.stableMatPid = String(pid);
        } catch (e) {
            logErrorWeb('materiales-detalle-readonly', e);
            body.innerHTML =
                '<p style="color:var(--re);font-size:.8rem">' +
                escHtmlPrint(mensajeErrorUsuario(e)) +
                '</p><p style="margin-top:.45rem"><button type="button" class="btn-sm primary" onclick="refrescarMaterialesDetallePorPid(' +
                pid +
                ')">Reintentar</button></p>';
        }
        return;
    }
    const puedeEditarMat = puedeEditarMaterialesEnPedido(p);
    try {
        const rows = await sqlMaterialesPedidoRows(pid);
        if (!_materialesDetalleSigueSiendoPedidoActual(p)) return;
        let html = '<table class="mat-det-table"><thead><tr><th class="mat-col-item">Ítem</th><th class="mat-col-un">Unidad</th><th class="mat-col-cant">Cantidad</th><th></th></tr></thead><tbody>';
        rows.forEach(row => {
            const des = String(row.descripcion || '').replace(/</g, '&lt;');
            const mid = parseInt(row.id, 10);
            let celUn = '';
            let celCant = '';
            if (puedeEditarMat) {
                celUn = `<select class="mat-sel-un" onchange="actualizarCampoMaterial(${mid},${pid},'unidad',this.value)">${htmlOptsUnidadMaterial(row.unidad)}</select>`;
                const qc = row.cantidad != null && row.cantidad !== '' ? String(row.cantidad) : '';
                celCant = `<input type="number" class="mat-inp-cant" step="any" value="${qc.replace(/"/g, '&quot;')}" onblur="actualizarCampoMaterial(${mid},${pid},'cantidad',this.value)">`;
            } else {
                celUn = escHtmlPrint(row.unidad || '—');
                celCant = row.cantidad != null && row.cantidad !== '' ? escHtmlPrint(String(row.cantidad)) : '—';
            }
            html += `<tr><td class="mat-col-item">${des}</td><td class="mat-col-un">${celUn}</td><td class="mat-col-cant">${celCant}</td><td>`;
            if (puedeEditarMat) {
                html += `<button type="button" class="btn-sm" onclick="eliminarMaterialPedido(${row.id},${pid})" title="Quitar ítem" style="font-size:.7rem;padding:.15rem .4rem;border-color:#fecaca;color:#b91c1c;background:#fff"><i class="fas fa-trash-alt"></i></button>`;
            }
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        const puedeAgregar = puedeEditarMat;
        if (puedeAgregar) {
            html += `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem;align-items:flex-end">
                <input type="text" id="mat-desc-${pid}" placeholder="Descripción" style="flex:2;min-width:120px;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
                <select id="mat-un-${pid}" style="width:5.5rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem;font-size:.8rem">${htmlOptsUnidadMaterial('PZA')}</select>
                <input type="number" id="mat-cant-${pid}" placeholder="Cant." step="any" style="width:5.5rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
                <button type="button" class="btn-sm primary" onclick="agregarMaterialPedidoDesdeDetalle(${pid})">+ Agregar</button>
            </div>`;
        }
        if (!_materialesDetalleSigueSiendoPedidoActual(p)) return;
        if (!rows.length && !puedeAgregar) {
            body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Sin materiales registrados</p>';
            if (p.es === 'Cerrado') body.dataset.stableMatPid = String(pid);
        } else {
            body.innerHTML = html;
            if (p.es === 'Cerrado') body.dataset.stableMatPid = String(pid);
        }
    } catch (e) {
        logErrorWeb('materiales-detalle', e);
        body.innerHTML =
            '<p style="color:var(--re);font-size:.8rem">' +
            escHtmlPrint(mensajeErrorUsuario(e)) +
            '</p><p style="margin-top:.45rem"><button type="button" class="btn-sm primary" onclick="refrescarMaterialesDetallePorPid(' +
            pid +
            ')">Reintentar</button></p>';
    }
}

window.refrescarMaterialesDetallePorPid = function (pid) {
    const p = app.p.find(x => String(x.id) === String(pid));
    if (p) void refrescarMaterialesEnDetalle(p);
};

/** Materiales en el modal «Cerrar pedido» (mismas reglas que en detalle). */
async function refrescarMaterialesEnModalCierre(p) {
    const body = document.getElementById('cierre-materiales-body');
    if (!body) return;
    if (tipoPedidoExcluyeMateriales(p.tt)) {
        body.innerHTML = '';
        return;
    }
    const pid = parseInt(p.id, 10);
    if (String(p.id).startsWith('off_') || modoOffline || !NEON_OK) {
        body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Materiales: requiere conexión a Neon.</p>';
        return;
    }
    const puedeEditarMat = puedeEditarMaterialesEnPedido(p);
    try {
        const rows = await sqlMaterialesPedidoRows(pid);
        if (!_materialesCierreModalSigueSiendoPedidoActual(p)) return;
        let html = '<table class="mat-det-table"><thead><tr><th class="mat-col-item">Ítem</th><th class="mat-col-un">Unidad</th><th class="mat-col-cant">Cantidad</th><th></th></tr></thead><tbody>';
        rows.forEach(row => {
            const des = String(row.descripcion || '').replace(/</g, '&lt;');
            const mid = parseInt(row.id, 10);
            let celUn = '';
            let celCant = '';
            if (puedeEditarMat) {
                celUn = `<select class="mat-sel-un" onchange="actualizarCampoMaterial(${mid},${pid},'unidad',this.value)">${htmlOptsUnidadMaterial(row.unidad)}</select>`;
                const qc = row.cantidad != null && row.cantidad !== '' ? String(row.cantidad) : '';
                celCant = `<input type="number" class="mat-inp-cant" step="any" value="${qc.replace(/"/g, '&quot;')}" onblur="actualizarCampoMaterial(${mid},${pid},'cantidad',this.value)">`;
            } else {
                celUn = escHtmlPrint(row.unidad || '—');
                celCant = row.cantidad != null && row.cantidad !== '' ? escHtmlPrint(String(row.cantidad)) : '—';
            }
            html += `<tr><td class="mat-col-item">${des}</td><td class="mat-col-un">${celUn}</td><td class="mat-col-cant">${celCant}</td><td>`;
            if (puedeEditarMat) {
                html += `<button type="button" class="btn-sm" onclick="eliminarMaterialPedido(${row.id},${pid})" title="Quitar ítem" style="font-size:.7rem;padding:.15rem .4rem;border-color:#fecaca;color:#b91c1c;background:#fff"><i class="fas fa-trash-alt"></i></button>`;
            }
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        if (puedeEditarMat) {
            html += `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem;align-items:flex-end">
                <input type="text" id="cierre-mat-desc-${pid}" placeholder="Descripción" style="flex:2;min-width:120px;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
                <select id="cierre-mat-un-${pid}" style="width:5.5rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem;font-size:.8rem">${htmlOptsUnidadMaterial('PZA')}</select>
                <input type="number" id="cierre-mat-cant-${pid}" placeholder="Cant." step="any" style="width:5.5rem;padding:.35rem;border:1px solid var(--bo);border-radius:.4rem">
                <button type="button" class="btn-sm primary" onclick="agregarMaterialPedidoDesdeCierreModal(${pid})">+ Agregar</button>
            </div>`;
        }
        if (!_materialesCierreModalSigueSiendoPedidoActual(p)) return;
        if (!rows.length && !puedeEditarMat) {
            body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Sin materiales registrados</p>';
        } else {
            body.innerHTML = html;
        }
    } catch (e) {
        logErrorWeb('materiales-cierre-modal', e);
        body.innerHTML =
            '<p style="color:var(--re);font-size:.8rem">' +
            escHtmlPrint(mensajeErrorUsuario(e)) +
            '</p><p style="margin-top:.45rem"><button type="button" class="btn-sm primary" onclick="refrescarMaterialesCierrePorPid(' +
            pid +
            ')">Reintentar carga</button></p>';
    }
}

window.refrescarMaterialesCierrePorPid = function (pid) {
    const p = app.p.find(x => String(x.id) === String(pid));
    if (p) void refrescarMaterialesEnModalCierre(p);
};

function sincronizarVistaMaterialesPedido(p) {
    if (!p) return;
    void refrescarMaterialesEnDetalle(p);
    const cm2 = document.getElementById('cm2');
    if (cm2?.classList.contains('active') && String(app.cid) === String(p.id)) {
        void refrescarMaterialesEnModalCierre(p);
    }
}

window.actualizarCampoMaterial = async function (mid, pid, campo, valor) {
    if (modoOffline || !NEON_OK) return;
    const p0 = app.p.find((x) => String(x.id) === String(pid));
    if (p0 && tipoPedidoExcluyeMateriales(p0.tt)) {
        toast('Este tipo de pedido no admite materiales', 'error');
        return;
    }
    if (!p0 || !puedeEditarMaterialesEnPedido(p0)) {
        toast('No tenés permiso para editar materiales de este pedido', 'error');
        return;
    }
    try {
        if (campo === 'unidad') {
            await sqlSimple(`UPDATE pedido_materiales SET unidad = ${esc(valor || null)} WHERE id = ${esc(parseInt(mid, 10))}`);
        } else if (campo === 'cantidad') {
            const c = valor === '' || valor == null ? null : parseFloat(valor);
            if (valor !== '' && Number.isNaN(c)) { toast('Cantidad inválida', 'error'); return; }
            if (c != null && c <= 0) { toast('La cantidad debe ser mayor que cero', 'error'); return; }
            await sqlSimple(`UPDATE pedido_materiales SET cantidad = ${esc(c)} WHERE id = ${esc(parseInt(mid, 10))}`);
        }
        const p = app.p.find(x => String(x.id) === String(pid));
        if (p) await sincronizarVistaMaterialesPedido(p);
    } catch (e) { toastError('material-editar', e); }
};

window.agregarMaterialPedidoDesdeDetalle = async function (pid) {
    const p0 = app.p.find((x) => String(x.id) === String(pid));
    if (p0 && tipoPedidoExcluyeMateriales(p0.tt)) {
        toast('Este tipo de pedido no admite materiales', 'error');
        return;
    }
    if (!p0 || !puedeEditarMaterialesEnPedido(p0)) {
        toast('No tenés permiso para cargar materiales en este pedido', 'error');
        return;
    }
    const d = document.getElementById('mat-desc-' + pid)?.value.trim();
    if (!d) { toast('Indicá descripción del material', 'error'); return; }
    const cantRaw = document.getElementById('mat-cant-' + pid)?.value;
    const un = document.getElementById('mat-un-' + pid)?.value?.trim() || '';
    const cant = cantRaw === '' || cantRaw == null ? null : parseFloat(cantRaw);
    if (cant == null || !Number.isFinite(cant) || cant <= 0) {
        toast('Indicá una cantidad mayor que cero', 'error');
        return;
    }
    try {
        await sqlSimple(`INSERT INTO pedido_materiales(pedido_id, descripcion, cantidad, unidad) VALUES (${esc(pid)}, ${esc(d)}, ${esc(cant)}, ${esc(un || null)})`);
        toast('Material registrado', 'success');
        const p = app.p.find(x => String(x.id) === String(pid));
        if (p) sincronizarVistaMaterialesPedido(p);
    } catch (e) { toastError('material-agregar', e); }
};

window.agregarMaterialPedidoDesdeCierreModal = async function (pid) {
    const p0 = app.p.find((x) => String(x.id) === String(pid));
    if (p0 && tipoPedidoExcluyeMateriales(p0.tt)) {
        toast('Este tipo de pedido no admite materiales', 'error');
        return;
    }
    if (!p0 || !puedeEditarMaterialesEnPedido(p0)) {
        toast('No tenés permiso para cargar materiales en este pedido', 'error');
        return;
    }
    const d = document.getElementById('cierre-mat-desc-' + pid)?.value.trim();
    if (!d) { toast('Indicá descripción del material', 'error'); return; }
    const cantRaw = document.getElementById('cierre-mat-cant-' + pid)?.value;
    const un = document.getElementById('cierre-mat-un-' + pid)?.value?.trim() || '';
    const cant = cantRaw === '' || cantRaw == null ? null : parseFloat(cantRaw);
    if (cant == null || !Number.isFinite(cant) || cant <= 0) {
        toast('Indicá una cantidad mayor que cero', 'error');
        return;
    }
    try {
        await sqlSimple(`INSERT INTO pedido_materiales(pedido_id, descripcion, cantidad, unidad) VALUES (${esc(pid)}, ${esc(d)}, ${esc(cant)}, ${esc(un || null)})`);
        toast('Material registrado', 'success');
        const p = app.p.find(x => String(x.id) === String(pid));
        if (p) sincronizarVistaMaterialesPedido(p);
    } catch (e) { toastError('material-agregar-cierre', e); }
};

window.eliminarMaterialPedido = async function (mid, pid) {
    const p0 = app.p.find((x) => String(x.id) === String(pid));
    if (p0 && tipoPedidoExcluyeMateriales(p0.tt)) {
        toast('Este tipo de pedido no admite materiales', 'error');
        return;
    }
    if (!p0 || !puedeEditarMaterialesEnPedido(p0)) {
        toast('No tenés permiso para editar materiales de este pedido', 'error');
        return;
    }
    if (!confirm('¿Eliminar material?')) return;
    try {
        await sqlSimple(`DELETE FROM pedido_materiales WHERE id=${esc(parseInt(mid, 10))}`);
        const p = app.p.find(x => String(x.id) === String(pid));
        if (p) sincronizarVistaMaterialesPedido(p);
    } catch (e) { toastError('material-eliminar', e); }
};

function pedidoTieneClienteCargado(p) {
    return !!(p && String(p.cl || '').trim());
}

let _cacheInfraAfectadosTablas = null;
let _cacheInfraTrafoColDistribuidor = null;
let _cacheDistribuidorColLocalidad = null;
function invalidateInfraAfectadosTablasCache() {
    _cacheInfraAfectadosTablas = null;
    _cacheInfraTrafoColDistribuidor = null;
    _cacheDistribuidorColLocalidad = null;
}

async function sqlDistribuidoresTieneLocalidad() {
    if (!NEON_OK || !_sql) return false;
    if (_cacheDistribuidorColLocalidad !== null) return _cacheDistribuidorColLocalidad;
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'distribuidores' AND column_name = 'localidad' LIMIT 1`
        );
        _cacheDistribuidorColLocalidad = !!(r.rows && r.rows.length);
    } catch (_) {
        _cacheDistribuidorColLocalidad = false;
    }
    return _cacheDistribuidorColLocalidad;
}

async function sqlInfraTrafoTieneDistribuidorId() {
    if (!NEON_OK || !_sql) return false;
    if (_cacheInfraTrafoColDistribuidor !== null) return _cacheInfraTrafoColDistribuidor;
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'infra_transformadores' AND column_name = 'distribuidor_id' LIMIT 1`
        );
        _cacheInfraTrafoColDistribuidor = !!(r.rows && r.rows.length);
    } catch (_) {
        _cacheInfraTrafoColDistribuidor = false;
    }
    return _cacheInfraTrafoColDistribuidor;
}

async function sqlInfraAfectadosTablasExisten() {
    if (!NEON_OK || !_sql) return false;
    if (_cacheInfraAfectadosTablas !== null) return _cacheInfraAfectadosTablas;
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'infra_transformadores' LIMIT 1`
        );
        _cacheInfraAfectadosTablas = !!(r.rows && r.rows.length);
    } catch (_) {
        _cacheInfraAfectadosTablas = false;
    }
    return _cacheInfraAfectadosTablas;
}

async function infraAfectadosDisponibleCierre() {
    if (debeOcultarTabClientesAfectadosInfraAdmin()) return false;
    if (await sqlInfraAfectadosTablasExisten()) return true;
    if (puedeEnviarApiRestPedidos()) {
        try {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return false;
            const resp = await fetch(apiUrl('/api/infra-afectados/transformadores'), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (resp.status === 503) return false;
            return resp.ok;
        } catch (_) {
            return false;
        }
    }
    return false;
}

function syncCierreAfectadosPanels() {
    const m = document.querySelector('input[name="cierre-afect-metodo"]:checked')?.value || 'omitir';
    const show = (id, on) => {
        const el = document.getElementById(id);
        if (el) el.style.display = on ? '' : 'none';
    };
    show('cierre-afect-panel-trafo', m === 'transformador');
    show('cierre-afect-panel-distribuidor', m === 'distribuidor');
    show('cierre-afect-panel-alimentador', m === 'alimentador');
    show('cierre-afect-panel-rango', m === 'rango');
    show('cierre-afect-panel-manual', m === 'manual');
}
window.syncCierreAfectadosPanels = syncCierreAfectadosPanels;

function llenarSelectOptionText(sel, value, text) {
    const o = document.createElement('option');
    o.value = String(value);
    o.textContent = text;
    sel.appendChild(o);
}

function llenarCierreSelectsDistribuidorResumen(rows) {
    const sd = document.getElementById('cierre-afect-sel-distribuidor');
    const sad = document.getElementById('cierre-afect-alim-dist');
    if (!sd || !sad) return;
    sd.innerHTML = '';
    llenarSelectOptionText(sd, '', '— Elegir distribuidor —');
    sad.innerHTML = '';
    llenarSelectOptionText(sad, '', '— Elegir distribuidor —');
    for (const row of rows || []) {
        const did = Number(row.distribuidor_id);
        if (!Number.isFinite(did)) continue;
        const cod = String(row.codigo || '');
        const nom = row.nombre ? String(row.nombre) : '';
        const loc = row.localidad ? String(row.localidad) : '';
        const kva = Number(row.total_kva) || 0;
        const soc = Number(row.total_clientes) || 0;
        const ntr = Number(row.cant_transformadores) || 0;
        const lab = `${cod}${nom ? ' — ' + nom : ''}${loc ? ' · ' + loc : ''} · ${soc} socios · ${kva} kVA · ${ntr} trafos`;
        llenarSelectOptionText(sd, did, lab);
        llenarSelectOptionText(sad, did, lab);
    }
}

async function refrescarCierreSelectAlimentadores() {
    const sad = document.getElementById('cierre-afect-alim-dist');
    const sal = document.getElementById('cierre-afect-sel-alimentador');
    if (!sad || !sal) return;
    const did = Number(sad.value);
    sal.innerHTML = '';
    llenarSelectOptionText(sal, '', '— Elegir alimentador —');
    if (!Number.isFinite(did) || did <= 0) return;
    try {
        if (NEON_OK && _sql && (await sqlInfraTrafoTieneDistribuidorId())) {
            const tid = tenantIdActual();
            const r = await sqlSimple(
                `SELECT TRIM(alimentador) AS alimentador,
                  COALESCE(SUM(capacidad_kva),0) AS total_kva,
                  COALESCE(SUM(clientes_conectados),0) AS total_clientes,
                  COUNT(*)::int AS cant_tr
                 FROM infra_transformadores
                 WHERE tenant_id = ${esc(tid)} AND distribuidor_id = ${esc(did)} AND activo = TRUE
                   AND alimentador IS NOT NULL AND TRIM(alimentador) <> ''
                 GROUP BY TRIM(alimentador)
                 ORDER BY TRIM(alimentador)`
            );
            for (const row of r.rows || []) {
                const a = String(row.alimentador || '');
                if (!a) continue;
                const kva = Number(row.total_kva) || 0;
                const soc = Number(row.total_clientes) || 0;
                llenarSelectOptionText(sal, a, `${a} · ${soc} socios · ${kva} kVA (${row.cant_tr} trafos)`);
            }
        } else if (puedeEnviarApiRestPedidos()) {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return;
            const resp = await fetch(
                apiUrl(`/api/infra-afectados/resumen-por-alimentador?distribuidor_id=${encodeURIComponent(String(did))}`),
                { headers: { Authorization: `Bearer ${tok}` } }
            );
            if (!resp.ok) return;
            const list = await resp.json();
            for (const row of list) {
                const a = String(row.alimentador || '');
                if (!a) continue;
                const kva = Number(row.total_kva) || 0;
                const soc = Number(row.total_clientes) || 0;
                const ntr = Number(row.cant_transformadores) || 0;
                llenarSelectOptionText(sal, a, `${a} · ${soc} socios · ${kva} kVA (${ntr} trafos)`);
            }
        }
    } catch (e) {
        console.warn('[cierre-afectados] alimentadores', e);
    }
}

async function llenarCatalogosCierreAfectados() {
    const selT = document.getElementById('cierre-afect-sel-trafo');
    if (!selT) return;
    selT.innerHTML = '';
    llenarSelectOptionText(selT, '', '— Elegir transformador —');
    llenarCierreSelectsDistribuidorResumen([]);
    const sal = document.getElementById('cierre-afect-sel-alimentador');
    if (sal) {
        sal.innerHTML = '';
        llenarSelectOptionText(sal, '', '— Elegir alimentador —');
    }
    const tid = tenantIdActual();
    try {
        if (NEON_OK && _sql && (await sqlInfraAfectadosTablasExisten())) {
            const rT = await sqlSimple(
                `SELECT id, codigo, nombre, clientes_conectados FROM infra_transformadores WHERE tenant_id = ${esc(
                    tid
                )} AND activo = TRUE ORDER BY codigo`
            );
            for (const row of rT.rows || []) {
                const cc = Number(row.clientes_conectados) || 0;
                const cod = String(row.codigo || '');
                const nom = row.nombre ? String(row.nombre) : '';
                const lab = nom ? `${cod} — ${nom} (${cc} socios)` : `${cod} (${cc} socios)`;
                llenarSelectOptionText(selT, row.id, lab);
            }
            if (await sqlInfraTrafoTieneDistribuidorId()) {
                const hasLoc = await sqlDistribuidoresTieneLocalidad();
                const rD = await sqlSimple(
                    hasLoc
                        ? `SELECT d.id AS distribuidor_id, d.codigo, d.nombre, d.localidad,
                      COALESCE(SUM(t.capacidad_kva),0)::bigint AS total_kva,
                      COALESCE(SUM(t.clientes_conectados),0)::bigint AS total_clientes,
                      COUNT(t.id)::int AS cant_transformadores
                     FROM infra_transformadores t
                     INNER JOIN distribuidores d ON d.id = t.distribuidor_id
                     WHERE t.tenant_id = ${esc(tid)} AND t.activo = TRUE AND t.distribuidor_id IS NOT NULL
                     GROUP BY d.id, d.codigo, d.nombre, d.localidad
                     ORDER BY d.codigo`
                        : `SELECT d.id AS distribuidor_id, d.codigo, d.nombre,
                      COALESCE(SUM(t.capacidad_kva),0)::bigint AS total_kva,
                      COALESCE(SUM(t.clientes_conectados),0)::bigint AS total_clientes,
                      COUNT(t.id)::int AS cant_transformadores
                     FROM infra_transformadores t
                     INNER JOIN distribuidores d ON d.id = t.distribuidor_id
                     WHERE t.tenant_id = ${esc(tid)} AND t.activo = TRUE AND t.distribuidor_id IS NOT NULL
                     GROUP BY d.id, d.codigo, d.nombre
                     ORDER BY d.codigo`
                );
                llenarCierreSelectsDistribuidorResumen(rD.rows || []);
            }
        } else if (puedeEnviarApiRestPedidos()) {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return;
            const h = { Authorization: `Bearer ${tok}` };
            const respT = await fetch(apiUrl('/api/infra-afectados/transformadores'), { headers: h });
            const rowsT = respT.ok ? await respT.json() : [];
            for (const row of rowsT) {
                const cc = Number(row.clientes_conectados) || 0;
                const cod = String(row.codigo || '');
                const nom = row.nombre ? String(row.nombre) : '';
                const lab = nom ? `${cod} — ${nom} (${cc} socios)` : `${cod} (${cc} socios)`;
                llenarSelectOptionText(selT, row.id, lab);
            }
            const respD = await fetch(apiUrl('/api/infra-afectados/resumen-por-distribuidor'), { headers: h });
            if (respD.ok) {
                llenarCierreSelectsDistribuidorResumen(await respD.json());
            }
        }
    } catch (e) {
        console.warn('[cierre-afectados] catálogo', e);
    }
    try {
        const sdChk = document.getElementById('cierre-afect-sel-distribuidor');
        if (sdChk && sdChk.options.length <= 1 && NEON_OK && _sql) {
            try {
                const chkT = await sqlSimple(
                    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'distribuidores' AND column_name = 'tenant_id' LIMIT 1`
                );
                const hasT = !!(chkT.rows && chkT.rows.length);
                const rFb = await sqlSimple(
                    hasT
                        ? `SELECT id AS distribuidor_id, codigo, nombre, localidad FROM distribuidores WHERE tenant_id = ${esc(
                              tid
                          )} AND COALESCE(activo, TRUE) ORDER BY codigo`
                        : `SELECT id AS distribuidor_id, codigo, nombre, NULL::text AS localidad FROM distribuidores WHERE COALESCE(activo, TRUE) ORDER BY codigo`
                );
                const rowsFb = (rFb.rows || []).map((row) => ({
                    ...row,
                    total_kva: 0,
                    total_clientes: 0,
                    cant_transformadores: 0,
                }));
                if (rowsFb.length) llenarCierreSelectsDistribuidorResumen(rowsFb);
            } catch (_) {}
        }
    } catch (_) {}
    const sad = document.getElementById('cierre-afect-alim-dist');
    if (sad && !sad.dataset.boundAlim) {
        sad.dataset.boundAlim = '1';
        sad.addEventListener('change', () => void refrescarCierreSelectAlimentadores());
    }
}

function _normTrafoCodigoPedido(s) {
    return String(s || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/^TR-?/, '');
}

function _normDistCodigoPedido(s) {
    return String(s || '').trim().toUpperCase();
}

async function aplicarPresetInfraCierreDesdePedido(p) {
    const blk = document.getElementById('cierre-afectados-block');
    if (!blk || blk.style.display === 'none' || !p) return;
    const selT = document.getElementById('cierre-afect-sel-trafo');
    const trafoCod = _normTrafoCodigoPedido(p.trf);
    const disCod = _normDistCodigoPedido(p.dis);
    let trafoIdSql = null;
    let distIdSql = null;
    let alimSql = '';
    if (NEON_OK && _sql && trafoCod && (await sqlInfraAfectadosTablasExisten())) {
        try {
            const tid = tenantIdActual();
            const r1 = await sqlSimple(
                `SELECT id, codigo, distribuidor_id, TRIM(alimentador) AS alimentador FROM infra_transformadores
                 WHERE tenant_id = ${esc(tid)} AND activo = TRUE
                 AND REPLACE(UPPER(TRIM(REPLACE(REPLACE(codigo, '-', ''), ' ', ''))), 'TR', '') = ${esc(trafoCod)}
                 LIMIT 5`
            );
            const row = (r1.rows || []).find((x) => _normTrafoCodigoPedido(x.codigo) === trafoCod) || r1.rows?.[0];
            if (row) {
                trafoIdSql = row.id;
                distIdSql = row.distribuidor_id != null ? Number(row.distribuidor_id) : null;
                alimSql = row.alimentador ? String(row.alimentador).trim() : '';
            }
        } catch (_) {}
    }
    const pickTrafoSelect = () => {
        if (!selT || !selT.options.length) return null;
        for (let i = 0; i < selT.options.length; i++) {
            const o = selT.options[i];
            const lab = String(o.textContent || '');
            const val = String(o.value || '');
            if (trafoIdSql != null && val === String(trafoIdSql)) return val;
            const firstTok = lab.split(/[\s—-]/)[0] || '';
            if (trafoCod && _normTrafoCodigoPedido(firstTok) === trafoCod) return val;
            if (trafoCod && lab.toUpperCase().replace(/\s+/g, '').includes(trafoCod)) return val;
        }
        return null;
    };
    const trafoVal = pickTrafoSelect();
    const trafoRadio = blk.querySelector('input[value="transformador"]');
    if (trafoVal && trafoRadio) {
        trafoRadio.checked = true;
        selT.value = trafoVal;
        syncCierreAfectadosPanels();
        return;
    }
    const sd = document.getElementById('cierre-afect-sel-distribuidor');
    const sad = document.getElementById('cierre-afect-alim-dist');
    const pickDistVal = () => {
        const lists = [sd, sad].filter(Boolean);
        for (const el of lists) {
            if (!el.options.length) continue;
            for (let i = 0; i < el.options.length; i++) {
                const o = el.options[i];
                if (!o.value) continue;
                const lab = String(o.textContent || '');
                const head = lab.split(/[·—]/)[0].trim().toUpperCase();
                if (disCod && (head.startsWith(disCod) || head.includes(disCod))) return o.value;
            }
        }
        if (distIdSql != null && sd) {
            for (let i = 0; i < sd.options.length; i++) {
                if (sd.options[i].value === String(distIdSql)) return sd.options[i].value;
            }
        }
        return null;
    };
    const did = pickDistVal();
    const sal = document.getElementById('cierre-afect-sel-alimentador');
    if (did && alimSql && distIdSql != null && sal) {
        const alRadio = blk.querySelector('input[value="alimentador"]');
        if (alRadio) {
            alRadio.checked = true;
            syncCierreAfectadosPanels();
            sad.value = String(did);
            await refrescarCierreSelectAlimentadores();
            for (let i = 0; i < sal.options.length; i++) {
                const o = sal.options[i];
                if (!o.value) continue;
                if (o.value.toUpperCase() === alimSql.toUpperCase()) {
                    sal.value = o.value;
                    return;
                }
                if (String(o.textContent || '').toUpperCase().startsWith(alimSql.toUpperCase())) {
                    sal.value = o.value;
                    return;
                }
            }
            return;
        }
    }
    if (did) {
        const dRadio = blk.querySelector('input[value="distribuidor"]');
        if (dRadio && sd) {
            dRadio.checked = true;
            sd.value = String(did);
            syncCierreAfectadosPanels();
        }
    }
}

async function prepararBloqueClientesAfectadosCierre(_p) {
    /* Bloque SAIDI/SAIFI manual eliminado: los índices se calculan en estadísticas. */
}

function leerCuerpoValidadoCierreAfectados() {
    return { ok: true, body: null };
}

async function neonInsertClientesAfectadosLog(pedidoId, body) {
    const tid = tenantIdActual();
    const uid = app.u?.id != null ? Number(app.u.id) : null;
    const metodo = String(body.metodo || '').toLowerCase();
    let transformador_id = null;
    let zona_id = null;
    let distribuidor_id = null;
    let alimentador = null;
    let medidor_desde = null;
    let medidor_hasta = null;
    let cantidad_clientes = 0;
    let es_estimado = false;
    if (metodo === 'transformador') {
        const trId = Number(body.transformador_id);
        const r = await sqlSimple(
            `SELECT id, clientes_conectados FROM infra_transformadores WHERE id = ${esc(trId)} AND tenant_id = ${esc(
                tid
            )} AND activo = TRUE LIMIT 1`
        );
        if (!r.rows?.length) throw new Error('Transformador inválido');
        transformador_id = r.rows[0].id;
        cantidad_clientes = Math.max(0, Number(r.rows[0].clientes_conectados) || 0);
    } else if (metodo === 'distribuidor') {
        const did = Number(body.distribuidor_id);
        if (!(await sqlInfraTrafoTieneDistribuidorId())) throw new Error('Ejecutá la migración SQL distribuidor/alimentador');
        const r = await sqlSimple(
            `SELECT COALESCE(SUM(clientes_conectados), 0) AS t FROM infra_transformadores WHERE tenant_id = ${esc(
                tid
            )} AND distribuidor_id = ${esc(did)} AND activo = TRUE`
        );
        distribuidor_id = did;
        cantidad_clientes = Math.max(0, Number(r.rows?.[0]?.t) || 0);
        es_estimado = false;
    } else if (metodo === 'alimentador') {
        const did = Number(body.distribuidor_id);
        alimentador = String(body.alimentador || '').trim();
        if (!(await sqlInfraTrafoTieneDistribuidorId())) throw new Error('Ejecutá la migración SQL distribuidor/alimentador');
        const r = await sqlSimple(
            `SELECT COALESCE(SUM(clientes_conectados), 0) AS t FROM infra_transformadores WHERE tenant_id = ${esc(
                tid
            )} AND distribuidor_id = ${esc(did)} AND activo = TRUE AND TRIM(alimentador) = ${esc(alimentador)}`
        );
        distribuidor_id = did;
        cantidad_clientes = Math.max(0, Number(r.rows?.[0]?.t) || 0);
        es_estimado = false;
    } else if (metodo === 'zona') {
        const zId = Number(body.zona_id);
        const r = await sqlSimple(
            `SELECT id, clientes_estimados FROM infra_zonas_clientes WHERE id = ${esc(zId)} AND tenant_id = ${esc(
                tid
            )} AND activo = TRUE LIMIT 1`
        );
        if (!r.rows?.length) throw new Error('Zona inválida');
        zona_id = r.rows[0].id;
        cantidad_clientes = Math.max(0, Number(r.rows[0].clientes_estimados) || 0);
        es_estimado = true;
    } else if (metodo === 'rango') {
        medidor_desde = String(body.medidor_desde || '').trim();
        medidor_hasta = String(body.medidor_hasta || '').trim();
        const a = Number.parseInt(medidor_desde, 10);
        const b = Number.parseInt(medidor_hasta, 10);
        if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
            cantidad_clientes = b - a + 1;
        } else {
            cantidad_clientes = Math.max(0, Number(body.cantidad) || 0);
            es_estimado = true;
        }
    } else if (metodo === 'manual') {
        cantidad_clientes = Math.max(0, Number(body.cantidad) || 0);
        es_estimado = body.es_estimado !== undefined ? !!body.es_estimado : true;
    } else {
        throw new Error('Método no válido');
    }
    if (cantidad_clientes <= 0) throw new Error('Cantidad inválida');
    await sqlSimple(
        `INSERT INTO clientes_afectados_log (pedido_id, tenant_id, metodo, transformador_id, zona_id, distribuidor_id, alimentador, medidor_desde, medidor_hasta, cantidad_clientes, es_estimado, usuario_id) VALUES (${esc(
            pedidoId
        )}, ${esc(tid)}, ${esc(metodo)}, ${esc(transformador_id)}, ${esc(zona_id)}, ${esc(distribuidor_id)}, ${esc(
            alimentador
        )}, ${esc(medidor_desde)}, ${esc(medidor_hasta)}, ${esc(cantidad_clientes)}, ${es_estimado}, ${esc(uid)})`
    );
}

async function enviarRegistroClientesAfectados(pedidoId, body) {
    const pid = Number(pedidoId);
    if (!Number.isFinite(pid) || pid <= 0) return { ok: false };
    if (puedeEnviarApiRestPedidos()) {
        try {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return { ok: false, warning: 'No se pudo registrar clientes afectados (sin token API).' };
            const resp = await fetch(apiUrl(`/api/pedidos/${pid}/clientes-afectados`), {
                method: 'POST',
                headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                const t = await resp.text();
                console.warn('[clientes-afectados]', resp.status, t.slice(0, 300));
                if (NEON_OK && _sql && (await sqlInfraAfectadosTablasExisten())) {
                    try {
                        await neonInsertClientesAfectadosLog(pid, body);
                        return { ok: true };
                    } catch (_) {}
                }
                return {
                    ok: false,
                    warning: 'El cierre se guardó; no se pudo registrar clientes afectados en el servidor.',
                };
            }
            return { ok: true };
        } catch (e) {
            if (NEON_OK && _sql && (await sqlInfraAfectadosTablasExisten())) {
                try {
                    await neonInsertClientesAfectadosLog(pid, body);
                    return { ok: true };
                } catch (_) {}
            }
            return { ok: false, warning: 'El cierre se guardó; falló el registro de clientes afectados.' };
        }
    }
    if (NEON_OK && _sql && (await sqlInfraAfectadosTablasExisten())) {
        try {
            await neonInsertClientesAfectadosLog(pid, body);
            return { ok: true };
        } catch (e) {
            console.warn('[clientes-afectados-neon]', e);
            return {
                ok: false,
                warning: 'El cierre se guardó; no se pudo registrar clientes afectados en la base.',
            };
        }
    }
    return {
        ok: false,
        warning: 'El cierre se guardó; sin API ni tablas locales para clientes afectados.',
    };
}

async function abrirCierre(id) {
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) return;
    
    app.cid = id;
    const lblFirma = document.getElementById('lbl-firma-cierre');
    const _fp = etiquetaFirmaPersona();
    if (lblFirma) {
        if (pedidoTieneClienteCargado(p)) {
            lblFirma.innerHTML = `<i class="fas fa-signature"></i> Firma del cliente / ${_fp} <span style="font-weight:600;color:#b45309">(obligatoria)</span>`;
        } else {
            lblFirma.innerHTML = `<i class="fas fa-signature"></i> Firma del cliente / ${_fp} <span style="font-weight:400;opacity:.88;font-size:.88em">(opcional — no hay ${etiquetaCampoClientePedido().toLowerCase()} en el pedido)</span>`;
        }
    }
    document.getElementById('ci').innerHTML = `
        <strong>#${p.np}</strong> - ${p.tt}<br>
        <span style="font-size:.85em">${p.de.substring(0,100)}${p.de.length > 100 ? '…' : ''}</span>
    `;
    document.getElementById('tr').value = '';
    document.getElementById('tc2').value = app.u?.nombre || '';
    const telCierreIn = document.getElementById('cierre-tel-contacto');
    if (telCierreIn) telCierreIn.value = (p.tel || '').trim();
    document.getElementById('tc').textContent = '0';
    ['chk-epp','chk-corte','chk-senal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });

    const blkMat = document.getElementById('cierre-materiales-block');
    const bodyMat = document.getElementById('cierre-materiales-body');
    if (blkMat && bodyMat) {
        const admiteMat = !tipoPedidoExcluyeMateriales(p.tt) && !String(p.id).startsWith('off_') && !modoOffline && NEON_OK;
        if (admiteMat) {
            blkMat.style.display = '';
            void refrescarMaterialesEnModalCierre(p);
        } else {
            blkMat.style.display = 'none';
            bodyMat.innerHTML = '';
        }
    }

    await prepararBloqueClientesAfectadosCierre(p);

    fotoCierreTemp = null;
    actualizarVistaPreviaFotoCierre();
    initFirmaCierreCanvas();
    limpiarFirmaCierreCanvas();
    document.getElementById('cm2').classList.add('active');
}

document.getElementById('btn-limpiar-firma-cierre')?.addEventListener('click', () => limpiarFirmaCierreCanvas());

document.getElementById('cc2').addEventListener('click', async () => {
    const tr = document.getElementById('tr').value.trim();
    if (!tr) {
        toast('Describí el trabajo realizado', 'error');
        return;
    }
    const pCierre = app.p.find(x => String(x.id) === String(app.cid));
    const firmaObligatoria = pedidoTieneClienteCargado(pCierre);
    if (firmaObligatoria && firmaCierreCanvasVacio()) {
        toast('Este pedido tiene cliente cargado: la firma es obligatoria', 'error');
        return;
    }
    const c = document.getElementById('firma-canvas-cierre');
    const firmaData = !firmaCierreCanvasVacio() && c ? c.toDataURL('image/png') : null;
    const checklistJson = JSON.stringify({
        epp: !!document.getElementById('chk-epp')?.checked,
        corte: !!document.getElementById('chk-corte')?.checked,
        senal: !!document.getElementById('chk-senal')?.checked
    });
    const btn = document.getElementById('cc2');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Guardando...';
    try {
        await asegurarJwtApiRest();
        const telCierre = (document.getElementById('cierre-tel-contacto')?.value || '').trim();
        const camposCierre = {
            estado: 'Cerrado',
            avance: 100,
            trabajo_realizado: tr,
            tecnico_cierre: document.getElementById('tc2').value.trim() || app.u?.nombre || '',
            fecha_cierre: new Date().toISOString(),
            foto_cierre: fotoCierreTemp || null,
            firma_cliente: firmaData,
            checklist_seguridad: checklistJson
        };
        if (telCierre) camposCierre.telefono_contacto = telCierre;

        let cerradoViaApi = false;
        if (getApiBaseUrl() && getApiToken() && !String(app.cid).startsWith('off_')) {
            const pidNum = parseInt(app.cid, 10);
            if (Number.isFinite(pidNum) && pidNum > 0) {
                const apiBody = {
                    estado: 'Cerrado',
                    avance: 100,
                    trabajo_realizado: tr,
                    tecnico_cierre: camposCierre.tecnico_cierre,
                    checklist_seguridad: checklistJson
                };
                if (telCierre) apiBody.telefono_contacto = telCierre;
                if (firmaData) apiBody.firma_cliente = firmaData;
                if (fotoCierreTemp) apiBody.foto_base64 = fotoCierreTemp;
                const apiRow = await pedidoPutApi(app.cid, apiBody);
                if (apiRow) {
                    cerradoViaApi = true;
                    const ix = app.p.findIndex((x) => String(x.id) === String(app.cid));
                    if (ix !== -1) app.p[ix] = norm(apiRow);
                    offlinePedidosSave(app.p);
                }
            }
        }
        if (!cerradoViaApi) {
            await updPedido(app.cid, camposCierre, app.u?.id);
        }
        const pidCierre = parseInt(app.cid, 10);
        if (
            !modoOffline &&
            getApiBaseUrl() &&
            !String(app.cid).startsWith('off_') &&
            Number.isFinite(pidCierre) &&
            pidCierre > 0
        ) {
            await asegurarJwtApiRest();
            if (getApiToken()) {
                await notificarCierreWhatsappApi(pidCierre, telCierre || undefined);
            }
        }
        fotoCierreTemp = null;
        closeAll();
        toast('Pedido cerrado', 'success');
    } catch(e) {
        toastError('cerrar-pedido', e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirmar cierre';
    }
});

function pedidoEsDerivadoFuera(p) {
    if (!p) return false;
    return String(p.es || '') === 'Derivado externo' || p.dex === true || p.dex === 1;
}

function adminMuestraPedidosDerivadosFuera() {
    try {
        return esAdmin() && localStorage.getItem(LS_MOSTRAR_DERIVADOS_FUERA) === '1';
    } catch (_) {
        return false;
    }
}

function construirOpcionesDerivacionAdminHtml(escFn) {
    const dr = window.EMPRESA_CFG?.derivacion_reclamos;
    if (!dr || typeof dr !== 'object') {
        return `<option value="">${escFn('Configurá contactos en Admin → Empresa')}</option>`;
    }
    const out = [];
    const one = (k, shortLab) => {
        const s = dr[k];
        if (s?.whatsapp && /^\+\d{8,22}$/.test(String(s.whatsapp))) {
            const n = String(s.nombre || '').trim();
            const label = n ? `${shortLab} — ${n}` : shortLab;
            out.push(`<option value="${k}::">${escFn(label)}</option>`);
        }
    };
    one('empresa_energia', 'Energía eléctrica');
    one('cooperativa_agua', 'Cooperativa de agua');
    one('empresa_gas_natural', 'Gas natural');
    one('empresa_telefonia', 'Telefonía');
    [['empresa_internet', 'Internet'], ['empresa_tv_cable', 'TV cable']].forEach(([k, shortLab]) => {
        const arr = Array.isArray(dr[k]) ? dr[k] : [];
        arr.forEach((slot, i) => {
            if (slot?.whatsapp && /^\+\d{8,22}$/.test(String(slot.whatsapp))) {
                const sub = String(slot.nombre || '').trim() || 'Contacto ' + (i + 1);
                out.push(`<option value="${k}::${i}">${escFn(`${shortLab} — ${sub}`)}</option>`);
            }
        });
    });
    if (!out.length) {
        return `<option value="">${escFn('Sin WhatsApp válido en derivaciones')}</option>`;
    }
    return out.join('');
}

function normalizarDestinoDerivacionSeleccion(v) {
    const raw = String(v || '').trim();
    if (!raw || !raw.includes('::')) return null;
    const cut = raw.indexOf('::');
    const destino = raw.slice(0, cut);
    const idxStr = raw.slice(cut + 2);
    let fila_index;
    if (idxStr !== '') {
        const n = parseInt(idxStr, 10);
        if (!Number.isFinite(n)) return null;
        fila_index = n;
    }
    return { destino, idxStr, fila_index };
}

function obtenerTelefonoDerivacionDesdeEmpresaCfg(v) {
    const sel = normalizarDestinoDerivacionSeleccion(v);
    if (!sel) return '';
    const dr = window.EMPRESA_CFG?.derivacion_reclamos;
    if (!dr || typeof dr !== 'object') return '';
    if (sel.idxStr !== '') {
        const arr = Array.isArray(dr[sel.destino]) ? dr[sel.destino] : [];
        const slot = arr[sel.fila_index];
        return String(slot?.whatsapp || '').trim();
    }
    return String(dr[sel.destino]?.whatsapp || '').trim();
}

function buildPreviewMensajeDerivacionAdmin(p, destinoNombre, obs) {
    const entidad = String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
    const np = String(p?.np || p?.numero_pedido || '—').trim();
    const pid = String(p?.id || '—').trim();
    const tipo = String(p?.tt || '—').trim();
    const prioridad = String(p?.pr || '—').trim();
    const estado = String(p?.es || '—').trim();
    const cliente = String(p?.cnom || p?.cl || '').trim();
    const tel = String(p?.tel || '').trim();
    const calle = String(p?.ccal || '').trim();
    const num = String(p?.cnum || '').trim();
    const loc = String(p?.cloc || '').trim();
    const dir = [calle, num, loc].filter(Boolean).join(', ') || String(p?.cdir || '').trim();
    const { la: laEf, ln: lnEf } = coordsEfectivasPedidoMapa(p);
    const lat = Number(laEf);
    const lng = Number(lnEf);
    const coordsOk =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        (Math.abs(lat) > 1e-7 || Math.abs(lng) > 1e-7);
    const ubicacion = coordsOk
        ? `Coordenadas GPS: ${lat}, ${lng}\nAbrí en Maps: https://www.google.com/maps?q=${lat},${lng}`
        : `${dir || 'Sin domicilio estructurado'}\n(Sin coordenadas GPS registradas en el sistema.)`;
    const obsTxt = String(obs || '').trim() || '—';
    const recl = cliente || tel ? `${cliente || '—'}${tel ? ` · Tel.: ${tel}` : ''}` : '—';
    return [
        `A: ${destinoNombre || '—'}`,
        '',
        `${entidad} le informa que recibimos el reclamo *N° ${np}* (ref. interna id ${pid}) y que, *en visita / según lo informado por el técnico*, se constató en el lugar que *corresponde atenderlo vuestra empresa*.`,
        '',
        'Derivamos el reclamo con las *observaciones del técnico / operador*:',
        obsTxt,
        '',
        '*Ubicación para relevo en campo:*',
        ubicacion,
        '',
        '*Datos útiles del reclamo*',
        `• Tipo: ${tipo || '—'}`,
        `• Prioridad: ${prioridad || '—'}`,
        `• Estado al derivar: ${estado || '—'}`,
        `• Reclamante / contacto: ${recl}`,
        '',
        '*Respuesta por este mismo chat (WhatsApp):*',
        'Pueden responder por este mismo hilo de WhatsApp; un operador de nuestra entidad verá el mensaje en el panel de gestión y podrá continuar la coordinación de este reclamo.',
        '',
        'Los datos se comparten solo para coordinar este reclamo entre entidades. No reenviarlos fuera del circuito operativo acordado.',
        '',
        'Gracias por su atención.',
        entidad,
    ].join('\n');
}

function cerrarModalDerivacionPreviewAdmin() {
    document.getElementById('modal-derivacion-preview-admin')?.classList.remove('active');
}
window.cerrarModalDerivacionPreviewAdmin = cerrarModalDerivacionPreviewAdmin;

function abrirModalRevisionDerivacionAdmin(pid) {
    const sel = document.getElementById('admin-derivar-destino');
    const ta = document.getElementById('admin-derivar-motivo');
    const v = (sel?.value || '').trim();
    if (!v || !v.includes('::')) {
        toast('Elegí un destino con WhatsApp configurado.', 'warning');
        return;
    }
    const pRow = app.p.find((x) => String(x.id) === String(pid));
    if (!pRow) return;
    const obsTa = (ta?.value || '').trim();
    const obsTec = String(pRow?.sdm || '').trim();
    if (!obsTa && !obsTec) {
        toast(
            'Cargá las observaciones para el tercero. Si el técnico ya mandó una solicitud, deberían aparecer prellenadas: revisalas o editá antes de confirmar.',
            'warning'
        );
        return;
    }
    const destinoSel = normalizarDestinoDerivacionSeleccion(v);
    if (!destinoSel) {
        toast('Destino inválido.', 'error');
        return;
    }
    const destinoNombre = String(sel?.selectedOptions?.[0]?.textContent || '').trim() || destinoSel.destino;
    const tel = obtenerTelefonoDerivacionDesdeEmpresaCfg(v);
    const msg = buildPreviewMensajeDerivacionAdmin(pRow, destinoNombre, obsTa || obsTec);
    const mp = document.getElementById('modal-derivacion-preview-admin');
    document.getElementById('deriv-prev-pid').value = String(pid);
    const dstEl = document.getElementById('deriv-prev-destino');
    if (dstEl) dstEl.innerHTML = `<option value="${v.replace(/"/g, '&quot;')}">${destinoNombre.replace(/</g, '&lt;')}</option>`;
    const telEl = document.getElementById('deriv-prev-telefono');
    if (telEl) telEl.value = tel || '';
    const msgEl = document.getElementById('deriv-prev-mensaje');
    if (msgEl) msgEl.value = msg;
    mp?.classList.add('active');
}
window.abrirModalRevisionDerivacionAdmin = abrirModalRevisionDerivacionAdmin;

async function ejecutarDerivacionExternaAdmin(pid, override) {
    const dataModal = override || {};
    const v = String(dataModal.destinoValue || '').trim();
    const destinoSel = normalizarDestinoDerivacionSeleccion(v);
    if (!destinoSel) {
        toast('Destino inválido.', 'error');
        return;
    }
    const motivo = String(dataModal.motivo || '').trim().slice(0, 2000);
    const mensajeFinal = String(dataModal.mensajeFinal || '').trim().slice(0, 6000);
    if (!motivo) {
        toast('Falta el texto de observaciones para la derivación.', 'warning');
        return;
    }
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) {
        toast('No hay sesión API. Reintentá con conexión.', 'error');
        return;
    }
    const pidNum = parseInt(pid, 10);
    if (!Number.isFinite(pidNum)) return;
    try {
        const body = { destino: destinoSel.destino, motivo: motivo || undefined, mensaje_final: mensajeFinal || undefined };
        if (destinoSel.idxStr !== '') body.fila_index = destinoSel.fila_index;
        const pRow = app.p.find((x) => String(x.id) === String(pidNum));
        if (pRow) {
            const { la: laEf, ln: lnEf } = coordsEfectivasPedidoMapa(pRow);
            const lx = Number(laEf);
            const ly = Number(lnEf);
            if (Number.isFinite(lx) && Number.isFinite(ly) && (Math.abs(lx) > 1e-7 || Math.abs(ly) > 1e-7)) {
                body.lat = lx;
                body.lng = ly;
            }
        }
        const resp = await fetch(apiUrl(`/api/pedidos/${pidNum}/derivar-externo`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        }
        const waOk = data._derivacion_whatsapp_enviado === true;
        const waErr = String(data._derivacion_whatsapp_envio_error || '').trim();
        delete data._derivacion_whatsapp_enviado;
        delete data._derivacion_whatsapp_envio_error;
        const row = norm(data);
        const idx = app.p.findIndex((x) => String(x.id) === String(pid));
        if (idx !== -1) app.p[idx] = row;
        else app.p.push(row);
        offlinePedidosSave(app.p);
        render();
        cerrarModalDerivacionPreviewAdmin();
        try {
            sessionStorage.removeItem('gn-admin-deriv-motivo-' + pidNum);
        } catch (_) {}
        if (waOk) {
            toast('Derivación registrada. El mensaje se envió al tercero por WhatsApp (servidor).', 'success');
        } else {
            toast(
                waErr
                    ? `Derivación registrada. WhatsApp automático no disponible: ${waErr}`
                    : 'Derivación registrada. Revisá credenciales Meta (Empresa) o contactá al tercero desde el panel de chat humano.',
                waErr ? 'warning' : 'info'
            );
        }
        try {
            const dm = document.getElementById('dm');
            if (dm?.classList.contains('active') && String(dm.dataset.detallePedidoId) === String(pidNum)) {
                dm.classList.remove('active');
                delete dm.dataset.detallePedidoId;
            }
        } catch (_) {}
    } catch (e) {
        toast(String(e?.message || e), 'error');
    }
}
window.ejecutarDerivacionExternaAdmin = ejecutarDerivacionExternaAdmin;

async function confirmarEnvioDerivacionPreviewAdmin() {
    const pid = document.getElementById('deriv-prev-pid')?.value;
    const destinoValue = document.getElementById('deriv-prev-destino')?.value || '';
    const mensajeFinal = document.getElementById('deriv-prev-mensaje')?.value || '';
    const detTa = document.getElementById('admin-derivar-motivo');
    const pRow = app.p.find((x) => String(x.id) === String(pid));
    const motivo = String(detTa?.value || pRow?.sdm || '').trim();
    if (!pid) return;
    await ejecutarDerivacionExternaAdmin(pid, {
        destinoValue,
        motivo,
        mensajeFinal,
    });
}
window.confirmarEnvioDerivacionPreviewAdmin = confirmarEnvioDerivacionPreviewAdmin;

async function solicitarDerivacionTerceroDesdeTecnico(pid) {
    const pidNum = parseInt(pid, 10);
    if (!Number.isFinite(pidNum)) return;
    const ta = document.getElementById(`tec-sol-deriv-motivo-${pidNum}`);
    const motivo = (ta?.value || '').trim();
    if (motivo.length < 10) {
        toast('Las observaciones de campo son obligatorias (mínimo 10 caracteres).', 'error');
        return;
    }
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) {
        toast('No hay sesión API. Reintentá con conexión.', 'error');
        return;
    }
    try {
        const resp = await fetch(apiUrl(`/api/pedidos/${pidNum}/solicitar-derivacion-tercero`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: motivo || undefined }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        const row = norm(data);
        const ix = app.p.findIndex((x) => String(x.id) === String(pid));
        if (ix !== -1) app.p[ix] = row;
        else app.p.push(row);
        offlinePedidosSave(app.p);
        render();
        toast('Solicitud enviada al administrador.', 'success');
        try {
            sessionStorage.removeItem('gn-tec-deriv-motivo-' + pidNum);
        } catch (_) {}
        try {
            const dm = document.getElementById('dm');
            if (dm) {
                dm.classList.remove('active');
                try {
                    delete dm.dataset.detallePedidoId;
                } catch (_) {}
            }
        } catch (_) {}
        try {
            if (window.AndroidLocalNotify && typeof window.AndroidLocalNotify.show === 'function') {
                const np = row.np != null && String(row.np).trim() !== '' ? String(row.np).trim() : String(pidNum);
                window.AndroidLocalNotify.show(
                    `sol-deriv-${pidNum}-${Date.now()}`,
                    'Solicitud de derivación enviada a la central',
                    `Pedido #${np}`,
                    String(pidNum)
                );
            }
        } catch (_) {}
    } catch (e) {
        toast(String(e?.message || e), 'error');
    }
}
window.solicitarDerivacionTerceroDesdeTecnico = solicitarDerivacionTerceroDesdeTecnico;

async function rechazarSolicitudDerivacionAdmin(pid) {
    const pidNum = parseInt(pid, 10);
    if (!Number.isFinite(pidNum)) return;
    const nota = window.prompt('Motivo del rechazo (opcional, queda en auditoría):', '') || '';
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) {
        toast('No hay sesión API.', 'error');
        return;
    }
    try {
        const resp = await fetch(apiUrl(`/api/pedidos/${pidNum}/rechazar-solicitud-derivacion-tercero`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nota_admin: nota.trim() || undefined }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || data.detail || `HTTP ${resp.status}`);
        const row = norm(data);
        const ix = app.p.findIndex((x) => String(x.id) === String(pid));
        if (ix !== -1) app.p[ix] = row;
        else app.p.push(row);
        offlinePedidosSave(app.p);
        render();
        toast('Solicitud rechazada.', 'success');
        void detalle(ix !== -1 ? app.p[ix] : row);
    } catch (e) {
        toast(String(e?.message || e), 'error');
    }
}
window.rechazarSolicitudDerivacionAdmin = rechazarSolicitudDerivacionAdmin;

/** Admin / técnico asignado: fila fresca desde API o Neon para ver motivo de derivación sin F5. */
async function refetchPedidoFilaParaDetalle(pedidoId) {
    const id = parseInt(String(pedidoId), 10);
    if (!Number.isFinite(id) || id < 1) return null;
    if (esAdmin() && puedeEnviarApiRestPedidos()) {
        try {
            await asegurarJwtApiRest();
            const tok = getApiToken();
            if (!tok) return null;
            const r = await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(id))}`), {
                headers: { Authorization: `Bearer ${tok}` },
            });
            if (!r.ok) return null;
            const row = await r.json();
            const merged = norm(row);
            const ix = app.p.findIndex((x) => String(x.id) === String(merged.id));
            if (ix >= 0) app.p[ix] = merged;
            else app.p.unshift(merged);
            try {
                offlinePedidosSave(app.p);
            } catch (_) {}
            return merged;
        } catch (_) {
            return null;
        }
    }
    if (NEON_OK && _sql && !modoOffline) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(id)} LIMIT 1`);
            const row = rr.rows?.[0];
            if (!row) return null;
            const merged = norm(row);
            const ix = app.p.findIndex((x) => String(x.id) === String(merged.id));
            if (ix >= 0) app.p[ix] = merged;
            else app.p.unshift(merged);
            try {
                offlinePedidosSave(app.p);
            } catch (_) {}
            return merged;
        } catch (_) {
            return null;
        }
    }
    return null;
}

async function detalle(p) {
    if (p?.id != null && !String(p.id).startsWith('off_') && !modoOffline) {
        const okRol =
            esAdmin() ||
            (esTecnicoOSupervisor() &&
                app.u &&
                p.tai != null &&
                String(p.tai) === String(app.u.id));
        if (okRol) {
            const fr = await refetchPedidoFilaParaDetalle(p.id);
            if (fr) p = fr;
        }
    }
    try {
        gnGeocodePrecargarWhatsappRegeoLog(p);
    } catch (_) {}
    const pidKey = String(p.id);
    try {
        const dmRoot = document.getElementById('dm');
        if (dmRoot) dmRoot.dataset.detallePedidoId = pidKey;
    } catch (_) {}
    try {
        if (esAdmin() && p?.id != null) {
            const ob = document.getElementById('admin-banner-opinion-cliente');
            if (ob?.dataset?.visible === '1' && String(ob.dataset.pedidoId) === pidKey) {
                ocultarBannerOpinionCliente();
            }
        }
    } catch (_) {}

    if (!pidKey.startsWith('off_') && !modoOffline && NEON_OK && _sql) {
        void (async () => {
            try {
                const pidNum = parseInt(p.id, 10);
                if (!Number.isFinite(pidNum)) return;
                const r = await sqlSimple(
                    `SELECT opinion_cliente, opinion_cliente_estrellas, fecha_opinion_cliente FROM pedidos WHERE id=${esc(pidNum)} LIMIT 1`
                );
                const row = r.rows?.[0];
                if (!row) return;
                const dmOpen = document.getElementById('dm');
                if (!dmOpen?.classList.contains('active') || dmOpen.dataset.detallePedidoId !== pidKey) return;
                const cur = app.p.find((x) => String(x.id) === pidKey);
                if (!cur) return;
                const o = row.opinion_cliente;
                const os = o != null && String(o).trim() ? String(o).trim() : '';
                let changed = false;
                if (os && os !== String(cur.opin || '')) {
                    cur.opin = os;
                    changed = true;
                }
                const nEs = Number(row.opinion_cliente_estrellas);
                const oesNew = Number.isFinite(nEs) && nEs >= 1 && nEs <= 5 ? Math.round(nEs) : null;
                if (oesNew !== cur.oes) {
                    cur.oes = oesNew;
                    changed = true;
                }
                const fp = row.fecha_opinion_cliente;
                if (fp && String(fp) !== String(cur.fopin || '')) {
                    cur.fopin = fp;
                    changed = true;
                }
                if (changed) {
                    // Solo recargar si el pedido NO está cerrado (evita bucle de recarga)
                    if (p.es !== 'Cerrado' && cur.es !== 'Cerrado') {
                        void detalle(cur);
                    }
                }
            } catch (_) {}
        })();
    }

    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    const f = p.f ? new Date(p.f).toLocaleString('es-AR', {...tz, hour12:false}) : '--';
    const fc = p.fc ? new Date(p.fc).toLocaleString('es-AR', {...tz, hour12:false}) : null;
    const fa = p.fa ? new Date(p.fa).toLocaleString('es-AR', {...tz, hour12:false}) : null;
    
    const bg = {
        'Pendiente': '#fef9c3',
        'Asignado': '#fae8ff',
        'En ejecución': '#dbeafe',
        'Cerrado': '#dcfce7',
        'Derivado externo': '#e2e8f0'
    };
    
    const co = {
        'Pendiente': '#854d0e',
        'Asignado': '#86198f',
        'En ejecución': '#1d4ed8',
        'Cerrado': '#166534',
        'Derivado externo': '#334155'
    };
    
    const ed = esAdmin() || String(p.ui) === String(app.u?.id)
        || (esTecnicoOSupervisor() && p.tai != null && String(p.tai) === String(app.u?.id));
    const findUser = id => {
        if (!id) return null;
        const u = app.usuariosCache?.find(u => String(u.id) === String(id));
        return u ? u.nombre : null;
    };
    const _auditLineas = [
        p.uc  ? '<div class="dr"><span class="dl">Creado por</span><span class="dv">'  + (findUser(p.uc)  || 'id:'+p.uc)  + '</span></div>' : '',
        p.ui2 ? '<div class="dr"><span class="dl">Iniciado por</span><span class="dv">' + (findUser(p.ui2) || 'id:'+p.ui2) + '</span></div>' : '',
        p.uav ? '<div class="dr"><span class="dl">Últ avance</span><span class="dv">'   + (findUser(p.uav) || 'id:'+p.uav) + '</span></div>' : '',
        p.uci ? '<div class="dr"><span class="dl">Cerrado por</span><span class="dv">'  + (findUser(p.uci) || 'id:'+p.uci) + '</span></div>' : '',
    ].filter(Boolean).join('');
    const escDet = t => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const nombreClienteDet = String((p.cnom || p.cl || '')).trim();
    const filasDatosCliente = [];
    const nisVal = String(p.nis || '').trim();
    const medVal = String(p.med || '').trim();
    if (nisVal) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">NIS</span><span class="dv" style="font-weight:700">${escDet(nisVal)}</span></div>`);
    }
    if (medVal) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Medidor</span><span class="dv" style="font-weight:700">${escDet(medVal)}</span></div>`);
    }
    if (nombreClienteDet) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Nombre y apellido</span><span class="dv">${escDet(nombreClienteDet)}</span></div>`);
    }
    if (String(p.ccal || '').trim()) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Calle</span><span class="dv">${escDet(p.ccal)}</span></div>`);
    }
    if (String(p.cnum || '').trim()) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Número</span><span class="dv">${escDet(p.cnum)}</span></div>`);
    }
    if (String(p.cloc || '').trim()) {
        filasDatosCliente.push(`<div class="dr"><span class="dl">Localidad</span><span class="dv">${escDet(p.cloc)}</span></div>`);
    }
    const stcD = String(p.stc || '').trim();
    const sfsD = String(p.sfs || '').trim();
    if (stcD || sfsD) {
        const headSum = esCooperativaElectricaRubro() ? 'Suministro eléctrico' : 'Datos de suministro (catálogo)';
        filasDatosCliente.push(`<div class="dr" style="grid-column:1/-1;margin:.35rem 0 0"><span class="dl" style="font-weight:700;color:#b45309">${escDet(headSum)}</span></div>`);
        if (stcD) {
            filasDatosCliente.push(`<div class="dr"><span class="dl">Tipo de conexión</span><span class="dv" style="font-weight:700">${escDet(stcD)}</span></div>`);
        }
        if (sfsD) {
            filasDatosCliente.push(`<div class="dr"><span class="dl">Fases</span><span class="dv" style="font-weight:700">${escDet(sfsD)}</span></div>`);
        }
    }
    const refDir = String(p.cdir || '').trim();
    const hayEstructurados = filasDatosCliente.length > 0;
    if (refDir) {
        const labRef = hayEstructurados ? 'Referencia (mapa / notas)' : 'Dirección / datos declarados';
        filasDatosCliente.push(`<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">${labRef}</span><div class="trb">${escDet(refDir)}</div></div>`);
    }
    const htmlDatosCliente = filasDatosCliente.length
        ? `<div class="dr" style="grid-column:1/-1;margin:.15rem 0 .35rem"><span class="dl" style="font-weight:700;color:var(--bd)">Datos cargados por el cliente</span></div>${filasDatosCliente.join('')}`
        : '';
    const opinTxtDet = (p.opin != null && String(p.opin).trim()) ? String(p.opin).trim() : '';
    const estrellasDet = p.oes != null && p.oes >= 1 && p.oes <= 5 ? p.oes : null;
    const lineaEstrellas =
        estrellasDet != null
            ? `<p style="font-size:.9rem;margin:0 0 .35rem;font-weight:600;color:var(--bm)">Valoración: ${'⭐'.repeat(estrellasDet)} <span style="color:var(--tm);font-weight:500">(${estrellasDet}/5)</span></p>`
            : '';
    const htmlOpinionCliente =
        estrellasDet != null || opinTxtDet
            ? `<div class="ds" style="border-left:4px solid #0d9488;background:linear-gradient(90deg,rgba(13,148,136,.06),transparent)">
            <h4>💬 Valoración del cliente (WhatsApp)</h4>
            ${lineaEstrellas}
            ${opinTxtDet ? `<div class="trb">${escDet(opinTxtDet)}</div>` : '<p style="font-size:.78rem;color:var(--tm);margin:0">Sin comentario de texto.</p>'}
            ${p.fopin ? `<p style="font-size:.78rem;color:var(--tm);margin-top:.45rem">Registrada: ${escDet(fmtInformeFecha(p.fopin))}</p>` : ''}
           </div>`
            : '';
    /** Opción A (spec): aviso + wa.me si el tipo es solo agua/municipio y el tenant es eléctrico. */
    let htmlDerivacionCoopElectrica = '';
    if (
        esCooperativaElectricaRubro() &&
        (esAdmin() || esTecnicoOSupervisor()) &&
        pedidoSugiereDerivacionAguaOMunicipioEnElectrica(p.tt)
    ) {
        const dr = (window.EMPRESA_CFG || {}).derivacion_reclamos;
        const agua = dr?.cooperativa_agua;
        const energia = dr?.empresa_energia;
        const waAgua = agua?.whatsapp ? normalizarWhatsappInternacionalWaMeUrl(agua.whatsapp) : '';
        const waEn = energia?.whatsapp ? normalizarWhatsappInternacionalWaMeUrl(energia.whatsapp) : '';
        const hrefAgua = waAgua ? String(waAgua).replace(/"/g, '&quot;') : '';
        const hrefEn = waEn ? String(waEn).replace(/"/g, '&quot;') : '';
        const labAgua = escDet(agua?.nombre || 'Cooperativa de agua');
        const labEn = escDet(energia?.nombre || 'Empresa de energía');
        const bits = [
            `<p style="font-size:.82rem;margin:0 0 .55rem;line-height:1.45">El tipo <strong>${escDet(
                p.tt
            )}</strong> suele corresponder a <strong>agua potable</strong> u <strong>servicios municipales</strong>. Esta entidad atiende electricidad; podés orientar al vecino:</p>`,
        ];
        if (waAgua) {
            bits.push(
                `<a class="ba2" style="display:inline-block;margin:.2rem .45rem .2rem 0;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${hrefAgua}"><i class="fab fa-whatsapp"></i> ${labAgua}</a>`
            );
        }
        if (waEn) {
            bits.push(
                `<a class="ba2" style="display:inline-block;margin:.2rem .45rem .2rem 0;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${hrefEn}"><i class="fab fa-whatsapp"></i> ${labEn}</a>`
            );
        }
        if (!waAgua && !waEn) {
            bits.push(
                `<p style="font-size:.78rem;color:var(--tm);margin:.15rem 0 0">No hay contactos de derivación configurados. Cargalos en <strong>Admin → Empresa</strong> en la sección de <strong>derivación por tipo de reclamo</strong> (campos internacionales con +).</p>`
            );
        }
        htmlDerivacionCoopElectrica = `<div class="ds admin-derivacion-pedido-hint">${bits.join('')}</div>`;
    }
    const htmlLineaTiempoPedido = [
        `<div class="dr"><span class="dl">Alta del pedido</span><span class="dv">${f}</span></div>`,
        p.fasi && p.tai
            ? `<div class="dr"><span class="dl">Asignación a técnico</span><span class="dv">${new Date(p.fasi).toLocaleString('es-AR', {
                  ...tz,
                  hour12: false,
              })}</span></div>`
            : '',
        p.es === 'Cerrado' && fc ? `<div class="dr"><span class="dl">Cierre</span><span class="dv">${fc}</span></div>` : '',
        pedidoEsDerivadoFuera(p) && p.fder
            ? `<div class="dr"><span class="dl">Derivación a tercero</span><span class="dv">${new Date(p.fder).toLocaleString('es-AR', {
                  ...tz,
                  hour12: false,
              })}</span></div>`
            : '',
    ]
        .filter(Boolean)
        .join('');
    const htmlBloqueCambiosAuditoria =
        htmlLineaTiempoPedido || _auditLineas
            ? `<div class="ds"><h4>🕐 Últimos cambios y auditoría</h4>${
                  htmlLineaTiempoPedido
                      ? `<div style="font-size:.72rem;font-weight:600;color:var(--tm);margin:0 0 .25rem">Línea de tiempo</div>${htmlLineaTiempoPedido}`
                      : ''
              }${
                  htmlLineaTiempoPedido && _auditLineas
                      ? '<div style="margin:.55rem 0 .35rem;padding-top:.45rem;border-top:1px solid var(--bo)"></div>'
                      : ''
              }${
                  _auditLineas
                      ? `<div style="font-size:.72rem;font-weight:600;color:var(--tm);margin:0 0 .25rem">Usuarios (auditoría)</div>${_auditLineas}`
                      : ''
              }</div>`
            : '';
    const uAsig = (app.usuariosCache || []).find(u => String(u.id) === String(p.tai));
    const rolAsig = uAsig ? normalizarRolStr(uAsig.rol) : '';
    const nAsig = (p.tai != null)
        ? `${findUser(p.tai) || ('id ' + p.tai)}${rolAsig ? ' · ' + rolAsig : ''}`
        : 'Sin asignar';
    const fasiStr = p.fasi ? new Date(p.fasi).toLocaleString('es-AR', {...tz, hour12:false}) : '';
    const labFirmaDet = etiquetaFirmaPersona();
    let chkResumen = '';
    try {
        const o = p.chkl ? JSON.parse(p.chkl) : null;
        if (o && typeof o === 'object') {
            chkResumen = `<div class="dr"><span class="dl">Checklist seguridad</span><span class="dv">EPPS: ${o.epp ? 'Sí' : '—'} · Corte energía: ${o.corte ? 'Sí' : '—'} · Señalización: ${o.senal ? 'Sí' : '—'}</span></div>`;
        }
    } catch (_) {}
    
    
    let fotosHtml = '';
    if (p.fotos && p.fotos.length > 0) {
        fotosHtml = '<div class="fotos-container">';
        p.fotos.forEach((foto, idx) => {
            if (foto) {
                const ctxStr = JSON.stringify({ tipo: 'pedido_fotos', id: p.id, idx }).replace(/"/g, '&quot;');
                fotosHtml += `<img src="${foto}" class="foto-miniatura" onclick="verFotoAmpliada(this.src, JSON.parse(this.dataset.ctx))" data-ctx="${ctxStr}">`;
            }
        });
        fotosHtml += '</div>';
    }
    
    
    const { la: laM, ln: lnM } = coordsEfectivasPedidoMapa(p);
    const pinMapaOk = coordsSonPinValidasMapaWgs84(laM, lnM);
    const hayDomicilioGeo = !!domicilioParaGeocodePedido(p);
    const bannerSinPinAdmin =
        esAdmin() && hayDomicilioGeo && !pinMapaOk
            ? '<p class="gn-pedido-sin-pin-banner" role="status">Sin ubicación válida en el mapa (WGS84). Revisá domicilio, usá <strong>Re-geocodificar</strong> o coordenadas manuales en admin. Esto no invalida por sí solo el texto del reclamo.</p>'
            : '';
    const usadaInferida = (p.la == null || p.ln == null) && laM != null && lnM != null;
    const latFormateada = laM != null ? laM.toFixed(6).replace('.', ',') : '';
    const lngFormateada = lnM != null ? lnM.toFixed(6).replace('.', ',') : '';
    const wgs84UnaLinea = laM != null && lnM != null ? `${latFormateada}, ${lngFormateada}` : '--';
    const gaudit = p.gaudit && typeof p.gaudit === 'object' ? p.gaudit : null;
    const txtModoUbic = gaudit ? etiquetaModoUbicPedido(gaudit) : '';
    const htmlBadgeUbicModo =
        esAdmin() && txtModoUbic
            ? `<p class="gn-ubic-modo-badge" style="font-size:.76rem;color:#1e293b;margin:.2rem 0 .55rem;padding:.4rem .55rem;background:#e0f2fe;border-left:3px solid #0284c7;border-radius:4px;line-height:1.45">${escDet(txtModoUbic)}</p>`
            : '';
    const wgeoDet = p.wgeo && typeof p.wgeo === 'object' ? p.wgeo : null;
    const htmlWgeoWa =
        esAdmin() && wgeoDet && String(p.orc || '').trim().toLowerCase() === 'whatsapp'
            ? `<details class="gn-wgeo-wa-details" style="margin:.45rem 0 .35rem;font-size:.74rem;line-height:1.45"><summary style="cursor:pointer;font-weight:600;color:#0e7490">Geocodificación WhatsApp (servidor)</summary>
            <p style="margin:.35rem 0 .25rem;color:#334155">Fuente final: <strong>${escDet(String(wgeoDet.fuente_final != null ? wgeoDet.fuente_final : wgeoDet.fuente || '—'))}</strong>${wgeoDet.pipeline ? ` · pipeline: ${escDet(String(wgeoDet.pipeline))}` : ''}</p>
            <div style="padding:.45rem .5rem;background:#f8fafc;border-radius:.35rem;border:1px solid #e2e8f0;max-height:240px;overflow:auto;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:.72rem">${escDet(
                (Array.isArray(wgeoDet.log) ? wgeoDet.log : [])
                    .slice(0, 120)
                    .join('\n')
            )}</div></details>`
            : '';
    const pcDet = proyectarCoordPedido(laM, lnM);
    const cfgFam = ((window.EMPRESA_CFG || {}).coord_proy_familia || 'none').trim();
    let filasProyectadas = '';
    if (pcDet) {
        const qx = String(pcDet.vx).replace(/'/g, "\\'");
        const qy = String(pcDet.vy).replace(/'/g, "\\'");
        const titTip = String(pcDet.titulo || '').replace(/"/g, '&quot;');
        filasProyectadas = `
            <div class="coord-proy-meta"><span class="coord-faja" title="${titTip}">F${pcDet.z}</span><span class="coord-sys">${pcDet.vx} · ${pcDet.vy} m</span></div>
            <div class="dr coord-proy-row"><span class="dl">${pcDet.lx}</span><span class="dv">${pcDet.vx} <span class="dv-copy" onclick="copiarTexto('${qx}')"><i class="fas fa-copy"></i> Copiar</span></span></div>
            <div class="dr coord-proy-row"><span class="dl">${pcDet.ly}</span><span class="dv">${pcDet.vy} <span class="dv-copy" onclick="copiarTexto('${qy}')"><i class="fas fa-copy"></i> Copiar</span></span></div>`;
    } else if (cfgFam === 'none' && p.x_inchauspe && p.y_inchauspe) {
        const xi = String(p.x_inchauspe).replace('.', ',');
        const yi = String(p.y_inchauspe).replace('.', ',');
        filasProyectadas = `
            <div class="dr"><span class="dl">Inchauspe X (histórico al crear)</span><span class="dv">${xi} <span class="dv-copy" onclick="copiarTexto('${xi.replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i> Copiar</span></span></div>
            <div class="dr"><span class="dl">Inchauspe Y (histórico al crear)</span><span class="dv">${yi} <span class="dv-copy" onclick="copiarTexto('${yi.replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i> Copiar</span></span></div>`;
    }

    let htmlDerivacionAdminExterna = '';
    if (esAdmin() && pedidoEsDerivadoFuera(p)) {
        const fdx = p.fder ? new Date(p.fder).toLocaleString('es-AR', { ...tz, hour12: false }) : '—';
        const who = findUser(p.uider) || (p.uider != null ? 'id:' + p.uider : '—');
        htmlDerivacionAdminExterna = `<div class="ds" style="border-left:4px solid #64748b">
            <h4>➡️ Derivado a tercero</h4>
            <p style="font-size:.78rem;margin:0 0 .5rem;line-height:1.4">Este reclamo ya no está en la operativa habitual del tenant. Para verlo en listas y mapa, activá <strong>Derivados fuera</strong> en la barra de pedidos.</p>
            <div class="dr"><span class="dl">Fecha</span><span class="dv">${escDet(fdx)}</span></div>
            <div class="dr"><span class="dl">Destino (clave)</span><span class="dv">${escDet(p.dda || '—')}</span></div>
            <div class="dr"><span class="dl">Contacto</span><span class="dv">${escDet(p.ddn || '—')}</span></div>
            <div class="dr"><span class="dl">Registró</span><span class="dv">${escDet(who)}</span></div>
            ${p.dnota ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Motivo</span><div class="trb">${escDet(p.dnota)}</div></div>` : ''}
            ${p.dsnap ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Mensaje (auditoría)</span><div class="trb" style="white-space:pre-wrap;font-size:.78rem">${escDet(p.dsnap)}</div></div>` : ''}
        </div>`;
    } else if (
        esAdmin() &&
        puedeEnviarApiRestPedidos() &&
        (p.es === 'Asignado' || p.es === 'En ejecución') &&
        !pedidoEsDerivadoFuera(p)
    ) {
        const opts = construirOpcionesDerivacionAdminHtml(escDet);
        const pidEsc = String(p.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        let motivoAdminTa = p.sdm ? escDet(p.sdm) : '';
        try {
            const bk = 'gn-admin-deriv-motivo-' + p.id;
            const sv = sessionStorage.getItem(bk);
            if (sv != null && String(sv).length) motivoAdminTa = escDet(sv);
        } catch (_) {}
        const sdmMot = String(p.sdm || '').trim();
        const bloqueMotivoTecnicoDer = sdmMot
            ? `<div style="font-size:.8rem;margin:0 0 .45rem;padding:.5rem;background:rgba(14,165,233,.08);border:1px solid var(--bo);border-radius:.45rem;white-space:pre-wrap;line-height:1.45"><strong>Motivo del técnico</strong> (referencia; editable debajo)<br>${escDet(sdmMot)}</div>`
            : '';
        let pendienteSolicitudHtml = '';
        if (p.sdpen) {
            const whoTec = findUser(p.sduid) || (p.sduid != null ? 'id:' + p.sduid : '—');
            const fxs = p.sdf
                ? new Date(p.sdf).toLocaleString('es-AR', { ...tz, hour12: false })
                : '—';
            pendienteSolicitudHtml = `<div class="ds" id="gn-focus-derivacion-pedido" style="border-left:4px solid #f97316;margin-bottom:.65rem">
            <h4>⚠ Solicitud de derivación pendiente</h4>
            <p style="font-size:.76rem;color:var(--tm);margin:0 0 .5rem;line-height:1.45">El técnico pidió derivar este reclamo a un tercero. Revisá el motivo, elegí destino y confirmá; o rechazá si no corresponde.</p>
            <div class="dr"><span class="dl">Técnico</span><span class="dv">${escDet(whoTec)}</span></div>
            <div class="dr"><span class="dl">Fecha pedido</span><span class="dv">${escDet(fxs)}</span></div>
            ${p.sdm ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Motivo</span><div class="trb">${escDet(p.sdm)}</div></div>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.55rem">
            <button type="button" class="ba2" style="background:#64748b;color:#fff;border-color:#64748b" onclick="rechazarSolicitudDerivacionAdmin('${pidEsc}')"><i class="fas fa-times"></i> Rechazar solicitud</button>
            </div>
        </div>`;
        }
        htmlDerivacionAdminExterna = `${pendienteSolicitudHtml}<div class="ds" ${p.sdpen ? '' : 'id="gn-focus-derivacion-pedido"'} style="border-left:4px solid #0ea5e9">
            <h4>📲 Derivación operativa (admin)</h4>
            <p style="font-size:.76rem;color:var(--tm);margin:0 0 .55rem;line-height:1.4">Registrá la derivación al contacto configurado en <strong>Admin → Empresa</strong>. El <strong>mensaje final</strong> queda en auditoría y se envía al tercero por <strong>WhatsApp desde el servidor</strong> (Meta Cloud API); no se abre pestaña del navegador. Incluye enlace a Google Maps cuando hay coordenadas del pedido.</p>
            <div style="margin-bottom:.5rem"><label for="admin-derivar-destino" style="font-size:.78rem;font-weight:600">Destino</label>
            <select id="admin-derivar-destino" style="width:100%;margin-top:.25rem;padding:.45rem;border-radius:.45rem;border:1px solid var(--bo)">${opts}</select></div>
            <div style="margin-bottom:.55rem"><label for="admin-derivar-motivo" style="font-size:.78rem;font-weight:600">Observaciones para el tercero <span style="font-weight:500;color:var(--tl)">(obligatorias si no hubo texto del técnico)</span></label>
            ${bloqueMotivoTecnicoDer}
            <textarea id="admin-derivar-motivo" rows="4" maxlength="2000" style="width:100%;margin-top:.25rem;padding:.45rem;border-radius:.45rem;border:1px solid var(--bo);resize:vertical;white-space:pre-wrap" placeholder="Si el técnico cargó una solicitud, el texto aparece acá para que lo revises o completes.">${motivoAdminTa}</textarea></div>
            <button type="button" class="ba2" style="background:#128C7E;color:#fff;border-color:#128C7E" onclick="abrirModalRevisionDerivacionAdmin('${pidEsc}')"><i class="fab fa-whatsapp"></i> Revisar y enviar (servidor)</button>
        </div>`;
    }
    
    document.getElementById('dmc').innerHTML = `
        <div class="ds">
            <h4>📋 Información General</h4>
            <div class="dr"><span class="dl">N° Pedido</span><span class="dv" style="font-weight:700;color:#1e3a8a">#${p.np}</span></div>
            <div class="dr"><span class="dl">Fecha Creación</span><span class="dv">${f}</span></div>
            ${p.es === 'Cerrado' ? 
                `<div class="dr"><span class="dl">Fecha Cierre</span><span class="dv">${fc}</span></div>` : 
                p.es === 'Derivado externo' && p.fder
                ? `<div class="dr"><span class="dl">Fecha derivación</span><span class="dv">${new Date(p.fder).toLocaleString('es-AR', {...tz, hour12:false})}</span></div>`
                : p.es === 'En ejecución' && fa ? 
                `<div class="dr"><span class="dl">Último Avance</span><span class="dv">${fa}</span></div>` : ''}
            <div class="dr"><span class="dl">Estado</span><span class="dv"><span style="background:${bg[p.es]||'#e5e7eb'};color:${co[p.es]||'#374151'};padding:2px 10px;border-radius:12px;font-size:.82rem;font-weight:600">${p.es}</span></span></div>
            <div class="dr"><span class="dl">Prioridad</span><span class="dv">${p.pr}</span></div>
            <div class="dr"><span class="dl">Tipo</span><span class="dv">${p.tt||'--'}</span></div>
            <div class="dr"><span class="dl">Técnico asignado</span><span class="dv">${nAsig}${fasiStr ? ' · ' + fasiStr : ''}</span></div>
            <div class="dr"><span class="dl">Avance</span><span class="dv">${p.av}% <div style="height:4px;background:#e2e8f0;border-radius:2px;width:100px;display:inline-block;vertical-align:middle;margin-left:6px;overflow:hidden"><div style="height:100%;width:${p.av}%;background:linear-gradient(90deg,#1e3a8a,#3b82f6)"></div></div></span></div>
        </div>
        
        <div class="ds">
            <h4>🏢 Datos del Trabajo</h4>
            <div class="dr"><span class="dl">${etiquetaZonaPedido()}</span><span class="dv">${valorZonaPedidoUI(p) || (esMunicipioRubro() ? 'Sin barrio indicado' : esCooperativaAguaRubro() ? 'Sin ramal indicado' : '—')}</span></div>
            ${esCooperativaElectricaRubro() && String(p.trf || '').trim() ? `<div class="dr"><span class="dl">Trafo</span><span class="dv">${escDet(p.trf)}</span></div>` : ''}
            ${htmlDatosCliente}
            ${p.tel ? `<div class="dr"><span class="dl">Tel. contacto (WA)</span><span class="dv">${String(p.tel).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>` : ''}
            <div class="dr"><span class="dl">Descripción</span><span class="dv">${escDet(sanitizarTextoDescripcionPedidoVista(p.de))}</span></div>
        </div>
        
        ${htmlOpinionCliente}
        
        ${htmlDerivacionTercerosPedidoDetalle()}
        ${htmlSolicitudDerivacionCoopElectricaTecnico(p)}
        ${htmlDerivacionCoopElectrica}
        ${htmlDerivacionAdminExterna}
        
        ${p.es === 'Cerrado' ? `
        <div class="ds">
            <h4>✅ Cierre del Pedido</h4>
            ${fc ? `<div class="dr"><span class="dl">Fecha cierre</span><span class="dv">${fc}</span></div>` : ''}
            ${p.tc ? `<div class="dr"><span class="dl">Técnico</span><span class="dv">${p.tc}</span></div>` : ''}
            ${p.tr ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Trabajo</span><div class="trb">${p.tr}</div></div>` : ''}
            ${p.foto_cierre ? `<div style="margin-top:.6rem"><div style="font-size:.8rem;color:#475569;margin-bottom:.35rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em">📸 Foto del cierre</div><img src="${p.foto_cierre}" class="foto-miniatura" style="width:100%;max-height:200px;object-fit:contain;border-radius:.5rem;cursor:pointer;border:1px solid #e2e8f0" onclick="verFotoAmpliada(this.src, {tipo:'pedido_cierre',id:'${p.id}'})"></div>` : ''}
            ${chkResumen}
            ${p.firma ? `<div style="margin-top:.6rem"><div style="font-size:.8rem;color:#475569;margin-bottom:.35rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em">✍️ Firma del ${labFirmaDet}</div><img src="${p.firma}" class="foto-miniatura" style="width:100%;max-height:180px;object-fit:contain;border-radius:.5rem;border:1px solid #e2e8f0" alt="Firma"></div>` : ''}
        </div>` : ''}

        ${esTipoPedidoFactibilidad(p.tt) || !estadoPermiteSeccionMateriales(p)
            ? ''
            : `
        <div class="ds" id="materiales-detalle-wrap" data-pid="${p.id}">
            <h4>🔧 Materiales</h4>
            <div id="materiales-detalle-body"><p style="font-size:.8rem;color:var(--tl)">Cargando…</p></div>
        </div>
        `}
        
        <div class="ds">
            <h4>📍 Ubicación</h4>
            ${htmlBadgeUbicModo}
            ${htmlWgeoWa}
            ${bannerSinPinAdmin}
            <div class="dr"><span class="dl">Provincia</span><span class="dv">${escDet(String(p.cpcia || '').trim() || '—')}</span></div>
            <div class="dr"><span class="dl">Código postal</span><span class="dv">${escDet(String(p.ccp || '').trim() || '—')}</span></div>
            ${usadaInferida ? '<p style="font-size:.76rem;color:#b45309;margin:0 0 .35rem;line-height:1.35">Ubicación aproximada por calle y número (el cliente no compartió GPS).</p>' : ''}
            <div class="dr"><span class="dl">WGS84</span><span class="dv">${wgs84UnaLinea}${laM != null && lnM != null ? ` <span class="dv-copy" onclick="copiarTexto('${latFormateada}')"><i class="fas fa-copy"></i> lat</span> <span class="dv-copy" onclick="copiarTexto('${lngFormateada}')"><i class="fas fa-copy"></i> lng</span>` : ''}</span></div>
            ${filasProyectadas}
            <button class="ba2" style="margin-top:.5rem" onclick="_zm('${p.id}')"><i class="fas fa-search-location"></i> Ver en mapa (zoom máximo)</button>
            ${esAdmin() ? `<button class="ba2" id="btn-regeocodificar" style="margin-top:.5rem;background:#0891b2;color:#fff;border-color:#0891b2" onclick="regeocodificarPedido('${p.id}')"><i class="fas fa-map-marker-alt"></i> Re-geocodificar</button>` : ''}
        </div>
        
        ${htmlBloqueCambiosAuditoria}
        ${fotosHtml ? `
        <div class="ds">
            <h4>📸 Fotos del trabajo</h4>
            ${fotosHtml}
        </div>` : ''}
        
        <div class="da">
            ${esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && (p.tai == null) ? `<button type="button" class="ba2" style="background:#059669;color:#fff;border-color:#059669" onclick="abrirModalAsignarTecnico('${p.id}')"><i class="fas fa-user-hard-hat"></i> Asignar técnico</button>` : ''}
            ${esAdmin() && p.es !== 'Cerrado' && p.es !== 'Derivado externo' && (p.tai != null) ? `<button type="button" class="ba2" style="background:#ea580c;color:#fff;border-color:#ea580c" onclick="abrirModalAsignarTecnico('${p.id}')"><i class="fas fa-exchange-alt"></i> Reasignar técnico</button><button type="button" class="ba2" style="background:#64748b;color:#fff;border-color:#64748b" onclick="ejecutarDesasignarPedidoPorId('${p.id}', {confirmar:true})"><i class="fas fa-user-slash"></i> Desasignar</button>` : ''}
            ${ed && (p.es === 'Pendiente' || p.es === 'Asignado') && p.es !== 'Derivado externo' ? `<button class="ba2 p2" onclick="_a('i','${p.id}')"><i class="fas fa-play"></i> Iniciar en sitio</button><button class="ba2 s2" onclick="_a('c','${p.id}')"><i class="fas fa-check"></i> Cerrar Pedido</button>` : ''}
            ${ed && p.es === 'En ejecución' ? `<button class="ba2 s2" onclick="_a('c','${p.id}')"><i class="fas fa-check"></i> Cerrar Pedido</button><button class="ba2 p2" onclick="_a('av','${p.id}')"><i class="fas fa-percent"></i> Cargar Avance (${p.av}%)</button>` : ''}
            <button class="ba2 imprimir" onclick="imprimirPedidoPorId('${p.id}')"><i class="fas fa-print"></i> Imprimir</button>
            <button class="ba2" onclick="_xl('${p.id}')"><i class="fas fa-file-excel"></i> Exportar</button>
        </div>
    `;
    
    document.getElementById('dm').classList.add('active');
    try {
        if (typeof gnMinimizeMapPanelsParaDetallePedido === 'function') gnMinimizeMapPanelsParaDetallePedido();
    } catch (_) {}
    requestAnimationFrame(() => {
        if (!esTipoPedidoFactibilidad(p.tt) && estadoPermiteSeccionMateriales(p)) refrescarMaterialesEnDetalle(p);
    });
    void sincronizarMapaConPedidoEnDetalle(p);
}

/** Al abrir el detalle de un reclamo: asegura mapa + marcadores y centra en el pedido (admin / técnico con permiso). */
async function sincronizarMapaConPedidoEnDetalle(p) {
    if (!p || modoOffline || !NEON_OK) return;
    try {
        await ensureMapReady();
        renderMk();
        if (!app.map) return;
        const { la, ln } = coordsEfectivasPedidoMapa(p);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
        const zCur = app.map.getZoom && Number.isFinite(app.map.getZoom()) ? app.map.getZoom() : 14;
        const z = Math.max(zCur, 15);
        app.map.setView([la, ln], z, { animate: false });
        setTimeout(() => {
            try {
                if (app.map && typeof app.map.invalidateSize === 'function') app.map.invalidateSize();
            } catch (_) {}
        }, 200);
    } catch (_) {}
}


window.copiarTexto = function(texto) {
    const t = String(texto ?? '');
    if (window.AndroidDevice && typeof window.AndroidDevice.copyText === 'function') {
        try {
            window.AndroidDevice.copyText(t);
            toast('Copiado al portapapeles', 'success');
            return;
        } catch (_) {}
    }
    navigator.clipboard.writeText(t).then(() => {
        toast('Copiado al portapapeles', 'success');
    }).catch(() => {
        toast('Error al copiar', 'error');
    });
};

function _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function _textToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
}

function _guardarArchivoAndroid(nombre, mime, base64) {
    if (!(window.AndroidDevice && typeof window.AndroidDevice.saveBase64File === 'function')) return false;
    try {
        return !!window.AndroidDevice.saveBase64File(nombre, mime, base64);
    } catch (_) {
        return false;
    }
}


function exportPedido(pedidos, nombre) {
    if (!pedidos || pedidos.length === 0) {
        toast('No hay datos para exportar', 'error');
        return;
    }
    
    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    
    const datosExport = pedidos.map(p => {
        const pc = proyectarCoordPedido(p.la, p.ln);
        const cf = ((window.EMPRESA_CFG || {}).coord_proy_familia || 'none').trim();
        let crsAdm = '';
        let xPlano = '';
        let yPlano = '';
        if (pc) {
            crsAdm = pc.titulo + ' · ' + pc.crsLinea + ' · ' + pc.modoTxt;
            xPlano = pc.vx;
            yPlano = pc.vy;
        } else if (cf === 'none' && p.x_inchauspe != null && p.y_inchauspe != null) {
            crsAdm = 'Inchauspe (valores al crear pedido)';
            xPlano = String(p.x_inchauspe).replace('.', ',');
            yPlano = String(p.y_inchauspe).replace('.', ',');
        }
        return {
            'N° Pedido': p.np || '',
            'Fecha Creación': p.f ? new Date(p.f).toLocaleString('es-AR', {...tz, hour12:false}) : '',
            'Fecha Cierre': p.fc ? new Date(p.fc).toLocaleString('es-AR', {...tz, hour12:false}) : '',
            'Fecha Último Avance': p.fa ? new Date(p.fa).toLocaleString('es-AR', {...tz, hour12:false}) : '',
            [etiquetaZonaPedido()]: valorZonaPedidoUI(p) || '',
            ...(esCooperativaElectricaRubro() ? { Trafo: p.trf || '' } : {}),
            'Cliente': p.cl || '',
            'Tipo de Trabajo': p.tt || '',
            'NIS': p.nis || '',
            'Nombre y apellido': (p.cnom || p.cl || ''),
            'Calle': p.ccal || '',
            'Número': p.cnum || '',
            'Localidad': p.cloc || '',
            'Tel. contacto': p.tel || '',
            'Dirección consolidada': [p.ccal || '', p.cnum || '', p.cloc || ''].filter(Boolean).join(', ') || p.cdir || '',
            'Tipo de conexión': p.stc || '',
            'Fases': p.sfs || '',
            'Referencia ubicación': p.cdir || '',
            'Descripción': p.de || '',
            'Prioridad': p.pr || '',
            'Estado': p.es || '',
            'Avance %': p.av || 0,
            'Trabajo Realizado': p.tr || '',
            'Técnico Cierre': p.tc || '',
            'Latitud (WGS84)': p.la ? p.la.toString().replace('.', ',') : '',
            'Longitud (WGS84)': p.ln ? p.ln.toString().replace('.', ',') : '',
            'CRS planas (admin)': crsAdm,
            'X / Este (m)': xPlano,
            'Y / Norte (m)': yPlano,
            'Cantidad Fotos': p.fotos ? p.fotos.length : 0,
            'Foto Cierre': p.foto_cierre ? 'Sí' : 'No'
        };
    });
    
    if (typeof XLSX !== 'undefined') {
        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(datosExport);
            
            const colWidths = [
                { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
                { wch: 15 }, { wch: 20 }, { wch: 10 }, { wch: 20 },
                { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 8 }, { wch: 16 },
                { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
                { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
                { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
                { wch: 10 }, { wch: 10 }
            ];
            ws['!cols'] = colWidths;
            
            const sheetName = pedidos.length === 1 ? nombreHojaExcelPedidoUnico(pedidos[0]) : 'Pedidos';
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const fileName = nombre + '.xlsx';
            const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            const okAndroid = _guardarArchivoAndroid(fileName, mime, _arrayBufferToBase64(buf));
            if (!okAndroid) dl(buf, fileName, mime);
            toast(okAndroid ? 'Excel guardado en Descargas' : 'Excel descargado', 'success');
        } catch (e) {
            console.error('Error al generar Excel:', e);
            toast('Error al generar Excel, usando CSV', 'error');
            exportarCSV(datosExport, nombre);
        }
    } else {
        exportarCSV(datosExport, nombre);
    }
}

function exportarCSV(datos, nombre) {
    const headers = Object.keys(datos[0]);
    const rows = datos.map(row => headers.map(h => {
        const val = row[h] || '';
        return '"' + String(val).replace(/"/g, '""') + '"';
    }).join(','));
    
    const csv = [headers.map(h => '"' + h + '"').join(','), ...rows].join('\n');
    const fileName = nombre + '.csv';
    const mime = 'text/csv;charset=utf-8;';
    const okAndroid = _guardarArchivoAndroid(fileName, mime, _textToBase64('\uFEFF' + csv));
    if (!okAndroid) {
        const blob = new Blob(['\uFEFF' + csv], { type: mime });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
    }
    toast(okAndroid ? 'CSV guardado en Descargas' : 'CSV descargado', 'success');
}

function dl(data, nombre, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
    }, 1000);
}

window._xl = id => {
    const p = app.p.find(x => String(x.id) === String(id));
    if (p) exportPedido([p], nombreArchivoExportPedidoUnico(p));
};


function tabPedidoListaPorEstado(es) {
    if (es === 'Cerrado' || es === 'Derivado externo') return 'c';
    if (es === 'Asignado' || es === 'En ejecución') return 'a';
    return 'p';
}

function pedidosConSolicitudDerivacionPendiente() {
    return (app.p || []).filter((p) => p && p.sdpen === true);
}

function ocultarBannerDerivacionPendiente() {
    const b = document.getElementById('admin-banner-derivacion-pendiente');
    if (b) b.style.display = 'none';
}
window.ocultarBannerDerivacionPendiente = ocultarBannerDerivacionPendiente;

function adminDerivacionPendienteIrPrimera() {
    const pend = pedidosConSolicitudDerivacionPendiente();
    if (!pend.length) {
        toast('No hay solicitudes pendientes.', 'info');
        ocultarBannerDerivacionPendiente();
        return;
    }
    void detalle(pend[0]);
}
window.adminDerivacionPendienteIrPrimera = adminDerivacionPendienteIrPrimera;

function actualizarIndicadorSolicitudesDerivacionAdmin() {
    const btn = document.getElementById('btn-derivaciones-pendientes');
    const badge = document.getElementById('badge-derivaciones-pendientes');
    const banner = document.getElementById('admin-banner-derivacion-pendiente');
    const txt = document.getElementById('admin-banner-derivacion-pendiente-txt');
    const esAdm = esAdmin();
    const n = esAdm ? pedidosConSolicitudDerivacionPendiente().length : 0;
    if (btn) btn.style.display = esAdm ? 'inline-flex' : 'none';
    if (badge) {
        badge.style.display = esAdm && n > 0 ? 'inline-block' : 'none';
        badge.textContent = n > 99 ? '99+' : String(n);
    }
    if (banner) banner.style.display = esAdm && n > 0 ? 'flex' : 'none';
    if (txt) {
        txt.textContent =
            n > 0
                ? `${n} solicitud${n === 1 ? '' : 'es'} de derivación pendiente${n === 1 ? '' : 's'} para revisar.`
                : 'Solicitudes de derivación pendientes.';
    }
}

function render() {
    actualizarIndicadorSolicitudesDerivacionAdmin();
    const vis = pedidosVisiblesEnUI();
    const cer = vis.filter(p => p.es === 'Cerrado' || p.es === 'Derivado externo').length;
    const asg = vis.filter(p => p.es === 'Asignado' || p.es === 'En ejecución').length;
    const pen = vis.filter(p => p.es === 'Pendiente').length;
    const pcEl = document.getElementById('pc');
    const acEl = document.getElementById('ac');
    const ccEl = document.getElementById('cc');
    if (pcEl) pcEl.textContent = pen;
    if (acEl) acEl.textContent = asg;
    if (ccEl) ccEl.textContent = cer;

    const fl = vis.filter(p => {
        if (app.tab === 'p') return p.es === 'Pendiente';
        if (app.tab === 'a') return p.es === 'Asignado' || p.es === 'En ejecución';
        return p.es === 'Cerrado' || p.es === 'Derivado externo';
    });
    const c = document.getElementById('pl');
    c.innerHTML = '';
    
    if (!fl.length) {
        c.innerHTML = '<div class="ll2"><i class="fas fa-inbox"></i> Sin pedidos</div>';
        try { llenarSelectsFiltroMapa(); } catch (_) {}
        renderMk();
        return;
    }
    
    const bC = {
        'Crítica': '#ef4444',
        'Alta': '#f97316',
        'Media': '#eab308',
        'Baja': '#3b82f6'
    };
    
    const eC = {
        'Pendiente': 'ep',
        'Asignado': 'ea',
        'En ejecución': 'ee',
        'Cerrado': 'ec',
        'Derivado externo': 'edex'
    };
    
    const pC = {
        'Crítica': 'pc2',
        'Alta': 'pa',
        'Media': 'pm',
        'Baja': 'pb'
    };
    
    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    
    fl.forEach(p => {
        const d = document.createElement('div');
        d.className = 'pi';
        d.style.borderLeftColor = bC[p.pr] || '#3b82f6';
        d.addEventListener('click', () => void detalle(p));
        
        const f = p.f ? new Date(p.f).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, ...tz }) : '';
        
        d.innerHTML = `
            <div class="ph2">
                <span class="pn">#${p.np}${p._offline ? '<span class="offline-tag">LOCAL</span>' : ''}</span>
                <span class="pe ${eC[p.es] || ''}">${p.es}</span>
            </div>
            <div class="pi2">
                ${p.dis}${(p.cnom || p.cl) ? ' - ' + String(p.cnom || p.cl) : ''}${p.nis ? ' · NIS ' + String(p.nis).substring(0, 14) + (String(p.nis).length > 14 ? '…' : '') : ''}
                <span style="float:right;color:#94a3b8">${f}</span>
            </div>
            <div class="pd">${p.de.substring(0,70)}${p.de.length > 70 ? '…' : ''}</div>
            <span class="pt2 ${pC[p.pr] || ''}">${p.pr}</span>
            <div class="pav">
                <div class="ab" style="width:${p.av}%"></div>
            </div>
        `;
        c.appendChild(d);
    });
    
    try { llenarSelectsFiltroMapa(); } catch (_) {}
    renderMk();
}


function limpiarFotosYPreviewNuevoPedido() {
    fotosTemporales = [];
    try { actualizarVistaPreviaFotos(); } catch (_) {}
}

function closeAll() {
    const forzarPw = document.getElementById('modal-forzar-cambio-pw');
    document.getElementById('modal-dashboard-gerencia')?.classList.remove('modal-dash--maximized');
    syncDashboardModalMaxButtons();
    document.querySelectorAll('.mo').forEach(m => {
        if (m === forzarPw && window._pendingAndroidPasswordChange) return;
        m.classList.remove('active');
    });
    app.cid = null;
    try {
        const dm = document.getElementById('dm');
        if (dm) delete dm.dataset.detallePedidoId;
    } catch (_) {}
    document.getElementById('pf').reset();
    limpiarFotosYPreviewNuevoPedido();
    _nisPedidoCatalogoUltimoValor = '';
    clearTimeout(_nisPedidoCatalogoDebounceTimer);
    clearTimeout(_nisPedidoCatalogoCommitTimer);
    const nisEl = document.getElementById('nis');
    if (nisEl) nisEl.value = '';
    document.getElementById('dc').textContent = '0';
    try { syncNisClienteReclamoConexionUI(); } catch (_) {}
    try { syncPrioridadConTipoReclamo(); } catch (_) {}
    ['ped-cli-calle','ped-cli-num','ped-cli-loc','ped-cli-ref'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['chk-epp','chk-corte','chk-senal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    try { limpiarFirmaCierreCanvas(); } catch (_) {}

    fotoCierreTemp = null;
    const vpc = document.getElementById('vista-previa-foto-cierre');
    if (vpc) vpc.innerHTML = '';
    const ui = document.getElementById('ui');
    if (ui) {
        ui.innerHTML = '<i class="fas fa-crosshairs"></i> Hacé clic en el mapa para seleccionar';
        ui.className = 'ud';
    }
}

function togglePanel() {
    document.getElementById('bp2').classList.toggle('col');
}

/**
 * Listado (#mt, esquina): admin → modal de contraseña y wizard marca/logo/ubicación;
 * otros roles → panel de pedidos (togglePanel).
 */
async function abrirWizardMarcaEmpresaManual() {
    if (!esAdmin()) {
        togglePanel();
        return;
    }
    const inp = document.getElementById('admin-verify-pw-setup-saas-input');
    if (inp) inp.value = '';
    document.getElementById('modal-admin-verify-pw-setup-saas')?.classList.add('active');
}
window.abrirWizardMarcaEmpresaManual = abrirWizardMarcaEmpresaManual;

async function confirmarPasswordYAbrirSetupSaaSWizard() {
    const pw = (document.getElementById('admin-verify-pw-setup-saas-input')?.value || '').trim();
    if (!pw) {
        toast('Ingresá tu contraseña de administrador', 'error');
        return;
    }
    await asegurarJwtApiRest();
    const token = getApiToken();
    if (!token) {
        toast('No hay token de API. Volvé a iniciar sesión.', 'error');
        return;
    }
    try {
        const resp = await fetch(apiUrl('/api/auth/verify-password'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ password: pw })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }
    } catch (e) {
        toast(String(e?.message || e) || 'Contraseña incorrecta', 'error');
        return;
    }
    document.getElementById('modal-admin-verify-pw-setup-saas')?.classList.remove('active');
    await abrirWizardMarcaEmpresaManualTrasPassword();
}
window.confirmarPasswordYAbrirSetupSaaSWizard = confirmarPasswordYAbrirSetupSaaSWizard;

async function abrirWizardMarcaEmpresaManualTrasPassword() {
    try {
        await cargarConfigEmpresa();
        await asegurarJwtApiRest();
        const token = getApiToken();
        if (token) {
            const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                const cli = data?.cliente || {};
                let extra = cli?.configuracion || {};
                if (typeof extra === 'string') {
                    try {
                        extra = JSON.parse(extra);
                    } catch (_) {
                        extra = {};
                    }
                }
                const ep = extra && typeof extra === 'object' ? extra : {};
                const nom = String(cli.nombre || '').trim();
                window.EMPRESA_CFG = {
                    ...(window.EMPRESA_CFG || {}),
                    ...(nom ? { nombre: nom } : {}),
                    ...(Object.prototype.hasOwnProperty.call(cli || {}, 'tipo') && String(cli.tipo ?? '').trim()
                        ? { tipo: String(cli.tipo).trim() }
                        : {}),
                    ...(String(ep.logo_url || '').trim() ? { logo_url: String(ep.logo_url).trim() } : {})
                };
                if (ep.lat_base != null && Number.isFinite(Number(ep.lat_base))) {
                    _setupLat = Number(ep.lat_base);
                    window.EMPRESA_CFG.lat_base = String(ep.lat_base);
                }
                if (ep.lng_base != null && Number.isFinite(Number(ep.lng_base))) {
                    _setupLng = Number(ep.lng_base);
                    window.EMPRESA_CFG.lng_base = String(ep.lng_base);
                }
            }
        }
    } catch (e) {
        console.warn('[wizard-marca-manual]', e?.message || e);
    }
    _setupLogoDataUrl = '';
    _setupWizardContextoManual = true;
    mostrarModalConfigInicial();
}

function switchTab(t) {
    app.tab = t;
    document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    render();
}


document.getElementById('mt').addEventListener('click', () => {
    abrirWizardMarcaEmpresaManual().catch((e) => {
        console.warn('[wizard-marca-manual]', e?.message || e);
    });
});
document.getElementById('ph').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (window.__bp2DragJustEnded) return;
    togglePanel();
});

function cerrarUserMenuPop() {
    const pop = document.getElementById('user-menu-pop');
    if (pop) {
        pop.classList.remove('user-menu-pop-open');
        pop.setAttribute('aria-hidden', 'true');
    }
}

function toggleUserMenuPop() {
    const pop = document.getElementById('user-menu-pop');
    if (!pop) return;
    const open = pop.classList.toggle('user-menu-pop-open');
    pop.setAttribute('aria-hidden', open ? 'false' : 'true');
}

document.addEventListener(
    'click',
    (e) => {
        if (e.target.closest('#user-menu-wrap')) return;
        cerrarUserMenuPop();
    },
    false
);

document.getElementById('ub')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleUserMenuPop();
});

function ejecutarCerrarSesion() {
    invalidatePedidosTenantSqlCache();
    detenerKeepAlive();
    detenerTracking();
    detenerDashboardGerenciaPoll();
    detenerPollWhatsappHumanChat();
    destruirTodasVentanasWaHc();
    detenerTecnicosMapaPrincipalPoll();
    detenerPollSincroPedidosTecnico();
    _dashCierresInit = false;
    _seenClosedIds.clear();
    try {
        if (window.AndroidSession && typeof AndroidSession.clearUser === 'function') AndroidSession.clearUser();
    } catch (_) {}
    detenerSyncCatalogos();
    limpiarEstadoMapaSesion();
    const btnRubro2 = document.getElementById('btn-admin-cambiar-rubro');
    if (btnRubro2) btnRubro2.style.display = 'none';
    localStorage.removeItem('pmg');
    localStorage.removeItem('pmg_api_token');
    app.apiToken = null;
    app.u = null;
    hydrateBrandingForPublicScreen();
    try {
        aplicarMarcaVisualCompleta();
    } catch (_) {}
    mapaInicializado = false;
    _mapLazyQueued = false;
    if (app.map) {
        app.map.remove();
        app.map = null;
    }
    _marcadoresTecnicosPrincipal = [];
    const btnAdm = document.getElementById('btn-admin');
    if (btnAdm) btnAdm.style.display = 'none';
    try {
        gnGeocodeAdminLogSyncDockVisibility();
    } catch (_) {}
    const btnDg = document.getElementById('btn-dashboard-gerencia');
    if (btnDg) btnDg.style.display = 'none';
    const btnDerivPend = document.getElementById('btn-derivaciones-pendientes');
    if (btnDerivPend) btnDerivPend.style.display = 'none';
    const badgeDerivPend = document.getElementById('badge-derivaciones-pendientes');
    if (badgeDerivPend) badgeDerivPend.style.display = 'none';
    ocultarBannerDerivacionPendiente();
    const mapDashCard = document.getElementById('mapa-card-dashboard');
    if (mapDashCard) mapDashCard.style.display = 'none';
    const wvt = document.getElementById('wrap-toggle-ver-todos');
    if (wvt) wvt.style.display = 'none';
    const wdf = document.getElementById('wrap-chk-derivados-fuera');
    if (wdf) wdf.style.display = 'none';
    cerrarAdminPanel();
    document.getElementById('gw')?.classList.remove('active');
    document.getElementById('ls').classList.add('active');
    document.getElementById('ms').classList.remove('active');
    try {
        localStorage.removeItem('gestornova_saved_login');
        const emEl = document.getElementById('em');
        const pwEl = document.getElementById('pw');
        if (emEl) emEl.value = '';
        if (pwEl) pwEl.value = '';
    } catch (_) {}
    cerrarUserMenuPop();
}

function confirmarCerrarSesionDesdeMenu() {
    cerrarUserMenuPop();
    if (confirm('¿Cerrar sesión?')) ejecutarCerrarSesion();
}
window.confirmarCerrarSesionDesdeMenu = confirmarCerrarSesionDesdeMenu;

function abrirModalMiCuentaDesdeMenu() {
    cerrarUserMenuPop();
    if (modoOffline || !NEON_OK) {
        toast('Cambiar cuenta requiere conexión (no está disponible en modo offline).', 'warning');
        return;
    }
    const tok = getApiToken() || app.apiToken;
    if (!tok || !app.u) {
        toast('No hay sesión activa con token de API.', 'error');
        return;
    }
    const m = document.getElementById('modal-mi-cuenta');
    const n = document.getElementById('micuenta-nombre');
    const em = document.getElementById('micuenta-email');
    const pa = document.getElementById('micuenta-pw-actual');
    const p1 = document.getElementById('micuenta-pw-nueva');
    const p2 = document.getElementById('micuenta-pw-nueva2');
    const msg = document.getElementById('micuenta-msg');
    if (n) n.value = String(app.u.nombre || '').trim();
    if (em) em.value = String(app.u.email || '').trim();
    if (pa) pa.value = '';
    if (p1) p1.value = '';
    if (p2) p2.value = '';
    if (msg) {
        msg.textContent = '';
        msg.style.color = '';
    }
    m?.classList.add('active');
}
window.abrirModalMiCuentaDesdeMenu = abrirModalMiCuentaDesdeMenu;

async function guardarMiCuentaUsuario() {
    const msg = document.getElementById('micuenta-msg');
    const setErr = (t) => {
        if (msg) {
            msg.textContent = t;
            msg.style.color = 'var(--re)';
        }
    };
    if (modoOffline) {
        setErr('No disponible en modo offline.');
        return;
    }
    const tok = getApiToken() || app.apiToken;
    if (!tok || !app.u) {
        setErr('Sesión no válida.');
        return;
    }
    const n = document.getElementById('micuenta-nombre');
    const em = document.getElementById('micuenta-email');
    const pa = document.getElementById('micuenta-pw-actual');
    const p1 = document.getElementById('micuenta-pw-nueva');
    const p2 = document.getElementById('micuenta-pw-nueva2');
    const nombre = (n?.value || '').trim();
    const email = (em?.value || '').trim().toLowerCase();
    const password_actual = pa?.value || '';
    const password_nueva = (p1?.value || '').trim();
    const password_nueva2 = (p2?.value || '').trim();
    if (!password_actual) {
        setErr('La contraseña actual es obligatoria.');
        return;
    }
    if (password_nueva && password_nueva !== password_nueva2) {
        setErr('Las contraseñas nuevas no coinciden.');
        return;
    }
    if (!email) {
        setErr('El email no puede quedar vacío.');
        return;
    }
    const body = { password_actual, nombre, email };
    if (password_nueva) body.password_nueva = password_nueva;
    const btn = document.getElementById('btn-micuenta-guardar');
    if (btn) {
        btn.disabled = true;
        btn.dataset._html = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Guardando…';
    }
    try {
        const resp = await fetch(apiUrl('/api/auth/me'), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            setErr(data.error || data.detail || 'No se pudo actualizar.');
            return;
        }
        if (data.user) {
            app.u.nombre = data.user.nombre || app.u.nombre;
            app.u.email = data.user.email || app.u.email;
            try {
                localStorage.setItem('pmg', JSON.stringify(app.u));
            } catch (_) {}
            const un = document.getElementById('un');
            if (un && app.u.nombre) un.textContent = app.u.nombre.split(' ')[0];
        }
        toast('Datos actualizados.', 'success');
        document.getElementById('modal-mi-cuenta')?.classList.remove('active');
        if (pa) pa.value = '';
        if (p1) p1.value = '';
        if (p2) p2.value = '';
    } catch (e) {
        setErr(e?.message || 'Error de red.');
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btn.dataset._html) btn.innerHTML = btn.dataset._html;
        }
    }
}
window.guardarMiCuentaUsuario = guardarMiCuentaUsuario;

function logout() {
    if (confirm('¿Cerrar sesión?')) ejecutarCerrarSesion();
}

document.querySelectorAll('.tb').forEach(b => {
    b.addEventListener('click', () => {
        if (b.dataset.tab) switchTab(b.dataset.tab);
    });
});

document.getElementById('toggle-ver-todos-pedidos')?.addEventListener('change', function () {
    localStorage.setItem('pmg_tecnico_ver_todos', this.checked ? '1' : '0');
    const sel = document.getElementById('sel-android-pedidos-scope');
    if (sel) sel.value = this.checked ? 'todos' : 'asignados';
    if (esTecnicoOSupervisor() && !modoOffline && NEON_OK) cargarPedidos();
});

document.getElementById('chk-mostrar-derivados-fuera')?.addEventListener('change', function () {
    try {
        localStorage.setItem(LS_MOSTRAR_DERIVADOS_FUERA, this.checked ? '1' : '0');
    } catch (_) {}
    try {
        render();
        renderMk();
    } catch (_) {}
});

document.getElementById('eb').addEventListener('click', () => {
    const flt = p => {
        if (app.tab === 'p') return p.es === 'Pendiente';
        if (app.tab === 'a') return p.es === 'Asignado' || p.es === 'En ejecución';
        return p.es === 'Cerrado' || p.es === 'Derivado externo';
    };
    exportPedido(
        pedidosVisiblesEnUI().filter(flt),
        'pedidos_' + app.tab + '_' + new Date().toISOString().slice(0,10)
    );
});



document.querySelectorAll('.cm').forEach(b => b.addEventListener('click', closeAll));
document.querySelectorAll('.cm2').forEach(b => b.addEventListener('click', closeAll));

document.getElementById('de').addEventListener('input', function() {
    document.getElementById('dc').textContent = this.value.length;
});

document.getElementById('tr').addEventListener('input', function() {
    document.getElementById('tc').textContent = this.value.length;
});


document.getElementById('ui').addEventListener('click', () => {
    closeAll();
    toast('Hacé clic en el mapa para seleccionar la ubicación', 'info');
});


const sd = document.getElementById('di2');
[...new Set(DIST.map(d => d.g))].forEach(g => {
    const og = document.createElement('optgroup');
    og.label = g;
    DIST.filter(d => d.g === g).forEach(d => {
        const o = document.createElement('option');
        o.value = d.v;
        o.textContent = d.l;
        og.appendChild(o);
    });
    sd.appendChild(og);
});

poblarSelectTiposReclamo();

function tipoTrabajoRequiereNisYCliente() {
    return tipoReclamoRequiereNisYCliente(document.getElementById('tt')?.value || '');
}

function tipoReclamoRequiereNisYCliente(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    if (!v) return false;
    if (v === 'Reclamo de Cliente' || v === 'Conexión Nueva') return true;
    if (v.includes('Conexión Nueva')) return true;
    if (v.includes('Consumo elevado')) return true;
    if (v === 'Problemas de Tensión') return true;
    if (v.toLowerCase().includes('factibilidad')) return true;
    return false;
}

function tipoReclamoSoloNisSinNombreCliente(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    return v === 'Problemas de Tensión' || v === 'Consumo elevado';
}

function tipoReclamoRequiereNombreClienteEnFormulario(tipoTrabajo) {
    return tipoReclamoRequiereNisYCliente(tipoTrabajo) && !tipoReclamoSoloNisSinNombreCliente(tipoTrabajo);
}

/** Tipos de trabajo de factibilidad: sin carga ni edición de materiales (cualquier origen). */
function esTipoPedidoFactibilidad(tipoTrabajo) {
    return String(tipoTrabajo || '').trim().toLowerCase().includes('factibilidad');
}

/** Pedidos donde no se gestionan materiales (detalle, impresión, APIs UI). */
function tipoPedidoExcluyeMateriales(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    if (!v) return false;
    if (v === 'Otros') return true;
    if (esTipoPedidoFactibilidad(v)) return true;
    return false;
}

/** Alineado con api/services/tiposReclamo.js (cooperativa eléctrica). */
function tipoReclamoElectricoPideSuministroWhatsapp(tipoTrabajo) {
    const v = String(tipoTrabajo || '').trim();
    return (
        v === 'Problemas de Tensión' ||
        v === 'Consumo elevado' ||
        v === 'Corte de Energía' ||
        v === 'Pedido de factibilidad (nuevo servicio)'
    );
}

function syncSuministroElectricoUI() {
    const w = document.getElementById('ped-suministro-wrap');
    if (!w) return;
    const tt = document.getElementById('tt')?.value || '';
    const show = esCooperativaElectricaRubro() && tipoReclamoElectricoPideSuministroWhatsapp(tt);
    w.style.display = show ? '' : 'none';
    if (!show) {
        const a = document.getElementById('ped-sum-conexion');
        const b = document.getElementById('ped-sum-fases');
        if (a) a.value = '';
        if (b) b.value = '';
    }
}

function syncNisClienteReclamoConexionUI() {
    const req = tipoTrabajoRequiereNisYCliente();
    const esMunicipio = String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio';
    const persona = esMunicipio ? 'vecino' : 'socio';
    const rubroN = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
    const nisLabel =
        rubroN === 'municipio' || rubroN === 'cooperativa_agua' ? 'NIS / Medidor / Socio' : 'NIS / Medidor';
    const lbN = document.getElementById('lbl-nis');
    const inpN = document.getElementById('nis');
    if (lbN) lbN.textContent = req ? `${nisLabel} *` : nisLabel;
    if (inpN) {
        if (req) {
            inpN.setAttribute('required', 'required');
            inpN.placeholder =
                rubroN === 'municipio' || rubroN === 'cooperativa_agua'
                    ? `Obligatorio — NIS, medidor o nº socio del ${persona}`
                    : `Obligatorio — NIS o medidor del ${persona}`;
        } else {
            inpN.removeAttribute('required');
            inpN.placeholder =
                rubroN === 'municipio' || rubroN === 'cooperativa_agua'
                    ? 'Opcional — al salir del campo se completa domicilio desde padrón si existe'
                    : 'Opcional (obligatorio en conexión / medidor / factibilidad según tipo)';
        }
    }
    const lb = document.getElementById('lbl-cl');
    const inp = document.getElementById('cl');
    const etiquetaPersona = esMunicipio ? 'Vecino' : 'Cliente';
    if (lb) lb.textContent = req ? `${etiquetaPersona} *` : etiquetaPersona;
    if (inp) {
        if (req) inp.setAttribute('required', 'required');
        else inp.removeAttribute('required');
        inp.placeholder = esMunicipio ? 'Nombre del vecino (si aplica)' : 'Nombre o razón social del socio';
    }
}
const st = document.getElementById('tt');
if (st) {
    st.addEventListener('change', () => {
        syncNisClienteReclamoConexionUI();
        syncSuministroElectricoUI();
    });
}
syncNisClienteReclamoConexionUI();
syncSuministroElectricoUI();
window.syncPrioridadConTipoReclamo = syncPrioridadConTipoReclamo;
window.syncSuministroElectricoUI = syncSuministroElectricoUI;
try { syncZonaPedidoFormLabels(); } catch (_) {}

function esCooperativaElectricaRubro() {
    return lineaNegocioOperativaCodigo() === 'electricidad';
}

/**
 * Tipos que en catálogo son solo agua (no eléctrico): aviso derivación en coop. eléctrica (opción A spec).
 * No incluye nombres compartidos con el rubro eléctrico (p. ej. Consumo elevado, Otros).
 */
const TIPOS_TRABAJO_DERIVACION_SOLO_AGUA = new Set([
    'Pérdida en Vereda/Calle',
    'Falta de Presión',
    'Calidad del Agua',
    'Obstrucción de Cloaca',
]);
const TIPOS_TRABAJO_DERIVACION_SOLO_MUNICIPIO = new Set([
    'Bacheo y Pavimento',
    'Recolección/Poda',
    'Espacios Verdes',
    'Señalización/Semáforos',
    'Limpieza de Zanjas',
    'Recolección (otros)',
    'Cloacas',
]);

function pedidoSugiereDerivacionAguaOMunicipioEnElectrica(tt) {
    const t = String(tt || '').trim();
    return TIPOS_TRABAJO_DERIVACION_SOLO_AGUA.has(t) || TIPOS_TRABAJO_DERIVACION_SOLO_MUNICIPIO.has(t);
}

function normalizarWhatsappInternacionalWaMeUrl(raw) {
    const s = String(raw ?? '').trim();
    if (!/^\+\d{8,22}$/.test(s)) return '';
    return 'https://wa.me/' + s.slice(1);
}

function syncDerivacionesTercerosWrap() {
    const w = document.getElementById('admin-derivacion-terceros-wrap');
    if (!w) return;
    w.style.display = '';
}

/**
 * Arma `configuracion.derivacion_reclamos` desde el formulario admin (cfg-deriv-*).
 * @throws {Error} mensaje para toast / inline
 */
function construirDerivacionReclamosDesdeFormularioDerivaciones() {
    const out = {};
    const pushSlot = (slot, apiKey) => {
        const act = !!document.getElementById(`cfg-deriv-${slot}-activo`)?.checked;
        const n = (document.getElementById(`cfg-deriv-${slot}-nombre`)?.value || '').trim().slice(0, 120);
        const wRaw = (document.getElementById(`cfg-deriv-${slot}-whatsapp`)?.value || '').trim();
        const w = normalizarWhatsappInternacionalDesdeInput(wRaw);
        const label = slot === 'energia' ? 'Empresa de energía' : 'Cooperativa de agua';
        if (act) {
            if (!w || !/^\+\d{8,22}$/.test(w)) {
                throw new Error(
                    `${label}: con «activo» marcado, cargá WhatsApp internacional válido (+ y 8–22 dígitos).`
                );
            }
            out[apiKey] = { whatsapp: w, ...(n ? { nombre: n } : {}) };
        } else if (n || wRaw) {
            if (wRaw && (!w || !/^\+\d{8,22}$/.test(w))) {
                throw new Error(`${label}: WhatsApp inválido (usá + y solo dígitos).`);
            }
            if (n || w) {
                out[apiKey] = { ...(n ? { nombre: n } : {}), ...(w ? { whatsapp: w } : {}) };
            }
        }
    };
    pushSlot('energia', 'empresa_energia');
    pushSlot('agua', 'cooperativa_agua');
    return out;
}

function setDerivacionesInlineError(msg) {
    const el = document.getElementById('cfg-deriv-inline-error');
    if (!el) return;
    if (!msg) {
        el.textContent = '';
        el.style.display = 'none';
        return;
    }
    el.textContent = msg;
    el.style.display = '';
}
window.setDerivacionesInlineError = setDerivacionesInlineError;

let _nisPedidoCatalogoDebounceTimer = null;
let _nisPedidoCatalogoCommitTimer = null;
let _nisPedidoCatalogoUltimoValor = '';

function rubroEmpresaParaAutofillIdentificadorPedido() {
    return normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
}

/** Municipio / cooperativa de agua: padrón en clientes_finales (NIS, medidor o número de socio). */
async function rellenarPedidoDesdeClientesFinalesPorIdentificador(raw) {
    const tid = tenantIdActual();
    if (!Number.isFinite(tid)) return;
    const r = await sqlSimple(
        `SELECT nombre, apellido, calle, numero_puerta, barrio, localidad
         FROM clientes_finales
         WHERE activo = TRUE AND cliente_id = ${esc(tid)}
           AND (
             UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${esc(raw)}))
             OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${esc(raw)}))
             OR UPPER(TRIM(COALESCE(numero_cliente,''))) = UPPER(TRIM(${esc(raw)}))
           )
         LIMIT 1`
    );
    const row = r.rows?.[0];
    if (!row) return;
    _nisPedidoCatalogoUltimoValor = raw;
    const cl = document.getElementById('cl');
    const tel = document.getElementById('ped-tel-contacto');
    const calleEl = document.getElementById('ped-cli-calle');
    const numEl = document.getElementById('ped-cli-num');
    const locEl = document.getElementById('ped-cli-loc');
    const refEl = document.getElementById('ped-cli-ref');
    const nom = [row.nombre, row.apellido]
        .map(x => (x != null ? String(x).trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim();
    if (cl && nom) cl.value = nom;
    if (calleEl) calleEl.value = row.calle != null ? String(row.calle).trim() : '';
    if (numEl) numEl.value = row.numero_puerta != null ? String(row.numero_puerta).trim() : '';
    if (locEl) locEl.value = row.localidad != null ? String(row.localidad).trim() : '';
    if (refEl) refEl.value = row.barrio != null ? String(row.barrio).trim() : '';
    if (tel) tel.value = '';
}

/**
 * Al salir del campo NIS / medidor / socio: completa domicilio desde padrón y deja el teléfono vacío para cargar uno nuevo.
 * Cooperativa eléctrica: socios_catalogo. Municipio y agua: clientes_finales.
 */
async function rellenarPedidoDesdeSociosCatalogoPorNis(opts) {
    const forzar = !!(opts && opts.forzar);
    const rubro = rubroEmpresaParaAutofillIdentificadorPedido();
    if (!rubro) return;
    if (modoOffline || !NEON_OK) return;
    const inpN = document.getElementById('nis');
    if (!inpN) return;
    const raw = (inpN.value || '').trim();
    if (!raw) {
        _nisPedidoCatalogoUltimoValor = '';
        if (rubro === 'cooperativa_electrica') {
            const tfC = document.getElementById('trafo-pedido');
            if (tfC) tfC.value = '';
            /* Sin NIS: no limpiar distribuidor ni conexión/fases (el usuario puede elegirlos a mano;
               el focusin al pasar entre selects disparaba este código y borraba el otro campo). */
        }
        return;
    }
    if (!forzar && raw === _nisPedidoCatalogoUltimoValor) return;

    if (rubro === 'municipio' || rubro === 'cooperativa_agua') {
        try {
            await rellenarPedidoDesdeClientesFinalesPorIdentificador(raw);
        } catch (e) {
            console.warn('[nis→clientes_finales]', e.message);
        }
        return;
    }

    if (rubro !== 'cooperativa_electrica') return;

    try {
        const hasSocTNis = await sociosCatalogoTieneTenantId();
        const wfNis = hasSocTNis ? ` AND tenant_id = ${esc(tenantIdActual())}` : '';
        const r = await sqlSimple(
            `SELECT nombre, telefono, transformador, distribuidor_codigo, tipo_conexion, fases, calle, numero, localidad, barrio FROM socios_catalogo
             WHERE activo = TRUE${wfNis} AND UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM(${esc(raw)}))
             LIMIT 1`
        );
        const row = r.rows?.[0];
        if (!row) return;
        _nisPedidoCatalogoUltimoValor = raw;
        const cl = document.getElementById('cl');
        const tel = document.getElementById('ped-tel-contacto');
        const tf = document.getElementById('trafo-pedido');
        const calleEl = document.getElementById('ped-cli-calle');
        const numEl = document.getElementById('ped-cli-num');
        const locEl = document.getElementById('ped-cli-loc');
        const refEl = document.getElementById('ped-cli-ref');
        if (tf && row.transformador != null && String(row.transformador).trim()) {
            tf.value = String(row.transformador).trim();
        }
        if (cl && row.nombre != null && String(row.nombre).trim()) {
            cl.value = String(row.nombre).trim();
        }
        if (tel) tel.value = '';
        if (calleEl) calleEl.value = row.calle != null ? String(row.calle).trim() : '';
        if (numEl) numEl.value = row.numero != null ? String(row.numero).trim() : '';
        if (locEl) locEl.value = row.localidad != null ? String(row.localidad).trim() : '';
        if (refEl) refEl.value = row.barrio != null ? String(row.barrio).trim() : '';
        const di2 = document.getElementById('di2');
        if (di2 && row.distribuidor_codigo != null && String(row.distribuidor_codigo).trim()) {
            const cod = String(row.distribuidor_codigo).trim().toUpperCase();
            const opt = Array.from(di2.options).find(o => (o.value || '').trim().toUpperCase() === cod);
            if (opt) di2.value = opt.value;
        }
        const scEl = document.getElementById('ped-sum-conexion');
        const sfEl = document.getElementById('ped-sum-fases');
        if (scEl && row.tipo_conexion != null && String(row.tipo_conexion).trim()) {
            const tx = String(row.tipo_conexion).trim().toLowerCase();
            if (tx.includes('subter')) scEl.value = 'Subterráneo';
            else if (tx.includes('aer') || tx.includes('éreo') || tx.includes('ereo')) scEl.value = 'Aéreo';
        }
        if (sfEl && row.fases != null && String(row.fases).trim()) {
            const fx = String(row.fases).trim().toLowerCase();
            if (fx.includes('tri')) sfEl.value = 'Trifásico';
            else if (fx.includes('mono')) sfEl.value = 'Monofásico';
        }
    } catch (e) {
        console.warn('[nis→socio]', e.message);
    }
}

function programarRellenoSocioPorNisDebounced() {
    if (!rubroEmpresaParaAutofillIdentificadorPedido()) return;
    clearTimeout(_nisPedidoCatalogoDebounceTimer);
    _nisPedidoCatalogoDebounceTimer = setTimeout(() => {
        void rellenarPedidoDesdeSociosCatalogoPorNis({ forzar: false });
    }, 480);
}

function onNisCommitRellenarDesdeSociosCatalogo() {
    clearTimeout(_nisPedidoCatalogoDebounceTimer);
    clearTimeout(_nisPedidoCatalogoCommitTimer);
    _nisPedidoCatalogoCommitTimer = setTimeout(() => {
        void rellenarPedidoDesdeSociosCatalogoPorNis({ forzar: true });
    }, 90);
}

const nisPedidoInp = document.getElementById('nis');
if (nisPedidoInp) {
    nisPedidoInp.addEventListener('blur', onNisCommitRellenarDesdeSociosCatalogo);
    nisPedidoInp.addEventListener('focusout', onNisCommitRellenarDesdeSociosCatalogo);
    nisPedidoInp.addEventListener('input', programarRellenoSocioPorNisDebounced);
    nisPedidoInp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            onNisCommitRellenarDesdeSociosCatalogo();
        }
    });
    /* WebView Android: el IME a veces solo dispara keyup con keyCode 13 */
    nisPedidoInp.addEventListener('keyup', (ev) => {
        if (ev.key === 'Enter' || ev.keyCode === 13) {
            ev.preventDefault();
            onNisCommitRellenarDesdeSociosCatalogo();
        }
    });
}
/** Al pasar a otro campo o tocar fuera del NIS (p. ej. Trafo readonly, mapa), WebView no siempre hace blur. */
(function engancharNisAutofillAlSalirCampoModal() {
    const pf = document.getElementById('pf');
    const pm = document.getElementById('pm');
    const nisEl = document.getElementById('nis');
    if (!pf || !pm || !nisEl) return;
    pf.addEventListener(
        'focusin',
        (ev) => {
            const id = ev.target && ev.target.id;
            if (!id || id === 'nis') return;
            onNisCommitRellenarDesdeSociosCatalogo();
        },
        true
    );
    pm.addEventListener(
        'pointerdown',
        (ev) => {
            try {
                if (document.activeElement !== nisEl) return;
                const t = ev.target;
                if (t && (t === nisEl || nisEl.contains(t))) return;
                onNisCommitRellenarDesdeSociosCatalogo();
            } catch (_) {}
        },
        true
    );
})();

// ── TRACKING DE UBICACIÓN (WebView ~2 min · navegador 15 min) — antes del restore de sesión ──
let _trackingInterval = null;

async function iniciarTracking() {
    if (_trackingInterval) return; // ya está corriendo
    const enviarUbicacion = async () => {
        if (!app.u || !navigator.geolocation || modoOffline || !NEON_OK) return;
        navigator.geolocation.getCurrentPosition(async pos => {
                try {
                const { latitude, longitude, accuracy } = pos.coords;
                registrarFajaInstalacionSiFalta(longitude);
                await sqlSimple(`INSERT INTO ubicaciones_usuarios(usuario_id, lat, lng, precision_m, timestamp)
                    VALUES(${esc(app.u.id)}, ${esc(latitude)}, ${esc(longitude)}, ${esc(Math.round(accuracy))}, NOW())`);
                // Limpiar registros viejos de este usuario (más de 2 horas)
                await sqlSimple(`DELETE FROM ubicaciones_usuarios WHERE usuario_id = ${esc(app.u.id)} AND timestamp < NOW() - INTERVAL '2 hours'`);
                await intentarAutoInicioEjecucionTecnico(latitude, longitude);
            } catch(e) { console.warn('[tracking]', e.message); }
        }, () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    };
    const intervaloMs = esAndroidWebViewMapa() ? 120000 : 15 * 60 * 1000;
    enviarUbicacion();
    _trackingInterval = setInterval(enviarUbicacion, intervaloMs);
    console.log('[tracking] iniciado');
}

function detenerTracking() {
    if (_trackingInterval) { clearInterval(_trackingInterval); _trackingInterval = null; }
    if (_watchId && navigator.geolocation) {
        try { navigator.geolocation.clearWatch(_watchId); } catch(_) {}
    }
    _watchId = null;
}
window.detenerTracking = detenerTracking;

(function limpiarSesionSiActualizoApkAndroid() {
    try {
        if (window.AndroidConfig && typeof AndroidConfig.getVersionCode === 'function') {
            const vc = AndroidConfig.getVersionCode();
            const key = 'pmg_stored_app_version_code';
            const prevRaw = localStorage.getItem(key);
            if (prevRaw != null && prevRaw !== '') {
                const prev = parseInt(prevRaw, 10);
                if (Number.isFinite(prev) && prev > 0 && vc !== prev) {
                    localStorage.removeItem('pmg');
                    localStorage.removeItem('pmg_api_token');
                    app.apiToken = null;
                    try {
                        if (window.AndroidSession && typeof AndroidSession.clearUser === 'function') {
                            AndroidSession.clearUser();
                        }
                    } catch (_) {}
                }
            }
            localStorage.setItem(key, String(vc));
        }
    } catch (_) {}
})();

try {
    const s = localStorage.getItem('pmg');
    try {
        const tk = localStorage.getItem('pmg_api_token');
        if (tk) app.apiToken = tk;
    } catch (_) {}
    if (s) {
        app.u = JSON.parse(s);
        app.u.rol = normalizarRolStr(app.u.rol);
        try { localStorage.setItem('pmg', JSON.stringify(app.u)); } catch (_) {}
        document.getElementById('un').textContent = app.u.nombre.split(' ')[0];
        const btnAdm = document.getElementById('btn-admin');
        if (btnAdm) btnAdm.style.display = esAdmin() ? 'flex' : 'none';
        try {
            gnGeocodeAdminLogSyncDockVisibility();
        } catch (_) {}
        const btnDash2 = document.getElementById('btn-dashboard-gerencia');
        if (btnDash2) btnDash2.style.display = esAdmin() ? 'flex' : 'none';
        const btnDerivPend2 = document.getElementById('btn-derivaciones-pendientes');
        if (btnDerivPend2) btnDerivPend2.style.display = esAdmin() ? 'inline-flex' : 'none';
        const mapDashCard2 = document.getElementById('mapa-card-dashboard');
        if (mapDashCard2) mapDashCard2.style.display = esAdmin() ? 'block' : 'none';
        const wrapTog2 = document.getElementById('wrap-toggle-ver-todos');
        const chkTod2 = document.getElementById('toggle-ver-todos-pedidos');
        if (wrapTog2 && chkTod2) {
            wrapTog2.style.display = esTecnicoOSupervisor() ? 'inline-flex' : 'none';
            chkTod2.checked = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
        }
        const wrapDf2 = document.getElementById('wrap-chk-derivados-fuera');
        const chkDf2 = document.getElementById('chk-mostrar-derivados-fuera');
        if (wrapDf2 && chkDf2) {
            wrapDf2.style.display = esAdmin() ? 'inline-flex' : 'none';
            chkDf2.checked = esAdmin() && localStorage.getItem(LS_MOSTRAR_DERIVADOS_FUERA) === '1';
            if (!esAdmin()) {
                try {
                    localStorage.removeItem(LS_MOSTRAR_DERIVADOS_FUERA);
                } catch (_) {}
                chkDf2.checked = false;
            }
        }
        try {
            if (window.AndroidSession && typeof AndroidSession.setUser === 'function') {
                AndroidSession.setUser(parseInt(app.u.id, 10) || 0, String(app.u.rol || ''));
            }
        } catch (_) {}
        if (esAdmin()) {
            iniciarDashboardGerenciaPoll();
            iniciarPollWhatsappHumanChat();
            detenerPollSincroPedidosTecnico();
        } else {
            detenerDashboardGerenciaPoll();
            detenerPollWhatsappHumanChat();
            destruirTodasVentanasWaHc();
            detenerTecnicosMapaPrincipalPoll();
            iniciarPollSincroPedidosTecnico();
            detenerPollBannerReclamoCliente();
        }
        document.getElementById('ls').classList.remove('active');
        document.getElementById('ms').classList.add('active');
        resetPreferenciasPanelesInicioCerrados();
        try { aplicarUIMapaPlataforma(); } catch (_) {}
        try { initWebCoordsConverterBar(); } catch (_) {}
        iniciarKeepAlive();
        iniciarTracking();
        iniciarPollNotifMovil();
        iniciarSyncCatalogos();
        actualizarBadgeOffline();
        setTimeout(async () => {
            
            solicitarPermisos();
            setupMapLazyWhenVisibleOnce();
            await asegurarJwtApiRest();
            if (!modoOffline) {
                const cfgLista = await verificarConfiguracionInicialObligatoria();
                if (!cfgLista) return;
                await cargarConfigEmpresa();
            }
            await cargarPedidos();
            if (esAdmin()) iniciarPollBannerReclamoCliente();
            
            if (!modoOffline && offlineQueue().length > 0) {
                setTimeout(sincronizarOffline, 2000);
            }
            await consumirPedidoPendienteDesdeNotif();
        }, 200);
    }
} catch(_) {}


const xscript = document.createElement('script');
xscript.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
xscript.onerror = () => console.log('XLSX no disponible - se usará CSV');
document.head.appendChild(xscript);


async function cargarDistribuidores() {
    try {
        const r = await sqlSimpleSelectAllPages(
            'SELECT codigo, nombre, tension FROM distribuidores WHERE activo = TRUE',
            'ORDER BY codigo'
        );
        DIST = (r.rows || []).map(d => ({ v: d.codigo, l: d.codigo + ' - ' + d.nombre, g: d.tension || '' }));
        // Repoblar el select de distribuidores
        const sd = document.getElementById('di2');
        if (sd) {
            sd.innerHTML = '<option value="">— Elegir distribuidor —</option>';
            const grupos = {};
            DIST.forEach(d => {
                const g = d.g || 'Sin clasificar';
                if (!grupos[g]) grupos[g] = [];
                grupos[g].push(d);
            });
            Object.entries(grupos).forEach(([g, items]) => {
                const og = document.createElement('optgroup');
                og.label = g;
                items.forEach(d => {
                    const o = document.createElement('option');
                    o.value = d.v;
                    o.textContent = d.l;
                    og.appendChild(o);
                });
                sd.appendChild(og);
            });
        }
    } catch(e) {
        console.warn('No se pudieron cargar distribuidores:', e.message);
    }
}

async function cargarConfigEmpresa() {
    try {
        const r = await sqlSimple("SELECT clave, valor FROM empresa_config");
        const sqlCfg = {};
        (r.rows || []).forEach(row => { sqlCfg[row.clave] = row.valor; });
        window.EMPRESA_CFG = { ...sqlCfg, ...(window.EMPRESA_CFG || {}) };
        if (!String(window.EMPRESA_CFG.tipo || '').trim() && NEON_OK) {
            try {
                const tid = tenantIdActual();
                const cr = await sqlSimple(`SELECT tipo FROM clientes WHERE id = ${esc(tid)} LIMIT 1`);
                const trow = cr.rows?.[0];
                if (trow && String(trow.tipo || '').trim()) {
                    const t = String(trow.tipo).trim();
                    window.EMPRESA_CFG.tipo = t;
                    window.__PMG_TENANT_BRANDING__ = { ...(window.__PMG_TENANT_BRANDING__ || {}), tipo: t };
                    syncEmpresaCfgNombreLogoDesdeMarca();
                }
            } catch (_) {}
        }
        ensureBrandingFromLocalEmpresaCfg();
        syncEmpresaCfgNombreLogoDesdeMarca();
        syncWrapCoordsDisplayNuevoPedido();
        refrescarLineaUbicacionModalNuevoPedido();
        aplicarMarcaVisualCompleta();
        const cfg = window.EMPRESA_CFG || {};
        aplicarEtiquetasPorTipo(cfg.tipo || '');
        poblarSelectTiposReclamo();
        try {
            persistTenantBrandingCache({ subtitulo: cfg.subtitulo });
        } catch (_) {}
        if (esAdmin()) {
            try {
                await fetchMiConfiguracionYAplicarEnEmpresaCfg();
            } catch (_) {}
        }
        try {
            aplicarVisibilidadTabsAdminRedElectrica();
        } catch (_) {}
        try {
            syncDerivacionesTercerosWrap();
        } catch (_) {}
        void refreshMapAdminBaseMarkerIfReady();
    } catch(e) {
        console.warn('Config empresa no cargada:', e.message);
        syncWrapCoordsDisplayNuevoPedido();
        refrescarLineaUbicacionModalNuevoPedido();
        try { aplicarMarcaVisualCompleta(); } catch (_) {}
        poblarSelectTiposReclamo();
        try {
            aplicarVisibilidadTabsAdminRedElectrica();
        } catch (_) {}
        try {
            syncDerivacionesTercerosWrap();
        } catch (_) {}
    }
}

let _configInicialBloqueante = false;
/** true si el admin abrió el wizard desde el botón superior (listado); permite cerrar con X sin completar. */
let _setupWizardContextoManual = false;
let _setupWizardStep = 1;
let _setupMap = null;
let _setupMarker = null;
let _setupLogoDataUrl = '';
let _setupLat = null;
let _setupLng = null;
let _setupGeoIntentado = false;
function tenantIdActual() {
    const u = app?.u;
    if (u && (u.tenant_id != null || u.tenantId != null)) {
        const n = Number(u.tenant_id ?? u.tenantId);
        if (Number.isFinite(n)) return n;
    }
    const cfg = window.APP_CONFIG || {};
    const fromCfg = Number(cfg.app?.tenantId ?? cfg.tenant_id);
    if (Number.isFinite(fromCfg)) return fromCfg;
    return 1;
}

/** Cache: existe columna socios_catalogo.tenant_id (Neon / multitenant). */
let _sociosCatalogoTieneTenantIdCache = null;
async function sociosCatalogoTieneTenantId() {
    if (_sociosCatalogoTieneTenantIdCache === true || _sociosCatalogoTieneTenantIdCache === false) {
        return _sociosCatalogoTieneTenantIdCache;
    }
    try {
        const chk = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name = 'tenant_id' LIMIT 1`
        );
        _sociosCatalogoTieneTenantIdCache = !!(chk.rows?.length);
    } catch (_) {
        _sociosCatalogoTieneTenantIdCache = false;
    }
    return _sociosCatalogoTieneTenantIdCache;
}

/** Cache: existe columna socios_catalogo.business_type (línea operativa). */
let _sociosCatalogoTieneBusinessTypeCache = null;
async function sociosCatalogoTieneBusinessType() {
    if (_sociosCatalogoTieneBusinessTypeCache === true || _sociosCatalogoTieneBusinessTypeCache === false) {
        return _sociosCatalogoTieneBusinessTypeCache;
    }
    try {
        const chk = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name = 'business_type' LIMIT 1`
        );
        _sociosCatalogoTieneBusinessTypeCache = !!(chk.rows?.length);
    } catch (_) {
        _sociosCatalogoTieneBusinessTypeCache = false;
    }
    return _sociosCatalogoTieneBusinessTypeCache;
}

let _pedidosTenantSqlCache = null;
function invalidatePedidosTenantSqlCache() {
    _pedidosTenantSqlCache = null;
}

/** Si existe pedidos.tenant_id, filtra por el tenant del usuario (multicliente). Si existe business_type, filtra por línea operativa activa (relajado con NULL legacy). */
async function pedidosFiltroTenantSql() {
    if (_pedidosTenantSqlCache !== null) return _pedidosTenantSqlCache;
    let sql = '';
    try {
        const chk = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'tenant_id' LIMIT 1`
        );
        if (chk.rows?.length) {
            const tid = tenantIdActual();
            sql += ` AND tenant_id = ${esc(tid)}`;
        }
    } catch (_) {}
    try {
        const chBt = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'business_type' LIMIT 1`
        );
        if (chBt.rows?.length) {
            const line = lineaNegocioOperativaCodigo();
            const lineQ = esc(line);
            /* NULL legacy (pre multi-línea) se considera solo electricidad; evita ver pedidos de otro rubro al cambiar línea. */
            sql += ` AND (business_type = ${lineQ} OR (business_type IS NULL AND ${lineQ} = 'electricidad'))`;
        }
    } catch (_) {}
    _pedidosTenantSqlCache = sql;
    return _pedidosTenantSqlCache;
}

function urlWhatsappAtencionDesdeCfg() {
    const raw = String((window.EMPRESA_CFG || {}).telefono || '').replace(/\D/g, '');
    if (raw.length < 8) return '';
    const n = raw.startsWith('54') ? raw : '54' + raw.replace(/^0+/, '');
    return 'https://wa.me/' + n;
}

async function contarPedidosCorteZonaNeon(disVal, trafoVal) {
    const d = disVal != null ? String(disVal).trim() : '';
    const t = trafoVal != null ? String(trafoVal).trim() : '';
    if (!d && !t) return 0;
    const tsql = await pedidosFiltroTenantSql();
    const ors = [];
    if (d) ors.push(`TRIM(COALESCE(distribuidor,'')) = TRIM(${esc(d)})`);
    if (t) ors.push(`TRIM(COALESCE(trafo,'')) = TRIM(${esc(t)})`);
    if (!ors.length) return 0;
    const w = [
        `estado IN ('Pendiente','Asignado','En ejecución')`,
        `fecha_creacion > NOW() - INTERVAL '90 minutes'`,
        `(${ors.join(' OR ')})`,
    ];
    try {
        const r = await sqlSimple(`SELECT COUNT(*)::int AS c FROM pedidos WHERE ${w.join(' AND ')}${tsql}`);
        return Number(r.rows?.[0]?.c) || 0;
    } catch (_) {
        if (!d) return 0;
        try {
            const r2 = await sqlSimple(
                `SELECT COUNT(*)::int AS c FROM pedidos WHERE estado IN ('Pendiente','Asignado','En ejecución') AND fecha_creacion > NOW() - INTERVAL '90 minutes' AND TRIM(COALESCE(distribuidor,'')) = TRIM(${esc(d)})${tsql}`
            );
            return Number(r2.rows?.[0]?.c) || 0;
        } catch (_e2) {
            return 0;
        }
    }
}

let _adminBannerWatermarkId = 0;
let _adminBannerTimer = null;
let _adminBannerAutoOpenTimer = null;
/** Evita abrir dos veces el mismo detalle por banner (clic + timer 5s). */
let _adminBannerNuevoUltimoPidAbierto = null;
let _pollBannerAdminInterval = null;
/** Tras el aviso de nuevo reclamo WhatsApp, el mapa no abre #pm solo durante 5 s (no hasta hacer clic en el banner). */
let _gnMapaBloqueoBannerHastaMs = 0;
let _gnMapaBloqueoBannerTimer = null;
window.gnMapaDebeBloquearCargaPedidoDesdeMapa = function () {
    return Date.now() < (_gnMapaBloqueoBannerHastaMs || 0);
};
/** ISO: última fecha_opinion_cliente ya notificada en banner (solo admin). */
let _adminBannerOpinionWatermarkIso = null;

const SESS_KEY_BANNER_OPINION_DISMISS = 'pmg_sess_banner_opinion_dismiss_v1';

function _sessionOpinionBannerDismissedIds() {
    try {
        const j = sessionStorage.getItem(SESS_KEY_BANNER_OPINION_DISMISS);
        const a = JSON.parse(j || '[]');
        return new Set((Array.isArray(a) ? a : []).map(String));
    } catch (_) {
        return new Set();
    }
}

function _sessionDismissOpinionBannerPedido(pid) {
    if (pid == null || pid === '') return;
    const s = _sessionOpinionBannerDismissedIds();
    s.add(String(pid));
    try {
        sessionStorage.setItem(SESS_KEY_BANNER_OPINION_DISMISS, JSON.stringify([...s]));
    } catch (_) {}
}

async function iniciarWatermarkBannerReclamoCliente() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    try {
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(`SELECT COALESCE(MAX(id),0)::bigint AS m FROM pedidos WHERE 1=1${tsql}`);
        _adminBannerWatermarkId = Number(r.rows?.[0]?.m) || 0;
    } catch (_) {}
}

async function iniciarWatermarkBannerOpinionCliente() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    try {
        const col = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'fecha_opinion_cliente' LIMIT 1`
        );
        if (!col.rows?.length) {
            _adminBannerOpinionWatermarkIso = new Date().toISOString();
            return;
        }
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(
            `SELECT MAX(fecha_opinion_cliente) AS m FROM pedidos WHERE fecha_opinion_cliente IS NOT NULL${tsql}`
        );
        const m = r.rows?.[0]?.m;
        _adminBannerOpinionWatermarkIso = m ? new Date(m).toISOString() : new Date(0).toISOString();
    } catch (_) {
        _adminBannerOpinionWatermarkIso = new Date().toISOString();
    }
}

function ocultarBannerReclamoCliente() {
    clearTimeout(_adminBannerAutoOpenTimer);
    _adminBannerAutoOpenTimer = null;
    const box = document.getElementById('admin-banner-nuevo-cliente');
    if (box) {
        box.style.display = 'none';
        delete box.dataset.visible;
        delete box.dataset.pedidoId;
    }
    clearTimeout(_adminBannerTimer);
    _adminBannerTimer = null;
}

function _commitAdminBannerOpinionWatermark() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    const pid = box?.dataset?.pedidoId;
    let iso = box?.dataset?.fechaOpinionIso;
    if (!iso && pid) {
        const p0 = app.p?.find(x => String(x.id) === String(pid));
        if (p0?.fopin) {
            const d = new Date(p0.fopin);
            if (!Number.isNaN(d.getTime())) iso = d.toISOString();
        }
    }
    if (iso) {
        const t = new Date(iso).getTime();
        const cur = _adminBannerOpinionWatermarkIso ? new Date(_adminBannerOpinionWatermarkIso).getTime() : 0;
        if (t > cur) _adminBannerOpinionWatermarkIso = new Date(t).toISOString();
    } else if (pid) {
        _adminBannerOpinionWatermarkIso = new Date().toISOString();
    }
}

function ocultarBannerOpinionCliente() {
    const boxPre = document.getElementById('admin-banner-opinion-cliente');
    const pidBanner = boxPre?.dataset?.pedidoId;
    if (pidBanner && typeof puedeEnviarApiRestPedidos === 'function' && puedeEnviarApiRestPedidos()) {
        void (async () => {
            try {
                await asegurarJwtApiRest();
                const tok = getApiToken();
                if (!tok) return;
                await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(pidBanner))}/banner-calificacion-cerrado`), {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${tok}` },
                });
            } catch (_) {}
        })();
    }
    if (boxPre?.dataset?.pedidoId) _sessionDismissOpinionBannerPedido(boxPre.dataset.pedidoId);
    _commitAdminBannerOpinionWatermark();
    const box = document.getElementById('admin-banner-opinion-cliente');
    if (box) {
        box.style.display = 'none';
        box.classList.remove('admin-banner-opinion--min');
        delete box.dataset.visible;
        delete box.dataset.pedidoId;
        delete box.dataset.fechaOpinionIso;
        delete box.dataset.waTelE164;
        delete box.dataset.estrellasOpinion;
    }
    const btnHc = document.getElementById('admin-banner-opinion-hc');
    if (btnHc) btnHc.style.display = 'none';
}

function adminBannerOpinionToggleMinimize() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    if (!box || box.style.display === 'none') return;
    box.classList.toggle('admin-banner-opinion--min');
}
window.adminBannerOpinionToggleMinimize = adminBannerOpinionToggleMinimize;

async function pollBannerNuevoReclamoCliente() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    const box = document.getElementById('admin-banner-nuevo-cliente');
    if (!box || box.dataset.visible === '1') return;
    try {
        const colO = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'origen_reclamo' LIMIT 1`
        );
        if (!colO.rows?.length) return;
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(
            `SELECT id, numero_pedido, tipo_trabajo FROM pedidos WHERE id > ${esc(_adminBannerWatermarkId)} AND COALESCE(origen_reclamo,'') = 'whatsapp'${tsql} ORDER BY id ASC LIMIT 1`
        );
        const row = r.rows?.[0];
        if (!row) return;
        const nid = Number(row.id);
        _adminBannerWatermarkId = Math.max(_adminBannerWatermarkId, nid);
        const txt = document.getElementById('admin-banner-nuevo-cliente-txt');
        if (txt) {
            const tit = (row.tipo_trabajo || '').trim();
            txt.textContent = `Nuevo reclamo de cliente · #${row.numero_pedido || nid}${tit ? ' · ' + tit : ''}`;
        }
        box.style.display = 'flex';
        box.dataset.visible = '1';
        box.dataset.pedidoId = String(nid);
        clearTimeout(_gnMapaBloqueoBannerTimer);
        _gnMapaBloqueoBannerHastaMs = Date.now() + 5000;
        _gnMapaBloqueoBannerTimer = setTimeout(() => {
            _gnMapaBloqueoBannerHastaMs = 0;
            _gnMapaBloqueoBannerTimer = null;
        }, 5000);
        clearTimeout(_adminBannerAutoOpenTimer);
        _adminBannerAutoOpenTimer = setTimeout(() => {
            _adminBannerAutoOpenTimer = null;
            void adminBannerAbrirPedidoNuevoUnaVez('auto5s');
        }, 5000);
        clearTimeout(_adminBannerTimer);
        _adminBannerTimer = setTimeout(() => ocultarBannerReclamoCliente(), 30000);
    } catch (_) {}
}

async function pollBannerOpinionCliente() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) {
        console.debug('[poll-banner-opinion] Skip: no admin o offline o sin Neon');
        return;
    }
    const box = document.getElementById('admin-banner-opinion-cliente');
    if (!box) {
        console.debug('[poll-banner-opinion] Skip: elemento banner no existe');
        return;
    }
    try {
        const col = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'fecha_opinion_cliente' LIMIT 1`
        );
        if (!col.rows?.length) {
            console.warn('[poll-banner-opinion] Columna fecha_opinion_cliente no existe');
            return;
        }
        const tsql = await pedidosFiltroTenantSql();
        let banSql = '';
        try {
            const bc = await sqlSimple(
                `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'banner_calificacion_cerrado' LIMIT 1`
            );
            if (bc.rows?.length) banSql = ' AND COALESCE(banner_calificacion_cerrado, FALSE) = FALSE';
        } catch (_) {}
        let r;
        try {
            r = await sqlSimple(
                `SELECT id, numero_pedido, tipo_trabajo, opinion_cliente, fecha_opinion_cliente,
                        telefono_contacto, opinion_cliente_estrellas
                 FROM pedidos
                 WHERE fecha_opinion_cliente IS NOT NULL
                 AND opinion_cliente_estrellas IS NOT NULL
                 AND opinion_cliente_estrellas <= 2
                 ${banSql}
                 ${tsql}
                 ORDER BY fecha_opinion_cliente DESC LIMIT 1`
            );
        } catch (_e) {
            console.warn('[poll-banner-opinion] Query principal falló, intentando fallback sin tsql');
            r = await sqlSimple(
                `SELECT id, numero_pedido, tipo_trabajo, opinion_cliente, fecha_opinion_cliente,
                        telefono_contacto, opinion_cliente_estrellas
                 FROM pedidos
                 WHERE fecha_opinion_cliente IS NOT NULL
                 AND opinion_cliente_estrellas IS NOT NULL
                 AND opinion_cliente_estrellas <= 2
                 ${banSql}
                 ${tsql}
                 ORDER BY fecha_opinion_cliente DESC LIMIT 1`
            );
        }
        const row = r.rows?.[0];
        if (!row) {
            console.debug('[poll-banner-opinion] No hay fila en esta pasada (el aviso visible no se oculta solo)');
            return;
        }
        const nid = Number(row.id);
        if (_sessionOpinionBannerDismissedIds().has(String(nid))) {
            console.debug('[poll-banner-opinion] Pedido %s ya fue descartado en esta sesión', nid);
            return;
        }
        console.info('[poll-banner-opinion] ✓ Mostrando banner para pedido %s (estrellas: %s)', nid, row.opinion_cliente_estrellas);
        const fop = row.fecha_opinion_cliente;
        const opin = String(row.opinion_cliente || '').trim();
        const snip = opin.length > 140 ? `${opin.slice(0, 137)}…` : opin;
        const rawEst = row.opinion_cliente_estrellas;
        const estrellas = rawEst != null && rawEst !== '' ? Number(rawEst) : NaN;
        const tieneE = Number.isFinite(estrellas) && estrellas >= 1 && estrellas <= 5;
        const wTel = normalizarWhatsappInternacionalDesdeInput(row.telefono_contacto || '');
        const waOk = /^\+\d{8,22}$/.test(wTel);
        const btnHc = document.getElementById('admin-banner-opinion-hc');
        if (btnHc) {
            const baja = tieneE && estrellas <= 2;
            const apiOk = typeof puedeEnviarApiRestPedidos === 'function' && puedeEnviarApiRestPedidos();
            btnHc.style.display = baja && apiOk && waOk ? 'inline-flex' : 'none';
        }
        box.dataset.waTelE164 = waOk ? wTel : '';
        box.dataset.estrellasOpinion = tieneE ? String(estrellas) : '';
        const txt = document.getElementById('admin-banner-opinion-cliente-txt');
        if (txt) {
            const np = row.numero_pedido || nid;
            const tit = (row.tipo_trabajo || '').trim();
            const sfxStar = tieneE ? ` · ${estrellas}/5` : '';
            const avisoBaja =
                tieneE && estrellas <= 2
                    ? 'Calificación baja — conviene hablar con el cliente. '
                    : '';
            txt.textContent = `${avisoBaja}Observación del cliente${sfxStar} · #${np}${tit ? ` · ${tit}` : ''}${
                snip ? ` — «${snip}»` : ''
            }`;
        }
        box.style.display = 'flex';
        box.dataset.visible = '1';
        box.dataset.pedidoId = String(nid);
        if (fop) box.dataset.fechaOpinionIso = new Date(fop).toISOString();
    } catch (e) {
        console.error('[poll-banner-opinion] Error:', e?.message || e);
    }
}

function adminBannerOpinionClickWhatsapp() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    const w = (box?.dataset?.waTelE164 || '').trim();
    const pid = box?.dataset?.pedidoId;
    const est = box?.dataset?.estrellasOpinion || '';
    if (!w || !/^\+\d{8,22}$/.test(w)) {
        toast('No hay un WhatsApp de contacto válido para este pedido.', 'warning');
        return;
    }
    const msg = `Hola, te escribo desde ${String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim()} respecto de tu experiencia con el servicio${
        pid ? ` (pedido #${pid})` : ''
    }.${est ? ` Vimos la calificación ${est}/5 y queremos resolver cualquier inconveniente.` : ''}`;
    window.open(`https://wa.me/${w.slice(1)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
}
window.adminBannerOpinionClickWhatsapp = adminBannerOpinionClickWhatsapp;

async function adminBannerOpinionAbrirChatOperador() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    const pid = box?.dataset?.pedidoId;
    if (!pid) return;
    if (!puedeEnviarApiRestPedidos()) {
        toast('Sin API activa para abrir el chat operador.', 'warning');
        return;
    }
    await asegurarJwtApiRest();
    const tok = getApiToken();
    if (!tok) return;
    try {
        const r = await fetch(apiUrl(`/api/pedidos/${encodeURIComponent(String(pid))}/abrir-chat-calificacion-baja`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            toast(String(data.error || 'No se pudo abrir el chat operador'), 'error');
            return;
        }
        const sid = data.humanChatSessionId;
        if (sid != null) await abrirModalWhatsappHumanChat(Number(sid));
        else toast('Sesión de chat no disponible.', 'warning');
    } catch (e) {
        toastError('opinion-chat-operador', e);
    }
}
window.adminBannerOpinionAbrirChatOperador = adminBannerOpinionAbrirChatOperador;

function detenerPollBannerReclamoCliente() {
    if (_pollBannerAdminInterval) {
        clearInterval(_pollBannerAdminInterval);
        _pollBannerAdminInterval = null;
    }
    ocultarBannerReclamoCliente();
    clearTimeout(_gnMapaBloqueoBannerTimer);
    _gnMapaBloqueoBannerTimer = null;
    _gnMapaBloqueoBannerHastaMs = 0;
    ocultarBannerOpinionCliente();
}

function iniciarPollBannerReclamoCliente() {
    detenerPollBannerReclamoCliente();
    if (!esAdmin() || modoOffline || !NEON_OK) return;
    void (async () => {
        await iniciarWatermarkBannerReclamoCliente();
        await iniciarWatermarkBannerOpinionCliente();
        _pollBannerAdminInterval = setInterval(() => {
            void pollBannerNuevoReclamoCliente();
            void pollBannerOpinionCliente();
        }, 5000);
        void pollBannerNuevoReclamoCliente();
        void pollBannerOpinionCliente();
    })();
}

async function adminBannerAbrirPedidoNuevoUnaVez(_origen) {
    const box = document.getElementById('admin-banner-nuevo-cliente');
    const pid = box?.dataset?.pedidoId;
    if (!pid || box.dataset.visible !== '1') return;
    if (_adminBannerNuevoUltimoPidAbierto != null && String(_adminBannerNuevoUltimoPidAbierto) === String(pid)) return;
    const dm = document.getElementById('dm');
    if (dm?.classList.contains('active') && String(dm.dataset.detallePedidoId) === String(pid)) {
        ocultarBannerReclamoCliente();
        return;
    }
    ocultarBannerReclamoCliente();
    _adminBannerNuevoUltimoPidAbierto = String(pid);
    let p = app.p.find((x) => String(x.id) === String(pid));
    if (!p && _sql && NEON_OK) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(parseInt(pid, 10))} LIMIT 1`);
            const row = rr.rows?.[0];
            if (row) {
                p = norm(row);
                const ix = app.p.findIndex((x) => String(x.id) === String(p.id));
                if (ix >= 0) app.p[ix] = p;
                else app.p.unshift(p);
            }
        } catch (_) {}
    }
    if (p) void detalle(p);
    else {
        _adminBannerNuevoUltimoPidAbierto = null;
        toast('No se encontró el pedido. Probá actualizar la lista.', 'warning');
    }
}

async function adminBannerClickVerDetalle() {
    await adminBannerAbrirPedidoNuevoUnaVez('click');
}

async function adminBannerOpinionClickVerDetalle() {
    const box = document.getElementById('admin-banner-opinion-cliente');
    const pid = box?.dataset?.pedidoId;
    ocultarBannerOpinionCliente();
    if (!pid) return;
    let p = app.p.find((x) => String(x.id) === String(pid));
    if (!p && _sql && NEON_OK) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(parseInt(pid, 10))} LIMIT 1`);
            const row = rr.rows?.[0];
            if (row) {
                p = norm(row);
                const ix = app.p.findIndex((x) => String(x.id) === String(p.id));
                if (ix >= 0) app.p[ix] = p;
                else app.p.unshift(p);
            }
        } catch (_) {}
    }
    if (p) void detalle(p);
    else toast('No se encontró el pedido. Probá actualizar la lista.', 'warning');
}

window.adminBannerClickVerDetalle = adminBannerClickVerDetalle;
window.adminBannerCerrarSinDetalle = ocultarBannerReclamoCliente;
window.adminBannerOpinionClickVerDetalle = adminBannerOpinionClickVerDetalle;
window.adminBannerOpinionCerrar = ocultarBannerOpinionCliente;

/** Multi-línea en BD: excluye pedidos de otra línea activa (y NULL legacy solo en electricidad). */
function pedidoVisibleSegunLineaNegocio(p) {
    const line = lineaNegocioOperativaCodigo();
    const bt = String(p?.pbt || '').trim().toLowerCase();
    if (bt === 'electricidad' || bt === 'agua' || bt === 'municipio') return bt === line;
    if (!bt) return line === 'electricidad';
    return bt === line;
}

/** Mapa: oculta pedidos cuyo tipo pertenece claramente a otro rubro (catálogo distinto). */
function pedidoVisibleSegunRubro(p) {
    const rubro = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
    if (!rubro) return true;
    const tt = String(p?.tt || '').trim();
    if (!tt) return true;
    if (TIPOS_RECLAMO_LEGACY.includes(tt)) return true;
    const mis = TIPOS_RECLAMO_POR_RUBRO[rubro];
    if (mis && mis.includes(tt)) return true;
    for (const k of Object.keys(TIPOS_RECLAMO_POR_RUBRO)) {
        if (k !== rubro && (TIPOS_RECLAMO_POR_RUBRO[k] || []).includes(tt)) return false;
    }
    return true;
}

function pedidosVisiblesEnUI() {
    const mostrarDeriv = adminMuestraPedidosDerivadosFuera();
    return (app.p || []).filter((p) => {
        if (!pedidoVisibleSegunLineaNegocio(p)) return false;
        if (!pedidoVisibleSegunRubro(p)) return false;
        if (pedidoEsDerivadoFuera(p) && !mostrarDeriv) return false;
        return true;
    });
}

function configInicialIncompleta(cfg) {
    const nombre = String(cfg?.nombre || '').trim();
    const tipo = String(cfg?.tipo || '').trim();
    const lat = cfg?.lat_base ?? cfg?.latitud;
    const lng = cfg?.lng_base ?? cfg?.longitud;
    const latOk = lat != null && String(lat).trim() !== '' && Number.isFinite(Number(lat));
    const lngOk = lng != null && String(lng).trim() !== '' && Number.isFinite(Number(lng));
    // Logo es opcional en el formulario; exigirlo dejaba el wizard en bucle al pulsar Finalizar.
    return !nombre || !tipo || !latOk || !lngOk;
}
/** Admin debe pasar el wizard al menos una vez (flag en clientes.configuracion vía API). */
function setupWizardCompletadoEnApi(extra) {
    return extra && extra.setup_wizard_completado === true;
}
function debeMostrarSetupInicial(cfg, extra) {
    const completado = setupWizardCompletadoEnApi(extra);
    const incompleto = configInicialIncompleta(cfg);
    if (completado && !incompleto) return false;
    if (incompleto) return true;
    if (esAdmin() && !completado) return true;
    return false;
}
function actualizarStepWizard() {
    const lbl = document.getElementById('sw-step-label');
    if (lbl) lbl.textContent = `Paso ${_setupWizardStep} de 3`;
    [1,2,3].forEach(n => {
        document.getElementById(`sw-paso-${n}`)?.classList.toggle('active', n === _setupWizardStep);
    });
    document.getElementById('sw-prev').style.display = _setupWizardStep > 1 ? '' : 'none';
    document.getElementById('sw-next').style.display = _setupWizardStep < 3 ? '' : 'none';
    document.getElementById('cfgi-guardar').style.display = _setupWizardStep === 3 ? '' : 'none';
    if (_setupWizardStep === 3) {
        setTimeout(inicializarMapaSetupWizard, 20);
    }
    const hintBar = document.getElementById('cfgi-hint-bar');
    if (hintBar && esAdmin()) {
        hintBar.style.display = 'block';
        const manual = _setupWizardContextoManual
            ? 'Con la X cerrás solo esta ventana: no guarda lo que editaste ahora; lo ya guardado en el servidor no se borra. '
            : '';
        const perStep = {
            1: 'Paso 1: nombre y tipo (municipio vs cooperativa) adaptan textos y el catálogo NIS en toda la app.',
            2: 'Paso 2: logo opcional para encabezado e informes (URL o archivo).',
            3: 'Paso 3: ubicación base del tenant (oficina): usá el mapa o el pin. No se reemplaza sola por el GPS del dispositivo; opcionalmente tocá «Usar mi ubicación» si querés empezar desde ahí. «Finalizar» guarda en servidor.'
        };
        hintBar.textContent = manual + (perStep[_setupWizardStep] || '');
    } else if (hintBar) {
        hintBar.style.display = 'none';
    }
}
function inicializarMapaSetupWizard() {
    const el = document.getElementById('setup-map');
    const cfg = window.EMPRESA_CFG || {};
    const lb =
        cfg.lat_base != null && String(cfg.lat_base).trim() !== ''
            ? parseFloat(cfg.lat_base)
            : cfg.latitud != null && String(cfg.latitud).trim() !== ''
              ? parseFloat(cfg.latitud)
              : Number.NaN;
    const lbg =
        cfg.lng_base != null && String(cfg.lng_base).trim() !== ''
            ? parseFloat(cfg.lng_base)
            : cfg.longitud != null && String(cfg.longitud).trim() !== ''
              ? parseFloat(cfg.longitud)
              : Number.NaN;
    if (_setupLat == null && Number.isFinite(lb)) _setupLat = lb;
    if (_setupLng == null && Number.isFinite(lbg)) _setupLng = lbg;
    if (_setupLat == null || _setupLng == null || !Number.isFinite(_setupLat) || !Number.isFinite(_setupLng)) {
        _setupLat = -34.0;
        _setupLng = -64.0;
    }
    if (!el || typeof L === 'undefined') {
        const la = document.getElementById('cfgi-lat');
        const ln = document.getElementById('cfgi-lng');
        if (la) la.textContent = Number(_setupLat).toFixed(6);
        if (ln) ln.textContent = Number(_setupLng).toFixed(6);
        return;
    }
    if (!_setupMap) {
        _setupMap = L.map('setup-map', { zoomControl: true }).setView([_setupLat, _setupLng], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd'
        }).addTo(_setupMap);
        _setupMarker = L.marker([_setupLat, _setupLng], { draggable: true }).addTo(_setupMap);
        _setupMarker.on('dragend', () => {
            const p = _setupMarker.getLatLng();
            _setupLat = p.lat; _setupLng = p.lng;
            document.getElementById('cfgi-lat').textContent = _setupLat.toFixed(6);
            document.getElementById('cfgi-lng').textContent = _setupLng.toFixed(6);
        });
        _setupMap.on('click', (e) => {
            _setupLat = e.latlng.lat; _setupLng = e.latlng.lng;
            _setupMarker.setLatLng(e.latlng);
            document.getElementById('cfgi-lat').textContent = _setupLat.toFixed(6);
            document.getElementById('cfgi-lng').textContent = _setupLng.toFixed(6);
        });
    } else {
        _setupMap.invalidateSize();
        _setupMarker.setLatLng([_setupLat, _setupLng]);
        _setupMap.setView([_setupLat, _setupLng], _setupMap.getZoom() || 13);
    }
    document.getElementById('cfgi-lat').textContent = Number(_setupLat).toFixed(6);
    document.getElementById('cfgi-lng').textContent = Number(_setupLng).toFixed(6);
}
function usarUbicacionAutomaticaSetupWizard() {
    if (!navigator.geolocation) return;
    if (_setupGeoIntentado && _setupWizardStep !== 3) return;
    _setupGeoIntentado = true;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = Number(pos.coords.latitude);
            const lng = Number(pos.coords.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            _setupLat = lat;
            _setupLng = lng;
            inicializarMapaSetupWizard();
            if (_setupMap) _setupMap.setView([lat, lng], 15);
            if (_setupMarker) _setupMarker.setLatLng([lat, lng]);
            document.getElementById('cfgi-lat').textContent = lat.toFixed(6);
            document.getElementById('cfgi-lng').textContent = lng.toFixed(6);
            toast('Ubicación automática detectada', 'success');
        },
        () => {},
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 120000 }
    );
}
function aplicarEtiquetasPorTipo(tipo) {
    const esMunicipio = String(tipo || '').toLowerCase() === 'municipio';
    const etiqueta = esMunicipio ? 'Vecinos / NIS' : 'Socios / NIS';
    document.querySelectorAll('.admin-tab').forEach(tab => {
        if (tab?.getAttribute('onclick') === "adminTab('socios')") {
            tab.innerHTML = `<i class="fas fa-address-book"></i> ${etiqueta}`;
        }
        if (tab?.getAttribute('onclick') === "adminTab('distribuidores')") {
            const lbl = esMunicipio ? 'Barrios' : String(tipo || '').toLowerCase() === 'cooperativa_agua' ? 'Ramales' : 'Distribuidores';
            tab.innerHTML = `<i class="fas fa-network-wired"></i> ${lbl}`;
        }
    });
    const h3cat = document.getElementById('admin-socios-catalogo-titulo');
    if (h3cat) {
        h3cat.textContent = esMunicipio
            ? 'Catálogo de vecinos (NIS / medidor)'
            : 'Catálogo de socios (NIS / medidor)';
    }
    const hZona = document.getElementById('admin-zona-catalogo-titulo');
    if (hZona) {
        hZona.textContent = esMunicipio ? 'Barrios' : String(tipo || '').toLowerCase() === 'cooperativa_agua' ? 'Ramales' : 'Distribuidores';
    }
    const firma = document.getElementById('lbl-firma-cierre');
    if (firma) {
        firma.innerHTML = `<i class="fas fa-signature"></i> Firma del cliente / ${esMunicipio ? 'vecino' : 'socio'}`;
    }
    try { syncNisClienteReclamoConexionUI(); } catch (_) {}
    try { syncZonaPedidoFormLabels(); } catch (_) {}
    try { syncMapaFiltroTiposRebuild(); } catch (_) {}
}

function syncZonaPedidoFormLabels() {
    const di2 = document.getElementById('di2');
    const lb = document.getElementById('lbl-di2-zona') || di2?.closest('.fg')?.querySelector('label[for="di2"]');
    if (lb) lb.textContent = etiquetaZonaPedido();
    if (di2 && di2.options && di2.options[0]) {
        di2.options[0].textContent =
            esMunicipioRubro() || esCooperativaAguaRubro()
                ? '— Opcional —'
                : '— Elegir distribuidor (opcional si no hay NIS) —';
    }
    const trafoW = document.getElementById('trafo-pedido')?.closest('.fg');
    if (trafoW) trafoW.style.display = esCooperativaElectricaRubro() ? '' : 'none';
}
window.syncZonaPedidoFormLabels = syncZonaPedidoFormLabels;

function mostrarModalConfigInicial() {
    const modal = document.getElementById('modal-config-inicial');
    if (!modal) return;
    _configInicialBloqueante = true;
    const cfg = window.EMPRESA_CFG || {};
    const esAdm = esAdmin();
    document.getElementById('cfgi-nombre').value = cfg.nombre || '';
    document.getElementById('cfgi-tipo').value = cfg.tipo || '';
    document.getElementById('cfgi-logo-url').value = cfg.logo_url || '';
    document.getElementById('cfgi-tenant').textContent = 'tenant_id: ' + tenantIdActual();
    const msg = document.getElementById('cfgi-msg');
    msg.style.display = 'block';
    msg.textContent = esAdm
        ? 'Setup inicial (una vez): elegí tipo de negocio, nombre y ubicación base; al final tocá Finalizar. Si ya estaban cargados, revisalos y confirmá.'
        : 'Este tenant no está configurado. Pedí a un administrador completar el setup.';
    ['cfgi-nombre','cfgi-tipo','cfgi-logo-url','cfgi-logo-file'].forEach(id => {
        const el = document.getElementById(id); if (el) el.disabled = !esAdm;
    });
    document.getElementById('sw-prev').style.display = 'none';
    document.getElementById('sw-next').style.display = esAdm ? '' : 'none';
    document.getElementById('cfgi-logout').style.display = esAdm ? 'none' : '';
    const btnCerrar = document.getElementById('cfgi-btn-cerrar');
    if (btnCerrar) btnCerrar.style.display = (esAdm && _setupWizardContextoManual) ? '' : 'none';
    _setupWizardStep = 1;
    _setupGeoIntentado = false;
    actualizarStepWizard();
    modal.classList.add('active');
}
function ocultarModalConfigInicial() {
    const modal = document.getElementById('modal-config-inicial');
    if (!modal) return;
    modal.classList.remove('active');
    _configInicialBloqueante = false;
    _setupWizardContextoManual = false;
}

function cerrarWizardSetupVoluntario() {
    if (!_setupWizardContextoManual) {
        toast('Este setup es obligatorio la primera vez: usá «Salir» para cerrar sesión o completá los pasos con «Finalizar».', 'info');
        return;
    }
    ocultarModalConfigInicial();
    toast('Asistente cerrado. Podés volver a abrirlo con el botón de listado (arriba a la izquierda).', 'success');
}
window.cerrarWizardSetupVoluntario = cerrarWizardSetupVoluntario;
async function verificarConfiguracionInicialObligatoria() {
    const token = getApiToken();
    if (!token) {
        ocultarModalConfigInicial();
        return true;
    }
    let cfg = {};
    let extraParsed = {};
    let apiOk = false;
    const maxIntentos = 3;
    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                apiOk = true;
                const data = await resp.json();
                const cli = data?.cliente || {};
                let extra = cli?.configuracion || {};
                if (typeof extra === 'string') {
                    try {
                        extra = JSON.parse(extra);
                    } catch (_) {
                        extra = {};
                    }
                }
                extraParsed = extra && typeof extra === 'object' ? extra : {};
                try {
                    aplicarConfiguracionJsonClienteEnEmpresaCfg(extraParsed);
                } catch (_) {}
                const nombreTrim = String(cli.nombre || '').trim();
                const lbApi =
                    extraParsed.lat_base != null && String(extraParsed.lat_base).trim() !== ''
                        ? String(extraParsed.lat_base).trim()
                        : '';
                const lbgApi =
                    extraParsed.lng_base != null && String(extraParsed.lng_base).trim() !== ''
                        ? String(extraParsed.lng_base).trim()
                        : '';
                const ec = window.EMPRESA_CFG || {};
                cfg = {
                    nombre: nombreTrim,
                    tipo: String(cli.tipo ?? '').trim(),
                    ...(extraParsed.logo_url ? { logo_url: extraParsed.logo_url } : {}),
                    lat_base: lbApi || (ec.lat_base != null && String(ec.lat_base).trim() !== '' ? String(ec.lat_base).trim() : ''),
                    lng_base: lbgApi || (ec.lng_base != null && String(ec.lng_base).trim() !== '' ? String(ec.lng_base).trim() : '')
                };
                window.__PMG_TENANT_BRANDING__ = {
                    setup_wizard_completado: !!extraParsed.setup_wizard_completado,
                    marca_publicada_admin: !!extraParsed.marca_publicada_admin || nombreTrim.length > 0,
                    nombre_cliente: nombreTrim,
                    logo_url: String(extraParsed.logo_url || '').trim(),
                    tipo: String(cli.tipo ?? '').trim(),
                    from_local_cache: false
                };
                try {
                    window.__PMG_MI_CFG_FETCH_FAIL = false;
                } catch (_) {}
                break;
            }
        } catch (_) {}
        if (intento < maxIntentos) await new Promise((r) => setTimeout(r, 400 * intento));
    }
    if (!apiOk) {
        console.warn('[setup] /api/clientes/mi-configuracion no disponible tras reintentos');
        try {
            window.__PMG_MI_CFG_FETCH_FAIL = true;
        } catch (_) {}
        toast(
            'No se pudo leer la configuración del tenant (red o servidor). Reintentá o recargá la página; el asistente inicial puede no reflejar el estado real.',
            'warning'
        );
        hydrateBrandingForPublicScreen();
        try {
            aplicarMarcaVisualCompleta();
        } catch (_) {}
        ocultarModalConfigInicial();
        return true;
    }
    // Admin: obligatorio completar/confirmar el wizard una vez (setup_wizard_completado en API).
    // Datos incompletos: cualquier rol con modal (no admin no puede guardar).
    if (debeMostrarSetupInicial(cfg, extraParsed)) {
        _setupWizardContextoManual = false;
        window.EMPRESA_CFG = { ...cfg };
        poblarSelectTiposReclamo();
        mostrarModalConfigInicial();
        return false;
    }
    window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), ...cfg };
    poblarSelectTiposReclamo();
    ocultarModalConfigInicial();
    syncEmpresaCfgNombreLogoDesdeMarca();
    aplicarMarcaVisualCompleta();
    aplicarEtiquetasPorTipo(cfg.tipo || '');
    poblarSelectTiposReclamo();
    try {
        persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
    } catch (_) {}
    return true;
}
function setupWizardNext() {
    if (_setupWizardStep === 1) {
        if (!(document.getElementById('cfgi-nombre').value || '').trim()) return toast('Ingresá nombre', 'error');
        if (!(document.getElementById('cfgi-tipo').value || '').trim()) return toast('Elegí tipo', 'error');
    }
    if (_setupWizardStep < 3) _setupWizardStep++;
    actualizarStepWizard();
}
function setupWizardPrev() {
    if (_setupWizardStep > 1) _setupWizardStep--;
    actualizarStepWizard();
}
function aplicarBrandingDesdeConfig() {
    syncEmpresaCfgNombreLogoDesdeMarca();
    aplicarMarcaVisualCompleta();
}
function initSetupWizardBindings() {
    const inputUrl = document.getElementById('cfgi-logo-url');
    const inputFile = document.getElementById('cfgi-logo-file');
    const prev = document.getElementById('cfgi-logo-preview');
    if (inputUrl) {
        inputUrl.addEventListener('input', () => {
            const v = inputUrl.value.trim();
            if (!prev) return;
            if (!v) { prev.style.display = 'none'; return; }
            prev.src = v;
            prev.style.display = '';
        });
    }
    if (inputFile) {
        inputFile.addEventListener('change', async () => {
            const f = inputFile.files && inputFile.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
                _setupLogoDataUrl = String(reader.result || '');
                if (prev && _setupLogoDataUrl) {
                    prev.src = _setupLogoDataUrl;
                    prev.style.display = '';
                }
            };
            reader.readAsDataURL(f);
        });
    }
}
async function guardarConfiguracionInicialObligatoria() {
    if (!esAdmin()) {
        toast('Solo un administrador puede completar el setup.', 'error');
        return;
    }
    const nombre = (document.getElementById('cfgi-nombre')?.value || '').trim();
    const tipo = (document.getElementById('cfgi-tipo')?.value || '').trim();
    const logoUrlInput = (document.getElementById('cfgi-logo-url')?.value || '').trim();
    const logoUrl = _setupLogoDataUrl || logoUrlInput || '';
    if (!nombre || !tipo) return toast('Completá nombre y tipo', 'error');
    if (_setupLat == null || _setupLng == null) return toast('Marcá la ubicación base en el mapa', 'error');
    try {
        const token = getApiToken();
        if (!token) {
            toast('Sesión API no disponible. Cerrá sesión e ingresá nuevamente con internet.', 'error');
            return;
        }
        let provExtra = {};
        try {
            const pv = await nominatimReverseProvinciaArgentina(_setupLat, _setupLng);
            if (pv) provExtra = { provincia: pv, state: pv, provincia_nominatim: pv };
        } catch (_) {}
        const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                nombre,
                tipo,
                logo_url: logoUrl,
                latitud: _setupLat,
                longitud: _setupLng,
                configuracion: { setup_wizard_completado: true, marca_publicada_admin: true, ...provExtra }
            })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }
        window.__PMG_TENANT_BRANDING__ = {
            setup_wizard_completado: true,
            marca_publicada_admin: true,
            nombre_cliente: nombre,
            logo_url: String(logoUrl || '').trim(),
            tipo,
            from_local_cache: false
        };
        // Reflejo local en caliente para no reiniciar.
        window.EMPRESA_CFG = {
            ...(window.EMPRESA_CFG || {}),
            nombre,
            tipo,
            subtitulo: GN_SUBTITULO_FIJO,
            logo_url: logoUrl,
            lat_base: String(_setupLat),
            lng_base: String(_setupLng),
            ...(provExtra.provincia ? { ...provExtra } : {})
        };
        if (NEON_OK && _sql) {
            try {
                const pairs = [
                    ['nombre', nombre],
                    ['tipo', tipo],
                    ['empresa_identidad_bloqueada', '1'],
                ];
                pairs.push(['subtitulo', GN_SUBTITULO_FIJO]);
                for (const [k, v] of pairs) {
                    await sqlSimple(`INSERT INTO empresa_config(clave, valor) VALUES(${esc(k)}, ${esc(v)})
                        ON CONFLICT(clave) DO UPDATE SET valor = ${esc(v)}, actualizado = NOW()`);
                }
            } catch (e) {
                console.warn('[wizard] empresa_config identidad', e);
            }
        }
        try {
            persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
        } catch (_) {}
        poblarSelectTiposReclamo();
        await cargarConfigEmpresa();
        const ok = await verificarConfiguracionInicialObligatoria();
        if (ok) {
            toast('Setup inicial completado', 'success');
            // El login ya había salido antes de completar el wizard (cfgLista === false),
            // así que nunca se llegó a cargarPedidos() en entrarConUsuario.
            if (!modoOffline && NEON_OK && app.u && typeof cargarPedidos === 'function') {
                try { await cargarPedidos(); } catch (_) {}
            }
        }
    } catch (e) {
        const m = String(e?.message || '');
        logErrorWeb('setup-wizard-guardar', e);
        if (m.includes('Failed to fetch') || m.includes('CORS') || m.includes('503')) {
            toast('Error de conexión con API (CORS/Render). Revisá API_BASE_URL y CORS en backend.', 'error');
        } else {
            toast(mensajeErrorUsuario(e), 'error');
        }
    }
}
window.guardarConfiguracionInicialObligatoria = guardarConfiguracionInicialObligatoria;
window.setupWizardNext = setupWizardNext;
window.setupWizardPrev = setupWizardPrev;
window.usarUbicacionAutomaticaSetupWizard = usarUbicacionAutomaticaSetupWizard;

// ── ALARMA PEDIDOS URGENTES ──────────────────────────────────
let _audioCtx = null;

function tocarAlarma() {
    try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.frequency.setValueAtTime(880, _audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, _audioCtx.currentTime + 0.15);
        osc.frequency.setValueAtTime(880, _audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.5);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 0.5);
    } catch(_) {}
}

function mostrarAlertaPedidoUrgente(pedido) {
    // Solo al admin
    if (!esAdmin()) return;
    if (!['Crítica','Alta'].includes(pedido.pr)) return;

    tocarAlarma();

    const pid = String(pedido.id);
    const deEsc = String(pedido.de || '').replace(/</g, '&lt;');
    const snip = deEsc.length > 72 ? deEsc.substring(0, 72) + '…' : deEsc;

    const alerta = document.createElement('div');
    alerta.style.cssText = `
        position:fixed;top:1rem;left:50%;transform:translateX(-50%);
        background:${pedido.pr === 'Crítica' ? '#dc2626' : '#f97316'};
        color:white;padding:1rem 1.5rem;border-radius:.75rem;
        z-index:9999;max-width:min(92vw,520px);box-shadow:0 8px 25px rgba(0,0,0,.3);
        animation:alertaIn .3s ease;font-weight:600;display:flex;gap:.75rem;align-items:flex-start;
        cursor:pointer
    `;
    alerta.setAttribute('role', 'button');
    alerta.setAttribute('tabindex', '0');
    alerta.title = 'Tocá para abrir el detalle del reclamo';
    alerta.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="font-size:1.4rem;flex-shrink:0;margin-top:.1rem"></i>
        <div style="flex:1;min-width:0">
            <div style="font-size:1rem">⚠️ Pedido ${pedido.pr.toUpperCase()}</div>
            <div style="font-size:.85rem;opacity:.95">#${pedido.np} — ${String(pedido.tt || 'Sin tipo').replace(/</g, '&lt;')}</div>
            <div style="font-size:.78rem;opacity:.88;line-height:1.35;margin-top:.25rem">${snip || '—'}</div>
            <div style="font-size:.72rem;opacity:.75;margin-top:.35rem">Tocá para ver el detalle</div>
        </div>
        <button type="button" class="gn-alerta-urgente-cerrar" aria-label="Cerrar" style="background:rgba(255,255,255,.2);border:none;color:white;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:1rem;flex-shrink:0">✕</button>
    `;
    const cerrar = (ev) => {
        ev.stopPropagation();
        try { alerta.remove(); } catch (_) {}
    };
    alerta.querySelector('.gn-alerta-urgente-cerrar')?.addEventListener('click', cerrar);

    const abrir = async () => {
        try { alerta.remove(); } catch (_) {}
        await cargarPedidos({ silent: true });
        const p = app.p.find(x => String(x.id) === pid);
        if (p) {
            app.tab = 'c';
            document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === app.tab));
            render();
            void detalle(p);
        } else {
            toast('Actualizá la lista — pedido no encontrado en caché', 'info');
        }
    };
    alerta.addEventListener('click', abrir);
    alerta.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            abrir();
        }
    });
    document.body.appendChild(alerta);
    setTimeout(() => { if (alerta.parentElement) alerta.remove(); }, 45000);
}



// ================================================================
//  FUNCIONES DEL PANEL ADMIN
// ================================================================

// ── Carga de config.json desde GitHub ────────────────────────
let APP_CONFIG = null;
async function cargarAppConfig() {
    const esAndroidApp = window.location.protocol === 'file:' || /GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent);
    if (esAndroidApp && window.AndroidConfig && typeof window.AndroidConfig.getConfigJson === 'function') {
        try {
            const raw = window.AndroidConfig.getConfigJson();
            if (raw && raw.trim()) {
                APP_CONFIG = JSON.parse(raw);
                window.APP_CONFIG = APP_CONFIG;
                console.log('[config] cargado OK desde AndroidConfig bridge');
                return true;
            }
        } catch (e) {
            console.warn('[config] fallo bridge AndroidConfig:', e && e.message ? e.message : e);
        }
    }
    const rutas = esAndroidApp
        ? ['./config.json', 'config.json', 'file:///android_asset/config.json']
        : ['./config.json?' + Date.now()];
    let ultimoError = '';
    for (const ruta of rutas) {
        try {
            const resp = await fetch(ruta, { cache: 'no-store' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            APP_CONFIG = await resp.json();
            window.APP_CONFIG = APP_CONFIG;
            console.log('[config] cargado OK desde', ruta);
            return true;
        } catch (e) {
            ultimoError = e && e.message ? e.message : String(e);
            console.warn('[config] fallo en', ruta, ultimoError);
        }
    }
    console.error('[config] ERROR al cargar config.json:', ultimoError);
    const dbs2 = document.getElementById('dbs');
    if (dbs2) {
        dbs2.className = 'dbs er';
        dbs2.innerHTML = esAndroidApp
            ? '<i class="fas fa-exclamation-circle"></i> Error: no se pudo leer assets/config.json'
            : '<i class="fas fa-exclamation-circle"></i> Error: no se encontró config.json en el repositorio';
    }
    return false;
}

// ── Admin tab switcher ────────────────────────────────────────
const _ADMIN_TAB_ORDER = ['empresa','usuarios','distribuidores','socios','estadisticas','kpi','mapa-usuarios','contrasena'];
let _kpiSnapshotsTablaCache = null;
async function adminKpiSnapshotsTablaExiste(refrescar) {
    if (!refrescar && _kpiSnapshotsTablaCache !== null) return _kpiSnapshotsTablaCache;
    if (!_sql || modoOffline || !NEON_OK) {
        _kpiSnapshotsTablaCache = false;
        return false;
    }
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kpi_snapshots' LIMIT 1`
        );
        _kpiSnapshotsTablaCache = (r.rows || []).length > 0;
    } catch (_) {
        _kpiSnapshotsTablaCache = false;
    }
    return _kpiSnapshotsTablaCache;
}

/** Presets del formulario admin KPI (texto amigable → clave estable en BD). */
const KPI_ADMIN_PRESET_META = {
    '': { metrica: '', detail: 'none', unidad: '', hint: '', valorAyuda: '' },
    pct_cierres_con_foto: {
        metrica: 'pct_cierres_con_foto',
        detail: 'cierres_foto',
        unidad: 'porcentaje',
        hint: 'Qué parte de los cierres del periodo tuvieron al menos una foto de cierre.',
        valorAyuda:
            'Completá fechas y tocá «Calcular desde datos del sistema», o cargá «con foto» / «total» y el % se calcula solo.',
    },
    reclamos_cerrados: {
        metrica: 'reclamos_cerrados_count',
        detail: 'conteo',
        conteoLabel: '¿Cuántos reclamos se cerraron en estas fechas?',
        jsonKey: 'cerrados',
        unidad: 'cantidad',
        hint: 'Pedidos con estado Cerrado cuya fecha de cierre cae en el periodo (este tenant).',
        valorAyuda: 'Podés usar «Calcular desde datos del sistema» con las fechas, o escribir el número a mano.',
    },
    reclamos_recibidos: {
        metrica: 'reclamos_recibidos_count',
        detail: 'conteo',
        conteoLabel: '¿Cuántos reclamos nuevos entraron en el periodo?',
        jsonKey: 'recibidos',
        unidad: 'cantidad',
        hint: 'Pedidos nuevos según fecha de creación en el rango (este tenant).',
        valorAyuda: '«Calcular desde datos del sistema» cuenta por fecha_creacion, o cargá el número a mano.',
    },
    tiempo_respuesta_horas: {
        metrica: 'tiempo_respuesta_medio_horas',
        detail: 'none',
        unidad: 'horas',
        hint: 'Promedio de horas desde la creación del pedido hasta la primera asignación (fecha_asignacion), solo cierres del periodo.',
        valorAyuda: '«Calcular desde datos del sistema» usa pedidos cerrados con asignación registrada.',
    },
    satisfaccion_pct: {
        metrica: 'satisfaccion_pct',
        detail: 'satisfaccion_wa',
        unidad: 'porcentaje',
        hint: 'Tras el cierre por WhatsApp el cliente califica 1–5 y puede dejar comentario. El % equivale al promedio de estrellas sobre 5 (ej. 4 estrellas → 80%).',
        valorAyuda:
            'Con «Calcular desde datos del sistema» se usan opinion_cliente_estrellas en el rango de fecha_opinion_cliente.',
    },
    avance_medio: {
        metrica: 'avance_medio_pct',
        detail: 'none',
        unidad: 'porcentaje',
        hint: 'Promedio del campo avance (%) en pedidos cerrados en el periodo.',
        valorAyuda: 'Se puede calcular automáticamente desde Neon con el botón de abajo.',
    },
    avanzado: {
        metrica: '',
        detail: 'advanced',
        unidad: '',
        hint: 'Para una clave nueva o datos extra en JSON. El resto del equipo puede usar las opciones de arriba.',
        valorAyuda: '',
    },
};

const KPI_METRICA_ETIQUETAS = {
    pct_cierres_con_foto: '% cierres con foto',
    reclamos_cerrados_count: 'Reclamos cerrados',
    reclamos_recibidos_count: 'Reclamos recibidos',
    tiempo_respuesta_medio_horas: 'Tiempo medio respuesta (h)',
    satisfaccion_pct: 'Satisfacción (WA 1–5★ → %)',
    avance_medio_pct: 'Avance medio trabajos',
};

function normalizarUnidadKpiParaGuardar(raw) {
    const s = String(raw || '').trim();
    const leg = { percent: 'porcentaje', hours: 'horas', count: 'cantidad', ratio: 'proporción', days: 'días' };
    return leg[s] || s;
}

function formatearUnidadKpiVista(u) {
    const s = String(u || '').trim();
    if (!s) return '—';
    const leg = { percent: 'porcentaje', hours: 'horas', count: 'cantidad', ratio: 'proporción', days: 'días' };
    return leg[s] || s;
}

function fmtFechaKpiSnapshotCorta(val) {
    const s = String(val || '').trim();
    if (!s) return '—';
    const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-AR');
}

function aplicarKpiUnidadCustomToggleAdmin() {
    const sel = document.getElementById('kpi-unidad');
    const c = document.getElementById('kpi-unidad-custom');
    if (!c || !sel) return;
    c.style.display = sel.value === '__custom' ? 'block' : 'none';
}
window.aplicarKpiUnidadCustomToggleAdmin = aplicarKpiUnidadCustomToggleAdmin;

function syncKpiMetricaAvanzadaAdmin() {
    const v = document.getElementById('kpi-metrica-visible');
    const h = document.getElementById('kpi-metrica');
    if (v && h) h.value = v.value;
}
window.syncKpiMetricaAvanzadaAdmin = syncKpiMetricaAvanzadaAdmin;

function kpiAdminRellenarValorDesdeCierresFoto() {
    const cf = parseInt(document.getElementById('kpi-det-con-foto')?.value, 10);
    const tot = parseInt(document.getElementById('kpi-det-total-cierres')?.value, 10);
    const valEl = document.getElementById('kpi-valor');
    if (!valEl || !Number.isFinite(cf) || !Number.isFinite(tot) || tot <= 0) return;
    if (cf > tot) return;
    const pct = Math.round((cf / tot) * 10000) / 100;
    valEl.value = String(pct);
}
window.kpiAdminRellenarValorDesdeCierresFoto = kpiAdminRellenarValorDesdeCierresFoto;

function aplicarKpiPresetAdmin() {
    const sel = document.getElementById('kpi-preset');
    const preset = sel?.value || '';
    const meta = KPI_ADMIN_PRESET_META[preset] || KPI_ADMIN_PRESET_META[''];
    const ayuda = document.getElementById('kpi-preset-ayuda');
    const ayudaValor = document.getElementById('kpi-valor-ayuda');
    const wrapAdvMet = document.getElementById('kpi-wrap-metrica-avanzada');
    const wrapCierres = document.getElementById('kpi-detail-cierres-foto');
    const wrapConteo = document.getElementById('kpi-detail-conteo-wrap');
    const wrapJsonAdv = document.getElementById('kpi-json-advanced-wrap');
    const hiddenM = document.getElementById('kpi-metrica');
    const unidadSel = document.getElementById('kpi-unidad');
    if (ayuda) {
        ayuda.textContent = meta.hint || '';
        ayuda.style.display = meta.hint ? 'block' : 'none';
    }
    if (ayudaValor) {
        ayudaValor.textContent = meta.valorAyuda || '';
        ayudaValor.style.display = meta.valorAyuda ? 'block' : 'none';
    }
    if (wrapCierres) wrapCierres.style.display = meta.detail === 'cierres_foto' ? 'block' : 'none';
    if (wrapConteo) {
        wrapConteo.style.display = meta.detail === 'conteo' ? 'block' : 'none';
        const lbl = document.getElementById('kpi-det-conteo-label');
        if (lbl && meta.conteoLabel) lbl.textContent = meta.conteoLabel;
    }
    if (wrapAdvMet) wrapAdvMet.style.display = preset === 'avanzado' ? 'block' : 'none';
    if (wrapJsonAdv) wrapJsonAdv.style.display = preset === 'avanzado' ? 'block' : 'none';
    const wrapSatWa = document.getElementById('kpi-detail-satisfaccion-wa');
    if (wrapSatWa) wrapSatWa.style.display = meta.detail === 'satisfaccion_wa' ? 'block' : 'none';
    const wrapNeonCalc = document.getElementById('kpi-neon-calc-wrap');
    if (wrapNeonCalc) {
        const calcPresets = new Set([
            'pct_cierres_con_foto',
            'reclamos_cerrados',
            'reclamos_recibidos',
            'tiempo_respuesta_horas',
            'satisfaccion_pct',
            'avance_medio',
        ]);
        wrapNeonCalc.style.display = calcPresets.has(preset) ? 'block' : 'none';
    }
    const visMet = document.getElementById('kpi-metrica-visible');
    if (preset === 'avanzado') {
        if (hiddenM) hiddenM.value = (visMet?.value || '').trim();
    } else {
        if (hiddenM) hiddenM.value = meta.metrica || '';
        if (visMet) visMet.value = '';
    }
    if (preset !== 'avanzado') {
        const ta = document.getElementById('kpi-json');
        if (ta) ta.value = '';
    }
    if (unidadSel) {
        if (meta.unidad) unidadSel.value = meta.unidad;
        else if (!preset) unidadSel.value = '';
        aplicarKpiUnidadCustomToggleAdmin();
    }
}
window.aplicarKpiPresetAdmin = aplicarKpiPresetAdmin;

/** Rellena valor (y detalles) desde agregados en Neon para el preset y fechas actuales. */
window.kpiAdminRellenarDesdeNeon = async function kpiAdminRellenarDesdeNeon() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) {
        toast('Sin conexión o sin permisos.', 'error');
        return;
    }
    const preset = (document.getElementById('kpi-preset')?.value || '').trim();
    if (!preset || preset === 'avanzado') {
        toast('Elegí un tipo de indicador (no «avanzado»).', 'warning');
        return;
    }
    const desde = (document.getElementById('kpi-desde')?.value || '').trim();
    const hasta = (document.getElementById('kpi-hasta')?.value || '').trim();
    if (!desde || !hasta) {
        toast('Completá periodo desde y hasta.', 'warning');
        return;
    }
    if (desde > hasta) {
        toast('«Desde» no puede ser posterior a «Hasta».', 'warning');
        return;
    }
    const tsql = await pedidosFiltroTenantSql();
    const fu = document.getElementById('kpi-fuente');
    if (fu) fu.value = 'computed_batch';
    const round2 = (x) => Math.round(Number(x) * 100) / 100;
    try {
        if (preset === 'pct_cierres_con_foto') {
            const r = await sqlSimple(
                `SELECT
                  COUNT(*) FILTER (WHERE foto_cierre IS NOT NULL AND length(trim(COALESCE(foto_cierre,''))) > 0)::int AS cf,
                  COUNT(*)::int AS tot
                 FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL
                 AND fecha_cierre::date >= ${esc(desde)}::date AND fecha_cierre::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            const row = r.rows?.[0];
            const tot = parseInt(row?.tot, 10);
            const cf = parseInt(row?.cf, 10);
            if (!Number.isFinite(tot) || tot <= 0) {
                toast('No hay cierres en ese periodo para calcular.', 'warning');
                return;
            }
            const elCf = document.getElementById('kpi-det-con-foto');
            const elTot = document.getElementById('kpi-det-total-cierres');
            if (elCf) elCf.value = String(cf);
            if (elTot) elTot.value = String(tot);
            kpiAdminRellenarValorDesdeCierresFoto();
            toast('Porcentaje calculado desde cierres con foto.', 'success');
            return;
        }
        if (preset === 'reclamos_cerrados') {
            const r = await sqlSimple(
                `SELECT COUNT(*)::int AS n FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL
                 AND fecha_cierre::date >= ${esc(desde)}::date AND fecha_cierre::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            const n = parseInt(r.rows?.[0]?.n, 10);
            if (!Number.isFinite(n)) {
                toast('No se pudo calcular.', 'error');
                return;
            }
            const el = document.getElementById('kpi-det-conteo');
            if (el) el.value = String(n);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(n);
            toast(`Cerrados en periodo: ${n}`, 'success');
            return;
        }
        if (preset === 'reclamos_recibidos') {
            const r = await sqlSimple(
                `SELECT COUNT(*)::int AS n FROM pedidos WHERE fecha_creacion::date >= ${esc(desde)}::date
                 AND fecha_creacion::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            const n = parseInt(r.rows?.[0]?.n, 10);
            if (!Number.isFinite(n)) {
                toast('No se pudo calcular.', 'error');
                return;
            }
            const el = document.getElementById('kpi-det-conteo');
            if (el) el.value = String(n);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(n);
            toast(`Recibidos (nuevos) en periodo: ${n}`, 'success');
            return;
        }
        if (preset === 'tiempo_respuesta_horas') {
            const r = await sqlSimple(
                `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (fecha_asignacion - fecha_creacion)) / 3600.0), 0) AS h
                 FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL
                 AND fecha_cierre::date >= ${esc(desde)}::date AND fecha_cierre::date <= ${esc(hasta)}::date
                 AND fecha_asignacion IS NOT NULL AND fecha_creacion IS NOT NULL
                 ${tsql}`
            );
            let h = Number(r.rows?.[0]?.h);
            if (!Number.isFinite(h) || h <= 0) {
                toast('No hay pedidos con asignación en ese periodo para promediar.', 'warning');
                return;
            }
            h = round2(h);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(h).replace('.', ',');
            toast(`Tiempo medio hasta asignación: ${h} h`, 'success');
            return;
        }
        if (preset === 'satisfaccion_pct') {
            const chk = await sqlSimple(
                `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos'
                 AND column_name = 'opinion_cliente_estrellas' LIMIT 1`
            );
            if (!chk.rows?.length) {
                toast('Falta la columna opinion_cliente_estrellas (actualizá la app o ejecutá migración en Neon).', 'warning');
                return;
            }
            const r = await sqlSimple(
                `SELECT COUNT(*)::int AS n, AVG(opinion_cliente_estrellas::double precision) AS prom
                 FROM pedidos WHERE opinion_cliente_estrellas IS NOT NULL
                 AND fecha_opinion_cliente IS NOT NULL
                 AND fecha_opinion_cliente::date >= ${esc(desde)}::date AND fecha_opinion_cliente::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            const n = parseInt(r.rows?.[0]?.n, 10);
            const prom = Number(r.rows?.[0]?.prom);
            if (!Number.isFinite(n) || n < 1 || !Number.isFinite(prom)) {
                toast('No hay valoraciones WhatsApp en ese periodo.', 'warning');
                return;
            }
            const pct = round2((prom / 5) * 100);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(pct).replace('.', ',');
            const j = document.getElementById('kpi-json');
            if (j)
                j.value = JSON.stringify(
                    {
                        n_respuestas: n,
                        promedio_estrellas: round2(prom),
                        fuente_calculo: 'whatsapp_estrellas_1_a_5',
                    },
                    null,
                    0
                );
            toast(`Satisfacción ≈ ${pct}% (${n} resp., promedio ${round2(prom)}★)`, 'success');
            return;
        }
        if (preset === 'avance_medio') {
            const r = await sqlSimple(
                `SELECT COALESCE(AVG(avance::double precision), 0) AS m
                 FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL
                 AND fecha_cierre::date >= ${esc(desde)}::date AND fecha_cierre::date <= ${esc(hasta)}::date
                 ${tsql}`
            );
            let m = Number(r.rows?.[0]?.m);
            if (!Number.isFinite(m) || m <= 0) {
                toast('No hay cierres con avance en ese periodo.', 'warning');
                return;
            }
            m = round2(m);
            const v = document.getElementById('kpi-valor');
            if (v) v.value = String(m).replace('.', ',');
            toast(`Avance medio en cierres: ${m}%`, 'success');
            return;
        }
    } catch (e) {
        toastError('kpi-calc-neon', e);
    }
};

function leerUnidadKpiAdmin() {
    const sel = document.getElementById('kpi-unidad');
    const v = (sel?.value || '').trim();
    if (v === '__custom') return (document.getElementById('kpi-unidad-custom')?.value || '').trim().slice(0, 32);
    return v;
}

function limpiarFormKpiSnapshotAdmin() {
    const ids = [
        'kpi-metrica',
        'kpi-metrica-visible',
        'kpi-desde',
        'kpi-hasta',
        'kpi-valor',
        'kpi-notas',
        'kpi-json',
        'kpi-det-con-foto',
        'kpi-det-total-cierres',
        'kpi-det-conteo',
        'kpi-unidad-custom',
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const preset = document.getElementById('kpi-preset');
    if (preset) preset.value = '';
    const unidad = document.getElementById('kpi-unidad');
    if (unidad) unidad.value = '';
    aplicarKpiPresetAdmin();
    const fu = document.getElementById('kpi-fuente');
    if (fu) fu.value = 'manual';
}
window.limpiarFormKpiSnapshotAdmin = limpiarFormKpiSnapshotAdmin;

function populateKpiChartMetricaSelect(rows) {
    const sel = document.getElementById('kpi-chart-metrica');
    const wrap = document.getElementById('kpi-chart-wrap');
    if (!sel) return;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— Elegí métrica para el gráfico —';
    sel.appendChild(opt0);
    const keys = [...new Set((rows || []).map(r => r.metrica).filter(Boolean))].sort();
    keys.forEach(m => {
        const o = document.createElement('option');
        o.value = m;
        o.textContent = KPI_METRICA_ETIQUETAS[m] || m;
        sel.appendChild(o);
    });
    if (wrap && (!keys.length || (rows || []).length < 2)) wrap.style.display = 'none';
    for (let i = 1; i < sel.options.length; i++) {
        const m = sel.options[i].value;
        const n = (rows || []).filter(
            r => r.metrica === m && r.valor_numero != null && r.valor_numero !== '' && !Number.isNaN(Number(r.valor_numero))
        ).length;
        if (n >= 2) {
            sel.value = m;
            break;
        }
    }
}

/** Evolución por periodo (misma métrica, varios registros). Requiere Chart.js. */
window.renderKpiAdminHistoricoChart = function renderKpiAdminHistoricoChart() {
    const wrap = document.getElementById('kpi-chart-wrap');
    const sel = document.getElementById('kpi-chart-metrica');
    const canvas = document.getElementById('chart-kpi-admin');
    if (!wrap || !sel || !canvas || typeof Chart === 'undefined') {
        if (wrap) wrap.style.display = 'none';
        return;
    }
    const rows = window.__kpiAdminLastRows || [];
    const metrica = sel.value;
    if (!metrica || rows.length === 0) {
        wrap.style.display = 'none';
        if (window._chartKpiAdmin) {
            try {
                window._chartKpiAdmin.destroy();
            } catch (_) {}
            window._chartKpiAdmin = null;
        }
        return;
    }
    const points = rows
        .filter(
            r =>
                r.metrica === metrica &&
                r.valor_numero != null &&
                r.valor_numero !== '' &&
                !Number.isNaN(Number(r.valor_numero))
        )
        .map(r => ({
            label: String(r.periodo_fin || r.periodo_inicio || ''),
            y: Number(r.valor_numero),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    if (points.length < 2) {
        wrap.style.display = 'none';
        if (window._chartKpiAdmin) {
            try {
                window._chartKpiAdmin.destroy();
            } catch (_) {}
            window._chartKpiAdmin = null;
        }
        return;
    }
    wrap.style.display = 'block';
    const ctx = canvas.getContext('2d');
    if (window._chartKpiAdmin) {
        try {
            window._chartKpiAdmin.destroy();
        } catch (_) {}
        window._chartKpiAdmin = null;
    }
    const lab = KPI_METRICA_ETIQUETAS[metrica] || metrica;
    const kpiSoftLine = { border: '#5b7cba', fill: 'rgba(91, 124, 186, 0.12)' };
    const shortLabel = (s) => {
        const t = String(s || '').trim();
        if (!t) return '';
        const d = new Date(t);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' });
        }
        return t.length > 22 ? `${t.slice(0, 20)}…` : t;
    };
    window._chartKpiAdmin = new Chart(ctx, {
        type: 'line',
        data: {
            labels: points.map(p => shortLabel(p.label)),
            datasets: [
                {
                    label: lab,
                    data: points.map(p => p.y),
                    borderColor: kpiSoftLine.border,
                    backgroundColor: kpiSoftLine.fill,
                    tension: 0.25,
                    fill: true,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: kpiSoftLine.border,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.55,
            layout: { padding: { bottom: 8, top: 4 } },
            plugins: {
                legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } },
            },
            scales: {
                y: { beginAtZero: false, ticks: { font: { size: 10 } } },
                x: {
                    ticks: {
                        font: { size: 9 },
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10,
                    },
                },
            },
        },
    });
};

async function cargarKpiSnapshotsAdmin() {
    const host = document.getElementById('kpi-snapshots-lista');
    const sinTabla = document.getElementById('kpi-snapshots-sin-tabla');
    const formWrap = document.getElementById('kpi-snapshots-form-wrap');
    const btnRef = document.getElementById('kpi-btn-refrescar');
    const btnImp = document.getElementById('kpi-btn-imprimir');
    if (!host) return;
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) {
        host.innerHTML = '<span style="color:var(--re)">Sin conexión o sin permisos.</span>';
        return;
    }
    const okTabla = await adminKpiSnapshotsTablaExiste(true);
    if (!okTabla) {
        if (sinTabla) {
            sinTabla.style.display = 'block';
            sinTabla.innerHTML =
                '<strong>Tabla <code>kpi_snapshots</code> no encontrada.</strong> En el SQL Editor de Neon ejecutá el script del repo: <code>docs/NEON_kpi_snapshots.sql</code>. Luego tocá «Actualizar lista».';
        }
        if (formWrap) formWrap.style.display = 'none';
        if (btnRef) btnRef.style.display = 'none';
        if (btnImp) btnImp.style.display = 'none';
        host.innerHTML = '';
        return;
    }
    if (sinTabla) sinTabla.style.display = 'none';
    if (formWrap) formWrap.style.display = 'block';
    if (btnRef) btnRef.style.display = 'inline-flex';
    if (btnImp) btnImp.style.display = 'none';
    try {
        aplicarKpiPresetAdmin();
    } catch (_) {}
    host.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    const tid = tenantIdActual();
    let kpiLineSql = '';
    try {
        const chK = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kpi_snapshots' AND column_name = 'business_type' LIMIT 1`
        );
        if (chK.rows?.length) {
            kpiLineSql = ` AND business_type = ${esc(lineaNegocioOperativaCodigo())}`;
        }
    } catch (_) {}
    try {
        const r = await sqlSimple(
            `SELECT id, metrica, periodo_inicio, periodo_fin, valor_numero, valor_json, unidad, fuente, notas, created_at::text AS created_at
             FROM kpi_snapshots WHERE tenant_id = ${esc(tid)}${kpiLineSql}
             ORDER BY periodo_inicio DESC NULLS LAST, metrica ASC LIMIT 200`
        );
        const rows = r.rows || [];
        window.__kpiAdminLastRows = rows;
        populateKpiChartMetricaSelect(rows);
        if (rows.length === 0) {
            host.innerHTML = '<p style="font-size:.85rem;color:var(--tl)">No hay KPIs guardados para este tenant.</p>';
            if (btnImp) btnImp.style.display = 'none';
            try {
                renderKpiAdminHistoricoChart();
            } catch (_) {}
            return;
        }
        if (btnImp) btnImp.style.display = 'inline-flex';
        const head =
            '<div style="overflow-x:auto;border:1px solid var(--bo);border-radius:.5rem"><table style="width:100%;border-collapse:collapse;font-size:.78rem"><thead><tr style="background:var(--bg);text-align:left">' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Métrica</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Desde</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Hasta</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Valor</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Unidad</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Fuente</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Alta (fecha)</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)">Alta (hora)</th>' +
            '<th style="padding:.45rem .5rem;border-bottom:1px solid var(--bo)"></th></tr></thead><tbody>';
        const body = rows
            .map(row => {
                const vj = row.valor_json != null ? JSON.stringify(row.valor_json) : '{}';
                const vjShort = vj.length > 48 ? vj.slice(0, 45) + '…' : vj;
                const vn = row.valor_numero != null && row.valor_numero !== '' ? String(row.valor_numero) : '—';
                const labM = KPI_METRICA_ETIQUETAS[row.metrica];
                const al = splitFechaHoraExportAR(row.created_at);
                const celMetrica = labM
                    ? `<span style="font-weight:600">${_escOpt(labM)}</span><br><code style="font-size:.68rem;color:var(--tl)">${_escOpt(row.metrica)}</code>`
                    : `<code>${_escOpt(row.metrica)}</code>`;
                return (
                    `<tr><td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo);vertical-align:top">${celMetrica}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(fmtFechaKpiSnapshotCorta(row.periodo_inicio))}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(fmtFechaKpiSnapshotCorta(row.periodo_fin))}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(vn)}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(formatearUnidadKpiVista(row.unidad))}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">${_escOpt(row.fuente || '')}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo);white-space:nowrap">${_escOpt(al.fecha)}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo);white-space:nowrap">${_escOpt(al.hora)}</td>` +
                    `<td style="padding:.4rem .5rem;border-bottom:1px solid var(--bo)">` +
                    `<button type="button" class="btn-sm" style="padding:.2rem .45rem;font-size:.72rem;background:var(--bg);border:1px solid var(--bo)" onclick="eliminarKpiSnapshotAdmin(${Number(row.id)})" title="${_escOpt(vjShort)}">Eliminar</button></td></tr>`
                );
            })
            .join('');
        host.innerHTML = head + body + '</tbody></table></div>';
        try {
            renderKpiAdminHistoricoChart();
        } catch (e) {
            console.warn('[kpi-chart]', e);
        }
    } catch (e) {
        logErrorWeb('kpi-snapshots-lista', e);
        host.innerHTML = '<span style="color:var(--re)">' + _escOpt(mensajeErrorUsuario(e)) + '</span>';
        window.__kpiAdminLastRows = [];
        populateKpiChartMetricaSelect([]);
        if (btnImp) btnImp.style.display = 'none';
    }
}
window.cargarKpiSnapshotsAdmin = cargarKpiSnapshotsAdmin;

async function guardarKpiSnapshotAdmin() {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) {
        toast('Sin conexión o sin permisos.', 'error');
        return;
    }
    if (!(await adminKpiSnapshotsTablaExiste(true))) {
        toast('Creá la tabla kpi_snapshots en Neon (docs/NEON_kpi_snapshots.sql).', 'error');
        return;
    }
    const preset = (document.getElementById('kpi-preset')?.value || '').trim();
    if (!preset) {
        toast('Elegí qué tipo de indicador vas a cargar.', 'warning');
        return;
    }
    if (preset === 'avanzado') syncKpiMetricaAvanzadaAdmin();
    const desde = (document.getElementById('kpi-desde')?.value || '').trim();
    const hasta = (document.getElementById('kpi-hasta')?.value || '').trim();
    let valStr = (document.getElementById('kpi-valor')?.value || '').trim();
    const unidad = normalizarUnidadKpiParaGuardar(leerUnidadKpiAdmin());
    const fuente = (document.getElementById('kpi-fuente')?.value || 'manual').trim();
    const notas = (document.getElementById('kpi-notas')?.value || '').trim();
    const jsonRaw = (document.getElementById('kpi-json')?.value || '').trim();
    const metrica = (document.getElementById('kpi-metrica')?.value || '').trim();
    if (!metrica || !desde || !hasta) {
        toast('Falta la clave de la métrica o las fechas. Si usás «Otro — avanzado», completá la clave interna.', 'warning');
        return;
    }
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(metrica)) {
        toast('Clave de métrica: solo letras, números, punto, guión y _ (máx. 100).', 'warning');
        return;
    }
    if (desde > hasta) {
        toast('«Desde» no puede ser posterior a «Hasta».', 'warning');
        return;
    }
    const fuentesOk = ['manual', 'computed_batch', 'sql_report', 'import', 'api'];
    if (!fuentesOk.includes(fuente)) {
        toast('Fuente no válida.', 'warning');
        return;
    }
    if (document.getElementById('kpi-unidad')?.value === '__custom' && !unidad) {
        toast('Escribí la unidad personalizada o elegí otra opción.', 'warning');
        return;
    }
    const meta = KPI_ADMIN_PRESET_META[preset];
    let valorJson = {};
    if (preset === 'pct_cierres_con_foto') {
        const cf = parseInt(document.getElementById('kpi-det-con-foto')?.value, 10);
        const tot = parseInt(document.getElementById('kpi-det-total-cierres')?.value, 10);
        if (Number.isFinite(cf) && Number.isFinite(tot)) {
            if (tot <= 0) {
                toast('«Cierres en total» debe ser mayor que cero.', 'warning');
                return;
            }
            if (cf > tot) {
                toast('«Con foto» no puede ser mayor que el total de cierres.', 'warning');
                return;
            }
            valorJson = { cerrados_con_foto: cf, cerrados_total: tot };
            if (valStr === '') valStr = String(Math.round((cf / tot) * 10000) / 100);
        }
        if (Object.keys(valorJson).length === 0 && valStr === '') {
            toast('Completá «con foto» y «total» o escribí el porcentaje en valor principal.', 'warning');
            return;
        }
    } else if (meta && meta.detail === 'conteo' && meta.jsonKey) {
        const cnt = parseInt(document.getElementById('kpi-det-conteo')?.value, 10);
        if (Number.isFinite(cnt)) {
            valorJson = { [meta.jsonKey]: cnt };
            if (valStr === '') valStr = String(cnt);
        }
        if (Object.keys(valorJson).length === 0 && valStr === '') {
            toast('Completá la cantidad o el valor principal.', 'warning');
            return;
        }
    } else if (preset === 'avanzado') {
        if (jsonRaw) {
            try {
                valorJson = JSON.parse(jsonRaw);
                if (valorJson === null || typeof valorJson !== 'object' || Array.isArray(valorJson)) {
                    toast('El JSON debe ser un objeto { ... }.', 'warning');
                    return;
                }
            } catch (_) {
                toast('JSON inválido.', 'error');
                return;
            }
        }
    } else if (['tiempo_respuesta_horas', 'satisfaccion_pct', 'avance_medio'].includes(preset)) {
        if (valStr === '') {
            toast('Completá el valor principal.', 'warning');
            return;
        }
    }
    if (preset === 'satisfaccion_pct') {
        const jx = (document.getElementById('kpi-json')?.value || '').trim();
        if (jx) {
            try {
                const o = JSON.parse(jx);
                if (o && typeof o === 'object' && !Array.isArray(o)) {
                    valorJson = { ...valorJson, ...o };
                }
            } catch (_) {
                /* ignorar JSON auxiliar inválido */
            }
        }
    }
    let valorNumSql = 'NULL';
    if (valStr !== '') {
        const n = Number(valStr.replace(',', '.'));
        if (!Number.isFinite(n)) {
            toast('Valor numérico no válido.', 'warning');
            return;
        }
        valorNumSql = esc(n);
    }
    const unidadSql = unidad === '' ? 'NULL' : esc(unidad.slice(0, 32));
    const notasSql = notas === '' ? 'NULL' : esc(notas);
    const tid = tenantIdActual();
    const uid = app.u && app.u.id != null ? Number(app.u.id) : null;
    const uidSql = uid != null && Number.isFinite(uid) ? esc(uid) : 'NULL';
    const jsonStr = JSON.stringify(valorJson);
    const lineBt = esc(lineaNegocioOperativaCodigo());
    try {
        const chKb = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kpi_snapshots' AND column_name = 'business_type' LIMIT 1`
        );
        if (chKb.rows?.length) {
            await sqlSimple(
                `INSERT INTO kpi_snapshots (tenant_id, business_type, metrica, periodo_inicio, periodo_fin, valor_numero, valor_json, unidad, fuente, notas, created_by_usuario_id)
                 VALUES (${esc(tid)}, ${lineBt}, ${esc(metrica)}, ${esc(desde)}::date, ${esc(hasta)}::date, ${valorNumSql}, ${esc(jsonStr)}::jsonb, ${unidadSql}, ${esc(fuente)}, ${notasSql}, ${uidSql})
                 ON CONFLICT (tenant_id, business_type, metrica, periodo_inicio, periodo_fin)
                 DO UPDATE SET valor_numero = EXCLUDED.valor_numero, valor_json = EXCLUDED.valor_json, unidad = EXCLUDED.unidad, fuente = EXCLUDED.fuente, notas = EXCLUDED.notas, created_at = NOW(), created_by_usuario_id = EXCLUDED.created_by_usuario_id`
            );
        } else {
            await sqlSimple(
                `INSERT INTO kpi_snapshots (tenant_id, metrica, periodo_inicio, periodo_fin, valor_numero, valor_json, unidad, fuente, notas, created_by_usuario_id)
                 VALUES (${esc(tid)}, ${esc(metrica)}, ${esc(desde)}::date, ${esc(hasta)}::date, ${valorNumSql}, ${esc(jsonStr)}::jsonb, ${unidadSql}, ${esc(fuente)}, ${notasSql}, ${uidSql})
                 ON CONFLICT (tenant_id, metrica, periodo_inicio, periodo_fin)
                 DO UPDATE SET valor_numero = EXCLUDED.valor_numero, valor_json = EXCLUDED.valor_json, unidad = EXCLUDED.unidad, fuente = EXCLUDED.fuente, notas = EXCLUDED.notas, created_at = NOW(), created_by_usuario_id = EXCLUDED.created_by_usuario_id`
            );
        }
        toast('KPI guardado.', 'success');
        await cargarKpiSnapshotsAdmin();
    } catch (e) {
        toastError('kpi-snapshot-guardar', e, 'No se pudo guardar.');
    }
}
window.guardarKpiSnapshotAdmin = guardarKpiSnapshotAdmin;

async function eliminarKpiSnapshotAdmin(id) {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    const nid = Number(id);
    if (!Number.isFinite(nid) || nid <= 0) return;
    if (!confirm('¿Eliminar este registro de KPI?')) return;
    if (!(await adminKpiSnapshotsTablaExiste(true))) return;
    const tid = tenantIdActual();
    try {
        await sqlSimple(
            `DELETE FROM kpi_snapshots WHERE id = ${esc(nid)} AND tenant_id = ${esc(tid)}`
        );
        toast('Eliminado.', 'success');
        await cargarKpiSnapshotsAdmin();
    } catch (e) {
        toastError('kpi-snapshot-eliminar', e, 'No se pudo eliminar.');
    }
}
window.eliminarKpiSnapshotAdmin = eliminarKpiSnapshotAdmin;

/** Puntos ordenados para la métrica elegida en el selector del gráfico (misma lógica que el chart). */
function kpiAdminPuntosTendencia(rows, metrica) {
    if (!metrica || !Array.isArray(rows) || !rows.length) return [];
    return rows
        .filter(
            r =>
                r.metrica === metrica &&
                r.valor_numero != null &&
                r.valor_numero !== '' &&
                !Number.isNaN(Number(r.valor_numero))
        )
        .map(r => ({
            label: String(r.periodo_fin || r.periodo_inicio || ''),
            y: Number(r.valor_numero),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** Snapshots con valor_numero agrupados por código de métrica (para PDF multi-gráfico). */
function kpiAgruparSnapshotsNumericosPorMetrica(rows) {
    const map = new Map();
    for (const row of rows || []) {
        if (row.valor_numero == null || row.valor_numero === '' || Number.isNaN(Number(row.valor_numero))) continue;
        const m = String(row.metrica || 'sin_metrica');
        if (!map.has(m)) map.set(m, []);
        map.get(m).push(row);
    }
    return map;
}

function kpiPuntosDesdeFilasSnapshot(filas) {
    return (filas || [])
        .map((r) => {
            const pf = fmtFechaKpiSnapshotCorta(r.periodo_fin);
            const pi = fmtFechaKpiSnapshotCorta(r.periodo_inicio);
            const lab = pf && pi && pf !== pi ? `${pi}→${pf}` : pf || pi || String(r.created_at || '').slice(0, 10);
            return { label: lab || '—', y: Number(r.valor_numero) };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

function textoBreveInterpretacionKpiPdf(rows) {
    const map = kpiAgruparSnapshotsNumericosPorMetrica(rows);
    const nTipos = map.size;
    const nReg = (rows || []).filter(
        (r) => r.valor_numero != null && r.valor_numero !== '' && !Number.isNaN(Number(r.valor_numero))
    ).length;
    return (
        `Informe KPI piloto: ${nReg} registro(s) con valor numérico en ${nTipos} tipo(s) de métrica. ` +
        'Cada tipo incluye un gráfico compacto (línea si hay varios periodos, barra si hay uno). ' +
        'Debajo se listan todos los snapshots. Documento para uso interno.'
    );
}

function textoBreveInterpretacionKpi(rows, metricaSel, points) {
    const parts = [];
    parts.push(
        'Este informe resume los KPI guardados para el tenant actual: cada fila es un valor agregado para un periodo (fechas desde/hasta), con unidad y origen del dato.'
    );
    if (points.length >= 2) {
        const lab = KPI_METRICA_ETIQUETAS[metricaSel] || metricaSel;
        const v0 = points[0].y;
        const v1 = points[points.length - 1].y;
        const d = v1 - v0;
        const base = Math.max(Math.abs(v0), Math.abs(v1), 1e-6) * 0.02 + 1e-6;
        let tend = 'se mantiene estable entre el primer y el último periodo con datos';
        if (d > base) tend = 'tiene tendencia al alza entre el primer y el último periodo';
        else if (d < -base) tend = 'tiene tendencia a la baja entre el primer y el último periodo';
        parts.push(
            `La métrica «${lab}» ${tend} (aprox. ${v0} → ${v1}). Interpretá el cambio con contexto (muestra, estacionalidad o campañas) antes de tomar decisiones.`
        );
    } else if (metricaSel) {
        parts.push(
            'Para ver una curva de tendencia hacen falta al menos dos valores numéricos de la misma métrica en periodos distintos; igualmente se listan todos los registros abajo.'
        );
    }
    parts.push('Documento para uso interno y seguimiento de piloto comercial.');
    return parts.join(' ');
}

function kpiPdfTruncCell(s, max) {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    return t.slice(0, Math.max(1, max - 1)) + '…';
}

function kpiPdfDibujarCabeceraTabla(pdf, margin, y) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(30, 41, 59);
    const cols = [
        { w: 50, t: 'Métrica' },
        { w: 19, t: 'Desde' },
        { w: 19, t: 'Hasta' },
        { w: 13, t: 'Valor' },
        { w: 17, t: 'Unidad' },
        { w: 20, t: 'Fuente' },
        { w: 22, t: 'Alta fecha' },
        { w: 22, t: 'Alta hora' },
    ];
    let x = margin;
    cols.forEach(c => {
        pdf.text(c.t, x, y);
        x += c.w;
    });
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.line(margin, y + 1.2, margin + 182, y + 1.2); /* suma anchos ≈ 182 */
    return y + 5;
}

function kpiPdfPiePaginas(pdf) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const n = pdf.internal.getNumberOfPages();
    const ent = kpiPdfTruncCell(String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova', 48);
    for (let i = 1; i <= n; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.3);
        pdf.line(12, pageH - 10, pageW - 12, pageH - 10);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.6);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Página ${i} de ${n} · ${ent}`, pageW / 2, pageH - 6, { align: 'center' });
    }
}

async function kpiPdfMiniChartDataUrl(metricaKey, points) {
    if (!points.length || typeof Chart === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    const lab = KPI_METRICA_ETIQUETAS[metricaKey] || metricaKey;
    const labels = points.map((p) => kpiPdfTruncCell(p.label, 12));
    const data = points.map((p) => p.y);
    const type = points.length === 1 ? 'bar' : 'line';
    const lineC = '#5b7cba';
    const fillC = type === 'bar' ? 'rgba(91, 124, 186, 0.45)' : 'rgba(91, 124, 186, 0.14)';
    const chart = new Chart(ctx, {
        type,
        data: {
            labels,
            datasets: [
                {
                    label: lab,
                    data,
                    borderColor: lineC,
                    backgroundColor: fillC,
                    borderWidth: type === 'line' ? 2 : 1,
                    tension: 0.25,
                    fill: type === 'line',
                },
            ],
        },
        options: {
            animation: false,
            responsive: false,
            devicePixelRatio: 1.25,
            layout: { padding: { top: 8, bottom: 22, left: 6, right: 8 } },
            plugins: {
                title: { display: true, text: lab, color: '#1e3a8a', font: { size: 10, weight: '600' } },
                legend: { display: false },
            },
            scales: {
                x: {
                    ticks: {
                        font: { size: 8 },
                        maxRotation: 40,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8,
                    },
                },
                y: { beginAtZero: false, ticks: { font: { size: 8 } } },
            },
        },
    });
    await new Promise((r) => setTimeout(r, 120));
    let url = null;
    try {
        url = canvas.toDataURL('image/png');
    } catch (_) {
        url = null;
    }
    try {
        chart.destroy();
    } catch (_) {}
    return url;
}

/** PDF A4 listo para imprimir: encabezado empresa, texto breve, un gráfico compacto por tipo de métrica y tabla de snapshots. */
window.imprimirInformeKpiPiloto = async function imprimirInformeKpiPiloto() {
    if (!esAdmin()) {
        toast('Solo administrador', 'error');
        return;
    }
    if (modoOffline || !NEON_OK) {
        toast('Requiere conexión', 'error');
        return;
    }
    const rows = window.__kpiAdminLastRows;
    if (!rows || !rows.length) {
        toast('Primero tocá «Actualizar lista» en KPI piloto para cargar los datos.', 'warning');
        return;
    }
    if (!window.jspdf?.jsPDF) {
        toast('Falta la librería jsPDF. Recargá la página.', 'error');
        return;
    }
    if (typeof Chart === 'undefined') {
        toast('Chart.js no está cargado; recargá la página e intentá de nuevo.', 'error');
        return;
    }
    try {
        toast('Generando informe…', 'info');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 14;
        const maxW = pageW - 2 * margin;
        const lineaGen = `KPI piloto · Tenant ${tenantIdActual()} · Generado ${new Date().toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}`;
        let y = await pdfEncabezadoEmpresaBloque(pdf, margin, pageW, margin, lineaGen);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12.5);
        pdf.setTextColor(30, 58, 138);
        pdf.text('Informe KPI piloto', margin, y);
        y += 7;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.1);
        pdf.setTextColor(51, 65, 85);
        const intro = textoBreveInterpretacionKpiPdf(rows);
        const introRaw = pdf.splitTextToSize(intro, maxW);
        const introLines = Array.isArray(introRaw) ? introRaw : String(introRaw || '').split('\n').filter(Boolean);
        const lineH = 3.55;
        for (let li = 0; li < introLines.length; li++) {
            if (y + lineH > pageH - 14) {
                pdf.addPage();
                y = margin;
            }
            pdf.text(introLines[li], margin, y);
            y += lineH;
        }
        y += 3;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(30, 58, 138);
        if (y + 8 > pageH - 14) {
            pdf.addPage();
            y = margin;
        }
        pdf.text('Gráficos por tipo de métrica (compactos)', margin, y);
        y += 5;
        pdf.setFont('helvetica', 'normal');
        const porMetrica = kpiAgruparSnapshotsNumericosPorMetrica(rows);
        const keysOrden = [...porMetrica.keys()].sort((a, b) => a.localeCompare(b));
        const hMmMax = 52;
        for (const mk of keysOrden) {
            const pts = kpiPuntosDesdeFilasSnapshot(porMetrica.get(mk));
            if (!pts.length) continue;
            const dataUrl = await kpiPdfMiniChartDataUrl(mk, pts);
            if (!dataUrl) continue;
            let hMm = hMmMax;
            let wMm = Math.min(maxW, 168);
            if (y + hMm + 3.5 > pageH - 14) {
                pdf.addPage();
                y = margin;
            }
            try {
                pdf.addImage(dataUrl, 'PNG', margin, y, wMm, hMm);
            } catch (_) {
                pdf.setFontSize(7.5);
                pdf.setTextColor(100, 116, 139);
                pdf.text(`(No se pudo embeber el gráfico «${kpiPdfTruncCell(KPI_METRICA_ETIQUETAS[mk] || mk, 40)}»)`, margin, y + 4);
                hMm = 6;
            }
            y += hMm + 3.5;
        }
        if (y + 14 > pageH - 14) {
            pdf.addPage();
            y = margin;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(30, 58, 138);
        pdf.text('Registros (snapshots)', margin, y);
        y += 5;
        y = kpiPdfDibujarCabeceraTabla(pdf, margin, y);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.8);
        pdf.setTextColor(15, 23, 42);
        const rowH = 4;
        for (let ri = 0; ri < rows.length; ri++) {
            const row = rows[ri];
            if (y + rowH > pageH - 14) {
                pdf.addPage();
                y = margin + 2;
                y = kpiPdfDibujarCabeceraTabla(pdf, margin, y);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(6.8);
                pdf.setTextColor(15, 23, 42);
            }
            let x = margin;
            const labM = KPI_METRICA_ETIQUETAS[row.metrica] || row.metrica;
            const vn = row.valor_numero != null && row.valor_numero !== '' ? String(row.valor_numero) : '—';
            const al = splitFechaHoraExportAR(row.created_at);
            const cells = [
                { w: 50, t: kpiPdfTruncCell(labM, 32) },
                { w: 19, t: kpiPdfTruncCell(fmtFechaKpiSnapshotCorta(row.periodo_inicio), 12) },
                { w: 19, t: kpiPdfTruncCell(fmtFechaKpiSnapshotCorta(row.periodo_fin), 12) },
                { w: 13, t: kpiPdfTruncCell(vn, 8) },
                { w: 17, t: kpiPdfTruncCell(formatearUnidadKpiVista(row.unidad), 10) },
                { w: 20, t: kpiPdfTruncCell(row.fuente || '', 12) },
                { w: 22, t: kpiPdfTruncCell(al.fecha, 14) },
                { w: 22, t: kpiPdfTruncCell(al.hora, 8) },
            ];
            cells.forEach(c => {
                pdf.text(c.t, x, y);
                x += c.w;
            });
            y += rowH;
        }
        kpiPdfPiePaginas(pdf);
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) {
            URL.revokeObjectURL(url);
            toast('Permití ventanas emergentes para abrir el informe.', 'error');
            return;
        }
        setTimeout(() => {
            try {
                w.focus();
                w.print();
            } catch (_) {}
            setTimeout(() => {
                try {
                    URL.revokeObjectURL(url);
                } catch (_) {}
            }, 120000);
        }, 450);
        toast('Informe listo — se abrió la vista de impresión.', 'success');
    } catch (e) {
        toastError('kpi-informe-pdf', e);
    }
};

function adminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const tabs = document.querySelectorAll('#admin-panel .admin-tab');
    const idx = _ADMIN_TAB_ORDER.indexOf(tab);
    if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');
    const sec = document.getElementById('admin-' + tab);
    if (sec) sec.classList.add('active');
    if (tab === 'estadisticas') cargarEstadisticas();
    if (tab === 'kpi') void cargarKpiSnapshotsAdmin();
    if (tab === 'usuarios') cargarListaUsuarios();
    if (tab === 'distribuidores') cargarListaDistribuidoresAdmin();
    if (tab === 'socios') {
        try {
            if (typeof actualizarUiSociosImportCrs === 'function') actualizarUiSociosImportCrs();
        } catch (_) {}
        try {
            if (typeof actualizarUiSociosVistaProyeccion === 'function') actualizarUiSociosVistaProyeccion();
        } catch (_) {}
        cargarListaSociosAdmin();
        if (!document.getElementById('nis-historial-item-style')) {
            const st = document.createElement('style');
            st.id = 'nis-historial-item-style';
            st.textContent =
                '.nis-historial-item:hover,.nis-historial-item:focus-visible{border-color:#2563eb!important;box-shadow:0 0 0 2px rgba(37,99,235,.22);outline:none;background:#f8fafc!important}';
            document.head.appendChild(st);
        }
        const inpNisHist = document.getElementById('historial-nis-input');
        if (inpNisHist && !inpNisHist.dataset.enterBuscarNis) {
            inpNisHist.dataset.enterBuscarNis = '1';
            inpNisHist.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    buscarHistorialPorNIS();
                }
            });
        }
    }
    if (tab === 'empresa') cargarFormEmpresa();
    if (tab === 'mapa-usuarios') iniciarMapaUsuariosAdmin();
}

function cerrarAdminPanel() {
    const p = document.getElementById('admin-panel');
    if (!p) return;
    p.classList.remove('active', 'admin-panel--maximized');
    syncAdminPanelMaxButtons();
}
window.cerrarAdminPanel = cerrarAdminPanel;

function syncAdminPanelMaxButtons() {
    const p = document.getElementById('admin-panel');
    const maxed = !!(p && p.classList.contains('admin-panel--maximized'));
    const bMax = document.getElementById('admin-panel-btn-max');
    const bRest = document.getElementById('admin-panel-btn-restore');
    if (bMax) bMax.style.display = maxed ? 'none' : '';
    if (bRest) bRest.style.display = maxed ? '' : 'none';
}

function toggleAdminPanelMaximized() {
    const p = document.getElementById('admin-panel');
    if (!p || !p.classList.contains('active')) return;
    p.classList.toggle('admin-panel--maximized');
    syncAdminPanelMaxButtons();
    try {
        window.dispatchEvent(new Event('resize'));
    } catch (_) {}
}
window.toggleAdminPanelMaximized = toggleAdminPanelMaximized;

function syncDashboardModalMaxButtons() {
    const m = document.getElementById('modal-dashboard-gerencia');
    const maxed = !!(m && m.classList.contains('modal-dash--maximized'));
    const bMax = document.getElementById('dashboard-modal-btn-max');
    const bRest = document.getElementById('dashboard-modal-btn-restore');
    if (bMax) bMax.style.display = maxed ? 'none' : '';
    if (bRest) bRest.style.display = maxed ? '' : 'none';
}

function toggleDashboardModalMaximized() {
    const m = document.getElementById('modal-dashboard-gerencia');
    if (!m || !m.classList.contains('active')) return;
    m.classList.toggle('modal-dash--maximized');
    syncDashboardModalMaxButtons();
    try {
        window.dispatchEvent(new Event('resize'));
    } catch (_) {}
}
window.toggleDashboardModalMaximized = toggleDashboardModalMaximized;

function cerrarModalDashboardGerencia() {
    const m = document.getElementById('modal-dashboard-gerencia');
    if (m) m.classList.remove('active', 'modal-dash--maximized');
    syncDashboardModalMaxButtons();
}
window.cerrarModalDashboardGerencia = cerrarModalDashboardGerencia;

function abrirModalAcercaDe() {
    const modal = document.getElementById('modal-acerca-de');
    const vLine = document.getElementById('acerca-version-line');
    if (vLine) {
        let v = GN_VERSION_WEB;
        if (esAndroidApp && window.AndroidConfig && typeof window.AndroidConfig.getAppVersion === 'function') {
            try {
                v = String(window.AndroidConfig.getAppVersion());
            } catch (_) {}
        }
        vLine.textContent =
            'Versión: ' + v + (esAndroidApp ? ' (aplicación Android)' : ' (web / PWA)');
    }
    modal?.classList.add('active');
}
window.abrirModalAcercaDe = abrirModalAcercaDe;

function cerrarModalAcercaDe() {
    document.getElementById('modal-acerca-de')?.classList.remove('active');
}
window.cerrarModalAcercaDe = cerrarModalAcercaDe;

function abrirAdmin() {
    const p = document.getElementById('admin-panel');
    if (!p) return;
    p.classList.remove('admin-panel--maximized');
    syncAdminPanelMaxButtons();
    p.classList.add('active');
    try {
        aplicarVisibilidadTabsAdminRedElectrica();
    } catch (_) {}
    adminTab('empresa');
    cargarFormEmpresa();
}
window.abrirAdmin = abrirAdmin;

// ── Empresa config ────────────────────────────────────────────
function empresaIdentidadEdicionBloqueada() {
    const cfg = window.EMPRESA_CFG || {};
    const b = String(cfg.empresa_identidad_bloqueada || '').toLowerCase();
    if (b === '1' || b === 'true' || b === 'sí' || b === 'si') return true;
    return !!(window.__PMG_TENANT_BRANDING__ && window.__PMG_TENANT_BRANDING__.setup_wizard_completado);
}

function aplicarBloqueoIdentidadEmpresaFormulario() {
    const lock = empresaIdentidadEdicionBloqueada();
    const nombre = document.getElementById('cfg-nombre');
    const tipo = document.getElementById('cfg-tipo');
    [nombre, tipo].forEach((el) => {
        if (!el) return;
        el.readOnly = !!lock;
        el.title = lock ? 'Definido en el setup inicial — no editable' : '';
    });
    const hint = document.getElementById('cfg-identidad-bloqueada-hint');
    if (hint) hint.style.display = lock ? '' : 'none';
}

async function cargarFormEmpresa() {
    try {
        const r = await sqlSimple("SELECT clave, valor FROM empresa_config");
        const cfg = {};
        (r.rows || []).forEach(row => { cfg[row.clave] = row.valor; });
        document.getElementById('cfg-nombre').value    = cfg.nombre || '';
        document.getElementById('cfg-tipo').value      = cfg.tipo || '';
        const subIn = document.getElementById('cfg-subtitulo');
        if (subIn) subIn.value = GN_SUBTITULO_FIJO;
        document.getElementById('cfg-email').value     = cfg.email_contacto || '';
        document.getElementById('cfg-telefono').value  = cfg.telefono || '';
        const fam = document.getElementById('cfg-coord-familia');
        const modo = document.getElementById('cfg-coord-modo');
        if (fam) {
            const v = cfg.coord_proy_familia || 'none';
            fam.value = ['none', 'inchauspe', 'posgar94', 'posgar98', 'posgar2007'].includes(v) ? v : 'none';
        }
        if (modo) {
            const mv = cfg.coord_proy_modo || 'punto';
            modo.value = ['punto', 'instal', '1', '2', '3', '4', '5', '6', '7'].includes(mv) ? mv : 'punto';
        }
        syncCoordModoVisibility();
        aplicarBloqueoIdentidadEmpresaFormulario();
        syncDerivacionesTercerosWrap();
        if (esAdmin()) {
            try {
                await asegurarJwtApiRest();
                const token = getApiToken();
                if (token) {
                    const rcfg = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (rcfg.status === 401) {
                        if (document.getElementById('admin-derivacion-terceros-wrap')) {
                            setDerivacionesInlineError('Iniciá sesión de nuevo para cargar la derivación.');
                        }
                    } else if (rcfg.status === 403) {
                        if (document.getElementById('admin-derivacion-terceros-wrap')) {
                            setDerivacionesInlineError('Sin permiso para leer la configuración del tenant.');
                        }
                    } else if (rcfg.ok) {
                        const j = await rcfg.json().catch(() => ({}));
                        let apiCfg = j.cliente?.configuracion;
                        if (typeof apiCfg === 'string') {
                            try {
                                apiCfg = JSON.parse(apiCfg);
                            } catch (_) {
                                apiCfg = {};
                            }
                        }
                        apiCfg = apiCfg && typeof apiCfg === 'object' ? apiCfg : {};
                        aplicarConfiguracionJsonClienteEnEmpresaCfg(apiCfg);
                        if (document.getElementById('admin-derivacion-terceros-wrap')) {
                            setDerivacionesInlineError('');
                        }
                    }
                }
            } catch (_) {}
        }
        bindDerivacionesFormInputsOnce();
        poblarFormDerivacionesDesdeEmpresaCfg();
        const provEl = document.getElementById('cfg-provincia-nominatim');
        if (provEl) {
            const ec = window.EMPRESA_CFG || {};
            const cur = String(ec.provincia || ec.provincia_nominatim || ec.state || '').trim();
            if (cur) provEl.value = cur;
        }
    } catch(e) { console.warn(e); }
}

async function guardarConfigEmpresa() {
    const saveBtn = document.getElementById('cfg-guardar-empresa');
    const famEl = document.getElementById('cfg-coord-familia');
    const modoEl = document.getElementById('cfg-coord-modo');
    const famVal = famEl ? famEl.value : 'none';
    const modoVal = modoEl ? modoEl.value : 'punto';
    const lockIdent = empresaIdentidadEdicionBloqueada();
    const prev = window.EMPRESA_CFG || {};
    const campos = {
        nombre: lockIdent
            ? String(prev.nombre || '').trim()
            : document.getElementById('cfg-nombre').value.trim(),
        tipo: lockIdent
            ? String(prev.tipo || '').trim()
            : document.getElementById('cfg-tipo').value.trim(),
        subtitulo: GN_SUBTITULO_FIJO,
        email_contacto: document.getElementById('cfg-email').value.trim(),
        telefono:       document.getElementById('cfg-telefono').value.trim(),
        coord_proy_familia: famVal,
        coord_proy_modo: famVal === 'none' ? 'punto' : modoVal
    };
    let derivacionReclamosPayload = null;
    if (document.getElementById('admin-derivacion-terceros-wrap')) {
        try {
            derivacionReclamosPayload = construirDerivacionReclamosDesdeFormularioDerivaciones();
        } catch (e) {
            const m = e?.message || String(e);
            setDerivacionesInlineError(m);
            toast(m, 'error');
            return;
        }
    }
    setDerivacionesInlineError('');
    let apiSaveFailed = false;
    if (saveBtn) saveBtn.disabled = true;
    try {
        for (const [k, v] of Object.entries(campos)) {
            await sqlSimple(`INSERT INTO empresa_config(clave, valor) VALUES(${esc(k)}, ${esc(v)})
                ON CONFLICT(clave) DO UPDATE SET valor = ${esc(v)}, actualizado = NOW()`);
        }
        let marcaApiOk = true;
        if (esAdmin()) {
            try {
                await asegurarJwtApiRest();
                const token = getApiToken();
                if (token) {
                    /** Solo publicar marca aquí; setup_wizard_completado lo pone el wizard al Finalizar. */
                    const body = {
                        configuracion: {
                            marca_publicada_admin: true,
                            ocultar_modulos_redes: !!document.getElementById('cfg-ocultar-modulos-redes')?.checked,
                        },
                    };
                    const provNom = (document.getElementById('cfg-provincia-nominatim')?.value || '').trim();
                    if (provNom.length >= 2) {
                        body.configuracion.provincia = provNom;
                        body.configuracion.state = provNom;
                        body.configuracion.provincia_nominatim = provNom;
                    }
                    if (derivacionReclamosPayload !== null) {
                        body.configuracion.derivacion_reclamos = derivacionReclamosPayload;
                    }
                    if (campos.nombre) body.nombre = campos.nombre;
                    if (campos.tipo) body.tipo = campos.tipo;
                    const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify(body),
                    });
                    const rd = await resp.json().catch(() => ({}));
                    if (!resp.ok) {
                        let det = rd.error || `HTTP ${resp.status}`;
                        if (rd.detalles && typeof rd.detalles.mensaje === 'string') det = rd.detalles.mensaje;
                        else if (rd.detail) det = `${rd.error || 'Error'}: ${rd.detail}`;
                        if (resp.status === 401) {
                            throw new Error('Iniciá sesión de nuevo para guardar en el servidor.');
                        }
                        if (resp.status === 403) {
                            throw new Error('Sin permiso para guardar la configuración del tenant.');
                        }
                        throw new Error(det);
                    }
                    if (rd.cliente?.configuracion != null) {
                        let cfg = rd.cliente.configuracion;
                        if (typeof cfg === 'string') {
                            try {
                                cfg = JSON.parse(cfg);
                            } catch (_) {
                                cfg = {};
                            }
                        }
                        if (cfg && typeof cfg === 'object') {
                            const next = { ...(window.EMPRESA_CFG || {}) };
                            if (cfg.derivaciones && typeof cfg.derivaciones === 'object') {
                                next.derivaciones = cfg.derivaciones;
                            }
                            if (cfg.derivacion_reclamos && typeof cfg.derivacion_reclamos === 'object') {
                                next.derivacion_reclamos = cfg.derivacion_reclamos;
                            }
                            if (Object.prototype.hasOwnProperty.call(cfg, 'ocultar_modulos_redes')) {
                                next.ocultar_modulos_redes = !!cfg.ocultar_modulos_redes;
                            }
                            window.EMPRESA_CFG = next;
                        }
                    }
                    try {
                        aplicarVisibilidadTabsAdminRedElectrica();
                    } catch (_) {}
                } else {
                    marcaApiOk = false;
                }
            } catch (e) {
                marcaApiOk = false;
                apiSaveFailed = true;
                const apiErrorMsg = String(e?.message || e || '');
                console.warn('[empresa] PUT mi-configuracion:', apiErrorMsg);
                if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(apiErrorMsg)) {
                    toast(
                        'No hay conexión con el servidor. La configuración local se guardó; reintentá cuando vuelva la red.',
                        'error'
                    );
                } else {
                    toast(apiErrorMsg || 'No se pudo guardar en el servidor', 'error');
                }
            }
        }
        window.EMPRESA_CFG = {
            ...(window.EMPRESA_CFG || {}),
            nombre: campos.nombre,
            tipo: campos.tipo,
            subtitulo: campos.subtitulo,
        };
        window.__PMG_TENANT_BRANDING__ = {
            ...(window.__PMG_TENANT_BRANDING__ || {}),
            nombre_cliente: campos.nombre,
            tipo: campos.tipo,
            marca_publicada_admin: true,
            from_local_cache: !marcaApiOk,
        };
        if (marcaApiOk) {
            window.__PMG_TENANT_BRANDING__.from_local_cache = false;
        }
        syncEmpresaCfgNombreLogoDesdeMarca();
        try {
            persistTenantBrandingCache({ subtitulo: campos.subtitulo });
        } catch (_) {}
        try {
            aplicarMarcaVisualCompleta();
        } catch (_) {}
        await cargarConfigEmpresa();
        await verificarConfiguracionInicialObligatoria();
        syncWrapCoordsDisplayNuevoPedido();
        refrescarLineaUbicacionModalNuevoPedido();
        if (apiSaveFailed) {
            /* error ya mostrado arriba */
        } else if (marcaApiOk) {
            toast('Configuración guardada', 'success');
        } else {
            toast(
                'Configuración guardada en base local; no se pudo publicar marca en el servidor (revisá API o token)',
                'warning'
            );
        }
    } catch (e) {
        toastError('guardar-config-empresa', e);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ── Usuarios admin ────────────────────────────────────────────
async function cargarListaUsuarios() {
    // Asegurar que las columnas opcionales existan (compatibilidad con tablas viejas)
    try {
        await sqlSimple("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE");
        await sqlSimple("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token TEXT");
        await sqlSimple("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_expiry TIMESTAMPTZ");
        await sqlSimple("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(20)");
        await sqlSimple("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS whatsapp_notificaciones BOOLEAN DEFAULT TRUE");
        await sqlSimple(
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE"
        );
    } catch(_) {}
    const cont = document.getElementById('lista-usuarios-admin');
    cont.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const r = await sqlSimple(`SELECT id, email, nombre, rol,
            COALESCE(activo, true) AS activo,
            telefono,
            COALESCE(whatsapp_notificaciones, true) AS whatsapp_notificaciones
            FROM usuarios ORDER BY id`);
        if (!r.rows.length) { cont.innerHTML = '<p style="color:var(--tl);font-size:.85rem;padding:.5rem">Sin usuarios</p>'; return; }
        cont.innerHTML = `<table class="admin-table">
            <thead><tr><th>ID</th><th>Email</th><th>Nombre</th><th>WhatsApp</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${r.rows.map(u => `<tr>
                <td style="color:var(--tl)">${u.id}</td>
                <td><b>${u.email}</b></td>
                <td>${u.nombre}</td>
                <td>
                    <div style="font-size:.8rem">${u.telefono || '<span style="color:var(--tl)">Sin cargar</span>'}</div>
                    <div style="font-size:.74rem;color:${u.whatsapp_notificaciones ? '#166534' : '#b45309'}">${u.whatsapp_notificaciones ? 'Notificaciones ON' : 'Notificaciones OFF'}</div>
                </td>
                <td><span style="background:var(--bg);padding:.15rem .5rem;border-radius:.3rem;font-size:.78rem;font-weight:600">${u.rol}</span></td>
                <td><span style="color:${u.activo ? '#166534' : '#dc2626'};font-weight:600">${u.activo ? '✓ Activo' : '✗ Inactivo'}</span></td>
                <td style="display:flex;gap:.3rem;flex-wrap:wrap">
                    <button class="btn-sm" onclick="editarTelefonoWhatsappUsuario(${u.id}, ${escJs(u.telefono || '')}, ${u.whatsapp_notificaciones ? 'true' : 'false'})" style="background:#ecfeff;border:1px solid #a5f3fc;color:#0f766e">WhatsApp</button>
                    ${['tecnico','supervisor'].includes(String(u.rol||'').toLowerCase()) ? `<button type="button" class="btn-sm" style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e" onclick="adminGenerarClaveProvisionalUsuario(${u.id})" title="Solo el admin puede recuperar la clave del técnico; en Android le pedirá cambiarla al ingresar">Clave provisoria</button>` : ''}
                    <button class="btn-sm warning" onclick="toggleUsuario(${u.id}, ${!u.activo})">${u.activo ? 'Desactivar' : 'Activar'}</button>
                    ${u.email !== 'admin' ? `<button class="btn-sm danger" onclick="eliminarUsuario(${u.id})">Eliminar</button>` : ''}
                </td>
            </tr>`).join('')}</tbody>
        </table>`;
    } catch(e) {
        logErrorWeb('lista-usuarios-admin', e);
        cont.innerHTML = '<p style="color:var(--re)">' + escHtmlPrint(mensajeErrorUsuario(e)) + '</p>';
    }
}

function abrirFormUsuario() {
    document.getElementById('form-usuario').style.display = 'block';
    document.getElementById('nu-email').focus();
}

async function crearUsuario() {
    const email  = document.getElementById('nu-email').value.trim();
    const nombre = document.getElementById('nu-nombre').value.trim();
    const pw     = document.getElementById('nu-pw').value.trim();
    const rol    = document.getElementById('nu-rol').value;
    const telefono = normalizarTelefonoWhatsapp(document.getElementById('nu-telefono')?.value || '');
    if (!email || !nombre || !pw) { toast('Completá todos los campos', 'error'); return; }
    if (telefono && !esTelefonoWhatsappValido(telefono)) { toast('Teléfono inválido. Usá formato +543434540250', 'error'); return; }
    try {
        const wfU = await sqlFiltroUsuariosPorTenant();
        const colT = wfU.includes('tenant_id')
            ? 'tenant_id'
            : wfU.includes('cliente_id')
              ? 'cliente_id'
              : null;
        if (colT) {
            await sqlSimple(`INSERT INTO usuarios(email, nombre, password_hash, rol, telefono, whatsapp_notificaciones, must_change_password, ${colT})
                VALUES(${esc(email)}, ${esc(nombre)}, ${esc(pw)}, ${esc(rol)}, ${esc(telefono || null)}, TRUE, FALSE, ${esc(tenantIdActual())})`);
        } else {
            await sqlSimple(`INSERT INTO usuarios(email, nombre, password_hash, rol, telefono, whatsapp_notificaciones, must_change_password)
                VALUES(${esc(email)}, ${esc(nombre)}, ${esc(pw)}, ${esc(rol)}, ${esc(telefono || null)}, TRUE, FALSE)`);
        }
        toast('Usuario creado: ' + nombre, 'success');
        document.getElementById('form-usuario').style.display = 'none';
        ['nu-email','nu-nombre','nu-pw','nu-telefono'].forEach(id => document.getElementById(id).value = '');
        cargarListaUsuarios();
        try {
            await refrescarUsuariosCacheDesdeNeon();
        } catch (_) {}
    } catch(e) {
        const low = String(e && e.message ? e.message : e).toLowerCase();
        if (low.includes('unique')) toast('Ese email ya está registrado.', 'error');
        else toastError('crear-usuario', e);
    }
}

function escJs(v) {
    return `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function editarTelefonoWhatsappUsuario(id, telefonoActual, habilitadoActual) {
    const nuevo = prompt('Número WhatsApp del usuario (formato +543434540250):', (telefonoActual || '').trim());
    if (nuevo === null) return;
    const telNorm = normalizarTelefonoWhatsapp(nuevo);
    if (telNorm && !esTelefonoWhatsappValido(telNorm)) {
        toast('Formato inválido. Ejemplo: +543434540250', 'error');
        return;
    }
    const habilitar = confirm('¿Habilitar notificaciones WhatsApp para este usuario?\nAceptar = Sí / Cancelar = No');
    try {
        await sqlSimple(`UPDATE usuarios SET telefono = ${esc(telNorm || null)}, whatsapp_notificaciones = ${esc(habilitar)} WHERE id = ${esc(id)}`);
        toast('WhatsApp de usuario actualizado', 'success');
        await cargarListaUsuarios();
        try {
            await refrescarUsuariosCacheDesdeNeon();
        } catch (_) {}
    } catch (e) {
        toastError('usuario-whatsapp', e, 'No se pudo actualizar WhatsApp.');
    }
}

async function toggleUsuario(id, activar) {
    try {
        await sqlSimple(`UPDATE usuarios SET activo = ${activar} WHERE id = ${esc(id)}`);
        toast(activar ? 'Usuario activado' : 'Usuario desactivado', 'success');
        cargarListaUsuarios();
    } catch(e) { toastError('toggle-usuario', e); }
}

async function eliminarUsuario(id) {
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
    try {
        await sqlSimple(`DELETE FROM usuarios WHERE id = ${esc(id)}`);
        toast('Usuario eliminado', 'success');
        cargarListaUsuarios();
    } catch(e) { toastError('eliminar-usuario', e); }
}

function _esEmailValidoSimple(s) {
    const t = String(s || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

async function leerEmailContactoEmpresaNeon() {
    try {
        const r = await sqlSimple(
            `SELECT valor FROM empresa_config WHERE lower(trim(clave)) = 'email_contacto' LIMIT 1`
        );
        const v = (r.rows?.[0]?.valor || '').trim();
        return _esEmailValidoSimple(v) ? v : '';
    } catch (_) {
        return '';
    }
}

/** Solo admin: genera clave aleatoria, marca must_change_password (Android pedirá cambio al ingresar). */
async function adminGenerarClaveProvisionalUsuario(userId) {
    if (!esAdmin() || modoOffline || !NEON_OK || !_sql) {
        toast('Sin permisos o sin conexión.', 'error');
        return;
    }
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return;
    try {
        const r = await sqlSimple(
            `SELECT id, email, nombre, rol FROM usuarios WHERE id = ${esc(id)} LIMIT 1`
        );
        const u = r.rows?.[0];
        if (!u) {
            toast('Usuario no encontrado.', 'error');
            return;
        }
        const rol = normalizarRolStr(u.rol || '');
        if (rol !== 'tecnico' && rol !== 'supervisor') {
            toast('Solo aplica a técnicos o supervisores.', 'warning');
            return;
        }
        const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let pwd = '';
        for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
        await sqlSimple(`UPDATE usuarios SET password_hash = ${esc(pwd)}, must_change_password = TRUE, reset_token = NULL, reset_expiry = NULL WHERE id = ${esc(id)}`);
        window.prompt(
            `Clave provisoria para ${u.nombre || u.email} — copiá y entregála al técnico (en Android deberá cambiarla al ingresar):`,
            pwd
        );
        toast('Clave provisional generada.', 'success');
        await cargarListaUsuarios();
        try {
            await refrescarUsuariosCacheDesdeNeon();
        } catch (_) {}
    } catch (e) {
        toastError('clave-provisoria', e);
    }
}
window.adminGenerarClaveProvisionalUsuario = adminGenerarClaveProvisionalUsuario;

async function confirmarCambioPasswordObligatorioAndroid() {
    const pend = window._pendingAndroidPasswordChange;
    const msg = document.getElementById('forzar-cambio-pw-msg');
    if (!pend || !pend.u || !pend.passwordActual) {
        if (msg) msg.textContent = 'Sesión inválida. Volvé a iniciar sesión.';
        return;
    }
    const n1 = document.getElementById('forzar-cambio-pw-nueva')?.value || '';
    const n2 = document.getElementById('forzar-cambio-pw-nueva2')?.value || '';
    if (!n1 || !n2) {
        if (msg) msg.textContent = 'Completá ambos campos.';
        return;
    }
    if (n1 !== n2) {
        if (msg) msg.textContent = 'Las contraseñas nuevas no coinciden.';
        return;
    }
    if (n1.length < 4) {
        if (msg) msg.textContent = 'La contraseña debe tener al menos 4 caracteres.';
        return;
    }
    if (n1 === pend.passwordActual) {
        if (msg) msg.textContent = 'La nueva contraseña debe ser distinta de la provisional.';
        return;
    }
    try {
        const r = await sqlSimple(
            `UPDATE usuarios SET password_hash = ${esc(n1)}, must_change_password = FALSE, reset_token = NULL, reset_expiry = NULL
             WHERE id = ${esc(pend.u.id)} AND password_hash = ${esc(pend.passwordActual)}
             RETURNING id`
        );
        if (!(r.rows || []).length) {
            if (msg) msg.textContent = 'No se pudo actualizar (revisá la clave actual).';
            return;
        }
        document.getElementById('modal-forzar-cambio-pw')?.classList.remove('active');
        ['forzar-cambio-pw-nueva', 'forzar-cambio-pw-nueva2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (msg) msg.textContent = '';
        const u = { ...pend.u, must_change_password: false };
        delete window._pendingAndroidPasswordChange;
        guardarUsuarioOffline(u, n1);
        await loginApiJwt(u.email, n1);
        entrarConUsuario(u, false);
        toast('Contraseña actualizada. Bienvenido ' + u.nombre, 'success');
    } catch (e) {
        logErrorWeb('cambio-pw-android', e);
        if (msg) msg.textContent = mensajeErrorUsuario(e);
    }
}
window.confirmarCambioPasswordObligatorioAndroid = confirmarCambioPasswordObligatorioAndroid;

// ── Distribuidores admin ──────────────────────────────────────
async function cargarListaDistribuidoresAdmin() {
    const cont = document.getElementById('lista-distribuidores-admin');
    const zonaP = esMunicipioRubro() ? 'barrios' : esCooperativaAguaRubro() ? 'ramales' : 'distribuidores';
    const zona1 = esMunicipioRubro() ? 'barrio' : esCooperativaAguaRubro() ? 'ramal' : 'distribuidor';
    const zonaN = (n) => (n === 1 ? zona1 : zonaP);
    cont.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const hasLoc = await sqlDistribuidoresTieneLocalidad();
        const r = await sqlSimpleSelectAllPages(
            hasLoc
                ? 'SELECT id, codigo, nombre, tension, localidad, activo FROM distribuidores'
                : 'SELECT id, codigo, nombre, tension, activo FROM distribuidores',
            'ORDER BY codigo'
        );
        if (!r.rows.length) {
            cont.innerHTML = `<p style="color:var(--tl);font-size:.85rem;padding:.5rem">Sin ${zonaP}. Cargalos manualmente o importá un Excel.</p>`;
            return;
        }
        const n = r.rows.length;
        const head = hasLoc
            ? '<th>Código</th><th>Nombre</th><th>Tensión</th><th>Localidad</th><th>Estado</th><th>Acciones</th>'
            : '<th>Código</th><th>Nombre</th><th>Tensión</th><th>Estado</th><th>Acciones</th>';
        cont.innerHTML = `<table class="admin-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${r.rows.map(d => `<tr>
                <td><b>${_escOpt(d.codigo)}</b></td>
                <td>${_escOpt(d.nombre)}</td>
                <td>${_escOpt(d.tension) || '-'}</td>
                ${hasLoc ? `<td>${_escOpt(d.localidad) || '—'}</td>` : ''}
                <td><span style="color:${d.activo ? '#166534' : '#dc2626'};font-weight:600">${d.activo ? '✓' : '✗'}</span></td>
                <td style="display:flex;gap:.3rem">
                    <button class="btn-sm danger" onclick="eliminarDistribuidor(${Number(d.id)})">Eliminar</button>
                </td>
            </tr>`).join('')}</tbody>
        </table>
        <p style="font-size:.78rem;color:var(--tm);margin:.55rem 0 0">Total en base de datos: <strong>${n}</strong> ${zonaN(n)}. Desplazá esta sección si la lista es larga.</p>`;
    } catch(e) {
        logErrorWeb('lista-distribuidores-admin', e);
        cont.innerHTML = '<p style="color:var(--re)">' + escHtmlPrint(mensajeErrorUsuario(e)) + '</p>';
    }
}

function abrirFormDistribuidor() {
    document.getElementById('form-distribuidor').style.display = 'block';
    document.getElementById('nd-codigo').focus();
}

async function crearDistribuidor() {
    const codigo  = document.getElementById('nd-codigo').value.trim().toUpperCase();
    const nombre  = document.getElementById('nd-nombre').value.trim();
    const tension = document.getElementById('nd-tension').value.trim();
    const locRaw = document.getElementById('nd-localidad')?.value?.trim() || '';
    if (!codigo || !nombre) { toast('Código y nombre son obligatorios', 'error'); return; }
    try {
        if (await sqlDistribuidoresTieneLocalidad()) {
            await sqlSimple(
                `INSERT INTO distribuidores(codigo, nombre, tension, localidad) VALUES(${esc(codigo)}, ${esc(nombre)}, ${esc(
                    tension || null
                )}, ${esc(locRaw || null)}) ON CONFLICT(codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension, localidad = EXCLUDED.localidad`
            );
        } else {
            await sqlSimple(
                `INSERT INTO distribuidores(codigo, nombre, tension) VALUES(${esc(codigo)}, ${esc(nombre)}, ${esc(tension || null)})`
            );
        }
        toast(`${etiquetaZonaPedido()} creado`, 'success');
        document.getElementById('form-distribuidor').style.display = 'none';
        ['nd-codigo', 'nd-nombre', 'nd-tension', 'nd-localidad'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
    } catch(e) {
        const low = String(e && e.message ? e.message : e).toLowerCase();
        if (low.includes('unique')) toast('Ese código ya existe.', 'error');
        else toastError('crear-distribuidor', e);
    }
}

async function eliminarDistribuidor(id) {
    if (!confirm(`¿Eliminar este ${etiquetaZonaPedido().toLowerCase()}?`)) return;
    try {
        await sqlSimple(`DELETE FROM distribuidores WHERE id = ${esc(id)}`);
        toast('Eliminado', 'success');
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
    } catch(e) { toastError('eliminar-distribuidor', e); }
}

function mostrarFormatoExcel() {
    const ent = esMunicipioRubro() ? 'barrios' : esCooperativaAguaRubro() ? 'ramales' : 'distribuidores';
    alert(
        `Formato requerido para el Excel (${ent}):\n\nColumna A: codigo (ej: D001)\nColumna B: nombre (ej: ZONA NORTE)\nColumna C: tension (ej: 13200 V) — opcional\nColumna D: localidad — opcional (requiere columna en Neon: docs/NEON_distribuidores_localidad.sql)\n\nEncabezados fila 1: codigo | nombre | tension | localidad\nA partir de la fila 2, los datos.\n\nPodés marcar «Vaciar tabla antes de importar» para borrar todos los registros y volver a cargar desde cero (afecta toda la base).`
    );
}

async function importarExcelDistribuidores(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { toast('Librería Excel no cargada', 'error'); return; }
    const zpl = esMunicipioRubro() ? 'barrios' : esCooperativaAguaRubro() ? 'ramales' : 'distribuidores';
    const errMsgs = [];
    try {
        mostrarOverlayImportacion(`Leyendo Excel de ${zpl}…`);
        const reemplazar = document.getElementById('distribuidores-import-reemplazar')?.checked;
        if (reemplazar) {
            actualizarOverlayImportacion('Vaciando tabla…');
            await sqlSimple('DELETE FROM distribuidores');
        }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const hasLoc = await sqlDistribuidoresTieneLocalidad();
        const rows = XLSX.utils.sheet_to_json(ws, {
            header: ['codigo', 'nombre', 'tension', 'localidad'],
            range: 1,
            defval: '',
            raw: false
        });
        if (!rows.length) {
            ocultarOverlayImportacion();
            toast('Excel vacío o formato incorrecto', 'error');
            event.target.value = '';
            return;
        }
        let ok = 0;
        let fail = 0;
        let idx = 0;
        for (const row of rows) {
            idx++;
            if (!row.codigo || !row.nombre) continue;
            actualizarOverlayImportacion(`Importando ${zpl}… ${ok + fail + 1} / ${rows.length}`);
            if (idx % 80 === 0) await new Promise(r => setTimeout(r, 0));
            try {
                const locIns =
                    hasLoc && row.localidad != null && String(row.localidad).trim() !== ''
                        ? String(row.localidad).trim()
                        : null;
                if (hasLoc) {
                    await sqlSimple(`INSERT INTO distribuidores(codigo, nombre, tension, localidad)
                    VALUES(${esc(String(row.codigo).trim().toUpperCase())}, ${esc(String(row.nombre).trim())}, ${esc(
                        row.tension ? String(row.tension).trim() : null
                    )}, ${esc(locIns)})
                    ON CONFLICT(codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension, localidad = EXCLUDED.localidad`);
                } else {
                    await sqlSimple(`INSERT INTO distribuidores(codigo, nombre, tension)
                    VALUES(${esc(String(row.codigo).trim().toUpperCase())}, ${esc(String(row.nombre).trim())}, ${esc(
                        row.tension ? String(row.tension).trim() : null
                    )})
                    ON CONFLICT(codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension`);
                }
                ok++;
            } catch (e) {
                fail++;
                if (errMsgs.length < 8) errMsgs.push(`Fila ~${idx + 1}: ${e && e.message ? e.message : String(e)}`);
            }
        }
        ocultarOverlayImportacion();
        const suf = reemplazar ? ' (tabla reemplazada)' : '';
        if (fail && !ok) {
            toast(`Importación con errores: 0 OK, ${fail} fallidos${suf}`, 'error');
            alert(`No se pudo completar la importación de ${zpl}.\n\n` + errMsgs.join('\n'));
        } else {
            toast(`Importados: ${ok} OK${fail ? ', ' + fail + ' errores' : ''}${suf}`, ok > 0 ? 'success' : 'error');
            if (fail && errMsgs.length) alert('Algunas filas fallaron:\n\n' + errMsgs.join('\n'));
        }
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
        try {
            const chk = document.getElementById('distribuidores-import-reemplazar');
            if (chk) chk.checked = false;
        } catch (_) {}
    } catch (e) {
        ocultarOverlayImportacion();
        toastError('import-excel-distribuidores', e, 'Error al leer el Excel.');
        alert(`Error al importar ${zpl}.\n\n` + mensajeErrorUsuario(e));
    }
    event.target.value = '';
}

function actualizarUiSociosImportCrs() {
    try {
        const optArg = document.getElementById('socios-import-crs-arg-opt');
        const fam = String((window.EMPRESA_CFG || {}).coord_proy_familia || '').trim();
        const ok = !!fam && fam !== 'none';
        if (optArg) {
            optArg.disabled = !ok;
            const sel = document.getElementById('socios-import-crs');
            if (!ok && sel && sel.value === 'arg_en') sel.value = 'wgs84';
        }
        const crs = document.getElementById('socios-import-crs')?.value;
        const w = document.getElementById('socios-import-faja-wrap');
        if (w) w.style.display = crs === 'arg_en' ? '' : 'none';
    } catch (_) {}
}
window.actualizarUiSociosImportCrs = actualizarUiSociosImportCrs;

function obtenerZonaImportSociosProyectadas() {
    const sel = document.getElementById('socios-import-faja')?.value || 'auto';
    if (/^[1-7]$/.test(sel)) return parseInt(sel, 10);
    const cfg = window.EMPRESA_CFG || {};
    const lo = Number(cfg.lng_base);
    if (Number.isFinite(lo)) return resolverFajaProyeccion('instal', lo);
    return fajaArgentinaPorLongitud(-64);
}

const SOCIOS_TABLA_COLS_BASE = 19;
const LS_SOC_VISTA_PROY = 'pmg_socios_vista_proy';

function leerPrefsVistaProyeccionSociosCatalogo() {
    try {
        const raw = localStorage.getItem(LS_SOC_VISTA_PROY);
        if (raw) {
            const o = JSON.parse(raw);
            if (o && typeof o === 'object' && (o.modo === 'solo_wgs' || o.modo === 'extra_proy')) {
                const fams = Array.isArray(o.familias)
                    ? o.familias.filter((f) => PMG_FAMILIAS_PROYECCION_LIST.includes(f))
                    : [];
                const fp = String(o.familia_primaria || '').trim();
                return {
                    modo: o.modo,
                    familias: fams,
                    familia_primaria: PMG_FAMILIAS_PROYECCION_LIST.includes(fp) ? fp : ''
                };
            }
        }
    } catch (_) {}
    return { modo: 'solo_wgs', familias: [], familia_primaria: '' };
}

function guardarPrefsVistaProyeccionSociosCatalogo(p) {
    try {
        const prev = leerPrefsVistaProyeccionSociosCatalogo();
        const next = {
            modo: p.modo !== undefined ? p.modo : prev.modo,
            familias: p.familias !== undefined ? p.familias : prev.familias,
            familia_primaria: p.familia_primaria !== undefined ? p.familia_primaria : prev.familia_primaria
        };
        localStorage.setItem(LS_SOC_VISTA_PROY, JSON.stringify(next));
    } catch (_) {}
}

/** Orden de columnas X/Y: la familia «principal» va primero si está entre las elegidas. */
function ordenarFamiliasVistaProy(fams, primaria) {
    const arr = Array.isArray(fams) ? fams.filter((f) => PMG_FAMILIAS_PROYECCION_LIST.includes(f)) : [];
    const p = String(primaria || '').trim();
    if (!p || !arr.includes(p)) return arr;
    return [p, ...arr.filter((f) => f !== p)];
}

function obtenerNumColsTablaSociosAdmin() {
    const p = leerPrefsVistaProyeccionSociosCatalogo();
    const n = p.modo === 'extra_proy' && p.familias.length ? p.familias.length * 2 : 0;
    return SOCIOS_TABLA_COLS_BASE + n;
}

/** Misma regla que import Este/Norte: faja Auto según longitud de la central (`lng_base`). */
function obtenerZonaVistaSociosCatalogo() {
    return obtenerZonaImportSociosProyectadas();
}

function armarHeadExtraProyeccionSociosHtml() {
    const prefs = leerPrefsVistaProyeccionSociosCatalogo();
    if (prefs.modo !== 'extra_proy' || !prefs.familias.length) return '';
    const z = obtenerZonaVistaSociosCatalogo();
    const orden = ordenarFamiliasVistaProy(prefs.familias, prefs.familia_primaria);
    let h = '';
    for (const fam of orden) {
        const ab = etiquetaFamiliaProyeccionCorta(fam);
        const larga = etiquetaFamiliaProyeccionLarga(fam);
        h += `<th align="right" title="Este X (m) · ${larga} · faja ${z} (proyección desde WGS84)">X (${ab})</th><th align="right" title="Norte Y (m) · ${larga} · faja ${z}">Y (${ab})</th>`;
    }
    return h;
}

function htmlCeldasProyeccionSociosDesdeLatLng(lat, lon) {
    const prefs = leerPrefsVistaProyeccionSociosCatalogo();
    if (prefs.modo !== 'extra_proy' || !prefs.familias.length) return '';
    const la = Number(lat);
    const lo = Number(lon);
    const orden = ordenarFamiliasVistaProy(prefs.familias, prefs.familia_primaria);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        return orden.map(() => '<td>—</td><td>—</td>').join('');
    }
    const z = obtenerZonaVistaSociosCatalogo();
    let out = '';
    for (const fam of orden) {
        const pr = proyectarWgs84AFamiliaFaja(la, lo, fam, z);
        const ab = etiquetaFamiliaProyeccionCorta(fam);
        const larga = etiquetaFamiliaProyeccionLarga(fam);
        const tip = `${larga} · faja ${z} · Este/Norte (m)`;
        if (pr) {
            const xe = pr.e.toFixed(1).replace('.', ',');
            const yn = pr.n.toFixed(1).replace('.', ',');
            out += `<td align="right" title="${tip}">${xe}</td><td align="right" title="${tip}">${yn}</td>`;
        } else {
            out += '<td>—</td><td>—</td>';
        }
    }
    return out;
}

function actualizarUiSociosVistaProyeccion() {
    try {
        const p = leerPrefsVistaProyeccionSociosCatalogo();
        const rSolo = document.querySelector('input[name="socios-tabla-proy-mode"][value="solo_wgs"]');
        const rEx = document.querySelector('input[name="socios-tabla-proy-mode"][value="extra_proy"]');
        if (rSolo && rEx) {
            if (p.modo === 'extra_proy') rEx.checked = true;
            else rSolo.checked = true;
        }
        const box = document.getElementById('socios-vista-proy-checks');
        if (box) box.style.display = p.modo === 'extra_proy' ? 'flex' : 'none';
        document.querySelectorAll('.socios-proy-fam-cb').forEach((cb) => {
            const fam = cb.getAttribute('data-fam');
            if (fam) cb.checked = p.familias.includes(fam);
        });
        const selP = document.getElementById('socios-proy-fam-primaria');
        if (selP) {
            const v = p.familia_primaria && p.familias.includes(p.familia_primaria) ? p.familia_primaria : '';
            selP.value = v || '';
        }
    } catch (_) {}
}

function onCambioVistaProySocios() {
    const m = document.querySelector('input[name="socios-tabla-proy-mode"]:checked')?.value || 'solo_wgs';
    const prev = leerPrefsVistaProyeccionSociosCatalogo();
    const famsSel = [...document.querySelectorAll('.socios-proy-fam-cb:checked')]
        .map((c) => c.getAttribute('data-fam'))
        .filter(Boolean);
    const fams =
        m === 'extra_proy' ? (famsSel.length ? famsSel : prev.familias) : prev.familias;
    guardarPrefsVistaProyeccionSociosCatalogo({ modo: m, familias: fams, familia_primaria: prev.familia_primaria });
    actualizarUiSociosVistaProyeccion();
    if (document.getElementById('admin-socios')?.classList.contains('active')) void cargarListaSociosAdmin();
}
window.onCambioVistaProySocios = onCambioVistaProySocios;

function onCambioCheckFamProySocios() {
    const m = document.querySelector('input[name="socios-tabla-proy-mode"]:checked')?.value || 'solo_wgs';
    if (m !== 'extra_proy') return;
    const prev = leerPrefsVistaProyeccionSociosCatalogo();
    const fams = [...document.querySelectorAll('.socios-proy-fam-cb:checked')].map((c) => c.getAttribute('data-fam')).filter(Boolean);
    let fp = prev.familia_primaria;
    if (fp && !fams.includes(fp)) fp = '';
    guardarPrefsVistaProyeccionSociosCatalogo({ modo: 'extra_proy', familias: fams, familia_primaria: fp });
    actualizarUiSociosVistaProyeccion();
    if (document.getElementById('admin-socios')?.classList.contains('active')) void cargarListaSociosAdmin();
}
window.onCambioCheckFamProySocios = onCambioCheckFamProySocios;

function onCambioFamiliaPrimariaSociosCatalogo() {
    const sel = document.getElementById('socios-proy-fam-primaria');
    const prim = (sel?.value || '').trim();
    const prev = leerPrefsVistaProyeccionSociosCatalogo();
    const m = document.querySelector('input[name="socios-tabla-proy-mode"]:checked')?.value || 'solo_wgs';
    let fams = [...document.querySelectorAll('.socios-proy-fam-cb:checked')].map((c) => c.getAttribute('data-fam')).filter(Boolean);
    if (m === 'extra_proy' && prim && PMG_FAMILIAS_PROYECCION_LIST.includes(prim)) {
        const cb = document.querySelector(`.socios-proy-fam-cb[data-fam="${prim}"]`);
        if (cb && !cb.checked) {
            cb.checked = true;
            if (!fams.includes(prim)) fams.push(prim);
        }
    }
    guardarPrefsVistaProyeccionSociosCatalogo({
        modo: m,
        familias: m === 'extra_proy' ? fams : prev.familias,
        familia_primaria: prim
    });
    actualizarUiSociosVistaProyeccion();
    if (document.getElementById('admin-socios')?.classList.contains('active')) void cargarListaSociosAdmin();
}
window.onCambioFamiliaPrimariaSociosCatalogo = onCambioFamiliaPrimariaSociosCatalogo;

async function cargarListaSociosAdmin() {
    const cont = document.getElementById('lista-socios-admin');
    if (!cont) return;
    cont.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const hasSocTList = await sociosCatalogoTieneTenantId();
        let wf = hasSocTList ? ` WHERE tenant_id = ${esc(tenantIdActual())}` : '';
        try {
            const chSocBt = await sqlSimple(
                `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name = 'business_type' LIMIT 1`
            );
            if (chSocBt.rows?.length) {
                const line = lineaNegocioOperativaCodigo();
                const lineQ = esc(line);
                const socLine = ` (business_type = ${lineQ} OR (business_type IS NULL AND ${lineQ} = 'electricidad'))`;
                wf += wf ? ` AND${socLine}` : ` WHERE${socLine}`;
            }
        } catch (_) {}
        const r = await sqlSimpleSelectAllPages(
            `SELECT id, nis_medidor, nis, medidor, nombre, calle, numero, barrio, telefono, distribuidor_codigo, localidad, provincia, codigo_postal, tipo_tarifa, urbano_rural, transformador, tipo_conexion, fases, latitud, longitud, activo FROM socios_catalogo${wf}`,
            'ORDER BY nis_medidor'
        );
        const rows = r.rows || [];
        if (!rows.length) {
            cont.innerHTML = '<p style="color:var(--tl);font-size:.85rem">Sin socios. Importá un Excel.</p>';
            window._sociosVirtualRows = null;
            return;
        }
        window._sociosVirtualRows = rows;
        window._sociosVirtualRowHeight = 31;
        window._sociosTablaColCount = obtenerNumColsTablaSociosAdmin();
        const headExtra = armarHeadExtraProyeccionSociosHtml();
        const rubroSoc = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
        const id1Lbl =
            rubroSoc === 'municipio'
                ? 'N° Vecino'
                : rubroSoc === 'cooperativa_agua'
                  ? 'N° Abonado'
                  : 'NIS';
        const id2Lbl = rubroSoc === 'municipio' ? 'Ref.' : 'Medidor';
        cont.innerHTML =
            `<div style="overflow-x:auto"><div id="lista-socios-admin-scroll" style="max-height:min(60vh,560px);overflow:auto;border:1px solid var(--bo);border-radius:.5rem;position:relative">
<table class="gn-soc-admin-table" style="width:100%;font-size:.8rem;border-collapse:collapse;table-layout:auto"><thead style="position:sticky;top:0;background:var(--bg);z-index:2;box-shadow:0 1px 0 var(--bo)"><tr><th align="left">${id1Lbl}</th><th align="left">${id2Lbl}</th><th>Nombre</th><th>Localidad</th><th>Provincia</th><th>Cód. postal</th><th>Barrio</th><th>Transf.</th><th>Tarifa</th><th>U/R</th><th>Conex.</th><th>Fases</th><th>Calle</th><th>Nº</th><th>Tel.</th><th>Dist.</th><th align="right" class="gn-soc-coord gn-soc-lat" title="Latitud · WGS84 (EPSG:4326), valor almacenado en BD">Lat (WGS84)</th><th align="right" class="gn-soc-coord gn-soc-lon" title="Longitud · WGS84 (EPSG:4326)">Lon (WGS84)</th>${headExtra}<th>Estado</th></tr></thead><tbody id="lista-socios-vtbody"></tbody></table></div>
<p style="font-size:.72rem;color:var(--tl);margin:.35rem 0 0">${rows.length.toLocaleString('es-AR')} socios — vista virtual (solo filas visibles). Lat/Lon = datos en BD (EPSG:4326). Columnas X/Y (si las activaste): Este/Norte en metros según familia y faja indicadas en el encabezado.</p></div>`;
        bindSociosCatalogoVirtualScroll();
        renderSociosCatalogoVirtual();
    } catch (e) {
        logErrorWeb('lista-socios-admin', e);
        cont.innerHTML = '<p style="color:var(--re);font-size:.85rem">' + escHtmlPrint(mensajeErrorUsuario(e)) + '</p>';
    }
}

function normalizarEncabezadoExcelSocios(k) {
    let s = String(k || '').trim().toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    const n = s.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (n === 'pcia' || n === 'provincia') return 'provincia';
    if (n === 'estado' || n === 'state') return 'provincia';
    if (
        n === 'abonado' ||
        n === 'n_abonado' ||
        n === 'numero_abonado' ||
        n === 'nro_abonado' ||
        n === 'num_abonado' ||
        n === 'n_de_abonado' ||
        n === 'numero_de_abonado' ||
        n === 'nro_de_abonado'
    ) {
        return 'nis';
    }
    if (
        n === 'vecino' ||
        n === 'n_vecino' ||
        n === 'numero_vecino' ||
        n === 'nro_vecino' ||
        n === 'num_vecino' ||
        n === 'n_de_vecino' ||
        n === 'numero_de_vecino' ||
        n === 'nro_de_vecino'
    ) {
        return 'nis';
    }
    if (
        n === 'cp' ||
        n === 'cpa' ||
        n === 'codigo_postal' ||
        n === 'codigopostal' ||
        n === 'codpostal' ||
        n === 'postal' ||
        n === 'zip' ||
        n === 'cod_postal' ||
        n === 'cod_post'
    ) {
        return 'codigo_postal';
    }
    return n;
}

/** Une sinónimos de encabezado ya normalizados a la clave canónica `provincia`. */
function aliasEncabezadosProvinciaSocios(mapNormAOriginal) {
    if (!mapNormAOriginal || typeof mapNormAOriginal !== 'object') return;
    const keys = ['pcia', 'estado', 'state'];
    for (const k of keys) {
        if (mapNormAOriginal[k] && !mapNormAOriginal.provincia) {
            mapNormAOriginal.provincia = mapNormAOriginal[k];
        }
    }
}

function aliasEncabezadosCpSocios(mapNormAOriginal) {
    if (!mapNormAOriginal || typeof mapNormAOriginal !== 'object') return;
    const keys = ['cp', 'cpa', 'postal', 'zip', 'cod_postal', 'codigopostal', 'codpostal', 'cod_post'];
    for (const k of keys) {
        if (mapNormAOriginal[k] && !mapNormAOriginal.codigo_postal) {
            mapNormAOriginal.codigo_postal = mapNormAOriginal[k];
        }
    }
}

function valorSociosPorEncabezados(row, mapNormAOriginal, ...clavesCanon) {
    for (const canon of clavesCanon) {
        const orig = mapNormAOriginal[canon];
        if (orig != null && row[orig] != null && String(row[orig]).trim() !== '') {
            return String(row[orig]).trim();
        }
    }
    for (const orig of Object.keys(row)) {
        const n = normalizarEncabezadoExcelSocios(orig);
        if (clavesCanon.includes(n)) {
            const v = row[orig];
            if (v != null && String(v).trim() !== '') return String(v).trim();
        }
    }
    return null;
}

/**
 * Decimal con coma/punto o texto en grados/minutos/segundos (p. ej. 34°30'15,2"S).
 * Si hay símbolos ° ′ ″ no se usa parseFloat directo sobre todo el string.
 */
function parseDecimalODmsCoord(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    const raw = String(val).trim();
    if (!raw) return null;
    if (!/[°'′″]/.test(raw)) {
        const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    return parsearDmsLatLonFlexible(raw);
}

/** DMS compacto tipo Excel / Argentina: 34°30'15,2"S o S 34°30'15" */
function parsearDmsLatLonFlexible(str) {
    const t = String(str).replace(/\u00a0/g, ' ').trim();
    const m = t.match(
        /^\s*(?:([NnSsEeWw])\s+)?(-?\d+(?:[.,]\d+)?)\s*°\s*(\d+)\s*['′]\s*(\d+(?:[.,]\d+)?)?\s*(?:"|″|'')?\s*([NnSsEeWw])?\s*$/i
    );
    if (!m) return null;
    const hemiLead = (m[1] || '').toUpperCase();
    const hemiTail = (m[5] || '').toUpperCase();
    const hemi = hemiLead || hemiTail;
    const degAbs = Math.abs(parseFloat(String(m[2]).replace(',', '.')));
    const min = parseInt(m[3], 10) || 0;
    const sec = m[4] ? parseFloat(String(m[4]).replace(',', '.')) : 0;
    if (!Number.isFinite(degAbs) || min < 0 || min >= 60 || sec < 0 || sec >= 60) return null;
    let dec = degAbs + min / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W') dec = -dec;
    else if (String(m[2]).trim().startsWith('-')) dec = -dec;
    return dec;
}

/** Lee número desde celda Excel (raw o texto): latitud, longitud, este, norte, etc. */
function leerCoordExcelSocios(row, mapNormAOriginal, ...clavesCanon) {
    for (const canon of clavesCanon) {
        const orig = mapNormAOriginal[canon];
        if (orig != null && row[orig] != null && row[orig] !== '') {
            const v = row[orig];
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            const s = String(v).trim();
            if (s) {
                const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
                if (Number.isFinite(n) && !/[°'′″]/.test(s)) return n;
                const d = parseDecimalODmsCoord(v);
                if (d != null && Number.isFinite(d)) return d;
            }
        }
    }
    for (const orig of Object.keys(row)) {
        const n = normalizarEncabezadoExcelSocios(orig);
        if (clavesCanon.includes(n)) {
            const v = row[orig];
            if (v == null || v === '') continue;
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            const s = String(v).trim();
            if (s) {
                const pn = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
                if (Number.isFinite(pn) && !/[°'′″]/.test(s)) return pn;
                const d = parseDecimalODmsCoord(v);
                if (d != null && Number.isFinite(d)) return d;
            }
        }
    }
    return null;
}

function validarWgs84Import(lat, lng) {
    if (lat == null || lng == null) return { la: null, lo: null };
    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { la: null, lo: null };
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return { la: null, lo: null };
    if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) return { la: null, lo: null };
    return { la: a, lo: b };
}

/** Medidor/NIS como texto (evita pérdida de formato; números Excel → String). */
function valorIdentificadorTextoSocios(row, mapNormAOriginal, ...clavesCanon) {
    for (const canon of clavesCanon) {
        const orig = mapNormAOriginal[canon];
        if (orig == null || row[orig] == null || row[orig] === '') continue;
        const v = row[orig];
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
        const s = String(v).trim();
        return s || null;
    }
    for (const orig of Object.keys(row)) {
        const n = normalizarEncabezadoExcelSocios(orig);
        if (clavesCanon.includes(n)) {
            const v = row[orig];
            if (v == null || v === '') continue;
            if (typeof v === 'number' && Number.isFinite(v)) return String(v);
            const s = String(v).trim();
            return s || null;
        }
    }
    return null;
}

/** Columnas NIS / Medidor en panel admin (catálogo virtual). */
function sociosCatalogoNisCelda(s) {
    const direct = String(s.nis ?? '').trim();
    if (direct) return direct;
    const nm = String(s.nis_medidor ?? '').trim();
    if (!nm) return '';
    const ix = nm.indexOf('-');
    return ix > 0 ? nm.slice(0, ix).trim() : nm;
}

function sociosCatalogoMedidorCelda(s) {
    return String(s.medidor ?? '').trim();
}

/** Lotes más grandes = menos viajes a Neon (20k+ socios). */
const SOCIOS_BULK_CHUNK = 1000;

async function ejecutarBulkInsertSociosCatalogo(lote) {
    if (!lote.length) return;
    const hasT = await sociosCatalogoTieneTenantId();
    const hasBt = await sociosCatalogoTieneBusinessType();
    const tidEsc = esc(tenantIdActual());
    const btEsc = esc(lineaNegocioOperativaCodigo());
    const colList = [
        'nis_medidor, nis, medidor, nombre, calle, numero, barrio, telefono, distribuidor_codigo, localidad, provincia, codigo_postal, tipo_tarifa, urbano_rural, transformador, tipo_conexion, fases, latitud, longitud',
    ];
    if (hasT) colList.push('tenant_id');
    if (hasBt) colList.push('business_type');
    const onConf = hasT ? `(tenant_id, nis_medidor)` : `(nis_medidor)`;
    const vals = lote
        .map((p) => {
            const base = `(${esc(p.nis_medidor)}, ${esc(p.nis)}, ${esc(p.medidor)}, ${esc(p.nombre)}, ${esc(p.calle)}, ${esc(p.numero)}, ${esc(p.barrioSoc)}, ${esc(p.telefono)}, ${esc(p.dist)}, ${esc(p.loc)}, ${esc(p.provincia)}, ${esc(p.codigo_postal)}, ${esc(p.tar)}, ${esc(p.ur)}, ${esc(p.transf)}, ${esc(p.tcon)}, ${esc(p.fas)}, ${esc(p.latitud)}, ${esc(p.longitud)}`;
            let tail = '';
            if (hasT) tail += `, ${tidEsc}`;
            if (hasBt) tail += `, ${btEsc}`;
            return `${base}${tail})`;
        })
        .join(',');
    const updBt = hasBt ? ', business_type = EXCLUDED.business_type' : '';
    await sqlSimple(
        `INSERT INTO socios_catalogo(${colList.join(', ')})
         VALUES ${vals}
         ON CONFLICT ${onConf} DO UPDATE SET
           nis = COALESCE(EXCLUDED.nis, socios_catalogo.nis),
           medidor = COALESCE(EXCLUDED.medidor, socios_catalogo.medidor),
           nombre = EXCLUDED.nombre, calle = EXCLUDED.calle, numero = EXCLUDED.numero, barrio = EXCLUDED.barrio, telefono = EXCLUDED.telefono, distribuidor_codigo = EXCLUDED.distribuidor_codigo, localidad = EXCLUDED.localidad, provincia = COALESCE(NULLIF(TRIM(EXCLUDED.provincia), ''), socios_catalogo.provincia), codigo_postal = COALESCE(NULLIF(TRIM(EXCLUDED.codigo_postal), ''), socios_catalogo.codigo_postal), tipo_tarifa = EXCLUDED.tipo_tarifa, urbano_rural = EXCLUDED.urbano_rural, transformador = EXCLUDED.transformador, tipo_conexion = EXCLUDED.tipo_conexion, fases = EXCLUDED.fases${updBt},
           latitud = CASE 
             WHEN COALESCE(socios_catalogo.ubicacion_manual, FALSE) = TRUE THEN socios_catalogo.latitud
             WHEN socios_catalogo.latitud IS NOT NULL AND ABS(socios_catalogo.latitud::numeric) > 1e-8 THEN socios_catalogo.latitud 
             ELSE EXCLUDED.latitud 
           END,
           longitud = CASE 
             WHEN COALESCE(socios_catalogo.ubicacion_manual, FALSE) = TRUE THEN socios_catalogo.longitud
             WHEN socios_catalogo.longitud IS NOT NULL AND ABS(socios_catalogo.longitud::numeric) > 1e-8 THEN socios_catalogo.longitud 
             ELSE EXCLUDED.longitud 
           END`
    );
}

let _sociosVirtualScrollRaf = null;
function renderSociosCatalogoVirtual() {
    const wrap = document.getElementById('lista-socios-admin-scroll');
    const tb = document.getElementById('lista-socios-vtbody');
    if (!wrap || !tb || !window._sociosVirtualRows || !window._sociosVirtualRows.length) return;
    const data = window._sociosVirtualRows;
    const total = data.length;
    const rh = window._sociosVirtualRowHeight || 31;
    const buf = 35;
    const st = wrap.scrollTop;
    const vh = wrap.clientHeight || 480;
    let start = Math.floor(st / rh) - buf;
    if (start < 0) start = 0;
    let end = Math.ceil((st + vh) / rh) + buf;
    if (end > total) end = total;
    const padTop = start * rh;
    const padBot = Math.max(0, (total - end) * rh);
    const e = (x) => String(x ?? '').replace(/</g, '&lt;');
    const slice = data.slice(start, end);
    const fmtLon = (v) => {
        if (v == null || v === '') return '—';
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(6) : '—';
    };
    const ncol = window._sociosTablaColCount || obtenerNumColsTablaSociosAdmin();
    tb.innerHTML =
        `<tr class="gn-vspad"><td colspan="${ncol}" style="padding:0;height:${padTop}px;border:none"></td></tr>` +
        slice
            .map((s) => {
                const calleDisp = String(s.calle || '').trim();
                const numDisp = String(s.numero || '').trim();
                const proy = htmlCeldasProyeccionSociosDesdeLatLng(s.latitud, s.longitud);
                return `<tr><td>${e(sociosCatalogoNisCelda(s))}</td><td>${e(sociosCatalogoMedidorCelda(s))}</td><td>${e(s.nombre)}</td><td>${e(s.localidad)}</td><td>${e(s.provincia)}</td><td>${e(s.codigo_postal)}</td><td>${e(s.barrio)}</td><td>${e(s.transformador)}</td><td>${e(s.tipo_tarifa)}</td><td>${e(s.urbano_rural)}</td><td>${e(s.tipo_conexion)}</td><td>${e(s.fases)}</td><td>${e(calleDisp)}</td><td>${e(numDisp)}</td><td>${e(s.telefono)}</td><td>${e(s.distribuidor_codigo)}</td><td align="right" class="gn-soc-coord gn-soc-lat">${fmtLon(s.latitud)}</td><td align="right" class="gn-soc-coord gn-soc-lon">${fmtLon(s.longitud)}</td>${proy}<td>${s.activo ? 'Activo' : 'Baja'}</td></tr>`;
            })
            .join('') +
        `<tr class="gn-vspad"><td colspan="${ncol}" style="padding:0;height:${padBot}px;border:none"></td></tr>`;
}

function bindSociosCatalogoVirtualScroll() {
    const wrap = document.getElementById('lista-socios-admin-scroll');
    if (!wrap || wrap.dataset.gnVirtBound === '1') return;
    wrap.dataset.gnVirtBound = '1';
    wrap.addEventListener(
        'scroll',
        () => {
            if (_sociosVirtualScrollRaf) cancelAnimationFrame(_sociosVirtualScrollRaf);
            _sociosVirtualScrollRaf = requestAnimationFrame(() => {
                _sociosVirtualScrollRaf = null;
                renderSociosCatalogoVirtual();
            });
        },
        { passive: true }
    );
    if (!window.__gnSociosVirtResize) {
        window.__gnSociosVirtResize = true;
        window.addEventListener(
            'resize',
            () => {
                if (window._sociosVirtualRows && window._sociosVirtualRows.length) {
                    requestAnimationFrame(() => renderSociosCatalogoVirtual());
                }
            },
            { passive: true }
        );
    }
}

function _encabezadosNormSetSocios(mapNormAOriginal) {
    return new Set(Object.keys(mapNormAOriginal || {}));
}

function _celdaPareceDmsSocios(v) {
    const s = String(v ?? '');
    return /[°'′″]/.test(s) && /\d/.test(s);
}

/**
 * Muestra de filas del Excel (sin persistir): sugiere WGS84 vs Este/Norte y mensaje de faja Auto / fallback.
 */
async function inferirCrsSociosExcelAntesImport(file) {
    const msgEl = document.getElementById('socios-import-detect-msg');
    const crsSel = document.getElementById('socios-import-crs');
    const fajaSel = document.getElementById('socios-import-faja');
    const setMsg = (t) => {
        if (msgEl) msgEl.textContent = t || '';
    };
    if (!file || typeof XLSX === 'undefined') {
        setMsg('');
        return;
    }
    let buf;
    try {
        buf = await file.arrayBuffer();
    } catch (_) {
        setMsg('');
        return;
    }
    let wb;
    try {
        wb = XLSX.read(buf, { type: 'array' });
    } catch (_) {
        setMsg('No se pudo leer el archivo como Excel.');
        return;
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false, blankrows: false });
    if (!rawRows.length) {
        setMsg('');
        return;
    }
    const primera = rawRows[0];
    const mapNormAOriginal = {};
    Object.keys(primera).forEach((orig) => {
        const n = normalizarEncabezadoExcelSocios(orig);
        if (n && mapNormAOriginal[n] == null) mapNormAOriginal[n] = orig;
    });
    const kn = _encabezadosNormSetSocios(mapNormAOriginal);
    const tieneParesEn =
        (kn.has('este') && kn.has('norte')) ||
        (kn.has('easting') && kn.has('northing')) ||
        (kn.has('coordenada_x') && kn.has('coordenada_y')) ||
        (kn.has('coordenada_e') && kn.has('coordenada_n')) ||
        (kn.has('x') && kn.has('y'));
    const sample = rawRows.slice(0, 25);
    let scoreWgs = 0;
    let scoreEn = 0;
    let scoreDms = 0;
    for (const row of sample) {
        const laRaw = leerCoordExcelSocios(row, mapNormAOriginal, 'latitud', 'lat', 'latitude', 'lat_gps');
        const loRaw = leerCoordExcelSocios(row, mapNormAOriginal, 'longitud', 'lng', 'lon', 'longitude', 'lng_gps');
        const wgs = validarWgs84Import(laRaw, loRaw);
        if (wgs.la != null && wgs.lo != null) scoreWgs++;
        const eVal = leerCoordExcelSocios(
            row,
            mapNormAOriginal,
            'este',
            'oeste',
            'coordenada_e',
            'coordenada_x',
            'easting',
            'e',
            'x',
            'este_m'
        );
        const nVal = leerCoordExcelSocios(
            row,
            mapNormAOriginal,
            'norte',
            'coordenada_n',
            'coordenada_y',
            'northing',
            'n',
            'y',
            'norte_m'
        );
        if (eVal != null && nVal != null) {
            const e = Number(eVal);
            const nn = Number(nVal);
            if (Number.isFinite(e) && Number.isFinite(nn)) {
                const absE = Math.abs(e);
                const absN = Math.abs(nn);
                if (absE >= 50000 && absE <= 9900000 && absN >= 50000 && absN <= 15000000) scoreEn++;
            }
        }
        for (const k of ['latitud', 'lat', 'longitud', 'lng', 'lon']) {
            const o = mapNormAOriginal[k];
            if (o != null && _celdaPareceDmsSocios(row[o])) scoreDms++;
        }
    }
    let modo = null;
    if (scoreEn >= 2 && scoreEn > scoreWgs && tieneParesEn) modo = 'arg_en';
    else if (scoreWgs >= 2) modo = 'wgs84';
    else if (scoreDms >= 2 && scoreWgs < 2) modo = 'wgs84';
    else if (scoreEn >= 1 && scoreWgs === 0 && tieneParesEn) modo = 'arg_en';
    if (!modo) {
        setMsg(
            'Detectado: sin patrón claro en las primeras filas. Elegí manualmente WGS84 o Este/Norte y la faja si aplica.'
        );
        return;
    }
    if (crsSel) crsSel.value = modo;
    if (modo === 'arg_en') {
        if (fajaSel) fajaSel.value = 'auto';
        const fam = String((window.EMPRESA_CFG || {}).coord_proy_familia || '').trim();
        const cfg = window.EMPRESA_CFG || {};
        const loBase = Number(cfg.lng_base);
        const zTxt = Number.isFinite(loBase)
            ? `Auto según longitud de la central (lng_base ≈ ${loBase.toFixed(2)}° → faja ${fajaArgentinaPorLongitud(loBase)}).`
            : 'Auto sin lng_base en empresa: fallback faja 4 (meridiano central ~−64°), igual que el mapa.';
        let det = 'Este/Norte en metros (proyectadas)';
        if (!fam || fam === 'none') {
            det += ' — falta familia en Empresa (Inchauspe / POSGAR): configurá y volvé a importar si el modo Este/Norte falla.';
        } else {
            det += ` Conversión con familia Empresa: ${etiquetaFamiliaProyeccionLarga(fam)}.`;
        }
        setMsg(`Detectado: ${det} ${zTxt}`);
    } else {
        let extra = '';
        if (scoreDms >= 2) extra = ' Texto tipo ° ′ ″: se convierte al importar.';
        setMsg(`Detectado: latitud / longitud WGS84 (decimal o DMS).${extra} En BD se guarda siempre EPSG:4326.`);
    }
}

async function onInputExcelSociosConInferencia(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
        toast('Librería Excel no cargada', 'error');
        event.target.value = '';
        return;
    }
    try {
        await inferirCrsSociosExcelAntesImport(file);
    } catch (e) {
        console.warn('[socios] inferir CRS Excel', e);
        const msgEl = document.getElementById('socios-import-detect-msg');
        if (msgEl) {
            msgEl.textContent =
                'No se pudo analizar el archivo; revisá manualmente el sistema de coordenadas y la faja.';
        }
    }
    try {
        if (typeof actualizarUiSociosImportCrs === 'function') actualizarUiSociosImportCrs();
    } catch (_) {}
    await importarExcelSocios(event);
}
window.onInputExcelSociosConInferencia = onInputExcelSociosConInferencia;

async function importarExcelSocios(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { toast('Librería Excel no cargada', 'error'); return; }
    try {
        if (typeof actualizarUiSociosImportCrs === 'function') actualizarUiSociosImportCrs();
    } catch (_) {}
    const crsMode = document.getElementById('socios-import-crs')?.value || 'wgs84';
    const errMsgs = [];
    try {
        if (crsMode === 'arg_en') {
            const fam = String((window.EMPRESA_CFG || {}).coord_proy_familia || '').trim();
            if (!fam || fam === 'none') {
                toast('Configurá la familia de proyección en Empresa (coordenadas) antes de importar Este/Norte.', 'error');
                event.target.value = '';
                return;
            }
        }
        mostrarOverlayImportacion('Leyendo Excel de socios…');
        const reemplazar = document.getElementById('socios-import-reemplazar')?.checked;
        if (reemplazar) {
            actualizarOverlayImportacion('Vaciando catálogo (preservando coordenadas corregidas manualmente)…');
            // NO borrar filas con ubicacion_manual = TRUE (son correcciones del admin que deben persistir)
            const hasSocTDel = await sociosCatalogoTieneTenantId();
            const tfDel = hasSocTDel ? ` AND tenant_id = ${esc(tenantIdActual())}` : '';
            await sqlSimple(`DELETE FROM socios_catalogo WHERE COALESCE(ubicacion_manual, FALSE) = FALSE${tfDel}`);
            console.info('[import-socios] Catálogo vaciado preservando ubicaciones manuales');
        }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        /* raw:false conserva teléfonos como texto; coords se parsean en leerCoordExcelSocios */
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false, blankrows: false });
        if (!rawRows.length) {
            ocultarOverlayImportacion();
            toast('Excel vacío o sin filas de datos', 'error');
            event.target.value = '';
            return;
        }
        const primera = rawRows[0];
        const mapNormAOriginal = {};
        Object.keys(primera).forEach(orig => {
            const n = normalizarEncabezadoExcelSocios(orig);
            if (n && mapNormAOriginal[n] == null) mapNormAOriginal[n] = orig;
        });
        aliasEncabezadosProvinciaSocios(mapNormAOriginal);
        aliasEncabezadosCpSocios(mapNormAOriginal);
        const payloads = [];
        let filaN = 0;
        for (const row of rawRows) {
            filaN++;
            const rubroSoc = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
            const nisColUni = valorSociosPorEncabezados(row, mapNormAOriginal, 'nis_medidor');
            let nisPart = valorIdentificadorTextoSocios(
                row,
                mapNormAOriginal,
                'nis',
                'id_usuario',
                'id_vecino',
                'numero_vecino',
                'numero_abonado'
            );
            let medPart =
                rubroSoc === 'municipio'
                    ? valorIdentificadorTextoSocios(row, mapNormAOriginal, 'referencia', 'ref', 'observacion')
                    : valorIdentificadorTextoSocios(row, mapNormAOriginal, 'medidor', 'nro_medidor', 'numero_medidor');
            let nis_medidor = nisColUni != null && String(nisColUni).trim() !== '' ? String(nisColUni).trim() : null;
            if (!nis_medidor) {
                if (nisPart && medPart) nis_medidor = `${nisPart}-${medPart}`;
                else nis_medidor = nisPart || medPart;
            }
            if (!nis_medidor) continue;
            if (nisColUni && (!nisPart || !medPart) && /-/.test(String(nisColUni))) {
                const sp = String(nisColUni).split('-');
                if (sp.length >= 2) {
                    if (!nisPart) nisPart = sp[0].trim() || null;
                    if (!medPart) medPart = sp.slice(1).join('-').trim() || null;
                }
            }
            if (filaN % 2500 === 0) {
                actualizarOverlayImportacion(`Analizando Excel… ${filaN} / ${rawRows.length}`);
                await new Promise((r) => setTimeout(r, 0));
            }
            const nombre = valorSociosPorEncabezados(row, mapNormAOriginal, 'nombre', 'razon_social', 'socio');
            let calle = valorSociosPorEncabezados(row, mapNormAOriginal, 'calle', 'calle_nombre', 'via');
            let numero = valorSociosPorEncabezados(row, mapNormAOriginal, 'numero', 'nro', 'num', 'altura', 'numero_calle', 'n');
            const textoDireccionUnica = valorSociosPorEncabezados(row, mapNormAOriginal, 'direccion', 'domicilio');
            if (textoDireccionUnica && !calle && !numero) {
                const t = String(textoDireccionUnica).trim();
                const m = t.match(/^(.+?)\s+(\d{1,6}[a-zA-Z\u00f1\u00b0]?)$/);
                if (m) {
                    calle = m[1].trim();
                    numero = m[2];
                } else {
                    calle = t;
                }
            } else if (textoDireccionUnica && !calle) {
                calle = String(textoDireccionUnica).trim();
            }
            const telefono = valorSociosPorEncabezados(row, mapNormAOriginal, 'telefono', 'tel', 'celular');
            const dist = valorSociosPorEncabezados(row, mapNormAOriginal,
                'distribuidor_codigo', 'distribuidor_', 'distribuidor', 'codigo_distribuidor');
            const loc = valorSociosPorEncabezados(row, mapNormAOriginal, 'localidad', 'ciudad', 'municipio');
            const provinciaSoc = valorSociosPorEncabezados(row, mapNormAOriginal, 'provincia');
            let codigoPostalSoc = valorSociosPorEncabezados(row, mapNormAOriginal, 'codigo_postal');
            if (codigoPostalSoc) {
                const d = String(codigoPostalSoc).replace(/\D/g, '');
                codigoPostalSoc = d.length >= 4 && d.length <= 8 ? d : null;
            }
            const barrioSoc = valorSociosPorEncabezados(row, mapNormAOriginal, 'barrio', 'vecindario', 'zona');
            const tar = valorSociosPorEncabezados(row, mapNormAOriginal, 'tipo_tarifa', 'tarifa', 'tipo_de_tarifa');
            const ur = valorSociosPorEncabezados(row, mapNormAOriginal, 'urbano_rural', 'zona', 'tipo_ubicacion');
            const transf = valorSociosPorEncabezados(row, mapNormAOriginal, 'transformador', 'trafo', 'transformador_codigo');
            const tcon = valorSociosPorEncabezados(row, mapNormAOriginal,
                'tipo_conexion', 'conexion', 'tipo_de_conexion');
            const fas = valorSociosPorEncabezados(row, mapNormAOriginal, 'fases', 'fase', 'cantidad_fases');
            let latitud = null;
            let longitud = null;
            if (crsMode === 'arg_en') {
                const fam = String((window.EMPRESA_CFG || {}).coord_proy_familia || '').trim();
                const eVal = leerCoordExcelSocios(
                    row,
                    mapNormAOriginal,
                    'este',
                    'oeste',
                    'coordenada_e',
                    'coordenada_x',
                    'easting',
                    'e',
                    'x',
                    'este_m'
                );
                const nVal = leerCoordExcelSocios(
                    row,
                    mapNormAOriginal,
                    'norte',
                    'coordenada_n',
                    'coordenada_y',
                    'northing',
                    'n',
                    'y',
                    'norte_m'
                );
                const z = obtenerZonaImportSociosProyectadas();
                const conv = convertirProyectadasARGaWgs84(fam, z, eVal, nVal);
                if (conv) {
                    latitud = conv.lat;
                    longitud = conv.lng;
                }
            } else {
                const laRaw = leerCoordExcelSocios(row, mapNormAOriginal, 'latitud', 'lat', 'latitude', 'lat_gps');
                const loRaw = leerCoordExcelSocios(row, mapNormAOriginal, 'longitud', 'lng', 'lon', 'longitude', 'lng_gps');
                const wgs = validarWgs84Import(laRaw, loRaw);
                latitud = wgs.la;
                longitud = wgs.lo;
            }
            payloads.push({
                nis_medidor,
                nis: nisPart || null,
                medidor: medPart || null,
                nombre,
                calle,
                numero,
                barrioSoc,
                telefono,
                dist,
                loc,
                provincia: provinciaSoc || null,
                codigo_postal: codigoPostalSoc || null,
                tar,
                ur,
                transf,
                tcon,
                fas,
                latitud: latitud != null ? latitud : null,
                longitud: longitud != null ? longitud : null
            });
        }
        let ok = 0;
        let fail = 0;
        const totalPay = payloads.length;
        for (let i = 0; i < totalPay; i += SOCIOS_BULK_CHUNK) {
            const chunk = payloads.slice(i, i + SOCIOS_BULK_CHUNK);
            actualizarOverlayImportacion(`Importando socios… ${Math.min(i + chunk.length, totalPay)} / ${totalPay}`);
            try {
                await ejecutarBulkInsertSociosCatalogo(chunk);
                ok += chunk.length;
            } catch (e) {
                for (const p of chunk) {
                    try {
                        await ejecutarBulkInsertSociosCatalogo([p]);
                        ok++;
                    } catch (e2) {
                        fail++;
                        if (errMsgs.length < 8) errMsgs.push(`NIS ${p.nis_medidor}: ${e2 && e2.message ? e2.message : String(e2)}`);
                    }
                }
            }
            await new Promise((r) => setTimeout(r, 0));
        }
        ocultarOverlayImportacion();
        const sufS = reemplazar ? ' (catálogo reemplazado)' : '';
        if (fail && !ok) {
            toast(`Socios: 0 OK, ${fail} errores${sufS}`, 'error');
            alert('No se pudo completar la importación de socios.\n\n' + errMsgs.join('\n'));
        } else {
            toast(`Socios: ${ok} OK` + (fail ? ', ' + fail + ' errores' : '') + sufS, ok > 0 ? 'success' : 'error');
            if (fail && errMsgs.length) alert('Algunas filas fallaron:\n\n' + errMsgs.join('\n'));
        }
        cargarListaSociosAdmin();
        try {
            const chk = document.getElementById('socios-import-reemplazar');
            if (chk) chk.checked = false;
        } catch (_) {}
    } catch (e) {
        ocultarOverlayImportacion();
        toastError('import-excel-socios', e, 'Error al leer el Excel.');
        alert('Error al importar socios.\n\n' + mensajeErrorUsuario(e));
    }
    event.target.value = '';
}

async function vaciarCoordenadasSociosCatalogo() {
    if (!esAdmin()) {
        toast('Operación solo para administradores', 'error');
        return;
    }
    const hasSocTVaciar = await sociosCatalogoTieneTenantId();
    const confirmar = confirm(
        '⚠️ ¿ELIMINAR TODOS LOS REGISTROS del catálogo de socios?\n\n' +
        (hasSocTVaciar
            ? 'Se borrarán todos los socios de ESTA empresa/sede (tenant actual) solamente.\n'
            : 'Se borrarán TODOS los datos de TODOS los socios (NIS, nombre, dirección, coordenadas, TODO).\n') +
        'Esta acción NO se puede deshacer.\n\n' +
        '¿Continuar?'
    );
    if (!confirmar) return;
    
    const confirmar2 = confirm(
        '⚠️⚠️ ÚLTIMA CONFIRMACIÓN ⚠️⚠️\n\n' +
            (hasSocTVaciar
                ? 'Vas a BORRAR el catálogo de socios de esta empresa/sede.\n\n¿Estás SEGURO/A?'
                : 'Vas a BORRAR TODA LA TABLA de socios_catalogo.\n' +
                  'Se perderán todos los NIS, nombres, direcciones y coordenadas.\n\n' +
                  '¿Estás SEGURO/A?')
    );
    if (!confirmar2) return;

    try {
        mostrarOverlayImportacion('Eliminando registros del catálogo...');
        if (hasSocTVaciar) {
            await sqlSimple(`DELETE FROM socios_catalogo WHERE tenant_id = ${esc(tenantIdActual())}`);
        } else {
            await sqlSimple(`DELETE FROM socios_catalogo`);
        }
        
        ocultarOverlayImportacion();
        
        // Recargar lista
        if (typeof listarSociosAdmin === 'function') {
            await listarSociosAdmin();
        }
        
        toast(
            hasSocTVaciar ? '✓ Catálogo de socios vaciado para esta empresa' : '✓ Tabla de socios eliminada completamente',
            'success'
        );
    } catch (e) {
        ocultarOverlayImportacion();
        console.error('[vaciar-tabla-socios]', e);
        toast('Error al vaciar tabla: ' + (e?.message || e), 'error');
    }
}
// Exponer globalmente para onclick
window.vaciarCoordenadasSociosCatalogo = vaciarCoordenadasSociosCatalogo;

function mostrarFormatoExcelSocios() {
    const rubroSoc = normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo);
    const id1Lbl =
        rubroSoc === 'municipio'
            ? 'numero_vecino'
            : rubroSoc === 'cooperativa_agua'
              ? 'numero_abonado'
              : 'nis';
    const id2Lbl = rubroSoc === 'municipio' ? 'referencia' : 'medidor';
    const sin1 =
        rubroSoc === 'municipio'
            ? 'vecino, n_vecino, numero_vecino'
            : rubroSoc === 'cooperativa_agua'
              ? 'abonado, n_abonado, numero_abonado'
              : 'nis';
    alert(
        'GestorNova — Excel de socios (fila 1 = encabezados; el orden no importa).\n\n' +
            'Elegí arriba: WGS84 (latitud/longitud) o Este/Norte proyectadas (requiere familia de proyección en Empresa).\n\n' +
            'Columnas recomendadas:\n' +
            `${id1Lbl} | ${id2Lbl} | nombre | calle | numero | localidad | (latitud | longitud) o (este | norte)\n\n` +
            `• Identificador principal: ${id1Lbl}. Sinónimos detectados: ${sin1} (incluye variantes nro_/numero_/de_).\n` +
            `• Campo secundario (${id2Lbl}) opcional${rubroSoc === 'municipio' ? ' para municipio' : ''}; alternativa columna única nis_medidor.\n` +
            '• Coordenadas opcionales: vacías → NULL; al fusionar no se borran coords previas.\n' +
            '• WGS84: decimal o texto con ° ′ ″ (DMS). Al elegir el archivo se sugiere el modo (revisá el mensaje «Detectado»).\n' +
            '• Faja «Auto»: meridiano central = lng_base de la empresa; sin base, fallback ~faja 4 (−64°).\n' +
            '• Medidor: preferí texto en Excel para no perder ceros.\n\n' +
            'Opcionales: provincia (también pcia, estado) · codigo_postal (cp, zip, postal) · telefono · distribuidor_codigo · barrio · tipo_tarifa · urbano_rural · transformador · tipo_conexion · fases · direccion (una celda).\n\n' +
            'Importación en lotes. Sin «vaciar», se fusiona por nis_medidor; con «vaciar», se borra el catálogo antes.'
    );
}

async function buscarHistorialPorNIS() {
    const raw = (document.getElementById('historial-nis-input')?.value || '').trim();
    const out = document.getElementById('historial-nis-result');
    if (!raw) { toast('Ingresá NIS o medidor', 'error'); return; }
    if (!out) return;
    out.innerHTML = '<div style="padding:.5rem;color:var(--tm)"><i class="fas fa-circle-notch fa-spin"></i> Buscando…</div>';
    try {
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(`SELECT id, numero_pedido, estado, prioridad, fecha_creacion, fecha_cierre, descripcion, tipo_trabajo FROM pedidos WHERE UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM(${esc(raw)}))${tsql} ORDER BY fecha_creacion DESC LIMIT 100`);
        const rows = r.rows || [];
        if (!rows.length) {
            out.innerHTML = '<p style="color:var(--tm);margin:.25rem 0;padding:.35rem .5rem;background:var(--bg);border-radius:.4rem;border:1px dashed var(--bo)">Sin reclamos para ese NIS o medidor.</p>';
            return;
        }
        const escH = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        out.innerHTML =
            `<div style="font-size:.72rem;color:var(--tm);margin-bottom:.45rem">${rows.length} pedido(s) — <strong>toca una fila</strong> para abrir</div>` +
            '<div style="display:flex;flex-direction:column;gap:.4rem">' +
            rows.map((row) => {
                const np = escH(row.numero_pedido || '');
                const tipo = escH(row.tipo_trabajo || '—');
                const desc = escH(String(row.descripcion || '').substring(0, 140));
                const fecha = escH(fmtInformeFecha(row.fecha_creacion));
                const pid = Number(row.id);
                const safeClick = Number.isFinite(pid) && pid > 0 ? `onclick="cerrarModalDashYAbrirPedido(${pid})"` : '';
                return `<button type="button" class="nis-historial-item" ${safeClick} style="width:100%;text-align:left;cursor:pointer;padding:.55rem .65rem;border:1px solid var(--bo);border-radius:.5rem;background:var(--bg);font:inherit;color:inherit;line-height:1.35;transition:background .15s,border-color .15s,box-shadow .15s">
  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .6rem;margin-bottom:.2rem">
    <strong style="color:var(--bd);font-size:.88rem">#${np}</strong>
    <span style="font-size:.74rem;padding:.12rem .4rem;border-radius:999px;background:#e0e7ff;color:#3730a3">${escH(row.estado || '')}</span>
    <span style="font-size:.74rem;color:var(--tm)">${escH(row.prioridad || '')}</span>
    <span style="font-size:.72rem;color:var(--tl);margin-left:auto"><i class="fas fa-external-link-alt" style="opacity:.65;font-size:.68rem"></i> Abrir</span>
  </div>
  <div style="font-size:.78rem;color:var(--tm)"><strong>Tipo:</strong> ${tipo}</div>
  <div style="font-size:.78rem;color:var(--tl);margin-top:.15rem">${desc}${(row.descripcion && String(row.descripcion).length > 140) ? '…' : ''}</div>
  <div style="font-size:.72rem;color:var(--tl);margin-top:.2rem">${fecha}</div>
</button>`;
            }).join('') +
            '</div>';
    } catch (e) {
        const msg = String(e && e.message != null ? e.message : e).replace(/</g, '&lt;').replace(/&/g, '&amp;');
        out.innerHTML = '<span style="color:var(--re)">' + msg + '</span>';
    }
}

async function resolveCondicionFechaPedidosStats(tsql) {
    const tsqlSafe = tsql || '';
    if (window.__gnFechaInicioOperativa == null) {
        if (NEON_OK && _sql) {
            try {
                const rmin = await sqlSimple(`SELECT MIN(fecha_creacion) AS m FROM pedidos WHERE 1=1${tsqlSafe}`);
                const m = rmin.rows?.[0]?.m;
                window.__gnFechaInicioOperativa = m ? new Date(m) : new Date();
            } catch (_) {
                window.__gnFechaInicioOperativa = new Date(2000, 0, 1);
            }
        } else {
            window.__gnFechaInicioOperativa = new Date(2000, 0, 1);
        }
    }
    const dia = (document.getElementById('est-fecha-dia')?.value || '').trim();
    const mesPick = (document.getElementById('est-mes-filtro')?.value || '').trim();
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        return {
            condFecha: `fecha_creacion::date = ${esc(dia)}::date`,
            fechaDesde: new Date(dia + 'T12:00:00'),
            periodo: 'dia',
        };
    }
    if (mesPick && /^\d{4}-\d{2}$/.test(mesPick)) {
        const d0 = `${mesPick}-01`;
        return {
            condFecha: `fecha_creacion >= ${esc(d0)}::timestamptz AND fecha_creacion < (${esc(d0)}::date + interval '1 month')::timestamptz`,
            fechaDesde: new Date(d0 + 'T12:00:00'),
            periodo: 'mes_pick',
        };
    }
    const periodo = document.getElementById('est-periodo')?.value || 'ejecucion';
    const ahora = new Date();
    let fechaDesde;
    if (periodo === 'mes') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    else if (periodo === '3meses') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
    else if (periodo === 'anio') fechaDesde = new Date(ahora.getFullYear(), 0, 1);
    else if (periodo === 'todo') fechaDesde = new Date('2000-01-01');
    else fechaDesde = window.__gnFechaInicioOperativa || new Date(2000, 0, 1);
    const condFecha = `fecha_creacion >= ${esc(fechaDesde.toISOString())}`;
    return { condFecha, fechaDesde, periodo };
}

function limpiarFiltrosAuxiliaresEstadisticas() {
    const hid = document.getElementById('est-mes-filtro');
    if (hid) hid.value = '';
    const fd = document.getElementById('est-fecha-dia');
    if (fd) fd.value = '';
}
window.limpiarFiltrosAuxiliaresEstadisticas = limpiarFiltrosAuxiliaresEstadisticas;

function aplicarFiltroDiaEstadisticas() {
    const hid = document.getElementById('est-mes-filtro');
    if (hid) hid.value = '';
    void cargarEstadisticas();
}
window.aplicarFiltroDiaEstadisticas = aplicarFiltroDiaEstadisticas;

function escapeCsvCeldaPedidos(v) {
    const s = String(v ?? '');
    if (/[\r\n",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function splitFechaHoraExportAR(v) {
    if (v == null || v === '') return { fecha: '', hora: '' };
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return { fecha: String(v), hora: '' };
    return {
        fecha: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
}

async function exportarPedidosCsvAdmin() {
    if (!esAdmin()) {
        toast('Solo administradores pueden exportar el listado.', 'error');
        return;
    }
    if (!NEON_OK || !_sql) {
        toast('Se requiere conexión a la base (Neon).', 'error');
        return;
    }
    const tsql = await pedidosFiltroTenantSql();
    const { condFecha } = await resolveCondicionFechaPedidosStats(tsql);
    const estadoSel = (document.getElementById('est-csv-estado')?.value || '').trim();
    const tipoFilt = (document.getElementById('est-csv-tipo')?.value || '').trim();
    let where = `WHERE ${condFecha}${tsql}`;
    if (estadoSel) where += ` AND estado = ${esc(estadoSel)}`;
    if (tipoFilt) {
        where += ` AND POSITION(LOWER(${esc(tipoFilt.toLowerCase())}) IN LOWER(COALESCE(tipo_trabajo,''))) > 0`;
    }
    const q = `SELECT id, numero_pedido, fecha_creacion, fecha_cierre, estado, prioridad, tipo_trabajo,
        COALESCE(TRIM(distribuidor),'') AS distribuidor,
        COALESCE(TRIM(barrio),'') AS barrio,
        COALESCE(TRIM(trafo),'') AS trafo,
        COALESCE(TRIM(nis_medidor),'') AS nis_medidor,
        COALESCE(NULLIF(TRIM(cliente_nombre),''), NULLIF(TRIM(cliente),''), '') AS contacto,
        COALESCE(TRIM(cliente_calle),'') AS cliente_calle,
        COALESCE(TRIM(cliente_numero_puerta),'') AS cliente_numero_puerta,
        COALESCE(TRIM(cliente_localidad),'') AS cliente_localidad,
        COALESCE(TRIM(telefono_contacto),'') AS telefono_contacto,
        descripcion
        FROM pedidos ${where} ORDER BY fecha_creacion DESC LIMIT 10000`;
    try {
        const r = await sqlSimple(q);
        const rows = r.rows || [];
        if (!rows.length) {
            toast('No hay pedidos con esos filtros.', 'info');
            return;
        }
        const headers = [
            'id',
            'numero_pedido',
            'fecha_creacion_fecha',
            'fecha_creacion_hora',
            'fecha_cierre_fecha',
            'fecha_cierre_hora',
            'estado',
            'prioridad',
            'tipo_trabajo',
            'distribuidor',
            'barrio',
            'trafo',
            'nis_medidor',
            'contacto',
            'cliente_calle',
            'cliente_numero_puerta',
            'cliente_localidad',
            'direccion_consolidada',
            'telefono_contacto',
            'descripcion',
        ];
        const lines = [headers.join(',')];
        for (const row of rows) {
            const fc = splitFechaHoraExportAR(row.fecha_creacion);
            const ff = splitFechaHoraExportAR(row.fecha_cierre);
            lines.push(
                [
                    row.id,
                    row.numero_pedido,
                    fc.fecha,
                    fc.hora,
                    ff.fecha,
                    ff.hora,
                    row.estado,
                    row.prioridad,
                    row.tipo_trabajo,
                    row.distribuidor,
                    row.barrio,
                    row.trafo,
                    row.nis_medidor,
                    row.contacto,
                    row.cliente_calle,
                    row.cliente_numero_puerta,
                    row.cliente_localidad,
                    [row.cliente_calle, row.cliente_numero_puerta, row.cliente_localidad].filter(Boolean).join(', ') || '',
                    row.telefono_contacto,
                    row.descripcion,
                ]
                    .map(escapeCsvCeldaPedidos)
                    .join(',')
            );
        }
        const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `pedidos_export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast(`Exportados ${rows.length} pedidos`, 'success');
    } catch (e) {
        toastError('export-pedidos-csv', e);
    }
}
window.exportarPedidosCsvAdmin = exportarPedidosCsvAdmin;

function periodoInformeDesdeSelectEstadisticasSync() {
    const dia = (document.getElementById('est-fecha-dia')?.value || '').trim();
    const mesPick = (document.getElementById('est-mes-filtro')?.value || '').trim();
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        return {
            condFecha: `fecha_creacion::date = ${esc(dia)}::date`,
            fechaDesde: new Date(dia + 'T12:00:00'),
            periodo: 'dia',
        };
    }
    if (mesPick && /^\d{4}-\d{2}$/.test(mesPick)) {
        const d0 = `${mesPick}-01`;
        return {
            condFecha: `fecha_creacion >= ${esc(d0)}::timestamptz AND fecha_creacion < (${esc(d0)}::date + interval '1 month')::timestamptz`,
            fechaDesde: new Date(d0 + 'T12:00:00'),
            periodo: 'mes_pick',
        };
    }
    const periodo = document.getElementById('est-periodo')?.value || 'ejecucion';
    const ahora = new Date();
    let fechaDesde;
    if (periodo === 'mes') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    else if (periodo === '3meses') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
    else if (periodo === 'anio') fechaDesde = new Date(ahora.getFullYear(), 0, 1);
    else if (periodo === 'todo') fechaDesde = new Date('2000-01-01');
    else fechaDesde = window.__gnFechaInicioOperativa || new Date(2000, 0, 1);
    const condFecha = `fecha_creacion >= ${esc(fechaDesde.toISOString())}`;
    return { periodo, fechaDesde, condFecha };
}

/** @deprecated Usar periodoInformeDesdeSelectEstadisticasSync; nombre conservado para compat. */
function periodoInformeDesdeSelectEstadisticas() {
    return periodoInformeDesdeSelectEstadisticasSync();
}

function periodoInformeEtiquetaHumana(periodo) {
    const m = {
        mes: 'Mes en curso',
        '3meses': 'Últimos 3 meses (ventana móvil)',
        anio: 'Año calendario en curso',
        todo: 'Histórico completo',
        ejecucion: 'Desde el inicio operativo hasta hoy',
        dia: 'Un día seleccionado',
        mes_pick: 'Mes seleccionado (desde el gráfico o filtro)',
    };
    return m[periodo] || String(periodo || '');
}

function lineaPeriodoInformeEstadisticas() {
    const { periodo, fechaDesde } = periodoInformeDesdeSelectEstadisticas();
    const ph = periodoInformeEtiquetaHumana(periodo);
    const fd = fechaDesde.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    const gen = new Date().toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'medium' });
    return `Período analizado: ${ph} · desde ${fd} · Generado ${gen}`;
}

function escInformePdfTexto(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function construirHtmlEncabezadoInformeEmpresa(lineaPeriodo) {
    const nombre = String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
    const sub = GN_SUBTITULO_FIJO;
    const logo = String(window.EMPRESA_CFG?.logo_url || '').trim();
    const logoSrc = escInformePdfTexto(logo || 'gestornova-logo.png');
    const lp = lineaPeriodo
        ? `<div style="margin-top:6px;font-size:9px;color:#64748b;line-height:1.35">${escInformePdfTexto(lineaPeriodo)}</div>`
        : '';
    return (
        `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:10px 12px;background:linear-gradient(180deg,#fff,#f8fafc);border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 1px 2px rgba(15,23,42,.06)">` +
        `<img src="${logoSrc}" alt="" width="48" height="48" style="width:48px;height:48px;object-fit:contain;border-radius:8px;flex-shrink:0" crossorigin="anonymous"/>` +
        `<div style="min-width:0;flex:1"><div style="font-size:16px;font-weight:800;color:#1e3a8a;letter-spacing:-.02em">${escInformePdfTexto(nombre)}</div>` +
        (sub ? `<div style="font-size:10px;color:#475569;margin-top:2px">${escInformePdfTexto(sub)}</div>` : '') +
        `${lp}</div></div>`
    );
}

async function logoEmpresaBase64ParaPdf() {
    const logo = String(window.EMPRESA_CFG?.logo_url || '').trim();
    const path = logo || 'gestornova-logo.png';
    try {
        const abs = new URL(path, window.location.href).href;
        const r = await fetch(abs, { credentials: 'same-origin' });
        if (!r.ok) return null;
        const buf = await r.arrayBuffer();
        const b64 = _arrayBufferToBase64(buf);
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('jpeg') || /\.jpe?g(\?|$)/i.test(path)) return { b64, fmt: 'JPEG' };
        return { b64, fmt: 'PNG' };
    } catch (_) {
        return null;
    }
}

/** Encabezado A4 en jsPDF: logo + nombre + subtítulo + líneas de período. Devuelve Y inferior del bloque. */
async function pdfEncabezadoEmpresaBloque(pdf, margin, pageW, yStart, lineasPeriodo) {
    const maxW = pageW - 2 * margin;
    let xTexto = margin;
    let y = yStart;
    const lg = await logoEmpresaBase64ParaPdf();
    if (lg) {
        try {
            pdf.addImage('data:image/' + lg.fmt.toLowerCase() + ';base64,' + lg.b64, lg.fmt, margin, y, 9, 9);
            xTexto = margin + 11;
        } catch (_) {}
    }
    const nombre = String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
    const sub = GN_SUBTITULO_FIJO;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(30, 58, 138);
    pdf.text(nombre, xTexto, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.6);
    pdf.setTextColor(71, 85, 105);
    let y2 = y + 9;
    if (sub) {
        const subL = pdf.splitTextToSize(sub, maxW - (xTexto - margin));
        pdf.text(subL, xTexto, y2);
        y2 += subL.length * 3.3;
    }
    pdf.setFontSize(7.2);
    pdf.setTextColor(100, 116, 139);
    const perL = pdf.splitTextToSize(String(lineasPeriodo || ''), maxW);
    pdf.text(perL, margin, y2 + 2);
    y2 += perL.length * 3.1;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.35);
    pdf.line(margin, y2 + 3, pageW - margin, y2 + 3);
    return y2 + 5;
}

async function exportInformeMensualExcel() {
    if (!esAdmin()) { toast('Solo administrador', 'error'); return; }
    if (modoOffline || !NEON_OK) { toast('Requiere conexión', 'error'); return; }
    if (!window.XLSX || !XLSX.utils) { toast('Excel aún no cargó — esperá unos segundos y reintentá', 'error'); return; }
    try {
        const tsql = await pedidosFiltroTenantSql();
        const { fechaDesde, condFecha } = await resolveCondicionFechaPedidosStats(tsql);
        const r = await sqlSimple(`SELECT numero_pedido, nis_medidor, estado, prioridad, fecha_creacion, fecha_cierre, distribuidor, tipo_trabajo, descripcion,
            COALESCE(NULLIF(TRIM(cliente_nombre),''), NULLIF(TRIM(cliente),''), '') AS cliente_nombre,
            COALESCE(TRIM(cliente_calle),'') AS cliente_calle,
            COALESCE(TRIM(cliente_numero_puerta),'') AS cliente_numero_puerta,
            COALESCE(TRIM(cliente_localidad),'') AS cliente_localidad,
            COALESCE(TRIM(telefono_contacto),'') AS telefono_contacto
            FROM pedidos WHERE ${condFecha}${tsql} ORDER BY fecha_creacion DESC LIMIT 500`);
        const rows = (r.rows || []).map(row => {
            const fc = splitFechaHoraExportAR(row.fecha_creacion);
            const ff = splitFechaHoraExportAR(row.fecha_cierre);
            return {
                Pedido: row.numero_pedido,
                NIS: row.nis_medidor,
                Estado: row.estado,
                Prioridad: row.prioridad,
                Creado_fecha: fc.fecha,
                Creado_hora: fc.hora,
                Cierre_fecha: ff.fecha,
                Cierre_hora: ff.hora,
                Distribuidor: row.distribuidor,
                Tipo: row.tipo_trabajo,
                Descripcion: row.descripcion,
                Cliente: row.cliente_nombre,
                Calle: row.cliente_calle,
                Numero: row.cliente_numero_puerta,
                Localidad: row.cliente_localidad,
                Telefono: row.telefono_contacto,
                Direccion_consolidada: [row.cliente_calle, row.cliente_numero_puerta, row.cliente_localidad].filter(Boolean).join(', ') || '',
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Pedido: '—', Nota: 'Sin filas en el período' }]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
        const suf = fechaDesde.toISOString().slice(0, 10);
        XLSX.writeFile(wb, `gestornova_pedidos_${suf}.xlsx`);
        toast('Excel descargado', 'success');
    } catch (e) { toastError('export-excel-pedidos', e); }
}

function tituloChartEstadisticas(el) {
    const h4 = el?.querySelector?.('h4');
    const t = (h4?.textContent || '').replace(/\s+/g, ' ').trim();
    return t || 'Gráfico';
}

/** Altura visible real (evita scrollHeight inflado por flex/grid del panel admin). */
function alturaContenidoCaptura(el) {
    if (!el) return 40;
    const r0 = el.getBoundingClientRect();
    let maxB = r0.top;
    const walk = (n) => {
        if (!n || n.nodeType !== 1) return;
        const st = window.getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return;
        const br = n.getBoundingClientRect();
        if (br.width >= 1 && br.height >= 1) maxB = Math.max(maxB, br.bottom);
        for (let i = 0; i < n.children.length; i++) walk(n.children[i]);
    };
    walk(el);
    const h = Math.ceil(maxB - r0.top + 12);
    const mx = Math.min(Math.max(el.scrollHeight, el.offsetHeight, 40), 3200);
    return Math.max(40, Math.min(h, mx));
}

function pdfMmAjustarImagen(cw, ch, maxWmm, maxHmm) {
    const ar = cw / ch;
    let iw = maxWmm;
    let ih = iw / ar;
    if (ih > maxHmm) {
        ih = maxHmm;
        iw = ih * ar;
    }
    return { iw, ih };
}

let _chartDataSnapshotForPdf = null;

function adminEstadisticasSetCaptureCompact(on) {
    const root = document.getElementById('admin-estadisticas');
    if (root) root.classList.toggle('gn-stats-capture-compact', !!on);
    if (typeof window !== 'undefined') window.__gnStatsInkSave = !!on;
}

function aplicarEstadisticasInkSaveCharts(activar) {
    /** PDF / impresión: conservar los mismos colores pasteles que en pantalla (sin escala de grises). */
    if (activar) {
        if (_chartDataSnapshotForPdf) return;
        _chartDataSnapshotForPdf = { _noop: true };
        Object.values(_charts).forEach((chart) => {
            try {
                chart.update('none');
            } catch (_) {}
        });
    } else {
        _chartDataSnapshotForPdf = null;
        Object.values(_charts).forEach((chart) => {
            try {
                chart.update('none');
            } catch (_) {}
        });
    }
}

async function prepararVistaCapturaEstadisticasPdf(activar) {
    adminEstadisticasSetCaptureCompact(!!activar);
    aplicarEstadisticasInkSaveCharts(!!activar);
    Object.values(_charts).forEach(ch => {
        try {
            ch.resize();
        } catch (_) {}
    });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, activar ? 220 : 90));
}

function coleccionSeccionesPdfEstadisticas() {
    const root = document.getElementById('admin-estadisticas');
    if (!root) return [];
    const out = [{ type: 'resumen' }];
    root.querySelectorAll('.chart-wrap').forEach(w => {
        try {
            if (window.getComputedStyle(w).display === 'none') return;
            out.push({ type: 'chart', el: w, title: tituloChartEstadisticas(w) });
        } catch (_) {}
    });
    return out;
}

async function capturaPdfBloqueResumenEstadisticas() {
    const marco = document.getElementById('enre-marco');
    const cards = document.getElementById('stats-cards');
    const wrap = document.createElement('div');
    wrap.setAttribute('style', 'position:fixed;left:-12000px;top:0;width:720px;padding:12px 14px;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;font-family:system-ui,Segoe UI,sans-serif');
    const headDiv = document.createElement('div');
    headDiv.innerHTML = construirHtmlEncabezadoInformeEmpresa(lineaPeriodoInformeEstadisticas());
    wrap.appendChild(headDiv);
    if (marco) {
        const m = marco.cloneNode(true);
        m.querySelectorAll('a').forEach(a => {
            a.setAttribute('href', '#');
            a.style.textDecoration = 'none';
            a.style.color = '#1e40af';
        });
        wrap.appendChild(m);
    }
    if (cards) wrap.appendChild(cards.cloneNode(true));
    document.body.appendChild(wrap);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 70));
    let canvas = null;
    try {
        const sh = Math.max(alturaContenidoCaptura(wrap), wrap.offsetHeight, 48);
        canvas = await html2canvas(wrap, {
            scale: 1.12,
            useCORS: true,
            logging: false,
            backgroundColor: '#f8fafc',
            width: 720,
            height: sh,
            windowWidth: 720,
            windowHeight: sh,
        });
    } catch (e) {
        console.warn('[pdf-resumen]', e);
    }
    document.body.removeChild(wrap);
    return canvas;
}

async function html2canvasCapturaElemento(el, opts = {}) {
    if (!el || typeof html2canvas !== 'function') return null;
    const delayAfterResize = typeof opts.delayAfterResize === 'number' ? opts.delayAfterResize : 200;
    const statsExport = !!opts.statsExport;
    try {
        Object.values(_charts).forEach(ch => { try { ch.resize(); } catch (_) {} });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, delayAfterResize));
        const sw = Math.max(el.offsetWidth, el.clientWidth, 120);
        const rawSh =
            opts.useFullScrollHeight || statsExport
                ? Math.max(el.scrollHeight, el.offsetHeight, 40)
                : Math.max(alturaContenidoCaptura(el), el.offsetHeight, 40);
        const sh = Math.min(rawSh, statsExport ? opts.maxHeightPx || 4600 : opts.maxHeightPx || 3800);
        const scale = statsExport
            ? Math.min(2.65, 2700 / Math.max(sw, 260))
            : Math.min(1.2, 1850 / Math.max(sw, 380));
        return await html2canvas(el, {
            scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: sw,
            height: sh,
            windowWidth: sw,
            windowHeight: sh,
            scrollX: 0,
            scrollY: 0,
            onclone: (_doc, node) => {
                try {
                    node.classList.add('gn-capture-pdf');
                    node.style.overflow = 'visible';
                    node.style.height = 'auto';
                    node.style.minHeight = '0';
                    node.style.maxHeight = 'none';
                    node.style.alignSelf = 'flex-start';
                    node.querySelectorAll('button').forEach(b => { b.style.visibility = 'hidden'; });
                } catch (_) {}
            }
        });
    } catch (e) {
        console.warn('html2canvas elemento', e);
        return null;
    }
}

async function html2canvasCapturaEstadisticasCompleta(el) {
    return html2canvasCapturaElemento(el, { delayAfterResize: 400 });
}

function escAttrPrint(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

async function imprimirInformeConGraficos() {
    if (!esAdmin()) { toast('Solo administrador', 'error'); return; }
    if (modoOffline || !NEON_OK) { toast('Requiere conexión', 'error'); return; }
    if (typeof html2canvas !== 'function') { toast('html2canvas no disponible', 'error'); return; }
    document.getElementById('admin-panel')?.classList.add('active');
    adminTab('estadisticas');
    await cargarEstadisticas();
    await new Promise(r => setTimeout(r, 500));
    const secciones = coleccionSeccionesPdfEstadisticas();
    if (!secciones.length) { toast('No hay secciones para imprimir', 'error'); return; }
    const urls = [];
    const liberarUrls = () => {
        urls.forEach(u => {
            try {
                URL.revokeObjectURL(u);
            } catch (_) {}
        });
    };
    await prepararVistaCapturaEstadisticasPdf(true);
    try {
        toast('Generando vista para imprimir…', 'info');
        const canvasToUrl = canvas =>
            new Promise((res, rej) => {
                try {
                    canvas.toBlob(
                        b => {
                            if (!b) return rej(new Error('toBlob'));
                            const u = URL.createObjectURL(b);
                            urls.push(u);
                            res(u);
                        },
                        'image/png'
                    );
                } catch (e) {
                    rej(e);
                }
            });
        const pageBlocks = [];
        const chartBuf = [];
        const flushChartsFullRows = () => {
            while (chartBuf.length >= 4) {
                pageBlocks.push({
                    kind: 'grid4',
                    items: chartBuf.splice(0, 4).map(it => ({ url: it.url, title: it.title })),
                });
            }
        };
        for (const sec of secciones) {
            if (sec.type === 'resumen') {
                flushChartsFullRows();
                if (chartBuf.length) {
                    pageBlocks.push({
                        kind: 'grid4',
                        items: chartBuf.splice(0, chartBuf.length).map(it => ({ url: it.url, title: it.title })),
                    });
                }
                const canvas = await capturaPdfBloqueResumenEstadisticas();
                if (canvas) {
                    const u = await canvasToUrl(canvas);
                    pageBlocks.push({ kind: 'resumen', url: u, title: 'Resumen y referencia ENRE' });
                }
            } else if (sec.type === 'chart') {
                const canvas = await html2canvasCapturaElemento(sec.el, {
                    delayAfterResize: 120,
                    statsExport: true,
                    maxHeightPx: 2800,
                });
                if (canvas) {
                    const u = await canvasToUrl(canvas);
                    chartBuf.push({ url: u, title: sec.title });
                    flushChartsFullRows();
                }
            }
        }
        if (chartBuf.length) {
            pageBlocks.push({
                kind: 'grid4',
                items: chartBuf.map(it => ({ url: it.url, title: it.title })),
            });
        }
        if (!pageBlocks.length) {
            toast('No se pudo capturar el panel', 'error');
            return;
        }
        const w = window.open('', '_blank');
        if (!w) {
            liberarUrls();
            toast('Permití ventanas emergentes para imprimir', 'error');
            return;
        }
        const ent = String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
        const subt = lineaPeriodoInformeEstadisticas();
        const totalPag = pageBlocks.length;
        const notaPie =
            '<p class="gn-print-nota">Documento para gestión interna. Desactivá «Encabezado y pie de página» del navegador al imprimir para evitar URLs en el borde.</p>';
        const hdrHtml = construirHtmlEncabezadoInformeEmpresa(subt);
        const bloques = pageBlocks
            .map((bl, pi) => {
                const pnum = pi + 1;
                const pie = `<footer class="gn-print-footer">Página ${pnum} / ${totalPag} · ${escAttrPrint(ent)}</footer>`;
                const notaUlt = pi === totalPag - 1 ? notaPie : '';
                if (bl.kind === 'resumen') {
                    return (
                        `<section class="gn-print-page gn-print-page--first">` +
                        `<div class="gn-print-empresa-head">${hdrHtml}</div>` +
                        `<h1 class="gn-print-h1">${escAttrPrint(bl.title)}</h1>` +
                        `<p class="gn-print-sub">${escAttrPrint(subt)}</p>` +
                        `<div class="gn-print-imgwrap gn-print-imgwrap--full"><img src="${bl.url}" alt=""/></div>${pie}${notaUlt}</section>`
                    );
                }
                const cells = bl.items
                    .map(
                        (it, idx) =>
                            `<div class="gn-print-cell">` +
                            `<h2 class="gn-print-h2cell">${escAttrPrint(it.title || 'Gráfico ' + (idx + 1))}</h2>` +
                            `<div class="gn-print-imgwrap gn-print-imgwrap--cell"><img src="${it.url}" alt=""/></div></div>`
                    )
                    .join('');
                return (
                    `<section class="gn-print-page gn-print-page--grid">` +
                    `<p class="gn-print-sub gn-print-sub--tight">${escAttrPrint(subt)}</p>` +
                    `<div class="gn-print-grid4">${cells}</div>${pie}${notaUlt}</section>`
                );
            })
            .join('');
        const css =
            '@page{size:A4;margin:10mm}' +
            '*{box-sizing:border-box}' +
            'body{margin:0;background:#fff;font-family:system-ui,Segoe UI,sans-serif;color:#0f172a}' +
            '.gn-print-page{page-break-after:always;break-after:page;padding:0 0 4mm}' +
            '.gn-print-page:last-child{page-break-after:auto;break-after:auto}' +
            '.gn-print-h1{font-size:11pt;font-weight:700;color:#1e3a8a;margin:0 0 2mm;letter-spacing:.02em;border-bottom:1px solid #e2e8f0;padding-bottom:2mm}' +
            '.gn-print-sub{font-size:7.5pt;color:#64748b;margin:0 0 3mm;line-height:1.35}' +
            '.gn-print-sub--tight{margin-bottom:2mm}' +
            '.gn-print-grid4{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:3mm;align-content:start;align-items:start}' +
            '.gn-print-cell{display:flex;flex-direction:column;align-items:center;min-height:0;overflow:hidden;max-height:118mm}' +
            '.gn-print-h2cell{font-size:8.5pt;font-weight:700;color:#334155;margin:0 0 1mm;padding:0;border:none;width:100%;text-align:center}' +
            '.gn-print-imgwrap{display:flex;justify-content:center;align-items:center}' +
            '.gn-print-imgwrap--full img{display:block;max-width:100%;width:auto;height:auto;max-height:258mm;object-fit:contain}' +
            '.gn-print-imgwrap--cell{flex:1;width:100%;min-height:0}' +
            '.gn-print-imgwrap--cell img{display:block;max-width:100%;max-height:112mm;width:auto;height:auto;margin:0 auto;object-fit:contain}' +
            '.gn-print-footer{font-size:7pt;color:#64748b;text-align:center;margin-top:3mm;padding-top:2mm;border-top:1px solid #e2e8f0}' +
            '.gn-print-empresa-head{font-size:8.5pt;color:#334155;margin-bottom:4mm;break-inside:avoid}' +
            '.gn-print-nota{font-size:7pt;color:#94a3b8;margin:4mm 0 0;break-inside:avoid;page-break-inside:avoid}';
        w.document.write(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
                escAttrPrint(ent) +
                ' — Estadísticas</title><style>' +
                css +
                '</style></head><body>' + bloques + '</body></html>'
        );
        w.document.close();
        w.focus();
        setTimeout(() => {
            try {
                w.print();
            } catch (_) {}
        }, 500);
        setTimeout(liberarUrls, 120000);
    } catch (e) {
        liberarUrls();
        toastError('imprimir-stats-graficos', e);
    } finally {
        await prepararVistaCapturaEstadisticasPdf(false);
    }
}

async function generarPdfEstadisticasMultipaginaENRE() {
    if (!esAdmin()) { toast('Solo administrador', 'error'); return; }
    if (modoOffline || !NEON_OK) { toast('Requiere conexión', 'error'); return; }
    if (typeof html2canvas !== 'function' || !window.jspdf?.jsPDF) { toast('Faltan librerías (html2canvas / jsPDF)', 'error'); return; }
    document.getElementById('admin-panel')?.classList.add('active');
    adminTab('estadisticas');
    await cargarEstadisticas();
    await new Promise(r => setTimeout(r, 500));
    const secciones = coleccionSeccionesPdfEstadisticas();
    if (!secciones.length) { toast('No hay contenido para el PDF', 'error'); return; }
    await prepararVistaCapturaEstadisticasPdf(true);
    try {
        toast('Generando PDF…', 'info');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 11;
        const tsqlPdf = await pedidosFiltroTenantSql();
        const { periodo, fechaDesde } = await resolveCondicionFechaPedidosStats(tsqlPdf);
        const lineaPer = lineaPeriodoInformeEstadisticas();
        let nPag = 0;
        const addCanvasPage = async (canvas, chartTitle) => {
            if (!canvas || !canvas.width) return;
            const maxW = pageW - 2 * margin;
            if (nPag > 0) pdf.addPage();
            nPag++;
            pdf.setFillColor(252, 252, 253);
            pdf.rect(0, 0, pageW, pageH, 'F');
            let y0 = await pdfEncabezadoEmpresaBloque(pdf, margin, pageW, margin, lineaPer);
            if (chartTitle) {
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8.4);
                pdf.setTextColor(51, 65, 85);
                pdf.text(String(chartTitle).slice(0, 72), margin, y0 + 2.5);
                y0 += 5;
            }
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const maxH = Math.max(40, pageH - y0 - margin - 2);
            const { iw, ih } = pdfMmAjustarImagen(canvas.width, canvas.height, maxW, maxH);
            const x0 = margin + (maxW - iw) / 2;
            pdf.addImage(imgData, 'JPEG', x0, y0 + 1, iw, ih, undefined, 'FAST');
        };
        const addChartsPageCombined = async (entries) => {
            const list = (entries || []).filter((e) => e?.canvas?.width);
            if (!list.length) return;
            if (nPag > 0) pdf.addPage();
            nPag++;
            pdf.setFillColor(252, 252, 253);
            pdf.rect(0, 0, pageW, pageH, 'F');
            let y0 = await pdfEncabezadoEmpresaBloque(pdf, margin, pageW, margin, lineaPer);
            y0 += 1.5;
            const gap = 3;
            const maxW = pageW - 2 * margin;
            const maxH = pageH - y0 - margin - 2;
            const titleH = 4.2;
            const drawTitle = (title, x, y) => {
                if (!title) return;
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7);
                pdf.setTextColor(71, 85, 105);
                pdf.text(String(title).slice(0, 56), x, y);
            };
            const placeImg = (canvas, x, y, wBox, hBox) => {
                const imgData = canvas.toDataURL('image/jpeg', 0.87);
                const { iw, ih } = pdfMmAjustarImagen(canvas.width, canvas.height, Math.max(20, wBox - 1), Math.max(24, hBox));
                const xi = x + (wBox - iw) / 2;
                const yi = y + (hBox - ih) / 2;
                pdf.addImage(imgData, 'JPEG', xi, yi, iw, ih, undefined, 'FAST');
            };
            const n = list.length;
            if (n === 1) {
                const e = list[0];
                drawTitle(e.title, margin, y0 + 2.8);
                placeImg(e.canvas, margin, y0 + titleH, maxW, maxH - titleH - 1);
                return;
            }
            if (n === 2) {
                const cellW = (maxW - gap) / 2;
                const imgH = maxH - titleH - 2;
                list.forEach((e, i) => {
                    const xCell = margin + i * (cellW + gap);
                    drawTitle(e.title, xCell + 0.5, y0 + 2.8);
                    placeImg(e.canvas, xCell, y0 + titleH, cellW, imgH);
                });
                return;
            }
            if (n === 3) {
                const row1H = maxH * 0.56;
                const row2H = maxH - row1H - gap;
                const cellW = (maxW - gap) / 2;
                const imgH1 = Math.max(28, row1H - titleH - 1.5);
                for (let i = 0; i < 2; i++) {
                    const e = list[i];
                    const xCell = margin + i * (cellW + gap);
                    drawTitle(e.title, xCell + 0.5, y0 + 2.8);
                    placeImg(e.canvas, xCell, y0 + titleH, cellW, imgH1);
                }
                const e = list[2];
                const w3 = Math.min(maxW * 0.78, maxW);
                const x3 = margin + (maxW - w3) / 2;
                const y2 = y0 + row1H + gap;
                drawTitle(e.title, x3 + 0.5, y2 + 2.5);
                placeImg(e.canvas, x3, y2 + titleH, w3, row2H - titleH - 1);
                return;
            }
            const cellW = (maxW - gap) / 2;
            const cellH = (maxH - gap) / 2;
            const imgMaxH = Math.max(28, cellH - titleH - 1.5);
            list.forEach((e, i) => {
                const row = Math.floor(i / 2);
                const col = i % 2;
                const xCell = margin + col * (cellW + gap);
                const yCell = y0 + row * (cellH + gap);
                drawTitle(e.title, xCell + 0.5, yCell + 2.8);
                placeImg(e.canvas, xCell, yCell + titleH, cellW, imgMaxH);
            });
        };
        const chartQueue = [];
        const flushChartRows = async () => {
            while (chartQueue.length >= 4) {
                await addChartsPageCombined(chartQueue.splice(0, 4));
            }
        };
        for (const sec of secciones) {
            if (sec.type === 'resumen') {
                await flushChartRows();
                if (chartQueue.length) await addChartsPageCombined(chartQueue.splice(0, chartQueue.length));
                await addCanvasPage(await capturaPdfBloqueResumenEstadisticas(), null);
            } else if (sec.type === 'chart') {
                const c = await html2canvasCapturaElemento(sec.el, {
                    delayAfterResize: 120,
                    statsExport: true,
                    maxHeightPx: 2800,
                });
                if (c) {
                    chartQueue.push({ canvas: c, title: sec.title });
                    await flushChartRows();
                }
            }
        }
        if (chartQueue.length) await addChartsPageCombined(chartQueue);
        if (nPag === 0) {
            toast('No se pudo generar ninguna página', 'error');
            return;
        }
        kpiPdfPiePaginas(pdf);
        const slug = String(window.EMPRESA_CFG?.nombre || 'GestorNova').replace(/[^\w\-]+/g, '_').slice(0, 48);
        pdf.save(`${slug}_estadisticas_A4_${periodo}_${fechaDesde.toISOString().slice(0, 10)}.pdf`);
        toast('PDF listo', 'success');
    } catch (e) {
        toastError('pdf-estadisticas-enre', e, 'Error al generar el PDF.');
    } finally {
        await prepararVistaCapturaEstadisticasPdf(false);
    }
}

async function generarInformeMensualENRE() {
    if (!esAdmin()) { toast('Solo administrador', 'error'); return; }
    if (modoOffline || !NEON_OK) { toast('Requiere conexión', 'error'); return; }
    try {
        const tsql = await pedidosFiltroTenantSql();
        const { fechaDesde, condFecha } = await resolveCondicionFechaPedidosStats(tsql);
        const r = await sqlSimple(`SELECT numero_pedido, nis_medidor, estado, prioridad, fecha_creacion, fecha_cierre, distribuidor, tipo_trabajo, descripcion,
            COALESCE(NULLIF(TRIM(cliente_nombre),''), NULLIF(TRIM(cliente),''), '') AS cliente_nombre,
            COALESCE(TRIM(cliente_calle),'') AS cliente_calle,
            COALESCE(TRIM(cliente_numero_puerta),'') AS cliente_numero_puerta,
            COALESCE(TRIM(cliente_localidad),'') AS cliente_localidad
            FROM pedidos WHERE ${condFecha}${tsql} ORDER BY fecha_creacion DESC LIMIT 500`);
        const rows = r.rows || [];
        const ent = String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
        const tit = ent + ' — Informe de pedidos';
        const hdr = construirHtmlEncabezadoInformeEmpresa(lineaPeriodoInformeEstadisticas());
        let tab = '<p style="font-size:7.5pt;color:#475569;margin:0 0 .35rem">Arrastrá el borde derecho de cada encabezado para ajustar el ancho de columna antes de imprimir.</p><table id="gn-informe-pedidos-tab"><thead><tr><th>Pedido</th><th>NIS</th><th>Estado</th><th>Prior.</th><th>F. alta</th><th>H. alta</th><th>F. cierre</th><th>H. cierre</th><th>Dist.</th><th>Tipo</th><th>Cliente</th><th>Calle</th><th>N°</th><th>Loc.</th></tr></thead><tbody>';
        rows.forEach(row => {
            const fc = splitFechaHoraExportAR(row.fecha_creacion);
            const ff = splitFechaHoraExportAR(row.fecha_cierre);
            const esc = (s) => String(s ?? '').replace(/</g, '&lt;');
            tab += `<tr><td>${esc(row.numero_pedido)}</td><td>${esc(row.nis_medidor)}</td><td>${esc(row.estado)}</td><td>${esc(row.prioridad)}</td><td>${esc(fc.fecha)}</td><td>${esc(fc.hora)}</td><td>${esc(ff.fecha)}</td><td>${esc(ff.hora)}</td><td>${esc(row.distribuidor)}</td><td>${esc(row.tipo_trabajo)}</td><td>${esc(row.cliente_nombre)}</td><td>${esc(row.cliente_calle)}</td><td>${esc(row.cliente_numero_puerta)}</td><td>${esc(row.cliente_localidad)}</td></tr>`;
        });
        tab += '</tbody></table>';
        const w = window.open('', '_blank');
        if (!w) { toast('Permití ventanas emergentes para el informe', 'error'); return; }
        const sty = '@page{size:A4 portrait;margin:9mm}body{font-family:system-ui;padding:.2rem;max-width:210mm;margin:0 auto} table{border-collapse:collapse;width:100%;font-size:7.3pt;table-layout:auto} th,td{border:1px solid #cbd5e1;padding:2px 3px;vertical-align:top;white-space:nowrap} th{background:#eff6ff;position:relative}.gn-col-grip{position:absolute;right:0;top:0;bottom:0;width:6px;cursor:col-resize;z-index:2}';
        const scr = `(function(){document.querySelectorAll('#gn-informe-pedidos-tab th').forEach(function(th){var g=document.createElement('div');g.className='gn-col-grip';th.appendChild(g);g.addEventListener('mousedown',function(e){e.preventDefault();var th0=th,start=e.pageX,w0=th0.getBoundingClientRect().width;function mv(ev){var nw=Math.max(36,w0+ev.pageX-start);th0.style.width=nw+'px';th0.style.minWidth=nw+'px';}function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);});});})();`;
        w.document.write('<html><head><title>' + tit.replace(/</g, '&lt;') + '</title><style>' + sty + '</style></head><body>' + hdr + '<h1 style="font-size:12pt;color:#1e3a8a;margin:.45rem 0">' + tit.replace(/</g, '&lt;') + '</h1>' + tab + '<p style="margin-top:.6rem;font-size:7pt;color:#64748b">Documento para gestión interna. Complementar con datos de red (SAIDI/SAIFI oficiales) según normativa. Al imprimir, desactivá encabezado/pie del navegador.</p><script>' + scr + '</script></body></html>');
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch (_) {} }, 500);
    } catch (e) { toastError('informe-mensual-enre', e); }
}

// ── Estadísticas con Chart.js ─────────────────────────────────
(function initGNChartPercentPlugins() {
    if (window.__gnChartPctPlugins || typeof Chart === 'undefined') return;
    window.__gnChartPctPlugins = true;
    Chart.register({
        id: 'gestornovaPctDoughnut',
        afterDatasetsDraw(chart) {
            if (chart.config.type !== 'doughnut') return;
            const ds = chart.data.datasets[0];
            if (!ds?.data?.length) return;
            const total = ds.data.reduce((s, v) => s + Number(v || 0), 0);
            if (!total) return;
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            ctx.save();
            ctx.font = '600 9.5px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            meta.data.forEach((arc, i) => {
                const v = Number(ds.data[i] || 0);
                if (!v) return;
                const pct = Math.round(1000 * v / total) / 10;
                const { x, y } = arc.tooltipPosition();
                const ink = typeof window !== 'undefined' && window.__gnStatsInkSave;
                ctx.lineWidth = ink ? 0 : 4;
                ctx.strokeStyle = 'rgba(255,255,255,.95)';
                ctx.fillStyle = '#0f172a';
                const t = pct + '%';
                if (!ink) ctx.strokeText(t, x, y);
                ctx.fillText(t, x, y);
            });
            ctx.restore();
        }
    });
    Chart.register({
        id: 'gestornovaStatsBarLabels',
        afterDatasetsDraw(chart) {
            const cid = chart.canvas?.id;
            const ctx = chart.ctx;
            const area = chart.chartArea;
            if (!ctx || !area) return;
            ctx.save();
            const drawPctVertical = (data, meta0) => {
                if (!data?.length || !meta0?.data?.length || meta0.hidden) return;
                const total = data.reduce((s, v) => s + Number(v || 0), 0);
                if (!total) return;
                ctx.font = '600 10px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
                ctx.textAlign = 'center';
                meta0.data.forEach((bar, i) => {
                    const v = Number(data[i] || 0);
                    if (!v) return;
                    const pct = Math.round(1000 * v / total) / 10;
                    const p = typeof bar.getProps === 'function' ? bar.getProps(['x', 'y', 'base'], true) : null;
                    const x = p?.x ?? bar.x;
                    const yv = p?.y ?? bar.y;
                    const bs = p?.base ?? bar.base;
                    if (x == null || yv == null || bs == null) return;
                    const top = Math.min(yv, bs);
                    const bot = Math.max(yv, bs);
                    const h = bot - top;
                    let ty = top - 5;
                    ctx.textBaseline = 'bottom';
                    if (ty < area.top + 14) {
                        ty = top + h / 2;
                        ctx.textBaseline = 'middle';
                    }
                    if (ctx.textBaseline === 'bottom' && ty > area.bottom - 10) {
                        ty = top + h / 2;
                        ctx.textBaseline = 'middle';
                    }
                    const t = pct + '%';
                    const inkP = typeof window !== 'undefined' && window.__gnStatsInkSave;
                    ctx.lineWidth = inkP ? 0 : 3;
                    ctx.strokeStyle = 'rgba(255,255,255,.95)';
                    ctx.fillStyle = '#0f172a';
                    if (!inkP) ctx.strokeText(t, x, ty);
                    ctx.fillText(t, x, ty);
                });
            };
            if (cid === 'chart-mensual' && chart.config.type === 'bar' && chart.options.indexAxis !== 'y') {
                chart.data.datasets.forEach((ds, di) => {
                    const meta = chart.getDatasetMeta(di);
                    if (meta.hidden || !meta?.data?.length) return;
                    meta.data.forEach((bar, i) => {
                        const v = Number(ds.data[i] || 0);
                        if (!v) return;
                        const cp = typeof bar.getCenterPoint === 'function' ? bar.getCenterPoint() : null;
                        const x = cp?.x ?? bar.x;
                        const y = cp?.y ?? bar.y;
                        if (x == null || y == null) return;
                        const inkM = typeof window !== 'undefined' && window.__gnStatsInkSave;
                        ctx.font = '600 10px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.lineWidth = inkM ? 0 : 3;
                        ctx.strokeStyle = 'rgba(255,255,255,.92)';
                        ctx.fillStyle = '#0f172a';
                        const t = String(v);
                        if (!inkM) ctx.strokeText(t, x, y);
                        ctx.fillText(t, x, y);
                    });
                });
                ctx.restore();
                return;
            }
            if (cid === 'chart-tipos' && chart.config.type === 'bar' && chart.options.indexAxis === 'y') {
                const data = chart.data.datasets[0]?.data;
                const meta0 = chart.getDatasetMeta(0);
                if (!data || meta0.hidden || !meta0?.data?.length) { ctx.restore(); return; }
                ctx.font = '600 10px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                meta0.data.forEach((bar, i) => {
                    const v = Number(data[i] || 0);
                    if (!v) return;
                    const p = typeof bar.getProps === 'function' ? bar.getProps(['x', 'y', 'base'], true) : null;
                    const xv = p?.x ?? bar.x;
                    const yv = p?.y ?? bar.y;
                    const bs = p?.base ?? bar.base;
                    if (xv == null || yv == null || bs == null) return;
                    const right = Math.max(xv, bs);
                    const tx = Math.min(right + 6, area.right - 4);
                    ctx.fillText(String(v), tx, yv);
                });
                ctx.restore();
                return;
            }
            const pctCharts = { 'chart-prioridades': true, 'chart-usuarios': true, 'chart-tecnicos': true };
            if (pctCharts[cid] && chart.config.type === 'bar' && chart.options.indexAxis !== 'y') {
                drawPctVertical(chart.data.datasets[0]?.data, chart.getDatasetMeta(0));
            }
            ctx.restore();
        }
    });
})();
let _charts = {};

/** Muestra ENRE/SAIFI solo en línea eléctrica; placeholders para agua / municipio. */
function aplicarEstadisticasRubroEnPanel() {
    try {
        const ln = typeof lineaNegocioOperativaCodigo === 'function' ? lineaNegocioOperativaCodigo() : 'electricidad';
        const ew = document.getElementById('estad-rubro-electrico-wrap');
        const pa = document.getElementById('estad-rubro-agua-placeholder');
        const pm = document.getElementById('estad-rubro-municipio-placeholder');
        if (ew) ew.style.display = ln === 'electricidad' ? '' : 'none';
        if (pa) pa.style.display = ln === 'agua' ? '' : 'none';
        if (pm) pm.style.display = ln === 'municipio' ? '' : 'none';
    } catch (_) {}
}

async function cargarEstadisticas() {
    aplicarEstadisticasRubroEnPanel();
    const tsql = await pedidosFiltroTenantSql();
    const tsqlP = tsql
        ? tsql
              .replace(/\btenant_id\b/g, 'p.tenant_id')
              .replace(/\bbusiness_type\b/g, 'p.business_type')
        : '';
    const { condFecha, fechaDesde, periodo } = await resolveCondicionFechaPedidosStats(tsql);
    const filtro    = `WHERE ${condFecha}${tsql}`;
    const andFecha  = `AND ${condFecha}`;

    // Mostrar loading
    const statsEl = document.getElementById('stats-cards');
    if (statsEl) statsEl.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i> Calculando...</div>';

    try {
        const statSql = (query, tag) =>
            sqlSimple(query).catch(err => {
                console.warn('[estadisticas]', tag, err && err.message ? err.message : err);
                return { rows: [] };
            });
        const esMun = esMunicipioRubro();
        const sqlDistZona = esMun
            ? `SELECT COALESCE(NULLIF(TRIM(barrio),''), 'Sin barrio') AS distribuidor, COUNT(*) AS n,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados
                FROM pedidos ${filtro} GROUP BY 1 ORDER BY n DESC LIMIT 10`
            : `SELECT distribuidor, COUNT(*) AS n,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados
                FROM pedidos ${filtro} GROUP BY distribuidor ORDER BY n DESC LIMIT 10`;
        const showConf = esCooperativaElectricaRubro();
        const socTieneTStats = await sociosCatalogoTieneTenantId();
        let socTsqlStats = socTieneTStats ? ` AND tenant_id = ${esc(tenantIdActual())}` : '';
        try {
            const chSocBt = await sqlSimple(
                `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name = 'business_type' LIMIT 1`
            );
            if (chSocBt.rows?.length) {
                const line = lineaNegocioOperativaCodigo();
                const lineQ = esc(line);
                socTsqlStats += ` AND (business_type = ${lineQ} OR (business_type IS NULL AND ${lineQ} = 'electricidad'))`;
            }
        } catch (_) {}
        const [rTotal, rEstados, rPrior, rMensual, rTipos, rDist, rTiempos, rTecnicos, rAvance, rUsuarios,
            rTecCalle, rAsig, rCrit24, rBarT, rSocios, rConfMes] = await Promise.all([
            // Resumen general
            statSql(`SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados,
                COUNT(*) FILTER(WHERE estado='Pendiente') AS pendientes,
                COUNT(*) FILTER(WHERE estado='Asignado') AS asignados,
                COUNT(*) FILTER(WHERE estado='En ejecución') AS en_ejec,
                COUNT(*) FILTER(WHERE prioridad='Crítica' AND estado!='Cerrado') AS criticos,
                COUNT(*) FILTER(WHERE prioridad='Alta' AND estado!='Cerrado') AS altos,
                COUNT(*) FILTER(WHERE estado='Cerrado' AND fecha_cierre::date = CURRENT_DATE) AS cerrados_hoy
                FROM pedidos ${filtro}`, 'total'),
            // Por estado
            statSql(`SELECT estado, COUNT(*) AS n FROM pedidos ${filtro} GROUP BY estado ORDER BY n DESC`, 'estados'),
            // Por prioridad
            statSql(`SELECT prioridad, COUNT(*) AS n FROM pedidos ${filtro} GROUP BY prioridad ORDER BY
                CASE prioridad WHEN 'Crítica' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Media' THEN 3 ELSE 4 END`, 'prior'),
            // Por mes
            statSql(`SELECT TO_CHAR(fecha_creacion,'YYYY-MM') AS mes,
                COUNT(*) AS total,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados
                FROM pedidos ${filtro} GROUP BY mes ORDER BY mes`, 'mensual'),
            // Por tipo de trabajo
            statSql(`SELECT COALESCE(tipo_trabajo,'Sin tipo') AS tipo, COUNT(*) AS n
                FROM pedidos ${filtro} GROUP BY 1 ORDER BY n DESC LIMIT 10`, 'tipos'),
            // Por distribuidor / ramal / barrio (top 10)
            statSql(sqlDistZona, 'dist'),
            // Tiempo promedio de cierre (horas) — solo pedidos cerrados con fecha
            statSql(`SELECT
                AVG(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600) AS horas_prom,
                MIN(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600) AS horas_min,
                MAX(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600) AS horas_max
                FROM pedidos WHERE ${condFecha}${tsql} AND estado='Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > fecha_creacion`, 'tiempos'),
            // Por técnico de cierre (top 8)
            statSql(`SELECT COALESCE(tecnico_cierre,'Sin asignar') AS tecnico, COUNT(*) AS n
                FROM pedidos WHERE ${condFecha}${tsql} AND estado='Cerrado' GROUP BY tecnico ORDER BY n DESC LIMIT 8`, 'tecnicos'),
            // Avance promedio de pedidos en ejecución
            statSql(`SELECT ROUND(AVG(avance)) AS avance_prom FROM pedidos WHERE ${condFecha}${tsql} AND estado='En ejecución'`, 'avance'),
            // Pedidos por usuario creador
            statSql(`SELECT COALESCE(u.nombre, 'Sin asignar') AS usuario, COUNT(*) AS n
                FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_creador_id
                WHERE p.fecha_creacion >= ${esc(fechaDesde.toISOString())}${tsqlP}
                GROUP BY usuario ORDER BY n DESC LIMIT 10`, 'usuarios'),
            statSql(`SELECT COUNT(DISTINCT tecnico_asignado_id) AS n FROM pedidos ${filtro}
                AND estado IN ('En ejecución','Asignado') AND tecnico_asignado_id IS NOT NULL`, 'tecCalle'),
            statSql(`SELECT AVG(EXTRACT(EPOCH FROM (fecha_asignacion - fecha_creacion))/3600) AS h
                FROM pedidos ${filtro} AND fecha_asignacion IS NOT NULL AND fecha_asignacion > fecha_creacion`, 'asig'),
            statSql(`SELECT
                COUNT(*) FILTER (WHERE prioridad='Crítica' AND estado='Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre <= fecha_creacion + interval '24 hours') AS n24,
                COUNT(*) FILTER (WHERE prioridad='Crítica' AND estado='Cerrado' AND fecha_cierre IS NOT NULL) AS nct
                FROM pedidos ${filtro}`, 'crit24'),
            esMun
                ? statSql(
                      `SELECT COALESCE(NULLIF(TRIM(barrio),''), 'Sin barrio') AS barrio,
                ROUND(AVG(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/3600)::numeric, 2) AS horas_prom,
                COUNT(*)::int AS n
                FROM pedidos WHERE ${condFecha}${tsql} AND estado='Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > fecha_creacion
                GROUP BY 1 ORDER BY horas_prom ASC NULLS LAST LIMIT 8`,
                      'barT'
                  )
                : Promise.resolve({ rows: [] }),
            statSql(`SELECT COUNT(*)::int AS n FROM socios_catalogo WHERE COALESCE(activo, TRUE)${socTsqlStats}`, 'nsocios'),
            showConf
                ? statSql(
                      `SELECT TO_CHAR(fecha_cierre,'YYYY-MM') AS mes,
                COUNT(*)::int AS ev,
                COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (fecha_cierre - fecha_creacion))/60.0, 0)), 0)::double precision AS min_tot
                FROM pedidos
                WHERE estado = 'Cerrado' AND fecha_cierre IS NOT NULL AND fecha_cierre > fecha_creacion
                AND fecha_cierre >= ${esc(fechaDesde.toISOString())}
                AND tipo_trabajo IN (
                  'Corte de Energía','Cables Caídos/Peligro','Problemas de Tensión','Poste Inclinado/Dañado',
                  'Consumo elevado','Riesgo en la vía pública','Corrimiento de poste/columna',
                  'Falla de Línea','Avería en Transformador','Corte Programado','Emergencia'
                )
                ${tsql}
                GROUP BY 1 ORDER BY 1`,
                      'confMes'
                  )
                : Promise.resolve({ rows: [] }),
        ]);

        const t = rTotal.rows[0] || {};
        const horasProm = parseFloat(rTiempos.rows[0]?.horas_prom || 0);
        const horasMin  = parseFloat(rTiempos.rows[0]?.horas_min  || 0);
        const horasMax  = parseFloat(rTiempos.rows[0]?.horas_max  || 0);
        const avanceProm = parseInt(rAvance.rows[0]?.avance_prom  || 0);
        const nTecCalle = parseInt(rTecCalle.rows[0]?.n || 0, 10);
        const hAsig = parseFloat(rAsig.rows[0]?.h || 0);
        const nCrit24 = parseInt(rCrit24.rows[0]?.n24 || 0, 10);
        const nCritTot = parseInt(rCrit24.rows[0]?.nct || 0, 10);
        const totalN = Number(t.total) || 0;
        const cerrN = Number(t.cerrados) || 0;
        const pctCerr = totalN > 0 ? Math.round(1000 * cerrN / totalN) / 10 : 0;
        const pctCrit24 = nCritTot ? Math.round(1000 * nCrit24 / nCritTot) / 10 : null;

        const fmtHoras = h =>
            h === 0 || !isFinite(h)
                ? '—'
                : h < 1
                  ? Math.round(h * 60) + ' minutos'
                  : h < 24
                    ? h.toFixed(1) + ' horas'
                    : (h / 24).toFixed(1) + ' días';

        const titZona = document.getElementById('estadisticas-titulo-zona');
        if (titZona) {
            titZona.textContent = esMun ? 'Por barrio' : esCooperativaAguaRubro() ? 'Por ramal' : 'Por distribuidor';
        }
        const wrapBarT = document.getElementById('chart-wrap-barrios-tiempo');
        if (wrapBarT) wrapBarT.style.display = esMun ? '' : 'none';

        const nSociosCat = Math.max(1, parseInt(rSocios.rows?.[0]?.n || 0, 10) || 1);
        const confRows = rConfMes.rows || [];
        const evConfTot = confRows.reduce((s, r) => s + parseInt(r.ev || 0, 10), 0);
        const minConfTot = confRows.reduce((s, r) => s + parseFloat(r.min_tot || 0), 0);
        const saifiPeriodo = showConf && nSociosCat ? evConfTot / nSociosCat : null;
        const saidiPeriodo = showConf && nSociosCat ? minConfTot / nSociosCat : null;

        // ── Cards de resumen ───────────────────────────────────
        const cardList = [
            { val: totalN, lbl: 'Total pedidos',     cls: '' },
            { val: Number(t.pendientes)  || 0, lbl: 'Pendientes',         cls: Number(t.pendientes) > 0 ? 'orange' : '' },
            { val: Number(t.asignados)   || 0, lbl: 'Asignados',          cls: Number(t.asignados) > 0 ? 'orange' : '' },
            { val: Number(t.en_ejec)     || 0, lbl: 'En ejecución',       cls: '' },
            { val: cerrN, lbl: 'Cerrados',           cls: 'green' },
            { val: Number(t.criticos)    || 0, lbl: '🔴 Críticos activos', cls: Number(t.criticos) > 0 ? 'red' : '' },
            { val: Number(t.altos)       || 0, lbl: '🟠 Altos activos',   cls: Number(t.altos) > 0 ? 'orange' : '' },
            { val: Number(t.cerrados_hoy)|| 0, lbl: 'Cerrados hoy',       cls: 'green' },
            { val: nTecCalle, lbl: 'Técnicos con pedido (asig./ejec.)', cls: nTecCalle ? 'orange' : '' },
            { val: fmtHoras(hAsig), lbl: 'Prom. tiempo hasta asignar', cls: '' },
            { val: pctCerr + '%', lbl: '% cerrados / total período', cls: 'green' },
            { val: pctCrit24 != null ? pctCrit24 + '%' : '—', lbl: '% críticos cerrados &lt;24h', cls: '' },
            { val: fmtHoras(horasProm), lbl: 'Prom. tiempo cierre', cls: '' },
            { val: fmtHoras(horasMin),  lbl: 'Cierre más rápido',   cls: 'green' },
            { val: avanceProm + '%',    lbl: 'Avance prom. en ejec.', cls: '' },
        ];
        if (showConf) {
            cardList.push(
                {
                    val: saifiPeriodo != null ? saifiPeriodo.toFixed(4) : '—',
                    lbl: 'SAIFI aprox. (int./usuario en período)',
                    cls: '',
                },
                {
                    val: saidiPeriodo != null ? Math.round(saidiPeriodo * 10) / 10 + ' min/usuario' : '—',
                    lbl: 'SAIDI aprox. (min acum./usuario)',
                    cls: '',
                }
            );
        }
        document.getElementById('stats-cards').innerHTML = cardList
            .map(s => `<div class="stat-card ${s.cls}"><div class="val">${s.val}</div><div class="lbl">${s.lbl}</div></div>`)
            .join('');

        // ── Helper para crear/recrear charts (Chart.js v4) ────
        const crearChart = (id, type, labels, datasets, extraOpts = {}) => {
            if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
            const canvas = document.getElementById(id);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const isVerticalBar = type === 'bar' && extraOpts.indexAxis !== 'y';
            _charts[id] = new Chart(ctx, {
                type,
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 520, easing: 'easeOutQuart' },
                    clip: false,
                    layout: { padding: { top: 12, bottom: 14, left: 12, right: 18 } },
                    plugins: { legend: { display: false, labels: { boxWidth: 18, boxHeight: 8, padding: 14, color: '#334155', font: { size: 11, weight: '600' } } }, tooltip: { callbacks: {
                        label: ctx2 => {
                            const v = ctx2.parsed && typeof ctx2.parsed === 'object' && 'y' in ctx2.parsed
                                ? ctx2.parsed.y : (ctx2.parsed ?? ctx2.raw);
                            return ' ' + v + ' pedidos';
                        }
                    }}},
                    ...(isVerticalBar
                        ? {
                              scales: {
                                  x: {
                                      grid: { display: false },
                                      ticks: { color: '#475569', font: { size: 11, weight: '600' }, maxRotation: 40, minRotation: 0, autoSkipPadding: 10 },
                                  },
                                  y: { beginAtZero: true, grace: '8%', ticks: { color: '#475569', precision: 0, font: { size: 11, weight: '600' } }, grid: { color: 'rgba(148,163,184,.22)' } },
                              },
                          }
                        : {}),
                    ...extraOpts
                }
            });
            requestAnimationFrame(() => {
                try { _charts[id]?.resize(); } catch (_) {}
            });
        };

        const COLORES = [
            'rgba(186, 230, 253, 0.75)',
            'rgba(167, 243, 208, 0.78)',
            'rgba(254, 215, 170, 0.78)',
            'rgba(233, 213, 255, 0.78)',
            'rgba(253, 224, 231, 0.82)',
            'rgba(207, 250, 254, 0.78)',
            'rgba(254, 249, 195, 0.82)',
            'rgba(221, 214, 254, 0.78)',
            'rgba(209, 250, 229, 0.78)',
            'rgba(254, 202, 202, 0.72)',
        ];
        const priorColor = {
            Crítica: 'rgba(254, 202, 202, 0.72)',
            Alta: 'rgba(253, 186, 116, 0.55)',
            Media: 'rgba(253, 224, 71, 0.52)',
            Baja: 'rgba(186, 230, 253, 0.72)',
        };

        // ── Gráfico mensual: total y cerrados por mes ─────────
        crearChart('chart-mensual', 'bar',
            rMensual.rows.map(r => r.mes),
            [
                { label: 'Creados',  data: rMensual.rows.map(r => parseInt(r.total   || 0)), backgroundColor: 'rgba(186, 230, 253, 0.85)', borderColor: 'rgba(56, 189, 248, 0.55)', borderWidth: 1.5 },
                { label: 'Cerrados', data: rMensual.rows.map(r => parseInt(r.cerrados|| 0)), backgroundColor: 'rgba(167, 243, 208, 0.88)', borderColor: 'rgba(52, 211, 153, 0.55)', borderWidth: 1.5 }
            ],
            { layout: { padding: { top: 10, bottom: 22, left: 4, right: 8 } },
                plugins: { legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y }}}}
        );
        const chMes = _charts['chart-mensual'];
        if (chMes) {
            chMes.options.onClick = (_evt, elements) => {
                if (!elements?.length) return;
                const idx = elements[0].index;
                const lab = chMes.data.labels[idx];
                if (lab && /^\d{4}-\d{2}$/.test(String(lab))) {
                    const hid = document.getElementById('est-mes-filtro');
                    if (hid) hid.value = String(lab);
                    const fd = document.getElementById('est-fecha-dia');
                    if (fd) fd.value = '';
                    void cargarEstadisticas();
                    toast(`Filtrado: mes ${lab}. Elegí un día abajo para ver solo ese día, o «Limpiar filtro».`, 'info');
                }
            };
            chMes.update();
        }

        // ── Gráfico estados: doughnut ─────────────────────────
        const estadoColors = {
            Pendiente: 'rgba(254, 249, 195, 0.92)',
            Asignado: 'rgba(233, 213, 255, 0.9)',
            'En ejecución': 'rgba(186, 230, 253, 0.92)',
            Cerrado: 'rgba(167, 243, 208, 0.92)',
            'Derivado externo': 'rgba(221, 214, 254, 0.9)',
        };
        const pastelDonutFallback = [
            'rgba(254, 215, 170, 0.9)',
            'rgba(253, 224, 231, 0.92)',
            'rgba(207, 250, 254, 0.9)',
            'rgba(209, 250, 229, 0.92)',
            'rgba(243, 232, 255, 0.9)',
            'rgba(254, 243, 199, 0.92)',
        ];
        crearChart('chart-estados', 'doughnut',
            rEstados.rows.map(r => r.estado),
            [{ data: rEstados.rows.map(r => parseInt(r.n)),
               backgroundColor: rEstados.rows.map((row, i) =>
                   estadoColors[row.estado] || pastelDonutFallback[i % pastelDonutFallback.length]
               ),
               borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.98)' }],
            { plugins: { legend: { display: true, position: 'bottom' },
                tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + c.parsed + ' pedidos' }}}}
        );

        // ── Gráfico prioridades: barras coloreadas ────────────
        crearChart('chart-prioridades', 'bar',
            rPrior.rows.map(r => r.prioridad),
            [{ label: 'Pedidos', data: rPrior.rows.map(r => parseInt(r.n)),
               backgroundColor: rPrior.rows.map(r => priorColor[r.prioridad] || 'rgba(203, 213, 225, 0.5)') }],
            { layout: { padding: { top: 32, bottom: 4, left: 4, right: 8 } },
                plugins: { legend: { display: false },
                tooltip: { callbacks: { label: c => ' ' + c.parsed.y + ' pedidos' }}}}
        );

        // ── Gráfico tipos de trabajo: barras horizontales ─────
        // En Chart.js v4: 'bar' con indexAxis:'y' (horizontalBar fue eliminado)
        crearChart('chart-tipos', 'bar',
            rTipos.rows.map(r => r.tipo.length > 25 ? r.tipo.substring(0,25)+'…' : r.tipo),
            [{ label: 'Pedidos', data: rTipos.rows.map(r => parseInt(r.n)),
               backgroundColor: rTipos.rows.map((_, i) => COLORES[i % COLORES.length]),
               borderColor: 'rgba(148, 163, 184, 0.35)',
               borderWidth: 1 }],
            { indexAxis: 'y',
              layout: { padding: { top: 4, bottom: 4, left: 4, right: 36 } },
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.parsed.x + ' pedidos' }}},
              scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        );

        // ── Gráfico distribuidor / ramal / barrio: barras con % cierre ─
        crearChart('chart-distribuidores', 'bar',
            rDist.rows.map(r => r.distribuidor),
            [
                { label: 'Total',    data: rDist.rows.map(r => parseInt(r.n        || 0)), backgroundColor: 'rgba(186, 230, 253, 0.82)', borderColor: 'rgba(125, 211, 252, 0.65)', borderWidth: 1 },
                { label: 'Cerrados', data: rDist.rows.map(r => parseInt(r.cerrados || 0)), backgroundColor: 'rgba(167, 243, 208, 0.85)', borderColor: 'rgba(110, 231, 183, 0.65)', borderWidth: 1 }
            ],
            { layout: { padding: { top: 8, bottom: 36, left: 4, right: 10 } },
              plugins: { legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y }}},
              scales: { x: { ticks: { maxRotation: 45, font: { size: 10 } } } } }
        );

        if (esMun && (rBarT?.rows || []).length) {
            crearChart(
                'chart-barrios-tiempo',
                'bar',
                rBarT.rows.map((r) => (String(r.barrio || '').length > 22 ? String(r.barrio).slice(0, 22) + '…' : String(r.barrio || ''))),
                [
                    {
                        label: 'Horas prom. cierre',
                        data: rBarT.rows.map((r) => parseFloat(r.horas_prom || 0)),
                        backgroundColor: 'rgba(186, 230, 253, 0.75)',
                        borderColor: 'rgba(125, 211, 252, 0.55)',
                        borderWidth: 1,
                    },
                ],
                {
                    indexAxis: 'y',
                    layout: { padding: { top: 4, bottom: 4, left: 4, right: 48 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (c) =>
                                    ' ' +
                                    (c.parsed?.x != null ? c.parsed.x.toFixed(1) : c.raw) +
                                    ' h · n=' +
                                    (rBarT.rows[c.dataIndex]?.n ?? ''),
                            },
                        },
                    },
                    scales: { x: { beginAtZero: true, title: { display: true, text: 'Horas' } } },
                }
            );
        } else if (_charts['chart-barrios-tiempo']) {
            _charts['chart-barrios-tiempo'].destroy();
            delete _charts['chart-barrios-tiempo'];
        }

        // ── Gráfico técnicos de cierre ────────────────────────
        // ── Gráfico por usuario creador ──────────────────────
        if ((rUsuarios?.rows || []).length) {
            crearChart('chart-usuarios', 'bar',
                rUsuarios.rows.map(r => r.usuario.length > 14 ? r.usuario.substring(0,14)+'…' : r.usuario),
                [{ label: 'Pedidos', data: rUsuarios.rows.map(r => parseInt(r.n)),
                   backgroundColor: COLORES.slice(0,10) }],
                { layout: { padding: { top: 32, bottom: 28, left: 4, right: 8 } },
                    plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: c => ' ' + c.parsed.y + ' pedidos' }}},
                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            );
        }

        // ── Gráfico técnicos ──────────────────────────────────
        if ((rTecnicos?.rows || []).length) {
            const wrapTec0 = document.getElementById('chart-wrap-tecnicos');
            if (wrapTec0) wrapTec0.style.display = '';
            crearChart('chart-tecnicos', 'bar',
                rTecnicos.rows.map(r => r.tecnico.length > 15 ? r.tecnico.substring(0,15)+'…' : r.tecnico),
                [{ label: 'Pedidos cerrados', data: rTecnicos.rows.map(r => parseInt(r.n)),
                   backgroundColor: COLORES }],
                { layout: { padding: { top: 32, bottom: 28, left: 4, right: 8 } },
                    plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: c => ' ' + c.parsed.y + ' pedidos' }}} }
            );
        } else {
            const wrapTec1 = document.getElementById('chart-wrap-tecnicos');
            if (wrapTec1) wrapTec1.style.display = 'none';
            const capTx = document.getElementById('chart-cap-tecnicos');
            if (capTx) capTx.innerHTML = '';
        }

        const scap = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const pctOf = (n, tot) => (!tot ? 0 : Math.round(1000 * Number(n) / tot) / 10);
        const capM = document.getElementById('chart-cap-mensual');
        if (capM) {
            const totCr = rMensual.rows.reduce((s, r) => s + parseInt(r.total || 0, 10), 0);
            const totCe = rMensual.rows.reduce((s, r) => s + parseInt(r.cerrados || 0, 10), 0);
            capM.innerHTML = `<strong>Resumen numérico</strong> · Suma de pedidos creados (por mes): ${totCr}. Suma de cierres registrados por mes: ${totCe}.<br><strong>Colores:</strong> tono azulado = ingresos del mes; tono verdoso = cierres del mes.`;
        }
        const totEst = (rEstados.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
        const capE = document.getElementById('chart-cap-estados');
        if (capE) {
            if (totEst) {
                const estadoLeg = 'Tonos suaves: amarillento Pendiente · violáceo Asignado · azulado En ejecución · verdoso Cerrado.';
                const lines = rEstados.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.estado)} <strong>${pctOf(n, totEst)}%</strong> (${n})`;
                }).join(' · ');
                capE.innerHTML = `<strong>Distribución sobre ${totEst} pedidos</strong><br>${lines}<br><strong>Significado de colores:</strong> ${estadoLeg}`;
            } else capE.textContent = 'Sin datos en el período.';
        }
        const totPr = (rPrior.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
        const capP = document.getElementById('chart-cap-prioridades');
        if (capP) {
            if (totPr) {
                const prLeg = 'Tonos suaves: rojizo Crítica · albaricoque Alta · amarillento Media · azulado Baja.';
                const lines = rPrior.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.prioridad)} <strong>${pctOf(n, totPr)}%</strong> (${n})`;
                }).join(' · ');
                capP.innerHTML = `<strong>Distribución sobre ${totPr} pedidos</strong><br>${lines}<br><strong>Significado de colores:</strong> ${prLeg}`;
            } else capP.textContent = 'Sin datos en el período.';
        }
        const capD = document.getElementById('chart-cap-distribuidores');
        if (capD) {
            const lblZ = esMun ? 'barrio' : esCooperativaAguaRubro() ? 'ramal' : 'distribuidor';
            if ((rDist.rows || []).length) {
                const lines = rDist.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    const c = parseInt(r.cerrados || 0, 10);
                    const pc = n ? pctOf(c, n) : 0;
                    return `${scap(r.distribuidor)}: total ${n}, cerrados ${c} (<strong>${pc}%</strong> del propio ${lblZ})`;
                }).join('<br>');
                capD.innerHTML = `<strong>Por ${lblZ}</strong><br>${lines}<br><strong>Colores:</strong> azulado = total de pedidos; verdoso = cerrados en el período.`;
            } else capD.textContent = 'Sin datos en el período.';
        }
        const capBT = document.getElementById('chart-cap-barrios-tiempo');
        if (capBT) {
            if (esMun && (rBarT?.rows || []).length) {
                capBT.innerHTML =
                    '<strong>Tiempo promedio de resolución por barrio</strong> (pedidos cerrados en el período). ' +
                    'Barras más cortas = cierre más rápido. Requiere columna <code>barrio</code> en pedidos.';
            } else capBT.textContent = '';
        }
        const totTip = (rTipos.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
        const capT = document.getElementById('chart-cap-tipos');
        if (capT) {
            if (totTip) {
                const lines = rTipos.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.tipo)} <strong>${pctOf(n, totTip)}%</strong> (${n})`;
                }).join(' · ');
                capT.innerHTML = `<strong>Top tipos (${totTip} pedidos en la muestra)</strong><br>${lines}<br><strong>Color:</strong> tono azulado = volumen relativo de cada tipo (barras horizontales).`;
            } else capT.textContent = 'Sin datos en el período.';
        }
        const totU = (rUsuarios?.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
        const capU = document.getElementById('chart-cap-usuarios');
        if (capU) {
            if (totU && (rUsuarios?.rows || []).length) {
                const lines = rUsuarios.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.usuario)} <strong>${pctOf(n, totU)}%</strong> (${n})`;
                }).join(' · ');
                capU.innerHTML = `<strong>Creadores (${totU} pedidos)</strong><br>${lines}<br><strong>Colores:</strong> cada tono distingue un usuario en el ranking (no implica semáforo de calidad).`;
            } else capU.textContent = 'Sin datos en el período.';
        }
        const totTc = (rTecnicos?.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
        const capTc = document.getElementById('chart-cap-tecnicos');
        if (capTc) {
            if (totTc && (rTecnicos?.rows || []).length) {
                const lines = rTecnicos.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.tecnico)} <strong>${pctOf(n, totTc)}%</strong> (${n})`;
                }).join(' · ');
                capTc.innerHTML = `<strong>Cierres por técnico (${totTc} pedidos)</strong><br>${lines}<br><strong>Colores:</strong> cada tono distingue un técnico en el ranking.`;
            } else if ((rTecnicos?.rows || []).length === 0) capTc.innerHTML = '';
        }

        requestAnimationFrame(() => {
            Object.values(_charts).forEach(ch => { try { ch.resize(); } catch (_) {} });
        });

    } catch(e) {
        logErrorWeb('cargar-estadisticas', e);
        const em = escHtmlPrint(mensajeErrorUsuario(e));
        if (document.getElementById('stats-cards'))
            document.getElementById('stats-cards').innerHTML =
                `<div style="color:var(--re);padding:1rem;font-size:.85rem">No se pudieron cargar las estadísticas. ${em}</div>`;
        toast(mensajeErrorUsuario(e), 'error');
    }
}

// ── Ubicaciones de usuarios en mapa ──────────────────────────
let _mapaUsuariosAdmin = null;
let _marcadoresUsuarios = [];
let _marcadoresPedidosAdmin = [];
window._marcadoresUsuarios = _marcadoresUsuarios;

function iniciarMapaUsuariosAdmin() {
    const el = document.getElementById('mapa-usuarios-admin');
    if (!el) return;
    setTimeout(async () => {
        const mod = await loadMapViewModule();
        mod.setMapViewContext(buildMapViewCtx());
        if (!_mapaUsuariosAdmin) {
            _mapaUsuariosAdmin = L.map('mapa-usuarios-admin', {
                zoomControl: false,
                preferCanvas: true,
                zoomAnimation: false,
                fadeAnimation: false,
                markerZoomAnimation: false,
                inertia: false
            }).setView([-31.5, -60.0], 10);
            mod.gnAttachBaseMapLayers(_mapaUsuariosAdmin);
            window._mapaUsuariosAdmin = _mapaUsuariosAdmin;
        } else {
            _mapaUsuariosAdmin.invalidateSize();
            window._mapaUsuariosAdmin = _mapaUsuariosAdmin;
        }
        cargarUbicacionesUsuarios();
    }, 200);
}

async function cargarUbicacionesUsuarios() {
    const esActualizacion = _marcadoresUsuarios.length > 0 || _marcadoresPedidosAdmin.length > 0;
    try {
        const wf = await sqlFiltroUsuariosPorTenant();
        let btSql = '';
        try {
            const rBt = await sqlSimple(
                `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'business_type' LIMIT 1`
            );
            if (rBt.rows?.length) {
                const line = esc(lineaNegocioOperativaCodigo());
                btSql = ` AND (u.business_type IS NULL OR u.business_type = ${line})`;
            }
        } catch (_) {}
        // ── Usuarios activos con ubicación reciente (tenant + línea de negocio) ───────────
        const [rUsr, rPed] = await Promise.all([
            sqlSimple(`
                SELECT DISTINCT ON (uu.usuario_id)
                    uu.usuario_id, uu.lat, uu.lng, uu.precision_m, uu.timestamp,
                    u.nombre, u.email
                FROM ubicaciones_usuarios uu
                JOIN usuarios u ON u.id = uu.usuario_id
                WHERE u.activo = TRUE${wf}${btSql} AND uu.timestamp > NOW() - INTERVAL '2 hours'
                ORDER BY uu.usuario_id, uu.timestamp DESC
            `),
            // Pedidos pendientes y en ejecución con coordenadas
            (async () => {
                const tsql = await pedidosFiltroTenantSql();
                return sqlSimple(`
                SELECT id, numero_pedido, descripcion, prioridad, estado, lat, lng, distribuidor
                FROM pedidos
                WHERE estado != 'Cerrado' AND lat IS NOT NULL AND lng IS NOT NULL${tsql}
                ORDER BY
                    CASE prioridad WHEN 'Crítica' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Media' THEN 3 ELSE 4 END
            `);
            })()
        ]);

        if (!_mapaUsuariosAdmin) {
            console.warn('[ubicaciones admin] mapa no inicializado');
            return;
        }

        // ── Limpiar marcadores anteriores ────────────────────
        _marcadoresUsuarios.forEach(m => { if (_mapaUsuariosAdmin) _mapaUsuariosAdmin.removeLayer(m); });
        _marcadoresUsuarios = [];
        _marcadoresPedidosAdmin.forEach(m => { if (_mapaUsuariosAdmin) _mapaUsuariosAdmin.removeLayer(m); });
        _marcadoresPedidosAdmin = [];

        const lista = document.getElementById('lista-ubicaciones');

        // ── Marcadores de pedidos ─────────────────────────────
        const fillPrior = { 'Crítica':'#ef4444','Alta':'#f97316','Media':'#eab308','Baja':'#3b82f6' };
        (rPed.rows || []).forEach(p => {
            const lat = parseFloat(p.lat), lng = parseFloat(p.lng);
            if (!lat || !lng) return;
            const color = fillPrior[p.prioridad] || '#3b82f6';
            const iconPed = L.divIcon({
                className: '',
                html: `<div style="width:14px;height:14px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);position:relative">
                    <div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:${color};color:white;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap">#${p.numero_pedido}</div>
                </div>`,
                iconSize: [14,14], iconAnchor: [7,7]
            });
            const mk = L.marker([lat, lng], { icon: iconPed, zIndexOffset: 100 })
                .addTo(_mapaUsuariosAdmin)
                .bindPopup(`<b style="color:${color}">#${p.numero_pedido}</b><br>
                    <span style="font-size:11px">${p.prioridad} — ${p.estado}</span><br>
                    <span style="font-size:11px;color:#475569">${p.distribuidor || ''}</span><br>
                    <span style="font-size:11px">${(p.descripcion||'').substring(0,60)}...</span>`);
            _marcadoresPedidosAdmin.push(mk);
        });

        // ── Marcadores de usuarios ────────────────────────────
        const usuariosRows = rUsr.rows || [];
        const bounds = [];

        usuariosRows.forEach(row => {
            const lat = parseFloat(row.lat), lng = parseFloat(row.lng);
            bounds.push([lat, lng]);
            const hace = Math.round((Date.now() - new Date(row.timestamp)) / 60000);

            // Calcular pedido más cercano a este usuario
            let pedidoCercano = null, distMin = Infinity;
            (rPed.rows || []).forEach(p => {
                const plat = parseFloat(p.lat), plng = parseFloat(p.lng);
                if (!plat || !plng) return;
                // Distancia aproximada en km (fórmula simple)
                const dlat = (lat - plat) * 111;
                const dlng = (lng - plng) * 111 * Math.cos(lat * Math.PI / 180);
                const d = Math.sqrt(dlat*dlat + dlng*dlng);
                if (d < distMin) { distMin = d; pedidoCercano = p; }
            });

            const cercanoHtml = pedidoCercano
                ? `<br><span style="font-size:10px;color:#059669">📍 Pedido más cercano: #${pedidoCercano.numero_pedido} (${distMin < 1 ? (distMin*1000).toFixed(0)+'m' : distMin.toFixed(1)+'km'})</span>`
                : '';

            if (_mapaUsuariosAdmin) {
                const icon = L.divIcon({
                    className: '',
                    html: `<div class="user-marker-admin"><i class="fas fa-user" style="font-size:.65rem"></i> ${row.nombre.split(' ')[0]}</div>`,
                    iconAnchor: [0, 12]
                });
                const m = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
                    .addTo(_mapaUsuariosAdmin)
                    .bindPopup(`<b>${row.nombre}</b><br>${row.email}<br>Hace ${hace} min<br>±${row.precision_m || '?'}m${cercanoHtml}`);
                _marcadoresUsuarios.push(m);
            }
        });

        // fitBounds SOLO la primera vez (no al actualizar)
        if (!esActualizacion && _mapaUsuariosAdmin && bounds.length) {
            _mapaUsuariosAdmin.fitBounds(bounds, { padding: [40, 40] });
        }

        // ── Lista inferior ────────────────────────────────────
        if (!usuariosRows.length) {
            if (lista) lista.textContent = 'Ningún usuario ha compartido su ubicación en las últimas 2 horas.';
        } else {
            if (lista) lista.innerHTML = usuariosRows.map(row => {
                const hace = Math.round((Date.now() - new Date(row.timestamp)) / 60000);
                return `<span style="display:inline-flex;align-items:center;gap:.3rem;background:var(--bg);border-radius:.5rem;padding:.25rem .6rem;margin:.15rem;font-size:.78rem">
                    <i class="fas fa-user"></i> <b>${row.nombre}</b> — hace ${hace} min
                </span>`;
            }).join('') + `<span style="display:inline-flex;align-items:center;gap:.3rem;background:#f0fdf4;border-radius:.5rem;padding:.25rem .6rem;margin:.15rem;font-size:.78rem">
                <i class="fas fa-circle" style="color:#ef4444;font-size:.5rem"></i> Crítica &nbsp;
                <i class="fas fa-circle" style="color:#f97316;font-size:.5rem"></i> Alta &nbsp;
                <i class="fas fa-circle" style="color:#eab308;font-size:.5rem"></i> Media &nbsp;
                <i class="fas fa-circle" style="color:#3b82f6;font-size:.5rem"></i> Baja
            </span>`;
        }

    } catch(e) { console.warn('Error ubicaciones usuarios:', e.message); }
}

// ── Cambio de contraseña ──────────────────────────────────────
async function cambiarContrasena() {
    const actual    = document.getElementById('pw-actual').value;
    const nueva     = document.getElementById('pw-nueva').value;
    const confirmar = document.getElementById('pw-confirmar').value;
    const msg       = document.getElementById('pw-msg');

    if (!actual || !nueva || !confirmar) { msg.textContent = 'Completá todos los campos'; return; }
    if (nueva !== confirmar) { msg.textContent = 'Las contraseñas nuevas no coinciden'; return; }
    if (nueva.length < 4) { msg.textContent = 'La contraseña debe tener al menos 4 caracteres'; return; }

    try {
        const r = await sqlSimple(`SELECT id FROM usuarios WHERE id = ${esc(app.u.id)} AND password_hash = ${esc(actual)}`);
        if (!r.rows.length) { msg.textContent = 'La contraseña actual es incorrecta'; return; }
        await sqlSimple(`UPDATE usuarios SET password_hash = ${esc(nueva)} WHERE id = ${esc(app.u.id)}`);
        msg.style.color = '#166534';
        msg.textContent = '✓ Contraseña actualizada correctamente';
        ['pw-actual','pw-nueva','pw-confirmar'].forEach(id => document.getElementById(id).value = '');
    } catch(e) {
        logErrorWeb('cambiar-contrasena', e);
        msg.textContent = mensajeErrorUsuario(e);
    }
}

// ── Reset de contraseña con EmailJS ──────────────────────────
let _resetPaso = 1;
let _resetTokenActual = null;
let _resetUsuarioAdmin = false;

function _errMsg(e) {
    if (!e) return 'Error desconocido';
    if (typeof e === 'string') return e;
    if (e.message) return e.message;
    if (e.error) return typeof e.error === 'string' ? e.error : JSON.stringify(e.error);
    try { return JSON.stringify(e); } catch (_) { return String(e); }
}

async function pasoResetPw() {
    const cfg = window.APP_CONFIG?.emailjs;

    const msg = document.getElementById('reset-msg');
    const btn = document.getElementById('btn-reset-pw');

    if (_resetPaso === 1) {
        const email = document.getElementById('reset-email').value.trim();
        if (!email) { msg.textContent = 'Ingresá el email de tu cuenta administrador'; return; }
        _resetUsuarioAdmin = false;
        try {
            const emailLc = email.toLowerCase();
            const r = await sqlSimple(`SELECT id, email, nombre, rol
                FROM usuarios
                WHERE activo = TRUE
                  AND (
                    lower(coalesce(email,'')) = ${esc(emailLc)}
                    OR lower(coalesce(nombre,'')) = ${esc(emailLc)}
                  )
                ORDER BY CASE WHEN lower(coalesce(email,'')) = ${esc(emailLc)} THEN 0 ELSE 1 END
                LIMIT 1`);
            if (!r.rows[0]) { msg.textContent = 'Cuenta no encontrada o inactiva'; return; }
            const usuario = r.rows[0];
            const rolRaw = String(usuario.rol || '').toLowerCase();
            if (rolRaw !== 'admin' && rolRaw !== 'administrador') {
                msg.textContent =
                    'La recuperación por correo es solo para administradores. Los técnicos deben pedir una clave provisoria al admin (panel Usuarios).';
                return;
            }
            _resetUsuarioAdmin = true;

            const destManual = (document.getElementById('reset-email-destino')?.value || '').trim();
            let toEmail = '';
            if (destManual) {
                if (!_esEmailValidoSimple(destManual)) {
                    msg.textContent = 'El correo de destino no es válido.';
                    return;
                }
                toEmail = destManual;
            } else {
                toEmail = await leerEmailContactoEmpresaNeon();
                if (!toEmail) toEmail = String(usuario.email || '').trim();
            }
            if (!_esEmailValidoSimple(toEmail)) {
                msg.textContent =
                    'No hay correo de destino. Completá «Enviar código a» o cargá el email de la empresa en el panel Admin → Empresa (email de contacto).';
                return;
            }

            const token = String(Math.floor(100000 + Math.random() * 900000));
            _resetTokenActual = token;
            const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            await sqlSimple(`UPDATE usuarios SET reset_token = ${esc(token)}, reset_expiry = ${esc(expiry)} WHERE id = ${esc(usuario.id)}`);

            const esAndroidLocal = !!window.AndroidDevice && (/GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:');
            if (esAndroidLocal) {
                msg.style.color = '#854d0e';
                msg.innerHTML =
                    `En Android no se puede enviar el correo desde la app.<br>` +
                    `Código temporal (válido ~30 min): <b>${token}</b><br>` +
                    `<span style="font-size:.8rem">Si necesitás recibirlo por mail, usá la versión web en PC.</span>`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            } else {
                if (!cfg?.publicKey || !cfg?.serviceId || !cfg?.templateId) {
                    throw new Error('Servicio de correo no configurado (config.json → emailjs)');
                }
                if (!window.emailjs || typeof emailjs.send !== 'function') {
                    throw new Error('Servicio de correo no cargado; recargá la página');
                }
                await emailjs.send(
                    cfg.serviceId,
                    cfg.templateId,
                    {
                        to_email: toEmail,
                        to_name: usuario.nombre || usuario.email || 'Administrador',
                        token,
                        app_name: 'GestorNova'
                    },
                    cfg.publicKey
                );

                msg.style.color = '#166534';
                msg.textContent = `✓ Código enviado a ${toEmail}`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            }
        } catch(e) {
            const em = _errMsg(e);
            const esAndroidLocal = !!window.AndroidDevice && (/GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:');
            if (esAndroidLocal && _resetTokenActual && _resetUsuarioAdmin) {
                msg.style.color = '#854d0e';
                msg.innerHTML =
                    `No se pudo enviar el email (${em}).<br>` +
                    `Código temporal: <b>${_resetTokenActual}</b>`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            } else {
                msg.style.color = '';
                msg.textContent = 'Error: ' + em;
            }
        }
    } else {
        const email  = document.getElementById('reset-email').value.trim();
        const codigo = document.getElementById('reset-codigo').value.trim();
        const nuevaPw = document.getElementById('reset-nueva-pw').value;
        if (!codigo || !nuevaPw) { msg.textContent = 'Completá el código y la nueva contraseña'; return; }
        try {
            const emailLc = email.toLowerCase();
            const r = await sqlSimple(`SELECT id
                FROM usuarios
                WHERE (
                        lower(coalesce(email,'')) = ${esc(emailLc)}
                     OR lower(coalesce(nombre,'')) = ${esc(emailLc)}
                      )
                  AND reset_token = ${esc(codigo)}
                  AND reset_expiry > NOW()
                LIMIT 1`);
            if (!r.rows[0]) { msg.textContent = 'Código incorrecto o expirado'; return; }
            await sqlSimple(
                `UPDATE usuarios SET password_hash = ${esc(nuevaPw)}, reset_token = NULL, reset_expiry = NULL, must_change_password = FALSE WHERE id = ${esc(r.rows[0].id)}`
            );
            msg.style.color = '#166534';
            msg.textContent = '✓ Contraseña actualizada. Ya podés iniciar sesión.';
            btn.style.display = 'none';
            _resetPaso = 1;
            _resetTokenActual = null;
            _resetUsuarioAdmin = false;
        } catch(e) {
            msg.style.color = '';
            msg.textContent = 'Error: ' + _errMsg(e);
        }
    }
}
window.pasoResetPw = pasoResetPw;

// ── Banner offline ocultable ──────────────────────────────────
function toggleOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    const toggle = document.getElementById('offline-toggle');
    if (!banner) return;
    if (banner.classList.contains('hidden')) {
        banner.classList.remove('hidden');
        try { localStorage.setItem('pmg_offline_banner_hidden', '0'); } catch(_) {}
        if (toggle) toggle.innerHTML = '<i class="fas fa-wifi-slash"></i>';
    } else {
        banner.classList.add('hidden');
        try { localStorage.setItem('pmg_offline_banner_hidden', '1'); } catch(_) {}
        if (toggle) toggle.innerHTML = '<i class="fas fa-wifi-slash"></i>';
    }
}
window.toggleOfflineBanner = toggleOfflineBanner;

// Sobrescribir setModoOffline para manejar el toggle
const _setModoOfflineOrig = setModoOffline;
// (La función original ya existe, solo agregar manejo del toggle)
function _actualizarEstadoBanner(offline) {
    const toggle = document.getElementById('offline-toggle');
    if (!toggle) return;
    toggle.className = offline ? 'visible' : '';
}

// ── Cache de tiles: escuchar progreso del SW ──────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        const msg = event.data;
        if (!msg || msg.tipo !== 'CACHE_PROGRESO') return;
        const bar  = document.getElementById('cache-progress-bar');
        const fill = document.getElementById('cache-fill');
        const pct  = document.getElementById('cache-pct');
        const txt  = document.getElementById('cache-msg');
        if (!bar) return;
        if (msg.estado === 'ya_hecho') {
            // Ya estaba cacheado — no mostrar nada
            return;
        }
        if (msg.estado === 'iniciando') {
            bar.classList.add('visible');
            txt.textContent = 'Descargando mapa offline (~' + msg.total + ' tiles)...';
            fill.style.width = '0%'; pct.textContent = '0%';
        } else if (msg.estado === 'progreso') {
            fill.style.width = msg.pct + '%'; pct.textContent = msg.pct + '%';
        } else if (msg.estado === 'completo') {
            fill.style.width = '100%'; pct.textContent = '100%';
            txt.textContent = '✓ Mapa offline listo (' + msg.ok + ' tiles descargados)';
            setTimeout(() => bar.classList.remove('visible'), 4000);
            toast('✓ Mapa offline descargado', 'success');
        }
    });
}

// ── Inicializar todo al arrancar ──────────────────────────────
(async function iniciarApp() {
    initSetupWizardBindings();
    (function showAndroidExportsBtn() {
        const b = document.getElementById('btn-android-descargas');
        if (b && window.AndroidDevice && typeof window.AndroidDevice.openExportsFolder === 'function') {
            b.style.display = '';
        }
    })();

    // 1. Cargar config.json
    const configOk = await cargarAppConfig();
    if (!configOk) return; // No continuar sin config

    // 2. Cargar EmailJS si hay config
    if (window.APP_CONFIG?.emailjs?.publicKey) {
        const ejsScript = document.createElement('script');
        ejsScript.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
        ejsScript.onload = () => {
            try {
                if (window.emailjs && window.APP_CONFIG?.emailjs?.publicKey) {
                    emailjs.init(window.APP_CONFIG.emailjs.publicKey);
                }
            } catch (_) {}
        };
        document.head.appendChild(ejsScript);
    }

    // Llamar conectarNeon() DESPUÉS de cargar config (timing correcto)
    await conectarNeon();
    if (document.getElementById('ls')?.classList.contains('active')) {
        hydrateBrandingForPublicScreen();
        try {
            if (NEON_OK) await cargarConfigEmpresa();
        } catch (_) {}
        try { aplicarMarcaVisualCompleta(); } catch (_) {}
    }
})();


// ── Descargar gráfico como PNG ────────────────────────────────
function descargarGrafico(canvasId, nombre) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { toast('Gráfico no disponible', 'error'); return; }
    try {
        // Crear canvas con fondo blanco para la descarga
        const tmp = document.createElement('canvas');
        tmp.width  = canvas.width;
        tmp.height = canvas.height;
        const ctx = tmp.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, 0);
        const link = document.createElement('a');
        link.download = nombre + '_' + new Date().toISOString().slice(0,10) + '.png';
        link.href = tmp.toDataURL('image/png');
        link.click();
        toast('Gráfico descargado', 'success');
    } catch(e) {
        toastError('descargar-grafico', e, 'No se pudo descargar.');
    }
}
window.descargarGrafico = descargarGrafico;

// ── Exponer funciones admin al scope global ────────────
if (typeof adminTab !== "undefined") window.adminTab = adminTab;
if (typeof guardarConfigEmpresa !== "undefined") window.guardarConfigEmpresa = guardarConfigEmpresa;
if (typeof abrirFormUsuario !== "undefined") window.abrirFormUsuario = abrirFormUsuario;
if (typeof crearUsuario !== "undefined") window.crearUsuario = crearUsuario;
if (typeof toggleUsuario !== "undefined") window.toggleUsuario = toggleUsuario;
if (typeof eliminarUsuario !== "undefined") window.eliminarUsuario = eliminarUsuario;
if (typeof abrirFormDistribuidor !== "undefined") window.abrirFormDistribuidor = abrirFormDistribuidor;
if (typeof crearDistribuidor !== "undefined") window.crearDistribuidor = crearDistribuidor;
if (typeof eliminarDistribuidor !== "undefined") window.eliminarDistribuidor = eliminarDistribuidor;
if (typeof importarExcelDistribuidores !== "undefined") window.importarExcelDistribuidores = importarExcelDistribuidores;
if (typeof mostrarFormatoExcel !== "undefined") window.mostrarFormatoExcel = mostrarFormatoExcel;
if (typeof cargarEstadisticas !== "undefined") window.cargarEstadisticas = cargarEstadisticas;
if (typeof cargarUbicacionesUsuarios !== "undefined") window.cargarUbicacionesUsuarios = cargarUbicacionesUsuarios;
if (typeof cambiarContrasena !== "undefined") window.cambiarContrasena = cambiarContrasena;
if (typeof pasoResetPw !== "undefined") window.pasoResetPw = pasoResetPw;
if (typeof toggleOfflineBanner !== "undefined") window.toggleOfflineBanner = toggleOfflineBanner;
if (typeof reactivarSesion !== "undefined") window.reactivarSesion = reactivarSesion;
if (typeof abrirAdmin !== "undefined") window.abrirAdmin = abrirAdmin;
if (typeof cargarListaUsuarios !== "undefined") window.cargarListaUsuarios = cargarListaUsuarios;
if (typeof cargarListaDistribuidoresAdmin !== "undefined") window.cargarListaDistribuidoresAdmin = cargarListaDistribuidoresAdmin;
if (typeof cargarFormEmpresa !== "undefined") window.cargarFormEmpresa = cargarFormEmpresa;
if (typeof cargarListaSociosAdmin !== "undefined") window.cargarListaSociosAdmin = cargarListaSociosAdmin;
if (typeof importarExcelSocios !== "undefined") window.importarExcelSocios = importarExcelSocios;
if (typeof mostrarFormatoExcelSocios !== "undefined") window.mostrarFormatoExcelSocios = mostrarFormatoExcelSocios;
if (typeof buscarHistorialPorNIS !== "undefined") window.buscarHistorialPorNIS = buscarHistorialPorNIS;
if (typeof generarInformeMensualENRE !== "undefined") window.generarInformeMensualENRE = generarInformeMensualENRE;
if (typeof exportInformeMensualExcel !== "undefined") window.exportInformeMensualExcel = exportInformeMensualExcel;
if (typeof imprimirInformeConGraficos !== "undefined") window.imprimirInformeConGraficos = imprimirInformeConGraficos;
if (typeof generarPdfEstadisticasMultipaginaENRE !== "undefined") window.generarPdfEstadisticasMultipaginaENRE = generarPdfEstadisticasMultipaginaENRE;
if (typeof abrirModalDashboardGerencia !== "undefined") window.abrirModalDashboardGerencia = abrirModalDashboardGerencia;
if (typeof refrescarDashboardGerencia !== "undefined") window.refrescarDashboardGerencia = refrescarDashboardGerencia;
if (typeof activarModoFijarUbicacionAdmin !== "undefined") window.activarModoFijarUbicacionAdmin = activarModoFijarUbicacionAdmin;
if (typeof onMapaFiltroChange !== "undefined") window.onMapaFiltroChange = onMapaFiltroChange;
if (typeof resetMapaFiltros !== "undefined") window.resetMapaFiltros = resetMapaFiltros;
if (typeof toggleMapaFiltrosBody !== "undefined") window.toggleMapaFiltrosBody = toggleMapaFiltrosBody;
if (typeof toggleMapaDashBody !== "undefined") window.toggleMapaDashBody = toggleMapaDashBody;

