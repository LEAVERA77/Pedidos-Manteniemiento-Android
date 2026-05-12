/**
 * Renderiza bloques de explicación IA en el PDF de KPI snapshots.
 * Diseño ejecutivo: fuente legible, colores profesionales, línea decorativa.
 * made by leavera77
 */

/**
 * Dibuja la explicación + recomendación IA debajo de un chart de KPI.
 * @param {jsPDF} pdf
 * @param {{ explicacion: string, recomendacion: string }} iaData
 * @param {{ y: number, margin: number, maxW: number, pageH: number }} ctx
 * @returns {number} nuevo valor de y
 */
export function kpiPdfRenderIaBlock(pdf, iaData, ctx) {
  if (!iaData) return ctx.y;
  const { explicacion, recomendacion } = iaData;
  if (!explicacion && !recomendacion) return ctx.y;

  let { y } = ctx;
  const { margin, maxW, pageH } = ctx;
  const footerH = 14;
  const lineH = 3.6;

  function checkPage(need) {
    if (y + need > pageH - footerH) {
      pdf.addPage();
      y = margin;
    }
  }

  checkPage(14);

  pdf.setDrawColor(109, 40, 217);
  pdf.setLineWidth(0.3);
  pdf.line(margin + 2, y, margin + 22, y);
  y += 2.5;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(109, 40, 217);
  pdf.text('Análisis IA', margin + 2, y);
  y += 3.5;

  if (explicacion) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(30, 41, 59);
    const lines = pdf.splitTextToSize(String(explicacion), maxW - 6);
    for (const line of lines) {
      checkPage(lineH + 1);
      pdf.text(line, margin + 3, y);
      y += lineH;
    }
    y += 1.5;
  }

  if (recomendacion) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(109, 40, 217);
    const recLines = pdf.splitTextToSize('\u2192  ' + String(recomendacion), maxW - 6);
    for (const line of recLines) {
      checkPage(lineH + 1);
      pdf.text(line, margin + 3, y);
      y += lineH;
    }
    y += 2;
  }

  return y;
}
