/**
 * Admin: visibilidad «Ocultar módulos red», ayuda Excel zona/barrios/ramales y modal «Formato».
 * made by leavera77
 */

import { toast } from './ui-utils.js';

function rubroEmpresaCfg() {
    const raw = String(window.EMPRESA_CFG?.tipo || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (raw === 'municipio') return 'municipio';
    if (raw === 'cooperativa_agua' || raw === 'cooperativa de agua') return 'cooperativa_agua';
    if (
        raw === 'cooperativa_electrica' ||
        raw === 'cooperativa electrica' ||
        raw === 'cooperativa' ||
        raw === 'empresa'
    ) {
        return 'cooperativa_electrica';
    }
    return null;
}

/** Solo cooperativa eléctrica: el checkbox aplica; municipio/agua no muestran la fila. */
export function syncOcultarModulosRedesRowVisibility() {
    const wrap = document.getElementById('wrap-cfg-ocultar-modulos-redes');
    if (!wrap) return;
    wrap.style.display = rubroEmpresaCfg() === 'cooperativa_electrica' ? '' : 'none';
}

/** Valor a enviar en PUT configuración: fuera de eléctrica siempre false. */
export function ocultarModulosRedesValorParaApi() {
    if (rubroEmpresaCfg() !== 'cooperativa_electrica') return false;
    return !!document.getElementById('cfg-ocultar-modulos-redes')?.checked;
}

const HTML_AYUDA_ELECTRIC =
    'Sin límite de filas en el listado. Excel: fila 1 = encabezados <code style="font-size:.75rem">codigo | nombre | tension | localidad</code> (localidad opcional). En Neon, columna <code style="font-size:.75rem">localidad</code>: <code style="font-size:.75rem">docs/NEON_distribuidores_localidad.sql</code>.';

const HTML_AYUDA_MUNICIPIO =
    'Sin límite de filas. Excel: fila 1 = encabezados <code style="font-size:.75rem">nombre | localidad | provincia</code> (provincia opcional). Las columnas <code style="font-size:.75rem">codigo_postal</code>, <code style="font-size:.75rem">telefono</code>, <code style="font-size:.75rem">lat</code>, <code style="font-size:.75rem">lon</code>, <code style="font-size:.75rem">barrio</code> se agregan automáticamente si no están.';

const HTML_AYUDA_AGUA =
    'Sin límite de filas. Excel: fila 1 = encabezados <code style="font-size:.75rem">id_socio | medidor | nombre | direccion | localidad | provincia</code>. Las columnas <code style="font-size:.75rem">codigo_postal</code>, <code style="font-size:.75rem">telefono</code>, <code style="font-size:.75rem">lat</code>, <code style="font-size:.75rem">lon</code> se agregan automáticamente si no están.';

export function syncAyudaDistribuidoresExcelHint() {
    const el = document.getElementById('admin-distribuidores-excel-hint');
    if (!el) return;
    const r = rubroEmpresaCfg();
    if (r === 'municipio') el.innerHTML = HTML_AYUDA_MUNICIPIO;
    else if (r === 'cooperativa_agua') el.innerHTML = HTML_AYUDA_AGUA;
    else el.innerHTML = HTML_AYUDA_ELECTRIC;
}

let _kbdDistribFormato = null;

export function cerrarModalFormatoExcelDistribuidores() {
    const m = document.getElementById('modal-formato-excel-distribuidores');
    if (m) m.remove();
    try {
        if (_kbdDistribFormato) {
            document.removeEventListener('keydown', _kbdDistribFormato);
            _kbdDistribFormato = null;
        }
    } catch (_) {}
}

export function descargarPlantillaCsvDistribuidoresRubro() {
    const r = rubroEmpresaCfg() || 'cooperativa_electrica';
    const bom = '\ufeff';
    let line = '';
    if (r === 'municipio') line = 'nombre;localidad;provincia\n';
    else if (r === 'cooperativa_agua') line = 'id_socio;medidor;nombre;direccion;localidad;provincia\n';
    else line = 'codigo;nombre;tension;localidad\n';
    const blob = new Blob([bom + line], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plantilla_zona_${r}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast('Plantilla CSV descargada', 'success');
}

function modalFormatoMunicipio() {
    cerrarModalFormatoExcelDistribuidores();
    const wrap = document.createElement('div');
    wrap.id = 'modal-formato-excel-distribuidores';
    wrap.style.cssText =
        'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(15,23,42,.45);backdrop-filter:blur(2px)';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div style="max-width:560px;width:100%;max-height:min(90vh,640px);overflow:auto;background:var(--bg);border:1px solid var(--bo);border-radius:.65rem;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:1rem 1.1rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;margin-bottom:.65rem">
        <h3 style="margin:0;font-size:1rem;color:var(--bd)">Formato de planilla para Municipio</h3>
        <button type="button" class="panel-win-btn" onclick="cerrarModalFormatoExcelDistribuidores()" aria-label="Cerrar"><i class="fas fa-times"></i></button>
      </div>
      <h4 style="margin:.5rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Campos obligatorios</h4>
      <p style="margin:0 0 .45rem;font-size:.82rem;line-height:1.5;color:var(--tm)">ID Vecino, Nombre y Apellido, Dirección, Ciudad, Provincia.</p>
      <h4 style="margin:.65rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Campos opcionales (automáticos si no están)</h4>
      <p style="margin:0;font-size:.82rem;line-height:1.45;color:var(--tm)">Código Postal, Teléfono, Lat, Lon, Barrio.</p>
      <h4 style="margin:.65rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Ejemplo</h4>
      <pre style="font-size:.72rem;overflow:auto;margin:.4rem 0;padding:.45rem;background:var(--bg);border:1px solid var(--bo);border-radius:.4rem">nombre | localidad | provincia
Centro Cívico | Paraná | Entre Ríos</pre>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.85rem">
        <button type="button" class="btn-sm primary" onclick="descargarPlantillaCsvDistribuidoresRubro()"><i class="fas fa-download"></i> Descargar plantilla CSV</button>
        <button type="button" class="btn-sm" style="border:1px solid var(--bo)" onclick="cerrarModalFormatoExcelDistribuidores()">Cerrar</button>
      </div>
    </div>`;
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap) cerrarModalFormatoExcelDistribuidores();
    });
    _kbdDistribFormato = (ev) => {
        if (ev.key === 'Escape') cerrarModalFormatoExcelDistribuidores();
    };
    document.addEventListener('keydown', _kbdDistribFormato);
    document.body.appendChild(wrap);
}

function modalFormatoAgua() {
    cerrarModalFormatoExcelDistribuidores();
    const wrap = document.createElement('div');
    wrap.id = 'modal-formato-excel-distribuidores';
    wrap.style.cssText =
        'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(15,23,42,.45);backdrop-filter:blur(2px)';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div style="max-width:560px;width:100%;max-height:min(90vh,640px);overflow:auto;background:var(--bg);border:1px solid var(--bo);border-radius:.65rem;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:1rem 1.1rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;margin-bottom:.65rem">
        <h3 style="margin:0;font-size:1rem;color:var(--bd)">Formato de planilla para Cooperativa de Agua</h3>
        <button type="button" class="panel-win-btn" onclick="cerrarModalFormatoExcelDistribuidores()" aria-label="Cerrar"><i class="fas fa-times"></i></button>
      </div>
      <h4 style="margin:.5rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Campos obligatorios</h4>
      <p style="margin:0 0 .45rem;font-size:.82rem;line-height:1.5;color:var(--tm)">ID Socio, Medidor, Nombre y Apellido, Dirección, Ciudad, Provincia.</p>
      <h4 style="margin:.65rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Campos opcionales (automáticos si no están)</h4>
      <p style="margin:0;font-size:.82rem;line-height:1.45;color:var(--tm)">Código Postal, Teléfono, Lat, Lon.</p>
      <h4 style="margin:.65rem 0 .25rem;font-size:.82rem;color:var(--tm);text-transform:uppercase;letter-spacing:.04em">Ejemplo</h4>
      <pre style="font-size:.72rem;overflow:auto;margin:.4rem 0;padding:.45rem;background:var(--bg);border:1px solid var(--bo);border-radius:.4rem">id_socio | medidor | nombre | direccion | localidad | provincia
45001 | A001 | María Gómez | Mitre 120 | Paraná | Entre Ríos</pre>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.85rem">
        <button type="button" class="btn-sm primary" onclick="descargarPlantillaCsvDistribuidoresRubro()"><i class="fas fa-download"></i> Descargar plantilla CSV</button>
        <button type="button" class="btn-sm" style="border:1px solid var(--bo)" onclick="cerrarModalFormatoExcelDistribuidores()">Cerrar</button>
      </div>
    </div>`;
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap) cerrarModalFormatoExcelDistribuidores();
    });
    _kbdDistribFormato = (ev) => {
        if (ev.key === 'Escape') cerrarModalFormatoExcelDistribuidores();
    };
    document.addEventListener('keydown', _kbdDistribFormato);
    document.body.appendChild(wrap);
}

/** Reemplaza el alert previo de app.js para eléctrica; modal para municipio y agua. */
export function mostrarFormatoExcelDistribuidores() {
    const r = rubroEmpresaCfg();
    if (r === 'municipio') {
        modalFormatoMunicipio();
        return;
    }
    if (r === 'cooperativa_agua') {
        modalFormatoAgua();
        return;
    }
    alert(
        `Formato requerido para el Excel (distribuidores):\n\nColumna A: codigo (ej: D001)\nColumna B: nombre (ej: ZONA NORTE)\nColumna C: tension (ej: 13200 V) — opcional\nColumna D: localidad — opcional (requiere columna en Neon: docs/NEON_distribuidores_localidad.sql)\n\nEncabezados fila 1: codigo | nombre | tension | localidad\nA partir de la fila 2, los datos.\n\nPodés marcar «Vaciar tabla antes de importar» para borrar los registros del tenant actual y volver a cargar desde cero (si la base es multitenant, no borra otros negocios).`
    );
}

if (typeof window !== 'undefined') {
    window.mostrarFormatoExcel = mostrarFormatoExcelDistribuidores;
    window.cerrarModalFormatoExcelDistribuidores = cerrarModalFormatoExcelDistribuidores;
    window.descargarPlantillaCsvDistribuidoresRubro = descargarPlantillaCsvDistribuidoresRubro;
}
