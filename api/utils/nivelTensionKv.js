/**
 * Nivel de tensión (kV): valor numérico igual al Excel (13.2, 33, 132).
 * Columna NUMERIC en distribuidores_red (ver migración nivel_tension_numeric).
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

/** Excel / texto → kV en BD (sin quitar el punto decimal del origen). */
export function parseNivelTensionExcelToDb(raw) {
  if (raw == null || String(raw).trim() === "") return 0;
  const n = parseNumLoose(String(raw).trim());
  if (n != null && n > 0 && n < 100000) return n;
  return 0;
}

/** BD → texto UI / export: punto solo si el valor tiene decimales (13.2 sí; 33 y 132 no). */
export function formatNivelTensionKvFromDb(dbValue) {
  const v = Number(dbValue);
  if (!Number.isFinite(v) || v <= 0) return "0";
  const rounded = Math.round(v * 1000) / 1000;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return String(Math.round(rounded));
  }
  let s = rounded.toFixed(2);
  s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return s;
}
