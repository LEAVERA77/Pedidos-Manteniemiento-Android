import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";

let _hasTenantCol = null;

async function pedidoContadorHasTenantId() {
  if (_hasTenantCol == null) {
    _hasTenantCol = await tableHasColumn("pedido_contador", "tenant_id");
  }
  return _hasTenantCol;
}

/**
 * Reserva el siguiente `numero_pedido` visible (formato AÑO-NNNN, sin prefijo PM-).
 * Compatible con esquema legacy (solo `anio` PK global) hasta aplicar migración `pedido_contador_tenant_id.sql`.
 * @param {number} tenantId
 * @returns {Promise<string>}
 */
export async function allocarSiguienteNumeroPedido(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    throw new Error("tenant_invalid");
  }

  if (await pedidoContadorHasTenantId()) {
    await query(
      `INSERT INTO pedido_contador(tenant_id, anio, ultimo_numero)
       VALUES ($1, EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0)
       ON CONFLICT (tenant_id, anio) DO NOTHING`,
      [tid]
    );
    const rCont = await query(
      `UPDATE pedido_contador
       SET ultimo_numero = ultimo_numero + 1
       WHERE tenant_id = $1 AND anio = EXTRACT(YEAR FROM CURRENT_DATE)::INT
       RETURNING anio, ultimo_numero`,
      [tid]
    );
    const row = rCont.rows?.[0];
    if (!row) throw new Error("contador_pedido");
    return `${row.anio}-${String(row.ultimo_numero).padStart(4, "0")}`;
  }

  await query(
    `INSERT INTO pedido_contador(anio, ultimo_numero)
     VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0)
     ON CONFLICT (anio) DO NOTHING`
  );
  const rCont = await query(
    `UPDATE pedido_contador
     SET ultimo_numero = ultimo_numero + 1
     WHERE anio = EXTRACT(YEAR FROM CURRENT_DATE)::INT
     RETURNING anio, ultimo_numero`
  );
  const row = rCont.rows?.[0];
  if (!row) throw new Error("contador_pedido");
  return `${row.anio}-${String(row.ultimo_numero).padStart(4, "0")}`;
}
