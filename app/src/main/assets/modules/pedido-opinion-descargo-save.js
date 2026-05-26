/**
 * Guardar descargo valoración WA: API (JWT) + fallback Neon + notificar/chat vía API.
 * made by leavera77
 */

function escSql(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return `'${String(v).replace(/'/g, "''")}'`;
}

async function intentarRefrescarJwt(deps) {
    try {
        if (typeof deps.intentarRefrescarJwt === 'function') await deps.intentarRefrescarJwt();
    } catch (_) {}
}

async function fetchOpinionDescargo(deps, pid, texto, method, suffix = '') {
    const apiUrl = deps.apiUrl;
    const asegurarJwt = deps.asegurarJwtApiRest;
    const getToken = deps.getApiToken;
    if (typeof apiUrl !== 'function' || typeof asegurarJwt !== 'function') {
        return { ok: false, status: 0, err: new Error('API no configurada') };
    }
    await asegurarJwt();
    const path = `/api/pedidos/${encodeURIComponent(String(pid))}/opinion-descargo${suffix}`;
    const url = apiUrl(path);
    const doFetch = async () => {
        const token = typeof getToken === 'function' ? getToken() : '';
        return fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify({ descargo: texto }),
        });
    };
    let res;
    try {
        res = await doFetch();
        if (res.status === 401) {
            await intentarRefrescarJwt(deps);
            res = await doFetch();
        }
    } catch (e) {
        return { ok: false, status: 0, err: e };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        return {
            ok: false,
            status: res.status,
            err: new Error(data?.error || data?.detail || `Error ${res.status}`),
            data,
        };
    }
    return { ok: true, status: res.status, data };
}

async function guardarDescargoNeon(deps, pid, texto) {
    if (!deps.NEON_OK || typeof deps.sqlSimple !== 'function') return null;
    if (typeof deps.modoOffline === 'function' && deps.modoOffline()) return null;
    const esc = typeof deps.esc === 'function' ? deps.esc : escSql;
    const pidNum = Number(pid);
    if (!Number.isFinite(pidNum) || pidNum < 1) return null;
    const val = String(texto || '').trim();
    const sqlVal = val ? esc(val) : 'NULL';
    const fechaSql = val ? 'NOW()' : 'NULL';
    try {
        await deps.sqlSimple(
            `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS opinion_descargo_empresa TEXT`
        );
        await deps.sqlSimple(
            `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_descargo_empresa TIMESTAMPTZ`
        );
    } catch (_) {}
    let where = `id = ${esc(pidNum)}`;
    try {
        if (typeof deps.neonPedidosTieneColumnaTenantId === 'function') {
            const mt = await deps.neonPedidosTieneColumnaTenantId();
            if (mt && typeof deps.tenantIdActual === 'function') {
                const tid = Number(deps.tenantIdActual());
                if (Number.isFinite(tid) && tid > 0) where += ` AND tenant_id = ${esc(tid)}`;
            }
        }
    } catch (_) {}
    try {
        const r = await deps.sqlSimple(
            `UPDATE pedidos SET opinion_descargo_empresa = ${sqlVal}, fecha_descargo_empresa = ${fechaSql} WHERE ${where} RETURNING id`
        );
        const n = r?.rows?.length ?? r?.rowCount;
        if (n === 0) return null;
    } catch (e) {
        console.warn('[opinion-descargo] neon', e?.message || e);
        return null;
    }
    let base = {
        opinion_descargo_empresa: val || null,
        fecha_descargo_empresa: val ? new Date().toISOString() : null,
        _soloNeon: true,
    };
    if (val) {
        const reab = await reabrirPedidoNeonSiCorresponde(deps, pidNum, where, esc);
        if (reab) base = { ...base, ...reab };
    }
    return base;
}

async function reabrirPedidoNeonSiCorresponde(deps, pidNum, where, esc) {
    try {
        const sel = await deps.sqlSimple(
            `SELECT estado, opinion_cliente, opinion_cliente_estrellas, opinion_descargo_empresa
             FROM pedidos WHERE ${where} LIMIT 1`
        );
        const row = sel?.rows?.[0];
        if (!row) return null;
        const est = String(row.estado || '')
            .trim()
            .toLowerCase();
        if (est !== 'cerrado') return null;
        const n = Number(row.opinion_cliente_estrellas);
        const tieneOpinion =
            (Number.isFinite(n) && n >= 1 && n <= 5) ||
            (row.opinion_cliente != null && String(row.opinion_cliente).trim());
        const desc = String(row.opinion_descargo_empresa || '').trim();
        if (!tieneOpinion || !desc) return null;
        await deps.sqlSimple(
            `UPDATE pedidos SET estado = 'Pendiente', avance = 0, tecnico_asignado_id = NULL,
             fecha_asignacion = NULL, fecha_cierre = NULL, usuario_cierre_id = NULL
             WHERE ${where}`
        );
        return {
            estado: 'Pendiente',
            avance: 0,
            tecnico_asignado_id: null,
            pedidoReabierto: true,
        };
    } catch (e) {
        console.warn('[opinion-descargo] reabrir neon', e?.message || e);
        return null;
    }
}

async function notificarDescargoApi(deps, pid, texto) {
    if (typeof deps.puedeEnviarApiRestPedidos === 'function' && !deps.puedeEnviarApiRestPedidos()) {
        await intentarRefrescarJwt(deps);
        if (typeof deps.puedeEnviarApiRestPedidos === 'function' && !deps.puedeEnviarApiRestPedidos()) {
            return null;
        }
    }
    return fetchOpinionDescargo(deps, pid, texto, 'POST', '/notificar');
}

/**
 * @param {object} deps — mismas deps que pedido-opinion-cliente-ui
 * @param {string|number} pid
 * @param {string} texto
 */
export async function guardarDescargoOpinionCompleto(deps, pid, texto) {
    const val = String(texto || '').trim();
    let apiFail = null;

    if (typeof deps.puedeEnviarApiRestPedidos !== 'function' || deps.puedeEnviarApiRestPedidos()) {
        const api = await fetchOpinionDescargo(deps, pid, val, 'PATCH');
        if (api.ok) return api.data;
        apiFail = api;
        const tryNeon =
            api.status === 0 ||
            api.status === 401 ||
            api.status === 403 ||
            api.status === 404 ||
            api.status >= 500;
        if (!tryNeon) throw api.err || new Error('No se pudo guardar el descargo');
    }

    const neon = await guardarDescargoNeon(deps, pid, val);
    if (neon) {
        if (val && typeof deps.puedeEnviarApiRestPedidos === 'function' && deps.puedeEnviarApiRestPedidos()) {
            const notify = await notificarDescargoApi(deps, pid, val);
            if (notify?.ok && notify.data) {
                return {
                    ...neon,
                    opinion_descargo_empresa: val,
                    whatsappEnviado: !!notify.data.whatsappEnviado,
                    humanChatSessionId: notify.data.humanChatSessionId ?? null,
                    _soloNeon: false,
                };
            }
        }
        return neon;
    }

    throw apiFail?.err || new Error('No se pudo guardar el descargo');
}
