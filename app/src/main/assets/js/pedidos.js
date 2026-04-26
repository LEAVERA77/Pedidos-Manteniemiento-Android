/**
 * pedidos.js - Módulo para la gestión de pedidos (reclamos) y filtrado por tenant.
 */

import { app, modoOffline, NEON_OK, _sql, esc, sqlSimple, ejecutarSQLConReintentos, toast, render } from './core.js';
import { offlinePedidos, offlinePedidosSave, enqueueOffline } from '../offline.js';

const CN = new Set([
    'estado', 'fecha_avance', 'avance', 'usuario_inicio_id', 'usuario_cierre_id', 'usuario_avance_id',
    'prioridad', 'tipo_trabajo', 'descripcion', 'tecnico_asignado_id', 'fecha_asignacion',
    'lat', 'lng', 'latitud', 'longitud'
]);

/** Normaliza un objeto de pedido de la base de datos al formato de la aplicación. */
export const norm = p => ({
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
    es: p.estado || 'Pending',
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
});

let _pedidosTenantSqlCache = null;

export function invalidatePedidosTenantSqlCache() {
    _pedidosTenantSqlCache = null;
}

/** Obtiene el ID del tenant actual. */
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

/** Genera el fragmento SQL para filtrar por tenant y tipo de negocio. */
export async function pedidosFiltroTenantSql() {
    if (_pedidosTenantSqlCache !== null) return _pedidosTenantSqlCache;
    try {
        const chk = await sqlSimple(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'pedidos'
             AND column_name IN ('tenant_id','business_type')`
        );
        const names = new Set((chk.rows || []).map((x) => x.column_name));
        const parts = [];
        if (names.has('tenant_id')) {
            parts.push(`tenant_id = ${esc(tenantIdActual())}`);
        }
        if (names.has('business_type')) {
            const bt = String(window.EMPRESA_CFG?.active_business_type || '').trim().toLowerCase();
            if (bt === 'electricidad' || bt === 'agua' || bt === 'municipio') {
                parts.push(`business_type = ${esc(bt)}`);
            }
        }
        _pedidosTenantSqlCache = parts.length ? ` AND ${parts.join(' AND ')}` : '';
    } catch (_) {
        _pedidosTenantSqlCache = '';
    }
    return _pedidosTenantSqlCache;
}

/** Carga los pedidos desde el servidor o caché local. */
export async function cargarPedidos(opts) {
    const silent = !!(opts && opts.silent);
    if (!silent) {
        const pl = document.getElementById('pl');
        if (pl) pl.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i> Cargando...</div>';
    }
    if (modoOffline) {
        app.p = offlinePedidos();
        render();
        return;
    }
    try {
        if (typeof window.asegurarNombreUsuariosParaFiltros === 'function') {
            await window.asegurarNombreUsuariosParaFiltros();
        }
        const tsql = await pedidosFiltroTenantSql();
        let qPed = `SELECT * FROM pedidos WHERE 1=1${tsql} ORDER BY fecha_creacion DESC`;

        const esTecnicoOSupervisor = () => {
            const r = app.u?.rol;
            return r === 'tecnico' || r === 'supervisor';
        };

        if (esTecnicoOSupervisor()) {
            const verTodos = localStorage.getItem('pmg_tecnico_ver_todos') === '1';
            if (!verTodos) {
                qPed = `SELECT * FROM pedidos WHERE tecnico_asignado_id = ${esc(parseInt(app.u.id, 10))}${tsql} ORDER BY fecha_creacion DESC`;
            }
        }

        const esAdmin = () => app.u?.rol === 'admin';

        const prevSnapTecnico =
            !esAdmin() && esTecnicoOSupervisor() && (app.p || []).length
                ? new Map((app.p || []).map(p => [String(p.id), { es: p.es, np: p.np, tai: p.tai }]))
                : null;

        const r = await ejecutarSQLConReintentos(qPed);
        const prevIds = new Set((app.p || []).map(p => p.id));
        app.p = (r.rows || []).map(norm);

        if (prevSnapTecnico && typeof window.notificarCambiosPedidoTecnico === 'function') {
            window.notificarCambiosPedidoTecnico(prevSnapTecnico);
        }

        if (esAdmin() && app.p.length) {
            const mx = app.p.reduce((a, p) => Math.max(a, Number(p.id) || 0), 0);
            if (Number.isFinite(mx) && mx > 0) app._lastMaxPedidoIdSynced = mx;
        }

        if (esAdmin() && prevIds.size > 0) {
            const dosMinutosAtras = Date.now() - 2 * 60 * 1000;
            const nuevos = app.p.filter(p => !prevIds.has(p.id));
            nuevos.forEach(p => {
                const urgente = ['Crítica', 'Alta'].includes(p.pr) && p.es === 'Pendiente' &&
                    new Date(p.f).getTime() > dosMinutosAtras;
                if (urgente && typeof window.mostrarAlertaPedidoUrgente === 'function') {
                    window.mostrarAlertaPedidoUrgente(p);
                } else {
                    const tit = (p.tt || p.de || '').toString().trim().slice(0, 52);
                    toast(`Nuevo reclamo #${p.np || p.id}${tit ? ' — ' + tit : ''}`, 'info');
                }
            });
        }

        offlinePedidosSave(app.p);
    } catch(e) {
        console.warn('cargarPedidos: error, usando cache', e.message);
        if (typeof window.setModoOffline === 'function') window.setModoOffline(true);
        app.p = offlinePedidos();
        toast('Sin conexión — mostrando pedidos en caché', 'info');
    }
    render();
    try {
        if (typeof window.refrescarDetalleSiAbiertoTrasSync === 'function') {
            window.refrescarDetalleSiAbiertoTrasSync();
        }
    } catch (_) {}
    if (typeof window.enriquecerCoordsGeocodificadasPedidos === 'function') {
        void window.enriquecerCoordsGeocodificadasPedidos();
    }
}

/** Actualiza un pedido en la base de datos o cola offline. */
export async function updPedido(id, campos, usuarioId) {
    const idxPre = app.p.findIndex(p => String(p.id) === String(id));
    const prevRow = idxPre !== -1 ? app.p[idxPre] : null;
    const estadoAntesUpd = prevRow ? String(prevRow.es || '') : '';
    const taiAsignado = prevRow != null && prevRow.tai != null ? prevRow.tai : null;

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
}

// Exportar al objeto global para compatibilidad con el puente Android
window.norm = norm;
window.cargarPedidos = cargarPedidos;
window.updPedido = updPedido;
window.pedidosFiltroTenantSql = pedidosFiltroTenantSql;
window.tenantIdActual = tenantIdActual;
window.gnSincronizarPedidosDesdeAndroid = function() {
    if (!app.u || modoOffline || !NEON_OK || !_sql) return;
    void cargarPedidos({ silent: true });
};
