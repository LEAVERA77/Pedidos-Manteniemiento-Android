/**
 * Aplica una fila del padrón (socio / cliente final) al formulario #pm.
 * made by leavera77
 */

import { registrarProteccionPadronPedidoNuevo } from './pedido-nuevo-nominatim-padron-guard.js';

/**
 * @param {string} cod
 * @returns {{ raw: string, codePart: string, namePart: string, upper: string }}
 */
function parseDistribuidorCatalogo(cod) {
    const raw = String(cod || '').trim();
    if (!raw) return { raw: '', codePart: '', namePart: '', upper: '' };
    const split = raw.split(/\s*[-–—]\s*/);
    return {
        raw,
        codePart: (split[0] || '').trim(),
        namePart: split.slice(1).join(' - ').trim(),
        upper: raw.toUpperCase(),
    };
}

/** @param {string} s */
function normDist(s) {
    return String(s || '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @param {string} cod valor del catálogo (código corto, etiqueta "COD - Nombre", etc.)
 * @param {HTMLSelectElement|null} di2
 * @param {{ retriesLeft?: number }} [opts]
 */
export function seleccionarDistribuidorPorCodigo(cod, di2, opts = {}) {
    if (!di2 || !cod) return false;
    const { raw, codePart, namePart, upper } = parseDistribuidorCatalogo(cod);
    if (!raw) return false;

    const options = Array.from(di2.options).filter((o) => o.value);
    if (!options.length) {
        const left = opts.retriesLeft ?? 0;
        if (left > 0) {
            setTimeout(() => seleccionarDistribuidorPorCodigo(cod, di2, { retriesLeft: left - 1 }), 220);
        }
        return false;
    }

    const textOf = (o) => normDist(o.textContent || '');
    const valOf = (o) => normDist(o.value || '');

    let opt =
        options.find((o) => valOf(o) === normDist(codePart)) ||
        options.find((o) => valOf(o) === upper) ||
        options.find((o) => textOf(o) === upper);

    if (!opt && codePart) {
        const cp = normDist(codePart);
        opt = options.find(
            (o) =>
                textOf(o).startsWith(`${cp} `) ||
                textOf(o).startsWith(`${cp} -`) ||
                valOf(o).startsWith(cp)
        );
    }

    if (!opt && namePart) {
        const np = normDist(namePart);
        opt = options.find((o) => {
            const t = textOf(o);
            const after = t.includes(' - ') ? t.split(' - ').slice(1).join(' - ') : t;
            return after === np || after.includes(np) || np.includes(after);
        });
    }

    if (!opt && raw.length >= 3) {
        opt = options.find((o) => textOf(o).includes(upper) || upper.includes(textOf(o)));
    }

    if (!opt && codePart.length >= 4) {
        const base = normDist(codePart).replace(/[A-Z]{1,3}$/i, '');
        if (base.length >= 4) {
            opt = options.find((o) => valOf(o).startsWith(base) || textOf(o).includes(base));
        }
    }

    if (opt) {
        di2.value = opt.value;
        try {
            di2.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
        return true;
    }

    const left = opts.retriesLeft ?? 0;
    if (left > 0) {
        setTimeout(() => seleccionarDistribuidorPorCodigo(cod, di2, { retriesLeft: left - 1 }), 220);
    }
    return false;
}

/**
 * Añade o selecciona una opción en #di2 (p. ej. barrio o "D120 - Red …" del padrón).
 * @param {HTMLSelectElement|null} di2
 * @param {string} value
 * @param {string} [label]
 */
export function asegurarOpcionDi2(di2, value, label) {
    if (!di2) return false;
    const v = String(value || '').trim();
    if (!v) return false;
    const lbl = String(label || v).trim();
    let opt = Array.from(di2.options).find((o) => String(o.value || '').trim() === v);
    if (!opt) {
        opt = document.createElement('option');
        opt.value = v;
        opt.textContent = lbl;
        const firstOg = di2.querySelector('optgroup');
        if (firstOg) di2.insertBefore(opt, firstOg);
        else di2.appendChild(opt);
    } else if (lbl && String(opt.textContent || '').trim() !== lbl) {
        opt.textContent = lbl;
    }
    di2.value = v;
    try {
        di2.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
    return true;
}

/**
 * @param {string|null|undefined} tx
 */
function mapearTipoConexion(tx) {
    const t = String(tx || '').trim().toLowerCase();
    if (!t) return '';
    if (t.includes('subter')) return 'Subterráneo';
    if (t.includes('aer') || t.includes('éreo') || t.includes('ereo')) return 'Aéreo';
    return '';
}

/**
 * @param {string|null|undefined} fx
 */
function mapearFases(fx) {
    const f = String(fx || '').trim().toLowerCase();
    if (!f) return '';
    if (f.includes('tri')) return 'Trifásico';
    if (f.includes('mono')) return 'Monofásico';
    return '';
}

/**
 * @param {{
 *   nombre?: string,
 *   identificador?: string,
 *   nis?: string|null,
 *   medidor?: string|null,
 *   nis_medidor?: string|null,
 *   numero_cliente?: string|null,
 *   calle?: string|null,
 *   numero?: string|null,
 *   localidad?: string|null,
 *   barrio?: string|null,
 *   telefono?: string|null,
 *   transformador?: string|null,
 *   distribuidor_codigo?: string|null,
 *   tipo_conexion?: string|null,
 *   fases?: string|null,
 * }} row
 * @param {{
 *   esCooperativaElectrica?: boolean,
 *   esMunicipio?: boolean,
 *   esAgua?: boolean,
 *   limpiarTelefono?: boolean,
 *   ensureDistribuidoresCargados?: () => Promise<void>,
 *   delegarZonaDi2?: boolean,
 * }} [opts]
 */
export function aplicarPadronAlFormularioNuevoPedido(row, opts = {}) {
    const limpiarTel = opts.limpiarTelefono !== false;
    const inpN = document.getElementById('nis');
    const cl = document.getElementById('cl');
    const tel = document.getElementById('ped-tel-contacto');
    const calleEl = document.getElementById('ped-cli-calle');
    const numEl = document.getElementById('ped-cli-num');
    const locEl = document.getElementById('ped-cli-loc');
    const refEl = document.getElementById('ped-cli-ref');
    const tf = document.getElementById('trafo-pedido');
    const di2 = document.getElementById('di2');

    const ident =
        row.nis_medidor ||
        row.medidor ||
        row.nis ||
        row.numero_cliente ||
        row.identificador ||
        '';
    if (inpN && ident) inpN.value = String(ident).trim();

    if (cl && row.nombre) cl.value = String(row.nombre).trim();
    if (tel) {
        const telPadron = row.telefono != null ? String(row.telefono).trim() : '';
        if (telPadron) tel.value = telPadron;
        else if (limpiarTel) tel.value = '';
    }
    if (calleEl && row.calle != null) calleEl.value = String(row.calle).trim();
    if (numEl && row.numero != null) numEl.value = String(row.numero).trim();
    if (locEl && row.localidad != null) locEl.value = String(row.localidad).trim();

    if (opts.esMunicipio || opts.esAgua) {
        if (refEl && row.barrio != null) refEl.value = String(row.barrio).trim();
        if (!opts.delegarZonaDi2 && opts.esMunicipio && di2 && (row.barrio || row.distribuidor_codigo)) {
            const br = String(row.barrio || row.distribuidor_codigo || '').trim();
            const opt = Array.from(di2.options).find(
                (o) =>
                    (o.value || '').trim().toLowerCase() === br.toLowerCase() ||
                    (o.textContent || '').trim().toLowerCase() === br.toLowerCase()
            );
            if (opt) di2.value = opt.value;
        }
        if (tf) tf.value = '';
        return String(ident || '').trim();
    }

    if (opts.esCooperativaElectrica) {
        if (tf && row.transformador) tf.value = String(row.transformador).trim();
        if (!opts.delegarZonaDi2 && row.distribuidor_codigo && di2) {
            const cod = row.distribuidor_codigo;
            const aplicarDist = () => seleccionarDistribuidorPorCodigo(cod, di2, { retriesLeft: 15 });
            if (typeof opts.ensureDistribuidoresCargados === 'function') {
                void opts.ensureDistribuidoresCargados().then(aplicarDist);
            } else {
                aplicarDist();
            }
        }
        if (refEl && row.barrio != null) refEl.value = String(row.barrio).trim();
        const scEl = document.getElementById('ped-sum-conexion');
        const sfEl = document.getElementById('ped-sum-fases');
        const tc = mapearTipoConexion(row.tipo_conexion);
        const fa = mapearFases(row.fases);
        if (scEl && tc) scEl.value = tc;
        if (sfEl && fa) sfEl.value = fa;
    }

    registrarProteccionPadronPedidoNuevo(row, opts);
    return String(ident || '').trim();
}
