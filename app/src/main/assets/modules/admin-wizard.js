/**
 * Wizard de configuración inicial (SaaS) y acciones técnico dentro del modal cfgi.
 * Estado y lógica movidos desde app.js; dependencias inyectadas vía initAdminWizard.
 * made by leavera77
 */

import { logErrorWeb, mensajeErrorUsuario, toast } from './ui-utils.js';

/** @type {Record<string, unknown> | null} */
let _wizardDeps = null;

function req() {
    if (!_wizardDeps) throw new Error('initAdminWizard debe llamarse antes de usar el wizard');
    return _wizardDeps;
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
    // Neon: configuracion.abrir_wizard_recuperacion = true obliga al admin a pasar el wizard otra vez
    // (p. ej. tras limpiar clientes de prueba y dejar solo id=1).
    if (req().esAdmin() && extra && extra.abrir_wizard_recuperacion === true) return true;
    if (completado && !incompleto) return false;
    if (incompleto) return true;
    if (req().esAdmin() && !completado) return true;
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
    if (hintBar && req().esAdmin()) {
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

function _wizardTecnicoSetMsg(texto, esError) {
    const m = document.getElementById('cfgi-tech-msg');
    if (!m) return;
    if (!texto) {
        m.style.display = 'none';
        m.textContent = '';
        return;
    }
    m.style.display = 'block';
    m.style.color = esError ? 'var(--re)' : 'var(--tm)';
    m.textContent = texto;
}

async function wizardTecnicoCargarTenantsNeon() {
    const k = (document.getElementById('cfgi-tech-key')?.value || '').trim();
    if (!k) {
        _wizardTecnicoSetMsg('Ingresá la clave de técnico.', true);
        return;
    }
    const token = req().getApiToken();
    if (!token) {
        _wizardTecnicoSetMsg('Sin sesión API. Reiniciá sesión.', true);
        return;
    }
    _wizardTecnicoSetMsg('Cargando…', false);
    try {
        const j = await req().apiSetupTechnicianFetchTenants(token, k);
        req().wizardPoblarSelectTenantsClientes(document.getElementById('cfgi-tech-tenant-sel'), j.clientes);
        _wizardTecnicoSetMsg(`Listo: ${(j.clientes || []).length} fila(s) en clientes. Elegí tenant y tocá Vincular.`, false);
    } catch (e) {
        _wizardTecnicoSetMsg(e.message || 'Error', true);
    }
}

async function wizardTecnicoVincularTenantSeleccionado() {
    const k = (document.getElementById('cfgi-tech-key')?.value || '').trim();
    const sel = document.getElementById('cfgi-tech-tenant-sel');
    const tid = Number(sel?.value);
    if (!k) {
        _wizardTecnicoSetMsg('Ingresá la clave de técnico.', true);
        return;
    }
    if (!Number.isFinite(tid) || tid < 1) {
        _wizardTecnicoSetMsg('Primero listá tenants y elegí un id.', true);
        return;
    }
    const token = req().getApiToken();
    if (!token) {
        _wizardTecnicoSetMsg('Sin sesión API.', true);
        return;
    }
    _wizardTecnicoSetMsg('Vinculando…', false);
    try {
        const j = await req().apiSetupTechnicianPostAttach(token, k, tid);
        if (j.token) {
            req().app.apiToken = String(j.token);
            try {
                localStorage.setItem('pmg_api_token', req().app.apiToken);
            } catch (_) {}
            if (req().app.u) {
                req().app.u.tenant_id = tid;
                try {
                    delete req().app.u.tenantId;
                } catch (_) {}
                try {
                    localStorage.setItem('pmg', JSON.stringify(req().app.u));
                } catch (_) {}
            }
            try {
                req().limpiarLocalStorageContadoresPedido();
            } catch (_) {}
            try {
                req().invalidarCachesMultitenantSesionYOAdminUI();
            } catch (_) {}
            try {
                if (window.AndroidSession && typeof AndroidSession.setTenantId === 'function') {
                    AndroidSession.setTenantId(tid);
                }
            } catch (_) {}
        }
        const tEl = document.getElementById('cfgi-tenant');
        if (tEl) tEl.textContent = 'tenant_id: ' + tid;
        _wizardTecnicoSetMsg(j.message || 'Vinculado. Podés seguir el wizard o recargar la página.', false);
        toast(j.message || 'Tenant vinculado correctamente.', 'success');
    } catch (e) {
        _wizardTecnicoSetMsg(e.message || 'Error', true);
    }
}

function mostrarModalConfigInicial() {
    const modal = document.getElementById('modal-config-inicial');
    if (!modal) return;
    _configInicialBloqueante = true;
    const cfg = window.EMPRESA_CFG || {};
    const esAdm = req().esAdmin();
    document.getElementById('cfgi-nombre').value = cfg.nombre || '';
    document.getElementById('cfgi-tipo').value = cfg.tipo || '';
    document.getElementById('cfgi-logo-url').value = cfg.logo_url || '';
    document.getElementById('cfgi-tenant').textContent = 'tenant_id: ' + req().tenantIdActual();
    try {
        const tw = document.getElementById('cfgi-tech-wrap');
        if (tw) tw.style.display = esAdm ? '' : 'none';
        _wizardTecnicoSetMsg('', false);
    } catch (_) {}
    const msg = document.getElementById('cfgi-msg');
    msg.style.display = 'block';
    const snap = window.__PMG_LAST_MI_CLIENTE || null;
    const snapLine =
        snap && snap.id != null
            ? ` Registro en servidor: id ${snap.id} — ${String(snap.nombre || '').trim() || '—'} · ${String(snap.tipo || '').trim() || '—'}. Los campos coinciden con la tabla; confirmá con Finalizar.`
            : '';
    msg.textContent = esAdm
        ? 'Setup inicial (una vez): elegí tipo de negocio, nombre y ubicación base; al final tocá Finalizar. Si ya estaban cargados, revisalos y confirmá.' + snapLine
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
    const token0 = req().getApiToken();
    if (!token0) {
        ocultarModalConfigInicial();
        return true;
    }
    let cfg = {};
    let extraParsed = {};
    let apiOk = false;
    const maxIntentos = 3;
    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            const token = req().getApiToken();
            if (!token) break;
            const resp = await fetch(req().apiUrl('/api/clientes/mi-configuracion'), {
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
                let empresaMt = false;
                try {
                    empresaMt = !!(req().NEON_OK && req()._sql && (await req().neonPedidosTieneColumnaTenantId()));
                } catch (_) {}
                const apiTid = Number(data?.tenant_id ?? cli?.id);
                let neonUserTid = null;
                if (empresaMt && app?.u?.id) {
                    try {
                        neonUserTid = await req().leerTenantIdUsuarioDesdeNeon(Number(req().app.u.id));
                    } catch (_) {}
                }
                const jwtVsNeonMismatch =
                    empresaMt &&
                    neonUserTid != null &&
                    Number.isFinite(apiTid) &&
                    apiTid > 0 &&
                    neonUserTid !== apiTid;

                if (jwtVsNeonMismatch) {
                    try {
                        console.warn(
                            '[setup] Neon WebView usuarios ≠ tenant API; se usa tenant de la API (mismo que admin web)'
                        );
                    } catch (_) {}
                    try {
                        req().app.u.tenant_id = apiTid;
                        try {
                            delete req().app.u.tenantId;
                        } catch (_) {}
                        try {
                            localStorage.setItem('pmg', JSON.stringify(req().app.u));
                        } catch (_) {}
                    } catch (_) {}
                    try {
                        req().invalidatePedidosTenantSqlCache();
                    } catch (_) {}
                    try {
                        await req().intentarRefrescarJwtDesdeCredencialesGuardadas();
                    } catch (_) {}
                    try {
                        await req().refrescarEmpresaDesdeClienteNeonPorTenantActual();
                    } catch (_) {}
                    try {
                        const cr = await req().sqlSimple(
                            `SELECT configuracion FROM clientes WHERE id = ${req().esc(apiTid)} LIMIT 1`
                        );
                        let rawCfg = cr.rows?.[0]?.configuracion;
                        if (typeof rawCfg === 'string') {
                            try {
                                rawCfg = JSON.parse(rawCfg);
                            } catch (_) {
                                rawCfg = {};
                            }
                        }
                        extraParsed =
                            rawCfg && typeof rawCfg === 'object' && !Array.isArray(rawCfg) ? rawCfg : {};
                    } catch (_) {
                        extraParsed = {};
                    }
                    const ec = window.EMPRESA_CFG || {};
                    cfg = {
                        nombre: String(ec.nombre || '').trim(),
                        tipo: String(ec.tipo || '').trim(),
                        ...(ec.logo_url ? { logo_url: ec.logo_url } : {}),
                        lat_base:
                            ec.lat_base != null && String(ec.lat_base).trim() !== ''
                                ? String(ec.lat_base).trim()
                                : '',
                        lng_base:
                            ec.lng_base != null && String(ec.lng_base).trim() !== ''
                                ? String(ec.lng_base).trim()
                                : ''
                    };
                    try {
                        window.__PMG_MI_CFG_FETCH_FAIL = false;
                    } catch (_) {}
                    break;
                }

                try {
                    req().aplicarConfiguracionJsonClienteEnEmpresaCfg(extraParsed);
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
                window.__PMG_LAST_MI_CLIENTE = {
                    id: Number(data?.tenant_id ?? cli?.id) || null,
                    nombre: nombreTrim,
                    tipo: String(cli.tipo ?? '').trim(),
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
        if (req().sesionCompletaParaMarcaLogin()) {
            req().hydrateBrandingForPublicScreen();
            try {
                req().aplicarMarcaVisualCompleta();
            } catch (_) {}
        } else {
            try {
                req().pintarCabeceraLoginWizardGenerica();
            } catch (_) {}
        }
        ocultarModalConfigInicial();
        return true;
    }
    // Admin: obligatorio completar/confirmar el wizard una vez (setup_wizard_completado en API).
    // Datos incompletos: cualquier rol con modal (no admin no puede guardar).
    if (debeMostrarSetupInicial(cfg, extraParsed)) {
        _setupWizardContextoManual = false;
        window.EMPRESA_CFG = { ...cfg };
        req().poblarSelectTiposReclamo();
        mostrarModalConfigInicial();
        return false;
    }
    window.EMPRESA_CFG = { ...(window.EMPRESA_CFG || {}), ...cfg };
    req().poblarSelectTiposReclamo();
    ocultarModalConfigInicial();
    req().syncEmpresaCfgNombreLogoDesdeMarca();
    req().aplicarMarcaVisualCompleta();
    req().aplicarEtiquetasPorTipo(cfg.tipo || '');
    req().poblarSelectTiposReclamo();
    try {
        req().persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
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
    req().syncEmpresaCfgNombreLogoDesdeMarca();
    req().aplicarMarcaVisualCompleta();
    try {
        actualizarBarraHeaderSesion();
    } catch (_) {}
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
    if (!req().esAdmin()) {
        toast('Solo un administrador puede completar el setup.', 'error');
        return;
    }
    const nombre = (document.getElementById('cfgi-nombre')?.value || '').trim();
    const tipo = (document.getElementById('cfgi-tipo')?.value || '').trim();
    const logoUrlInput = (document.getElementById('cfgi-logo-url')?.value || '').trim();
    const logoUrl = _setupLogoDataUrl || logoUrlInput || '';
    if (!nombre || !tipo) return toast('Completá nombre y tipo', 'error');
    if (_setupLat == null || _setupLng == null) return toast('Marcá la ubicación base en el mapa', 'error');
    const firmaWiz = req().firmaIdentidadTenant(nombre, tipo);
    const firmaAnt = req().leerFirmaIdentidadAlmacenada();
    if (firmaWiz !== firmaAnt && req().esAdmin()) {
        if (req().NEON_OK && typeof req().sqlSimple === 'function') {
            try {
                await req().vaciarCoordenadasSociosCatalogo({ skipConfirm: true, silent: true });
            } catch (e) {
                console.warn('[wizard] vaciar socios_catalogo', e);
            }
        }
        req().vaciarDerivacionesTercerosFormularioAdmin();
    }
    try {
        const token = req().getApiToken();
        if (!token) {
            toast('Sesión API no disponible. Cerrá sesión e ingresá nuevamente con internet.', 'error');
            return;
        }
        let provExtra = {};
        try {
            const pv = await req().nominatimReverseProvinciaArgentina(_setupLat, _setupLng);
            if (pv) provExtra = { provincia: pv, state: pv, provincia_nominatim: pv };
        } catch (_) {}
        const rubWiz = req().normalizarRubroEmpresa(tipo);
        const abtWiz =
            rubWiz === 'cooperativa_agua' ? 'agua' : rubWiz === 'municipio' ? 'municipio' : 'electricidad';
        let authToken = token;
        const wizResp = await fetch(req().apiUrl('/api/setup/wizard'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ tenant_nombre: nombre, business_type: abtWiz }),
        });
        if (!wizResp.ok) {
            const err = await wizResp.json().catch(() => ({}));
            const det = [err.detail, err.error].filter(Boolean).join(' — ');
            throw new Error(det || `wizard HTTP ${wizResp.status}`);
        }
        const wiz = await wizResp.json();
        if (wiz.token && (wiz.nueva_instancia || wiz.tenant_recuperado)) {
            authToken = String(wiz.token);
            req().app.apiToken = authToken;
            try {
                localStorage.setItem('pmg_api_token', authToken);
            } catch (_) {}
            if (req().app.u) {
                req().app.u.tenant_id = Number(wiz.tenant_id);
                try {
                    delete req().app.u.tenantId;
                } catch (_) {}
                try {
                    localStorage.setItem('pmg', JSON.stringify(req().app.u));
                } catch (_) {}
            }
            req().limpiarLocalStorageContadoresPedido();
            try {
                req().invalidarCachesMultitenantSesionYOAdminUI();
            } catch (_) {}
            if (wiz.tenant_recuperado) {
                toast(
                    wiz.message ||
                        'Ya existía un tenant con el mismo nombre y tipo de negocio: se recuperó ese registro y tu sesión pasó a ese id.',
                    'success'
                );
            } else {
                toast('Nueva instancia de tenant: se aísla la numeración de pedidos y los datos del tenant anterior.', 'info');
            }
        }
        const resp = await fetch(req().apiUrl('/api/clientes/mi-configuracion'), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                nombre,
                tipo,
                logo_url: logoUrl,
                latitud: _setupLat,
                longitud: _setupLng,
                configuracion: {
                    setup_wizard_completado: true,
                    marca_publicada_admin: true,
                    abrir_wizard_recuperacion: false,
                    ...provExtra,
                }
            })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }
        req().sincronizarFirmaIdentidadTenantDesdeValores(nombre, tipo);
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
            subtitulo: req().GN_SUBTITULO_FIJO,
            logo_url: logoUrl,
            lat_base: String(_setupLat),
            lng_base: String(_setupLng),
            active_business_type: String(window.EMPRESA_CFG?.active_business_type || '').trim() || abtWiz,
            ...(provExtra.provincia ? { ...provExtra } : {}),
        };
        try {
            req().invalidatePedidosTenantSqlCache();
        } catch (_) {}
        if (req().NEON_OK && req()._sql) {
            try {
                const pairs = [
                    ['nombre', nombre],
                    ['tipo', tipo],
                    ['empresa_identidad_bloqueada', '1'],
                ];
                pairs.push(['subtitulo', req().GN_SUBTITULO_FIJO]);
                const abtNeon = String(window.EMPRESA_CFG?.active_business_type || '').trim() || abtWiz;
                pairs.push(['active_business_type', abtNeon]);
                for (const [k, v] of pairs) {
                    await req().sqlSimple(`INSERT INTO empresa_config(clave, valor) VALUES(${req().esc(k)}, ${req().esc(v)})
                        ON CONFLICT(clave) DO UPDATE SET valor = ${req().esc(v)}, actualizado = NOW()`);
                }
            } catch (e) {
                console.warn('[wizard] empresa_config identidad', e);
            }
        }
        try {
            req().persistTenantBrandingCache({ subtitulo: window.EMPRESA_CFG?.subtitulo });
        } catch (_) {}
        req().poblarSelectTiposReclamo();
        await req().cargarConfigEmpresa();
        const ok = await verificarConfiguracionInicialObligatoria();
        if (ok) {
            try {
                alert(
                    (wiz && wiz.nueva_instancia
                        ? 'Se creó una nueva instancia (nuevo tenant). Cerrá otras pestañas si las tenías abiertas.\n\n'
                        : '') +
                        'Configuración inicial guardada en el servidor.\n\n' +
                        'La página se va a recargar por completo para aplicar aislamiento, marca y evitar datos mezclados.'
                );
            } catch (_) {}
            try {
                sessionStorage.clear();
            } catch (_) {}
            try {
                localStorage.removeItem(req().WEB_MAP_FILTRO_TIPOS_KEY);
            } catch (_) {}
            try {
                req().limpiarLocalStorageContadoresPedido();
            } catch (_) {}
            try {
                req().invalidatePedidosTenantSqlCache();
                req().invalidarCachesMultitenantSesionYOAdminUI();
            } catch (_) {}
            try {
                const u = new URL(window.location.href);
                u.searchParams.set('_gnreload', String(Date.now()));
                window.location.replace(u.toString());
            } catch (_) {
                window.location.reload();
            }
            return;
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

export function initAdminWizard(deps) {
    if (_wizardDeps) return;
    _wizardDeps = deps;
}

/** Primar coordenadas del wizard desde objeto configuracion (misma lógica que app antes de abrir manual). */
export function primeWizardCoordsFromEp(ep) {
    if (ep.lat_base != null && Number.isFinite(Number(ep.lat_base))) {
        _setupLat = Number(ep.lat_base);
    }
    if (ep.lng_base != null && Number.isFinite(Number(ep.lng_base))) {
        _setupLng = Number(ep.lng_base);
    }
}

export function resetWizardLogoBufferForManualOpen() {
    _setupLogoDataUrl = '';
}

export function setWizardManualContext(flag) {
    _setupWizardContextoManual = !!flag;
}

export { verificarConfiguracionInicialObligatoria, mostrarModalConfigInicial, initSetupWizardBindings };

window.guardarConfiguracionInicialObligatoria = guardarConfiguracionInicialObligatoria;
window.setupWizardNext = setupWizardNext;
window.setupWizardPrev = setupWizardPrev;
window.wizardTecnicoCargarTenantsNeon = wizardTecnicoCargarTenantsNeon;
window.wizardTecnicoVincularTenantSeleccionado = wizardTecnicoVincularTenantSeleccionado;
window.usarUbicacionAutomaticaSetupWizard = usarUbicacionAutomaticaSetupWizard;
window.cerrarWizardSetupVoluntario = cerrarWizardSetupVoluntario;
