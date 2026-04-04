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
  convertirAInchauspe
} from './map.js';







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
            console.warn(`Intento ${intento} de ${maxIntentos} falló:`, error.message);
            
            if (intento < maxIntentos) {
                
                const espera = Math.pow(2, intento - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, espera));
                
                
                try {
                    if (_sql) await _sql('SELECT 1');
                } catch (_) {}
            }
        }
    }
    
    
    toast('Error de conexión persistente. Intente nuevamente.', 'error');
    throw ultimoError;
}


async function sqlSimple(query, params = []) {
    if (!_sql) throw new Error('Neon no inicializado');
    let q = query;
    for (let i = 0; i < params.length; i++)
        q = q.replace(new RegExp('\\{' + i + '\\}', 'g'), esc(params[i]));
    return _sql(q);
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
            app.u = null;
            mapaInicializado = false;
            if (app.map) { app.map.remove(); app.map = null; }
            _marcadoresTecnicosPrincipal = [];
            const btnAdm = document.getElementById('btn-admin');
            if (btnAdm) btnAdm.style.display = 'none';
            const mapDashCard = document.getElementById('mapa-card-dashboard');
            if (mapDashCard) mapDashCard.style.display = 'none';
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
        
        
        NEON_OK = false;
        setModoOffline(true);
        
        
        if (app.u) {
            setTimeout(async () => {
                if (await hayInternet()) {
                    try {
                        _sql = null;
                        const reconectado = await initNeon();
                        if (reconectado) {
                            NEON_OK = true;
                            setModoOffline(false);
                            toast('Conexión restaurada ✓', 'success');
                            if (offlineQueue().length > 0) sincronizarOffline();
                            else cargarPedidos();
                        }
                    } catch(_) {}
                }
            }, 3000);
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
        if (!esAdmin()) window.pollNotificacionesMovil();
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
        'Cambio de Medidor',
        'Conexión Nueva',
        'Otros'
    ],
    cooperativa_electrica: [
        'Corte de Energía',
        'Cables Caídos/Peligro',
        'Problemas de Tensión',
        'Poste Inclinado/Dañado',
        'Cambio de Medidor',
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
    'Cambio de Medidor': 'Baja',
    'Conexión Nueva': 'Baja',
    'Corte de Energía': 'Alta',
    'Cables Caídos/Peligro': 'Crítica',
    'Problemas de Tensión': 'Alta',
    'Poste Inclinado/Dañado': 'Crítica',
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
    syncPrioridadConTipoReclamo();
}

const MATERIAL_UNIDADES = ['PZA','MTR','LTR','KG','M3','M2','ML','JGO','UN','BOL','TN','BOB','TR','CJ','PAR','KIT','TAM'];

const CN = new Set(['numero_pedido','fecha_creacion','fecha_cierre','distribuidor','setd',
    'cliente','tipo_trabajo','descripcion','prioridad','estado','avance','lat','lng',
    'usuario_id','usuario_creador_id','usuario_inicio_id','usuario_cierre_id','usuario_avance_id',
    'trabajo_realizado','tecnico_cierre','foto_base64','x_inchauspe','y_inchauspe',
    'fecha_avance','foto_cierre','nis_medidor','tecnico_asignado_id','fecha_asignacion','firma_cliente','checklist_seguridad','telefono_contacto']);

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
    try {
        const body = telefonoOverride ? { telefono_contacto: telefonoOverride } : {};
        const resp = await fetch(apiUrl(`/api/pedidos/${pid}/notify-cierre-whatsapp`), {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            const t = await resp.text();
            console.warn('[wa-cierre] API', resp.status, t.slice(0, 200));
        }
    } catch (e) {
        console.warn('[wa-cierre]', e && e.message);
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
    return BRANDING_DEFAULT_LOGO_DATA_URL;
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
            subtitulo: String((extra && extra.subtitulo) || window.EMPRESA_CFG?.subtitulo || '').trim(),
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
        const sub = String(c.subtitulo || '').trim();
        window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), ...(sub ? { subtitulo: sub } : {}) };
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
    const h1 = document.querySelector('.lc h1');
    if (h1) h1.textContent = m.nombre;
    const subEl = document.querySelector('.lc .sub');
    if (subEl) {
        const st = String(window.EMPRESA_CFG?.subtitulo || '').trim();
        subEl.textContent = st || 'Pedidos de mantenimiento';
    }
    const h2 = document.querySelector('.hd h2');
    if (h2) {
        h2.textContent = '';
        const ic = document.createElement('i');
        ic.className = 'fas fa-network-wired';
        h2.appendChild(ic);
        h2.appendChild(document.createTextNode(' ' + m.nombre));
    }
    const ll = document.querySelector('.ll');
    if (ll) {
        const u = String(m.logo_url || '').replace(/"/g, '&quot;').replace(/</g, '');
        ll.innerHTML = `<img src="${u}" alt="" style="width:42px;height:42px;object-fit:contain;border-radius:6px">`;
    }
}

const SESSION_WEB_ADMIN_TIPO_OK = 'pmg_web_admin_tipo_ok';
let _resolveAdminTipoModal = null;

async function promptAdminTipoNegocioWebIfNeeded() {
    if (!esAdminSesionWebPublica()) return;
    try {
        if (sessionStorage.getItem(SESSION_WEB_ADMIN_TIPO_OK) === '1') return;
    } catch (_) {}
    const modal = document.getElementById('modal-admin-tipo-negocio');
    const sel = document.getElementById('admin-sesion-tipo');
    if (!modal || !sel) return;
    const actual = String(window.EMPRESA_CFG?.tipo || '').trim();
    sel.value = actual || '';
    return new Promise((resolve) => {
        _resolveAdminTipoModal = resolve;
        modal.classList.add('active');
    });
}

async function confirmarAdminTipoNegocioWeb() {
    const sel = document.getElementById('admin-sesion-tipo');
    const chk = document.getElementById('admin-sesion-tipo-persistir');
    const modal = document.getElementById('modal-admin-tipo-negocio');
    const tipo = (sel?.value || '').trim();
    if (!tipo) {
        toast('Elegí un tipo de negocio', 'error');
        return;
    }
    let persistir = !!(chk && chk.checked);
    let guardadoServidor = false;
    if (persistir) {
        await asegurarJwtApiRest();
        if (!getApiToken()) await intentarRefrescarJwtDesdeCredencialesGuardadas();
        let token = getApiToken();
        if (!token) {
            toast('La API aún no respondió: el tipo se aplica solo en esta sesión. Reintentá guardar en servidor desde Admin → Empresa cuando haya conexión.', 'warning');
            persistir = false;
        } else {
            try {
                const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ tipo })
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
    window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), tipo };
    window.__PMG_TENANT_BRANDING__ = { ...(window.__PMG_TENANT_BRANDING__ || {}), tipo };
    try {
        persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
    } catch (_) {}
    aplicarEtiquetasPorTipo(tipo);
    poblarSelectTiposReclamo();
    syncEmpresaCfgNombreLogoDesdeMarca();
    aplicarMarcaVisualCompleta();
    try {
        sessionStorage.setItem(SESSION_WEB_ADMIN_TIPO_OK, '1');
    } catch (_) {}
    if (modal) modal.classList.remove('active');
    if (_resolveAdminTipoModal) {
        _resolveAdminTipoModal();
        _resolveAdminTipoModal = null;
    }
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

function toggleAndroidMapStripCollapsed(collapse) {
    const strip = document.getElementById('mapa-android-strip');
    const tab = document.getElementById('map-tab-android-bar');
    if (!strip) return;
    if (collapse === undefined) {
        collapse = !strip.classList.contains('mas-collapsed');
    }
    const hide = !!collapse;
    strip.classList.toggle('mas-collapsed', hide);
    if (esAndroidWebViewMapa()) strip.style.display = 'block';
    if (tab) {
        if (hide && esAndroidWebViewMapa()) tab.classList.add('visible');
        else tab.classList.remove('visible');
    }
    try { localStorage.setItem('pmg_android_strip_collapsed', hide ? '1' : '0'); } catch (_) {}
}
window.toggleAndroidMapStripCollapsed = toggleAndroidMapStripCollapsed;




const dbs = document.getElementById('dbs');
const lb  = document.getElementById('lb');


lb.disabled = false;
actualizarBadgeOffline();
(function prefillLoginUsuarioGuardado() {
    try {
        const v = localStorage.getItem('gestornova_saved_login');
        const inp = document.getElementById('em');
        if (v && inp && !inp.value) inp.value = v;
    } catch (_) {}
})();
(function pintarMarcaLoginAlCargarModulo() {
    try {
        if (document.getElementById('ls')?.classList.contains('active')) {
            hydrateBrandingForPublicScreen();
            aplicarMarcaVisualCompleta();
        }
    } catch (_) {}
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
                    setd TEXT, cliente TEXT, tipo_trabajo TEXT,
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
                await sqlSimple(`CREATE TABLE IF NOT EXISTS socios_catalogo(
                    id SERIAL PRIMARY KEY,
                    nis_medidor TEXT NOT NULL UNIQUE,
                    nombre TEXT,
                    domicilio TEXT,
                    telefono TEXT,
                    distribuidor_codigo TEXT,
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS localidad TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS tipo_tarifa TEXT`);
                await sqlSimple(`ALTER TABLE socios_catalogo ADD COLUMN IF NOT EXISTS urbano_rural TEXT`);
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
        if (esAdmin() && !esAndroidWebViewMapa()) {
            try { sessionStorage.removeItem(SESSION_WEB_ADMIN_TIPO_OK); } catch (_) {}
        }
        localStorage.setItem('pmg', JSON.stringify(app.u));
        document.getElementById('un').textContent = u.nombre.split(' ')[0];
        document.getElementById('ls').classList.remove('active');
        document.getElementById('ms').classList.add('active');
        iniciarKeepAlive();
        iniciarTracking();
        iniciarPollNotifMovil();
        iniciarSyncCatalogos();
        const btnAdm = document.getElementById('btn-admin');
        if (btnAdm) btnAdm.style.display = esAdmin() ? 'flex' : 'none';
        const btnDash = document.getElementById('btn-dashboard-gerencia');
        if (btnDash) btnDash.style.display = esAdmin() ? 'flex' : 'none';
        const mapDashCard = document.getElementById('mapa-card-dashboard');
        if (mapDashCard) mapDashCard.style.display = esAdmin() ? 'block' : 'none';
        const wrapTog = document.getElementById('wrap-toggle-ver-todos');
        const chkTod = document.getElementById('toggle-ver-todos-pedidos');
        if (wrapTog && chkTod) {
            wrapTog.style.display = esTecnicoOSupervisor() ? 'inline-flex' : 'none';
            chkTod.checked = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
        }
        try {
            if (window.AndroidSession && typeof AndroidSession.setUser === 'function') {
                AndroidSession.setUser(parseInt(u.id, 10) || 0, String(u.rol || ''));
            }
        } catch (_) {}
        if (esAdmin()) {
            iniciarDashboardGerenciaPoll();
            iniciarPollWhatsappHumanChat();
        } else {
            detenerDashboardGerenciaPoll();
            detenerPollWhatsappHumanChat();
            destruirTodasVentanasWaHc();
            detenerTecnicosMapaPrincipalPoll();
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
                await promptAdminTipoNegocioWebIfNeeded();
                await cargarConfigEmpresa();
                await cargarPedidos();
                
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
            try { localStorage.setItem('gestornova_saved_login', em); } catch (_) {}
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
        // Primero la consulta mínima (evita 400 en Neon si no existen tenant_id / cliente_id).
        const loginSqlAttempts = [
            `SELECT id, email, nombre, rol ${loginWhere}`,
            `SELECT id, email, nombre, rol, tenant_id ${loginWhere}`,
            `SELECT id, email, nombre, rol, COALESCE(cliente_id, 1) AS tenant_id ${loginWhere}`
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
            try { localStorage.setItem('gestornova_saved_login', em); } catch (_) {}
            const u = {
                id: usuario.id,
                email: usuario.email,
                nombre: usuario.nombre || 'Administrador',
                rol: normalizarRolStr(usuario.rol || 'tecnico'),
                tenant_id: usuario.tenant_id != null ? Number(usuario.tenant_id) : tenantIdActual()
            };
            guardarUsuarioOffline(u, pw);
            await loginApiJwt(em, pw);
            if (!getApiToken()) {
                toast('La API (JWT) no respondió: el setup SaaS y datos del tenant pueden no cargar hasta que revises API_BASE_URL o la red.', 'warning');
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

function toast(msg, tipo = 'info') {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'show ' + tipo;
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => { el.className = tipo; }, 3200);
}

const norm = p => ({
    id: p.id,
    np: p.numero_pedido,
    f: p.fecha_creacion || p.fecha || new Date().toISOString(),
    fc: p.fecha_cierre || null,
    fa: p.fecha_avance || null,
    dis: p.distribuidor || '',
    sd: p.setd || '',
    cl: p.cliente || '',
    tt: p.tipo_trabajo || '',
    de: p.descripcion || '',
    pr: p.prioridad || 'Media',
    es: p.estado || 'Pendiente',
    av: parseInt(p.avance) || 0,
    la: parseFloat(p.lat) || -31.505,
    ln: parseFloat(p.lng) || -60.02,
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
    nis: (p.nis_medidor || '').trim(),
    tai: p.tecnico_asignado_id != null ? parseInt(p.tecnico_asignado_id, 10) : null,
    fasi: p.fecha_asignacion || null,
    firma: p.firma_cliente || null,
    chkl: p.checklist_seguridad || null,
    tel: (p.telefono_contacto || '').trim(),
    opin: p.opinion_cliente || null
});

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
        if (es === 'Cerrado') return chk('mapa-flt-cerrado');
        return true;
    };
    const selU = document.getElementById('mapa-filtro-usuario');
    const selA = document.getElementById('mapa-filtro-asignado');
    const uidF = selU?.value || '';
    const asigF = selA?.value || '';
    return app.p.filter(p => {
        if (!p.la || !p.ln) return false;
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
            if ((p.es || '') === 'Cerrado') return chkP('mapa-flt-prio-cerrado');
            const mapPr = { 'Crítica': 'mapa-flt-prio-critica', 'Alta': 'mapa-flt-prio-alta', 'Media': 'mapa-flt-prio-media', 'Baja': 'mapa-flt-prio-baja' };
            return chkP(mapPr[p.pr] || 'mapa-flt-prio-baja');
        })();
        if (!prioOk) return false;
        if (!pedidoVisibleSegunRubro(p)) return false;
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
    try { renderMk(); } catch (_) {}
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
    const card = document.getElementById('mapa-card-filtros');
    if (!card) return;
    const on = !!chk?.checked;
    try { localStorage.setItem('pmg_show_map_filters', on ? '1' : '0'); } catch (_) {}
    card.style.display = on ? 'block' : 'none';
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
        if (cardId === 'mapa-card-colores') localStorage.setItem('pmg_slideoff_colores', hide ? '1' : '0');
        if (cardId === 'mapa-card-dashboard') localStorage.setItem('pmg_slideoff_dash', hide ? '1' : '0');
    } catch (_) {}
}

function syncMapSlideTabsFromStorage() {
    const cf = document.getElementById('mapa-card-filtros');
    if (cf && localStorage.getItem('pmg_slideoff_filtros') === '1') toggleMapaCardSlideoff('mapa-card-filtros', true);
    const cc = document.getElementById('mapa-card-colores');
    if (cc && cc.style.display !== 'none' && localStorage.getItem('pmg_slideoff_colores') === '1') toggleMapaCardSlideoff('mapa-card-colores', true);
    const cd = document.getElementById('mapa-card-dashboard');
    if (cd && cd.style.display !== 'none' && localStorage.getItem('pmg_slideoff_dash') === '1') toggleMapaCardSlideoff('mapa-card-dashboard', true);
}

let _bp2DragState = null;

function aplicarPosicionBp2Guardada() {
    const bp2 = document.getElementById('bp2');
    if (!bp2 || !window.matchMedia('(min-width:1024px)').matches || esAndroidWebViewMapa()) return;
    try {
        const raw = localStorage.getItem('pmg_bp2_pos');
        if (!raw) return;
        const p = JSON.parse(raw);
        if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) return;
        const pad = 8;
        const w = bp2.offsetWidth || 360;
        const h = bp2.offsetHeight || 200;
        const left = Math.min(Math.max(pad, p.left), window.innerWidth - w - pad);
        const top = Math.min(Math.max(pad + 52, p.top), window.innerHeight - h - pad);
        bp2.style.right = 'auto';
        bp2.style.bottom = 'auto';
        bp2.style.left = left + 'px';
        bp2.style.top = top + 'px';
    } catch (_) {}
}

function initBp2PanelFlotanteDesktop() {
    const bp2 = document.getElementById('bp2');
    const ph = document.getElementById('ph');
    if (!bp2 || !ph || ph.dataset.bp2DragInit === '1') return;
    if (window.matchMedia('(min-width:1024px)').matches && !esAndroidWebViewMapa()) {
        ph.dataset.bp2DragInit = '1';
        aplicarPosicionBp2Guardada();
        ph.addEventListener('mousedown', (e) => {
            if (!window.matchMedia('(min-width:1024px)').matches || esAndroidWebViewMapa()) return;
            if (e.target.closest('button')) return;
            const r = bp2.getBoundingClientRect();
            _bp2DragState = {
                sx: e.clientX,
                sy: e.clientY,
                sl: r.left,
                st: r.top,
                moved: false
            };
            const onMove = (ev) => {
                if (!_bp2DragState) return;
                const dx = ev.clientX - _bp2DragState.sx;
                const dy = ev.clientY - _bp2DragState.sy;
                if (Math.abs(dx) + Math.abs(dy) > 5) _bp2DragState.moved = true;
                bp2.style.right = 'auto';
                bp2.style.bottom = 'auto';
                bp2.style.left = (_bp2DragState.sl + dx) + 'px';
                bp2.style.top = (_bp2DragState.st + dy) + 'px';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (_bp2DragState && _bp2DragState.moved) {
                    try {
                        const br = bp2.getBoundingClientRect();
                        localStorage.setItem('pmg_bp2_pos', JSON.stringify({ left: br.left, top: br.top }));
                    } catch (_) {}
                    window.__bp2DragJustEnded = true;
                    setTimeout(() => { window.__bp2DragJustEnded = false; }, 450);
                }
                _bp2DragState = null;
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }
}

function aplicarUIMapaPlataforma() {
    syncMapaLabelsNpCheckbox();
    syncMapaPrioFiltrosFromStorage();
    const strip = document.getElementById('mapa-android-strip');
    const card = document.getElementById('mapa-card-filtros');
    const cardCol = document.getElementById('mapa-card-colores');
    if (!strip || !card) return;
    if (esAndroidWebViewMapa()) {
        strip.style.display = 'block';
        const adv = localStorage.getItem('pmg_show_map_filters') === '1';
        const chk = document.getElementById('chk-android-filtros-av');
        if (chk) chk.checked = adv;
        card.style.display = adv ? 'block' : 'none';
        if (cardCol) cardCol.style.display = adv ? 'block' : 'none';
        if (!adv) {
            document.getElementById('map-tab-filtros')?.classList.remove('visible');
            document.getElementById('map-tab-colores')?.classList.remove('visible');
            document.getElementById('map-tab-dash')?.classList.remove('visible');
        }
        const wrap = document.getElementById('wrap-android-scope');
        if (wrap) {
            wrap.style.display = esTecnicoOSupervisor() ? 'inline-flex' : 'none';
            const sel = document.getElementById('sel-android-pedidos-scope');
            if (sel) sel.value = localStorage.getItem('pmg_tecnico_ver_todos') === '1' ? 'todos' : 'asignados';
        }
        const tabBar = document.getElementById('map-tab-android-bar');
        if (localStorage.getItem('pmg_android_strip_collapsed') === '1') {
            strip.classList.add('mas-collapsed');
            tabBar?.classList.add('visible');
        } else {
            strip.classList.remove('mas-collapsed');
            tabBar?.classList.remove('visible');
        }
    } else {
        strip.style.display = 'none';
        document.getElementById('map-tab-android-bar')?.classList.remove('visible');
        card.style.display = 'block';
        if (cardCol) cardCol.style.display = 'block';
    }
    try {
        setBp2PanelHidden(localStorage.getItem('pmg_bp2_hidden') === '1');
    } catch (_) {}
    syncMapSlideTabsFromStorage();
    try { initBp2PanelFlotanteDesktop(); } catch (_) {}
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
        const r = await sqlSimple(`SELECT DISTINCT ON (uu.usuario_id) uu.usuario_id, uu.lat, uu.lng, uu.timestamp, u.nombre, u.email, u.rol
            FROM ubicaciones_usuarios uu
            JOIN usuarios u ON u.id = uu.usuario_id AND u.activo = TRUE
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
            const m = L.marker([lat, lng], { icon, zIndexOffset: 750 })
                .addTo(app.map)
                .bindPopup(`<b>${_escOpt(nom)}</b><br>${_escOpt(row.rol || '')}<br>hace ${Math.round((Date.now() - new Date(row.timestamp)) / 60000)} min`);
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
    } catch (e) {
        toast('No se pudo guardar: ' + e.message, 'error');
    }
}

let _pollDashInterval = null;
let _pollTecnicosMapaInterval = null;
let _seenClosedIds = new Set();
let _dashCierresInit = false;

function detenerTecnicosMapaPrincipalPoll() {
    if (_pollTecnicosMapaInterval) {
        clearInterval(_pollTecnicosMapaInterval);
        _pollTecnicosMapaInterval = null;
    }
}

/** Supervisor (sin panel KPI): solo técnicos en mapa principal. */
function iniciarDashboardGerenciaPoll() {
    detenerDashboardGerenciaPoll();
    detenerTecnicosMapaPrincipalPoll();
    if (!esAdmin()) return;
    const tick = () => { pollCierresGerencia(); refrescarDashboardGerencia(true); };
    tick();
    _pollDashInterval = setInterval(tick, 25000);
}

function detenerDashboardGerenciaPoll() {
    if (_pollDashInterval) {
        clearInterval(_pollDashInterval);
        _pollDashInterval = null;
    }
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
        if (!_waHcPollPrimed) {
            _waHcPollPrimed = true;
            for (const s of list) {
                const id = String(s.id);
                _waHcKnownSessionIds.add(id);
                mostrarToastWaHumanChatNuevo(s);
            }
            return;
        }
        for (const s of list) {
            const id = String(s.id);
            if (_waHcKnownSessionIds.has(id)) continue;
            _waHcKnownSessionIds.add(id);
            mostrarToastWaHumanChatNuevo(s);
        }
    } catch (_) {}
}

function mostrarToastWaHumanChatNuevo(s) {
    const host = document.getElementById('wa-human-chat-toast-host');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'wa-human-chat-toast';
    const name = String(s.contact_name || '').trim() || 'Cliente';
    const ph = String(s.phone_canonical || '');
    el.innerHTML = `<strong><i class="fas fa-comments"></i> Cliente pide chat</strong><br>${_escOpt(name)} · ${_escOpt(ph)}<br><span style="font-size:.76rem;opacity:.9">Tocá para abrir</span>`;
    el.onclick = () => {
        try { el.remove(); } catch (_) {}
        abrirModalWhatsappHumanChat(Number(s.id));
    };
    host.appendChild(el);
    setTimeout(() => { try { if (el.parentElement) el.remove(); } catch (_) {} }, 45000);
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
        toast(String(e.message || e), 'error');
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
        toast('No se pudo abrir el chat: ' + (e.message || e), 'error');
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
            detalle(p);
        } else {
            toast('Actualizá la lista — pedido no encontrado en caché', 'info');
        }
    };
    host.appendChild(el);
    setTimeout(() => { try { if (el.parentNode) el.remove(); } catch (_) {} }, 90000);
}

function abrirModalDashboardGerencia() {
    if (!app.u || !esAdmin()) return;
    document.getElementById('modal-dashboard-gerencia')?.classList.add('active');
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
    if (filter === 'activos') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado <> 'Cerrado'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'pendientes') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'Pendiente'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'asignados') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'Asignado'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'en_ejecucion') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_creacion, descripcion FROM pedidos WHERE estado = 'En ejecución'${tsql} ORDER BY fecha_creacion DESC LIMIT ${lim}`;
    } else if (filter === 'cerrados_hoy') {
        q = `SELECT id, numero_pedido, estado, prioridad, fecha_cierre, descripcion FROM pedidos WHERE estado = 'Cerrado' AND fecha_cierre::date = CURRENT_DATE${tsql} ORDER BY fecha_cierre DESC LIMIT ${lim}`;
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
            return `<div style="padding:.3rem 0;border-bottom:1px solid var(--bo);cursor:pointer;color:var(--bm)" onclick="cerrarModalDashYAbrirPedido(${row.id})"><strong>#${np}</strong> · ${es} · ${pr}<br><span style="color:var(--tm);font-size:.78rem">${fe} — ${de}${(row.descripcion && row.descripcion.length > 72) ? '…' : ''}</span></div>`;
        }).join('');
    } catch (e) {
        host.innerHTML = '<span style="color:var(--re)">' + (e.message || e) + '</span>';
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
                COUNT(*) FILTER (WHERE estado <> 'Cerrado') AS activos,
                COUNT(*) FILTER (WHERE estado = 'Asignado') AS asignados,
                COUNT(*) FILTER (WHERE estado = 'En ejecución') AS en_ejec,
                COUNT(*) FILTER (WHERE estado = 'Pendiente') AS pendientes,
                COUNT(*) FILTER (WHERE estado = 'Cerrado' AND fecha_cierre::date = CURRENT_DATE) AS cerrados_hoy
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
            { val: a.activos || 0, lbl: 'Activos (no cerrados)', cls: 'orange', filter: 'activos' },
            { val: a.pendientes || 0, lbl: 'Pendiente', cls: '', filter: 'pendientes' },
            { val: a.asignados || 0, lbl: 'Asignados', cls: 'dash-kpi-blue', filter: 'asignados' },
            { val: a.en_ejec || 0, lbl: 'En ejecución', cls: 'dash-kpi-blue', filter: 'en_ejecucion' },
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
        if (kpi && !silent) kpi.innerHTML = '<span style="color:var(--re)">' + e.message + '</span>';
        if (kpiM && !silent) kpiM.innerHTML = '<span style="color:var(--re)">' + e.message + '</span>';
    }
}

window.cerrarModalDashYAbrirPedido = async function (pid) {
    document.getElementById('modal-dashboard-gerencia')?.classList.remove('active');
    await cargarPedidos();
    const p = app.p.find(x => String(x.id) === String(pid));
    if (!p) { toast('Pedido no encontrado', 'error'); return; }
    app.tab = tabPedidoListaPorEstado(p.es);
    document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === app.tab));
    render();
    detalle(p);
};
window.cerrarModalDashYVerCierre = window.cerrarModalDashYAbrirPedido;

async function intentarAutoInicioEjecucionTecnico(lat, lng) {
    if (!app.u || !esTecnicoOSupervisor() || modoOffline || !NEON_OK) return;
    const uid = parseInt(app.u.id, 10);
    const umbral = 0.015;
    for (const p of app.p) {
        if (p.es !== 'Asignado' || p.tai !== uid) continue;
        if (p.la == null || p.ln == null) continue;
        if (distanciaKm(lat, lng, p.la, p.ln) > umbral) continue;
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

async function asegurarNombreUsuariosParaFiltros() {
    if (!NEON_OK || modoOffline || !app.u || !_sql) return;
    if (app.usuariosCache && app.usuariosCache.length) return;
    try {
        const ru = await sqlSimple(`SELECT id, nombre, email, rol, telefono, COALESCE(whatsapp_notificaciones, true) AS whatsapp_notificaciones
            FROM usuarios WHERE activo = TRUE ORDER BY nombre`);
        app.usuariosCache = (ru.rows || []).map(row => ({ ...row, rol: normalizarRolStr(row.rol) }));
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
        let qPed = `SELECT * FROM pedidos WHERE 1=1${tsql} ORDER BY fecha_creacion DESC`;
        if (esTecnicoOSupervisor()) {
            const verTodos = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
            if (!verTodos) {
                qPed = `SELECT * FROM pedidos WHERE tecnico_asignado_id = ${esc(parseInt(app.u.id, 10))}${tsql} ORDER BY fecha_creacion DESC`;
            }
        }
        const r = await ejecutarSQLConReintentos(qPed);
        const prevIds = new Set((app.p || []).map(p => p.id));
        app.p = (r.rows || []).map(norm);
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
}







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


function mostrarMarcadorUbicacion(lat, lon, acc) {
    if (!app.map) return;

    
    if (marcadorUbicacion) {
        try { app.map.removeLayer(marcadorUbicacion); } catch(_) {}
        marcadorUbicacion = null;
    }
    
    if (_circuloAcc) {
        try { app.map.removeLayer(_circuloAcc); } catch(_) {}
        _circuloAcc = null;
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

    marcadorUbicacion = L.marker([lat, lon], { icon: svgIcon, zIndexOffset: 1000 })
        .addTo(app.map)
        .bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
                <b style="color:#059669">📍 Tu ubicación</b><br>
                <span style="font-size:11px;color:#475569">${tipoGps} — ${accTexto}</span><br>
                <span style="font-size:10px;color:#94a3b8">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
            </div>
        `);

    
    if (acc && acc > 50 && !gnMapaLigero()) {
        const radioVisual = Math.min(acc, 380);
        _circuloAcc = L.circle([lat, lon], {
            radius: radioVisual,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: '5,5'
        }).addTo(app.map);
    }

    return precisionZoom;
}






function solicitarUbicacion(centrarMapa = true, modoSilencioso = false) {
    if (!navigator.geolocation) {
        if (!modoSilencioso) toast('Geolocalización no disponible en este dispositivo', 'error');
        return;
    }

    
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
                    app.map.setView([latitude, longitude], zoomSugerido, { animate: !gnMapaLigero() });
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
            app.map.setView([ultimaUbicacion.lat, ultimaUbicacion.lon], 14, { animate: !gnMapaLigero() });
            if (!modoSilencioso) toast('📍 Mostrando última ubicación conocida', 'info');
        }
    }

    
    navigator.geolocation.getCurrentPosition(
        pos => {
            procesarPosicion(pos, false);
            
            if (pos.coords.accuracy > 100 && intentos < MAX_INTENTOS) {
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
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
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

async function irAMiUbicacionEnMapa() {
    await ensureMapReady();
    if (!app.map) {
        toast('No se pudo cargar el mapa', 'error');
        return;
    }
    solicitarUbicacion(true, false);
}
window.irAMiUbicacionEnMapa = irAMiUbicacionEnMapa;

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

document.getElementById('btn-pedido-ubicacion').addEventListener('click', async () => {
    limpiarFotosYPreviewNuevoPedido();
    closeAll();
    await ensureMapReady();

    function aplicarUbicacionAlFormulario(lat, lon, acc) {
        registrarFajaInstalacionSiFalta(lon);
        app.sel = { lat, lng: lon };
        document.getElementById('li').value = lat;
        document.getElementById('gi').value = lon;
        syncWrapCoordsDisplayNuevoPedido();
        const ui = document.getElementById('ui');
        if (ui) {
            ui.innerHTML = htmlLineaUbicacionFormulario(lat, lon, acc);
            ui.className = 'ud sel';
        }
        if (app.map) mostrarMarcadorUbicacion(lat, lon, acc);
    }

    if (ultimaUbicacion) {
        aplicarUbicacionAlFormulario(ultimaUbicacion.lat, ultimaUbicacion.lon, ultimaUbicacion.acc);
        try { poblarSelectTiposReclamo(); } catch (_) {}
        document.getElementById('pm').classList.add('active');
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    const acc = Math.round(pos.coords.accuracy);
                    ultimaUbicacion = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc };
                    try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}
                    aplicarUbicacionAlFormulario(ultimaUbicacion.lat, ultimaUbicacion.lon, acc);
                },
                () => {},
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
        }
    } else {
        try { poblarSelectTiposReclamo(); } catch (_) {}
        document.getElementById('pm').classList.add('active');
        toast('Obteniendo ubicación GPS...', 'info');
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    const acc = Math.round(pos.coords.accuracy);
                    ultimaUbicacion = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc };
                    try { localStorage.setItem('ultima_ubicacion', JSON.stringify(ultimaUbicacion)); } catch(_) {}
                    aplicarUbicacionAlFormulario(ultimaUbicacion.lat, ultimaUbicacion.lon, acc);
                    const msg = acc < 2000 ? `📍 ±${acc}m` : `🌐 ±${(acc/1000).toFixed(0)}km (baja precisión)`;
                    toast(msg, acc < 2000 ? 'success' : 'info');
                },
                () => toast('No se pudo obtener GPS — tocá el mapa para ubicarte', 'error'),
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
            );
        } else {
            toast('GPS no disponible — tocá el mapa para seleccionar la ubicación', 'error');
        }
    }
});

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
    
    const chkNp = document.getElementById('mapa-chk-label-np');
    const showNp = chkNp ? chkNp.checked : (localStorage.getItem('pmg_map_labels_np') === '1');
    pedidosParaMarcadoresMapa().forEach(p => {
        const cer = p.es === 'Cerrado';
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
            m = L.marker([p.la, p.ln], { icon, zIndexOffset: cer ? 80 : 220 }).addTo(app.map);
        } else {
            m = L.circleMarker([p.la, p.ln], {
                radius: cer ? 6 : 9,
                fillColor: col,
                color: '#fff',
                weight: 2,
                fillOpacity: cer ? 0.5 : 0.9
            }).addTo(app.map);
        }
        m.bindPopup(`
            <div style="min-width:160px;font-family:system-ui">
                <b style="color:#1e3a8a">#${p.np} - ${p.pr}</b><br>
                <span style="font-size:11px;color:#475569">${p.tt} - ${p.es} (${p.av}%)</span><br>
                <div style="font-size:12px;margin-top:4px">${(p.de || '').substring(0,70)}${(p.de && p.de.length > 70) ? '…' : ''}</div>
                <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
                    <button style="flex:1;min-width:72px;padding:4px;background:#1e3a8a;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_d('${p.id}')">Detalle</button>
                    <button style="flex:1;min-width:72px;padding:4px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:11px" onclick="_z('${p.id}')">Zoom</button>
                    ${esAdmin() && p.es !== 'Cerrado' && (p.tai == null) ? `<button style="flex:1;min-width:72px;padding:4px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_assignMapa('${p.id}')">Asignar</button>` : ''}
                    ${esAdmin() && p.es !== 'Cerrado' && (p.tai != null) ? `<button style="flex:1;min-width:72px;padding:4px;background:#ea580c;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_assignMapa('${p.id}')">Reasignar</button><button style="flex:1;min-width:72px;padding:4px;background:#64748b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:11px" onclick="_desasignarMapa('${p.id}')">Desasignar</button>` : ''}
                </div>
            </div>`, { maxWidth: 260 });
        
        app.mk.push(m);
    });
}

window._d = id => {
    app.map?.closePopup();
    const p = app.p.find(x => String(x.id) === String(id));
    if (p) detalle(p);
};

window._z = id => {
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) return;
    void (async () => {
        await ensureMapReady();
        if (!app.map) return;
        app.map.closePopup();
        app.map.setView([p.la, p.ln], 17, { animate: true });
        setTimeout(() => {
            document.getElementById('zoom-altura').textContent = calcularEscalaReal(app.map.getZoom());
        }, 300);
    })();
};

window._assignMapa = id => {
    try { app.map?.closePopup(); } catch (_) {}
    abrirModalAsignarTecnico(id);
};

window._desasignarMapa = id => {
    try { app.map?.closePopup(); } catch (_) {}
    ejecutarDesasignarPedidoPorId(id, { confirmar: true });
};

window._a = (a, id) => {
    if (a === 'i') {
        void iniciar(id);
        return;
    }
    closeAll();
    if (a === 'av') abrirAvance(id);
    else abrirCierre(id);
};

window._zm = id => {
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) return;
    void (async () => {
        await ensureMapReady();
        if (!app.map) return;
        closeAll();
        setTimeout(() => {
            if (!app.map) return;
            app.map.invalidateSize({ animate: false });
            app.map.setView([p.la, p.ln], 17, { animate: true });
            setTimeout(() => {
                document.getElementById('zoom-altura').textContent = calcularEscalaReal(17);
            }, 300);
        }, 100);
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

    let pedido = app.p.find(x => String(x.id) === pid);
    if (!pedido && !modoOffline && NEON_OK && _sql) {
        try {
            const rr = await sqlSimple(`SELECT * FROM pedidos WHERE id = ${esc(parseInt(pid, 10))} LIMIT 1`);
            const row = rr.rows?.[0];
            if (row) {
                pedido = norm(row);
                const idx = app.p.findIndex(x => String(x.id) === String(pedido.id));
                if (idx >= 0) app.p[idx] = pedido;
                else app.p.unshift(pedido);
            }
        } catch (_) {}
    }
    if (!pedido) return false;
    if (!document.getElementById('ms')?.classList.contains('active')) return false;
    await ensureMapReady();
    if (!app.map) return false;

    try {
        closeAll();
        detalle(pedido);
        _zm(String(pedido.id));
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

window.abrirModalAsignarTecnico = function (pedidoId) {
    if (!esAdmin()) {
        toast('Solo administrador puede asignar', 'error');
        return;
    }
    _assignPedidoId = pedidoId;
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
            await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo) VALUES (${esc(oldTai)}, ${esc(pidNum)}, ${esc(tOld)}, ${esc(cOld)})`);
            await enviarWhatsappMetaTecnico(oldTai, pidNum, `${tOld}: ${cOld}`);
        }
        await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo) VALUES (${esc(uid)}, ${esc(pidNum)}, ${esc(titulo)}, ${esc(cuerpo)})`);
        await enviarWhatsappMetaTecnico(uid, pidNum, `${titulo}: ${cuerpo}`);
        document.getElementById('modal-asignar-tecnico')?.classList.remove('active');
        _assignPedidoId = null;
        toast(oldTai && oldTai !== uid ? 'Reasignado y notificaciones enviadas' : 'Técnico asignado y notificación encolada', 'success');
        await cargarPedidos();
        render();
    } catch (e) {
        toast('Error: ' + (e.message || e), 'error');
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
        await sqlSimple(`INSERT INTO notificaciones_movil (usuario_id, pedido_id, titulo, cuerpo) VALUES (${esc(oldUid)}, ${esc(pidNum)}, ${esc(tOld)}, ${esc(cOld)})`);
        await enviarWhatsappMetaTecnico(oldUid, pidNum, `${tOld}: ${cOld}`);
        document.getElementById('modal-asignar-tecnico')?.classList.remove('active');
        _assignPedidoId = null;
        toast('Técnico desasignado; notificación enviada', 'success');
        await cargarPedidos();
        render();
    } catch (e) {
        toast('Error: ' + (e.message || e), 'error');
    }
}

async function confirmarDesasignarPedido() {
    if (!_assignPedidoId) return;
    await ejecutarDesasignarPedidoPorId(_assignPedidoId, { confirmar: true });
}
window.confirmarDesasignarPedido = confirmarDesasignarPedido;
window.ejecutarDesasignarPedidoPorId = ejecutarDesasignarPedidoPorId;

window.pollNotificacionesMovil = async function () {
    if (!app.u || esAdmin() || modoOffline || !NEON_OK || !_sql) return;
    try {
        const r = await sqlSimple(`SELECT id, titulo, cuerpo, pedido_id FROM notificaciones_movil WHERE usuario_id = ${esc(app.u.id)} AND leida = FALSE ORDER BY id ASC LIMIT 15`);
        const rows = r.rows || [];
        const tienePuente = window.AndroidLocalNotify && typeof window.AndroidLocalNotify.show === 'function';
        for (const row of rows) {
            const t = row.titulo || 'GestorNova';
            const b = row.cuerpo || '';
            const pid = row.pedido_id != null ? String(row.pedido_id) : '';
            if (tienePuente) {
                try {
                    window.AndroidLocalNotify.show(String(row.id), t, b, pid);
                    await sqlSimple(`UPDATE notificaciones_movil SET leida = TRUE WHERE id = ${esc(row.id)}`);
                    if (pid) await resolverFocoPedidoNotificacion(pid, { silent: true });
                } catch (_) {}
            }
        }
    } catch (e) {
        if (!String(e.message || e).includes('notificaciones_movil')) console.warn('[notif-movil]', e.message || e);
    }
};

function iniciarPollNotifMovil() {
    detenerPollNotifMovil();
    if (esAdmin()) return;
    window.pollNotificacionesMovil();
    _pollNotifMovilInterval = setInterval(() => { window.pollNotificacionesMovil(); }, 45000);
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
    if (p.es === 'Cerrado' && !String(p.id).startsWith('off_') && NEON_OK && !modoOffline) {
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
    } else if (p.es === 'Cerrado') {
        matSection = `<h2>🔧 Materiales</h2><p style="font-size:9pt">Sin datos (sin conexión).</p>`;
    }

    const _labFirma = etiquetaFirmaPersona();
    const firmaSection = p.es === 'Cerrado'
        ? (p.firma
            ? `<h2>✍️ Firma del ${_labFirma}</h2><div><img src="${String(p.firma).replace(/"/g, '&quot;')}" class="firma-print" alt="Firma"/></div>`
            : `<h2>✍️ Firma del ${_labFirma}</h2><p style="font-size:9pt"><em>Sin firma registrada.</em></p>`)
        : '';

    const contenidoCuerpo = `
            <h1>Pedido de Mantenimiento N° ${escHtmlPrint(p.np)}</h1>
            
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
                <tr><td>Distribuidor:</td><td>${escHtmlPrint(p.dis)}</td></tr>
                ${p.sd ? `<tr><td>SETD:</td><td>${escHtmlPrint(p.sd)}</td></tr>` : ''}
                ${p.cl ? `<tr><td>Cliente:</td><td>${escHtmlPrint(p.cl)}</td></tr>` : ''}
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
            ${matSection}
            ${firmaSection}
            
            <h2>📍 Ubicación</h2>
            <table>
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
    imprimirPedidoAsync(p).catch(e => toast('Error al preparar impresión: ' + (e.message || e), 'error'));
};
window.imprimirPedidoPorId = function(id) {
    const p = app.p.find(x => String(x.id) === String(id));
    if (!p) { toast('Pedido no encontrado', 'error'); return; }
    imprimirPedidoAsync(p).catch(e => toast('Error al preparar impresión: ' + (e.message || e), 'error'));
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
                    if (pedidoActual) detalle(pedidoActual);
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
                    if (pedidoActual2) detalle(pedidoActual2);
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
        try { el.textContent = 'Versión ' + window.AndroidConfig.getAppVersion(); } catch (_) {}
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
        const reqReclamoOConexion = tipoReclamoRequiereNisYCliente(tipoTr);
        const nisVal = (document.getElementById('nis').value || '').trim();
        const clVal = (document.getElementById('cl').value || '').trim();
        if (reqReclamoOConexion && !nisVal) {
            toast('Para este tipo de reclamo el NIS / medidor es obligatorio', 'error');
            btn.disabled = false;
            return;
        }
        if (reqReclamoOConexion && !clVal) {
            toast('Para este tipo de reclamo el nombre de cliente es obligatorio', 'error');
            btn.disabled = false;
            return;
        }
        const uidCre = app.u?.id || 1;
        const telVal = (document.getElementById('ped-tel-contacto')?.value || '').trim();
        const queryInsert = `INSERT INTO pedidos(
            numero_pedido, distribuidor, setd, cliente, tipo_trabajo,
            descripcion, prioridad, lat, lng, usuario_id, usuario_creador_id, estado, avance, foto_base64,
            x_inchauspe, y_inchauspe, fecha_creacion, nis_medidor, telefono_contacto
        ) VALUES(
            ${esc(numPedido)},
            ${esc(document.getElementById('di2').value)},
            ${esc(document.getElementById('sd').value || null)},
            ${esc(document.getElementById('cl').value || null)},
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
            ${esc(telVal || null)}
        )`;

        if (modoOffline || !NEON_OK) {
            
            enqueueOffline({ tipo: 'INSERT', query: queryInsert });
            
            const pedidoLocal = {
                id: 'off_' + Date.now(),
                np: numPedido,
                f: new Date().toISOString(),
                fc: null, fa: null,
                dis: document.getElementById('di2').value,
                sd: document.getElementById('sd').value || '',
                cl: document.getElementById('cl').value || '',
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
                _offline: true
            };
            app.p.unshift(pedidoLocal);
            offlinePedidosSave(app.p);
            toast('📴 Pedido guardado localmente — se sincronizará al conectarse', 'success');
        } else {
            
            await ejecutarSQLConReintentos(queryInsert);
            toast('Pedido guardado', 'success');
        }

        fotosTemporales = [];
        actualizarVistaPreviaFotos();
        closeAll();
        app.sel = null;
        render();
        if (!modoOffline) cargarPedidos();
    } catch(e) {
        console.error(e);
        
        if (e.message && (e.message.includes('fetch') || e.message.includes('network') || e.message.includes('Failed'))) {
            setModoOffline(true);
            toast('Sin conexión — reintentá guardar en modo offline', 'error');
        } else {
            toast('Error: ' + (e.message || 'Error al guardar'), 'error');
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
    } catch(e) {
        console.error('Error actualizando avance:', e);
        toast('Error al actualizar avance', 'error');
    }
}

async function updPedido(id, campos, usuarioId) {
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
            usuario_inicio_id: 'ui2',
            usuario_cierre_id: 'uci',
            usuario_avance_id: 'uav'
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
            closeAll();
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
        closeAll();
    } catch(e) {
        toast('Error: ' + e.message, 'error');
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

async function refrescarMaterialesEnDetalle(p) {
    const body = document.getElementById('materiales-detalle-body');
    if (!body) return;
    const pid = parseInt(p.id, 10);
    if (String(p.id).startsWith('off_') || modoOffline || !NEON_OK) {
        body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Materiales: requiere conexión a Neon.</p>';
        return;
    }
    const puedeEditarMat = p.es !== 'Cerrado' && (esTecnicoOSupervisor() || esAdmin())
        && (String(p.tai) === String(app.u?.id) || esAdmin());
    try {
        const r = await sqlSimple(`SELECT id, descripcion, cantidad, unidad FROM pedido_materiales WHERE pedido_id=${esc(pid)} ORDER BY id`);
        const rows = r.rows || [];
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
            if (puedeEditarMat && esAdmin()) {
                html += `<button type="button" class="btn-sm" onclick="eliminarMaterialPedido(${row.id},${pid})" style="font-size:.7rem;padding:.15rem .4rem">Borrar</button>`;
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
        if (!rows.length && !puedeAgregar) {
            body.innerHTML = '<p style="font-size:.8rem;color:var(--tl)">Sin materiales registrados</p>';
        } else {
            body.innerHTML = html;
        }
    } catch (e) {
        body.innerHTML = '<p style="color:var(--re);font-size:.8rem">' + (e.message || e) + '</p>';
    }
}

window.actualizarCampoMaterial = async function (mid, pid, campo, valor) {
    if (modoOffline || !NEON_OK) return;
    try {
        if (campo === 'unidad') {
            await sqlSimple(`UPDATE pedido_materiales SET unidad = ${esc(valor || null)} WHERE id = ${esc(parseInt(mid, 10))}`);
        } else if (campo === 'cantidad') {
            const c = valor === '' || valor == null ? null : parseFloat(valor);
            if (valor !== '' && Number.isNaN(c)) { toast('Cantidad inválida', 'error'); return; }
            await sqlSimple(`UPDATE pedido_materiales SET cantidad = ${esc(c)} WHERE id = ${esc(parseInt(mid, 10))}`);
        }
        const p = app.p.find(x => parseInt(x.id, 10) === pid || String(x.id) === String(pid));
        if (p) await refrescarMaterialesEnDetalle(p);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
};

window.agregarMaterialPedidoDesdeDetalle = async function (pid) {
    const d = document.getElementById('mat-desc-' + pid)?.value.trim();
    if (!d) { toast('Indicá descripción del material', 'error'); return; }
    const cantRaw = document.getElementById('mat-cant-' + pid)?.value;
    const un = document.getElementById('mat-un-' + pid)?.value?.trim() || '';
    const cant = cantRaw === '' || cantRaw == null ? null : parseFloat(cantRaw);
    try {
        await sqlSimple(`INSERT INTO pedido_materiales(pedido_id, descripcion, cantidad, unidad) VALUES (${esc(pid)}, ${esc(d)}, ${esc(cant)}, ${esc(un || null)})`);
        toast('Material registrado', 'success');
        const p = app.p.find(x => parseInt(x.id, 10) === pid || String(x.id) === String(pid));
        if (p) refrescarMaterialesEnDetalle(p);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
};

window.eliminarMaterialPedido = async function (mid, pid) {
    if (!confirm('¿Eliminar material?')) return;
    try {
        await sqlSimple(`DELETE FROM pedido_materiales WHERE id=${esc(parseInt(mid, 10))}`);
        const p = app.p.find(x => parseInt(x.id, 10) === pid || String(x.id) === String(pid));
        if (p) refrescarMaterialesEnDetalle(p);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
};

function pedidoTieneClienteCargado(p) {
    return !!(p && String(p.cl || '').trim());
}

function abrirCierre(id) {
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
        await updPedido(app.cid, camposCierre, app.u?.id);
        if (puedeEnviarApiRestPedidos() && !String(app.cid).startsWith('off_')) {
            const pidNum = parseInt(app.cid, 10);
            if (Number.isFinite(pidNum) && pidNum > 0) {
                void notificarCierreWhatsappApi(pidNum, telCierre || undefined);
            }
        }
        fotoCierreTemp = null;
        closeAll();
        toast('Pedido cerrado', 'success');
    } catch(e) {
        toast('Error: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirmar cierre';
    }
});


function detalle(p) {
    const tz = { timeZone: 'America/Argentina/Buenos_Aires' };
    const f = p.f ? new Date(p.f).toLocaleString('es-AR', {...tz, hour12:false}) : '--';
    const fc = p.fc ? new Date(p.fc).toLocaleString('es-AR', {...tz, hour12:false}) : null;
    const fa = p.fa ? new Date(p.fa).toLocaleString('es-AR', {...tz, hour12:false}) : null;
    
    const bg = {
        'Pendiente': '#fef9c3',
        'Asignado': '#fae8ff',
        'En ejecución': '#dbeafe',
        'Cerrado': '#dcfce7'
    };
    
    const co = {
        'Pendiente': '#854d0e',
        'Asignado': '#86198f',
        'En ejecución': '#1d4ed8',
        'Cerrado': '#166534'
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
    const nisEsc = String(p.nis || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '—';
    const uAsig = (app.usuariosCache || []).find(u => String(u.id) === String(p.tai));
    const rolAsig = uAsig ? normalizarRolStr(uAsig.rol) : '';
    const nAsig = (p.tai != null)
        ? `${findUser(p.tai) || ('id ' + p.tai)}${rolAsig ? ' · ' + rolAsig : ''}`
        : 'Sin asignar';
    const fasiStr = p.fasi ? new Date(p.fasi).toLocaleString('es-AR', {...tz, hour12:false}) : '';
    const labClienteDet = etiquetaCampoClientePedido();
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
    
    
    const latFormateada = p.la ? p.la.toFixed(6).replace('.', ',') : '';
    const lngFormateada = p.ln ? p.ln.toFixed(6).replace('.', ',') : '';
    const wgs84UnaLinea = (p.la != null && p.ln != null) ? `${latFormateada}, ${lngFormateada}` : '--';
    const pcDet = proyectarCoordPedido(p.la, p.ln);
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
    
    document.getElementById('dmc').innerHTML = `
        <div class="ds">
            <h4>📋 Información General</h4>
            <div class="dr"><span class="dl">N° Pedido</span><span class="dv" style="font-weight:700;color:#1e3a8a">#${p.np}</span></div>
            <div class="dr"><span class="dl">Fecha Creación</span><span class="dv">${f}</span></div>
            ${p.es === 'Cerrado' ? 
                `<div class="dr"><span class="dl">Fecha Cierre</span><span class="dv">${fc}</span></div>` : 
                p.es === 'En ejecución' && fa ? 
                `<div class="dr"><span class="dl">Último Avance</span><span class="dv">${fa}</span></div>` : ''}
            <div class="dr"><span class="dl">Estado</span><span class="dv"><span style="background:${bg[p.es]||'#e5e7eb'};color:${co[p.es]||'#374151'};padding:2px 10px;border-radius:12px;font-size:.82rem;font-weight:600">${p.es}</span></span></div>
            <div class="dr"><span class="dl">Prioridad</span><span class="dv">${p.pr}</span></div>
            <div class="dr"><span class="dl">Tipo</span><span class="dv">${p.tt||'--'}</span></div>
            <div class="dr"><span class="dl">NIS / Medidor</span><span class="dv" style="font-weight:700">${nisEsc}</span></div>
            <div class="dr"><span class="dl">Técnico asignado</span><span class="dv">${nAsig}${fasiStr ? ' · ' + fasiStr : ''}</span></div>
            <div class="dr"><span class="dl">Avance</span><span class="dv">${p.av}% <div style="height:4px;background:#e2e8f0;border-radius:2px;width:100px;display:inline-block;vertical-align:middle;margin-left:6px;overflow:hidden"><div style="height:100%;width:${p.av}%;background:linear-gradient(90deg,#1e3a8a,#3b82f6)"></div></div></span></div>
        </div>
        
        <div class="ds">
            <h4>🏢 Datos del Trabajo</h4>
            <div class="dr"><span class="dl">Distribuidor</span><span class="dv">${p.dis}</span></div>
            ${p.sd ? `<div class="dr"><span class="dl">SETD</span><span class="dv">${p.sd}</span></div>` : ''}
            ${p.cl ? `<div class="dr"><span class="dl">${labClienteDet}</span><span class="dv">${p.cl}</span></div>` : ''}
            ${p.tel ? `<div class="dr"><span class="dl">Tel. contacto (WA)</span><span class="dv">${String(p.tel).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>` : ''}
            <div class="dr"><span class="dl">Descripción</span><span class="dv">${p.de}</span></div>
        </div>
        
        ${p.es === 'Cerrado' ? `
        <div class="ds">
            <h4>✅ Cierre del Pedido</h4>
            ${fc ? `<div class="dr"><span class="dl">Fecha cierre</span><span class="dv">${fc}</span></div>` : ''}
            ${p.tc ? `<div class="dr"><span class="dl">Técnico</span><span class="dv">${p.tc}</span></div>` : ''}
            ${p.tr ? `<div class="dr" style="flex-direction:column;gap:.3rem"><span class="dl">Trabajo</span><div class="trb">${p.tr}</div></div>` : ''}
            ${p.foto_cierre ? `<div style="margin-top:.6rem"><div style="font-size:.8rem;color:#475569;margin-bottom:.35rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em">📸 Foto del cierre</div><img src="${p.foto_cierre}" class="foto-miniatura" style="width:100%;max-height:200px;object-fit:contain;border-radius:.5rem;cursor:pointer;border:1px solid #e2e8f0" onclick="verFotoAmpliada(this.src, {tipo:'pedido_cierre',id:'${p.id}'})"></div>` : ''}
            ${chkResumen}
            ${p.firma ? `<div style="margin-top:.6rem"><div style="font-size:.8rem;color:#475569;margin-bottom:.35rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em">✍️ Firma del ${labFirmaDet}</div><img src="${p.firma}" class="foto-miniatura" style="width:100%;max-height:180px;object-fit:contain;border-radius:.5rem;border:1px solid #e2e8f0" alt="Firma"></div>` : ''}
            ${p.opin ? `<div class="dr" style="flex-direction:column;gap:.3rem;margin-top:.5rem"><span class="dl">Opinión del cliente (WhatsApp)</span><div class="trb">${String(p.opin).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>` : ''}
        </div>` : ''}

        <div class="ds" id="materiales-detalle-wrap" data-pid="${p.id}">
            <h4>🔧 Materiales</h4>
            <div id="materiales-detalle-body"><p style="font-size:.8rem;color:var(--tl)">Cargando…</p></div>
        </div>
        
        <div class="ds">
            <h4>📍 Ubicación</h4>
            <div class="dr"><span class="dl">WGS84</span><span class="dv">${wgs84UnaLinea}${p.la != null && p.ln != null ? ` <span class="dv-copy" onclick="copiarTexto('${latFormateada}')"><i class="fas fa-copy"></i> lat</span> <span class="dv-copy" onclick="copiarTexto('${lngFormateada}')"><i class="fas fa-copy"></i> lng</span>` : ''}</span></div>
            ${filasProyectadas}
            <button class="ba2" style="margin-top:.5rem" onclick="_zm('${p.id}')"><i class="fas fa-search-location"></i> Ver en mapa (zoom máximo)</button>
        </div>
        
        ${_auditLineas ? `<div class="ds"><h4>👤 Auditoría</h4>${_auditLineas}</div>` : ''}
        ${fotosHtml ? `
        <div class="ds">
            <h4>📸 Fotos del trabajo</h4>
            ${fotosHtml}
        </div>` : ''}
        
        <div class="da">
            ${esAdmin() && p.es !== 'Cerrado' && (p.tai == null) ? `<button type="button" class="ba2" style="background:#059669;color:#fff;border-color:#059669" onclick="abrirModalAsignarTecnico('${p.id}')"><i class="fas fa-user-hard-hat"></i> Asignar técnico</button>` : ''}
            ${esAdmin() && p.es !== 'Cerrado' && (p.tai != null) ? `<button type="button" class="ba2" style="background:#ea580c;color:#fff;border-color:#ea580c" onclick="abrirModalAsignarTecnico('${p.id}')"><i class="fas fa-exchange-alt"></i> Reasignar técnico</button><button type="button" class="ba2" style="background:#64748b;color:#fff;border-color:#64748b" onclick="ejecutarDesasignarPedidoPorId('${p.id}', {confirmar:true})"><i class="fas fa-user-slash"></i> Desasignar</button>` : ''}
            ${ed && (p.es === 'Pendiente' || p.es === 'Asignado') ? `<button class="ba2 p2" onclick="_a('i','${p.id}')"><i class="fas fa-play"></i> Iniciar en sitio</button><button class="ba2 s2" onclick="_a('c','${p.id}')"><i class="fas fa-check"></i> Cerrar Pedido</button>` : ''}
            ${ed && p.es === 'En ejecución' ? `<button class="ba2 s2" onclick="_a('c','${p.id}')"><i class="fas fa-check"></i> Cerrar Pedido</button><button class="ba2 p2" onclick="_a('av','${p.id}')"><i class="fas fa-percent"></i> Cargar Avance (${p.av}%)</button>` : ''}
            <button class="ba2 imprimir" onclick="imprimirPedidoPorId('${p.id}')"><i class="fas fa-print"></i> Imprimir</button>
            <button class="ba2" onclick="_xl('${p.id}')"><i class="fas fa-file-excel"></i> Exportar</button>
        </div>
    `;
    
    document.getElementById('dm').classList.add('active');
    requestAnimationFrame(() => { refrescarMaterialesEnDetalle(p); });
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
            'Distribuidor': p.dis || '',
            'Cliente': p.cl || '',
            'SETD': p.sd || '',
            'Tipo de Trabajo': p.tt || '',
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
                { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
                { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
                { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
                { wch: 10 }, { wch: 10 }
            ];
            ws['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
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
    if (p) exportPedido([p], 'pedido_' + p.np);
};


function tabPedidoListaPorEstado(es) {
    if (es === 'Cerrado') return 'c';
    if (es === 'Asignado' || es === 'En ejecución') return 'a';
    return 'p';
}

function render() {
    const vis = pedidosVisiblesEnUI();
    const cer = vis.filter(p => p.es === 'Cerrado').length;
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
        return p.es === 'Cerrado';
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
        'Cerrado': 'ec'
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
        d.addEventListener('click', () => detalle(p));
        
        const f = p.f ? new Date(p.f).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, ...tz }) : '';
        
        d.innerHTML = `
            <div class="ph2">
                <span class="pn">#${p.np}${p._offline ? '<span class="offline-tag">LOCAL</span>' : ''}</span>
                <span class="pe ${eC[p.es] || ''}">${p.es}</span>
            </div>
            <div class="pi2">
                ${p.dis}${p.cl ? ' - ' + p.cl : ''}${p.nis ? ' · NIS ' + String(p.nis).substring(0, 14) + (String(p.nis).length > 14 ? '…' : '') : ''}
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
    document.querySelectorAll('.mo').forEach(m => m.classList.remove('active'));
    document.getElementById('pf').reset();
    limpiarFotosYPreviewNuevoPedido();
    const nisEl = document.getElementById('nis');
    if (nisEl) nisEl.value = '';
    document.getElementById('dc').textContent = '0';
    try { syncNisClienteReclamoConexionUI(); } catch (_) {}
    try { syncPrioridadConTipoReclamo(); } catch (_) {}
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
 * Menú esquina superior izquierda: administrador abre el wizard de marca/logo/ubicación;
 * otros roles siguen usando el mismo botón para el panel de pedidos.
 */
async function abrirWizardMarcaEmpresaManual() {
    if (!esAdmin()) {
        togglePanel();
        return;
    }
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
window.abrirWizardMarcaEmpresaManual = abrirWizardMarcaEmpresaManual;

function switchTab(t) {
    app.tab = t;
    document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    render();
}


document.getElementById('mt').addEventListener('click', () => {
    abrirWizardMarcaEmpresaManual().catch((e) => {
        console.warn('[wizard-marca-manual]', e?.message || e);
        try {
            mostrarModalConfigInicial();
        } catch (_) {}
    });
});
document.getElementById('ph').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (window.__bp2DragJustEnded) return;
    togglePanel();
});

document.getElementById('ub').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) {
        invalidatePedidosTenantSqlCache();
        detenerKeepAlive(); 
        detenerTracking();
        detenerDashboardGerenciaPoll();
        detenerPollWhatsappHumanChat();
        destruirTodasVentanasWaHc();
        detenerTecnicosMapaPrincipalPoll();
        _dashCierresInit = false;
        _seenClosedIds.clear();
        try {
            if (window.AndroidSession && typeof AndroidSession.clearUser === 'function') AndroidSession.clearUser();
        } catch (_) {}
        detenerSyncCatalogos();
        limpiarEstadoMapaSesion();
        try { sessionStorage.removeItem(SESSION_WEB_ADMIN_TIPO_OK); } catch (_) {}
        localStorage.removeItem('pmg');
        localStorage.removeItem('pmg_api_token');
        app.apiToken = null;
        app.u = null;
        hydrateBrandingForPublicScreen();
        try { aplicarMarcaVisualCompleta(); } catch (_) {}
        mapaInicializado = false;
        _mapLazyQueued = false;
        if (app.map) {
            app.map.remove();
            app.map = null;
        }
        _marcadoresTecnicosPrincipal = [];
        const btnAdm = document.getElementById('btn-admin');
        if (btnAdm) btnAdm.style.display = 'none';
        const btnDg = document.getElementById('btn-dashboard-gerencia');
        if (btnDg) btnDg.style.display = 'none';
        const mapDashCard = document.getElementById('mapa-card-dashboard');
        if (mapDashCard) mapDashCard.style.display = 'none';
        const wvt = document.getElementById('wrap-toggle-ver-todos');
        if (wvt) wvt.style.display = 'none';
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) adminPanel.classList.remove('active');
        document.getElementById('ls').classList.add('active');
        document.getElementById('ms').classList.remove('active');
    }
});

function logout() {
    document.getElementById('ub')?.click();
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

document.getElementById('eb').addEventListener('click', () => {
    const flt = p => {
        if (app.tab === 'p') return p.es === 'Pendiente';
        if (app.tab === 'a') return p.es === 'Asignado' || p.es === 'En ejecución';
        return p.es === 'Cerrado';
    };
    exportPedido(
        app.p.filter(flt),
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
    if (v.includes('Cambio de Medidor')) return true;
    if (v.toLowerCase().includes('factibilidad')) return true;
    return false;
}
function syncNisClienteReclamoConexionUI() {
    const req = tipoTrabajoRequiereNisYCliente();
    const esMunicipio = String(window.EMPRESA_CFG?.tipo || '').toLowerCase() === 'municipio';
    const persona = esMunicipio ? 'vecino' : 'socio';
    const lbN = document.getElementById('lbl-nis');
    const inpN = document.getElementById('nis');
    if (lbN) lbN.textContent = req ? 'NIS / Medidor *' : 'NIS / Medidor';
    if (inpN) {
        if (req) {
            inpN.setAttribute('required', 'required');
            inpN.placeholder = `Obligatorio — NIS o medidor del ${persona}`;
        } else {
            inpN.removeAttribute('required');
            inpN.placeholder = 'Opcional (obligatorio en conexión / medidor / factibilidad según tipo)';
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
if (st) st.addEventListener('change', syncNisClienteReclamoConexionUI);
syncNisClienteReclamoConexionUI();

// ── TRACKING DE UBICACIÓN (cada 15 min) — debe declararse antes del restore de sesión ──
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
    // Enviar inmediatamente y luego cada 15 min
    enviarUbicacion();
    _trackingInterval = setInterval(enviarUbicacion, 15 * 60 * 1000);
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
        const btnDash2 = document.getElementById('btn-dashboard-gerencia');
        if (btnDash2) btnDash2.style.display = esAdmin() ? 'flex' : 'none';
        const mapDashCard2 = document.getElementById('mapa-card-dashboard');
        if (mapDashCard2) mapDashCard2.style.display = esAdmin() ? 'block' : 'none';
        const wrapTog2 = document.getElementById('wrap-toggle-ver-todos');
        const chkTod2 = document.getElementById('toggle-ver-todos-pedidos');
        if (wrapTog2 && chkTod2) {
            wrapTog2.style.display = esTecnicoOSupervisor() ? 'inline-flex' : 'none';
            chkTod2.checked = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
        }
        try {
            if (window.AndroidSession && typeof AndroidSession.setUser === 'function') {
                AndroidSession.setUser(parseInt(app.u.id, 10) || 0, String(app.u.rol || ''));
            }
        } catch (_) {}
        if (esAdmin()) {
            iniciarDashboardGerenciaPoll();
            iniciarPollWhatsappHumanChat();
        } else {
            detenerDashboardGerenciaPoll();
            detenerPollWhatsappHumanChat();
            destruirTodasVentanasWaHc();
            detenerTecnicosMapaPrincipalPoll();
        }
        document.getElementById('ls').classList.remove('active');
        document.getElementById('ms').classList.add('active');
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
                await promptAdminTipoNegocioWebIfNeeded();
                await cargarConfigEmpresa();
            }
            await cargarPedidos();
            
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
        const r = await sqlSimple('SELECT codigo, nombre, tension FROM distribuidores WHERE activo = TRUE ORDER BY codigo');
        DIST = (r.rows || []).map(d => ({ v: d.codigo, l: d.codigo + ' - ' + d.nombre, g: d.tension || '' }));
        // Repoblar el select de distribuidores
        const sd = document.getElementById('di2');
        if (sd) {
            sd.innerHTML = '<option value="">Seleccionar distribuidor...</option>';
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
    } catch(e) {
        console.warn('Config empresa no cargada:', e.message);
        syncWrapCoordsDisplayNuevoPedido();
        refrescarLineaUbicacionModalNuevoPedido();
        try { aplicarMarcaVisualCompleta(); } catch (_) {}
        poblarSelectTiposReclamo();
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

let _pedidosTenantSqlCache = null;
function invalidatePedidosTenantSqlCache() {
    _pedidosTenantSqlCache = null;
}

/** Si existe pedidos.tenant_id, filtra por el tenant del usuario (multicliente). */
async function pedidosFiltroTenantSql() {
    if (_pedidosTenantSqlCache !== null) return _pedidosTenantSqlCache;
    try {
        const chk = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'tenant_id' LIMIT 1`
        );
        if (chk.rows?.length) {
            const tid = tenantIdActual();
            _pedidosTenantSqlCache = ` AND tenant_id = ${esc(tid)}`;
        } else {
            _pedidosTenantSqlCache = '';
        }
    } catch (_) {
        _pedidosTenantSqlCache = '';
    }
    return _pedidosTenantSqlCache;
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
    return (app.p || []).filter(pedidoVisibleSegunRubro);
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
    if (configInicialIncompleta(cfg)) return true;
    if (esAdmin() && !setupWizardCompletadoEnApi(extra)) return true;
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
        setTimeout(usarUbicacionAutomaticaSetupWizard, 80);
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
            3: 'Paso 3: ubicación base: arrastrá el pin o tocá el mapa. «Finalizar» guarda y marca el setup completado en el servidor.'
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
    });
    const h3cat = document.querySelector('#admin-socios > div:first-of-type h3');
    if (h3cat) {
        h3cat.textContent = esMunicipio
            ? 'Catálogo de vecinos (NIS / medidor)'
            : 'Catálogo de socios (NIS / medidor)';
    }
    const firma = document.getElementById('lbl-firma-cierre');
    if (firma) {
        firma.innerHTML = `<i class="fas fa-signature"></i> Firma del cliente / ${esMunicipio ? 'vecino' : 'socio'}`;
    }
    try { syncNisClienteReclamoConexionUI(); } catch (_) {}
}
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
            cfg = {
                ...(cli.nombre ? { nombre: cli.nombre } : {}),
                ...(extraParsed.logo_url ? { logo_url: extraParsed.logo_url } : {}),
                ...(extraParsed.lat_base != null ? { lat_base: String(extraParsed.lat_base) } : {}),
                ...(extraParsed.lng_base != null ? { lng_base: String(extraParsed.lng_base) } : {})
            };
            if (cli && Object.prototype.hasOwnProperty.call(cli, 'tipo')) {
                cfg.tipo = String(cli.tipo ?? '').trim();
            }
            const nombreTrim = String(cli.nombre || '').trim();
            window.__PMG_TENANT_BRANDING__ = {
                setup_wizard_completado: !!extraParsed.setup_wizard_completado,
                marca_publicada_admin: !!extraParsed.marca_publicada_admin || nombreTrim.length > 0,
                nombre_cliente: nombreTrim,
                logo_url: String(extraParsed.logo_url || '').trim(),
                tipo: String(cli.tipo ?? '').trim(),
                from_local_cache: false
            };
        }
    } catch (_) {}
    if (!apiOk) {
        console.warn('[setup] /api/clientes/mi-configuracion no disponible; no se bloquea con el wizard');
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
                configuracion: { setup_wizard_completado: true, marca_publicada_admin: true }
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
            logo_url: logoUrl,
            lat_base: String(_setupLat),
            lng_base: String(_setupLng)
        };
        try {
            persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
        } catch (_) {}
        poblarSelectTiposReclamo();
        await cargarConfigEmpresa();
        const ok = await verificarConfiguracionInicialObligatoria();
        if (ok) {
            await promptAdminTipoNegocioWebIfNeeded();
            toast('Setup inicial completado', 'success');
            // El login ya había salido antes de completar el wizard (cfgLista === false),
            // así que nunca se llegó a cargarPedidos() en entrarConUsuario.
            if (!modoOffline && NEON_OK && app.u && typeof cargarPedidos === 'function') {
                try { await cargarPedidos(); } catch (_) {}
            }
        }
    } catch (e) {
        const m = String(e?.message || '');
        if (m.includes('Failed to fetch') || m.includes('CORS') || m.includes('503')) {
            toast('Error de conexión con API (CORS/Render). Revisá API_BASE_URL y CORS en backend.', 'error');
        } else {
            toast('Error: ' + m, 'error');
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

    // Crear notificación flotante
    const alerta = document.createElement('div');
    alerta.style.cssText = `
        position:fixed;top:1rem;left:50%;transform:translateX(-50%);
        background:${pedido.pr === 'Crítica' ? '#dc2626' : '#f97316'};
        color:white;padding:1rem 1.5rem;border-radius:.75rem;
        z-index:9999;max-width:90vw;box-shadow:0 8px 25px rgba(0,0,0,.3);
        animation:alertaIn .3s ease;font-weight:600;display:flex;gap:.75rem;align-items:center
    `;
    alerta.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="font-size:1.4rem"></i>
        <div>
            <div style="font-size:1rem">⚠️ Pedido ${pedido.pr.toUpperCase()}</div>
            <div style="font-size:.85rem;opacity:.9">#${pedido.np} — ${pedido.tt || 'Sin tipo'}</div>
            <div style="font-size:.8rem;opacity:.8">${pedido.de?.substring(0,60)}...</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,.2);border:none;color:white;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:1rem">✕</button>
    `;
    document.body.appendChild(alerta);
    setTimeout(() => { if (alerta.parentElement) alerta.remove(); }, 8000);
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
const _ADMIN_TAB_ORDER = ['empresa','usuarios','distribuidores','socios','estadisticas','mapa-usuarios','contrasena'];
function adminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const tabs = document.querySelectorAll('#admin-panel .admin-tab');
    const idx = _ADMIN_TAB_ORDER.indexOf(tab);
    if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');
    const sec = document.getElementById('admin-' + tab);
    if (sec) sec.classList.add('active');
    if (tab === 'estadisticas') cargarEstadisticas();
    if (tab === 'usuarios') cargarListaUsuarios();
    if (tab === 'distribuidores') cargarListaDistribuidoresAdmin();
    if (tab === 'socios') cargarListaSociosAdmin();
    if (tab === 'empresa') cargarFormEmpresa();
    if (tab === 'mapa-usuarios') { cargarUbicacionesUsuarios(); iniciarMapaUsuariosAdmin(); }
}

function abrirAdmin() {
    document.getElementById('admin-panel').classList.add('active');
    adminTab('empresa');
    cargarFormEmpresa();
}
window.abrirAdmin = abrirAdmin;

// ── Empresa config ────────────────────────────────────────────
async function cargarFormEmpresa() {
    try {
        const r = await sqlSimple("SELECT clave, valor FROM empresa_config");
        const cfg = {};
        (r.rows || []).forEach(row => { cfg[row.clave] = row.valor; });
        document.getElementById('cfg-nombre').value    = cfg.nombre || '';
        document.getElementById('cfg-tipo').value      = cfg.tipo || '';
        document.getElementById('cfg-subtitulo').value = cfg.subtitulo || '';
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
    } catch(e) { console.warn(e); }
}

async function guardarConfigEmpresa() {
    const famEl = document.getElementById('cfg-coord-familia');
    const modoEl = document.getElementById('cfg-coord-modo');
    const famVal = famEl ? famEl.value : 'none';
    const modoVal = modoEl ? modoEl.value : 'punto';
    const campos = {
        nombre:         document.getElementById('cfg-nombre').value.trim(),
        tipo:           document.getElementById('cfg-tipo').value.trim(),
        subtitulo:      document.getElementById('cfg-subtitulo').value.trim(),
        email_contacto: document.getElementById('cfg-email').value.trim(),
        telefono:       document.getElementById('cfg-telefono').value.trim(),
        coord_proy_familia: famVal,
        coord_proy_modo: famVal === 'none' ? 'punto' : modoVal
    };
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
                            marca_publicada_admin: true
                        }
                    };
                    if (campos.nombre) body.nombre = campos.nombre;
                    if (campos.tipo) body.tipo = campos.tipo;
                    const resp = await fetch(apiUrl('/api/clientes/mi-configuracion'), {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify(body)
                    });
                    if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        throw new Error(err.detail ? `${err.error || 'Error'}: ${err.detail}` : err.error || `HTTP ${resp.status}`);
                    }
                } else {
                    marcaApiOk = false;
                }
            } catch (e) {
                marcaApiOk = false;
                console.warn('[empresa] PUT mi-configuracion:', e?.message || e);
            }
        }
        window.EMPRESA_CFG = {
            ...(window.EMPRESA_CFG || {}),
            nombre: campos.nombre,
            tipo: campos.tipo,
            subtitulo: campos.subtitulo
        };
        window.__PMG_TENANT_BRANDING__ = {
            ...(window.__PMG_TENANT_BRANDING__ || {}),
            nombre_cliente: campos.nombre,
            tipo: campos.tipo,
            marca_publicada_admin: true,
            from_local_cache: !marcaApiOk
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
        toast(
            marcaApiOk ? 'Configuración guardada' : 'Configuración guardada en base local; no se pudo publicar marca en el servidor (revisá API o token)',
            marcaApiOk ? 'success' : 'warning'
        );
    } catch(e) { toast('Error: ' + e.message, 'error'); }
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
                <td style="display:flex;gap:.3rem">
                    <button class="btn-sm" onclick="editarTelefonoWhatsappUsuario(${u.id}, ${escJs(u.telefono || '')}, ${u.whatsapp_notificaciones ? 'true' : 'false'})" style="background:#ecfeff;border:1px solid #a5f3fc;color:#0f766e">WhatsApp</button>
                    <button class="btn-sm warning" onclick="toggleUsuario(${u.id}, ${!u.activo})">${u.activo ? 'Desactivar' : 'Activar'}</button>
                    ${u.email !== 'admin' ? `<button class="btn-sm danger" onclick="eliminarUsuario(${u.id})">Eliminar</button>` : ''}
                </td>
            </tr>`).join('')}</tbody>
        </table>`;
    } catch(e) { cont.innerHTML = '<p style="color:var(--re)">' + e.message + '</p>'; }
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
        await sqlSimple(`INSERT INTO usuarios(email, nombre, password_hash, rol, telefono, whatsapp_notificaciones)
            VALUES(${esc(email)}, ${esc(nombre)}, ${esc(pw)}, ${esc(rol)}, ${esc(telefono || null)}, TRUE)`);
        toast('Usuario creado: ' + nombre, 'success');
        document.getElementById('form-usuario').style.display = 'none';
        ['nu-email','nu-nombre','nu-pw','nu-telefono'].forEach(id => document.getElementById(id).value = '');
        cargarListaUsuarios();
    } catch(e) {
        toast('Error: ' + (e.message.includes('unique') ? 'Email ya existe' : e.message), 'error');
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
            const ru = await sqlSimple('SELECT id, nombre, email, rol, telefono, COALESCE(whatsapp_notificaciones, true) AS whatsapp_notificaciones FROM usuarios WHERE activo = TRUE ORDER BY nombre');
            app.usuariosCache = ru.rows || [];
        } catch (_) {}
    } catch (e) {
        toast('Error al actualizar WhatsApp: ' + e.message, 'error');
    }
}

async function toggleUsuario(id, activar) {
    try {
        await sqlSimple(`UPDATE usuarios SET activo = ${activar} WHERE id = ${esc(id)}`);
        toast(activar ? 'Usuario activado' : 'Usuario desactivado', 'success');
        cargarListaUsuarios();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
}

async function eliminarUsuario(id) {
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
    try {
        await sqlSimple(`DELETE FROM usuarios WHERE id = ${esc(id)}`);
        toast('Usuario eliminado', 'success');
        cargarListaUsuarios();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
}

// ── Distribuidores admin ──────────────────────────────────────
async function cargarListaDistribuidoresAdmin() {
    const cont = document.getElementById('lista-distribuidores-admin');
    cont.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const r = await sqlSimple('SELECT id, codigo, nombre, tension, activo FROM distribuidores ORDER BY codigo');
        if (!r.rows.length) {
            cont.innerHTML = '<p style="color:var(--tl);font-size:.85rem;padding:.5rem">Sin distribuidores. Cargalos manualmente o importá un Excel.</p>';
            return;
        }
        cont.innerHTML = `<table class="admin-table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Tensión</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${r.rows.map(d => `<tr>
                <td><b>${d.codigo}</b></td>
                <td>${d.nombre}</td>
                <td>${d.tension || '-'}</td>
                <td><span style="color:${d.activo ? '#166534' : '#dc2626'};font-weight:600">${d.activo ? '✓' : '✗'}</span></td>
                <td style="display:flex;gap:.3rem">
                    <button class="btn-sm warning" onclick="toggleDistribuidor(${d.id}, ${!d.activo})">${d.activo ? 'Desactivar' : 'Activar'}</button>
                    <button class="btn-sm danger" onclick="eliminarDistribuidor(${d.id})">Eliminar</button>
                </td>
            </tr>`).join('')}</tbody>
        </table>`;
    } catch(e) { cont.innerHTML = '<p style="color:var(--re)">' + e.message + '</p>'; }
}

function abrirFormDistribuidor() {
    document.getElementById('form-distribuidor').style.display = 'block';
    document.getElementById('nd-codigo').focus();
}

async function crearDistribuidor() {
    const codigo  = document.getElementById('nd-codigo').value.trim().toUpperCase();
    const nombre  = document.getElementById('nd-nombre').value.trim();
    const tension = document.getElementById('nd-tension').value.trim();
    if (!codigo || !nombre) { toast('Código y nombre son obligatorios', 'error'); return; }
    try {
        await sqlSimple(`INSERT INTO distribuidores(codigo, nombre, tension) VALUES(${esc(codigo)}, ${esc(nombre)}, ${esc(tension || null)})`);
        toast('Distribuidor creado', 'success');
        document.getElementById('form-distribuidor').style.display = 'none';
        ['nd-codigo','nd-nombre','nd-tension'].forEach(id => document.getElementById(id).value = '');
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
    } catch(e) {
        toast('Error: ' + (e.message.includes('unique') ? 'Código ya existe' : e.message), 'error');
    }
}

async function toggleDistribuidor(id, activar) {
    try {
        await sqlSimple(`UPDATE distribuidores SET activo = ${activar} WHERE id = ${esc(id)}`);
        toast(activar ? 'Activado' : 'Desactivado', 'success');
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
}

async function eliminarDistribuidor(id) {
    if (!confirm('¿Eliminar este distribuidor?')) return;
    try {
        await sqlSimple(`DELETE FROM distribuidores WHERE id = ${esc(id)}`);
        toast('Eliminado', 'success');
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
}

function mostrarFormatoExcel() {
    alert('Formato requerido para el Excel:\n\nColumna A: codigo (ej: D001)\nColumna B: nombre (ej: ZONA NORTE)\nColumna C: tension (ej: 13200 V) — OPCIONAL\n\nLa fila 1 debe tener los encabezados: codigo | nombre | tension\nA partir de la fila 2, los datos.');
}

async function importarExcelDistribuidores(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { toast('Librería Excel no cargada', 'error'); return; }
    try {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: ['codigo','nombre','tension'], range: 1 });
        if (!rows.length) { toast('Excel vacío o formato incorrecto', 'error'); return; }
        let ok = 0, fail = 0;
        for (const row of rows) {
            if (!row.codigo || !row.nombre) continue;
            try {
                await sqlSimple(`INSERT INTO distribuidores(codigo, nombre, tension)
                    VALUES(${esc(String(row.codigo).trim().toUpperCase())}, ${esc(String(row.nombre).trim())}, ${esc(row.tension ? String(row.tension).trim() : null)})
                    ON CONFLICT(codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension`);
                ok++;
            } catch(_) { fail++; }
        }
        toast(`Importados: ${ok} OK${fail ? ', ' + fail + ' errores' : ''}`, ok > 0 ? 'success' : 'error');
        cargarListaDistribuidoresAdmin();
        cargarDistribuidores();
    } catch(e) { toast('Error al leer Excel: ' + e.message, 'error'); }
    event.target.value = '';
}

async function cargarListaSociosAdmin() {
    const cont = document.getElementById('lista-socios-admin');
    if (!cont) return;
    cont.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const r = await sqlSimple('SELECT id, nis_medidor, nombre, domicilio, telefono, distribuidor_codigo, localidad, tipo_tarifa, urbano_rural, activo FROM socios_catalogo ORDER BY nis_medidor LIMIT 500');
        const rows = r.rows || [];
        if (!rows.length) {
            cont.innerHTML = '<p style="color:var(--tl);font-size:.85rem">Sin socios. Importá un Excel.</p>';
            return;
        }
        cont.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;font-size:.8rem;border-collapse:collapse"><thead><tr><th align="left">NIS</th><th>Nombre</th><th>Localidad</th><th>Tarifa</th><th>U/R</th><th>Domicilio</th><th>Tel.</th><th>Dist.</th><th>Estado</th></tr></thead><tbody>' +
            rows.map(s => `<tr><td>${String(s.nis_medidor || '').replace(/</g, '&lt;')}</td><td>${String(s.nombre || '').replace(/</g, '&lt;')}</td><td>${String(s.localidad || '').replace(/</g, '&lt;')}</td><td>${String(s.tipo_tarifa || '').replace(/</g, '&lt;')}</td><td>${String(s.urbano_rural || '').replace(/</g, '&lt;')}</td><td>${String(s.domicilio || '').replace(/</g, '&lt;')}</td><td>${String(s.telefono || '').replace(/</g, '&lt;')}</td><td>${String(s.distribuidor_codigo || '').replace(/</g, '&lt;')}</td><td>${s.activo ? 'Activo' : 'Baja'}</td></tr>`).join('') + '</tbody></table></div>';
    } catch (e) {
        cont.innerHTML = '<p style="color:var(--re);font-size:.85rem">' + e.message + '</p>';
    }
}

function normalizarEncabezadoExcelSocios(k) {
    let s = String(k || '').trim().toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    return s.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
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

async function importarExcelSocios(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { toast('Librería Excel no cargada', 'error'); return; }
    try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        if (!rawRows.length) { toast('Excel vacío o sin filas de datos', 'error'); return; }
        const primera = rawRows[0];
        const mapNormAOriginal = {};
        Object.keys(primera).forEach(orig => {
            const n = normalizarEncabezadoExcelSocios(orig);
            if (n && mapNormAOriginal[n] == null) mapNormAOriginal[n] = orig;
        });
        let ok = 0, fail = 0;
        for (const row of rawRows) {
            const nis = valorSociosPorEncabezados(row, mapNormAOriginal,
                'nis_medidor', 'nis', 'medidor', 'nro_medidor', 'numero_medidor');
            if (!nis) continue;
            const nombre = valorSociosPorEncabezados(row, mapNormAOriginal, 'nombre', 'razon_social', 'socio');
            const domicilio = valorSociosPorEncabezados(row, mapNormAOriginal, 'domicilio', 'direccion', 'calle');
            const telefono = valorSociosPorEncabezados(row, mapNormAOriginal, 'telefono', 'tel', 'celular');
            const dist = valorSociosPorEncabezados(row, mapNormAOriginal, 'distribuidor_codigo', 'distribuidor', 'codigo_distribuidor');
            const loc = valorSociosPorEncabezados(row, mapNormAOriginal, 'localidad', 'ciudad', 'municipio');
            const tar = valorSociosPorEncabezados(row, mapNormAOriginal, 'tipo_tarifa', 'tarifa', 'tipo_de_tarifa');
            const ur = valorSociosPorEncabezados(row, mapNormAOriginal, 'urbano_rural', 'zona', 'tipo_ubicacion');
            try {
                await sqlSimple(`INSERT INTO socios_catalogo(nis_medidor, nombre, domicilio, telefono, distribuidor_codigo, localidad, tipo_tarifa, urbano_rural)
                    VALUES(${esc(nis)}, ${esc(nombre)}, ${esc(domicilio)}, ${esc(telefono)}, ${esc(dist)}, ${esc(loc)}, ${esc(tar)}, ${esc(ur)})
                    ON CONFLICT (nis_medidor) DO UPDATE SET nombre = EXCLUDED.nombre, domicilio = EXCLUDED.domicilio, telefono = EXCLUDED.telefono, distribuidor_codigo = EXCLUDED.distribuidor_codigo, localidad = EXCLUDED.localidad, tipo_tarifa = EXCLUDED.tipo_tarifa, urbano_rural = EXCLUDED.urbano_rural`);
                ok++;
            } catch (_) { fail++; }
        }
        toast(`Socios: ${ok} OK` + (fail ? ', ' + fail + ' errores' : ''), ok > 0 ? 'success' : 'error');
        cargarListaSociosAdmin();
    } catch (e) { toast('Error al leer Excel: ' + e.message, 'error'); }
    event.target.value = '';
}

function mostrarFormatoExcelSocios() {
    alert('Excel socios — fila 1 = encabezados (el orden de columnas no importa).\n\nNombres reconocidos (ejemplos):\n• NIS: nis_medidor, nis, medidor…\n• nombre, domicilio/direccion, telefono, distribuidor_codigo\n• localidad, tipo_tarifa, urbano_rural (o zona)\n\nFila 2 en adelante: datos. Columna NIS obligatoria por fila.');
}

async function buscarHistorialPorNIS() {
    const raw = (document.getElementById('historial-nis-input')?.value || '').trim();
    const out = document.getElementById('historial-nis-result');
    if (!raw) { toast('Ingresá NIS o medidor', 'error'); return; }
    if (!out) return;
    out.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    try {
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(`SELECT id, numero_pedido, estado, prioridad, fecha_creacion, fecha_cierre, descripcion FROM pedidos WHERE UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM(${esc(raw)}))${tsql} ORDER BY fecha_creacion DESC LIMIT 100`);
        const rows = r.rows || [];
        if (!rows.length) { out.innerHTML = '<p style="color:var(--tm)">Sin reclamos para ese NIS.</p>'; return; }
        out.innerHTML = '<ul style="margin:0;padding-left:1rem;line-height:1.35">' + rows.map(row =>
            `<li><strong>#${String(row.numero_pedido || '').replace(/</g, '&lt;')}</strong> · ${row.estado} · ${row.prioridad}<br><span style="color:var(--tl)">${String(row.descripcion || '').substring(0, 100).replace(/</g, '&lt;')}</span> · ${fmtInformeFecha(row.fecha_creacion)}</li>`
        ).join('') + '</ul>';
    } catch (e) { out.innerHTML = '<span style="color:var(--re)">' + e.message + '</span>'; }
}

function periodoInformeDesdeSelectEstadisticas() {
    const periodo = document.getElementById('est-periodo')?.value || '3meses';
    const ahora = new Date();
    let fechaDesde;
    if (periodo === 'mes') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    else if (periodo === '3meses') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
    else if (periodo === 'anio') fechaDesde = new Date(ahora.getFullYear(), 0, 1);
    else fechaDesde = new Date('2000-01-01');
    const condFecha = `fecha_creacion >= ${esc(fechaDesde.toISOString())}`;
    return { periodo, fechaDesde, condFecha };
}

async function exportInformeMensualExcel() {
    if (!esAdmin()) { toast('Solo administrador', 'error'); return; }
    if (modoOffline || !NEON_OK) { toast('Requiere conexión', 'error'); return; }
    if (!window.XLSX || !XLSX.utils) { toast('Excel aún no cargó — esperá unos segundos y reintentá', 'error'); return; }
    const { fechaDesde, condFecha } = periodoInformeDesdeSelectEstadisticas();
    try {
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(`SELECT numero_pedido, nis_medidor, estado, prioridad, fecha_creacion, fecha_cierre, distribuidor, tipo_trabajo, descripcion FROM pedidos WHERE ${condFecha}${tsql} ORDER BY fecha_creacion DESC LIMIT 500`);
        const rows = (r.rows || []).map(row => ({
            Pedido: row.numero_pedido,
            NIS: row.nis_medidor,
            Estado: row.estado,
            Prioridad: row.prioridad,
            Creado: fmtInformeFecha(row.fecha_creacion),
            Cierre: fmtInformeFecha(row.fecha_cierre),
            Distribuidor: row.distribuidor,
            Tipo: row.tipo_trabajo,
            Descripcion: row.descripcion
        }));
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Pedido: '—', Nota: 'Sin filas en el período' }]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
        const suf = fechaDesde.toISOString().slice(0, 10);
        XLSX.writeFile(wb, `gestornova_pedidos_${suf}.xlsx`);
        toast('Excel descargado', 'success');
    } catch (e) { toast('Error: ' + (e.message || e), 'error'); }
}

function coleccionSeccionesPdfEstadisticas() {
    const root = document.getElementById('admin-estadisticas');
    if (!root) return [];
    const out = [];
    const marco = document.getElementById('enre-marco');
    if (marco) out.push(marco);
    const cards = document.getElementById('stats-cards');
    if (cards) out.push(cards);
    root.querySelectorAll('.chart-wrap').forEach(w => {
        try {
            if (window.getComputedStyle(w).display === 'none') return;
            out.push(w);
        } catch (_) {}
    });
    return out;
}

async function html2canvasCapturaElemento(el, opts = {}) {
    if (!el || typeof html2canvas !== 'function') return null;
    const delayAfterResize = typeof opts.delayAfterResize === 'number' ? opts.delayAfterResize : 200;
    try {
        Object.values(_charts).forEach(ch => { try { ch.resize(); } catch (_) {} });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, delayAfterResize));
        const sw = Math.max(el.scrollWidth, el.offsetWidth, 120);
        const sh = Math.max(el.scrollHeight, el.offsetHeight, 40);
        return await html2canvas(el, {
            scale: Math.min(1.35, 2600 / Math.max(sw, 400)),
            useCORS: true,
            logging: false,
            backgroundColor: '#f8fafc',
            width: sw,
            height: sh,
            windowWidth: sw,
            windowHeight: sh,
            scrollX: 0,
            scrollY: 0,
            onclone: (_doc, node) => {
                try {
                    node.style.overflow = 'visible';
                    node.style.height = 'auto';
                    node.style.maxHeight = 'none';
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
    const liberarUrls = () => { urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} }); };
    try {
        toast('Generando vista para imprimir…', 'info');
        for (const sec of secciones) {
            const canvas = await html2canvasCapturaElemento(sec, { delayAfterResize: 100 });
            if (!canvas) continue;
            const blob = await new Promise((res, rej) => {
                try {
                    canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/png');
                } catch (e) { rej(e); }
            });
            urls.push(URL.createObjectURL(blob));
        }
        if (!urls.length) {
            toast('No se pudo capturar el panel', 'error');
            return;
        }
        const w = window.open('', '_blank');
        if (!w) {
            liberarUrls();
            toast('Permití ventanas emergentes para imprimir', 'error');
            return;
        }
        const bloques = urls.map(u =>
            `<div class="bloque"><img src="${u}" alt="Estadísticas"/></div>`
        ).join('');
        w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe — gráficos</title><style>body{margin:0;background:#fff}.bloque{page-break-after:always;break-after:page}.bloque:last-child{page-break-after:auto;break-after:auto}img{display:block;width:100%;height:auto;max-width:100%}</style></head><body>' + bloques + '</body></html>');
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch (_) {} }, 500);
        setTimeout(liberarUrls, 120000);
    } catch (e) {
        liberarUrls();
        toast('Error: ' + (e.message || e), 'error');
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
    try {
        toast('Generando PDF…', 'info');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 7;
        const usableH = pageH - 2 * margin;
        const imgW = pageW - 2 * margin;
        let primeraPaginaDoc = true;
        for (const sec of secciones) {
            const canvas = await html2canvasCapturaElemento(sec, { delayAfterResize: 100 });
            if (!canvas) continue;
            const imgData = canvas.toDataURL('image/jpeg', 0.88);
            const imgH = (canvas.height * imgW) / canvas.width;
            let yOff = 0;
            while (yOff < imgH) {
                if (!primeraPaginaDoc) pdf.addPage();
                primeraPaginaDoc = false;
                pdf.addImage(imgData, 'JPEG', margin, margin - yOff, imgW, imgH, undefined, 'FAST');
                yOff += usableH;
            }
        }
        const { periodo, fechaDesde } = periodoInformeDesdeSelectEstadisticas();
        pdf.save(`gestornova_stats_ENRE_${periodo}_${fechaDesde.toISOString().slice(0, 10)}.pdf`);
        toast('PDF listo', 'success');
    } catch (e) {
        toast('Error PDF: ' + (e.message || e), 'error');
    }
}

async function generarInformeMensualENRE() {
    if (!esAdmin()) { toast('Solo administrador', 'error'); return; }
    if (modoOffline || !NEON_OK) { toast('Requiere conexión', 'error'); return; }
    const { fechaDesde, condFecha } = periodoInformeDesdeSelectEstadisticas();
    try {
        const tsql = await pedidosFiltroTenantSql();
        const r = await sqlSimple(`SELECT numero_pedido, nis_medidor, estado, prioridad, fecha_creacion, fecha_cierre, distribuidor, tipo_trabajo, descripcion FROM pedidos WHERE ${condFecha}${tsql} ORDER BY fecha_creacion DESC LIMIT 500`);
        const rows = r.rows || [];
        const tit = 'GestorNova — Informe de pedidos';
        let tab = '<table><thead><tr><th>Pedido</th><th>NIS</th><th>Estado</th><th>Prior.</th><th>Creado</th><th>Cierre</th><th>Dist.</th><th>Tipo</th></tr></thead><tbody>';
        rows.forEach(row => {
            tab += `<tr><td>${String(row.numero_pedido || '').replace(/</g, '&lt;')}</td><td>${String(row.nis_medidor || '').replace(/</g, '&lt;')}</td><td>${String(row.estado || '').replace(/</g, '&lt;')}</td><td>${String(row.prioridad || '').replace(/</g, '&lt;')}</td><td>${fmtInformeFecha(row.fecha_creacion)}</td><td>${fmtInformeFecha(row.fecha_cierre)}</td><td>${String(row.distribuidor || '').replace(/</g, '&lt;')}</td><td>${String(row.tipo_trabajo || '').replace(/</g, '&lt;')}</td></tr>`;
        });
        tab += '</tbody></table>';
        const w = window.open('', '_blank');
        if (!w) { toast('Permití ventanas emergentes para el informe', 'error'); return; }
        w.document.write('<html><head><title>' + tit + '</title><style>body{font-family:system-ui;padding:1rem} table{border-collapse:collapse;width:100%;font-size:10pt} th,td{border:1px solid #ccc;padding:4px}</style></head><body><h1>' + tit + '</h1><p>Período desde ' + fechaDesde.toLocaleDateString('es-AR') + ' · Generado ' + fmtInformeFecha(new Date()) + '</p>' + tab + '<p style="margin-top:1rem;font-size:9pt;color:#555">Documento para gestión interna y respaldo documental. Complementar con datos de red (SAIDI/SAIFI, etc.) según exige el marco regulatorio.</p></body></html>');
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch (_) {} }, 500);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
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
            ctx.font = '600 12px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            meta.data.forEach((arc, i) => {
                const v = Number(ds.data[i] || 0);
                if (!v) return;
                const pct = Math.round(1000 * v / total) / 10;
                const { x, y } = arc.tooltipPosition();
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(255,255,255,.95)';
                ctx.fillStyle = '#0f172a';
                const t = pct + '%';
                ctx.strokeText(t, x, y);
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
                    const t = pct + '%';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = 'rgba(255,255,255,.95)';
                    ctx.fillStyle = '#0f172a';
                    ctx.strokeText(t, x, ty);
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
                        ctx.font = '600 11px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = 'rgba(255,255,255,.92)';
                        ctx.fillStyle = '#0f172a';
                        const t = String(v);
                        ctx.strokeText(t, x, y);
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
async function cargarEstadisticas() {
    const periodo = document.getElementById('est-periodo')?.value || '3meses';
    const ahora   = new Date();
    let fechaDesde;
    if      (periodo === 'mes')    fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    else if (periodo === '3meses') fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
    else if (periodo === 'anio')   fechaDesde = new Date(ahora.getFullYear(), 0, 1);
    else                           fechaDesde = new Date('2000-01-01');

    const condFecha = `fecha_creacion >= ${esc(fechaDesde.toISOString())}`;
    const tsql = await pedidosFiltroTenantSql();
    const tsqlP = tsql ? tsql.replace(/\btenant_id\b/g, 'p.tenant_id') : '';
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
        const [rTotal, rEstados, rPrior, rMensual, rTipos, rDist, rTiempos, rTecnicos, rAvance, rUsuarios,
            rTecCalle, rAsig, rCrit24] = await Promise.all([
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
            // Por distribuidor (top 10)
            statSql(`SELECT distribuidor, COUNT(*) AS n,
                COUNT(*) FILTER(WHERE estado='Cerrado') AS cerrados
                FROM pedidos ${filtro} GROUP BY distribuidor ORDER BY n DESC LIMIT 10`, 'dist'),
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
                FROM pedidos ${filtro}`, 'crit24')
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

        const fmtHoras = h => h === 0 || !isFinite(h) ? '—' : h < 1 ? Math.round(h*60)+'min' : h < 24 ? h.toFixed(1)+'h' : (h/24).toFixed(1)+'d';

        // ── Cards de resumen ───────────────────────────────────
        document.getElementById('stats-cards').innerHTML = [
            { val: totalN, lbl: 'Total pedidos',     cls: '' },
            { val: Number(t.pendientes)  || 0, lbl: 'Pendientes',         cls: Number(t.pendientes) > 0 ? 'orange' : '' },
            { val: Number(t.asignados)   || 0, lbl: 'Asignados',          cls: Number(t.asignados) > 0 ? 'orange' : '' },
            { val: Number(t.en_ejec)     || 0, lbl: 'En ejecución',       cls: '' },
            { val: cerrN, lbl: 'Cerrados',           cls: 'green' },
            { val: Number(t.criticos)    || 0, lbl: '🔴 Críticos activos', cls: Number(t.criticos) > 0 ? 'red' : '' },
            { val: Number(t.altos)       || 0, lbl: '🟠 Altos activos',   cls: Number(t.altos) > 0 ? 'orange' : '' },
            { val: Number(t.cerrados_hoy)|| 0, lbl: 'Cerrados hoy',       cls: 'green' },
            { val: nTecCalle, lbl: 'Técnicos con pedido (asig./ejec.)', cls: nTecCalle ? 'orange' : '' },
            { val: fmtHoras(hAsig), lbl: 'Prom. horas hasta asignar', cls: '' },
            { val: pctCerr + '%', lbl: '% cerrados / total período', cls: 'green' },
            { val: pctCrit24 != null ? pctCrit24 + '%' : '—', lbl: '% críticos cerrados &lt;24h', cls: '' },
            { val: fmtHoras(horasProm), lbl: 'Prom. tiempo cierre', cls: '' },
            { val: fmtHoras(horasMin),  lbl: 'Cierre más rápido',   cls: 'green' },
            { val: avanceProm + '%',    lbl: 'Avance prom. en ejec.', cls: '' },
        ].map(s => `<div class="stat-card ${s.cls}"><div class="val">${s.val}</div><div class="lbl">${s.lbl}</div></div>`).join('');

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
                    animation: { duration: 400 },
                    layout: { padding: { top: 4, bottom: 4, left: 4, right: 8 } },
                    plugins: { legend: { display: false }, tooltip: { callbacks: {
                        label: ctx2 => {
                            const v = ctx2.parsed && typeof ctx2.parsed === 'object' && 'y' in ctx2.parsed
                                ? ctx2.parsed.y : (ctx2.parsed ?? ctx2.raw);
                            return ' ' + v + ' pedidos';
                        }
                    }}},
                    ...(isVerticalBar ? { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } } : {}),
                    ...extraOpts
                }
            });
            requestAnimationFrame(() => {
                try { _charts[id]?.resize(); } catch (_) {}
            });
        };

        const COLORES = ['#1e3a8a','#10b981','#f97316','#ef4444','#eab308','#8b5cf6','#06b6d4','#84cc16','#f43f5e','#a78bfa'];
        const priorColor = { 'Crítica':'#ef4444','Alta':'#f97316','Media':'#eab308','Baja':'#3b82f6' };

        // ── Gráfico mensual: total y cerrados por mes ─────────
        crearChart('chart-mensual', 'bar',
            rMensual.rows.map(r => r.mes),
            [
                { label: 'Creados',  data: rMensual.rows.map(r => parseInt(r.total   || 0)), backgroundColor: '#1e3a8a88', borderColor: '#1e3a8a', borderWidth: 2 },
                { label: 'Cerrados', data: rMensual.rows.map(r => parseInt(r.cerrados|| 0)), backgroundColor: '#10b98188', borderColor: '#10b981', borderWidth: 2 }
            ],
            { layout: { padding: { top: 10, bottom: 6, left: 4, right: 8 } },
                plugins: { legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y }}}}
        );

        // ── Gráfico estados: doughnut ─────────────────────────
        const estadoColors = { 'Pendiente':'#eab308','Asignado':'#a855f7','En ejecución':'#3b82f6','Cerrado':'#10b981' };
        crearChart('chart-estados', 'doughnut',
            rEstados.rows.map(r => r.estado),
            [{ data: rEstados.rows.map(r => parseInt(r.n)),
               backgroundColor: rEstados.rows.map(r => estadoColors[r.estado] || '#94a3b8'),
               borderWidth: 2, borderColor: '#fff' }],
            { plugins: { legend: { display: true, position: 'bottom' },
                tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + c.parsed + ' pedidos' }}}}
        );

        // ── Gráfico prioridades: barras coloreadas ────────────
        crearChart('chart-prioridades', 'bar',
            rPrior.rows.map(r => r.prioridad),
            [{ label: 'Pedidos', data: rPrior.rows.map(r => parseInt(r.n)),
               backgroundColor: rPrior.rows.map(r => priorColor[r.prioridad] || '#94a3b8') }],
            { layout: { padding: { top: 32, bottom: 4, left: 4, right: 8 } },
                plugins: { legend: { display: false },
                tooltip: { callbacks: { label: c => ' ' + c.parsed.y + ' pedidos' }}}}
        );

        // ── Gráfico tipos de trabajo: barras horizontales ─────
        // En Chart.js v4: 'bar' con indexAxis:'y' (horizontalBar fue eliminado)
        crearChart('chart-tipos', 'bar',
            rTipos.rows.map(r => r.tipo.length > 25 ? r.tipo.substring(0,25)+'…' : r.tipo),
            [{ label: 'Pedidos', data: rTipos.rows.map(r => parseInt(r.n)),
               backgroundColor: '#1e3a8a88', borderColor: '#1e3a8a', borderWidth: 1 }],
            { indexAxis: 'y',
              layout: { padding: { top: 4, bottom: 4, left: 4, right: 36 } },
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.parsed.x + ' pedidos' }}},
              scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        );

        // ── Gráfico distribuidores: barras con % cierre ────────
        crearChart('chart-distribuidores', 'bar',
            rDist.rows.map(r => r.distribuidor),
            [
                { label: 'Total',    data: rDist.rows.map(r => parseInt(r.n        || 0)), backgroundColor: '#1e3a8a88', borderColor: '#1e3a8a', borderWidth: 1 },
                { label: 'Cerrados', data: rDist.rows.map(r => parseInt(r.cerrados || 0)), backgroundColor: '#10b98188', borderColor: '#10b981', borderWidth: 1 }
            ],
            { plugins: { legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y }}},
              scales: { x: { ticks: { maxRotation: 45, font: { size: 10 } } } } }
        );

        // ── Gráfico técnicos de cierre ────────────────────────
        // ── Gráfico por usuario creador ──────────────────────
        if ((rUsuarios?.rows || []).length) {
            crearChart('chart-usuarios', 'bar',
                rUsuarios.rows.map(r => r.usuario.length > 14 ? r.usuario.substring(0,14)+'…' : r.usuario),
                [{ label: 'Pedidos', data: rUsuarios.rows.map(r => parseInt(r.n)),
                   backgroundColor: COLORES.slice(0,10) }],
                { layout: { padding: { top: 32, bottom: 4, left: 4, right: 8 } },
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
                { layout: { padding: { top: 32, bottom: 4, left: 4, right: 8 } },
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
            capM.innerHTML = `<strong>Resumen numérico</strong> · Suma de pedidos creados (por mes): ${totCr}. Suma de cierres registrados por mes: ${totCe}.<br><strong>Colores:</strong> azul = ingresos del mes; verde = cierres del mes.`;
        }
        const totEst = (rEstados.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
        const capE = document.getElementById('chart-cap-estados');
        if (capE) {
            if (totEst) {
                const estadoLeg = 'Amarillo: Pendiente · Violeta: Asignado · Azul: En ejecución · Verde: Cerrado.';
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
                const prLeg = 'Rojo: Crítica · Naranja: Alta · Amarillo: Media · Azul: Baja.';
                const lines = rPrior.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.prioridad)} <strong>${pctOf(n, totPr)}%</strong> (${n})`;
                }).join(' · ');
                capP.innerHTML = `<strong>Distribución sobre ${totPr} pedidos</strong><br>${lines}<br><strong>Significado de colores:</strong> ${prLeg}`;
            } else capP.textContent = 'Sin datos en el período.';
        }
        const capD = document.getElementById('chart-cap-distribuidores');
        if (capD) {
            if ((rDist.rows || []).length) {
                const lines = rDist.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    const c = parseInt(r.cerrados || 0, 10);
                    const pc = n ? pctOf(c, n) : 0;
                    return `${scap(r.distribuidor)}: total ${n}, cerrados ${c} (<strong>${pc}%</strong> del propio distribuidor)`;
                }).join('<br>');
                capD.innerHTML = `<strong>Por distribuidor</strong><br>${lines}<br><strong>Colores:</strong> azul = total de pedidos; verde = cerrados en el período.`;
            } else capD.textContent = 'Sin datos en el período.';
        }
        const totTip = (rTipos.rows || []).reduce((s, r) => s + parseInt(r.n || 0, 10), 0);
        const capT = document.getElementById('chart-cap-tipos');
        if (capT) {
            if (totTip) {
                const lines = rTipos.rows.map(r => {
                    const n = parseInt(r.n || 0, 10);
                    return `${scap(r.tipo)} <strong>${pctOf(n, totTip)}%</strong> (${n})`;
                }).join(' · ');
                capT.innerHTML = `<strong>Top tipos (${totTip} pedidos en la muestra)</strong><br>${lines}<br><strong>Color:</strong> azul = volumen relativo de cada tipo (barras horizontales).`;
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
        console.error('Error estadísticas:', e);
        if (document.getElementById('stats-cards'))
            document.getElementById('stats-cards').innerHTML = `<div style="color:var(--re);padding:1rem;font-size:.85rem">Error al cargar estadísticas: ${e.message}</div>`;
        toast('Error al cargar estadísticas: ' + e.message, 'error');
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
                zoomControl: true,
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
        // ── Usuarios activos con ubicación reciente ───────────
        const [rUsr, rPed] = await Promise.all([
            sqlSimple(`
                SELECT DISTINCT ON (uu.usuario_id)
                    uu.usuario_id, uu.lat, uu.lng, uu.precision_m, uu.timestamp,
                    u.nombre, u.email
                FROM ubicaciones_usuarios uu
                JOIN usuarios u ON u.id = uu.usuario_id
                WHERE u.activo = TRUE AND uu.timestamp > NOW() - INTERVAL '2 hours'
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
    } catch(e) { msg.textContent = 'Error: ' + e.message; }
}

// ── Reset de contraseña con EmailJS ──────────────────────────
let _resetPaso = 1;
let _resetTokenActual = null;
let _resetUsuarioAdmin = false;

function _adminRecoveryKeyCfg() {
    const k1 = window.APP_CONFIG?.admin?.recoveryKey;
    const k2 = window.APP_CONFIG?.adminRecoveryKey;
    return String(k1 || k2 || '').trim();
}

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
        if (!email) { msg.textContent = 'Ingresá email o usuario'; return; }
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
            if (!r.rows[0]) { msg.textContent = 'Email no encontrado o usuario inactivo'; return; }
            const usuario = r.rows[0];
            _resetUsuarioAdmin = String(usuario.rol || '').toLowerCase() === 'admin';

            // Generar token de 6 dígitos
            const token = String(Math.floor(100000 + Math.random() * 900000));
            _resetTokenActual = token;
            const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
            await sqlSimple(`UPDATE usuarios SET reset_token = ${esc(token)}, reset_expiry = ${esc(expiry)} WHERE id = ${esc(usuario.id)}`);

            const esAndroidLocal = !!window.AndroidDevice && (/GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:');
            if (esAndroidLocal) {
                // EmailJS no funciona en WebView Android (403 non-browser).
                // En la app mostramos el código temporal para continuar el reset.
                msg.style.color = '#854d0e';
                msg.innerHTML =
                    `Android no puede enviar correo desde esta pantalla.<br>` +
                    `Usá este código temporal local: <b>${token}</b>`;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            } else {
                // Enviar email con EmailJS (solo web navegador)
                if (!cfg?.publicKey || !cfg?.serviceId || !cfg?.templateId) {
                    throw new Error('Servicio de correo no configurado en este entorno');
                }
                if (!window.emailjs || typeof emailjs.send !== 'function') {
                    throw new Error('Servicio de correo no disponible en este momento');
                }
                await emailjs.send(cfg.serviceId, cfg.templateId, {
                    to_email: usuario.email,
                    to_name:  usuario.nombre,
                    token:    token,
                    app_name: window.EMPRESA_CFG?.nombre || 'GestorNova'
                }, cfg.publicKey);

                msg.style.color = '#166534';
                msg.textContent = '✓ Código enviado a ' + email;
                document.getElementById('reset-codigo-wrap').style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar código';
                _resetPaso = 2;
            }
        } catch(e) {
            const em = _errMsg(e);
            const esAndroidLocal = !!window.AndroidDevice && (/GestorNova\//i.test(navigator.userAgent) || /Nexxo\//i.test(navigator.userAgent) || window.location.protocol === 'file:');
            // Fallback explícito para recuperar admin en la app si falla correo.
            if (esAndroidLocal && _resetTokenActual && _resetUsuarioAdmin) {
                msg.style.color = '#854d0e';
                msg.innerHTML =
                    `No se pudo enviar el email (${em}).<br>` +
                    `Recuperación local admin (solo este dispositivo): <b>${_resetTokenActual}</b>`;
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
            await sqlSimple(`UPDATE usuarios SET password_hash = ${esc(nuevaPw)}, reset_token = NULL, reset_expiry = NULL WHERE id = ${esc(r.rows[0].id)}`);
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

async function resetAdminSinEmail() {
    const msg = document.getElementById('reset-admin-msg');
    const clave = document.getElementById('reset-admin-key').value.trim();
    const nueva = document.getElementById('reset-admin-newpw').value;
    const claveCfg = _adminRecoveryKeyCfg();
    if (!claveCfg) {
        msg.style.color = '';
        msg.textContent = 'Recuperación admin no configurada (falta clave en config).';
        return;
    }
    if (!clave || !nueva) {
        msg.style.color = '';
        msg.textContent = 'Completá clave y nueva contraseña.';
        return;
    }
    if (nueva.length < 4) {
        msg.style.color = '';
        msg.textContent = 'La nueva contraseña debe tener al menos 4 caracteres.';
        return;
    }
    if (clave !== claveCfg) {
        msg.style.color = '';
        msg.textContent = 'Clave de recuperación inválida.';
        return;
    }
    try {
        const r = await sqlSimple(`SELECT id FROM usuarios WHERE activo = TRUE AND rol = 'admin' ORDER BY id LIMIT 1`);
        if (!r.rows[0]) {
            msg.style.color = '';
            msg.textContent = 'No se encontró usuario admin activo.';
            return;
        }
        await sqlSimple(`UPDATE usuarios
            SET password_hash = ${esc(nueva)}, reset_token = NULL, reset_expiry = NULL
            WHERE id = ${esc(r.rows[0].id)}`);
        msg.style.color = '#166534';
        msg.textContent = '✓ Contraseña de admin restablecida.';
        document.getElementById('reset-admin-key').value = '';
        document.getElementById('reset-admin-newpw').value = '';
    } catch (e) {
        msg.style.color = '';
        msg.textContent = 'Error: ' + _errMsg(e);
    }
}
window.resetAdminSinEmail = resetAdminSinEmail;

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
        toast('Error al descargar: ' + e.message, 'error');
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
if (typeof toggleDistribuidor !== "undefined") window.toggleDistribuidor = toggleDistribuidor;
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

