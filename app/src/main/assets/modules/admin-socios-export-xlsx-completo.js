/**
 * Exporta el catálogo de socios a Excel (.xlsx) con todas las columnas de BD,
 * datos_extra expandido en columnas propias, lat/lon numéricas y X/Y de proyección
 * si están activas en la vista (misma lógica que la tabla virtual).
 * made by leavera77
 */

import { proyectarWgs84AFamiliaFaja, etiquetaFamiliaProyeccionCorta } from '../map.js';

const BASE_KEYS = [
  'id',
  'nis_medidor',
  'nis',
  'medidor',
  'nombre',
  'calle',
  'numero',
  'barrio',
  'telefono',
  'distribuidor_codigo',
  'localidad',
  'provincia',
  'codigo_postal',
  'tipo_tarifa',
  'urbano_rural',
  'transformador',
  'tipo_conexion',
  'fases',
  'latitud',
  'longitud',
];

function _datosExtraJsonCelda(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch (_) {
    return String(raw);
  }
}

function _parseDatosExtra(val) {
  if (val == null) return null;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    } catch (_) {}
  }
  return null;
}

function _unionExtraKeys(rows) {
  const k = new Set();
  for (const row of rows) {
    const o = _parseDatosExtra(row.datos_extra);
    if (!o) continue;
    for (const key of Object.keys(o)) {
      const nk = String(key || '').trim();
      if (nk) k.add(nk);
    }
  }
  return [...k].sort();
}

function _applyColWidths(ws) {
  const XLSX = window.XLSX;
  if (!XLSX?.utils || !ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const cols = [];
  for (let C = range.s.c; C <= range.e.c; C++) {
    let max = 10;
    for (let R = range.s.r; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      const v = cell?.v != null ? String(cell.v) : '';
      max = Math.max(max, Math.min(50, v.length + 2));
    }
    cols.push({ wch: max });
  }
  ws['!cols'] = cols;
  ws['!autofilter'] = { ref: ws['!ref'] };
}

function _numOrEmpty(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function _activoTxt(v) {
  if (v === false || v === 0 || String(v).toLowerCase() === 'false') return 'Baja';
  return 'Activo';
}

export function exportarSociosExcelCompletoDesdeMemoria() {
  const rows = typeof window !== 'undefined' ? window._sociosVirtualRows : null;
  if (!Array.isArray(rows) || !rows.length) {
    try {
      window.toast?.('No hay socios cargados. Abrí la pestaña Socios y esperá a que termine la carga.', 'warning');
    } catch (_) {}
    return;
  }
  if (typeof window.esAdmin === 'function' && !window.esAdmin()) {
    try { window.toast?.('Solo administradores.', 'error'); } catch (_) {}
    return;
  }
  const XLSX = window.XLSX;
  if (!XLSX?.utils?.book_new || !XLSX.writeFile || !XLSX.utils.aoa_to_sheet) {
    try { window.toast?.('Excel (SheetJS) aún no cargó — esperá unos segundos y reintentá.', 'error'); } catch (_) {}
    return;
  }

  const extraKeys = _unionExtraKeys(rows);
  const incluirDeJson = rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'datos_extra'));
  const ctxFn = typeof window._gnSociosExportCtxProy === 'function' ? window._gnSociosExportCtxProy : null;
  const ctx = ctxFn ? ctxFn() : null;
  const prefs = ctx?.prefs || { modo: 'solo_wgs', familias: [], familia_primaria: '' };
  const zona = ctx?.zona != null ? ctx.zona : 3;
  const ordenarFam = ctx?.ordenarFamilias;
  const famOrder =
    prefs.modo === 'extra_proy' && Array.isArray(prefs.familias) && prefs.familias.length && typeof ordenarFam === 'function'
      ? ordenarFam(prefs.familias, prefs.familia_primaria)
      : [];

  const proyHeaders = [];
  for (const fam of famOrder) {
    const ab = etiquetaFamiliaProyeccionCorta(fam);
    proyHeaders.push(`Este_m_${ab}`, `Norte_m_${ab}`);
  }

  const headers = [
    ...BASE_KEYS,
    ...(incluirDeJson ? ['datos_extra (JSON)'] : []),
    ...extraKeys.map((k) => `extra:${k}`),
    ...proyHeaders,
    'activo',
  ];

  const aoa = [headers];

  for (const r of rows) {
    const de = _parseDatosExtra(r.datos_extra);
    const line = [];
    for (const k of BASE_KEYS) {
      if (k === 'latitud' || k === 'longitud') {
        line.push(_numOrEmpty(r[k]));
        continue;
      }
      const raw = r[k];
      line.push(raw == null ? '' : String(raw));
    }
    if (incluirDeJson) {
      line.push(_datosExtraJsonCelda(r.datos_extra));
    }
    for (const ek of extraKeys) {
      const v = de && de[ek] != null ? de[ek] : '';
      line.push(v == null ? '' : String(v));
    }
    const la = Number(r.latitud);
    const lo = Number(r.longitud);
    for (const fam of famOrder) {
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        line.push('', '');
        continue;
      }
      const pr = proyectarWgs84AFamiliaFaja(la, lo, fam, zona);
      if (pr) {
        line.push(Number(pr.e.toFixed(3)), Number(pr.n.toFixed(3)));
      } else {
        line.push('', '');
      }
    }
    line.push(_activoTxt(r.activo));
    aoa.push(line);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  _applyColWidths(ws);
  XLSX.utils.book_append_sheet(wb, ws, 'Socios');
  const day = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `socios_catalogo_completo_${day}.xlsx`);
  try {
    window.toast?.(`Excel descargado (${rows.length.toLocaleString('es-AR')} filas).`, 'success');
  } catch (_) {}
}

if (typeof window !== 'undefined') {
  window._gnExportSociosExcelCompleto = exportarSociosExcelCompletoDesdeMemoria;
}
