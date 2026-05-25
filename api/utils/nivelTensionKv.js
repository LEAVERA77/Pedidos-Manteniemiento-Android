/**
 * Nivel de tensión (kV) en distribuidores_red (INTEGER + flag decimal opcional).
 * made by leavera77
 */

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
 * Excel / texto → valor en BD.
 * @returns {{ nivel_tension: number, nivel_tension_kv_decimal: boolean }}
 */
export function parseNivelTensionExcelToDb(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { nivel_tension: 0, nivel_tension_kv_decimal: false };
  }
  const s = String(raw).trim();
  const n = parseNumLoose(s);
  if (n == null || n <= 0) {
    return { nivel_tension: 0, nivel_tension_kv_decimal: false };
  }
  const hasExplicitDecimal = /[.,]\d/.test(s);
  if (hasExplicitDecimal) {
    return {
      nivel_tension: Math.round(n * 10),
      nivel_tension_kv_decimal: true,
    };
  }
  return {
    nivel_tension: Math.round(n),
    nivel_tension_kv_decimal: false,
  };
}

/**
 * BD → texto UI / export (sin punto salvo flag decimal).
 * @param {unknown} dbValue
 * @param {boolean} [kvDecimal]
 */
export function formatNivelTensionKvFromDb(dbValue, kvDecimal = false) {
  const v = Number(dbValue);
  if (!Number.isFinite(v) || v <= 0) return "0";
  if (kvDecimal) {
    const kv = v / 10;
    const rounded = Math.round(kv * 10) / 10;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(1);
  }
  return String(Math.round(v));
}
