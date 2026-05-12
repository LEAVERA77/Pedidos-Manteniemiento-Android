/**
 * Obtiene explicaciones IA para KPIs guardados (para el informe PDF ejecutivo).
 * made by leavera77
 */

/**
 * Llama al endpoint /api/ia/explicar-kpis y devuelve un Map<metricaKey, {explicacion, recomendacion}>.
 * @param {Array} rows — filas de kpi_snapshots
 * @returns {Promise<Map<string, {explicacion:string, recomendacion:string}>>}
 */
export async function obtenerExplicacionesKpiIA(rows) {
    const map = new Map();
    if (!rows || !rows.length) return map;

    const token = typeof window.getApiToken === 'function' ? window.getApiToken() : null;
    if (!token) return map;

    const tipoNegocio = window.EMPRESA_CFG?.tipo || '';

    const uniqueMetrics = new Map();
    for (const r of rows) {
        const mk = String(r.metrica || '').trim();
        if (!mk || uniqueMetrics.has(mk)) continue;
        uniqueMetrics.set(mk, {
            metrica: mk,
            valor_numero: r.valor_numero,
            unidad: r.unidad || '',
            periodo_inicio: r.periodo_inicio || '',
            periodo_fin: r.periodo_fin || '',
        });
    }

    const kpis = [...uniqueMetrics.values()];
    if (!kpis.length) return map;

    try {
        const url = typeof window.apiUrl === 'function' ? window.apiUrl('/api/ia/explicar-kpis') : '/api/ia/explicar-kpis';
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ kpis, tipo_negocio: tipoNegocio }),
        });
        if (!resp.ok) return map;
        const data = await resp.json();
        if (data.explicaciones && typeof data.explicaciones === 'object') {
            for (const [k, v] of Object.entries(data.explicaciones)) {
                if (v && typeof v === 'object') {
                    map.set(k, {
                        explicacion: String(v.explicacion || ''),
                        recomendacion: String(v.recomendacion || ''),
                    });
                }
            }
        }
    } catch (e) {
        console.error('[kpi-pdf-explicacion-ia]', e);
    }
    return map;
}

if (typeof window !== 'undefined') {
    window._gnObtenerExplicacionesKpiIA = obtenerExplicacionesKpiIA;
}
