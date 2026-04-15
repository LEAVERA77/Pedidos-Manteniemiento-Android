import { withTransaction, query } from "../db/neon.js";
import { usuariosTenantColumnName, tableHasColumn } from "../utils/tenantScope.js";

/** Columnas en `pedidos` que apuntan a `usuarios(id)` (FK puede ser RESTRICT / sin ON DELETE). */
const PEDIDOS_USUARIO_FK_COLS = [
  "usuario_inicio_id",
  "usuario_cierre_id",
  "usuario_avance_id",
  "usuario_creador_id",
  "usuario_id",
  "tecnico_asignado_id",
  "asignado_por_id",
  "usuario_derivacion_id",
  "solicitud_derivacion_usuario_id",
];

const ROLE_NON_ADMIN_SQL = `LOWER(TRIM(COALESCE(rol, ''))) NOT IN ('admin', 'administrador')`;

/**
 * Quita referencias desde otras tablas hacia los usuarios no-admin que se van a borrar,
 * para no violar FKs al hacer DELETE en `usuarios` (p. ej. pedidos_usuario_inicio_id_fkey).
 */
async function clearForeignRefsToUsersMarkedForPurge(client, uCol, tid) {
  const hasUcol = !!uCol;
  const params = hasUcol ? [tid] : [];
  const doomedSubquery = hasUcol
    ? `SELECT id FROM usuarios WHERE ${uCol} = $1 AND ${ROLE_NON_ADMIN_SQL}`
    : `SELECT id FROM usuarios WHERE ${ROLE_NON_ADMIN_SQL}`;

  for (const col of PEDIDOS_USUARIO_FK_COLS) {
    if (!(await tableHasColumn("pedidos", col))) continue;
    await client.query(`UPDATE pedidos SET ${col} = NULL WHERE ${col} IN (${doomedSubquery})`, params);
  }

  if (await tableHasColumn("ubicaciones_usuarios", "usuario_id")) {
    await client.query(`DELETE FROM ubicaciones_usuarios WHERE usuario_id IN (${doomedSubquery})`, params);
  }

  if (await tableHasColumn("kpi_snapshots", "created_by_usuario_id")) {
    await client.query(
      `UPDATE kpi_snapshots SET created_by_usuario_id = NULL WHERE created_by_usuario_id IN (${doomedSubquery})`,
      params
    );
  }

  if (await tableHasColumn("clientes_afectados_log", "usuario_id")) {
    await client.query(
      `UPDATE clientes_afectados_log SET usuario_id = NULL WHERE usuario_id IN (${doomedSubquery})`,
      params
    );
  }
}

/**
 * Borra catálogo de socios del tenant y usuarios no admin (transacción).
 * Exige socios_catalogo.tenant_id si hay más de un cliente (multitenant).
 */
export async function purgeSociosCatalogoAndNonAdminUsersForTenant(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    throw new Error("tenant_id inválido para purge de rubro");
  }

  const hasSocTenant = await tableHasColumn("socios_catalogo", "tenant_id");
  const tenantsCount = await query(`SELECT COUNT(*)::int AS c FROM clientes`);
  const nTenants = Number(tenantsCount.rows?.[0]?.c) || 0;

  if (!hasSocTenant && nTenants > 1) {
    throw new Error(
      "socios_catalogo no tiene tenant_id: no se puede vaciar el catálogo de forma segura en multitenant. Ejecutá la migración de tenant_id en socios_catalogo."
    );
  }

  const uCol = await usuariosTenantColumnName();
  if (!uCol && nTenants > 1) {
    throw new Error(
      "usuarios sin tenant_id/cliente_id: no se pueden borrar usuarios de forma segura en multitenant."
    );
  }

  await withTransaction(async (client) => {
    await clearForeignRefsToUsersMarkedForPurge(client, uCol, tid);

    if (hasSocTenant) {
      await client.query(`DELETE FROM socios_catalogo WHERE tenant_id = $1`, [tid]);
    } else {
      await client.query(`DELETE FROM socios_catalogo`);
    }

    if (uCol) {
      await client.query(
        `DELETE FROM usuarios
         WHERE ${uCol} = $1
           AND ${ROLE_NON_ADMIN_SQL}`,
        [tid]
      );
    } else {
      await client.query(
        `DELETE FROM usuarios
         WHERE ${ROLE_NON_ADMIN_SQL}`
      );
    }
  });
}
