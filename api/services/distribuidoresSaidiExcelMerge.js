/**
 * Import Excel métricas SAIDI/SAIFI por distribuidor (cooperativa eléctrica).
 * Columnas típicas: ID Distribuidor | Nombre | Localidad | Nivel de tensión | Trafos | KVA | Clientes
 * made by leavera77
 */
import XLSX from "xlsx";

function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHeaderMap(row) {
  const m = {};
  for (const [k, v] of Object.entries(row || {})) {
    m[normKey(k)] = v;
  }
  return m;
}

function pick(m, ...aliases) {
  for (const a of aliases) {
    const v = m[normKey(a)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

/**
 * @param {Record<string, unknown>} raw — fila sheet_to_json
 */
export function parseDistribuidorSaidiRow(raw) {
  const m = buildHeaderMap(raw);
  const cod = String(pick(m, "id distribuidor", "id_distribuidor", "codigo", "id", "cod") || "")
    .trim()
    .toUpperCase();
  if (!cod) return null;
  const nombre = String(pick(m, "nombre", "nombre distribuidor") || "").trim() || null;
  const localidad = String(pick(m, "localidad", "ciudad") || "").trim() || null;
  const tensionRaw = pick(m, "nivel de tension", "nivel tension", "nivel_tension", "tension", "kv");
  const tension = tensionRaw != null && String(tensionRaw).trim() !== "" ? String(tensionRaw).trim() : null;
  const trN = parseInt(String(pick(m, "trafos", "transformadores", "cantidad trafos", "trasformadores") || "").replace(/\D/g, ""), 10);
  const trafos = Number.isFinite(trN) ? trN : null;
  const kvaN = Number(String(pick(m, "kva", "potencia", "potencia kva") || "").replace(",", "."));
  const kva_saidi = Number.isFinite(kvaN) ? kvaN : null;
  const clN = parseInt(String(pick(m, "clientes", "clientes conectados", "socios") || "").replace(/\D/g, ""), 10);
  const clientes_saidi = Number.isFinite(clN) ? clN : null;
  return { codigo: cod, nombre, localidad, tension, trafos, kva_saidi, clientes_saidi };
}

function sameMetricRow(a, b) {
  return (
    String(a?.nombre ?? "") === String(b?.nombre ?? "") &&
    String(a?.localidad ?? "") === String(b?.localidad ?? "") &&
    String(a?.tension ?? "") === String(b?.tension ?? "") &&
    Number(a?.trafos ?? NaN) === Number(b?.trafos ?? NaN) &&
    Number(a?.kva_saidi ?? NaN) === Number(b?.kva_saidi ?? NaN) &&
    Number(a?.clientes_saidi ?? NaN) === Number(b?.clientes_saidi ?? NaN)
  );
}

/**
 * @param {Buffer} buffer
 * @param {number} tenantId
 * @param {{ query: (sql: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }} db
 * @param {{ hasTenantId: boolean, hasTrafos: boolean, hasKva: boolean, hasCli: boolean }} cols
 */
export async function mergeDistribuidoresSaidiFromExcelBuffer(buffer, tenantId, db, cols) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const parsed = [];
  for (const r of rawRows) {
    const p = parseDistribuidorSaidiRow(r);
    if (p) parsed.push(p);
  }
  parsed.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const p of parsed) {
    const nombreSeguro = (p.nombre && String(p.nombre).trim()) || p.codigo;
    if (!cols.hasTenantId) {
      throw new Error("distribuidores sin tenant_id");
    }
    const ex = await db.query(
      `SELECT id, nombre, tension, localidad, trafos, kva_saidi, clientes_saidi
       FROM distribuidores WHERE UPPER(TRIM(codigo::text)) = $1 AND tenant_id = $2 LIMIT 1`,
      [p.codigo, tenantId]
    );
    const row = ex.rows?.[0];
    const target = {
      nombre: nombreSeguro,
      localidad: p.localidad,
      tension: p.tension,
      trafos: cols.hasTrafos ? p.trafos : null,
      kva_saidi: cols.hasKva ? p.kva_saidi : null,
      clientes_saidi: cols.hasCli ? p.clientes_saidi : null,
    };
    if (!row) {
      const fields = ["codigo", "nombre", "tension", "localidad", "activo", "tenant_id"];
      const vals = [p.codigo, nombreSeguro, p.tension, p.localidad, true, tenantId];
      let ph = "$1,$2,$3,$4,$5,$6";
      let n = 6;
      if (cols.hasTrafos) {
        n += 1;
        fields.push("trafos");
        vals.push(p.trafos);
        ph += `,$${n}`;
      }
      if (cols.hasKva) {
        n += 1;
        fields.push("kva_saidi");
        vals.push(p.kva_saidi);
        ph += `,$${n}`;
      }
      if (cols.hasCli) {
        n += 1;
        fields.push("clientes_saidi");
        vals.push(p.clientes_saidi);
        ph += `,$${n}`;
      }
      await db.query(`INSERT INTO distribuidores (${fields.join(",")}) VALUES (${ph})`, vals);
      inserted += 1;
      continue;
    }
    const cur = {
      nombre: row.nombre,
      localidad: row.localidad,
      tension: row.tension,
      trafos: cols.hasTrafos ? row.trafos : null,
      kva_saidi: cols.hasKva ? row.kva_saidi : null,
      clientes_saidi: cols.hasCli ? row.clientes_saidi : null,
    };
    if (sameMetricRow(cur, target)) {
      unchanged += 1;
      continue;
    }
    const sets = ["nombre = $2", "tension = $3", "localidad = $4", "activo = TRUE"];
    const params = [row.id, nombreSeguro, p.tension, p.localidad];
    let idx = 5;
    if (cols.hasTrafos) {
      sets.push(`trafos = $${idx}`);
      params.push(p.trafos);
      idx += 1;
    }
    if (cols.hasKva) {
      sets.push(`kva_saidi = $${idx}`);
      params.push(p.kva_saidi);
      idx += 1;
    }
    if (cols.hasCli) {
      sets.push(`clientes_saidi = $${idx}`);
      params.push(p.clientes_saidi);
      idx += 1;
    }
    await db.query(`UPDATE distribuidores SET ${sets.join(", ")} WHERE id = $1`, params);
    updated += 1;
  }

  return { ok: true, filas_excel: rawRows.length, parseadas: parsed.length, inserted, updated, unchanged };
}
