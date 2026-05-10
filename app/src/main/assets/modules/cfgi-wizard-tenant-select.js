/**
 * Paso 1 del wizard cfgi: select de tenants (Neon) y tipo inferido.
 * made by leavera77
 */

const TIPOS_VALIDOS = new Set(['municipio', 'cooperativa_agua', 'cooperativa_electrica']);

/**
 * @param {HTMLSelectElement | null} sel
 * @param {Array<{ id?: unknown, nombre?: unknown, tipo?: unknown }>} clientes
 * @param {{ nombreActual?: string, idActual?: number | null }} [opts]
 * @returns {boolean} si hubo opción seleccionada distinta del placeholder
 */
export function poblarCfgiNombreSelect(sel, clientes, opts) {
    if (!sel) return false;
    const nombreActual = String(opts?.nombreActual || '').trim();
    const idRaw = opts?.idActual;
    const idActual =
        idRaw != null && Number.isFinite(Number(idRaw)) && Number(idRaw) > 0 ? Number(idRaw) : null;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent =
        (clientes || []).length > 0
            ? 'Elegí un tenant…'
            : 'No hay tenants en la lista (validá la clave técnica o tocá «Listar tenants» abajo).';
    ph.disabled = true;
    ph.selected = true;
    sel.appendChild(ph);
    let matched = false;
    for (const c of clientes || []) {
        const id = Number(c?.id);
        const nom = String(c?.nombre || '').trim();
        const tipoRaw = String(c?.tipo || '').trim();
        const o = document.createElement('option');
        o.value = Number.isFinite(id) && id > 0 ? String(id) : '';
        o.dataset.nombre = nom;
        o.dataset.tipo = tipoRaw;
        o.textContent = nom ? `${nom} (${tipoRaw || '—'})` : `Tenant #${id}`;
        sel.appendChild(o);
        const pick =
            (idActual != null && Number.isFinite(id) && id === idActual) ||
            (!!nombreActual && nom === nombreActual);
        if (pick && o.value) {
            o.selected = true;
            ph.selected = false;
            matched = true;
        }
    }
    return matched;
}

/**
 * @param {HTMLElement | null} el
 * @returns {{ nombre: string, tipo: string }}
 */
export function leerNombreTipoDesdeCfgiNombre(el) {
    if (!el) return { nombre: '', tipo: '' };
    if (el.tagName !== 'SELECT') {
        return { nombre: String(el.value || '').trim(), tipo: '' };
    }
    const opt = el.options[el.selectedIndex];
    if (!opt || !String(opt.value || '').trim()) {
        return { nombre: '', tipo: '' };
    }
    const nombre = String(opt.dataset?.nombre || '').trim();
    const tipoRaw = String(opt.dataset?.tipo || '').trim();
    const tipo = TIPOS_VALIDOS.has(tipoRaw) ? tipoRaw : '';
    return { nombre, tipo: tipo || tipoRaw };
}

/**
 * @param {HTMLSelectElement | null} selNombre
 * @param {HTMLSelectElement | null} selTipo
 */
export function aplicarTipoInferidoEnSelectCfgiTipo(selNombre, selTipo) {
    if (!selNombre || selNombre.tagName !== 'SELECT' || !selTipo) return;
    const { tipo } = leerNombreTipoDesdeCfgiNombre(selNombre);
    if (tipo && TIPOS_VALIDOS.has(tipo)) {
        selTipo.value = tipo;
    }
}
