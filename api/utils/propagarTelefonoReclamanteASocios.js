/**
 * Si el reclamo trae un móvil válido y el catálogo tiene la misma cuenta (NIS/medidor) pero sin teléfono,
 * copia el número **canonico** (549…) a `socios_catalogo.telefono`. No pisa datos ya cargados.
 */
import { query } from "../db/neon.js";
import {
  digitsOnly,
  normalizeArgentinaMobileWhatsappDigits,
} from "./argentinaMobilePhone.js";

export async function getTenantWhatsappArDefaultAreaDigits(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return "";
  try {
    const r = await query(
      `SELECT configuracion->>'whatsapp_ar_default_area' AS wa,
              configuracion->>'ar_default_area' AS ar
       FROM clientes WHERE id = $1`,
      [tid]
    );
    const row = r.rows?.[0];
    const raw = row?.wa || row?.ar || "";
    return digitsOnly(String(raw)).slice(0, 4);
  } catch {
    return "";
  }
}

/**
 * @param {Record<string, unknown>} pedido fila pedidos (telefono_contacto, nis, medidor, nis_medidor)
 * @param {number} tenantId
 * @returns {Promise<{ updated: number, reason?: string }>}
 */
export async function propagarTelefonoReclamanteASociosCatalogoIfEmpty(pedido, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return { updated: 0, reason: "bad_tenant" };

  const defaultArea = await getTenantWhatsappArDefaultAreaDigits(tid);
  const canon = normalizeArgentinaMobileWhatsappDigits(pedido?.telefono_contacto, {
    defaultAreaDigits: defaultArea,
  });
  if (!canon) return { updated: 0, reason: "not_mobile" };

  const nis = String(pedido?.nis || "").trim();
  const med = String(pedido?.medidor || "").trim();
  const nm = String(pedido?.nis_medidor || "").trim();
  if (!nm && !nis && !med) return { updated: 0, reason: "no_supply_keys" };

  try {
    const tc = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'socios_catalogo' AND column_name = 'tenant_id' LIMIT 1`
    );
    const hasTenant = !!tc.rows?.length;
    if (!hasTenant) return { updated: 0, reason: "no_tenant_col_socios" };

    const cr = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'socios_catalogo'`
    );
    const cset = new Set((cr.rows || []).map((x) => x.column_name));

    const parts = [`tenant_id = $1`];
    const params = [tid];
    let i = 2;
    const ors = [];
    if (nm && cset.has("nis_medidor")) {
      ors.push(`UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM($${i++}))`);
      params.push(nm);
    }
    if (nis && cset.has("nis")) {
      ors.push(`UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM($${i++}))`);
      params.push(nis);
    }
    if (med && cset.has("medidor")) {
      ors.push(`UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM($${i++}))`);
      params.push(med);
    }
    if (!ors.length) return { updated: 0, reason: "no_socios_match_columns" };
    const sql = `SELECT id, telefono FROM socios_catalogo WHERE (${ors.join(" OR ")})
      AND ${parts[0]}
      AND (telefono IS NULL OR TRIM(telefono::text) = '')
      AND COALESCE(activo, TRUE)
      ORDER BY id
      LIMIT 1`;
    const r = await query(sql, params);
    const row = r.rows?.[0];
    if (!row) return { updated: 0, reason: "no_empty_socios_row" };

    await query(`UPDATE socios_catalogo SET telefono = $1 WHERE id = $2`, [canon, row.id]);
    return { updated: 1 };
  } catch (e) {
    console.warn("[propagarTelefonoReclamanteASocios]", e?.message || e);
    return { updated: 0, reason: "error" };
  }
}
