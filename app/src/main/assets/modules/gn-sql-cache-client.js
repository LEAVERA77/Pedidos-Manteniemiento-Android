/**
 * Gateway SQL cliente + Caché agresiva L1 (memoria) + L2 (sessionStorage para catálogos)
 * + Singleflight en navegador/WebView + Throttling en pestañas ocultas + Invalidación automática
 * coordinada con Service Worker (`PMG_INVALIDATE_API_CACHE`).
 *
 * Reduce drásticamente llamadas repetidas a `/api/sql/query` y `network transfer` en Neon.
 *
 * made by leavera77
 */

const SESSION_PREFIX = 'gn_sqlc_v1:';
const MAX_L1_ITEMS = 250;
const MAX_SESSION_ITEM_CHARS = 180_000;

const GEO_SCHEMA_TABLES = new Set([
    '__schema__',
    'localidades_argentinas',
    'codigos_area_argentina',
    'calles_normalizadas',
    'calles_geometrias',
    'correcciones_direcciones',
]);

const CATALOG_TABLES = new Set([
    'clientes',
    'configuracion',
    'tipos_reclamo',
    'distribuidores',
    'subestaciones_catalogo',
    'socios_catalogo',
    'tenant_localidades',
    'app_update_config',
]);

const OPERATIONAL_TABLES = new Set([
    'pedidos',
    'incidencias',
    'notificaciones_movil',
    'whatsapp_notificaciones',
    'operacion_audit_log',
    'kpi_snapshots',
    'geocod_wa_operaciones',
    'ubicaciones_usuarios',
]);

/** @type {Map<string, { rowsJson: string, rowCount: number, expiresAt: number, tables: string[], tier: string }>} */
const clientL1 = new Map();
/** @type {Map<string, Promise<{ rows: any[], rowCount: number }>>} */
const clientInFlight = new Map();

const clientStats = {
    hitsL1: 0,
    hitsSession: 0,
    coalesced: 0,
    networkCalls: 0,
    invalidations: 0,
};

function fastHash(str) {
    let h1 = 0xdeadbeef ^ str.length;
    let h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function stripSqlCommentsAndStrings(raw) {
    const s = String(raw || '');
    let out = '';
    let i = 0;
    while (i < s.length) {
        if (s[i] === '-' && s[i + 1] === '-') {
            i += 2;
            while (i < s.length && s[i] !== '\n') i++;
            out += ' ';
            continue;
        }
        if (s[i] === '/' && s[i + 1] === '*') {
            i += 2;
            while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
            i += 2;
            out += ' ';
            continue;
        }
        if (s[i] === "'") {
            i++;
            while (i < s.length) {
                if (s[i] === "'" && s[i + 1] === "'") {
                    i += 2;
                    continue;
                }
                if (s[i] === "'") {
                    i++;
                    break;
                }
                i++;
            }
            out += " '' ";
            continue;
        }
        out += s[i];
        i++;
    }
    return out.replace(/\s+/g, ' ').trim();
}

function extractTablesClient(stripped) {
    const tables = new Set();
    if (/\b(information_schema|pg_catalog|pg_tables|to_regclass)\b/i.test(stripped)) {
        tables.add('__schema__');
    }
    const regexes = [
        /\bFROM\s+([A-Za-z0-9_."]+)/gi,
        /\bJOIN\s+([A-Za-z0-9_."]+)/gi,
        /\bINSERT\s+INTO\s+([A-Za-z0-9_."]+)/gi,
        /\bUPDATE\s+([A-Za-z0-9_."]+)/gi,
        /\bDELETE\s+FROM\s+([A-Za-z0-9_."]+)/gi,
        /\bALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+([A-Za-z0-9_."]+)/gi,
        /\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([A-Za-z0-9_."]+)/gi,
    ];
    for (const re of regexes) {
        let m;
        while ((m = re.exec(stripped)) !== null) {
            const rawTbl = String(m[1] || '').replace(/"/g, '').toLowerCase();
            const clean = rawTbl.includes('.') ? rawTbl.split('.').pop() : rawTbl;
            if (clean && clean !== 'select' && clean !== 'unnest' && clean !== 'lateral' && !clean.startsWith('(')) {
                tables.add(clean);
            }
        }
    }
    return Array.from(tables);
}

function classifyClientQuery(sqlText) {
    const stripped = stripSqlCommentsAndStrings(sqlText);
    if (!stripped) return { cacheable: false, isWrite: false, tables: [], ttlMs: 0, tier: 'none' };

    const verb = (stripped.split(' ')[0] || '').toUpperCase();
    const tables = extractTablesClient(stripped);

    if (verb === 'INSERT' || verb === 'UPDATE' || verb === 'DELETE' || verb === 'ALTER' || verb === 'CREATE') {
        return { cacheable: false, isWrite: true, tables, ttlMs: 0, tier: 'write' };
    }
    if (verb === 'WITH' && /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/i.test(stripped)) {
        return { cacheable: false, isWrite: true, tables, ttlMs: 0, tier: 'write' };
    }
    if (verb !== 'SELECT' && verb !== 'WITH') {
        return { cacheable: false, isWrite: false, tables, ttlMs: 0, tier: 'none' };
    }
    if (/\b(NEXTVAL|SETVAL|RANDOM\s*\(|FOR\s+UPDATE|RETURNING|password_hash|reset_token)\b/i.test(stripped)) {
        return { cacheable: false, isWrite: false, tables, ttlMs: 0, tier: 'none' };
    }

    const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    let ttlMs = 10_000;
    let tier = 'operational';

    if (tables.length > 0 && tables.every((t) => GEO_SCHEMA_TABLES.has(t))) {
        ttlMs = 15 * 60_000;
        tier = 'static';
    } else if (tables.length > 0 && tables.every((t) => CATALOG_TABLES.has(t) || GEO_SCHEMA_TABLES.has(t))) {
        ttlMs = 3 * 60_000;
        tier = 'catalog';
    } else if (tables.some((t) => OPERATIONAL_TABLES.has(t))) {
        // En pestaña oculta / pantalla apagada se espacia agresivamente el polling
        ttlMs = isHidden ? 60_000 : 6_000;
        tier = 'operational';
    } else if (tables.includes('usuarios')) {
        ttlMs = isHidden ? 60_000 : 15_000;
        tier = 'users';
    }

    return { cacheable: true, isWrite: false, tables, ttlMs, tier };
}

function notifySwInvalidate(tables) {
    try {
        if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'PMG_INVALIDATE_API_CACHE',
                tables: Array.isArray(tables) ? tables : [],
            });
        }
    } catch (_) {}
}

/**
 * Invalida entradas de caché SQL del cliente (por tablas específicas o completa si no se indican tablas).
 */
export function invalidateClientSqlCache(tables) {
    clientStats.invalidations += 1;
    const filterTables = Array.isArray(tables) && tables.length > 0 ? new Set(tables) : null;

    if (!filterTables) {
        clientL1.clear();
        try {
            if (typeof sessionStorage !== 'undefined') {
                for (let i = sessionStorage.length - 1; i >= 0; i--) {
                    const k = sessionStorage.key(i);
                    if (k && k.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(k);
                }
            }
        } catch (_) {}
        notifySwInvalidate([]);
        return;
    }

    for (const [k, entry] of clientL1.entries()) {
        if (entry.tables.some((t) => filterTables.has(t))) {
            clientL1.delete(k);
        }
    }

    try {
        if (typeof sessionStorage !== 'undefined') {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
                const k = sessionStorage.key(i);
                if (!k || !k.startsWith(SESSION_PREFIX)) continue;
                const raw = sessionStorage.getItem(k);
                if (!raw) continue;
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed?.tables) && parsed.tables.some((t) => filterTables.has(t))) {
                        sessionStorage.removeItem(k);
                    }
                } catch (_) {
                    sessionStorage.removeItem(k);
                }
            }
        }
    } catch (_) {}

    notifySwInvalidate(Array.from(filterTables));
}

function installFetchWriteInvalidationHookOnce() {
    if (typeof window === 'undefined' || window.__gnSqlCacheFetchHooked) return;
    window.__gnSqlCacheFetchHooked = true;

    const origFetch = window.fetch.bind(window);
    window.fetch = async function patchedFetchForCacheInvalidation(input, init) {
        const resp = await origFetch(input, init);
        try {
            const method = String(
                init?.method || (typeof input === 'object' && input?.method) || 'GET'
            ).toUpperCase();
            if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
                const urlStr = typeof input === 'string' ? input : input?.url || '';
                if (urlStr.includes('/api/') && !urlStr.includes('/api/sql/query')) {
                    if (
                        urlStr.includes('/auth/login') ||
                        urlStr.includes('/tenant/') ||
                        urlStr.includes('/attach-tenant') ||
                        urlStr.includes('/wizard')
                    ) {
                        invalidateClientSqlCache();
                    } else if (urlStr.includes('/pedidos') || urlStr.includes('/incidencias') || urlStr.includes('/corte-masivo')) {
                        invalidateClientSqlCache(['pedidos', 'incidencias', 'notificaciones_movil']);
                    } else if (urlStr.includes('/socios')) {
                        invalidateClientSqlCache(['socios_catalogo']);
                    } else if (urlStr.includes('/distribuidores') || urlStr.includes('/red-electrica')) {
                        invalidateClientSqlCache(['distribuidores']);
                    } else if (urlStr.includes('/subestaciones')) {
                        invalidateClientSqlCache(['subestaciones_catalogo']);
                    } else if (urlStr.includes('/clientes') || urlStr.includes('/config')) {
                        invalidateClientSqlCache(['clientes', 'configuracion', 'tipos_reclamo']);
                    } else if (urlStr.includes('/usuarios')) {
                        invalidateClientSqlCache(['usuarios']);
                    } else {
                        invalidateClientSqlCache(['pedidos']);
                    }
                }
            }
        } catch (_) {}
        return resp;
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Al volver a primer plano expirar lecturas operativas para refresco inmediato
                const now = Date.now();
                for (const [k, entry] of clientL1.entries()) {
                    if (entry.tier === 'operational' && entry.expiresAt > now + 1500) {
                        entry.expiresAt = now;
                    }
                }
            }
        });
    }

    window.__gnInvalidateSqlCache = invalidateClientSqlCache;
    window.__gnGetSqlClientCacheStats = () => ({
        entriesL1: clientL1.size,
        ...clientStats,
    });
}

/**
 * Envuelve cualquier función ejecutora `_sql(query)` con caché L1 + sessionStorage + Singleflight.
 */
export function wrapSqlExecutorWithClientCache(rawSqlFn, getScopeTokenFn) {
    installFetchWriteInvalidationHookOnce();

    return async function cachedSqlExecutor(q) {
        const sqlText = String(q || '').trim();
        if (!sqlText) return { rows: [], rowCount: 0 };

        const meta = classifyClientQuery(sqlText);
        if (meta.isWrite) {
            const writeRes = await rawSqlFn(sqlText);
            invalidateClientSqlCache(meta.tables.length ? meta.tables : undefined);
            return writeRes;
        }
        if (!meta.cacheable) {
            clientStats.networkCalls += 1;
            return rawSqlFn(sqlText);
        }

        const scopeTok = String((getScopeTokenFn && getScopeTokenFn()) || 'anon').slice(-24);
        const normSql = sqlText.replace(/\s+/g, ' ');
        const key = `${scopeTok}:${fastHash(normSql)}`;
        const now = Date.now();

        const mem = clientL1.get(key);
        if (mem && mem.expiresAt > now) {
            clientStats.hitsL1 += 1;
            clientL1.delete(key);
            clientL1.set(key, mem);
            return { rows: JSON.parse(mem.rowsJson), rowCount: mem.rowCount };
        }

        if (meta.tier === 'catalog' || meta.tier === 'static') {
            try {
                const rawStored = sessionStorage.getItem(SESSION_PREFIX + key);
                if (rawStored) {
                    const parsed = JSON.parse(rawStored);
                    if (parsed && parsed.expiresAt > now && typeof parsed.rowsJson === 'string') {
                        clientStats.hitsSession += 1;
                        clientL1.set(key, parsed);
                        return { rows: JSON.parse(parsed.rowsJson), rowCount: parsed.rowCount ?? 0 };
                    }
                    sessionStorage.removeItem(SESSION_PREFIX + key);
                }
            } catch (_) {}
        }

        const inflight = clientInFlight.get(key);
        if (inflight) {
            clientStats.coalesced += 1;
            const shared = await inflight;
            return { rows: JSON.parse(shared.rowsJson), rowCount: shared.rowCount };
        }

        const p = (async () => {
            clientStats.networkCalls += 1;
            const res = await rawSqlFn(sqlText);
            const rowsArr = Array.isArray(res?.rows) ? res.rows : [];
            const rowsJson = JSON.stringify(rowsArr);
            const rowCount = res?.rowCount ?? rowsArr.length;
            const record = {
                rowsJson,
                rowCount,
                expiresAt: Date.now() + meta.ttlMs,
                tables: meta.tables,
                tier: meta.tier,
            };

            if (rowsJson.length <= MAX_SESSION_ITEM_CHARS * 4) {
                while (clientL1.size >= MAX_L1_ITEMS) {
                    const oldest = clientL1.keys().next().value;
                    if (!oldest) break;
                    clientL1.delete(oldest);
                }
                clientL1.set(key, record);
            }

            if (
                (meta.tier === 'catalog' || meta.tier === 'static') &&
                rowsJson.length <= MAX_SESSION_ITEM_CHARS
            ) {
                try {
                    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(record));
                } catch (_) {}
            }

            return { rowsJson, rowCount };
        })();

        clientInFlight.set(key, p);
        try {
            const out = await p;
            return { rows: JSON.parse(out.rowsJson), rowCount: out.rowCount };
        } finally {
            clientInFlight.delete(key);
        }
    };
}

/**
 * Inicializa el gateway `/api/sql/query` contra Render con reintentos de `/health`,
 * refresh automático de JWT en 401 y envoltura de caché cliente L1/L2.
 */
export async function createApiSqlGatewayClient({
    apiBase,
    getApiToken,
    getAppUser,
    asegurarJwtApiRest,
    intentarRefrescarJwtDesdeCredencialesGuardadas,
    skipHealthCheck = false,
}) {
    const HEALTH_TIMEOUT_MS = 25000;
    const HEALTH_INTENTOS = 3;
    let healthOk = !!skipHealthCheck;
    for (let i = 0; !healthOk && i < HEALTH_INTENTOS; i++) {
        if (i > 0) {
            await new Promise((r) => setTimeout(r, 500 + i * 750));
        }
        try {
            const ctl = new AbortController();
            const timer = setTimeout(() => {
                try {
                    ctl.abort();
                } catch (_) {}
            }, HEALTH_TIMEOUT_MS);
            let resp;
            try {
                resp = await fetch(`${apiBase}/health`, { cache: 'no-store', signal: ctl.signal });
            } finally {
                clearTimeout(timer);
            }
            if (resp && resp.ok) {
                healthOk = true;
                break;
            }
        } catch (e) {
            console.warn('[api-sql] health intento', i + 1, e?.message || e);
        }
    }
    if (!healthOk) return null;

    const rawNetworkSql = async (sqlText) => {
        if (/^SELECT\s+1(\s+AS\s+[A-Za-z0-9_]+)?\s*;?\s*$/i.test(sqlText) && !getApiToken()) {
            const hr = await fetch(`${apiBase}/health`, { cache: 'no-store' });
            if (!hr.ok) throw new Error(`API HTTP ${hr.status}`);
            return { rows: [{ ok: 1 }], rowCount: 1 };
        }

        if (!getApiToken() && getAppUser && getAppUser()) {
            await asegurarJwtApiRest();
        }
        let tok = getApiToken();
        if (!tok) {
            throw new Error('401 Unauthorized — iniciá sesión para consultar el servidor');
        }

        const sendOnce = async (bearer) => {
            const ctl = new AbortController();
            const timer = setTimeout(() => {
                try {
                    ctl.abort();
                } catch (_) {}
            }, 30000);
            try {
                return await fetch(`${apiBase}/api/sql/query`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${bearer}`,
                    },
                    body: JSON.stringify({ query: sqlText }),
                    signal: ctl.signal,
                });
            } finally {
                clearTimeout(timer);
            }
        };

        let resp = await sendOnce(tok);
        if (resp.status === 401 && getAppUser && getAppUser()) {
            const refreshed = await intentarRefrescarJwtDesdeCredencialesGuardadas();
            tok = getApiToken();
            if (refreshed && tok) {
                resp = await sendOnce(tok);
            }
        }

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            throw new Error(data?.details || data?.error || `HTTP ${resp.status}`);
        }
        return {
            rows: Array.isArray(data?.rows) ? data.rows : [],
            rowCount: data?.rowCount ?? 0,
        };
    };

    return wrapSqlExecutorWithClientCache(rawNetworkSql, () => {
        const u = getAppUser ? getAppUser() : null;
        return `${getApiToken() || ''}:${u?.tenant_id ?? u?.tid ?? ''}:${u?.id ?? ''}`;
    });
}
