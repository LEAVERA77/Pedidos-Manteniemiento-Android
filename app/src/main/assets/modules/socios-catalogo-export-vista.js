/**
 * Vista de exportación socios (CSV / XLSX cliente) alineada a la tabla admin por rubro.
 * Paridad con `api/services/sociosCatalogoExportVistaAdmin.js`.
 * made by leavera77
 */

function _normalizarRubroEmpresa(tipo) {
    const t = String(tipo || '')
        .trim()
        .toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t === 'cooperativa de agua') return 'cooperativa_agua';
    if (t === 'cooperativa_electrica' || t === 'cooperativa eléctrica' || t === 'cooperativa electrica') return 'cooperativa_electrica';
    return null;
}

/** @returns {'cooperativa_electrica'|'cooperativa_agua'|'municipio'} */
export function rubroSociosExportDesdeCfg() {
    const r = _normalizarRubroEmpresa(typeof window !== 'undefined' ? window.EMPRESA_CFG?.tipo : '');
    return r || 'cooperativa_electrica';
}

/**
 * @param {'cooperativa_electrica'|'cooperativa_agua'|'municipio'} rubro
 * @returns {{ keys: string[], labels: string[] }}
 */
export function sociosVistaExportSpec(rubro) {
    if (rubro === 'municipio') {
        return {
            keys: [
                'nis_medidor',
                'nombre',
                'localidad',
                'provincia',
                'codigo_postal',
                'barrio',
                'calle',
                'numero',
                'telefono',
                'latitud',
                'longitud',
                'activo',
            ],
            labels: [
                'ID vecino',
                'Nombre',
                'Localidad',
                'Provincia',
                'Cód. postal',
                'Barrio',
                'Calle',
                'Nº',
                'Tel.',
                'Lat (WGS84)',
                'Lon (WGS84)',
                'Estado',
            ],
        };
    }
    if (rubro === 'cooperativa_agua') {
        return {
            keys: [
                'nis_medidor',
                'nis',
                'medidor',
                'nombre',
                'localidad',
                'provincia',
                'codigo_postal',
                'barrio',
                'calle',
                'numero',
                'telefono',
                'distribuidor_codigo',
                'latitud',
                'longitud',
                'activo',
            ],
            labels: [
                'NIS/Medidor',
                'NIS',
                'Medidor',
                'Nombre',
                'Localidad',
                'Provincia',
                'Cód. postal',
                'Barrio',
                'Calle',
                'Nº',
                'Tel.',
                'Dist.',
                'Lat (WGS84)',
                'Lon (WGS84)',
                'Estado',
            ],
        };
    }
    return {
        keys: [
            'nis_medidor',
            'nis',
            'medidor',
            'nombre',
            'localidad',
            'provincia',
            'codigo_postal',
            'barrio',
            'calle',
            'numero',
            'telefono',
            'distribuidor_codigo',
            'tipo_tarifa',
            'urbano_rural',
            'transformador',
            'tipo_conexion',
            'fases',
            'latitud',
            'longitud',
            'activo',
        ],
        labels: [
            'NIS/Medidor',
            'NIS',
            'Medidor',
            'Nombre',
            'Localidad',
            'Provincia',
            'Cód. postal',
            'Barrio',
            'Calle',
            'Nº',
            'Tel.',
            'Dist.',
            'Tarifa',
            'U/R',
            'Transf.',
            'Conex.',
            'Fases',
            'Lat (WGS84)',
            'Lon (WGS84)',
            'Estado',
        ],
    };
}

export function sociosActivoTexto(v) {
    if (v === false || v === 0 || String(v).toLowerCase() === 'false') return 'Baja';
    return 'Activo';
}

/**
 * Filtra filas por tenant_id y línea de negocio activa (columna business_type en fila si existe).
 * @param {Record<string, unknown>[]} rows
 * @param {number} tenantId
 * @param {string} [activeBusinessType] electricidad|agua|municipio
 */
export function filtrarSociosFilasExportVista(rows, tenantId, activeBusinessType) {
    if (!Array.isArray(rows) || !rows.length) return rows;
    const tid = Number(tenantId);
    const hasTcol = rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'tenant_id'));
    let out = rows;
    if (hasTcol && Number.isFinite(tid) && tid > 0) {
        out = out.filter((r) => Number(r.tenant_id) === tid);
    }
    const bt = String(activeBusinessType || '')
        .trim()
        .toLowerCase();
    const hasBtCol = out.some((r) => Object.prototype.hasOwnProperty.call(r, 'business_type'));
    if (hasBtCol && (bt === 'electricidad' || bt === 'agua' || bt === 'municipio')) {
        const n0 = out.length;
        out = out.filter((r) => {
            const b = String(r.business_type ?? '')
                .trim()
                .toLowerCase();
            return !b || b === bt;
        });
        if (out.length < n0) {
            try {
                window.toast?.(
                    `Export: se omitieron ${(n0 - out).toLocaleString('es-AR')} filas de otra línea de negocio.`,
                    'warning'
                );
            } catch (_) {}
        }
    }
    return out;
}
