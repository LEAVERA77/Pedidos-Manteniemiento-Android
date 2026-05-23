/**
 * Búsqueda en padrón (socios_catalogo + clientes_finales) para alta de pedido en mapa (admin / técnico).
 * made by leavera77
 */

import { query } from "../db/neon.js";
import { tableHasColumn } from "../utils/tenantScope.js";
import { loadTenantBusinessContext } from "../utils/businessScope.js";
import { normalizarRubroCliente } from "../services/businessType.js";
import {
  buscarFilasPorNombreSociosCatalogo,
  levenshteinDistance,
  normalizarTextoBusquedaNombreWa,
} from "../modules/busqueda-nombre-bot.js";
import { buscarIdentidadParaReclamoWhatsApp } from "./whatsappReclamanteLookup.js";

/** @typedef {'socios_catalogo'|'clientes_finales'} PadronSource */

/**
 * @param {unknown} row
 * @param {PadronSource} source
 */
function mapSocioCatalogoRow(row, source = "socios_catalogo") {
  const nis = row?.nis != null && String(row.nis).trim() ? String(row.nis).trim() : null;
  const med = row?.medidor != null && String(row.medidor).trim() ? String(row.medidor).trim() : null;
  const nm = row?.nis_medidor != null && String(row.nis_medidor).trim() ? String(row.nis_medidor).trim() : null;
  const numCli =
    row?.numero_cliente != null && String(row.numero_cliente).trim()
      ? String(row.numero_cliente).trim()
      : null;
  const identificador = nm || med || nis || numCli || (row?.id != null ? `#${row.id}` : "");
  return {
    source,
    id: Number(row.id),
    nombre: String(row.nombre || "").trim() || "Sin nombre",
    identificador,
    nis,
    medidor: med,
    nis_medidor: nm,
    numero_cliente: numCli,
    calle: row.calle != null ? String(row.calle).trim() || null : null,
    numero: row.numero != null ? String(row.numero).trim() || null : null,
    localidad: row.localidad != null ? String(row.localidad).trim() || null : null,
    barrio: row.barrio != null ? String(row.barrio).trim() || null : null,
    telefono: row.telefono != null ? String(row.telefono).trim() || null : null,
    transformador:
      row.transformador != null ? String(row.transformador).trim() || null : null,
    distribuidor_codigo:
      row.distribuidor_codigo != null ? String(row.distribuidor_codigo).trim() || null : null,
    tipo_conexion:
      row.tipo_conexion != null ? String(row.tipo_conexion).trim() || null : null,
    fases: row.fases != null ? String(row.fases).trim() || null : null,
    nombre_dist: row.nombre_dist != null ? Number(row.nombre_dist) : null,
  };
}

function mapClienteFinalRow(row) {
  const nom = [row.nombre, row.apellido]
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  const nis = row.nis != null && String(row.nis).trim() ? String(row.nis).trim() : null;
  const med = row.medidor != null && String(row.medidor).trim() ? String(row.medidor).trim() : null;
  const numCli =
    row.numero_cliente != null && String(row.numero_cliente).trim()
      ? String(row.numero_cliente).trim()
      : null;
  return mapSocioCatalogoRow(
    {
      id: row.id,
      nombre: nom || "Vecino",
      nis,
      medidor: med,
      nis_medidor: med || nis || numCli,
      numero_cliente: numCli,
      calle: row.calle,
      numero: row.numero_puerta,
      localidad: row.localidad,
      barrio: row.barrio,
      telefono: row.telefono,
      transformador: null,
      distribuidor_codigo: null,
      tipo_conexion: null,
      fases: null,
    },
    "clientes_finales"
  );
}

/**
 * @param {number} tenantId
 * @param {string} q
 * @param {number} [limit]
 */
export async function buscarPadronPorIdentificador(tenantId, q, limit = 12) {
  const raw = String(q || "").trim();
  if (!raw || raw.length < 2) return { matches: [] };
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return { matches: [] };

  const matches = [];
  const seen = new Set();

  const pushUnique = (m) => {
    const key = `${m.source}:${m.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(m);
  };

  const hasTenant = await tableHasColumn("socios_catalogo", "tenant_id");
  const wf = hasTenant ? " AND tenant_id = $1" : "";
  const params = hasTenant ? [tid, raw] : [raw];
  const identIdx = hasTenant ? 2 : 1;
  const identMatch = `(
    UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM($${identIdx}))
    OR UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM($${identIdx}))
    OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM($${identIdx}))
  )`;

  try {
    const r = await query(
      `SELECT id, nombre, nis, medidor, nis_medidor, calle, numero, localidad, barrio, telefono,
              transformador, distribuidor_codigo, tipo_conexion, fases
       FROM socios_catalogo
       WHERE COALESCE(activo, TRUE) = TRUE${wf}
         AND ${identMatch}
       ORDER BY id ASC
       LIMIT ${Math.min(limit, 15)}`,
      params
    );
    for (const row of r.rows || []) {
      pushUnique(mapSocioCatalogoRow(row, "socios_catalogo"));
      if (matches.length >= limit) break;
    }
  } catch (_) {}

  if (matches.length < limit) {
    try {
      const r2 = await query(
        `SELECT id, nombre, apellido, nis, medidor, numero_cliente, calle, numero_puerta, localidad, barrio, telefono
         FROM clientes_finales
         WHERE cliente_id = $1 AND COALESCE(activo, TRUE) = TRUE
           AND (
             UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM($2))
             OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM($2))
             OR UPPER(TRIM(COALESCE(numero_cliente,''))) = UPPER(TRIM($2))
           )
         ORDER BY id ASC
         LIMIT ${Math.min(limit, 15)}`,
        [tid, raw]
      );
      for (const row of r2.rows || []) {
        pushUnique(mapClienteFinalRow(row));
        if (matches.length >= limit) break;
      }
    } catch (_) {}
  }

  if (matches.length < limit) {
    try {
      const idRes = await buscarIdentidadParaReclamoWhatsApp(tid, raw);
      if (idRes && idRes.ok) {
        const ident = idRes.nisMedidor || idRes.medidor || idRes.nis || raw;
        if (ident && hasTenant) {
          const r3 = await query(
            `SELECT id, nombre, nis, medidor, nis_medidor, calle, numero, localidad, barrio, telefono,
                    transformador, distribuidor_codigo, tipo_conexion, fases
             FROM socios_catalogo
             WHERE COALESCE(activo, TRUE) = TRUE AND tenant_id = $1
               AND (
                 UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM($2))
                 OR UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM($2))
                 OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM($2))
               )
             LIMIT 1`,
            [tid, ident]
          );
          if (r3.rows?.[0]) {
            pushUnique(mapSocioCatalogoRow(r3.rows[0], "socios_catalogo"));
          } else {
            pushUnique(
              mapSocioCatalogoRow(
                {
                  id: 0,
                  nombre: idRes.clienteNombre,
                  nis: idRes.nis,
                  medidor: idRes.medidor,
                  nis_medidor: ident,
                  calle: idRes.catalogoCalle,
                  numero: idRes.catalogoNumero,
                  localidad: idRes.catalogoLocalidad,
                  barrio: idRes.catalogoBarrio,
                  tipo_conexion: idRes.catalogoTipoConexion,
                  fases: idRes.catalogoFases,
                },
                "socios_catalogo"
              )
            );
          }
        }
      }
    } catch (e) {
      console.warn("[padron-busqueda] identidad fallback", e?.message || e);
    }
  }

  return { matches: matches.slice(0, limit) };
}

/**
 * @param {number} tenantId
 * @param {string} q
 * @param {{ rubro?: string|null, limit?: number }} [opts]
 */
export async function buscarPadronPorNombre(tenantId, q, opts = {}) {
  const texto = String(q || "")
    .replace(/\s+/g, " ")
    .trim();
  const limit = Math.min(20, Math.max(1, Number(opts.limit) || 15));
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1 || texto.length < 2) return { matches: [] };

  let rubro = opts.rubro != null ? normalizarRubroCliente(opts.rubro) : null;
  if (!rubro) {
    const ctx = await loadTenantBusinessContext(tid);
    const r0 = await query(`SELECT tipo FROM clientes WHERE id = $1 LIMIT 1`, [tid]);
    rubro = normalizarRubroCliente(r0.rows?.[0]?.tipo) || "cooperativa_electrica";
    void ctx;
  }

  const matches = [];
  const seen = new Set();
  const pushUnique = (m) => {
    const key = `${m.source}:${m.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(m);
  };

  const rowsSc = await buscarFilasPorNombreSociosCatalogo({ tenantId: tid, textoNombre: texto, limit });
  for (const row of rowsSc) {
    pushUnique(
      mapSocioCatalogoRow(
        {
          ...row,
          calle: row.calle,
          numero: row.numero,
        },
        "socios_catalogo"
      )
    );
  }

  if (rubro === "municipio" || rubro === "cooperativa_agua") {
    const needleNorm = normalizarTextoBusquedaNombreWa(texto);
    const tok = needleNorm.split(/\s+/).filter((t) => t.length >= 2)[0] || needleNorm.slice(0, 4);
    if (tok) {
      try {
        const r = await query(
          `SELECT id, nombre, apellido, nis, medidor, numero_cliente, calle, numero_puerta, localidad, barrio, telefono
           FROM clientes_finales
           WHERE cliente_id = $1 AND COALESCE(activo, TRUE) = TRUE
             AND (
               LOWER(TRIM(COALESCE(apellido,''))) LIKE LOWER($2)
               OR LOWER(TRIM(COALESCE(nombre,''))) LIKE LOWER($2)
               OR LOWER(TRIM(COALESCE(apellido,''))) || ' ' || LOWER(TRIM(COALESCE(nombre,''))) LIKE LOWER($2)
             )
           ORDER BY apellido NULLS LAST, nombre NULLS LAST
           LIMIT 400`,
          [tid, `%${tok}%`]
        );
        const candidatos = (r.rows || [])
          .map((row) => {
            const nom = [row.nombre, row.apellido]
              .map((x) => (x != null ? String(x).trim() : ""))
              .filter(Boolean)
              .join(" ")
              .trim();
            return { row, nom, dist: levenshteinDistance(needleNorm, nom) };
          })
          .filter((x) => x.dist <= 5)
          .sort((a, b) => a.dist - b.dist || a.row.id - b.row.id)
          .slice(0, limit);
        for (const { row, dist } of candidatos) {
          const m = mapClienteFinalRow(row);
          m.nombre_dist = dist;
          pushUnique(m);
          if (matches.length >= limit) break;
        }
      } catch (e) {
        console.warn("[padron-busqueda] clientes_finales nombre", e?.message || e);
      }
    }
  }

  matches.sort(
    (a, b) =>
      (a.nombre_dist ?? 99) - (b.nombre_dist ?? 99) ||
      String(a.nombre).localeCompare(String(b.nombre), "es")
  );

  return { matches: matches.slice(0, limit) };
}
