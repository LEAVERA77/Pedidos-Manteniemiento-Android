/**
 * Checklist de configuración inicial del tenant (admin).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { pedidosTableHasTenantIdColumn, usuariosTenantColumnName } from "../utils/tenantScope.js";

async function tableExists(name) {
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [name]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * @param {import('express').Request} req
 */
export async function buildAdminSetupChecklist(req) {
  const tid = Number(req.tenantId);
  const items = [];

  const rCliente = await query(
    `SELECT nombre, configuracion FROM clientes WHERE id = $1 LIMIT 1`,
    [tid]
  );
  const cliente = rCliente.rows?.[0];
  let cfg = {};
  try {
    cfg =
      typeof cliente?.configuracion === "string"
        ? JSON.parse(cliente.configuracion)
        : cliente?.configuracion || {};
  } catch (_) {}
  items.push({
    id: "empresa_nombre",
    ok: !!(cliente?.nombre && String(cliente.nombre).trim()),
    label: "Nombre de empresa configurado",
  });
  items.push({
    id: "setup_completado",
    ok: cfg.setup_completado === true || cfg.setup_completed === true,
    label: "Asistente inicial completado",
  });

  if (await tableExists("usuarios")) {
    const colU = await usuariosTenantColumnName();
    const rTec = colU
      ? await query(
          `SELECT COUNT(*)::int AS n FROM usuarios WHERE activo = TRUE AND LOWER(rol) IN ('tecnico','supervisor') AND ${colU} = $1`,
          [tid]
        )
      : await query(
          `SELECT COUNT(*)::int AS n FROM usuarios WHERE activo = TRUE AND LOWER(rol) IN ('tecnico','supervisor')`
        );
    const nTec = rTec.rows?.[0]?.n ?? 0;
    items.push({
      id: "tecnicos",
      ok: nTec > 0,
      label: `Cuadrilla/técnicos activos (${nTec})`,
    });
  }

  if (await pedidosTableHasTenantIdColumn()) {
    const rPed = await query(`SELECT COUNT(*)::int AS n FROM pedidos WHERE tenant_id = $1`, [tid]);
    items.push({
      id: "pedidos",
      ok: (rPed.rows?.[0]?.n ?? 0) > 0,
      label: "Al menos un pedido registrado",
    });
  }

  if (await tableExists("tenant_geocerca_settings")) {
    const rG = await query(
      `SELECT habilitada FROM tenant_geocerca_settings WHERE tenant_id = $1 LIMIT 1`,
      [tid]
    );
    items.push({
      id: "geocerca",
      ok: !!rG.rows?.[0],
      label: "Geocerca configurada",
    });
  }

  const done = items.filter((i) => i.ok).length;
  return {
    items,
    resumen: { total: items.length, completados: done, porcentaje: items.length ? Math.round((done / items.length) * 100) : 0 },
  };
}
