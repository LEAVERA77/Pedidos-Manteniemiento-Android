/**
 * KPI admin: textos y opciones del selector según rubro (sin inflar app.js).
 * made by leavera77
 */

function rubroNormalizado() {
    const fn = window.normalizarRubroEmpresa;
    if (typeof fn === 'function') return fn(window.EMPRESA_CFG?.tipo) || '';
    const t = String(window.EMPRESA_CFG?.tipo || '').toLowerCase();
    if (t === 'municipio') return 'municipio';
    if (t.includes('agua')) return 'cooperativa_agua';
    if (t.includes('electric')) return 'cooperativa_electrica';
    return '';
}

/** HTML del bloque introductorio (reemplaza párrafo fijo en admin KPI). */
export function htmlKpiIntroRubro() {
    const r = rubroNormalizado();
    if (r === 'municipio') {
        return `<p style="font-size:.8rem;color:var(--tl);margin:0 0 .85rem;line-height:1.45"><strong>¿Qué son los KPIs?</strong> Son indicadores que te ayudan a medir la gestión de tu municipio. Por ejemplo: cantidad de reclamos cerrados, tiempo promedio de respuesta, satisfacción de los vecinos. Elegí un indicador, el período de tiempo, y el sistema lo calcula automáticamente con los datos de tu municipio. Los datos quedan guardados para comparar entre períodos.</p>
      <p style="font-size:.78rem;color:var(--tl);margin:0 0 .85rem;line-height:1.45">Los valores se registran en Neon (<code style="font-size:.72rem">kpi_snapshots</code>) para este <code style="font-size:.72rem">tenant_id</code>. Si falta la tabla, ejecutá <code style="font-size:.72rem">docs/NEON_kpi_snapshots.sql</code>.</p>`;
    }
    if (r === 'cooperativa_electrica') {
        return `<p style="font-size:.8rem;color:var(--tl);margin:0 0 .85rem;line-height:1.45"><strong>¿Qué son los KPIs?</strong> Son indicadores que te ayudan a medir la gestión de tu cooperativa. Por ejemplo: cantidad de cortes resueltos, tiempo promedio de respuesta, satisfacción de los socios, SAIFI y SAIDI. Elegí un indicador, el período de tiempo, y el sistema lo calcula automáticamente con los datos de tu cooperativa. Los datos quedan guardados para comparar entre períodos.</p>
      <p style="font-size:.78rem;color:var(--tl);margin:0 0 .85rem;line-height:1.45">Los valores se registran en Neon (<code style="font-size:.72rem">kpi_snapshots</code>) para este <code style="font-size:.72rem">tenant_id</code>. Si falta la tabla, ejecutá <code style="font-size:.72rem">docs/NEON_kpi_snapshots.sql</code>.</p>`;
    }
    if (r === 'cooperativa_agua') {
        return `<p style="font-size:.8rem;color:var(--tl);margin:0 0 .85rem;line-height:1.45"><strong>¿Qué son los KPIs?</strong> Son indicadores que te ayudan a medir la gestión de tu cooperativa. Por ejemplo: cantidad de reclamos cerrados, tiempo promedio de respuesta, satisfacción de los socios. Elegí un indicador, el período de tiempo, y el sistema lo calcula automáticamente con los datos de tu cooperativa. Los datos quedan guardados para comparar entre períodos.</p>
      <p style="font-size:.78rem;color:var(--tl);margin:0 0 .85rem;line-height:1.45">Los valores se registran en Neon (<code style="font-size:.72rem">kpi_snapshots</code>) para este <code style="font-size:.72rem">tenant_id</code>. Si falta la tabla, ejecutá <code style="font-size:.72rem">docs/NEON_kpi_snapshots.sql</code>.</p>`;
    }
    return `<p style="font-size:.8rem;color:var(--tl);margin:0 0 .85rem;line-height:1.45"><strong>¿Qué son los KPIs?</strong> Son indicadores para medir la gestión de tu organización. Elegí un indicador y el período; podés calcular valores desde los datos cargados en el sistema. Los registros quedan guardados para comparar entre períodos.</p>
      <p style="font-size:.78rem;color:var(--tl);margin:0 0 .85rem;line-height:1.45">Neon: tabla <code style="font-size:.72rem">kpi_snapshots</code> · <code style="font-size:.72rem">docs/NEON_kpi_snapshots.sql</code>.</p>`;
}

const OPT_COMUNES = [
    ['', '— Elegí una opción —'],
    ['pct_cierres_con_foto', '% de cierres con foto'],
    ['reclamos_cerrados', 'Reclamos cerrados en el período'],
    ['reclamos_recibidos', 'Reclamos recibidos en el período'],
    ['tiempo_respuesta_horas', 'Tiempo medio de respuesta (horas)'],
    ['satisfaccion_pct', 'Satisfacción (WhatsApp 1–5★)'],
];

const OPT_ELECTRICA_EXTRA = [
    ['saifi', 'SAIFI (índice)'],
    ['saidi', 'SAIDI (minutos)'],
];

const OPT_MUNICIPIO_EXTRA = [
    ['pct_bacheo_48h', '% bacheo resuelto en menos de 48 h'],
    ['pct_alumbrado_24h', '% alumbrado repuesto en menos de 24 h'],
];

/** Rellena #kpi-preset según rubro (conserva valor si sigue existiendo). */
export function rebuildKpiPresetSelectRubro() {
    const sel = document.getElementById('kpi-preset');
    if (!sel) return;
    const prev = sel.value;
    const r = rubroNormalizado();
    const opts = [...OPT_COMUNES];
    if (r === 'cooperativa_electrica') opts.push(...OPT_ELECTRICA_EXTRA);
    if (r === 'municipio') opts.push(...OPT_MUNICIPIO_EXTRA);
    sel.innerHTML = opts
        .map(([v, lab]) => `<option value="${String(v).replace(/"/g, '&quot;')}">${lab}</option>`)
        .join('');
    const allowed = new Set(opts.map((x) => x[0]));
    if (prev && allowed.has(prev)) sel.value = prev;
    else sel.value = '';
}

/** Intro + selector al abrir pestaña KPI o tras cambiar rubro. */
export function syncKpiAdminRubroDom() {
    const host = document.getElementById('kpi-admin-intro-rubro');
    if (host) host.innerHTML = htmlKpiIntroRubro();
    rebuildKpiPresetSelectRubro();
    if (typeof window.aplicarKpiPresetAdmin === 'function') window.aplicarKpiPresetAdmin();
}
