import fs from 'fs';

const appPath = 'app/src/main/assets/app.js';
const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/);

function slice(start1, end1) {
    return lines.slice(start1 - 1, end1).join('\n');
}

function writeModule(path, header, body, exports) {
    const exp = exports.map((n) => `export { ${n} };`).join('\n');
    // body already has function declarations - convert to export
    let b = body;
    for (const n of exports) {
        b = b.replace(new RegExp(`^function ${n}\\(`, 'm'), `export function ${n}(`);
        b = b.replace(new RegExp(`^async function ${n}\\(`, 'm'), `export async function ${n}(`);
    }
    fs.writeFileSync(path, header + '\n' + b + '\n');
}

// ── admin-empresa-whatsapp-derivaciones ──
const empresaBody = [
    slice(1068, 1128),
    slice(1547, 1720),
].join('\n\n');
const empresaHeader = `/**
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

function actualizarBotonesWhatsappDerivacionesUi() {
    ['energia', 'agua', 'gas', 'tel', 'policia'].forEach((slot) => {
        const btn = document.getElementById(\`cfg-deriv-\${slot}-btn-wa\`);
        if (!btn) return;
        const act = !!document.getElementById(\`cfg-deriv-\${slot}-activo\`)?.checked;
        const raw = (document.getElementById(\`cfg-deriv-\${slot}-whatsapp\`)?.value || '').trim();
        const w = normalizarWhatsappInternacionalDesdeInput(raw);
        const ok = /^\\+\\d{8,22}$/.test(w);
        btn.disabled = !(act && ok);
    });
    try {
        refreshDerivacionListaWaButtons(normalizarWhatsappInternacionalDesdeInput);
    } catch (_) {}
}

let _cfgDerivWaInputBound = false;

`;
writeModule(
    'app/src/main/assets/modules/admin-empresa-whatsapp-derivaciones.js',
    empresaHeader,
    empresaBody.replace(/let _cfgDerivWaInputBound = false;\n/, '').replace(
        /function actualizarBotonesWhatsappDerivacionesUi\(\)[\s\S]*?^}\n\nlet _cfgDerivWaInputBound/m,
        'let _cfgDerivWaInputBound'
    ),
    [
        'parseWhatsappArAreasPorLocalidadTextarea',
        'serializeWhatsappArAreasPorLocalidadTextarea',
        'parseWhatsappArAreaPrefixesInput',
        'sincronizarCamposWhatsappArAreaDesdeEmpresaCfg',
        'normalizarWhatsappInternacionalDesdeInput',
        'actualizarBotonesWhatsappDerivacionesUi',
        'bindDerivacionesFormInputsOnce',
        'poblarFormDerivacionesDesdeEmpresaCfg',
        'abrirWhatsappDerivacionForm',
        'digitosWhatsAppDerivacionEmpresaCfg',
        'obtenerWaMeUrlDerivacionEmpresaCfg',
    ]
);

// Fix window.abrirWhatsapp in module file
let emp = fs.readFileSync('app/src/main/assets/modules/admin-empresa-whatsapp-derivaciones.js', 'utf8');
emp = emp.replace(
    'window.abrirWhatsappDerivacionForm = abrirWhatsappDerivacionForm;',
    'export function wireAbrirWhatsappDerivacionFormWindow() {\n    if (typeof window !== "undefined") window.abrirWhatsappDerivacionForm = abrirWhatsappDerivacionForm;\n}\n'
);
fs.writeFileSync('app/src/main/assets/modules/admin-empresa-whatsapp-derivaciones.js', emp);

// ── gn-wa-geo-ops-panel ──
const geoBody = slice(4236, 4364);
const geoHeader = `/**
 * Panel admin operaciones geocodificación WhatsApp.
 * made by leavera77
 */

/** @type {Record<string, unknown> | null} */
let _deps = null;

export function setGnWaGeoOpsPanelDeps(d) {
    _deps = d && typeof d === 'object' ? d : null;
}

function esAdmin() {
    return typeof _deps?.esAdmin === 'function' && _deps.esAdmin();
}

function modoOffline() {
    return !!_deps?.modoOffline?.();
}

function getApiToken() {
    return _deps?.getApiToken?.();
}

function apiUrl(p) {
    return _deps?.apiUrl?.(p);
}

`;
writeModule('app/src/main/assets/modules/gn-wa-geo-ops-panel.js', geoHeader, geoBody, [
    'gnWaGeoOpsRefresh',
    'gnWaGeoOpsStartPoll',
    'gnWaGeoOpsStopPoll',
    '_gnWaGeoOpsSyncPauseButtonUi',
]);

let geo = fs.readFileSync('app/src/main/assets/modules/gn-wa-geo-ops-panel.js', 'utf8');
geo += `
let _gnWaGeoOpsDockBound = false;

export function gnWaGeoOpsBindControlsOnce() {
    if (_gnWaGeoOpsDockBound) return;
    _gnWaGeoOpsDockBound = true;
    document.getElementById('gn-wa-geo-ops-refresh')?.addEventListener('click', () => gnWaGeoOpsRefresh(true));
    document.getElementById('gn-wa-geo-ops-pause')?.addEventListener('click', () => {
        _gnWaGeoOpsUserPaused = !_gnWaGeoOpsUserPaused;
        _gnWaGeoOpsSyncPauseButtonUi();
        if (!_gnWaGeoOpsUserPaused) gnWaGeoOpsRefresh(false);
    });
    _gnWaGeoOpsSyncPauseButtonUi();
}
`;
fs.writeFileSync('app/src/main/assets/modules/gn-wa-geo-ops-panel.js', geo);

console.log('empresa + geo modules written');
