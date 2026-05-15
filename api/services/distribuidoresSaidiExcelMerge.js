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
    } else if (nk === "tension" || nk === "tensión") {
      target = "tension_raw";
    } else if (nk === "trafos" || nk === "trafo" || nk === "transformadores") {
      target = "trafos";
    } else if (nk === "kva" || nk.startsWith("kva")) {
      target = "kva_saidi";
    } else if (nk === "clientes" || nk.includes("cliente")) {
      target = "clientes_saidi";
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

function tensionDesdeCanon(canon) {
  const rawT = canon.tension_raw;
  if (rawT && String(rawT).trim()) return String(rawT).trim();
  const nv = parseIntLoose(canon.nivel_tension);
  if (nv != null) return `${nv} V`;
  return null;
}

/**
 * @param {Record<string, string>} canon
 * @param {Set<string>} provided
 */
function buildPayload(canon, provided) {
  const codigo = String(canon.codigo || "").trim().toUpperCase();
  if (!codigo) return null;
  const nombre = canon.nombre && String(canon.nombre).trim() ? String(canon.nombre).trim() : codigo;
  const localidad = canon.localidad && String(canon.localidad).trim() ? String(canon.localidad).trim() : null;
  const tension = tensionDesdeCanon(canon);
  const trafos = parseIntLoose(canon.trafos);
  const kvaRaw = parseNumLoose(canon.kva_saidi);
  const kva_saidi = kvaRaw != null ? Math.round(kvaRaw * 1000) / 1000 : null;
  const clientes_saidi = parseIntLoose(canon.clientes_saidi);
  return { codigo, nombre, localidad, tension, trafos, kva_saidi, clientes_saidi, provided };
}

function normTxt(x) {
  if (x == null || x === "") return null;
  return String(x).trim();
}

function normInt(x) {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normKva(x) {
  if (x == null || x === "") return null;
  return Math.round(Number(x) * 1000) / 1000;
}

function mergedNextRow(cur, p) {
  const prov = p.provided;
  return {
    nombre: prov.has("nombre") ? p.nombre : cur.nombre,
    localidad: prov.has("localidad") ? p.localidad : cur.localidad,
    tension: prov.has("tension_raw") || prov.has("nivel_tension") ? p.tension : cur.tension,
    trafos: prov.has("trafos") ? p.trafos : cur.trafos,
    kva_saidi: prov.has("kva_saidi") ? p.kva_saidi : cur.kva_saidi,
    clientes_saidi: prov.has("clientes_saidi") ? p.clientes_saidi : cur.clientes_saidi,
  };
}

function rowEquals(cur, next) {
  return (
    normTxt(cur.nombre) === normTxt(next.nombre) &&
    normTxt(cur.localidad) === normTxt(next.localidad) &&
    normTxt(cur.tension) === normTxt(next.tension) &&
    normInt(cur.trafos) === normInt(next.trafos) &&
    normKva(cur.kva_saidi) === normKva(next.kva_saidi) &&
    normInt(cur.clientes_saidi) === normInt(next.clientes_saidi)
  );
}

/**
 * @param {Buffer} buffer
 * @param {number} tenantId
 * @param {import("pg").PoolClient} client
 * @param {{ hasTenantId: boolean, hasTrafos: boolean, hasKva: boolean, hasCli: boolean }} _flags
 */
export async function mergeDistribuidoresSaidiFromExcelBuffer(buffer, tenantId, client, _flags) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) throw new Error("tenant_id inválido");

  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  /** @type {NonNullable<ReturnType<typeof buildPayload>>[]} */
  const payloads = [];
  let skippedInvalid = 0;
  for (const raw of rawRows) {
    const { canon, provided } = canonicalizeExcelRow(raw);
    const p = buildPayload(canon, provided);
    if (!p) {
      skippedInvalid += 1;
      continue;
    }
    payloads.push(p);
  }

  payloads.sort((a, b) => a.codigo.localeCompare(b.codigo, "es"));

  let unchanged = 0;
  let inserted = 0;
  let updated = 0;

  for (const p of payloads) {
    const ex = await client.query(
      `SELECT id, codigo, nombre, tension, localidad, trafos, kva_saidi, clientes_saidi
       FROM distribuidores WHERE tenant_id = $1 AND UPPER(TRIM(codigo)) = UPPER(TRIM($2)) LIMIT 1`,
      [tid, p.codigo]
    );

    if (!ex.rows.length) {
      await client.query(
        `INSERT INTO distribuidores (codigo, nombre, tension, localidad, trafos, kva_saidi, clientes_saidi, activo, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)`,
        [p.codigo, p.nombre, p.tension, p.localidad, p.trafos, p.kva_saidi, p.clientes_saidi, tid]
      );
      inserted += 1;
      continue;
    }

    const row = ex.rows[0];
    const cur = {
      nombre: row.nombre,
      localidad: row.localidad,
      tension: row.tension,
      trafos: row.trafos,
      kva_saidi: row.kva_saidi != null ? Number(row.kva_saidi) : null,
      clientes_saidi: row.clientes_saidi,
    };
    const next = mergedNextRow(cur, p);

    if (rowEquals(cur, next)) {
      unchanged += 1;
      continue;
    }

    /** @type {string[]} */
    const sets = [];
    /** @type {unknown[]} */
    const vals = [row.id, tid];
    let i = 3;
    if (normTxt(cur.nombre) !== normTxt(next.nombre)) {
      sets.push(`nombre = $${i}`);
      vals.push(next.nombre);
      i += 1;
    }
    if (normTxt(cur.localidad) !== normTxt(next.localidad)) {
      sets.push(`localidad = $${i}`);
      vals.push(next.localidad);
      i += 1;
    }
    if (normTxt(cur.tension) !== normTxt(next.tension)) {
      sets.push(`tension = $${i}`);
      vals.push(next.tension);
      i += 1;
    }
    if (normInt(cur.trafos) !== normInt(next.trafos)) {
      sets.push(`trafos = $${i}`);
      vals.push(next.trafos);
      i += 1;
    }
    if (normKva(cur.kva_saidi) !== normKva(next.kva_saidi)) {
      sets.push(`kva_saidi = $${i}`);
      vals.push(next.kva_saidi);
      i += 1;
    }
    if (normInt(cur.clientes_saidi) !== normInt(next.clientes_saidi)) {
      sets.push(`clientes_saidi = $${i}`);
      vals.push(next.clientes_saidi);
      i += 1;
    }

    if (!sets.length) {
      unchanged += 1;
      continue;
    }
    sets.push("activo = TRUE");
    await client.query(`UPDATE distribuidores SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2`, vals);
    updated += 1;
  }

  return {
    ok: true,
    tenant_id: tid,
    total_excel: payloads.length,
    skipped_invalid: skippedInvalid,
    unchanged,
    inserted,
    updated,
  };
}
