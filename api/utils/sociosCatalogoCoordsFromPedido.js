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
    const hasUbicManual = cols.has("ubicacion_manual");
    const updateSql = hasUbicManual
      ? `UPDATE socios_catalogo SET ${latLng.la} = $1::numeric, ${latLng.ln} = $2::numeric, ubicacion_manual = TRUE WHERE id = $3 RETURNING id`
      : `UPDATE socios_catalogo SET ${latLng.la} = $1::numeric, ${latLng.ln} = $2::numeric WHERE id = $3 RETURNING id`;
    const u = await query(updateSql, [la, ln, sid]);
    const ok = !!(u.rows && u.rows.length);
    if (ok) {
      const marcaManual = hasUbicManual ? " (marcada como manual)" : "";
      console.info("[coords-manual→socios_catalogo] actualizado socio id=%s (pedido %s)%s", sid, pedido.id, marcaManual);
    }
    return { ok, sociosId: sid, reason: ok ? undefined : "update_failed" };
  } catch (e) {
    console.warn("[coords-manual→socios_catalogo]", e?.message || e);
    return { ok: false, reason: "error", detail: String(e?.message || e) };
  }
}

/** Fallback de mapa en `crearPedidoDesdeWhatsappBot` cuando no hay geocodificación válida. */
export function esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return true;
  return Math.abs(la - -34.6037) < 0.001 && Math.abs(ln - -58.3816) < 0.001;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coordsCatalogoDbValidas(la, ln) {
  if (la == null || ln == null) return false;
  const a = Number(la);
  const b = Number(ln);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) return false;
  if (esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp(a, b)) return false;
  return true;
}

function debeSobrescribirCoordsCatalogoWhatsapp(oldLa, oldLn, newLa, newLn) {
  if (!coordsCatalogoDbValidas(oldLa, oldLn)) return true;
  return haversineMeters(Number(oldLa), Number(oldLn), newLa, newLn) > 200;
}

function nombreTitularPedidoParaMatchCatalogo(clienteNombre) {
  const n = String(clienteNombre || "").trim();
  if (n.length < 3 || n.length > 200) return null;
  if (/^whatsapp\s*\d/i.test(n)) return null;
  return n;
}

/**
 * Tras un reclamo WhatsApp con coordenadas confiables: actualiza `socios_catalogo` si hay
 * match único por NIS/medidor o por nombre (tenant), y las coords actuales faltan o difieren (>200 m).
 *
 * @param {{ pedido: object, tenantId: number, lat: number, lng: number }} opts
 */
export async function enriquecerSociosCatalogoCoordsDesdePedidoWhatsapp(opts) {
  const pedido = opts.pedido;
  const newLa = Number(opts.lat);
  const newLn = Number(opts.lng);
  const tenantId = Number(opts.tenantId);
  if (!pedido || !Number.isFinite(newLa) || !Number.isFinite(newLn)) {
    return { ok: false, reason: "parametros" };
  }
  if (esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp(newLa, newLn)) {
    return { ok: false, reason: "placeholder_coords" };
  }

  try {
    if (!(await tablaExiste("socios_catalogo"))) {
      return { ok: false, reason: "sin_tabla" };
    }

    const cols = await columnasSociosCatalogo();
    const latLng = pickLatLngColumns(cols);
    if (!latLng) {
      return { ok: false, reason: "sin_columnas_latlng" };
    }

    const hasTenant = cols.has("tenant_id");
    const hasNm = cols.has("nis_medidor");
    const hasNis = cols.has("nis");
    const hasMed = cols.has("medidor");
    const hasNombre = cols.has("nombre");

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
        console.warn("[wa→socios_catalogo] tenant_id en tabla pero tenantId inválido; match sin filtro tenant");
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
        console.warn("[wa→socios_catalogo] tenant_id en tabla pero tenantId inválido; match sin filtro tenant");
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
        console.warn("[wa→socios_catalogo] tenant_id en tabla pero tenantId inválido; match sin filtro tenant");
      }
      params.push(composed);
      const iC = params.length;
      findSql = {
        sql: `SELECT id FROM socios_catalogo WHERE COALESCE(activo, TRUE) = TRUE${t}
          AND UPPER(TRIM(COALESCE(nis_medidor::text,''))) = UPPER(TRIM($${iC}))
          ORDER BY id ASC LIMIT 3`,
        params,
      };
    }

    let ids = [];
    if (findSql) {
      const rFind = await query(findSql.sql, findSql.params);
      ids = (rFind.rows || []).map((x) => x.id);
    }

    if (ids.length > 1) {
      return { ok: false, reason: "ambiguo_nis", ids };
    }

    if (ids.length === 0 && hasNombre) {
      const nom = nombreTitularPedidoParaMatchCatalogo(pedido.cliente_nombre);
      if (nom) {
        const params = [];
        let t = "";
        if (hasTenant && Number.isFinite(tenantId)) {
          params.push(tenantId);
          t = ` AND tenant_id = $${params.length}`;
        } else if (hasTenant) {
          console.warn("[wa→socios_catalogo] match por nombre sin tenantId válido");
        }
        params.push(nom);
        const iN = params.length;
        const rN = await query(
          `SELECT id FROM socios_catalogo WHERE COALESCE(activo, TRUE) = TRUE${t}
           AND LOWER(TRIM(COALESCE(nombre::text,''))) = LOWER(TRIM($${iN}))
           ORDER BY id ASC LIMIT 4`,
          params
        );
        const idn = (rN.rows || []).map((x) => x.id);
        if (idn.length === 1) ids = idn;
        else if (idn.length > 1) {
          return { ok: false, reason: "ambiguo_nombre", ids: idn };
        }
      }
    }

    if (ids.length === 0) {
      return { ok: false, reason: "sin_match" };
    }
    if (ids.length > 1) {
      return { ok: false, reason: "ambiguo", ids };
    }

    const sid = ids[0];
    const cur = await query(
      `SELECT ${latLng.la} AS la, ${latLng.ln} AS ln FROM socios_catalogo WHERE id = $1 LIMIT 1`,
      [sid]
    );
    const row = cur.rows?.[0];
    if (!debeSobrescribirCoordsCatalogoWhatsapp(row?.la, row?.ln, newLa, newLn)) {
      return { ok: false, reason: "coords_ya_cercanas", sociosId: sid };
    }

    const hasUbicManual = cols.has("ubicacion_manual");
    const updateSql = hasUbicManual
      ? `UPDATE socios_catalogo SET ${latLng.la} = $1::numeric, ${latLng.ln} = $2::numeric, ubicacion_manual = TRUE WHERE id = $3 RETURNING id`
      : `UPDATE socios_catalogo SET ${latLng.la} = $1::numeric, ${latLng.ln} = $2::numeric WHERE id = $3 RETURNING id`;
    const u = await query(updateSql, [newLa, newLn, sid]);
    const ok = !!(u.rows && u.rows.length);
    if (ok) {
      const marcaEnriq = hasUbicManual ? " (enriquecimiento automático)" : "";
      console.info("[wa→socios_catalogo] coords actualizadas socio id=%s (pedido %s)%s", sid, pedido.id, marcaEnriq);
    }
    return { ok, sociosId: sid, reason: ok ? undefined : "update_failed" };
  } catch (e) {
    console.warn("[wa→socios_catalogo]", e?.message || e);
    return { ok: false, reason: "error", detail: String(e?.message || e) };
  }
}
