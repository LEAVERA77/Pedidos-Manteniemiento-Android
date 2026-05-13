/**
 * HTML de encabezado para informes / capturas de estadísticas (admin).
 * made by leavera77
 */
import { construirDomicilioEmpresaLinea } from './empresa-encabezado-pdf.js';

export function escInformePdfTexto(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function construirHtmlEncabezadoInformeEmpresa(lineaPeriodo) {
    const ec = window.EMPRESA_CFG || {};
    const nombre = String(ec.nombre || 'GestorNova').trim() || 'GestorNova';
    const dom = construirDomicilioEmpresaLinea(ec);
    const tel = String(ec.telefono_contacto || ec.telefono || '').trim();
    const mail = String(ec.email_contacto || ec.email || '').trim();
    const logo = String(ec.logo_url || '').trim();
    const logoSrc = escInformePdfTexto(logo || 'gestornova-logo.png');
    const lp = lineaPeriodo
        ? `<div style="margin-top:6px;font-size:9px;color:#64748b;line-height:1.35">${escInformePdfTexto(lineaPeriodo)}</div>`
        : '';
    const domHtml = dom
        ? `<div style="font-size:10px;color:#475569;margin-top:4px;line-height:1.35">${escInformePdfTexto(dom)}</div>`
        : '';
    const telHtml = tel
        ? `<div style="font-size:10px;color:#475569;margin-top:2px">${escInformePdfTexto(`Tel: ${tel}`)}</div>`
        : '';
    const mailHtml = mail
        ? `<div style="font-size:10px;color:#475569;margin-top:2px">${escInformePdfTexto(`Email: ${mail}`)}</div>`
        : '';
    return (
        `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:10px 12px;background:linear-gradient(180deg,#fff,#f8fafc);border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 1px 2px rgba(15,23,42,.06)">` +
        `<img src="${logoSrc}" alt="" width="48" height="48" style="width:48px;height:48px;object-fit:contain;border-radius:8px;flex-shrink:0" crossorigin="anonymous"/>` +
        `<div style="min-width:0;flex:1"><div style="font-size:16px;font-weight:800;color:#1e3a8a;letter-spacing:-.02em">${escInformePdfTexto(nombre)}</div>` +
        `${domHtml}${telHtml}${mailHtml}` +
        `${lp}</div></div>`
    );
}
