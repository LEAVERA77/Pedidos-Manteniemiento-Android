import { query } from "../db/neon.js";
import { buscarCoordenadasVecinosMismaCalle } from "./whatsappPadronVecinos.js";
/** Al crear el pedido (pedidoWhatsappBot) se aplica la cascada completa en whatsappGeolocalizacionGarantizada.js (localidad + sede). */

async function columnasUsuarios() {
  const cols = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios'`
  );
  return new Set((cols.rows || []).map((c) => c.column_name));
}

async function tableExists(name) {
  const r = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rows.length > 0;
}

async function columnasTabla(name) {
  const r = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return new Set((r.rows || []).map((c) => c.column_name));
}

async function columnasTablaMeta(name) {
  const r = await query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  const set = new Set((r.rows || []).map((c) => c.column_name));
  const types = {};
  for (const row of r.rows || []) types[row.column_name] = row;
  return { set, types };
}

function findPointColumnName(meta) {
  const candidates = ["coordenadas", "ubicacion", "punto", "geom", "location", "gps"];
  for (const c of candidates) {
    if (!meta.set.has(c)) continue;
    const t = meta.types[c];
    if (t && String(t.udt_name || "") === "point") return c;
  }
  return null;
}

function nombreCompletoClienteFinal(row) {
  const n = [row?.nombre, row?.apellido].map((x) => String(x || "").trim()).filter(Boolean);
  return n.length ? n.join(" ") : null;
}

/** Quita espacios raros y recorta; no altera mayúsculas (comparaciones SQL hacen TRIM/UPPER donde aplica). */
export function normalizarIdentificadorReclamoWhatsapp(texto) {
  return String(texto || "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200e\u200f]/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

/** Solo dígitos, para cruzar NIS/medidor aunque en BD haya ceros a la izquierda o separadores. */
export function soloDigitosIdentificadorReclamo(texto) {
  return normalizarIdentificadorReclamoWhatsapp(texto).replace(/\D/g, "");
}

function debugReclamanteLookup(msg, data) {
  const on =
    process.env.WHATSAPP_DEBUG_RECLAMANTE_LOOKUP === "1" ||
    process.env.WHATSAPP_DEBUG_RECLAMANTE_LOOKUP === "true";
  if (on) console.log("[whatsapp-reclamante-lookup]", msg, data);
}

function pickCoord(row, latKey, lngKey) {
  let la = row?.[latKey];
  let lo = row?.[lngKey];
  if (
    typeof la === "string" &&
    /[,;]/.test(la) &&
    (lo == null || String(lo).trim() === "")
  ) {
    const segs = la
      .split(/[,;]/)
      .map((s) => parseFloat(String(s).trim().replace(",", ".")))
      .filter((n) => Number.isFinite(n));
    if (segs.length >= 2) {
      const a = segs[0];
      const b = segs[1];
      const enCajaAR = (x, y) =>
        x <= -20 &&
        x >= -56 &&
        y <= -48 &&
        y >= -74;
      if (enCajaAR(a, b)) {
        la = a;
        lo = b;
      } else if (enCajaAR(b, a)) {
        la = b;
        lo = a;
      } else if (Math.abs(a) <= 90 && Math.abs(b) <= 180 && Math.abs(b) > 60) {
        la = a;
        lo = b;
      } else if (Math.abs(b) <= 90 && Math.abs(a) <= 180 && Math.abs(a) > 60) {
        la = b;
        lo = a;
      } else {
        la = a;
        lo = b;
      }
    }
  }
  const lat = la != null ? Number(la) : NaN;
  const lng = lo != null ? Number(lo) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { catalogoLatitud: null, catalogoLongitud: null };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { catalogoLatitud: null, catalogoLongitud: null };
  /* Placeholder 0,0 en padrón: no heredar (el pedido debe usar geocode u otra fuente). */
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return { catalogoLatitud: null, catalogoLongitud: null };
  return { catalogoLatitud: lat, catalogoLongitud: lng };
}

/** lat_pad/lng_pad o columna PostgreSQL `point` como lat_pt/lng_pt (orden nativo e intento cruzado). */
function pickCoordDesdeFilaPadron(row, latKey, lngKey) {
  const base = pickCoord(row, latKey, lngKey);
  if (base.catalogoLatitud != null) return base;
  const la = row?.lat_pt != null ? Number(row.lat_pt) : NaN;
  const lo = row?.lng_pt != null ? Number(row.lng_pt) : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return base;
  const tryA = pickCoord({ ...row, [latKey]: la, [lngKey]: lo }, latKey, lngKey);
  if (tryA.catalogoLatitud != null) return tryA;
  return pickCoord({ ...row, [latKey]: lo, [lngKey]: la }, latKey, lngKey);
}

async function enrichCoordsVecinosSiFalta(tenantId, out, source) {
  if (!out || !out.ok) return out;
  if (out.catalogoLatitud != null && out.catalogoLongitud != null) return out;
  const calle = out.catalogoCalle != null ? String(out.catalogoCalle).trim() : "";
  const num = out.catalogoNumero != null ? String(out.catalogoNumero).trim() : "";
  if (calle.length < 2 || !num) return out;
  const excludeNm = out.nisMedidor || out.medidor || out.nis || null;
  const excludeCf = source === "cf" ? out._lookupCfId : null;
  try {
    const fb = await buscarCoordenadasVecinosMismaCalle({
      tenantId,
      calle,
      localidad: out.catalogoLocalidad,
      numeroTexto: num,
      excludeNisMedidor: excludeNm,
      excludeClienteFinalId: excludeCf,
      preferTable: source === "cf" ? "clientes_finales" : "socios_catalogo",
    });
    if (fb) {
      out.catalogoLatitud = fb.lat;
      out.catalogoLongitud = fb.lng;
      out.notaUbicacionProximidad = fb.nota;
    }
  } catch (e) {
    console.warn("[whatsapp-reclamante-lookup] vecinos", e?.message || e);
  }
  return out;
}

/** Expresión SQL: primera coordenada numérica disponible (latitud | lat). */
function sqlLatPadExpr(cols) {
  const parts = [];
  if (cols.has("latitud")) parts.push("latitud::numeric");
  if (cols.has("lat")) parts.push("lat::numeric");
  if (!parts.length) return "NULL::numeric AS lat_pad";
  return parts.length === 1 ? `${parts[0]} AS lat_pad` : `COALESCE(${parts.join(", ")}) AS lat_pad`;
}

function sqlLngPadExpr(cols) {
  const parts = [];
  if (cols.has("longitud")) parts.push("longitud::numeric");
  if (cols.has("lng")) parts.push("lng::numeric");
  if (!parts.length) return "NULL::numeric AS lng_pad";
  return parts.length === 1 ? `${parts[0]} AS lng_pad` : `COALESCE(${parts.join(", ")}) AS lng_pad`;
}

/**
 * Comparación SQL: mismo identificador numérico ignorando ceros a la izquierda (041686 ≡ 41686).
 * @param {string} campoSql expresión de columna (ej. nis_medidor::text)
 * @param {number} digitParamIndex índice $ del parámetro con solo dígitos del usuario
 */
export function sqlDigitosMismaMagnitud(campoSql, digitParamIndex) {
  return `(
    LENGTH($${digitParamIndex}::text) >= 4
    AND regexp_replace(TRIM(COALESCE(${campoSql}, '')), '[^0-9]', '', 'g') ~ '^[0-9]+$'
    AND LENGTH(regexp_replace(TRIM(COALESCE(${campoSql}, '')), '[^0-9]', '', 'g')) <= 24
    AND regexp_replace(TRIM(COALESCE(${campoSql}, '')), '[^0-9]', '', 'g')::numeric = $${digitParamIndex}::numeric
  )`;
}

/**
 * El usuario escribió solo dígitos (ej. 98464) pero en BD puede venir en campo compuesto, con prefijos o letras:
 * busca la subcadena de dígitos dentro del valor normalizado (sin afectar igualdad numérica exacta arriba).
 */
export function sqlDigitosContieneSubcadena(campoSql, digitParamIndex) {
  return `(
    LENGTH($${digitParamIndex}::text) >= 4
    AND LENGTH(regexp_replace(TRIM(COALESCE(${campoSql}, '')), '[^0-9]', '', 'g')) >= LENGTH($${digitParamIndex}::text)
    AND strpos(
      regexp_replace(TRIM(COALESCE(${campoSql}, '')), '[^0-9]', '', 'g'),
      $${digitParamIndex}::text
    ) > 0
  )`;
}

/** Evita cortar toda la búsqueda si el tenant llega mal desde el webhook. */
function resolveTenantIdReclamoLookup(tenantIdRaw) {
  let t = Number(tenantIdRaw);
  if (!Number.isFinite(t) || t < 1) {
    const fb = Number(process.env.WHATSAPP_BOT_TENANT_ID || 1);
    t = Number.isFinite(fb) && fb >= 1 ? fb : 1;
  }
  return t;
}

/**
 * Busca nombre / NIS para el reclamo: ID usuario del tenant, NIS/medidor/número en clientes_finales, o socios_catalogo.
 * @returns {{ ok: true, clienteNombre: string, nis: string|null, medidor: string|null, nisMedidor: string|null, catalogoCalle?: string|null, catalogoNumero?: string|null, catalogoLocalidad?: string|null, catalogoProvincia?: string|null, catalogoBarrio?: string|null, catalogoTipoConexion?: string|null, catalogoFases?: string|null, catalogoLatitud?: number|null, catalogoLongitud?: number|null, notaUbicacionProximidad?: string|null } | { ok: false } | { skip: true }}
 */
export async function buscarIdentidadParaReclamoWhatsApp(tenantId, texto) {
  const rawTrim = normalizarIdentificadorReclamoWhatsapp(texto);
  if (!rawTrim) return { skip: true };
  const low = rawTrim.toLowerCase();
  if (/^(no|n|salto|siguiente|omitir|sigue|skip|-|na)$/i.test(low)) {
    return { skip: true };
  }

  const tid = resolveTenantIdReclamoLookup(tenantId);

  const dKey = soloDigitosIdentificadorReclamo(rawTrim);
  const useDigitMatch = dKey.length >= 4 && dKey.length <= 24;

  debugReclamanteLookup("entrada", {
    tenantId: tid,
    rawTrim,
    digitKey: useDigitMatch ? dKey : null,
  });

  const colSet = await columnasUsuarios();
  const tenantCol = colSet.has("tenant_id") ? "tenant_id" : colSet.has("cliente_id") ? "cliente_id" : null;

  // 1) ID numérico → usuario interno (solo IDs pequeños; evita colisión con NIS/medidor de 5+ dígitos)
  if (/^\d+$/.test(rawTrim) && tenantCol) {
    const idNum = parseInt(rawTrim, 10);
    if (Number.isFinite(idNum) && idNum >= 1 && idNum <= 9999) {
      const ru = await query(
        `SELECT id, nombre, email FROM usuarios
         WHERE id = $1 AND ${tenantCol} = $2 AND COALESCE(activo, TRUE) = TRUE LIMIT 1`,
        [idNum, tid]
      );
      const u = ru.rows?.[0];
      if (u) {
        const nombre = String(u.nombre || "").trim() || String(u.email || "").trim() || `Usuario #${u.id}`;
        debugReclamanteLookup("match_usuario", { id: u.id });
        return { ok: true, clienteNombre: nombre, nis: null, medidor: null, nisMedidor: null };
      }
    }
  }

  // 2) clientes_finales (cliente_id = tenant)
  if (await tableExists("clientes_finales")) {
    const cfMeta = await columnasTablaMeta("clientes_finales");
    const cfCols = cfMeta.set;
    const ptCf = findPointColumnName(cfMeta);
    const ptSelCf = ptCf
      ? `(clientes_finales.${ptCf})[0]::numeric AS lat_pt, (clientes_finales.${ptCf})[1]::numeric AS lng_pt`
      : "NULL::numeric AS lat_pt, NULL::numeric AS lng_pt";
    const provExpr = cfCols.has("provincia")
      ? "NULLIF(TRIM(COALESCE(provincia, '')), '') AS provincia_cat"
      : "NULL::text AS provincia_cat";
    const latExpr = sqlLatPadExpr(cfCols);
    const lngExpr = sqlLngPadExpr(cfCols);
    const params = [tid, rawTrim];
    let extraMatch = "";
    if (useDigitMatch) {
      params.push(dKey);
      const dk = 3;
      extraMatch += ` OR (
          LENGTH($${dk}::text) >= 4 AND (
            ${sqlDigitosMismaMagnitud("nis::text", dk)}
            OR ${sqlDigitosMismaMagnitud("medidor::text", dk)}
            OR ${sqlDigitosMismaMagnitud("numero_cliente::text", dk)}
            OR ${sqlDigitosContieneSubcadena("nis::text", dk)}
            OR ${sqlDigitosContieneSubcadena("medidor::text", dk)}
            OR ${sqlDigitosContieneSubcadena("numero_cliente::text", dk)}
          )
        )`;
      extraMatch += ` OR (
          LENGTH(TRIM($2)) >= 4 AND (
            UPPER(TRIM(COALESCE(nis::text,''))) LIKE '%' || UPPER(TRIM($2)) || '%'
            OR UPPER(TRIM(COALESCE(medidor::text,''))) LIKE '%' || UPPER(TRIM($2)) || '%'
            OR UPPER(TRIM(COALESCE(numero_cliente::text,''))) LIKE '%' || UPPER(TRIM($2)) || '%'
          )
        )`;
      if (cfCols.has("metadata")) {
        extraMatch += ` OR (
          NULLIF(TRIM(COALESCE(metadata->>'dni','')), '') = $2
          OR regexp_replace(NULLIF(TRIM(COALESCE(metadata->>'dni','')), ''), '[^0-9]', '', 'g') = $${dk}
        )`;
      }
    }

    const r = await query(
      `SELECT id, nombre, apellido, nis, medidor, numero_cliente,
              NULLIF(TRIM(COALESCE(calle, '')), '') AS calle_cat,
              NULLIF(TRIM(COALESCE(numero_puerta, '')), '') AS numero_cat,
              NULLIF(TRIM(COALESCE(localidad, '')), '') AS localidad_cat,
              NULLIF(TRIM(COALESCE(barrio, '')), '') AS barrio_cat,
              ${latExpr},
              ${lngExpr},
              ${ptSelCf},
              ${provExpr}
       FROM clientes_finales
       WHERE cliente_id = $1 AND COALESCE(activo, TRUE) = TRUE
         AND (
           UPPER(TRIM(COALESCE(nis::text,''))) = UPPER(TRIM($2))
           OR UPPER(TRIM(COALESCE(medidor::text,''))) = UPPER(TRIM($2))
           OR UPPER(TRIM(COALESCE(numero_cliente::text,''))) = UPPER(TRIM($2))
           OR CAST(id AS TEXT) = TRIM($2)
           ${extraMatch}
         )
       LIMIT 1`,
      params
    );
    const row = r.rows?.[0];
    if (row) {
      const cn = nombreCompletoClienteFinal(row);
      const label = cn || `Socio #${row.id}`;
      const nisVal = row.nis != null && String(row.nis).trim() ? String(row.nis).trim() : null;
      const med = row.medidor != null && String(row.medidor).trim() ? String(row.medidor).trim() : null;
      const coords = pickCoordDesdeFilaPadron(row, "lat_pad", "lng_pad");
      debugReclamanteLookup("match_clientes_finales", { id: row.id, nis: nisVal, medidor: med, ...coords });
      const out = {
        ok: true,
        clienteNombre: label,
        nis: nisVal,
        medidor: med,
        nisMedidor: med || nisVal || rawTrim,
        catalogoCalle: row.calle_cat != null ? String(row.calle_cat).trim() || null : null,
        catalogoNumero: row.numero_cat != null ? String(row.numero_cat).trim() || null : null,
        catalogoLocalidad: row.localidad_cat != null ? String(row.localidad_cat).trim() || null : null,
        catalogoBarrio: row.barrio_cat != null ? String(row.barrio_cat).trim() || null : null,
        catalogoProvincia: row.provincia_cat != null ? String(row.provincia_cat).trim() || null : null,
        ...coords,
        _lookupCfId: row.id,
      };
      await enrichCoordsVecinosSiFalta(tid, out, "cf");
      delete out._lookupCfId;
      return out;
    }
  }

  // 3) socios_catalogo (cooperativa eléctrica; match exacto o por dígitos; tenant si la columna existe)
  if (await tableExists("socios_catalogo")) {
    const scMeta = await columnasTablaMeta("socios_catalogo");
    const scCols = scMeta.set;
    const ptSc = findPointColumnName(scMeta);
    const ptSelSc = ptSc
      ? `(socios_catalogo.${ptSc})[0]::numeric AS lat_pt, (socios_catalogo.${ptSc})[1]::numeric AS lng_pt`
      : "NULL::numeric AS lat_pt, NULL::numeric AS lng_pt";
    const provExpr = scCols.has("provincia")
      ? "NULLIF(TRIM(COALESCE(provincia, '')), '') AS provincia_cat"
      : "NULL::text AS provincia_cat";
    const latExpr = sqlLatPadExpr(scCols);
    const lngExpr = sqlLngPadExpr(scCols);

    const tenantColSc = scCols.has("cliente_id")
      ? "cliente_id"
      : scCols.has("tenant_id")
        ? "tenant_id"
        : null;

    const idMatchOr = `(
          TRIM($1) ~ '^[0-9]+$'
          AND LENGTH(TRIM($1)) <= 12
          AND CAST(id AS TEXT) = TRIM($1)
        )`;
    /** Coincidencia textual: columnas separadas (exacto) + nis_medidor unificado por ILIKE (guiones, sufijos). */
    const exactUnifiedText = `UPPER(TRIM(COALESCE(nis_medidor::text,''))) = UPPER(TRIM($1))`;
    const exactMedidorText = scCols.has("medidor")
      ? `UPPER(TRIM(COALESCE(medidor::text,''))) = UPPER(TRIM($1))`
      : null;
    const exactNisColText = scCols.has("nis") ? `UPPER(TRIM(COALESCE(nis::text,''))) = UPPER(TRIM($1))` : null;
    const likeNisMedidorUnificado = `(
      LENGTH(TRIM($1)) >= 3
      AND TRIM(COALESCE(nis_medidor::text,'')) ILIKE '%' || TRIM($1) || '%'
    )`;
    /** Prioridad numérica: dígitos equivalentes y subcadenas (ceros / valores compuestos). */
    const digitOrParts = [];
    const digitPartialParts = [];
    if (useDigitMatch) {
      digitOrParts.push(sqlDigitosMismaMagnitud("nis_medidor::text", 2));
      if (scCols.has("medidor")) digitOrParts.push(sqlDigitosMismaMagnitud("medidor::text", 2));
      if (scCols.has("nis")) digitOrParts.push(sqlDigitosMismaMagnitud("nis::text", 2));
      digitPartialParts.push(sqlDigitosContieneSubcadena("nis_medidor::text", 2));
      if (scCols.has("medidor")) digitPartialParts.push(sqlDigitosContieneSubcadena("medidor::text", 2));
      if (scCols.has("nis")) digitPartialParts.push(sqlDigitosContieneSubcadena("nis::text", 2));
    }
    const textoPrincipalParts = [exactUnifiedText];
    if (exactMedidorText) textoPrincipalParts.push(exactMedidorText);
    if (exactNisColText) textoPrincipalParts.push(exactNisColText);
    textoPrincipalParts.push(likeNisMedidorUnificado);

    const matchClause = useDigitMatch
      ? `(
          ${textoPrincipalParts.join("\n          OR ")}
          OR (${digitOrParts.join(" OR ")})
          OR (${digitPartialParts.join(" OR ")})
          OR ${idMatchOr}
        )`
      : `(
          ${textoPrincipalParts.join("\n          OR ")}
          OR ${idMatchOr}
        )`;

    const scParams = useDigitMatch ? [rawTrim, dKey] : [rawTrim];
    let tenantSql = "";
    if (tenantColSc) {
      const pT = scParams.length + 1;
      tenantSql = ` AND (${tenantColSc} IS NULL OR ${tenantColSc} = $${pT})`;
      scParams.push(tid);
    }

    const rankParts = [];
    if (useDigitMatch) {
      if (scCols.has("medidor")) rankParts.push(`CASE WHEN ${sqlDigitosMismaMagnitud("medidor::text", 2)} THEN 4 ELSE 0 END`);
      if (scCols.has("nis")) rankParts.push(`CASE WHEN ${sqlDigitosMismaMagnitud("nis::text", 2)} THEN 2 ELSE 0 END`);
      rankParts.push(`CASE WHEN ${sqlDigitosMismaMagnitud("nis_medidor::text", 2)} THEN 1 ELSE 0 END`);
    }
    const orderByRank =
      useDigitMatch && rankParts.length > 0 ? ` ORDER BY ${rankParts.join(" + ")} DESC, id ASC` : ` ORDER BY id ASC`;

    const selMedNis = `${scCols.has("medidor") ? "NULLIF(TRIM(COALESCE(medidor::text,'')), '') AS medidor_raw" : "NULL::text AS medidor_raw"},
              ${scCols.has("nis") ? "NULLIF(TRIM(COALESCE(nis::text,'')), '') AS nis_raw" : "NULL::text AS nis_raw"},`;

    const baseSelect = `SELECT nis_medidor, nombre,
              ${selMedNis}
              NULLIF(TRIM(COALESCE(calle, '')), '') AS calle_cat,
              NULLIF(TRIM(COALESCE(numero, '')), '') AS numero_cat,
              NULLIF(TRIM(COALESCE(localidad, '')), '') AS localidad_cat,
              NULLIF(TRIM(COALESCE(tipo_conexion, '')), '') AS tipo_conexion_cat,
              NULLIF(TRIM(COALESCE(fases, '')), '') AS fases_cat,
              ${latExpr},
              ${lngExpr},
              ${ptSelSc},
              ${provExpr}
       FROM socios_catalogo
       WHERE COALESCE(activo, TRUE) = TRUE
         AND ${matchClause}
         ${tenantSql}`;

    let r = await query(`${baseSelect}${orderByRank} LIMIT 1`, scParams);
    let row = r.rows?.[0];

    if (!row && tenantColSc) {
      const scParamsWide = useDigitMatch ? [rawTrim, dKey] : [rawTrim];
      const tidIdx = scParamsWide.length + 1;
      const orderFallback =
        useDigitMatch && rankParts.length > 0
          ? `ORDER BY CASE
           WHEN ${tenantColSc} IS NOT DISTINCT FROM $${tidIdx}::bigint THEN 0
           WHEN ${tenantColSc} IS NULL THEN 1
           ELSE 2
         END, ${rankParts.join(" + ")} DESC, id ASC`
          : `ORDER BY CASE
           WHEN ${tenantColSc} IS NOT DISTINCT FROM $${tidIdx}::bigint THEN 0
           WHEN ${tenantColSc} IS NULL THEN 1
           ELSE 2
         END, id ASC`;
      r = await query(
        `SELECT nis_medidor, nombre,
              ${selMedNis}
              NULLIF(TRIM(COALESCE(calle, '')), '') AS calle_cat,
              NULLIF(TRIM(COALESCE(numero, '')), '') AS numero_cat,
              NULLIF(TRIM(COALESCE(localidad, '')), '') AS localidad_cat,
              NULLIF(TRIM(COALESCE(tipo_conexion, '')), '') AS tipo_conexion_cat,
              NULLIF(TRIM(COALESCE(fases, '')), '') AS fases_cat,
              ${latExpr},
              ${lngExpr},
              ${ptSelSc},
              ${provExpr}
         FROM socios_catalogo
         WHERE COALESCE(activo, TRUE) = TRUE
           AND ${matchClause}
         ${orderFallback}
         LIMIT 1`,
        [...scParamsWide, tid]
      );
      row = r.rows?.[0];
      if (row) {
        console.warn("[whatsapp-reclamante-lookup] socios_catalogo: coincidencia sin filtro tenant estricto", {
          tenantId: tid,
          nis_medidor: row.nis_medidor,
          tenantCol: tenantColSc,
        });
      }
    }

    if (row) {
      const nm = String(row.nis_medidor || rawTrim).trim();
      const nombre = String(row.nombre || "").trim() || `Socio NIS ${nm}`;
      const nisV = row.nis_raw != null && String(row.nis_raw).trim() ? String(row.nis_raw).trim() : null;
      const medV = row.medidor_raw != null && String(row.medidor_raw).trim() ? String(row.medidor_raw).trim() : null;
      const coords = pickCoordDesdeFilaPadron(row, "lat_pad", "lng_pad");
      if (coords.catalogoLatitud == null) {
        debugReclamanteLookup("socios_sin_coords_en_padron", {
          nis_medidor: nm,
          nis: nisV,
          medidor: medV,
          tiene_latitud: scCols.has("latitud"),
          tiene_lat: scCols.has("lat"),
        });
      }
      debugReclamanteLookup("match_socios_catalogo", { nis_medidor: nm, nis: nisV, medidor: medV, ...coords });
      const out = {
        ok: true,
        clienteNombre: nombre,
        nis: nisV,
        medidor: medV,
        nisMedidor: medV || nisV || nm,
        catalogoCalle: row.calle_cat != null ? String(row.calle_cat).trim() || null : null,
        catalogoNumero: row.numero_cat != null ? String(row.numero_cat).trim() || null : null,
        catalogoLocalidad: row.localidad_cat != null ? String(row.localidad_cat).trim() || null : null,
        catalogoProvincia: row.provincia_cat != null ? String(row.provincia_cat).trim() || null : null,
        catalogoTipoConexion:
          row.tipo_conexion_cat != null ? String(row.tipo_conexion_cat).trim() || null : null,
        catalogoFases: row.fases_cat != null ? String(row.fases_cat).trim() || null : null,
        ...coords,
      };
      await enrichCoordsVecinosSiFalta(tid, out, "socios");
      return out;
    }
  }

  debugReclamanteLookup("sin_match", { tenantId: tid, rawTrim, digitKey: useDigitMatch ? dKey : null });
  return { ok: false };
}
