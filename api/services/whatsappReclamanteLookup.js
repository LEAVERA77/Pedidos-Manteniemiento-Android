import { query } from "../db/neon.js";

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

function nombreCompletoClienteFinal(row) {
  const n = [row?.nombre, row?.apellido].map((x) => String(x || "").trim()).filter(Boolean);
  return n.length ? n.join(" ") : null;
}

/** Quita espacios raros y recorta; no altera mayúsculas (comparaciones SQL hacen TRIM/UPPER donde aplica). */
export function normalizarIdentificadorReclamoWhatsapp(texto) {
  return String(texto || "")
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
  const la = row?.[latKey];
  const lo = row?.[lngKey];
  const lat = la != null ? Number(la) : NaN;
  const lng = lo != null ? Number(lo) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { catalogoLatitud: null, catalogoLongitud: null };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { catalogoLatitud: null, catalogoLongitud: null };
  return { catalogoLatitud: lat, catalogoLongitud: lng };
}

/**
 * Busca nombre / NIS para el reclamo: ID usuario del tenant, NIS/medidor/número en clientes_finales, o socios_catalogo.
 * @returns {{ ok: true, clienteNombre: string, nis: string|null, medidor: string|null, nisMedidor: string|null, catalogoCalle?: string|null, catalogoNumero?: string|null, catalogoLocalidad?: string|null, catalogoProvincia?: string|null, catalogoBarrio?: string|null, catalogoTipoConexion?: string|null, catalogoFases?: string|null, catalogoLatitud?: number|null, catalogoLongitud?: number|null } | { ok: false } | { skip: true }}
 */
export async function buscarIdentidadParaReclamoWhatsApp(tenantId, texto) {
  const rawTrim = normalizarIdentificadorReclamoWhatsapp(texto);
  if (!rawTrim) return { skip: true };
  const low = rawTrim.toLowerCase();
  if (/^(no|n|salto|siguiente|omitir|sigue|skip|-|na)$/i.test(low)) {
    return { skip: true };
  }

  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return { ok: false };

  const dKey = soloDigitosIdentificadorReclamo(rawTrim);
  const useDigitMatch = dKey.length >= 4 && dKey.length <= 24;

  debugReclamanteLookup("entrada", {
    tenantId: tid,
    rawTrim,
    digitKey: useDigitMatch ? dKey : null,
  });

  const colSet = await columnasUsuarios();
  const tenantCol = colSet.has("tenant_id") ? "tenant_id" : colSet.has("cliente_id") ? "cliente_id" : null;

  // 1) ID numérico → usuario del mismo tenant
  if (/^\d+$/.test(rawTrim) && tenantCol) {
    const idNum = parseInt(rawTrim, 10);
    if (Number.isFinite(idNum) && idNum >= 1) {
      const ru = await query(
        `SELECT id, nombre, email FROM usuarios
         WHERE id = $1 AND ${tenantCol} = $2 AND activo = TRUE LIMIT 1`,
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
    const cfCols = await columnasTabla("clientes_finales");
    const provExpr = cfCols.has("provincia")
      ? "NULLIF(TRIM(COALESCE(provincia, '')), '') AS provincia_cat"
      : "NULL::text AS provincia_cat";
    const latExpr = cfCols.has("latitud") ? "latitud AS lat_pad" : "NULL::numeric AS lat_pad";
    const lngExpr = cfCols.has("longitud") ? "longitud AS lng_pad" : "NULL::numeric AS lng_pad";
    const params = [tid, rawTrim];
    let extraMatch = "";
    if (useDigitMatch) {
      params.push(dKey);
      const dk = 3;
      extraMatch += ` OR (
          LENGTH($${dk}::text) >= 4 AND (
            regexp_replace(TRIM(COALESCE(nis, '')), '[^0-9]', '', 'g') = $${dk}
            OR regexp_replace(TRIM(COALESCE(medidor, '')), '[^0-9]', '', 'g') = $${dk}
            OR regexp_replace(TRIM(COALESCE(numero_cliente::text, '')), '[^0-9]', '', 'g') = $${dk}
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
              ${provExpr}
       FROM clientes_finales
       WHERE cliente_id = $1 AND activo = TRUE
         AND (
           TRIM(COALESCE(nis, '')) = $2
           OR TRIM(COALESCE(medidor, '')) = $2
           OR TRIM(COALESCE(numero_cliente::text, '')) = $2
           OR CAST(id AS TEXT) = $2
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
      const coords = pickCoord(row, "lat_pad", "lng_pad");
      debugReclamanteLookup("match_clientes_finales", { id: row.id, nis: nisVal, medidor: med, ...coords });
      return {
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
      };
    }
  }

  // 3) socios_catalogo (cooperativa eléctrica; match exacto o por dígitos; tenant si la columna existe)
  if (await tableExists("socios_catalogo")) {
    const scCols = await columnasTabla("socios_catalogo");
    const provExpr = scCols.has("provincia")
      ? "NULLIF(TRIM(COALESCE(provincia, '')), '') AS provincia_cat"
      : "NULL::text AS provincia_cat";
    const latExpr = scCols.has("latitud") ? "latitud AS lat_pad" : "NULL::numeric AS lat_pad";
    const lngExpr = scCols.has("longitud") ? "longitud AS lng_pad" : "NULL::numeric AS lng_pad";

    const tenantColSc = scCols.has("cliente_id")
      ? "cliente_id"
      : scCols.has("tenant_id")
        ? "tenant_id"
        : null;

    const matchClause = useDigitMatch
      ? `(
          UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM($1))
          OR (
            LENGTH($2::text) >= 4
            AND regexp_replace(TRIM(COALESCE(nis_medidor,'')), '[^0-9]', '', 'g') = $2
          )
        )`
      : `UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM($1))`;

    const scParams = useDigitMatch ? [rawTrim, dKey] : [rawTrim];
    let tenantSql = "";
    if (tenantColSc) {
      const pT = scParams.length + 1;
      tenantSql = ` AND (${tenantColSc} IS NULL OR ${tenantColSc} = $${pT})`;
      scParams.push(tid);
    }

    const r = await query(
      `SELECT nis_medidor, nombre,
              NULLIF(TRIM(COALESCE(calle, '')), '') AS calle_cat,
              NULLIF(TRIM(COALESCE(numero, '')), '') AS numero_cat,
              NULLIF(TRIM(COALESCE(localidad, '')), '') AS localidad_cat,
              NULLIF(TRIM(COALESCE(tipo_conexion, '')), '') AS tipo_conexion_cat,
              NULLIF(TRIM(COALESCE(fases, '')), '') AS fases_cat,
              ${latExpr},
              ${lngExpr},
              ${provExpr}
       FROM socios_catalogo
       WHERE activo = TRUE
         AND ${matchClause}
         ${tenantSql}
       LIMIT 1`,
      scParams
    );
    const row = r.rows?.[0];
    if (row) {
      const nm = String(row.nis_medidor || rawTrim).trim();
      const nombre = String(row.nombre || "").trim() || `Socio NIS ${nm}`;
      const coords = pickCoord(row, "lat_pad", "lng_pad");
      debugReclamanteLookup("match_socios_catalogo", { nis_medidor: nm, ...coords });
      return {
        ok: true,
        clienteNombre: nombre,
        nis: null,
        medidor: null,
        nisMedidor: nm,
        catalogoCalle: row.calle_cat != null ? String(row.calle_cat).trim() || null : null,
        catalogoNumero: row.numero_cat != null ? String(row.numero_cat).trim() || null : null,
        catalogoLocalidad: row.localidad_cat != null ? String(row.localidad_cat).trim() || null : null,
        catalogoProvincia: row.provincia_cat != null ? String(row.provincia_cat).trim() || null : null,
        catalogoTipoConexion:
          row.tipo_conexion_cat != null ? String(row.tipo_conexion_cat).trim() || null : null,
        catalogoFases: row.fases_cat != null ? String(row.fases_cat).trim() || null : null,
        ...coords,
      };
    }
  }

  debugReclamanteLookup("sin_match", { tenantId: tid, rawTrim, digitKey: useDigitMatch ? dKey : null });
  return { ok: false };
}
