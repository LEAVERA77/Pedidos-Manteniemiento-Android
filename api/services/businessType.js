import { normalizarRubroCliente } from "./tiposReclamo.js";

const VALID = new Set(["electricidad", "agua", "municipio"]);

/** Mapea rubro normalizado de `clientes.tipo` a etiqueta de filtro. */
export function rubroNormToBusinessType(rubroNorm) {
  if (rubroNorm === "cooperativa_agua") return "agua";
  if (rubroNorm === "municipio") return "municipio";
  return "electricidad";
}

export function businessTypeToRubroParaTipos(bt) {
  const s = String(bt || "").toLowerCase();
  if (s === "agua") return "cooperativa_agua";
  if (s === "municipio") return "municipio";
  return "cooperativa_electrica";
}

export function normalizeBusinessTypeInput(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (VALID.has(s)) return s;
  const rub = normalizarRubroCliente(raw);
  if (rub) return rubroNormToBusinessType(rub);
  return null;
}

export { normalizarRubroCliente };
