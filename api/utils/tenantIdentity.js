/**
 * Normaliza el nombre de empresa para comparar pares (multi-tenant / nueva instancia).
 * @param {unknown} s
 * @returns {string}
 */
export function normalizeCompanyNameKey(s) {
  return String(s || "")
    .trim()
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Clave estable `nombre|business_type` (business_type ya normalizado electricidad|agua|municipio).
 */
export function tenantIdentityPairKey(nombre, businessType) {
  return `${normalizeCompanyNameKey(nombre)}|${String(businessType || "").trim().toLowerCase()}`;
}
