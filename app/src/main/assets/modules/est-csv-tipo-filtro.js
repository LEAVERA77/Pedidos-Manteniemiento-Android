/**
 * Filtro CSV estadísticas: comodines * ? en tipo_trabajo (ILIKE) + datalist de sugerencias.
 * made by leavera77
 */

import { tiposReclamoSeleccionables } from './catalogoReclamoPorRubro.js';

/**
 * @param {string} where
 * @param {string} tipoFilt
 * @param {(s: string) => string} esc SQL escaper
 */
export function appendTipoTrabajoFilterToWhere(where, tipoFilt, esc) {
    const t = String(tipoFilt || '').trim();
    if (!t) return where;
    if (/[*?]/.test(t)) {
        const likePat = t
            .replace(/\\/g, '\\\\')
            .replace(/%/g, '\\%')
            .replace(/_/g, '\\_')
            .replace(/\*/g, '%')
            .replace(/\?/g, '_');
        return `${where} AND tipo_trabajo ILIKE ${esc(likePat)} ESCAPE '\\'`;
    }
    return `${where} AND POSITION(LOWER(${esc(t.toLowerCase())}) IN LOWER(COALESCE(tipo_trabajo,''))) > 0`;
}

function poblarDatalistEstCsvTipo() {
    const inp = document.getElementById('est-csv-tipo');
    if (!inp || inp.dataset.gnDatalistBound === '1') return;
    let dl = document.getElementById('est-csv-tipo-datalist');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'est-csv-tipo-datalist';
        document.body.appendChild(dl);
    }
    inp.setAttribute('list', 'est-csv-tipo-datalist');
    inp.dataset.gnDatalistBound = '1';
    const fill = () => {
        try {
            const tipos = tiposReclamoSeleccionables() || [];
            const seen = new Set();
            dl.innerHTML = '';
            for (const x of tipos) {
                const v = String(x || '').trim();
                if (!v || seen.has(v.toLowerCase())) continue;
                seen.add(v.toLowerCase());
                const o = document.createElement('option');
                o.value = v;
                dl.appendChild(o);
            }
        } catch (_) {}
    };
    fill();
    document.addEventListener('gn-empresa-cfg-updated', fill);
}

export function initEstCsvTipoAutocomplete() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poblarDatalistEstCsvTipo);
    else poblarDatalistEstCsvTipo();
}
