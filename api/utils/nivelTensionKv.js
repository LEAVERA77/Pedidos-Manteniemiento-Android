/**
 * Nivel de tensión (kV): en BD se guarda en décimas (13,2 kV → 132) por columna INTEGER.
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

/** Excel / texto → entero en BD (décimas de kV). */
export function parseNivelTensionExcelToDb(raw) {
  if (raw == null || String(raw).trim() === "") return 0;
  const s = String(raw).trim();
  const n = parseNumLoose(s);
  if (n != null && n > 0 && n < 500) {
    return Math.round(n * 10);
  }
  const digits = parseInt(String(s).replace(/[^\d]/g, ""), 10);
  if (Number.isFinite(digits) && digits > 0) {
    if (digits >= 100 && digits % 10 === 0) return digits;
    return Math.round(digits * 10);
  }
  return 0;
}

/** BD → texto para UI / export ENRE (ej. 132 → "13.2"). */
export function formatNivelTensionKvFromDb(dbValue) {
  const v = Number(dbValue);
  if (!Number.isFinite(v) || v <= 0) return "0";
  const kv = v / 10;
  const rounded = Math.round(kv * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
