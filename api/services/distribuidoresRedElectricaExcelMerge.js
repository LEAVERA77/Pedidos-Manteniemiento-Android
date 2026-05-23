import XLSX from "xlsx";

function normHeaderKey(k) {
  return String(k || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{ canon: Record<string, string>, provided: Set<string> }}
 */
function canonicalizeExcelRow(row) {
  /** @type {Record<string, string>} */
  const canon = {};
  const provided = new Set();
  for (const [rawKey, val] of Object.entries(row)) {
    const nk = normHeaderKey(rawKey);
    if (!nk) continue;
    const s = val != null && String(val).trim() !== "" ? String(val).trim() : "";
    let target = null;
    if (nk === "codigo" || nk === "id distribuidor" || nk === "id_distribuidor" || (nk.startsWith("id") && nk.includes("distribuidor"))) {
      target = "codigo";
    } else if (nk === "nombre") {
      target = "nombre";
    } else if (nk === "localidad") {
      target = "localidad";
    } else if ((nk.includes("nivel") && nk.includes("tension")) || nk === "nivel de tension" || nk === "nivel de tensión") {
      target = "nivel_tension";
    } else if (nk === "trafos" || nk === "trafo" || nk === "transformadores") {
      target = "trafos";
    } else if (nk === "kva" || nk.startsWith("kva")) {
      target = "kva";
    } else if (nk === "clientes" || (nk.includes("cliente") && !nk.includes("ubicacion"))) {
      target = "clientes";
    }
    if (!target) continue;
    canon[target] = s;
    if (s) provided.add(target);
  }
  return { canon, provided };
}

function parseIntLoose(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = parseInt(String(v).replace(/\./g, "").replace(/,/g, ".").split(".")[0], 10);
  return Number.isFinite(n) ? n : null;
}

function parseNumLoose(v) {
  if (v == null || String(v).trim() === "") return null;
  const s = String(v).trim().replace(/\s/g, "");
  let n;
  if (s.includes(",") && s.includes(".")) {
    n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  } else {
    n = parseFloat(s.replace(",", "."));
  }
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, string>} canon
 * @param {Set<string>} provided
 */
function buildPayload(canon, provided) {
  const codigo = String(canon.codigo || "").trim().toUpperCase();
  if (!codigo) return { err: "codigo_vacio" };
  const nombre = canon.nombre && String(canon.nombre).trim() ? String(canon.nombre).trim() : codigo;
  const localidad = canon.localidad && String(canon.localidad).trim() ? String(canon.localidad).trim() : null;
  const nt = parseIntLoose(canon.nivel_tension);
  const nivel_tension = nt != null ? nt : 0;
  const tf = parseIntLoose(canon.trafos);
  const trafos = tf != null ? tf : 0;
  const kv = parseNumLoose(canon.kva);
  const kva = kv != null ? Math.round(kv) : 0;
  const cl = parseIntLoose(canon.clientes);
  const clientes = cl != null ? cl : 0;
  return { codigo, nombre, localidad, nivel_tension, trafos, kva, clientes, provided };
}

function rowEqualDb(row, p) {
  return (
    String(row.nombre || "") === String(p.nombre) &&
    String(row.localidad || "") === String(p.localidad || "") &&
    Number(row.nivel_tension || 0) === Number(p.nivel_tension) &&
    Number(row.trafos || 0) === Number(p.trafos) &&
    Number(row.kva || 0) === Number(p.kva) &&
    Number(row.clientes || 0) === Number(p.clientes)
  );
}

/**
 * @param {Buffer} buffer
 * @param {number} tenantId
 * @param {import("pg").PoolClient} client
 */
export async function mergeDistribuidoresRedFromExcelBuffer(buffer, tenantId, client) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) {
    return { insertados: 0, actualizados: 0, sin_cambios: 0, errores: [{ fila: 0, error: "archivo_vacio" }], total: 0 };
  }

  /** @type {Map<string, object>} */
  const byCod = new Map();
  const errores = [];
  let fila = 1;
  for (const raw of rows) {
    fila++;
    const { canon, provided } = canonicalizeExcelRow(raw);
    const p = buildPayload(canon, provided);
    if (p.err) {
      errores.push({ fila, error: p.err });
      continue;
    }
    byCod.set(p.codigo, p);
  }

  let insertados = 0;
  let actualizados = 0;
  let sin_cambios = 0;

  const ordered = [...byCod.keys()].sort();

  for (const cod of ordered) {
    const p = /** @type {{ codigo: string, nombre: string, localidad: string|null, nivel_tension: number, trafos: number, kva: number, clientes: number }} */ (
      byCod.get(cod)
    );
    const ex = await client.query(`SELECT * FROM distribuidores_red WHERE tenant_id = $1 AND codigo = $2 LIMIT 1`, [
      tenantId,
      cod,
    ]);
    if (!ex.rows.length) {
      await client.query(
        `INSERT INTO distribuidores_red (tenant_id, codigo, nombre, localidad, nivel_tension, trafos, kva, clientes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, p.codigo, p.nombre, p.localidad, p.nivel_tension, p.trafos, p.kva, p.clientes]
      );
      insertados++;
      continue;
    }
    const row = ex.rows[0];
    if (rowEqualDb(row, p)) {
      sin_cambios++;
      continue;
    }
    const sets = [];
    const vals = [];
    let i = 1;
    if (String(row.nombre || "") !== String(p.nombre)) {
      sets.push(`nombre = $${i++}`);
      vals.push(p.nombre);
    }
    if (String(row.localidad || "") !== String(p.localidad || "")) {
      sets.push(`localidad = $${i++}`);
      vals.push(p.localidad);
    }
    if (Number(row.nivel_tension || 0) !== Number(p.nivel_tension)) {
      sets.push(`nivel_tension = $${i++}`);
      vals.push(p.nivel_tension);
    }
    if (Number(row.trafos || 0) !== Number(p.trafos)) {
      sets.push(`trafos = $${i++}`);
      vals.push(p.trafos);
    }
    if (Number(row.kva || 0) !== Number(p.kva)) {
      sets.push(`kva = $${i++}`);
      vals.push(p.kva);
    }
    if (Number(row.clientes || 0) !== Number(p.clientes)) {
      sets.push(`clientes = $${i++}`);
      vals.push(p.clientes);
    }
    if (!sets.length) {
      sin_cambios++;
      continue;
    }
    sets.push(`updated_at = NOW()`);
    vals.push(row.id);
    await client.query(`UPDATE distribuidores_red SET ${sets.join(", ")} WHERE id = $${i}`, vals);
    actualizados++;
  }

  /** En BD pero no en el Excel: no se borran aquí; el admin confirma baja en el front. */
  const ausentes_en_excel = [];
  const dbAll = await client.query(
    `SELECT codigo, nombre, localidad, nivel_tension, trafos, kva, clientes
     FROM distribuidores_red WHERE tenant_id = $1 ORDER BY codigo`,
    [tenantId]
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
      nivel_tension: row.nivel_tension,
      trafos: row.trafos,
      kva: row.kva,
      clientes: row.clientes,
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
    eliminados: 0,
  };
}

/**
 * Quita de distribuidores_red los códigos confirmados por el admin (dados de baja).
 * @param {number} tenantId
 * @param {string[]} codigos
 * @param {import("pg").PoolClient} client
 */
export async function eliminarDistribuidoresRedPorCodigos(tenantId, codigos, client) {
  const codes = [...new Set(codigos.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))];
  if (!codes.length) return { eliminados: 0, codigos: [] };
  const r = await client.query(
    `DELETE FROM distribuidores_red
     WHERE tenant_id = $1 AND UPPER(TRIM(codigo)) = ANY($2::text[])
     RETURNING codigo`,
    [tenantId, codes]
  );
  return { eliminados: (r.rows || []).length, codigos: (r.rows || []).map((x) => x.codigo) };
}
