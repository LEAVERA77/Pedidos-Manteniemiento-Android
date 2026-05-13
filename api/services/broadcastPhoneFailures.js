/**
 * Pausa números con varios fallos seguidos en masivos (evita re-disparar a listas sucias).
 * made by leavera77
 */
import { query } from "../db/neon.js";

function parseThreshold() {
  const n = Number(process.env.WHAPI_BROADCAST_BLOCKLIST_FAIL_THRESHOLD || 3);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
}

/**
 * @param {number} tenantId
 * @param {string[]} phones dígitos normalizados
 * @returns {Promise<string[]>}
 */
export async function filterPhonesNotBlocklisted(tenantId, phones) {
  const tid = Number(tenantId);
  const list = Array.isArray(phones) ? phones.filter((p) => String(p || "").replace(/\D/g, "").length >= 10) : [];
  if (!Number.isFinite(tid) || tid <= 0 || !list.length) return list;
  const th = parseThreshold();
  try {
    const r = await query(
      `SELECT phone_digits FROM broadcast_phone_failures
       WHERE tenant_id = $1 AND consecutive_fails >= $2 AND phone_digits = ANY($3::text[])`,
      [tid, th, list]
    );
    const bad = new Set((r.rows || []).map((x) => String(x.phone_digits || "")));
    const out = list.filter((p) => !bad.has(String(p)));
    if (out.length < list.length) {
      console.warn("[broadcast-phone-failures] omitidos por fallos repetidos", {
        tenant_id: tid,
        omitidos: list.length - out.length,
        umbral: th,
      });
    }
    return out;
  } catch (e) {
    if (String(e?.code || "") === "42P01") return list;
    console.warn("[broadcast-phone-failures] filter", e?.message || e);
    return list;
  }
}

/**
 * Tras un masivo: sube contador a números con error; borra fila a los que salieron OK (reintento limpio).
 * @param {number} tenantId
 * @param {string[]} allPhones
 * @param {Array<{ telefono?: string, error?: string }>} erroresDetalle
 */
export async function applyBroadcastSendResultsToFailures(tenantId, allPhones, erroresDetalle) {
  const tid = Number(tenantId);
  const list = Array.isArray(allPhones) ? allPhones : [];
  if (!Number.isFinite(tid) || tid <= 0 || !list.length) return;

  const failSet = new Set();
  for (const e of erroresDetalle || []) {
    const d = String(e?.telefono || "").replace(/\D/g, "");
    if (d.length >= 10) failSet.add(d);
  }

  try {
    for (const d of failSet) {
      await query(
        `INSERT INTO broadcast_phone_failures (tenant_id, phone_digits, consecutive_fails, last_fail_at, updated_at)
         VALUES ($1, $2, 1, NOW(), NOW())
         ON CONFLICT (tenant_id, phone_digits) DO UPDATE SET
           consecutive_fails = broadcast_phone_failures.consecutive_fails + 1,
           last_fail_at = NOW(),
           updated_at = NOW()`,
        [tid, d]
      );
    }

    const okPhones = list.filter((p) => {
      const d = String(p || "").replace(/\D/g, "");
      return d.length >= 10 && !failSet.has(d);
    });
    const digitsOk = [...new Set(okPhones.map((p) => String(p || "").replace(/\D/g, "")))].filter(Boolean);
    for (let i = 0; i < digitsOk.length; i += 300) {
      const chunk = digitsOk.slice(i, i + 300);
      await query(`DELETE FROM broadcast_phone_failures WHERE tenant_id = $1 AND phone_digits = ANY($2::text[])`, [
        tid,
        chunk,
      ]);
    }
  } catch (e) {
    if (String(e?.code || "") !== "42P01") {
      console.warn("[broadcast-phone-failures] apply", e?.message || e);
    }
  }
}
