/**
 * Al guardar coordenadas manuales del pedido (admin), opcionalmente actualiza lat/lon
 * del socio en `socios_catalogo` si hay coincidencia única por NIS (mismo tenant).
 *
 * Convención de match (en orden):
 * 1) `pedidos.nis_medidor` unificado ↔ `socios_catalogo.nis_medidor` (TRIM, UPPER)
 * 2) Par `pedidos.nis` + `pedidos.medidor` ↔ columnas `nis` y `medidor` del catálogo
 * 3) Si solo hay `nis`+`medidor` en pedido pero no `nis_medidor`, también se prueba
 *    la clave compuesta como texto en `nis_medidor` (ej. "700-123").
 *
 * Si hay 0 filas: no hace nada (info). Si hay >1 fila en el tenant: no actualiza (ambigüedad).
 * Sin `tenant_id` en socios_catalogo: se omite filtro tenant (legacy) y se loguea advertencia.
 *
 * made by leavera77
 */

import { query } from "../db/neon.js";

let _colsCache = null;
async function columnasSociosCatalogo() {
  if (_colsCache) return _colsCache;
  const r = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'socios_catalogo'`
  );
  _colsCache = new Set((r.rows || []).map((c) => c.column_name));
  return _colsCache;
}

async function tablaExiste(nombre) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [nombre]
  );
  return !!(r.rows && r.rows.length);
}

function pickLatLngColumns(cols) {
  if (cols.has("latitud") && cols.has("longitud")) return { la: "latitud", ln: "longitud" };
  if (cols.has("lat") && cols.has("lng")) return { la: "lat", ln: "lng" };
  return null;
}

/**
 * @param {{ pedido: object, lat: number, lng: number, tenantId: number }} opts
 * @returns {Promise<{ ok: boolean, reason?: string, sociosId?: number }>}
 */
export async function actualizarSociosCatalogoCoordsSiMatchPedido(opts) {
  const pedido = opts.pedido;
  const la = Number(opts.lat);
  const ln = Number(opts.lng);
  const tenantId = Number(opts.tenantId);
  if (!pedido || !Number.isFinite(la) || !Number.isFinite(ln)) {
    return { ok: false, reason: "parametros" };
  }

  try {
    if (!(await tablaExiste("socios_catalogo"))) {
      return { ok: false, reason: "sin_tabla" };
    }

    const cols = await columnasSociosCatalogo();
    const latLng = pickLatLngColumns(cols);
    if (!latLng) {
      console.info("[coords-manual→socios_catalogo] sin columnas lat/lng en socios_catalogo; omitido");
      return { ok: false, reason: "sin_columnas_latlng" };
    }

    const hasTenant = cols.has("tenant_id");
    const hasNm = cols.has("nis_medidor");
    const hasNis = cols.has("nis");
    const hasMed = cols.has("medidor");

    const nmRaw = pedido.nis_medidor != null ? String(pedido.nis_medidor).trim() : "";
    const nisP = pedido.nis != null ? String(pedido.nis).trim() : "";
    const medP = pedido.medidor != null ? String(pedido.medidor).trim() : "";

    /** @type {{ sql: string, params: any[] } | null} */
    let findSql = null;

    if (hasNm && nmRaw) {
      const params = [];
      let t = "";
      if (hasTenant && Number.isFinite(tenantId)) {
        params.push(tenantId);
        t = ` AND tenant_id = $${params.length}`;
      } else if (hasTenant) {
        console.warn("[coords-manual→socios_catalogo] socios_catalogo.tenant_id existe pero tenantId inválido; match sin filtro tenant");
      }
      params.push(nmRaw);
      const iNm = params.length;
      findSql = {
        sql: `SELECT id FROM socios_catalogo WHERE COALESCE(activo, TRUE) = TRUE${t}
          AND UPPER(TRIM(COALESCE(nis_medidor::text,''))) = UPPER(TRIM($${iNm}))
          ORDER BY id ASC LIMIT 3`,
        params,
      };
    } else if (hasNis && hasMed && nisP && medP) {
      const params = [];
      let t = "";
      if (hasTenant && Number.isFinite(tenantId)) {
        params.push(tenantId);
        t = ` AND tenant_id = $${params.length}`;
      } else if (hasTenant) {
        console.warn("[coords-manual→socios_catalogo] socios_catalogo.tenant_id existe pero tenantId inválido; match sin filtro tenant");
      }
      params.push(nisP, medP);
      const iMed = params.length;
      const iNis = params.length - 1;
      findSql = {
        sql: `SELECT id FROM socios_catalogo WHERE COALESCE(activo, TRUE) = TRUE${t}
          AND TRIM(COALESCE(nis::text,'')) = TRIM($${iNis})
          AND TRIM(COALESCE(medidor::text,'')) = TRIM($${iMed})
          ORDER BY id ASC LIMIT 3`,
        params,
      };
    } else if (hasNm && nisP && medP) {
      const composed = `${nisP}-${medP}`;
      const params = [];
      let t = "";
      if (hasTenant && Number.isFinite(tenantId)) {
        params.push(tenantId);
        t = ` AND tenant_id = $${params.length}`;
      } else if (hasTenant) {
        console.warn("[coords-manual→socios_catalogo] socios_catalogo.tenant_id existe pero tenantId inválido; match sin filtro tenant");
      }
      params.push(composed);
      const iC = params.length;
      findSql = {
        sql: `SELECT id FROM socios_catalogo WHERE COALESCE(activo, TRUE) = TRUE${t}
          AND UPPER(TRIM(COALESCE(nis_medidor::text,''))) = UPPER(TRIM($${iC}))
          ORDER BY id ASC LIMIT 3`,
        params,
      };
    } else {
      console.info("[coords-manual→socios_catalogo] pedido sin nis_medidor ni par nis+medidor; sin sync catálogo", {
        pedidoId: pedido.id,
      });
      return { ok: false, reason: "sin_clave_padron" };
    }

    const rFind = await query(findSql.sql, findSql.params);
    const ids = (rFind.rows || []).map((x) => x.id);
    if (ids.length === 0) {
      console.info("[coords-manual→socios_catalogo] sin fila en catálogo para el identificador del pedido", {
        pedidoId: pedido.id,
      });
      return { ok: false, reason: "sin_match" };
    }
    if (ids.length > 1) {
      console.warn("[coords-manual→socios_catalogo] varias filas coinciden; no se actualiza (ambigüedad)", {
        pedidoId: pedido.id,
        ids,
      });
      return { ok: false, reason: "ambiguo", ids };
    }

    const sid = ids[0];
    const u = await query(
      `UPDATE socios_catalogo SET ${latLng.la} = $1::numeric, ${latLng.ln} = $2::numeric WHERE id = $3 RETURNING id`,
      [la, ln, sid]
    );
    const ok = !!(u.rows && u.rows.length);
    if (ok) {
      console.info("[coords-manual→socios_catalogo] actualizado socio id=%s (pedido %s)", sid, pedido.id);
    }
    return { ok, sociosId: sid, reason: ok ? undefined : "update_failed" };
  } catch (e) {
    console.warn("[coords-manual→socios_catalogo]", e?.message || e);
    return { ok: false, reason: "error", detail: String(e?.message || e) };
  }
}
