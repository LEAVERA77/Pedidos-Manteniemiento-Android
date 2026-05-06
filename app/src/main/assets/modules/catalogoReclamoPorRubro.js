/**
 * Catálogos de tipos de reclamo, prioridades, checklist de seguridad de cierre y derivación
 * por rubro / línea operativa (`active_business_type`). Extraído de app.js para mantener el main liviano.
 * made by leavera77
 */

function normalizarRubroEmpresaTipo(tipo) {
    const t = String(tipo || '').trim().toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t === 'cooperativa_agua' || t === 'cooperativa de agua') return 'cooperativa_agua';
    if (t === 'cooperativa_electrica' || t === 'cooperativa eléctrica' || t === 'cooperativa electrica') {
        return 'cooperativa_electrica';
    }
    return null;
}

/** Clave en `TIPOS_RECLAMO_POR_RUBRO`: rubro de cliente + `EMPRESA_CFG.active_business_type`. */
export function rubroCatalogoTiposReclamo() {
    const r = normalizarRubroEmpresaTipo(typeof window !== 'undefined' ? window.EMPRESA_CFG?.tipo : '');
    const bt = String(
        (typeof window !== 'undefined' && window.EMPRESA_CFG?.active_business_type) || ''
    )
        .trim()
        .toLowerCase();
    if (bt === 'municipio' || r === 'municipio') return 'municipio';
    if (bt === 'agua' || r === 'cooperativa_agua') return 'cooperativa_agua';
    return 'cooperativa_electrica';
}

export const TIPOS_RECLAMO_POR_RUBRO = {
    municipio: [
        'Alumbrado Público',
        'Bacheo y Pavimento',
        'Recolección/Poda',
        'Espacios Verdes',
        'Señalización/Semáforos',
        'Alcantarillas tapadas',
        'Recolección (otros)',
        'Obstrucción de Cloaca',
        'Ruidos molestos / Perturbación',
        'Animales sueltos / Mascotas',
        'Otros',
    ],
    cooperativa_agua: [
        'Corte de suministro de agua',
        'Rotura de cañería / Pérdida de agua',
        'Baja presión de agua',
        'Reparación de conexión domiciliaria',
        'Instalación de medidor',
        'Rehabilitación de servicio',
        'Control de presión',
        'Limpieza de tanques',
        'Pedido de factibilidad (nuevo servicio)',
        'Otros',
    ],
    cooperativa_electrica: [
        'Corte de Energía',
        'Cables Caídos/Peligro',
        'Problemas de Tensión',
        'Poste Inclinado/Dañado',
        'Consumo elevado',
        'Alumbrado Público (Mantenimiento)',
        'Riesgo en la vía pública',
        'Corrimiento de poste/columna',
        'Pedido de factibilidad (nuevo servicio)',
        'Otros',
    ],
};

export const TIPOS_RECLAMO_LEGACY = [
    'Riesgo vía pública',
    'Mantenimiento preventivo',
    'Material averiado',
    'Poda de árboles',
    'Nidos',
    'Falla de Línea',
    'Inspección Termográfica',
    'Avería en Transformador',
    'Reclamo de Cliente',
    'Conexión Nueva',
    'Corte Programado',
    'Emergencia',
    'Otros',
];

const CHECKLIST_SEGURIDAD_UI = {
    cooperativa_electrica: {
        labels: [
            'EPPS / elementos de protección verificados',
            'Corte o seccionamiento de energía verificado',
            'Señalización del lugar de trabajo',
        ],
        resumen: ['EPPS', 'Corte energía', 'Señalización'],
    },
    municipio: {
        labels: [
            'Conos / vallas / señalización vial',
            'Corte de calle / desvío de tránsito',
            'Señalización del lugar de trabajo',
        ],
        resumen: ['Señalización vial', 'Corte / desvío', 'Señalización'],
    },
    cooperativa_agua: {
        labels: [
            'EPPS / elementos de protección verificados',
            'Corte de suministro de agua verificado',
            'Señalización del lugar de trabajo',
        ],
        resumen: ['EPPS', 'Corte agua', 'Señalización'],
    },
};

export function syncChecklistSeguridadCierreLabels() {
    const key = rubroCatalogoTiposReclamo();
    const pack = CHECKLIST_SEGURIDAD_UI[key] || CHECKLIST_SEGURIDAD_UI.cooperativa_electrica;
    const ids = ['chk-epp', 'chk-corte', 'chk-senal'];
    ids.forEach((id, i) => {
        const cb = document.getElementById(id);
        if (!cb?.parentElement) return;
        const lab = cb.parentElement;
        while (lab.firstChild) lab.removeChild(lab.firstChild);
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(` ${pack.labels[i] || ''}`));
    });
}

export function textoResumenChecklistSeguridad(o) {
    if (!o || typeof o !== 'object') return '';
    const key = rubroCatalogoTiposReclamo();
    const pack = CHECKLIST_SEGURIDAD_UI[key] || CHECKLIST_SEGURIDAD_UI.cooperativa_electrica;
    const s = pack.resumen;
    return `${s[0]}: ${o.epp ? 'Sí' : '—'} · ${s[1]}: ${o.corte ? 'Sí' : '—'} · ${s[2]}: ${o.senal ? 'Sí' : '—'}`;
}

export function tiposReclamoSeleccionables() {
    const key = rubroCatalogoTiposReclamo();
    if (TIPOS_RECLAMO_POR_RUBRO[key]) return [...TIPOS_RECLAMO_POR_RUBRO[key]];
    const u = new Set();
    Object.values(TIPOS_RECLAMO_POR_RUBRO).forEach((arr) => arr.forEach((x) => u.add(x)));
    return [...u];
}

export const PRIORIDAD_RECLAMO_POR_TIPO = {
    'Alumbrado Público': 'Media',
    'Bacheo y Pavimento': 'Media',
    'Recolección/Poda': 'Baja',
    'Espacios Verdes': 'Baja',
    'Señalización/Semáforos': 'Alta',
    'Alcantarillas tapadas': 'Media',
    /** Histórico (antes del rename en menú municipio opción 6). */
    'Limpieza de Zanjas': 'Media',
    'Recolección (otros)': 'Media',
    'Obstrucción de Cloaca': 'Alta',
    'Otros': 'Media',
    'Pérdida en Vereda/Calle': 'Alta',
    'Falta de Presión': 'Media',
    'Calidad del Agua': 'Alta',
    'Consumo elevado': 'Baja',
    'Conexión Nueva': 'Baja',
    'Corte de Energía': 'Alta',
    'Cables Caídos/Peligro': 'Crítica',
    'Problemas de Tensión': 'Alta',
    'Poste Inclinado/Dañado': 'Crítica',
    'Cambio de Medidor': 'Baja',
    'Alumbrado Público (Mantenimiento)': 'Baja',
    'Riesgo en la vía pública': 'Crítica',
    'Corrimiento de poste/columna': 'Crítica',
    'Pedido de factibilidad (nuevo servicio)': 'Baja',
    'Riesgo vía pública': 'Crítica',
    'Mantenimiento preventivo': 'Baja',
    'Material averiado': 'Media',
    'Poda de árboles': 'Baja',
    'Recorte de árboles': 'Baja',
    'Nidos': 'Baja',
    'Falla de Línea': 'Alta',
    'Inspección Termográfica': 'Baja',
    'Avería en Transformador': 'Alta',
    'Reclamo de Cliente': 'Media',
    'Corte Programado': 'Baja',
    'Emergencia': 'Crítica',
    'Bacheo / Pavimento dañado': 'Media',
    'Alumbrado público apagado': 'Alta',
    'Recolección de residuos / ramas': 'Baja',
    'Limpieza y desmalezado': 'Baja',
    'Zanjeo / Desagüe pluvial obstruido': 'Alta',
    'Pintura de cordones / sendas peatonales': 'Baja',
    'Corte de calle / Desvío de tránsito': 'Alta',
    'Ruidos molestos / Perturbación': 'Media',
    'Animales sueltos / Mascotas': 'Media',
    'Corte de suministro de agua': 'Alta',
    'Rotura de cañería / Pérdida de agua': 'Crítica',
    'Baja presión de agua': 'Media',
    'Reparación de conexión domiciliaria': 'Media',
    'Instalación de medidor': 'Baja',
    'Rehabilitación de servicio': 'Media',
    'Control de presión': 'Baja',
    'Limpieza de tanques': 'Baja',
};

const _PRIORIDADES_VALIDAS_UI = new Set(['Baja', 'Media', 'Alta', 'Crítica']);

export function prioridadPredeterminadaPorTipoTrabajoUI(tipoTrabajo) {
    const t = String(tipoTrabajo || '').trim();
    if (!t) return 'Media';
    const p = PRIORIDAD_RECLAMO_POR_TIPO[t];
    if (p && _PRIORIDADES_VALIDAS_UI.has(p)) return p;
    return 'Media';
}

export const TIPOS_TRABAJO_DERIVACION_SOLO_AGUA = new Set([
    'Pérdida en Vereda/Calle',
    'Falta de Presión',
    'Calidad del Agua',
    'Corte de suministro de agua',
    'Rotura de cañería / Pérdida de agua',
    'Baja presión de agua',
]);

export const TIPOS_TRABAJO_DERIVACION_SOLO_MUNICIPIO = new Set([
    'Bacheo y Pavimento',
    'Recolección/Poda',
    'Espacios Verdes',
    'Señalización/Semáforos',
    'Alcantarillas tapadas',
    'Limpieza de Zanjas',
    'Recolección (otros)',
    'Obstrucción de Cloaca',
    'Alumbrado Público',
    'Animales sueltos / Mascotas',
    'Bacheo / Pavimento dañado',
    'Alumbrado público apagado',
    'Recolección de residuos / ramas',
    'Limpieza y desmalezado',
    'Zanjeo / Desagüe pluvial obstruido',
    'Recorte de árboles',
    'Pintura de cordones / sendas peatonales',
    'Corte de calle / Desvío de tránsito',
    'Ruidos molestos / Perturbación',
]);
