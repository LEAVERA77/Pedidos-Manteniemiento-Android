/**
 * Coincidencia de fila en socios_catalogo por NIS / medidor (exacta; opcional parcial legacy).
 * made by leavera77
 */

/**
 * Solo coincidencia exacta (recomendado al cargar pedido desde NIS/medidor).
 * @param {(v: unknown) => string} esc
 * @param {string} raw
 * @param {string} [alias]
 */
export function sqlWhereSocioExactoIdentificador(esc, raw, alias = '') {
    const a = alias;
    const q = String(raw || '').trim();
    if (!q) return '(FALSE)';
    const eq = esc(q);
    return `(
      UPPER(TRIM(COALESCE(${a}nis_medidor,''))) = UPPER(TRIM(${eq}))
      OR UPPER(TRIM(COALESCE(${a}nis,''))) = UPPER(TRIM(${eq}))
      OR UPPER(TRIM(COALESCE(${a}medidor,''))) = UPPER(TRIM(${eq}))
    )`;
}

/**
 * @param {(v: unknown) => string} esc
 * @param {string} raw
 * @param {string} [alias] prefijo tabla, ej. '' o 's.'
 */
export function sqlWhereSocioCatalogoCoincideIdentificador(esc, raw, alias = '') {
    const exact = sqlWhereSocioExactoIdentificador(esc, raw, alias);
    const a = alias;
    const q = String(raw || '').trim();
    const digits = q.replace(/\D/g, '');
    if (digits.length < 3) return exact;
    const d = esc(digits);
    const partial = `(
      regexp_replace(COALESCE(${a}nis_medidor,''), '\\D', '', 'g') LIKE '%' || ${d} || '%'
      OR regexp_replace(COALESCE(${a}nis,''), '\\D', '', 'g') LIKE '%' || ${d} || '%'
      OR regexp_replace(COALESCE(${a}medidor,''), '\\D', '', 'g') LIKE '%' || ${d} || '%'
    )`;
    return `(${exact} OR ${partial})`;
}
