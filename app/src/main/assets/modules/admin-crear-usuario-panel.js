/**
 * Alta de usuario desde el panel admin: API (bcrypt) si hay JWT + base URL; si no, Neon SQL.
 * Incluye business_type para técnicos/supervisores (CHECK chk_usuarios_business_type_role en Neon).
 * made by leavera77
 */
import { normalizarTelefonoWhatsapp, esTelefonoWhatsappValido } from './normalizar-telefono.js';

const NEON_COL_WHITELIST = new Set(['business_type', 'telefono_whatsapp']);

async function neonUsuariosTieneColumna(sqlSimple, esc, colName) {
    if (!NEON_COL_WHITELIST.has(colName)) return false;
    try {
        const r = await sqlSimple(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = ${esc(
                colName
            )} LIMIT 1`
        );
        return !!(r.rows && r.rows.length);
    } catch {
        return false;
    }
}

function inferirLineaNegocioUsuarioDesdeEmpresaCfg() {
    const bt = String((typeof window !== 'undefined' && window.EMPRESA_CFG?.active_business_type) || '')
        .trim()
        .toLowerCase();
    if (bt === 'electricidad' || bt === 'agua' || bt === 'municipio') return bt;
    const tipo = String((typeof window !== 'undefined' && window.EMPRESA_CFG?.tipo) || '')
        .trim()
        .toLowerCase();
    if (tipo.includes('agua') || tipo === 'cooperativa_agua') return 'agua';
    if (tipo.includes('municipio')) return 'municipio';
    return 'electricidad';
}

/**
 * @param {{
 *   toast: (msg: string, tipo?: string) => void;
 *   toastError: (tag: string, err: unknown, prefijo?: string) => void;
 *   sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>;
 *   esc: (v: unknown) => string;
 *   sqlFiltroUsuariosPorTenant: () => Promise<string>;
 *   tenantIdActual: () => number;
 *   getApiToken: () => string | null | undefined;
 *   apiUrl: () => string;
 *   asegurarJwtApiRest?: () => Promise<boolean>;
 *   cargarListaUsuarios: () => Promise<void> | void;
 *   refrescarUsuariosCacheDesdeNeon: () => Promise<void>;
 * }} d
 */
export async function ejecutarCrearUsuarioAdminPanel(d) {
    const usuarioLogin = document.getElementById('nu-email')?.value?.trim() || '';
    const nombre = document.getElementById('nu-nombre')?.value?.trim() || '';
    const pw = document.getElementById('nu-pw')?.value?.trim() || '';
    const rol = document.getElementById('nu-rol')?.value || '';
    const telefono = normalizarTelefonoWhatsapp(document.getElementById('nu-telefono')?.value || '');
    if (!usuarioLogin || !nombre || !pw) {
        d.toast('Completá todos los campos', 'error');
        return;
    }
    if (telefono && !esTelefonoWhatsappValido(telefono)) {
        d.toast('Teléfono inválido. Usá formato +543434540250', 'error');
        return;
    }

    try {
        await d.asegurarJwtApiRest?.();
    } catch (_) {}
    const tok = d.getApiToken?.();
    const baseRaw = d.apiUrl?.() || '';
    const apiBase = String(baseRaw).replace(/\/+$/, '');
    if (tok && apiBase) {
        try {
            const tidPanel = Number(d.tenantIdActual?.());
            const body = {
                usuario: usuarioLogin,
                nombre,
                password: pw,
                rol,
                telefono: telefono || undefined,
            };
            if (Number.isFinite(tidPanel) && tidPanel > 0) body.tenant_id = tidPanel;
            d.toast('Creando usuario…', 'info', 2800);
            const ac = new AbortController();
            const tmo = setTimeout(() => {
                try {
                    ac.abort();
                } catch (_) {}
            }, 45000);
            let r;
            try {
                r = await fetch(`${apiBase}/api/usuarios`, {
                    method: 'POST',
                    signal: ac.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${tok}`,
                    },
                    body: JSON.stringify(body),
                });
            } finally {
                clearTimeout(tmo);
            }
            const rawText = await r.text().catch(() => '');
            let j = {};
            try {
                j = rawText ? JSON.parse(rawText) : {};
            } catch (_) {
                j = { error: rawText ? rawText.slice(0, 280) : `HTTP ${r.status}` };
            }
            if (!r.ok) {
                const piece = (v) => {
                    if (v == null) return '';
                    if (typeof v === 'string') return v;
                    try {
                        return JSON.stringify(v).slice(0, 400);
                    } catch (_) {
                        return String(v);
                    }
                };
                const msg = piece(j.detail) || piece(j.error) || piece(j.message) || rawText.slice(0, 280) || `Error ${r.status}`;
                const low = String(msg).toLowerCase();
                if (r.status === 409 || low.includes('unique') || low.includes('duplicate')) {
                    d.toast('Ese nombre de usuario ya está registrado.', 'error');
                    return;
                }
                if (r.status === 401 || r.status === 403) {
                    d.toast('Sesión API: revisá permisos o volvé a iniciar sesión.', 'error');
                    return;
                }
                if (r.status === 400) {
                    d.toast(String(msg).trim() || 'Datos inválidos para crear el usuario.', 'error');
                    return;
                }
                d.toastError('crear-usuario-api', new Error(String(msg).trim() || `HTTP ${r.status}`));
                return;
            }
            d.toast('Usuario creado: ' + nombre, 'success');
            document.getElementById('form-usuario').style.display = 'none';
            ['nu-email', 'nu-nombre', 'nu-pw', 'nu-telefono'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await d.cargarListaUsuarios();
            try {
                await d.refrescarUsuariosCacheDesdeNeon();
            } catch (_) {}
        } catch (e) {
            const m = String(e && e.name === 'AbortError' ? 'timeout' : e && e.message ? e.message : e).toLowerCase();
            if (m.includes('abort') || m.includes('timeout')) {
                d.toast('La creación tardó demasiado o se canceló. Comprobá la API y volvé a intentar.', 'error');
            } else {
                d.toastError('crear-usuario-api', e);
            }
        }
        return;
    }

    try {
        d.toast('Guardando usuario…', 'info', 2800);
        const wfU = await d.sqlFiltroUsuariosPorTenant();
        const colT = wfU.includes('tenant_id') ? 'tenant_id' : wfU.includes('cliente_id') ? 'cliente_id' : null;
        const hasBt = await neonUsuariosTieneColumna(d.sqlSimple, d.esc, 'business_type');
        const hasTw = await neonUsuariosTieneColumna(d.sqlSimple, d.esc, 'telefono_whatsapp');
        const rl = String(rol || '').toLowerCase();
        const esAdminRol = rl === 'admin' || rl === 'administrador';
        const btSql = hasBt && !esAdminRol ? `, business_type` : hasBt && esAdminRol ? `, business_type` : '';
        const btValSql =
            hasBt && !esAdminRol ? `, ${d.esc(inferirLineaNegocioUsuarioDesdeEmpresaCfg())}` : hasBt && esAdminRol ? `, NULL` : '';
        const twSql = hasTw ? `, telefono_whatsapp` : '';
        const twValSql = hasTw ? `, ${d.esc(telefono || null)}` : '';

        if (colT) {
            await d.sqlSimple(`INSERT INTO usuarios(email, nombre, password_hash, rol, telefono, whatsapp_notificaciones, must_change_password, activo${btSql}${twSql}, ${colT})
                VALUES(${d.esc(usuarioLogin)}, ${d.esc(nombre)}, ${d.esc(pw)}, ${d.esc(rol)}, ${d.esc(telefono || null)}, TRUE, FALSE, TRUE${btValSql}${twValSql}, ${d.esc(
                    d.tenantIdActual()
                )})`);
        } else {
            await d.sqlSimple(`INSERT INTO usuarios(email, nombre, password_hash, rol, telefono, whatsapp_notificaciones, must_change_password, activo${btSql}${twSql})
                VALUES(${d.esc(usuarioLogin)}, ${d.esc(nombre)}, ${d.esc(pw)}, ${d.esc(rol)}, ${d.esc(telefono || null)}, TRUE, FALSE, TRUE${btValSql}${twValSql})`);
        }
        d.toast('Usuario creado: ' + nombre, 'success');
        document.getElementById('form-usuario').style.display = 'none';
        ['nu-email', 'nu-nombre', 'nu-pw', 'nu-telefono'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        await d.cargarListaUsuarios();
        try {
            await d.refrescarUsuariosCacheDesdeNeon();
        } catch (_) {}
    } catch (e) {
        const low = String(e && e.message ? e.message : e).toLowerCase();
        if (low.includes('unique') || low.includes('duplicate')) d.toast('Ese nombre de usuario ya está registrado.', 'error');
        else d.toastError('crear-usuario', e);
    }
}
