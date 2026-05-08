/**
 * Encabezados PDF (jsPDF) con datos de empresa: domicilio, tel, email.
 * made by leavera77
 */
import { arrayBufferToBase64 } from './export-excel.js';

async function logoEmpresaBase64ParaPdf() {
    const logo = String(
        (typeof window !== 'undefined' && window.EMPRESA_CFG && window.EMPRESA_CFG.logo_url) || ''
    ).trim();
    const path = logo || 'gestornova-logo.png';
    try {
        const abs = new URL(path, window.location.href).href;
        const r = await fetch(abs, { credentials: 'same-origin' });
        if (!r.ok) return null;
        const buf = await r.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('jpeg') || /\.jpe?g(\?|$)/i.test(path)) return { b64, fmt: 'JPEG' };
        return { b64, fmt: 'PNG' };
    } catch (_) {
        return null;
    }
}

function localidadEmpresaDesdeCfg(ec) {
    const e = ec || {};
    return String(e.localidad || e.ciudad || e.ciudad_base || '').trim();
}

/**
 * Línea única: calle + número, localidad, provincia (sin duplicar comas vacías).
 */
export function construirDomicilioEmpresaLinea(ec) {
    const e = ec || {};
    const calle = String(e.calle || '').trim();
    const num = String(e.numero || '').trim();
    const calleNum = [calle, num].filter(Boolean).join(' ').trim();
    const loc = localidadEmpresaDesdeCfg(e);
    const prov = String(e.provincia || e.state || e.provincia_nominatim || '').trim();
    const bloque1 = calleNum;
    const bloque2 = [loc, prov].filter(Boolean).join(', ');
    if (bloque1 && bloque2) return `${bloque1}, ${bloque2}`;
    return bloque1 || bloque2 || '';
}

function textoTelefonoEmpresa(ec) {
    const e = ec || {};
    const t = String(e.telefono_contacto || e.telefono || '').trim();
    return t;
}

function textoEmailEmpresa(ec) {
    const e = ec || {};
    return String(e.email_contacto || e.email || '').trim();
}

/** Doble raya + filetes cortos a los lados (sin Unicode: evita %P%P en impresión). */
function pdfDibujarMarquesinaKpi(pdf, x1, x2, yMm) {
    const w = x2 - x1;
    const tick = Math.min(5, w * 0.04);
    pdf.setDrawColor(30, 64, 175);
    pdf.setLineWidth(0.55);
    pdf.line(x1, yMm, x2, yMm);
    pdf.setDrawColor(199, 210, 230);
    pdf.setLineWidth(0.32);
    pdf.line(x1, yMm + 0.75, x2, yMm + 0.75);
    pdf.setLineWidth(0.4);
    pdf.setDrawColor(30, 64, 175);
    pdf.line(x1, yMm, x1, yMm + tick);
    pdf.line(x2, yMm, x2, yMm + tick);
    pdf.setDrawColor(199, 210, 230);
    pdf.setLineWidth(0.25);
    pdf.line(x1, yMm + 0.75, x1, yMm + 0.75 + tick * 0.65);
    pdf.line(x2, yMm + 0.75, x2, yMm + 0.75 + tick * 0.65);
}

/**
 * Encabezado A4: opciones o string legacy (solo línea de contexto).
 * variante 'kpi': cinta decorativa + INFORME KPI + domicilio + fecha + contacto.
 * default: logo + nombre + domicilio + tel/email + línea de contexto + regla.
 */
export async function pdfEncabezadoEmpresaBloque(pdf, margin, pageW, yStart, opts) {
    const o = typeof opts === 'string' ? { lineaContexto: opts } : opts || {};
    const ec = typeof window !== 'undefined' ? window.EMPRESA_CFG || {} : {};
    const nombre = String(ec.nombre || 'GestorNova').trim() || 'GestorNova';
    const dom = construirDomicilioEmpresaLinea(ec);
    const tel = textoTelefonoEmpresa(ec);
    const mail = textoEmailEmpresa(ec);
    const maxW = pageW - 2 * margin;
    const variante = o.variante || 'default';
    const lineaCtx = String(o.lineaContexto || '').trim();

    let y = yStart;

    if (variante === 'kpi') {
        const x1 = margin;
        const x2 = pageW - margin;
        pdfDibujarMarquesinaKpi(pdf, x1, x2, y + 1);
        y += 6;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(30, 58, 138);
        const titKpi = pdf.splitTextToSize(`INFORME KPI - ${nombre}`, maxW);
        pdf.text(titKpi, margin, y + 5);
        y += titKpi.length * 4.5 + 1;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(51, 65, 85);
        if (dom) {
            const dL = pdf.splitTextToSize(dom, maxW);
            pdf.text(dL, margin, y + 4);
            y += dL.length * 4 + 1;
        }
        const fechaStr = new Date().toLocaleDateString('es-AR', { dateStyle: 'short' });
        pdf.text(`Fecha: ${fechaStr}`, margin, y + 4);
        y += 6;
        pdfDibujarMarquesinaKpi(pdf, x1, x2, y + 1);
        y += 6;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.4);
        pdf.setTextColor(71, 85, 105);
        if (tel) {
            pdf.text(`Tel: ${tel}`, margin, y + 4);
            y += 4.2;
        }
        if (mail) {
            pdf.text(`Email: ${mail}`, margin, y + 4);
            y += 4.2;
        }
        if (lineaCtx) {
            pdf.setFontSize(6.9);
            pdf.setTextColor(100, 116, 139);
            const cl = pdf.splitTextToSize(lineaCtx, maxW);
            pdf.text(cl, margin, y + 4);
            y += cl.length * 3.1 + 2;
        }
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.35);
        pdf.line(margin, y + 2, pageW - margin, y + 2);
        return y + 5;
    }

    /* default: logo + bloque empresa */
    let xTexto = margin;
    const lg = await logoEmpresaBase64ParaPdf();
    if (lg) {
        try {
            pdf.addImage('data:image/' + lg.fmt.toLowerCase() + ';base64,' + lg.b64, lg.fmt, margin, y, 9, 9);
            xTexto = margin + 11;
        } catch (_) {}
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(30, 58, 138);
    pdf.text(nombre, xTexto, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.6);
    pdf.setTextColor(71, 85, 105);
    let y2 = y + 9;
    if (dom) {
        const dL = pdf.splitTextToSize(dom, maxW - (xTexto - margin));
        pdf.text(dL, xTexto, y2);
        y2 += dL.length * 3.3;
    }
    pdf.setFontSize(7.2);
    pdf.setTextColor(80, 90, 110);
    if (tel) {
        pdf.text(`Tel: ${tel}`, xTexto, y2 + 2);
        y2 += 3.4;
    }
    if (mail) {
        pdf.text(`Email: ${mail}`, xTexto, y2 + 2);
        y2 += 3.4;
    }
    pdf.setFontSize(7.2);
    pdf.setTextColor(100, 116, 139);
    if (lineaCtx) {
        const perL = pdf.splitTextToSize(lineaCtx, maxW);
        pdf.text(perL, margin, y2 + 4);
        y2 += perL.length * 3.1;
    }
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.35);
    pdf.line(margin, y2 + 5, pageW - margin, y2 + 5);
    return y2 + 7;
}
