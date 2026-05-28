/**
 * Textos legibles para informes KPI en PDF (sin jerga técnica).
 * made by leavera77
 */

/**
 * Convierte una clave de métrica cruda (ej. "pct_cerrados_24h") a etiqueta legible ("% Cerrados 24h").
 */
export function formatearMetricaKeyLegible(key) {
    const s = String(key || '').trim();
    if (!s) return '—';
    let label = s
        .replace(/^pct_/i, '% ')
        .replace(/_pct$/i, ' %')
        .replace(/_pct_/i, ' % ')
        .replace(/_/g, ' ');
    label = label.replace(/\b\w/g, (c) => c.toUpperCase());
    label = label.replace(/(\d+)\s*h\b/gi, '$1h');
    return label.trim();
}

function parseValorJsonRow(row) {
    let v = row && row.valor_json;
    if (v == null) return {};
    if (typeof v === 'string') {
        try {
            v = JSON.parse(v);
        } catch (_) {
            return {};
        }
    }
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function periodoMinMaxFilas(filas, fmtFechaCorta) {
    const fmt = typeof fmtFechaCorta === 'function' ? fmtFechaCorta : (v) => String(v || '—');
    let minD = null;
    let maxD = null;
    for (const r of filas || []) {
        const a = r.periodo_inicio
            ? new Date(String(r.periodo_inicio).length <= 10 ? r.periodo_inicio + 'T12:00:00' : r.periodo_inicio)
            : null;
        const b = r.periodo_fin
            ? new Date(String(r.periodo_fin).length <= 10 ? r.periodo_fin + 'T12:00:00' : r.periodo_fin)
            : null;
        if (a && !Number.isNaN(a.getTime())) {
            if (!minD || a < minD) minD = a;
        }
        if (b && !Number.isNaN(b.getTime())) {
            if (!maxD || b > maxD) maxD = b;
        }
    }
    const fi = minD ? fmt(minD.toISOString().slice(0, 10)) : '—';
    const ff = maxD ? fmt(maxD.toISOString().slice(0, 10)) : '—';
    return { fi, ff };
}

/** Origen del dato en lenguaje claro (PDF y tabla). */
export function legibleFuenteKpi(f) {
    const s = String(f || '').trim();
    if (!s) return 'Origen no indicado';
    const low = s.toLowerCase();
    if (low === 'manual') return 'Carga manual en el panel';
    if (low === 'computed_batch' || low.includes('computed') || low.includes('snapshot')) {
        return 'Cálculo automático desde los datos del sistema';
    }
    if (low === 'api' || low === 'sistema' || low === 'system') return 'Sistema';
    return s;
}

/**
 * Párrafo introductorio del informe (reemplaza texto con conteos técnicos).
 */
export function introInformeKpiPdfLegible(rows) {
    const n = Array.isArray(rows) ? rows.length : 0;
    return (
        `Este informe reúne los indicadores clave guardados para la organización (${n} registro${n === 1 ? '' : 's'}). ` +
        'Cada indicador corresponde a un valor consolidado en un periodo (fechas desde/hasta), con su unidad y el origen del dato. ' +
        'Los gráficos muestran la evolución por tipo de indicador; al final se detallan todas las filas. Documento para uso interno de gestión.'
    );
}

const EXPLICACION_METRICA = {
    satisfaccion_pct:
        'Este indicador refleja la satisfacción de los vecinos que respondieron la encuesta por WhatsApp después del cierre de su reclamo.',
    pct_cierres_con_foto:
        'Mide qué porcentaje de reclamos cerrados incluyó al menos una foto de evidencia en el sistema.',
    reclamos_cerrados_count: 'Total de reclamos que pasaron a estado cerrado en el periodo considerado.',
    reclamos_recibidos_count: 'Total de reclamos ingresados al sistema en el periodo considerado.',
    tiempo_respuesta_medio_horas:
        'Promedio de horas entre el ingreso del reclamo y la primera respuesta operativa registrada.',
    avance_medio_pct: 'Promedio del avance declarado en trabajos en curso o recientes en el periodo.',
    saifi_indice: 'SAIFI: frecuencia equivalente de interrupciones del servicio eléctrico en el periodo.',
    saidi_minutos: 'SAIDI: duración equivalente de interrupciones (minutos) en el periodo.',
    pct_bacheo_resuelto_48h: 'Porcentaje de reclamos de bacheo resueltos en menos de 48 horas.',
    pct_alumbrado_repuesto_24h: 'Porcentaje de reclamos de alumbrado resueltos en menos de 24 horas.',
};

/**
 * Líneas de texto (sin dibujar en PDF) para una métrica antes del gráfico.
 * deps: { fmtFechaCorta, KPI_METRICA_ETIQUETAS }
 */
export function lineasNarrativaMetricaKpiPdf(metricaKey, filas, deps) {
    const { fmtFechaCorta, KPI_METRICA_ETIQUETAS } = deps || {};
    const mk = String(metricaKey || '').trim();
    const fs = Array.isArray(filas) ? filas : [];
    const titulo =
        mk === 'satisfaccion_pct'
            ? 'Satisfacción (WhatsApp 1–5★)'
            : KPI_METRICA_ETIQUETAS && KPI_METRICA_ETIQUETAS[mk]
              ? KPI_METRICA_ETIQUETAS[mk]
              : formatearMetricaKeyLegible(mk);
    const { fi, ff } = periodoMinMaxFilas(fs, fmtFechaCorta || (() => '—'));
    const nPeriodos = fs.length;
    const lineas = [];
    lineas.push(String(titulo).toUpperCase());
    lineas.push('');
    if (mk === 'satisfaccion_pct') {
        const r0 = fs[0];
        const vn = r0 && r0.valor_numero != null && r0.valor_numero !== '' ? Number(r0.valor_numero) : NaN;
        const vj = parseValorJsonRow(r0);
        const nResp =
            Number.isFinite(Number(vj.n_respuestas))
                ? Number(vj.n_respuestas)
                : Number.isFinite(Number(vj.cantidad_respuestas))
                  ? Number(vj.cantidad_respuestas)
                  : nPeriodos;
        const pct = Number.isFinite(vn) ? vn : null;
        const stars = pct != null && !Number.isNaN(pct) ? (pct / 100) * 5 : null;
        const vrText =
            Number.isFinite(nResp) && nResp > 0
                ? `${nResp} valoración${nResp === 1 ? '' : 'es'} recibidas`
                : 'Datos';
        lineas.push(`${vrText} entre el ${fi} y el ${ff}.`);
        if (pct != null && !Number.isNaN(pct)) {
            const est =
                stars != null && !Number.isNaN(stars)
                    ? ` (${stars.toFixed(1).replace(/\.0$/, '')} de 5 estrellas)`
                    : '';
            lineas.push(`Promedio: ${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%${est}.`);
        }
        lineas.push(`Cantidad de respuestas: ${Number.isFinite(nResp) ? nResp : '—'}.`);
    } else {
        const r0 = fs[0];
        const vn =
            r0 && r0.valor_numero != null && r0.valor_numero !== ''
                ? formatearValorNumeroTablaUnDecimal(r0.valor_numero)
                : '—';
        const un = r0 && r0.unidad ? String(r0.unidad) : '';
        lineas.push(
            `${nPeriodos} periodo${nPeriodos === 1 ? '' : 's'} con datos entre el ${fi} y el ${ff}.`
        );
        lineas.push(`Valor consolidado del último periodo listado: ${vn}${un ? ` (${un})` : ''}.`);
    }
    const pie = EXPLICACION_METRICA[mk];
    if (pie) {
        lineas.push('');
        lineas.push(`*${pie}*`);
    }
    return lineas;
}
