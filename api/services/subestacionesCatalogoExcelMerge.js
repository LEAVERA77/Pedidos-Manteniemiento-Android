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
 */
function canonicalizeExcelRow(row) {
  const canon = {};
  const provided = new Set();
  for (const [rawKey, val] of Object.entries(row)) {
    const nk = normHeaderKey(rawKey);
    if (!nk) continue;
    const s = val != null && String(val).trim() !== "" ? String(val).trim() : "";
    let target = null;
    if (
      nk === "codigo" ||
      nk === "id transformador" ||
      nk === "id_transformador" ||
      nk === "trafo" ||
      nk === "transformador" ||
      (nk.startsWith("id") && nk.includes("trafo"))
    ) {
      target = "codigo";
    } else if (nk === "nombre") {
      target = "nombre";
    } else if (nk === "subestacion" || nk.includes("subestaci")) {
      target = "subestacion";
    } else if (
      nk === "distribuidor_codigo" ||
      nk === "id distribuidor" ||
      nk === "id_distribuidor" ||
      (nk.includes("distribuidor") && !nk.includes("cliente"))
    ) {
      target = "distribuidor_codigo";
    } else if (nk === "kva" || nk.includes("capacidad")) {
      target = "capacidad_kva";
    } else if (nk === "clientes" || nk.includes("cliente") || nk.includes("socios")) {
      target = "clientes_conectados";
    } else if (nk === "barrio") {
      target = "barrio";
    } else if (nk === "alimentador") {
      target = "alimentador";
    } else if (nk === "localidad") {
      target = "localidad";
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

function buildPayload(canon) {
  const codigo = String(canon.codigo || "").trim().toUpperCase();
  if (!codigo) return { err: "codigo_vacio" };
  const nombre = canon.nombre && String(canon.nombre).trim() ? String(canon.nombre).trim() : codigo;
  const subestacion = canon.subestacion && String(canon.subestacion).trim() ? String(canon.subestacion).trim() : null;
  const distribuidor_codigo =
    canon.distribuidor_codigo && String(canon.distribuidor_codigo).trim()
      ? String(canon.distribuidor_codigo).trim().toUpperCase()
      : null;
  const barrio = canon.barrio && String(canon.barrio).trim() ? String(canon.barrio).trim() : null;
  const alimentador = canon.alimentador && String(canon.alimentador).trim() ? String(canon.alimentador).trim() : null;
  const localidad = canon.localidad && String(canon.localidad).trim() ? String(canon.localidad).trim() : null;
  const kv = parseNumLoose(canon.capacidad_kva);
  const capacidad_kva = kv != null ? Math.round(kv) : 0;
  const cl = parseIntLoose(canon.clientes_conectados);
  const clientes_conectados = cl != null ? cl : 0;
  return {
    codigo,
    nombre,
    subestacion,
    distribuidor_codigo,
    capacidad_kva,
    clientes_conectados,
    barrio,
    alimentador,
    localidad,
  };
}

function rowEqualDb(row, p) {
  return (
    String(row.nombre || "") === String(p.nombre) &&
    String(row.subestacion || "") === String(p.subestacion || "") &&
    String(row.distribuidor_codigo || "") === String(p.distribuidor_codigo || "") &&
    Number(row.capacidad_kva || 0) === Number(p.capacidad_kva) &&
    Number(row.clientes_conectados || 0) === Number(p.clientes_conectados) &&
    String(row.barrio || "") === String(p.barrio || "") &&
    String(row.alimentador || "") === String(p.alimentador || "") &&
    String(row.localidad || "") === String(p.localidad || "")
  );
}

/**
 * @param {Buffer} buffer
 * @param {number} tenantId
 * @param {import("pg").PoolClient} client
 */
export async function mergeSubestacionesCatalogoFromExcelBuffer(buffer, tenantId, client) {
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
  const ordered = [...byCod.keys()].sort();

  for (const cod of ordered) {
    const p = byCod.get(cod);
    const ex = await client.query(
      `SELECT * FROM subestaciones_catalogo WHERE tenant_id = $1 AND codigo = $2 LIMIT 1`,
      [tenantId, cod]
    );
    if (!ex.rows.length) {
      await client.query(
        `INSERT INTO subestaciones_catalogo (
          tenant_id, codigo, nombre, subestacion, distribuidor_codigo,
          capacidad_kva, clientes_conectados, barrio, alimentador, localidad
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          tenantId,
          p.codigo,
          p.nombre,
          p.subestacion,
          p.distribuidor_codigo,
          p.capacidad_kva,
          p.clientes_conectados,
          p.barrio,
          p.alimentador,
          p.localidad,
        ]
      );
      insertados++;
      continue;
    }
    const row = ex.rows[0];
    if (rowEqualDb(row, p)) {
      sin_cambios++;
      continue;
    }
    await client.query(
      `UPDATE subestaciones_catalogo SET
        nombre = $3, subestacion = $4, distribuidor_codigo = $5,
        capacidad_kva = $6, clientes_conectados = $7, barrio = $8,
        alimentador = $9, localidad = $10, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [
        row.id,
        tenantId,
        p.nombre,
        p.subestacion,
        p.distribuidor_codigo,
        p.capacidad_kva,
        p.clientes_conectados,
        p.barrio,
        p.alimentador,
        p.localidad,
      ]
    );
    actualizados++;
  }

  const ausentes_en_excel = [];
  const dbAll = await client.query(
    `SELECT codigo, nombre, subestacion, distribuidor_codigo, capacidad_kva, clientes_conectados
     FROM subestaciones_catalogo WHERE tenant_id = $1 ORDER BY codigo`,
    [tenantId]
  );
  for (const row of dbAll.rows || []) {
    const c = String(row.codigo || "")
      .trim()
      .toUpperCase();
    if (!c || byCod.has(c)) continue;
    ausentes_en_excel.push(row);
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
 * @param {number} tenantId
 * @param {string[]} codigos
 * @param {import("pg").PoolClient} client
 */
export async function eliminarSubestacionesCatalogoPorCodigos(tenantId, codigos, client) {
  const codes = [...new Set(codigos.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))];
  if (!codes.length) return { eliminados: 0, codigos: [] };
  const r = await client.query(
    `DELETE FROM subestaciones_catalogo
     WHERE tenant_id = $1 AND UPPER(TRIM(codigo)) = ANY($2::text[])
     RETURNING codigo`,
    [tenantId, codes]
  );
  return { eliminados: (r.rows || []).length, codigos: (r.rows || []).map((x) => x.codigo) };
}
