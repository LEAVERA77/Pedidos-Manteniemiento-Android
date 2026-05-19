import fs from 'fs';
const lines = fs.readFileSync('app/src/main/assets/app.js', 'utf8').split(/\r?\n/);
// Find block by marker
const start = lines.findIndex((l) => l.includes('let _waHcPollInterval'));
const end = lines.findIndex((l) => l.includes('window.finalizarChatWaHumanChatAdmin'));
if (start < 0 || end < 0) {
    console.error('markers not found', start, end);
    process.exit(1);
}
const body = lines.slice(start, end + 1);
const header = `/**
 * WhatsApp human chat admin (poll + ventanas flotantes).
 * made by leavera77
 */

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setWhatsappHumanChatAdminDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function esAdmin() {
    return typeof _deps?.esAdmin === 'function' && _deps.esAdmin();
}
function toast(msg, type) {
    _deps?.toast?.(msg, type);
}
function toastError(code, e, msg) {
    _deps?.toastError?.(code, e, msg);
}
function getApiToken() {
    return _deps?.getApiToken?.();
}
function apiUrl(p) {
    return _deps?.apiUrl?.(p);
}
function asegurarJwtApiRest() {
    return _deps?.asegurarJwtApiRest?.();
}
function puedeEnviarApiRestPedidos() {
    return _deps?.puedeEnviarApiRestPedidos?.();
}
function modoOffline() {
    return !!_deps?.modoOffline?.();
}
function escOpt(s) {
    return _deps?.escOpt?.(s) ?? String(s ?? '');
}

`;
const outBody = body
    .map((l) => {
        if (l.startsWith('function ') && !l.startsWith('function onWaHc'))
            return l.replace(/^function /, 'export function ');
        if (l.startsWith('async function ')) return l.replace(/^async function /, 'export async function ');
        if (l.startsWith('window.')) return '';
        return l.replace(/\b_escOpt\(/g, 'escOpt(');
    })
    .join('\n');
const footer = `
export function wireWhatsappHumanChatAdminWindow() {
    if (typeof window === 'undefined') return;
    window.cerrarModalWaHumanChat = cerrarModalWaHumanChat;
    window.abrirModalWhatsappHumanChat = abrirModalWhatsappHumanChat;
    window.onWaHcPickerChange = onWaHcPickerChange;
    window.enviarMensajeWaHumanChatAdmin = enviarMensajeWaHumanChatAdmin;
    window.finalizarChatWaHumanChatAdmin = finalizarChatWaHumanChatAdmin;
}
`;
fs.writeFileSync(
    'app/src/main/assets/modules/whatsapp-human-chat-admin.js',
    header + outBody + footer
);
// remove from app.js
const newLines = [...lines.slice(0, start), ...lines.slice(end + 1)];
fs.writeFileSync('app/src/main/assets/app.js', newLines.join('\n'));
console.log('wa-hc module', outBody.split('\n').length, 'lines; app.js', newLines.length);
