/**
 * Pedido nuevo (#pm): datos del padrón (NIS / socio) prevalecen sobre Nominatim al clic en mapa.
 * made by leavera77
 */

/** @type {Record<string, boolean>} */
let _protegido = {};

/** @param {string} tx */
function mapearTipoConexion(tx) {
    const t = String(tx || '').trim().toLowerCase();
    if (!t) return '';
    if (t.includes('subter')) return 'Subterráneo';
    if (t.includes('aer') || t.includes('éreo') || t.includes('ereo')) return 'Aéreo';
    return '';
}

/** @param {string} fx */
function mapearFases(fx) {
    const f = String(fx || '').trim().toLowerCase();
    if (!f) return '';
    if (f.includes('tri')) return 'Trifásico';
    if (f.includes('mono')) return 'Monofásico';
    return '';
}

export function limpiarProteccionPadronPedidoNuevo() {
    _protegido = {};
}

/** @param {string} campo */
export function campoProtegidoPorPadronPedidoNuevo(campo) {
    return !!_protegido[campo];
}

/**
 * Marca campos que vinieron del padrón y no deben pisarse con Nominatim.
 * @param {Record<string, unknown>} row
 * @param {{ esCooperativaElectrica?: boolean, esMunicipio?: boolean, esAgua?: boolean }} [opts]
 */
export function registrarProteccionPadronPedidoNuevo(row, opts = {}) {
    _protegido = {};
    if (!row || typeof row !== 'object') return;

    const ident =
        row.nis_medidor ||
        row.medidor ||
        row.nis ||
        row.numero_cliente ||
        row.identificador ||
        '';
    if (String(ident || '').trim()) _protegido.nis = true;
    if (row.nombre != null && String(row.nombre).trim()) _protegido.nombre = true;
    if (row.calle != null && String(row.calle).trim()) _protegido.calle = true;
    if (row.numero != null && String(row.numero).trim()) _protegido.numero = true;
    if (row.localidad != null && String(row.localidad).trim()) _protegido.localidad = true;

    if (opts.esMunicipio || opts.esAgua) {
        if (row.barrio != null && String(row.barrio).trim()) {
            _protegido.ref = true;
            _protegido.di2 = true;
        } else if (row.distribuidor_codigo != null && String(row.distribuidor_codigo).trim()) {
            _protegido.di2 = true;
        }
    }

    if (opts.esCooperativaElectrica) {
        if (row.transformador != null && String(row.transformador).trim()) _protegido.trafo = true;
        if (row.distribuidor_codigo != null && String(row.distribuidor_codigo).trim()) {
            _protegido.di2 = true;
        }
        if (row.barrio != null && String(row.barrio).trim()) _protegido.ref = true;
        if (mapearTipoConexion(row.tipo_conexion)) _protegido.tipoConexion = true;
        if (mapearFases(row.fases)) _protegido.fases = true;
    }
}

/**
 * Rellena dirección desde Nominatim solo en campos no protegidos por el padrón.
 * @param {Record<string, unknown>} addr
 * @param {{ esMunicipioRubro?: () => boolean }} [deps]
 */
export function aplicarDireccionNominatimRespetandoPadron(addr, deps = {}) {
    const a = addr && typeof addr === 'object' ? addr : {};
    const nomVia =
        a.road || a.pedestrian || a.path || a.residential || a.neighbourhood || '';
    const num = a.house_number || '';
    const loc =
        a.city || a.town || a.village || a.municipality || a.county || a.state_district || '';
    const prov = a.state || '';
    const cp = a.postcode || '';
    const refParts = [];
    if (prov) refParts.push(String(prov));
    if (cp) refParts.push(`CP ${cp}`);
    const refExtra = refParts.length ? refParts.join(' · ') : '';

    const dc = document.getElementById('ped-cli-calle');
    const dn = document.getElementById('ped-cli-num');
    const dl = document.getElementById('ped-cli-loc');
    const dr = document.getElementById('ped-cli-ref');
    const di2 = document.getElementById('di2');

    if (dc && !_protegido.calle) dc.value = nomVia ? String(nomVia).trim() : '';
    if (dn && !_protegido.numero) dn.value = num ? String(num).trim() : '';
    if (dl && !_protegido.localidad) dl.value = loc ? String(loc).trim() : '';

    if (dr && refExtra && !_protegido.ref) {
        const prev = String(dr.value || '').trim();
        dr.value = prev ? `${prev} (${refExtra})` : refExtra;
    }

    const esMun = typeof deps.esMunicipioRubro === 'function' && deps.esMunicipioRubro();
    if (esMun && di2 && !_protegido.di2) {
        const barrio =
            a.suburb || a.neighbourhood || a.quarter || a.city_district || '';
        const bTrim = String(barrio || '').trim();
        if (bTrim) {
            let opt = Array.from(di2.options).find((o) => o.value === bTrim);
            if (!opt) {
                opt = document.createElement('option');
                opt.value = bTrim;
                opt.textContent = bTrim;
                di2.appendChild(opt);
            }
            di2.value = bTrim;
        }
    }
}
