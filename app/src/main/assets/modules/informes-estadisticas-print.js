/**
 * Impresión y PDF multipágina de estadísticas admin (orquestación).
 * Captura: informes-estadisticas-pdf-capture.js
 * made by leavera77
 */

import { construirHtmlEncabezadoInformeEmpresa } from './informe-empresa-html-encabezado.js';
import { pdfEncabezadoEmpresaBloque } from './empresa-encabezado-pdf.js';
import {
    pdfMmAjustarImagen,
    escAttrPrint,
    prepararVistaCapturaEstadisticasPdf,
    coleccionSeccionesPdfEstadisticas,
    capturaPdfBloqueResumenEstadisticas,
    html2canvasCapturaElemento,
} from './informes-estadisticas-pdf-capture.js';

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setInformesEstadisticasPrintDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function ctx() {
    return _deps || {};
}

export async function imprimirInformeConGraficos() {
    if (!ctx().esAdmin?.()) { ctx().toast?.('Solo administrador', 'error'); return; }
    if (ctx().modoOffline?.() || !ctx().neonOk?.()) { ctx().toast?.('Requiere conexión', 'error'); return; }
    if (typeof html2canvas !== 'function') { ctx().toast?.('html2canvas no disponible', 'error'); return; }
    document.getElementById('admin-panel')?.classList.add('active');
    ctx().adminTab?.('estadisticas');
    await ctx().cargarEstadisticas?.();
    await new Promise(r => setTimeout(r, 500));
    const secciones = coleccionSeccionesPdfEstadisticas();
    if (!secciones.length) { ctx().toast?.('No hay secciones para imprimir', 'error'); return; }
    const urls = [];
    const liberarUrls = () => {
        urls.forEach(u => {
            try {
                URL.revokeObjectURL(u);
            } catch (_) {}
        });
    };
    await prepararVistaCapturaEstadisticasPdf(true);
    try {
        ctx().toast?.('Generando vista para imprimir…', 'info');
        const canvasToUrl = canvas =>
            new Promise((res, rej) => {
                try {
                    canvas.toBlob(
                        b => {
                            if (!b) return rej(new Error('toBlob'));
                            const u = URL.createObjectURL(b);
                            urls.push(u);
                            res(u);
                        },
                        'image/png'
                    );
                } catch (e) {
                    rej(e);
                }
            });
        const pageBlocks = [];
        const chartBuf = [];
        const flushChartsGrid = () => {
            while (chartBuf.length >= 2) {
                pageBlocks.push({
                    kind: 'grid2',
                    items: chartBuf.splice(0, 2).map((it) => ({ url: it.url, title: it.title })),
                });
            }
        };
        const flushChartsGridRest = () => {
            if (!chartBuf.length) return;
            const items = chartBuf.splice(0, chartBuf.length).map((it) => ({ url: it.url, title: it.title }));
            pageBlocks.push({
                kind: items.length === 1 ? 'chartFull' : 'grid2',
                items,
            });
        };
        for (const sec of secciones) {
            if (sec.type === 'resumen') {
                flushChartsGrid();
                flushChartsGridRest();
                const canvas = await capturaPdfBloqueResumenEstadisticas();
                if (canvas) {
                    const u = await canvasToUrl(canvas);
                    pageBlocks.push({ kind: 'resumen', url: u, title: ctx().tituloResumenReferenciaEstadisticas?.() });
                }
            } else if (sec.type === 'chart') {
                const canvas = await html2canvasCapturaElemento(sec.el, {
                    delayAfterResize: 160,
                    statsExport: true,
                    maxHeightPx: 3200,
                });
                if (canvas) {
                    const u = await canvasToUrl(canvas);
                    if (sec.fullPage) {
                        flushChartsGrid();
                        flushChartsGridRest();
                        pageBlocks.push({
                            kind: 'chartFull',
                            items: [{ url: u, title: sec.title }],
                        });
                    } else {
                        chartBuf.push({ url: u, title: sec.title });
                        flushChartsGrid();
                    }
                }
            }
        }
        flushChartsGrid();
        flushChartsGridRest();
        if (!pageBlocks.length) {
            ctx().toast?.('No se pudo capturar el panel', 'error');
            return;
        }
        const w = window.open('', '_blank');
        if (!w) {
            liberarUrls();
            ctx().toast?.('Permití ventanas emergentes para imprimir', 'error');
            return;
        }
        const ent = String(window.EMPRESA_CFG?.nombre || 'GestorNova').trim() || 'GestorNova';
        const subt = ctx().lineaPeriodoInformeEstadisticas?.();
        const totalPag = pageBlocks.length;
        const notaPie =
            '<p class="gn-print-nota">Documento para gestión interna. Desactivá «Encabezado y pie de página» del navegador al imprimir para evitar URLs en el borde.</p>';
        const hdrHtml = construirHtmlEncabezadoInformeEmpresa(subt);
        const bloques = pageBlocks
            .map((bl, pi) => {
                const pnum = pi + 1;
                const pie = `<footer class="gn-print-footer">Página ${pnum} / ${totalPag} · ${escAttrPrint(ent)}</footer>`;
                const notaUlt = pi === totalPag - 1 ? notaPie : '';
                if (bl.kind === 'resumen') {
                    return (
                        `<section class="gn-print-page gn-print-page--first">` +
                        `<div class="gn-print-empresa-head">${hdrHtml}</div>` +
                        `<h1 class="gn-print-h1">${escAttrPrint(bl.title)}</h1>` +
                        `<p class="gn-print-sub">${escAttrPrint(subt)}</p>` +
                        `<div class="gn-print-imgwrap gn-print-imgwrap--full"><img src="${bl.url}" alt=""/></div>${pie}${notaUlt}</section>`
                    );
                }
                if (bl.kind === 'chartFull') {
                    const it = bl.items?.[0] || bl;
                    const tit = it.title || bl.title || 'Gráfico';
                    const url = it.url || bl.url;
                    return (
                        `<section class="gn-print-page gn-print-page--chart-full">` +
                        `<p class="gn-print-sub gn-print-sub--tight">${escAttrPrint(subt)}</p>` +
                        `<h2 class="gn-print-h1 gn-print-h1--chart">${escAttrPrint(tit)}</h2>` +
                        `<div class="gn-print-imgwrap gn-print-imgwrap--fullchart"><img src="${url}" alt=""/></div>${pie}${notaUlt}</section>`
                    );
                }
                const cells = (bl.items || [])
                    .map(
                        (it, idx) =>
                            `<div class="gn-print-cell">` +
                            `<h2 class="gn-print-h2cell">${escAttrPrint(it.title || 'Gráfico ' + (idx + 1))}</h2>` +
                            `<div class="gn-print-imgwrap gn-print-imgwrap--cell"><img src="${it.url}" alt=""/></div></div>`
                    )
                    .join('');
                const gridCls = bl.kind === 'grid2' ? 'gn-print-grid2' : 'gn-print-grid4';
                return (
                    `<section class="gn-print-page gn-print-page--grid">` +
                    `<p class="gn-print-sub gn-print-sub--tight">${escAttrPrint(subt)}</p>` +
                    `<div class="${gridCls}">${cells}</div>${pie}${notaUlt}</section>`
                );
            })
            .join('');
        const css =
            '@page{size:A4;margin:10mm}' +
            '*{box-sizing:border-box}' +
            'body{margin:0;background:#fff;font-family:system-ui,Segoe UI,sans-serif;color:#0f172a}' +
            '.gn-print-page{page-break-after:always;break-after:page;padding:0 0 4mm}' +
            '.gn-print-page:last-child{page-break-after:auto;break-after:auto}' +
            '.gn-print-h1{font-size:11pt;font-weight:700;color:#1e3a8a;margin:0 0 2mm;letter-spacing:.02em;border-bottom:1px solid #e2e8f0;padding-bottom:2mm}' +
            '.gn-print-sub{font-size:7.5pt;color:#64748b;margin:0 0 3mm;line-height:1.35}' +
            '.gn-print-sub--tight{margin-bottom:2mm}' +
            '.gn-print-grid2{display:grid;grid-template-columns:1fr 1fr;gap:5mm;align-content:start;align-items:start}' +
            '.gn-print-grid4{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:4mm;align-content:start;align-items:start}' +
            '.gn-print-cell{display:flex;flex-direction:column;align-items:center;min-height:0;overflow:hidden;max-height:118mm}' +
            '.gn-print-h2cell{font-size:8.5pt;font-weight:700;color:#334155;margin:0 0 1.5mm;padding:0;border:none;width:100%;text-align:center;line-height:1.25}' +
            '.gn-print-h1--chart{font-size:10pt;margin:0 0 3mm}' +
            '.gn-print-imgwrap{display:flex;justify-content:center;align-items:flex-start}' +
            '.gn-print-imgwrap--full img{display:block;max-width:100%;width:auto;height:auto;max-height:258mm;object-fit:contain}' +
            '.gn-print-imgwrap--fullchart img{display:block;width:100%;max-width:100%;height:auto;max-height:232mm;object-fit:contain;object-position:center top}' +
            '.gn-print-imgwrap--cell{flex:0 1 auto;width:100%;min-height:0;overflow:hidden;display:flex;justify-content:center;align-items:flex-start}' +
            '.gn-print-imgwrap--cell img{display:block;max-width:100%;max-height:108mm;width:auto;height:auto;margin:0 auto;object-fit:contain;object-position:center top}' +
            '.gn-print-footer{font-size:7pt;color:#64748b;text-align:center;margin-top:3mm;padding-top:2mm;border-top:1px solid #e2e8f0}' +
            '.gn-print-empresa-head{font-size:8.5pt;color:#334155;margin-bottom:4mm;break-inside:avoid}' +
            '.gn-print-nota{font-size:7pt;color:#94a3b8;margin:4mm 0 0;break-inside:avoid;page-break-inside:avoid}';
        w.document.write(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
                escAttrPrint(ent) +
                ' — Estadísticas</title><style>' +
                css +
                '</style></head><body>' + bloques + '</body></html>'
        );
        w.document.close();
        w.focus();
        setTimeout(() => {
            try {
                w.print();
            } catch (_) {}
        }, 500);
        setTimeout(liberarUrls, 120000);
    } catch (e) {
        liberarUrls();
        ctx().toastError?.('imprimir-stats-graficos', e);
    } finally {
        await prepararVistaCapturaEstadisticasPdf(false);
    }
}

export async function generarPdfEstadisticasMultipaginaENRE() {
    if (!ctx().esAdmin?.()) { ctx().toast?.('Solo administrador', 'error'); return; }
    if (ctx().modoOffline?.() || !ctx().neonOk?.()) { ctx().toast?.('Requiere conexión', 'error'); return; }
    if (typeof html2canvas !== 'function' || !window.jspdf?.jsPDF) { ctx().toast?.('Faltan librerías (html2canvas / jsPDF)', 'error'); return; }
    document.getElementById('admin-panel')?.classList.add('active');
    ctx().adminTab?.('estadisticas');
    await ctx().cargarEstadisticas?.();
    await new Promise(r => setTimeout(r, 500));
    const secciones = coleccionSeccionesPdfEstadisticas();
    if (!secciones.length) { ctx().toast?.('No hay contenido para el PDF', 'error'); return; }
    await prepararVistaCapturaEstadisticasPdf(true);
    try {
        ctx().toast?.('Generando PDF…', 'info');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 11;
        const tsqlPdf = await ctx().pedidosFiltroTenantSql?.();
        const { periodo, fechaDesde } = await ctx().resolveCondicionFechaPedidosStats?.(tsqlPdf);
        const lineaPer = ctx().lineaPeriodoInformeEstadisticas?.();
        let nPag = 0;
        const addCanvasPage = async (canvas, chartTitle) => {
            if (!canvas || !canvas.width) return;
            const maxW = pageW - 2 * margin;
            if (nPag > 0) pdf.addPage();
            nPag++;
            pdf.setFillColor(252, 252, 253);
            pdf.rect(0, 0, pageW, pageH, 'F');
            let y0 = await pdfEncabezadoEmpresaBloque(pdf, margin, pageW, margin, lineaPer);
            if (chartTitle) {
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8.4);
                pdf.setTextColor(51, 65, 85);
                pdf.text(String(chartTitle).slice(0, 72), margin, y0 + 2.5);
                y0 += 5;
            }
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const maxH = Math.max(40, pageH - y0 - margin - 2);
            const { iw, ih } = pdfMmAjustarImagen(canvas.width, canvas.height, maxW, maxH);
            const x0 = margin + (maxW - iw) / 2;
            pdf.addImage(imgData, 'JPEG', x0, y0 + 1, iw, ih, undefined, 'FAST');
        };
        const addChartsPageCombined = async (entries) => {
            const list = (entries || []).filter((e) => e?.canvas?.width);
            if (!list.length) return;
            if (nPag > 0) pdf.addPage();
            nPag++;
            pdf.setFillColor(252, 252, 253);
            pdf.rect(0, 0, pageW, pageH, 'F');
            let y0 = await pdfEncabezadoEmpresaBloque(pdf, margin, pageW, margin, lineaPer);
            y0 += 1.5;
            const gap = 3;
            const maxW = pageW - 2 * margin;
            const maxH = pageH - y0 - margin - 2;
            const titleH = 4.2;
            const drawTitle = (title, x, y) => {
                if (!title) return;
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7);
                pdf.setTextColor(71, 85, 105);
                pdf.text(String(title).slice(0, 56), x, y);
            };
            const placeImg = (canvas, x, y, wBox, hBox) => {
                const imgData = canvas.toDataURL('image/jpeg', 0.87);
                const { iw, ih } = pdfMmAjustarImagen(canvas.width, canvas.height, Math.max(20, wBox - 1), Math.max(24, hBox));
                const xi = x + (wBox - iw) / 2;
                const yi = y + (hBox - ih) / 2;
                pdf.addImage(imgData, 'JPEG', xi, yi, iw, ih, undefined, 'FAST');
            };
            const n = list.length;
            if (n === 1) {
                const e = list[0];
                drawTitle(e.title, margin, y0 + 2.8);
                placeImg(e.canvas, margin, y0 + titleH, maxW, maxH - titleH - 1);
                return;
            }
            if (n === 2) {
                const cellW = (maxW - gap) / 2;
                const imgH = maxH - titleH - 2;
                list.forEach((e, i) => {
                    const xCell = margin + i * (cellW + gap);
                    drawTitle(e.title, xCell + 0.5, y0 + 2.8);
                    placeImg(e.canvas, xCell, y0 + titleH, cellW, imgH);
                });
                return;
            }
            if (n === 3) {
                const row1H = maxH * 0.56;
                const row2H = maxH - row1H - gap;
                const cellW = (maxW - gap) / 2;
                const imgH1 = Math.max(28, row1H - titleH - 1.5);
                for (let i = 0; i < 2; i++) {
                    const e = list[i];
                    const xCell = margin + i * (cellW + gap);
                    drawTitle(e.title, xCell + 0.5, y0 + 2.8);
                    placeImg(e.canvas, xCell, y0 + titleH, cellW, imgH1);
                }
                const e = list[2];
                const w3 = Math.min(maxW * 0.78, maxW);
                const x3 = margin + (maxW - w3) / 2;
                const y2 = y0 + row1H + gap;
                drawTitle(e.title, x3 + 0.5, y2 + 2.5);
                placeImg(e.canvas, x3, y2 + titleH, w3, row2H - titleH - 1);
                return;
            }
            const cellW = (maxW - gap) / 2;
            const cellH = (maxH - gap) / 2;
            const imgMaxH = Math.max(28, cellH - titleH - 1.5);
            list.forEach((e, i) => {
                const row = Math.floor(i / 2);
                const col = i % 2;
                const xCell = margin + col * (cellW + gap);
                const yCell = y0 + row * (cellH + gap);
                drawTitle(e.title, xCell + 0.5, yCell + 2.8);
                placeImg(e.canvas, xCell, yCell + titleH, cellW, imgMaxH);
            });
        };
        const chartQueue = [];
        const flushChartRows = async () => {
            while (chartQueue.length >= 2) {
                await addChartsPageCombined(chartQueue.splice(0, 2));
            }
        };
        for (const sec of secciones) {
            if (sec.type === 'resumen') {
                await flushChartRows();
                if (chartQueue.length) await addChartsPageCombined(chartQueue.splice(0, chartQueue.length));
                await addCanvasPage(await capturaPdfBloqueResumenEstadisticas(), null);
            } else if (sec.type === 'chart') {
                const c = await html2canvasCapturaElemento(sec.el, {
                    delayAfterResize: 160,
                    statsExport: true,
                    maxHeightPx: 3200,
                });
                if (c) {
                    if (sec.fullPage) {
                        await flushChartRows();
                        if (chartQueue.length) await addChartsPageCombined(chartQueue.splice(0, chartQueue.length));
                        await addCanvasPage(c, sec.title);
                    } else {
                        chartQueue.push({ canvas: c, title: sec.title });
                        await flushChartRows();
                    }
                }
            }
        }
        if (chartQueue.length) await addChartsPageCombined(chartQueue);
        if (nPag === 0) {
            ctx().toast?.('No se pudo generar ninguna página', 'error');
            return;
        }
        ctx().kpiPdfPiePaginas?.(pdf);
        const slug = String(window.EMPRESA_CFG?.nombre || 'GestorNova').replace(/[^\w\-]+/g, '_').slice(0, 48);
        pdf.save(`${slug}_estadisticas_A4_${periodo}_${fechaDesde.toISOString().slice(0, 10)}.pdf`);
        ctx().toast?.('PDF listo', 'success');
    } catch (e) {
        ctx().toastError?.('pdf-estadisticas-enre', e, 'Error al generar el PDF.');
    } finally {
        await prepararVistaCapturaEstadisticasPdf(false);
    }
}
