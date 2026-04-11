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

function digitsCp(s) {
  if (s == null) return "";
  const d = String(s).replace(/\D/g, "");
  return d.length >= 4 && d.length <= 8 ? d : "";
}

function haversineMetersQuick(lat1, lon1, lat2, lon2) {
  const a1 = Number(lat1);
  const o1 = Number(lon1);
  const a2 = Number(lat2);
  const o2 = Number(lon2);
  if (![a1, o1, a2, o2].every((x) => Number.isFinite(x))) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(a2 - a1);
  const dLon = toRad(o2 - o1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Misma heurística que `esCoordenadaPlaceholderBuenosAiresPedidoWhatsapp` (evita referencia antes de su declaración). */
function esPlaceholderBACoords(la, ln) {
  const a = Number(la);
  const b = Number(ln);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return Math.abs(a - -34.6037) < 0.001 && Math.abs(b - -58.3816) < 0.001;
}

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
      console.info("[coords-manual→socios_catalogo] pedido sin nis_medidor ni par nis+medidor; intentando match por dirección+nombre", {
        pedidoId: pedido.id,
      });
      const calleP = pedido.cliente_calle != null ? String(pedido.cliente_calle).trim() : "";
      const numP = pedido.cliente_numero_puerta != null ? String(pedido.cliente_numero_puerta).trim() : "";
      const locP = pedido.cliente_localidad != null ? String(pedido.cliente_localidad).trim() : "";
      const nomP = pedido.cliente_nombre != null ? String(pedido.cliente_nombre).trim() : "";
      
      if (calleP.length >= 2 && locP.length >= 2 && nomP.length >= 3 && cols.has("calle") && cols.has("localidad") && cols.has("nombre")) {
        const params = [];
        let t = "";
        if (hasTenant && Number.isFinite(tenantId)) {
          params.push(tenantId);
          t = ` AND tenant_id = $${params.length}`;
        }
        params.push(calleP, locP, nomP);
        const iCal = params.length - 2;
        const iLoc = params.length - 1;
        const iNom = params.length;
        const numCond = numP && cols.has("numero") 
          ? ` AND UPPER(TRIM(COALESCE(numero::text,''))) = UPPER(TRIM($${params.length + 1}))` 
          : "";
        if (numP && cols.has("numero")) params.push(numP);
        
        const fallbackSql = {
          sql: `SELECT id FROM socios_catalogo WHERE COALESCE(activo, TRUE) = TRUE${t}
            AND UPPER(TRIM(COALESCE(calle::text,''))) = UPPER(TRIM($${iCal}))
            AND UPPER(TRIM(COALESCE(localidad::text,''))) = UPPER(TRIM($${iLoc}))
            AND UPPER(TRIM(COALESCE(nombre::text,''))) = UPPER(TRIM($${iNom}))${numCond}
            ORDER BY id ASC LIMIT 3`,
          params,
        };
        
        const rFallback = await query(fallbackSql.sql, fallbackSql.params);
        const idsFb = (rFallback.rows || []).map((x) => x.id);
        if (idsFb.length === 1) {
          const sidFb = idsFb[0];
          const hasUbicManual = cols.has("ubicacion_manual");
          const hasFechaCorr = cols.has("fecha_correccion_coords");
          
          let updateSql = `UPDATE socios_catalogo SET ${latLng.la} = $1::numeric, ${latLng.ln} = $2::numeric`;
          const paramsFb = [la, ln];
          let nextFb = 3;
          if (cols.has("provincia")) {
            const pv = pedido.provincia != null ? String(pedido.provincia).trim() : "";
            if (pv) {
              updateSql += `, provincia = $${nextFb}`;
              paramsFb.push(pv);
              nextFb++;
            }
          }
          if (cols.has("codigo_postal")) {
            const cp = digitsCp(pedido.codigo_postal);
            if (cp) {
              updateSql += `, codigo_postal = $${nextFb}`;
              paramsFb.push(cp);
              nextFb++;
            }
          }
          if (hasUbicManual) updateSql += `, ubicacion_manual = TRUE`;
          if (hasFechaCorr) updateSql += `, fecha_correccion_coords = NOW()`;
          updateSql += ` WHERE id = $${nextFb} RETURNING id`;
          paramsFb.push(sidFb);

          const u = await query(updateSql, paramsFb);
          const ok = !!(u.rows && u.rows.length);
          if (ok) {
            const marcaManual = hasUbicManual ? " (marcada como manual)" : "";
            const marcaFecha = hasFechaCorr ? " con timestamp" : "";
            console.info("[coords-manual→socios_catalogo] ✓ actualizado socio id=%s por dirección+nombre (pedido %s)%s%s", sidFb, pedido.id, marcaManual, marcaFecha);
          }
          return { ok, sociosId: sidFb, reason: ok ? "match_direccion_nombre" : "update_failed" };
        } else if (idsFb.length > 1) {
          console.warn("[coords-manual→socios_catalogo] varias filas por dirección+nombre; no se actualiza", {
            pedidoId: pedido.id,
            ids: idsFb,
          });
          return { ok: false, reason: "ambiguo_direccion", ids: idsFb };
        }
      }
      
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
    const hasFechaCorr = cols.has("fecha_correccion_coords");

    const cur = await query(
      `SELECT ${latLng.la}::numeric AS ola, ${latLng.ln}::numeric AS olo FROM socios_catalogo WHERE id = $1`,
      [sid]
    );
    const ola = cur.rows?.[0]?.ola != null ? Number(cur.rows[0].ola) : NaN;
    const olo = cur.rows?.[0]?.olo != null ? Number(cur.rows[0].olo) : NaN;
    const coordsPreviasOk =
      Number.isFinite(ola) &&
      Number.isFinite(olo) &&
      !(Math.abs(ola) < 1e-6 && Math.abs(olo) < 1e-6) &&
      !esPlaceholderBACoords(ola, olo);
    const mejoraCoords = !coordsPreviasOk || haversineMetersQuick(ola, olo, la, ln) > 45;

    const pv = pedido.provincia != null ? String(pedido.provincia).trim() : "";
    const cp = digitsCp(pedido.codigo_postal);

    if (!mejoraCoords && !pv && !cp) {
      console.info("[coords-manual→socios_catalogo] coords catálogo ya cercanas al pedido; sin cambios", {
        pedidoId: pedido.id,
        sid,
      });
      return { ok: true, sociosId: sid, reason: "coords_ya_cercanas" };
    }

    let updateSql;
    const paramsUp = [];
    let next = 1;

    if (mejoraCoords) {
      paramsUp.push(la, ln);
      updateSql = `UPDATE socios_catalogo SET ${latLng.la} = $1::numeric, ${latLng.ln} = $2::numeric`;
      next = 3;
      if (cols.has("provincia") && pv) {
        updateSql += `, provincia = $${next}`;
        paramsUp.push(pv);
        next++;
      }
      if (cols.has("codigo_postal") && cp) {
        updateSql += `, codigo_postal = $${next}`;
        paramsUp.push(cp);
        next++;
      }
      if (hasUbicManual) updateSql += `, ubicacion_manual = TRUE`;
      if (hasFechaCorr) updateSql += `, fecha_correccion_coords = NOW()`;
    } else {
      const sets = [];
      if (cols.has("provincia") && pv) {
        sets.push(`provincia = $${next}`);
        paramsUp.push(pv);
        next++;
      }
      if (cols.has("codigo_postal") && cp) {
        sets.push(`codigo_postal = $${next}`);
        paramsUp.push(cp);
        next++;
      }
      if (!sets.length) {
        return { ok: true, sociosId: sid, reason: "sin_cambios" };
      }
      updateSql = `UPDATE socios_catalogo SET ${sets.join(", ")}`;
    }
    updateSql += ` WHERE id = $${next} RETURNING id`;
    paramsUp.push(sid);

    const u = await query(updateSql, paramsUp);
    const ok = !!(u.rows && u.rows.length);
    if (ok) {
      const marcaManual = hasUbicManual ? " (marcada como manual)" : "";
      const marcaFecha = hasFechaCorr ? " con timestamp" : "";
      console.info("[coords-manual→socios_catalogo] ✓ actualizado socio id=%s (pedido %s)%s%s", sid, pedido.id, marcaManual, marcaFecha);
    } else {
      console.warn("[coords-manual→socios_catalogo] ✗ UPDATE falló para socio id=%s", sid);
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
