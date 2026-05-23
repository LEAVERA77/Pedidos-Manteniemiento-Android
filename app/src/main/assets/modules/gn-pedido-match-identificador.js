/**
 * Coincidencia de pedidos por NIS, medidor o nis_medidor (exacta y parcial por dígitos).
 * made by leavera77
 */

/**
 * @param {(v: unknown) => string} esc
 * @param {string} raw
 * @returns {string} fragmento SQL AND (...))
 */
export function sqlWherePedidoCoincideIdentificador(esc, raw) {
    const q = String(raw || '').trim();
    if (!q) return '(FALSE)';
    const eq = esc(q);
    const exact = `(
      UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM(${eq}))
      OR UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${eq}))
      OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${eq}))
    )`;
    const digits = q.replace(/\D/g, '');
    if (digits.length < 3) return exact;
    const d = esc(digits);
    const partial = `(
      regexp_replace(COALESCE(nis_medidor,''), '\\D', '', 'g') LIKE '%' || ${d} || '%'
      OR regexp_replace(COALESCE(nis,''), '\\D', '', 'g') LIKE '%' || ${d} || '%'
      OR regexp_replace(COALESCE(medidor,''), '\\D', '', 'g') LIKE '%' || ${d} || '%'
    )`;
    return `(${exact} OR ${partial})`;
}

/**
 * @param {(v: unknown) => string} esc
 * @param {{ nis_medidor?: unknown, nis?: unknown, medidor?: unknown, numero_cliente?: unknown }} persona
 */
export function sqlPedidosCoincidenConPersona(esc, persona) {
    const vals = new Set();
    const add = (v) => {
        const s = String(v ?? '').trim();
        if (s) vals.add(s);
    };
    add(persona.nis_medidor);
    add(persona.nis);
    add(persona.medidor);
    add(persona.numero_cliente);
    const parts = [];
    for (const v of vals) {
        const eq = esc(v);
        parts.push(`(
      UPPER(TRIM(COALESCE(nis_medidor,''))) = UPPER(TRIM(${eq}))
      OR UPPER(TRIM(COALESCE(nis,''))) = UPPER(TRIM(${eq}))
      OR UPPER(TRIM(COALESCE(medidor,''))) = UPPER(TRIM(${eq}))
    )`);
    }
    return parts.length ? `(${parts.join(' OR ')})` : '(FALSE)';
}
