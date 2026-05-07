/**
 * Textos de menú numerados del bot de WhatsApp (preview / utilidades).
 * Los tipos salen de `TIPOS_RECLAMO_POR_RUBRO` en catalogoReclamoPorRubro.js (paridad con reclamos web).
 * made by leavera77
 */

import { TIPOS_RECLAMO_POR_RUBRO } from './catalogoReclamoPorRubro.js';

export function normalizarTipoNegocioBot(raw) {
    const t = String(raw || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t === 'cooperativa de agua' || t === 'agua') return 'cooperativa_agua';
    return 'cooperativa_electrica';
}

export function listaTiposBotPorRubro(rubroKey) {
    const k = normalizarTipoNegocioBot(rubroKey);
    const arr = TIPOS_RECLAMO_POR_RUBRO[k];
    return arr && arr.length ? [...arr] : [...TIPOS_RECLAMO_POR_RUBRO.cooperativa_electrica];
}

/**
 * Texto del menú tal como lo ve el vecino (sin formato Markdown de Meta; el servidor puede envolver con * si hace falta).
 * @param {string} tipoNegocio — municipio | cooperativa_agua | cooperativa_electrica | aliases
 * @param {string} nombreEmpresa — nombre del tenant
 */
export function generarMenuBot(tipoNegocio, nombreEmpresa) {
    const rubro = normalizarTipoNegocioBot(tipoNegocio);
    const nombre = String(nombreEmpresa || '').trim() || 'GestorNova';
    const tipos = listaTiposBotPorRubro(rubro);
    const head = `Bienvenido al centro de atención de ${nombre}.`;
    const lines = ['0) Mis reclamos (pedidos abiertos)', ...tipos.map((t, i) => `${i + 1}) ${t}`)];
    return `${head}\n\n${lines.join('\n')}\n\nEnviá *menú* para repetir. *0* = Mis reclamos.`;
}

/**
 * Convierte número de opción (1..n) en texto de tipo de reclamo, o null si inválido.
 */
export function procesarRespuestaBot(numero, tipoNegocio) {
    const raw = String(numero ?? '').trim();
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    if (!Number.isFinite(n) || n < 1) return null;
    const tipos = listaTiposBotPorRubro(tipoNegocio);
    if (n > tipos.length) return null;
    return tipos[n - 1] || null;
}

/**
 * Referencia única para vecinos (municipio, cooperativa eléctrica y agua): mismo paso opcional de foto en el bot.
 * El procesamiento real está en la API (`whatsappBotMeta` / Whapi adapter).
 */
export const AYUDA_ENVIAR_FOTO_RECLAMO_WA =
    'Podés adjuntar una sola foto (JPG o PNG): en WhatsApp tocá 📎 y elegí Galería o Cámara.';
