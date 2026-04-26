// core.js - Variables globales, config y utilidades básicas

export const app = {
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

export let NEON_OK = false;
export let _sql = null;
export let modoOffline = false;

export let ultimaUbicacion = null;
export let mapaInicializado = false;
export let marcadorUbicacion = null;
export let _gpsRecibidoEstaSesion = false;

export function setUltimaUbicacion(val) { ultimaUbicacion = val; }
export function setMapaInicializado(val) { mapaInicializado = val; }
export function setMarcadorUbicacion(val) { marcadorUbicacion = val; }
export function setGpsRecibidoEstaSesion(val) { _gpsRecibidoEstaSesion = val; }

export function esAndroidWebViewMapa() {
    try {
        const ua = navigator.userAgent || '';
        return (
            ua.indexOf('Android') > -1 &&
            (ua.indexOf('wv') > -1 || ua.indexOf('Version/') > -1)
        );
    } catch (_) {
        return false;
    }
}

export function gnMapaLigero() {
    return esAndroidWebViewMapa();
}

export function setNeonOk(val) { NEON_OK = val; }
export function setSql(val) { _sql = val; }
export function setModoOffline(val) { modoOffline = val; }

export function tenantIdActual() {
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

export function lineaNegocioOperativaCodigo() {
    // Si existe business_type en la config de la empresa o en el usuario, se usa.
    return window.EMPRESA_CFG?.active_business_type || null;
}

export function normalizarTelefono(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const digits = s.replace(/\D/g, '');
    if (!digits) return '';
    return digits;
}

export function toast(msg, tipo = 'info', durationMs = 3500) {
    console.log(`[TOAST] [${tipo.toUpperCase()}] ${msg}`);
    const container = document.getElementById('toast-container');
    if (!container) {
        // Fallback to alert if no container
        if (tipo === 'error') console.error(msg);
        return;
    }
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.innerHTML = msg;
    container.appendChild(t);
    setTimeout(() => {
        t.classList.add('fade-out');
        setTimeout(() => t.remove(), 500);
    }, durationMs);
}

export function esc(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return "'" + String(v).replace(/'/g, "''") + "'";
}

export function logErrorWeb(tag, err, extra) {
    const msg = err != null && err !== '' ? err.message || String(err) : String(err);
    const det = extra != null ? extra : '';
    if (err && err.stack) console.error(`[GestorNova:${tag}]`, msg, det, err.stack);
    else console.error(`[GestorNova:${tag}]`, msg, det);
}

export function mensajeErrorUsuario(err) {
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
    return raw.length <= 100 ? raw : 'Algo salió mal. Si se repite, contactá al administrador.';
}

export function toastError(tag, err, prefijo) {
    logErrorWeb(tag, err);
    const cuerpo = mensajeErrorUsuario(err);
    let msg = prefijo ? `${String(prefijo).trim()} ${cuerpo}` : cuerpo;
    toast(msg, 'error');
}

export async function sqlSimple(query, params = []) {
    if (!_sql) throw new Error('Neon no inicializado');
    let q = query;
    for (let i = 0; i < params.length; i++)
        q = q.replace(new RegExp('\\{' + i + '\\}', 'g'), esc(params[i]));
    return _sql(q);
}

export function getApiToken() {
    return app.apiToken || localStorage.getItem('pmg_api_token');
}

export function getApiBaseUrl() {
    return window.APP_CONFIG?.api?.baseUrl?.replace(/\/+$/, '') || '';
}

export function apiUrl(path) {
    const base = getApiBaseUrl();
    if (!base) return path;
    return base + (path.startsWith('/') ? path : '/' + path);
}

export function normalizarRolStr(r) {
    const x = String(r == null ? '' : r).trim().toLowerCase();
    return x === 'administrador' ? 'admin' : (x || 'tecnico');
}

export function esAdmin() {
    return app.u && normalizarRolStr(app.u.rol) === 'admin';
}

export function esTecnicoOSupervisor() {
    if (!app.u) return false;
    const r = normalizarRolStr(app.u.rol);
    return r === 'tecnico' || r === 'supervisor' || r === 'admin';
}

export function normalizarRubroEmpresa(tipo) {
    const t = String(tipo || '').trim().toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t === 'cooperativa de agua') return 'cooperativa_agua';
    if (t === 'cooperativa_electrica' || t === 'cooperativa eléctrica' || t === 'cooperativa electrica') return 'cooperativa_electrica';
    return null;
}

export function esCooperativaElectricaRubro() {
    return normalizarRubroEmpresa(window.EMPRESA_CFG?.tipo) === 'cooperativa_electrica';
}
