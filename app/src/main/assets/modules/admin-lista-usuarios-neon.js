/**
 * Panel Admin → Usuarios: lista global (todos los tenants) vía Neon.
 * made by leavera77
 */
import { resolveUsuariosTenantColumnName } from './tenantNeonUsuario.js';
import { logErrorWeb, escHtmlPrint, mensajeErrorUsuario } from './ui-utils.js';

function escJs(v) {
    return `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * @param {{ sqlSimple: (q: string) => Promise<{ rows?: unknown[] }>; neonOk: boolean; modoOffline: boolean }} d
 */
export async function cargarListaUsuariosTodosTenantsNeon(d) {
    const sqlSimple = d.sqlSimple;
    try {
        await sqlSimple('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE');
        await sqlSimple('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token TEXT');
        await sqlSimple('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_expiry TIMESTAMPTZ');
        await sqlSimple('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(20)');
        await sqlSimple('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS whatsapp_notificaciones BOOLEAN DEFAULT TRUE');
        await sqlSimple(
            'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE'
        );
        await sqlSimple('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono_whatsapp VARCHAR(32)');
    } catch (_) {}

    const cont = document.getElementById('lista-usuarios-admin');
    if (!cont) return;
    cont.innerHTML = '<div class="ll2"><i class="fas fa-circle-notch fa-spin"></i></div>';
    try {
        const col = await resolveUsuariosTenantColumnName({
            sqlSimple,
            neonOk: d.neonOk,
            modoOffline: d.modoOffline,
        });
        let r;
        if (col === 'tenant_id' || col === 'cliente_id') {
            r = await sqlSimple(
                `SELECT u.id, u.email, u.nombre, u.rol,
                    COALESCE(u.activo, true) AS activo,
                    u.telefono, u.telefono_whatsapp,
                    COALESCE(u.whatsapp_notificaciones, true) AS whatsapp_notificaciones,
                    u.${col}::int AS _u_tenant_id,
                    COALESCE(c.nombre, '') AS _u_tenant_nom
                 FROM usuarios u
                 LEFT JOIN clientes c ON c.id = u.${col}
                 ORDER BY u.id`
            );
        } else {
            r = await sqlSimple(`SELECT id, email, nombre, rol,
                COALESCE(activo, true) AS activo,
                telefono, telefono_whatsapp,
                COALESCE(whatsapp_notificaciones, true) AS whatsapp_notificaciones
                FROM usuarios ORDER BY id`);
        }
        const rows = r.rows || [];
        if (!rows.length) {
            cont.innerHTML = '<p style="color:var(--tl);font-size:.85rem;padding:.5rem">Sin usuarios</p>';
            return;
        }
        const thTenant = col ? '<th>Tenant</th>' : '';
        cont.innerHTML = `<table class="admin-table">
            <thead><tr><th>ID</th>${thTenant}<th>Usuario</th><th>Nombre</th><th>WhatsApp</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${rows
                .map((u) => {
                    const tid = u._u_tenant_id != null ? String(u._u_tenant_id) : '';
                    const tnom = String(u._u_tenant_nom || '').trim();
                    const tenantCell =
                        col &&
                        `<td style="font-size:.76rem;color:var(--tm);max-width:9rem;word-break:break-word">${escHtmlPrint(
                            tnom || '—'
                        )}<div style="font-size:.68rem;color:var(--tl)">${tid ? `id ${escHtmlPrint(tid)}` : ''}</div></td>`;
                    return `<tr>
                <td style="color:var(--tl)">${escHtmlPrint(String(u.id))}</td>
                ${tenantCell || ''}
                <td><b>${escHtmlPrint(String(u.email || ''))}</b></td>
                <td>${escHtmlPrint(String(u.nombre || ''))}</td>
                <td>
                    <div style="font-size:.8rem">${u.telefono_whatsapp || u.telefono ? escHtmlPrint(String(u.telefono_whatsapp || u.telefono)) : '<span style="color:var(--tl)">Sin cargar</span>'}</div>
                    <div style="font-size:.74rem;color:${u.whatsapp_notificaciones ? '#166534' : '#b45309'}">${u.whatsapp_notificaciones ? 'Notificaciones ON' : 'Notificaciones OFF'}</div>
                </td>
                <td><span style="background:var(--bg);padding:.15rem .5rem;border-radius:.3rem;font-size:.78rem;font-weight:600">${escHtmlPrint(String(u.rol || ''))}</span></td>
                <td><span style="color:${u.activo ? '#166534' : '#dc2626'};font-weight:600">${u.activo ? '✓ Activo' : '✗ Inactivo'}</span></td>
                <td style="display:flex;gap:.3rem;flex-wrap:wrap">
                    <button class="btn-sm" onclick="editarTelefonoWhatsappUsuario(${u.id}, ${escJs(u.telefono_whatsapp || '')}, ${escJs(u.telefono || '')}, ${u.whatsapp_notificaciones ? 'true' : 'false'})" style="background:#ecfeff;border:1px solid #a5f3fc;color:#0f766e">WhatsApp</button>
                    ${['tecnico', 'supervisor'].includes(String(u.rol || '').toLowerCase()) ? `<button type="button" class="btn-sm" style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e" onclick="adminGenerarClaveProvisionalUsuario(${u.id})" title="Solo el admin puede recuperar la clave del técnico; en Android le pedirá cambiarla al ingresar">Clave provisoria</button>` : ''}
                    <button class="btn-sm warning" onclick="toggleUsuario(${u.id}, ${!u.activo})">${u.activo ? 'Desactivar' : 'Activar'}</button>
                    ${String(u.email || '').toLowerCase() !== 'admin' ? `<button class="btn-sm danger" onclick="eliminarUsuario(${u.id})">Eliminar</button>` : ''}
                </td>
            </tr>`;
                })
                .join('')}</tbody>
        </table>`;
    } catch (e) {
        logErrorWeb('lista-usuarios-admin', e);
        cont.innerHTML = '<p style="color:var(--re)">' + escHtmlPrint(mensajeErrorUsuario(e)) + '</p>';
    }
}
