/**
 * Import socios: eliminar del catálogo los que no vienen en el Excel (tenant + rubro).
 * made by leavera77
 */

import {
  getSociosCatalogoSchema,
  andFragmentSociosCatalogoDesdeSchema,
} from './socios-catalogo-schema-cache.js';

/**
 * @param {{ sqlSimple: (q: string) => Promise<{ rows?: { id?: number, nis_medidor?: string }[] }>, esc: (v: unknown) => string, tenantIdActual: () => number }} deps
 * @param {Array<{ nis_medidor: string }>} payloadsUnicos
 */
export async function eliminarSociosCatalogoNoEnExcel(deps, payloadsUnicos) {
  const schema = await getSociosCatalogoSchema(deps.sqlSimple);
  const andSoc = andFragmentSociosCatalogoDesdeSchema(
    schema,
    deps.esc,
    deps.tenantIdActual,
    typeof window !== 'undefined' ? window.EMPRESA_CFG : null
  );
  const r = await deps.sqlSimple(
    `SELECT id, nis_medidor FROM socios_catalogo WHERE 1=1${andSoc}`
  );
  const enExcel = new Set(
    (payloadsUnicos || [])
      .map((p) => String(p.nis_medidor || '').trim())
      .filter(Boolean)
  );
  const toDelete = (r.rows || []).filter((row) => {
    const k = String(row.nis_medidor || '').trim();
    return k && !enExcel.has(k);
  });
  if (!toDelete.length) {
    return { eliminados: 0, cancelado: false, pendientesEliminar: 0 };
  }

  const ok = window.confirm(
    `El Excel no incluye ${toDelete.length} socio(s) que están hoy en el catálogo de este tenant y línea de negocio.\n\n` +
      `¿Eliminarlos de la base de datos?\n\n` +
      `Los socios que sí vienen en el archivo se mantienen o se actualizan.`
  );
  if (!ok) {
    return {
      eliminados: 0,
      cancelado: true,
      pendientesEliminar: toDelete.length,
    };
  }

  let eliminados = 0;
  const chunkSize = 80;
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const chunk = toDelete.slice(i, i + chunkSize);
    const ids = chunk.map((row) => deps.esc(row.id)).join(',');
    try {
      await deps.sqlSimple(`DELETE FROM socios_catalogo WHERE id IN (${ids})`);
      eliminados += chunk.length;
    } catch (e) {
      for (const row of chunk) {
        try {
          await deps.sqlSimple(`DELETE FROM socios_catalogo WHERE id = ${deps.esc(row.id)}`);
          eliminados++;
        } catch (_) {}
      }
      if (eliminados === 0) throw e;
    }
  }
  return { eliminados, cancelado: false, pendientesEliminar: toDelete.length };
}

/**
 * @param {Parameters<typeof eliminarSociosCatalogoNoEnExcel>[0]} deps
 * @param {Array<{ nis_medidor: string }>} payloadsUnicos
 */
export async function contarNuevosYActualizadosSociosExcel(deps, payloadsUnicos) {
  const schema = await getSociosCatalogoSchema(deps.sqlSimple);
  const andSoc = andFragmentSociosCatalogoDesdeSchema(
    schema,
    deps.esc,
    deps.tenantIdActual,
    typeof window !== 'undefined' ? window.EMPRESA_CFG : null
  );
  const r = await deps.sqlSimple(
    `SELECT nis_medidor FROM socios_catalogo WHERE 1=1${andSoc}`
  );
  const exist = new Set(
    (r.rows || []).map((row) => String(row.nis_medidor || '').trim()).filter(Boolean)
  );
  let nuevos = 0;
  let actualizados = 0;
  for (const p of payloadsUnicos || []) {
    const k = String(p.nis_medidor || '').trim();
    if (!k) continue;
    if (exist.has(k)) actualizados++;
    else nuevos++;
  }
  return { nuevos, actualizados };
}
