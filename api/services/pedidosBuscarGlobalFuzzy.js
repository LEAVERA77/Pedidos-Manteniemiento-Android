/**
 * Búsqueda global de pedidos: normalización, Levenshtein y ranking.
 * made by leavera77
 */

export function normalizarTextoFuzzy(s) {
  let t = String(s ?? "")
    .normalize("NFD")
    .toLowerCase();
  try {
    t = t.replace(/\p{M}/gu, "");
  } catch (_) {
    t = t.replace(/[\u0300-\u036f]/g, "");
  }
  return t.replace(/\s+/g, " ").trim();
}

export function distanciaLevenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  const v0 = new Array(n + 1);
  const v1 = new Array(n + 1);
  for (let j = 0; j <= n; j++) v0[j] = j;
  for (let i = 0; i < m; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const c = s[i] === t[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + c);
    }
    for (let j = 0; j <= n; j++) v0[j] = v1[j];
  }
  return v0[n];
}

export function umbralLevenshteinParaNeedle(len) {
  const n = Math.max(0, Math.floor(Number(len) || 0));
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  if (n <= 12) return 3;
  return 4;
}

/**
 * @param {string} needleRaw
 * @param {string} haystackRaw
 */
export function textoCoincideFuzzy(needleRaw, haystackRaw) {
  const needle = normalizarTextoFuzzy(needleRaw);
  if (!needle) return true;
  const hay = normalizarTextoFuzzy(haystackRaw);
  if (!hay) return false;
  if (hay.includes(needle)) return true;
  const words = hay.split(" ").filter(Boolean);
  const maxD = umbralLevenshteinParaNeedle(needle.length);
  for (const w of words) {
    if (w.includes(needle) || needle.includes(w)) return true;
    if (Math.abs(w.length - needle.length) > maxD + 2) continue;
    if (distanciaLevenshtein(needle, w) <= maxD) return true;
  }
  if (Math.abs(hay.length - needle.length) <= maxD + 3 && distanciaLevenshtein(needle, hay) <= maxD + 1) {
    return true;
  }
  return false;
}

/**
 * @param {string} q
 * @param {Record<string, unknown>} row
 */
export function puntajePedidoBusquedaGlobal(q, row) {
  const needle = normalizarTextoFuzzy(q);
  if (!needle) return 0;
  let score = 0;
  const idStr = String(row.id ?? "");
  const numStr = String(row.numero_pedido ?? "").trim();
  const campos = [
    { w: 14, v: row.cliente_nombre },
    { w: 10, v: row.cliente },
    { w: 12, v: row.cliente_direccion },
    { w: 16, v: row.nis },
    { w: 16, v: row.medidor },
    { w: 14, v: row.telefono_contacto },
    { w: 11, v: numStr },
    { w: 8, v: idStr },
  ];
  for (const { w, v } of campos) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    const hay = normalizarTextoFuzzy(s);
    if (hay === needle) score += w * 2;
    else if (hay.includes(needle)) score += w + 4;
    else if (textoCoincideFuzzy(needle, s)) score += w;
  }
  const tokens = needle.split(" ").filter((t) => t.length >= 2);
  if (tokens.length > 1) {
    const blob = campos.map((c) => normalizarTextoFuzzy(c.v)).join(" ");
    const hits = tokens.filter((t) => textoCoincideFuzzy(t, blob)).length;
    if (hits === tokens.length) score += 8 + hits * 2;
    else if (hits > 0) score += hits * 2;
  }
  if (/^\d+$/.test(needle) && (idStr === needle || numStr.includes(needle))) {
    score += 20;
  }
  return score;
}

/**
 * @param {string} q
 * @param {Array<Record<string, unknown>>} rows
 */
export function rankearPedidosBusquedaGlobal(q, rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const id = row?.id;
    if (id == null || seen.has(id)) continue;
    const score = puntajePedidoBusquedaGlobal(q, row);
    if (score <= 0) continue;
    seen.add(id);
    out.push({ row, score });
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = new Date(a.row.fecha_creacion || 0).getTime() || 0;
    const tb = new Date(b.row.fecha_creacion || 0).getTime() || 0;
    return tb - ta;
  });
  return out.map((x) => x.row);
}

/**
 * @param {string} q
 * @returns {string[]}
 */
export function tokensBusquedaGlobal(q) {
  const n = normalizarTextoFuzzy(q);
  if (!n) return [];
  const parts = n.split(" ").filter((t) => t.length >= 2);
  if (parts.length) return [...new Set(parts)];
  return n.length >= 2 ? [n] : [];
}
