import { withTransaction, query } from "../db/neon.js";
import { usuariosTenantColumnName, tableHasColumn } from "../utils/tenantScope.js";

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
    if (hasSocTenant) {
      await client.query(`DELETE FROM socios_catalogo WHERE tenant_id = $1`, [tid]);
    } else {
      await client.query(`DELETE FROM socios_catalogo`);
    }

    if (uCol) {
      await client.query(
        `DELETE FROM usuarios
         WHERE ${uCol} = $1
           AND LOWER(TRIM(COALESCE(rol, ''))) NOT IN ('admin', 'administrador')`,
        [tid]
      );
    } else {
      await client.query(
        `DELETE FROM usuarios
         WHERE LOWER(TRIM(COALESCE(rol, ''))) NOT IN ('admin', 'administrador')`
      );
    }
  });
}
