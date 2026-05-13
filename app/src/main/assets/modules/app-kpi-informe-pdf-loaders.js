/**
 * Carga perezosa de dependencias del informe KPI en PDF (gráficos mini, textos, IA, blob).
 * Solo se usa desde flujo admin `imprimirInformeKpiPiloto`.
 * made by leavera77
 */

/** @type {Record<string, unknown> | null} */
let _cache = null;

export async function loadKpiInformePdfDeps() {
    if (_cache) return _cache;
    const [charts, textos, explicacionIa, renderIa, pdfOpen] = await Promise.all([
        import('./kpi-pdf-charts.js'),
        import('./kpi-informe-textos.js'),
        import('./kpi-pdf-explicacion-ia.js'),
        import('./kpi-pdf-ia-render.js'),
        import('./pdf-blob-open.js'),
    ]);
    _cache = {
        kpiPdfMiniChartDataUrl: charts.kpiPdfMiniChartDataUrl,
        introInformeKpiPdfLegible: textos.introInformeKpiPdfLegible,
        legibleFuenteKpi: textos.legibleFuenteKpi,
        lineasNarrativaMetricaKpiPdf: textos.lineasNarrativaMetricaKpiPdf,
        formatearMetricaKeyLegible: textos.formatearMetricaKeyLegible,
        obtenerExplicacionesKpiIA: explicacionIa.obtenerExplicacionesKpiIA,
        kpiPdfRenderIaBlock: renderIa.kpiPdfRenderIaBlock,
        abrirPdfBlobParaImpresion: pdfOpen.abrirPdfBlobParaImpresion,
    };
    return _cache;
}
