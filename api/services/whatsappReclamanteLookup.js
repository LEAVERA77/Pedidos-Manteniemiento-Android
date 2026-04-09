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

/**
 * Busca nombre / NIS para el reclamo: ID usuario del tenant, NIS/medidor/número en clientes_finales, o socios_catalogo.
 * @returns {{ ok: true, clienteNombre: string, nis: string|null, medidor: string|null, nisMedidor: string|null, catalogoCalle?: string|null, catalogoNumero?: string|null, catalogoLocalidad?: string|null, catalogoProvincia?: string|null, catalogoBarrio?: string|null, catalogoTipoConexion?: string|null, catalogoFases?: string|null } | { ok: false } | { skip: true }}
 */
export async function buscarIdentidadParaReclamoWhatsApp(tenantId, texto) {
  const raw = String(texto || "").trim();
  if (!raw) return { skip: true };
  const low = raw.toLowerCase();
  if (/^(no|n|salto|siguiente|omitir|sigue|skip|-|na)$/i.test(low)) {
    return { skip: true };
  }

  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return { ok: false };

  const colSet = await columnasUsuarios();
  const tenantCol = colSet.has("tenant_id") ? "tenant_id" : colSet.has("cliente_id") ? "cliente_id" : null;

  // 1) ID numérico → usuario del mismo tenant
  if (/^\d+$/.test(raw) && tenantCol) {
    const idNum = parseInt(raw, 10);
    if (Number.isFinite(idNum) && idNum >= 1) {
      const ru = await query(
        `SELECT id, nombre, email FROM usuarios
         WHERE id = $1 AND ${tenantCol} = $2 AND activo = TRUE LIMIT 1`,
        [idNum, tid]
      );
      const u = ru.rows?.[0];
      if (u) {
        const nombre = String(u.nombre || "").trim() || String(u.email || "").trim() || `Usuario #${u.id}`;
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
    const r = await query(
      `SELECT id, nombre, apellido, nis, medidor, numero_cliente,
              NULLIF(TRIM(COALESCE(calle, '')), '') AS calle_cat,
              NULLIF(TRIM(COALESCE(numero_puerta, '')), '') AS numero_cat,
              NULLIF(TRIM(COALESCE(localidad, '')), '') AS localidad_cat,
              NULLIF(TRIM(COALESCE(barrio, '')), '') AS barrio_cat,
              ${provExpr}
       FROM clientes_finales
       WHERE cliente_id = $1 AND activo = TRUE
         AND (
           TRIM(COALESCE(nis, '')) = $2
           OR TRIM(COALESCE(medidor, '')) = $2
           OR TRIM(COALESCE(numero_cliente::text, '')) = $2
           OR CAST(id AS TEXT) = $2
         )
       LIMIT 1`,
      [tid, raw]
    );
    const row = r.rows?.[0];
    if (row) {
      const cn = nombreCompletoClienteFinal(row);
      const label = cn || `Socio #${row.id}`;
      const nisVal = row.nis != null && String(row.nis).trim() ? String(row.nis).trim() : null;
      const med = row.medidor != null && String(row.medidor).trim() ? String(row.medidor).trim() : null;
      return {
        ok: true,
        clienteNombre: label,
        nis: nisVal,
        medidor: med,
        nisMedidor: med || nisVal || raw,
        catalogoCalle: row.calle_cat != null ? String(row.calle_cat).trim() || null : null,
        catalogoNumero: row.numero_cat != null ? String(row.numero_cat).trim() || null : null,
        catalogoLocalidad: row.localidad_cat != null ? String(row.localidad_cat).trim() || null : null,
        catalogoBarrio: row.barrio_cat != null ? String(row.barrio_cat).trim() || null : null,
        catalogoProvincia: row.provincia_cat != null ? String(row.provincia_cat).trim() || null : null,
      };
    }
  }

  // 3) socios_catalogo (sin tenant; coincide por NIS/medidor, TRIM + mayúsculas)
  if (await tableExists("socios_catalogo")) {
    const scCols = await columnasTabla("socios_catalogo");
    const provExpr = scCols.has("provincia")
      ? "NULLIF(TRIM(COALESCE(provincia, '')), '') AS provincia_cat"
      : "NULL::text AS provincia_cat";
    const r = await query(
      `SELECT nis_medidor, nombre,
              NULLIF(TRIM(COALESCE(calle, '')), '') AS calle_cat,
              NULLIF(TRIM(COALESCE(numero, '')), '') AS numero_cat,
              NULLIF(TRIM(COALESCE(localidad, '')), '') AS localidad_cat,
              NULLIF(TRIM(COALESCE(tipo_conexion, '')), '') AS tipo_conexion_cat,
              NULLIF(TRIM(COALESCE(fases, '')), '') AS fases_cat,
              ${provExpr}
       FROM socios_catalogo
       WHERE activo = TRUE
         AND UPPER(TRIM(nis_medidor)) = UPPER(TRIM($1))
       LIMIT 1`,
      [raw]
    );
    const row = r.rows?.[0];
    if (row) {
      const nm = String(row.nis_medidor || raw).trim();
      const nombre = String(row.nombre || "").trim() || `Socio NIS ${nm}`;
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
      };
    }
  }

  return { ok: false };
}
