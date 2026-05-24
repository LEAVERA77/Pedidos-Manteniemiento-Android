/**
 * Import Excel → tabla distribuidores (ramales / barrios / distribuidores): fusionar, no vaciar.
 * made by leavera77
 */

import XLSX from "xlsx";

function normHeaderKey(k) {
  return String(k || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function canonicalizeExcelRow(row) {
  const canon = {};
  const provided = new Set();
  for (const [rawKey, val] of Object.entries(row)) {
    const nk = normHeaderKey(rawKey);
    if (!nk) continue;
    const s = val != null && String(val).trim() !== "" ? String(val).trim() : "";
    let target = null;
    if (nk === "codigo" || nk === "id distribuidor" || nk === "id_distribuidor" || (nk.startsWith("id") && nk.includes("distribuidor"))) {
      target = "codigo";
    } else if (nk === "nombre" || nk === "barrio" || nk === "ramal") {
      target = "nombre";
    } else if (nk === "tension" || nk.includes("tension")) {
      target = "tension";
    } else if (nk === "localidad") {
      target = "localidad";
    }
    if (!target) continue;
    canon[target] = s;
    if (s) provided.add(target);
  }
  return { canon, provided };
}

function buildPayload(canon) {
  const codigo = String(canon.codigo || "").trim().toUpperCase();
  if (!codigo) return { err: "codigo_vacio" };
  const nombre = canon.nombre && String(canon.nombre).trim() ? String(canon.nombre).trim() : codigo;
  const tension = canon.tension && String(canon.tension).trim() ? String(canon.tension).trim() : null;
  const localidad = canon.localidad && String(canon.localidad).trim() ? String(canon.localidad).trim() : null;
  return { codigo, nombre, tension, localidad };
}

/**
 * @param {Buffer} buffer
 * @param {number} tenantId
 * @param {import("pg").PoolClient} client
 * @param {{ hasTenantId: boolean, hasLocalidad: boolean }} flags
 */
export async function mergeDistribuidoresCatalogoFromExcelBuffer(buffer, tenantId, client, flags) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) {
    return { insertados: 0, actualizados: 0, sin_cambios: 0, errores: [{ fila: 0, error: "archivo_vacio" }], total: 0 };
  }

  const byCod = new Map();
  const errores = [];
  let fila = 1;
  for (const raw of rows) {
    fila++;
    const { canon } = canonicalizeExcelRow(raw);
    const p = buildPayload(canon);
    if (p.err) {
      errores.push({ fila, error: p.err });
      continue;
    }
    byCod.set(p.codigo, p);
  }

  let insertados = 0;
  let actualizados = 0;
  let sin_cambios = 0;
  const tid = Number(tenantId);

  for (const cod of [...byCod.keys()].sort()) {
    const p = byCod.get(cod);
    let ex;
    if (flags.hasTenantId) {
      ex = await client.query(
        `SELECT id, codigo, nombre, tension, localidad, activo FROM distribuidores WHERE tenant_id = $1 AND UPPER(TRIM(codigo)) = $2 LIMIT 1`,
        [tid, cod]
      );
    } else {
      ex = await client.query(`SELECT id, codigo, nombre, tension, localidad, activo FROM distribuidores WHERE UPPER(TRIM(codigo)) = $1 LIMIT 1`, [cod]);
    }

    if (!ex.rows.length) {
      if (flags.hasTenantId) {
        if (flags.hasLocalidad) {
          await client.query(
            `INSERT INTO distribuidores (codigo, nombre, tension, localidad, activo, tenant_id) VALUES ($1,$2,$3,$4,TRUE,$5)`,
            [p.codigo, p.nombre, p.tension, p.localidad, tid]
          );
        } else {
          await client.query(
            `INSERT INTO distribuidores (codigo, nombre, tension, activo, tenant_id) VALUES ($1,$2,$3,TRUE,$4)`,
            [p.codigo, p.nombre, p.tension, tid]
          );
        }
      } else if (flags.hasLocalidad) {
        await client.query(
          `INSERT INTO distribuidores (codigo, nombre, tension, localidad, activo) VALUES ($1,$2,$3,$4,TRUE)
           ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension, localidad = EXCLUDED.localidad, activo = TRUE`,
          [p.codigo, p.nombre, p.tension, p.localidad]
        );
      } else {
        await client.query(
          `INSERT INTO distribuidores (codigo, nombre, tension, activo) VALUES ($1,$2,$3,TRUE)
           ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tension = EXCLUDED.tension, activo = TRUE`,
          [p.codigo, p.nombre, p.tension]
        );
      }
      insertados++;
      continue;
    }

    const row = ex.rows[0];
    const same =
      String(row.nombre || "") === String(p.nombre) &&
      String(row.tension || "") === String(p.tension || "") &&
      String(row.localidad || "") === String(p.localidad || "") &&
      row.activo !== false;
    if (same) {
      sin_cambios++;
      continue;
    }

    if (flags.hasTenantId) {
      if (flags.hasLocalidad) {
        await client.query(
          `UPDATE distribuidores SET nombre = $2, tension = $3, localidad = $4, activo = TRUE WHERE id = $1 AND tenant_id = $5`,
          [row.id, p.nombre, p.tension, p.localidad, tid]
        );
      } else {
        await client.query(
          `UPDATE distribuidores SET nombre = $2, tension = $3, activo = TRUE WHERE id = $1 AND tenant_id = $4`,
          [row.id, p.nombre, p.tension, tid]
        );
      }
    } else if (flags.hasLocalidad) {
      await client.query(
        `UPDATE distribuidores SET nombre = $2, tension = $3, localidad = $4, activo = TRUE WHERE id = $1`,
        [row.id, p.nombre, p.tension, p.localidad]
      );
    } else {
      await client.query(
        `UPDATE distribuidores SET nombre = $2, tension = $3, activo = TRUE WHERE id = $1`,
        [row.id, p.nombre, p.tension]
      );
    }
    actualizados++;
  }

  const ausentes_en_excel = [];
  const dbAll = flags.hasTenantId
    ? await client.query(
        `SELECT codigo, nombre, tension, localidad FROM distribuidores WHERE tenant_id = $1 AND COALESCE(activo, TRUE) = TRUE ORDER BY codigo`,
        [tid]
      )
    : await client.query(
        `SELECT codigo, nombre, tension, localidad FROM distribuidores WHERE COALESCE(activo, TRUE) = TRUE ORDER BY codigo`
      );

  for (const row of dbAll.rows || []) {
    const c = String(row.codigo || "")
      .trim()
      .toUpperCase();
    if (!c || byCod.has(c)) continue;
    ausentes_en_excel.push({
      codigo: row.codigo,
      nombre: row.nombre,
      localidad: row.localidad,
      tension: row.tension,
    });
  }

  return {
    insertados,
    actualizados,
    sin_cambios,
    errores,
    total: byCod.size,
    total_excel_filas: rows.length,
    ausentes_en_excel,
    dados_de_baja: 0,
  };
}

/**
 * Baja lógica (activo = FALSE), no DELETE.
 * @param {number} tenantId
 * @param {string[]} codigos
 * @param {import("pg").PoolClient} client
 * @param {{ hasTenantId: boolean }} flags
 */
export async function darDeBajaDistribuidoresCatalogoPorCodigos(tenantId, codigos, client, flags) {
  const codes = [...new Set(codigos.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))];
  if (!codes.length) return { dados_de_baja: 0, codigos: [] };
  let r;
  if (flags.hasTenantId) {
    r = await client.query(
      `UPDATE distribuidores SET activo = FALSE
       WHERE tenant_id = $1 AND UPPER(TRIM(codigo)) = ANY($2::text[])
       RETURNING codigo`,
      [tenantId, codes]
    );
  } else {
    r = await client.query(
      `UPDATE distribuidores SET activo = FALSE
       WHERE UPPER(TRIM(codigo)) = ANY($1::text[])
       RETURNING codigo`,
      [codes]
    );
  }
  return { dados_de_baja: (r.rows || []).length, codigos: (r.rows || []).map((x) => x.codigo) };
}
