import fs from 'fs';
const lines = fs.readFileSync('app/src/main/assets/app.js', 'utf8').split(/\r?\n/);
const chunks = [lines.slice(1070, 1133), lines.slice(1546, 1724)].flat();
const body = chunks
    .map((l) => {
        if (/^function /.test(l)) return l.replace(/^function /, 'export function ');
        if (/^async function /.test(l)) return l.replace(/^async function /, 'export async function ');
        if (l.startsWith('window.abrirWhatsappDerivacionForm')) return '';
        return l;
    })
    .join('\n');
const header = `/**
 * Config empresa: áreas WhatsApp AR y formulario derivaciones.
 * made by leavera77
 */
import { quitarMovil9Tras54Digitos } from './normalizar-telefono.js';
import {
    poblarDerivacionesListasDesdeCfg,
    refreshDerivacionListaWaButtons,
} from './derivaciones-reclamos-admin.js';

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setAdminEmpresaWhatsappDerivacionesDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function toast(msg, type) {
    _deps?.toast?.(msg, type);
}

function setDerivacionesInlineError(msg) {
    _deps?.setDerivacionesInlineError?.(msg);
}

export function wireAbrirWhatsappDerivacionFormWindow() {
    if (typeof window !== 'undefined') window.abrirWhatsappDerivacionForm = abrirWhatsappDerivacionForm;
}

`;
fs.writeFileSync('app/src/main/assets/modules/admin-empresa-whatsapp-derivaciones.js', header + body + '\n');
console.log('ok');
