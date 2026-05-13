/**
 * Marca la fecha de activación Whapi de un tenant (inicio del warm-up en BD).
 *
 * Uso:
 *   node api/scripts/init-whapi-number.js <clientes.id>
 *   node api/scripts/init-whapi-number.js 3 2026-01-15T12:00:00Z
 *
 * Requiere DB_CONNECTION / DATABASE_URL en el entorno (igual que la API).
 * made by leavera77
 */
import { query } from "../db/neon.js";

const tenantId = Number(process.argv[2]);
const fechaIso = process.argv[3];

async function main() {
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    console.error("Uso: node api/scripts/init-whapi-number.js <tenant_id> [fecha_iso_opcional]");
    process.exit(1);
  }
  const when = fechaIso ? new Date(fechaIso) : new Date();
  if (Number.isNaN(when.getTime())) {
    console.error("Fecha ISO inválida:", fechaIso);
    process.exit(1);
  }
  const r = await query(
    `UPDATE clientes
     SET whapi_activated_at = $2::timestamptz,
         whapi_warmup_status = 'warming'
     WHERE id = $1
     RETURNING id`,
    [tenantId, when.toISOString()]
  );
  const row = r.rows?.[0];
  if (!row) {
    console.error("No existe clientes.id =", tenantId);
    process.exit(2);
  }
  console.log("OK tenant", row.id, "whapi_activated_at =", when.toISOString());
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
