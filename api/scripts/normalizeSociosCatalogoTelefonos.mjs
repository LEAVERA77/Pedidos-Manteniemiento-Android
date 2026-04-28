/**
 * Normaliza `socios_catalogo.telefono` a móvil AR 549… cuando el valor es reconocible como celular.
 * Omite fijos y valores ambiguos (no pisa con datos inferidos dudosos).
 *
 * Uso (desde carpeta api):
 *   node scripts/normalizeSociosCatalogoTelefonos.mjs --tenant-id=1 [--dry-run]
 *   node scripts/normalizeSociosCatalogoTelefonos.mjs --tenant-id=1 --apply
 *
 * Usa `clientes.configuracion`: mapa por localidad, prefijos y respaldo
 * (`whatsapp_ar_areas_por_localidad`, `whatsapp_ar_area_prefixes`, `whatsapp_ar_default_area`).
 *
 * made by leavera77
 */
import "dotenv/config";
import { query } from "../db/neon.js";
import { digitsOnly } from "../utils/argentinaMobilePhone.js";
import {
  getTenantConfiguracionForWhatsappAreas,
  normalizeArgentinaMobileWithTenantAreaConfig,
} from "../utils/whatsappArAreaConfig.js";

function parseArgs() {
  const out = { tenantId: null, dryRun: true, limit: 50000 };
  for (const a of process.argv.slice(2)) {
    if (a === "--apply") out.dryRun = false;
    if (a === "--dry-run") out.dryRun = true;
    if (a.startsWith("--tenant-id=")) out.tenantId = Number(a.split("=")[1]);
    if (a.startsWith("--limit=")) out.limit = Math.max(1, Number(a.split("=")[1]) || 50000);
  }
  return out;
}

async function main() {
  const { tenantId, dryRun, limit } = parseArgs();
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    console.error("Requerido: --tenant-id=N");
    process.exit(1);
  }

  const cfg = await getTenantConfiguracionForWhatsappAreas(tenantId);
  console.log(JSON.stringify({ tenantId, dryRun, limit, configKeys: Object.keys(cfg).filter((k) => k.startsWith("whatsapp_ar_")) }, null, 0));

  const cr = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'socios_catalogo'`
  );
  const cset = new Set((cr.rows || []).map((x) => x.column_name));
  const hasLoc = cset.has("localidad");
  const r = await query(
    hasLoc
      ? `SELECT id, telefono, NULLIF(TRIM(COALESCE(localidad::text, '')), '') AS loc
         FROM socios_catalogo
         WHERE tenant_id = $1
           AND telefono IS NOT NULL
           AND TRIM(telefono::text) <> ''
         ORDER BY id
         LIMIT $2`
      : `SELECT id, telefono, NULL::text AS loc
         FROM socios_catalogo
         WHERE tenant_id = $1
           AND telefono IS NOT NULL
           AND TRIM(telefono::text) <> ''
         ORDER BY id
         LIMIT $2`,
    [tenantId, limit]
  );

  let updated = 0;
  let skipped = 0;
  for (const row of r.rows || []) {
    const raw = row.telefono;
    const canon = normalizeArgentinaMobileWithTenantAreaConfig(raw, cfg, row.loc);
    if (!canon) {
      skipped += 1;
      continue;
    }
    const prev = digitsOnly(raw);
    if (prev === canon) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] id=${row.id} ${prev} -> ${canon}`);
      updated += 1;
      continue;
    }
    await query(`UPDATE socios_catalogo SET telefono = $1 WHERE id = $2`, [canon, row.id]);
    updated += 1;
  }
  console.log(JSON.stringify({ filas: (r.rows || []).length, updated, skipped, dryRun }, null, 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
