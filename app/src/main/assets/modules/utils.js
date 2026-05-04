/**
 * Utilidades puras (formato / validación ligera) extraídas de app.js para carga incremental.
 * made by leavera77
 */

/** Quita prefijos históricos «GestorNova Dice:» en toasts / alert / confirm (mensaje limpio). */
export function stripGestornovaDicePrefix(s) {
    return String(s ?? '')
        .replace(/^\s*GestorNova\s+Dice\s*:\s*/i, '')
        .replace(/^\s*Gestornova\s+dice\s*:\s*/i, '')
        .trim();
}

export function gnDice(msg) {
    return stripGestornovaDicePrefix(String(msg ?? ''));
}

export function esc(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return "'" + String(v).replace(/'/g, "''") + "'";
}

export function yieldAnimationFrame() {
    return new Promise(r => requestAnimationFrame(() => r()));
}

export function decimalToDmsLite(decimal, isLat) {
    const n = Number(decimal);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    const hemi = isLat ? (n >= 0 ? 'N' : 'S') : (n >= 0 ? 'E' : 'O');
    return `${deg}° ${min}' ${sec}" ${hemi}`;
}

export function dmsToDecimalLite(raw) {
    const s = String(raw || '').trim();
    if (!s) return Number.NaN;
    if (!/[°º'′´"″]/.test(s)) return parseFloat(s.replace(',', '.'));
    const m = s.match(/^\s*(\d+)[°º]\s*(\d+)['′´]\s*([\d.,]+)\s*["″]?\s*([NnSsEeOoWw])\s*$/);
    if (!m) return Number.NaN;
    const deg = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseFloat(String(m[3]).replace(',', '.'));
    const hemi = m[4].toUpperCase();
    if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return Number.NaN;
    let dec = deg + min / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W' || hemi === 'O') dec = -dec;
    return dec;
}

/** DMS compacto tipo Excel / Argentina: 34°30'15,2"S o S 34°30'15" */
export function parsearDmsLatLonFlexible(str) {
    const t = String(str).replace(/\u00a0/g, ' ').trim();
    const m = t.match(
        /^\s*(?:([NnSsEeWw])\s+)?(-?\d+(?:[.,]\d+)?)\s*°\s*(\d+)\s*['′]\s*(\d+(?:[.,]\d+)?)?\s*(?:"|″|'')?\s*([NnSsEeWw])?\s*$/i
    );
    if (!m) return null;
    const hemiLead = (m[1] || '').toUpperCase();
    const hemiTail = (m[5] || '').toUpperCase();
    const hemi = hemiLead || hemiTail;
    const degAbs = Math.abs(parseFloat(String(m[2]).replace(',', '.')));
    const min = parseInt(m[3], 10) || 0;
    const sec = m[4] ? parseFloat(String(m[4]).replace(',', '.')) : 0;
    if (!Number.isFinite(degAbs) || min < 0 || min >= 60 || sec < 0 || sec >= 60) return null;
    let dec = degAbs + min / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W') dec = -dec;
    else if (String(m[2]).trim().startsWith('-')) dec = -dec;
    return dec;
}

/**
 * Decimal con coma/punto o texto en grados/minutos/segundos (p. ej. 34°30'15,2"S).
 * Si hay símbolos ° ′ ″ no se usa parseFloat directo sobre todo el string.
 */
export function parseDecimalODmsCoord(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    const raw = String(val).trim();
    if (!raw) return null;
    if (!/[°'′″]/.test(raw)) {
        const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    return parsearDmsLatLonFlexible(raw);
}

export function validarWgs84Import(lat, lng) {
    if (lat == null || lng == null) return { la: null, lo: null };
    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { la: null, lo: null };
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return { la: null, lo: null };
    if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) return { la: null, lo: null };
    return { la: a, lo: b };
}
