/**
 * Limpieza del campo de búsqueda por apellido/dirección en Admin → Socios tras una búsqueda hecha.
 * made by leavera77
 */

const CHIP_ID = 'gn-socios-apellido-busqueda-chip';
const CHIP_DIRECCION_ID = 'gn-socios-direccion-busqueda-chip';

/**
 * @param {string} q
 * @param {number} [count]
 */
export function mostrarChipBusquedaApellidoSocios(q, count) {
    const inp = document.getElementById('historial-apellido-input');
    const wrap = inp?.closest('div');
    if (!inp || !wrap) return;

    let chip = document.getElementById(CHIP_ID);
    if (!chip) {
        chip = document.createElement('div');
        chip.id = CHIP_ID;
        chip.style.cssText =
            'display:flex;align-items:center;gap:.45rem;margin-top:.35rem;padding:.35rem .55rem;font-size:.76rem;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:.45rem;color:#065f46';
        wrap.appendChild(chip);
    }

    const cntTxt =
        count != null && Number.isFinite(count) ? ` · <strong>${count}</strong> resultado(s)` : '';
    chip.innerHTML = `<span>🔍 Búsqueda: «${String(q)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}»${cntTxt}</span>
    <button type="button" class="btn-sm" style="padding:.15rem .45rem;font-size:.72rem;margin-left:auto;background:#fff;border:1px solid #6ee7b7" title="Nueva búsqueda">✕ Limpiar</button>`;
    chip.querySelector('button')?.addEventListener('click', () => limpiarBusquedaApellidoSocios());

    inp.value = '';
    inp.placeholder = 'Nueva búsqueda por apellido…';
    inp.dataset.gnApellidoBusquedaActiva = '1';
}

export function limpiarBusquedaApellidoSocios() {
    const inp = document.getElementById('historial-apellido-input');
    const out = document.getElementById('historial-apellido-result');
    const chip = document.getElementById(CHIP_ID);
    if (inp) {
        inp.value = '';
        inp.placeholder = 'Ej: García';
        delete inp.dataset.gnApellidoBusquedaActiva;
    }
    if (out) out.innerHTML = '';
    if (chip) chip.remove();
    try {
        if (typeof window.volverResultadosApellido === 'function') {
            window._volverApellidoInterno = null;
        }
    } catch (_) {}
}

/**
 * @param {string} q
 * @param {number} [count]
 */
export function mostrarChipBusquedaDireccionSocios(q, count) {
    const inp = document.getElementById('historial-direccion-input');
    const wrap = inp?.closest('div');
    if (!inp || !wrap) return;

    let chip = document.getElementById(CHIP_DIRECCION_ID);
    if (!chip) {
        chip = document.createElement('div');
        chip.id = CHIP_DIRECCION_ID;
        chip.style.cssText =
            'display:flex;align-items:center;gap:.45rem;margin-top:.35rem;padding:.35rem .55rem;font-size:.76rem;background:#eff6ff;border:1px solid #93c5fd;border-radius:.45rem;color:#1e3a8a';
        wrap.appendChild(chip);
    }

    const cntTxt =
        count != null && Number.isFinite(count) ? ` · <strong>${count}</strong> resultado(s)` : '';
    chip.innerHTML = `<span>📍 Búsqueda: «${String(q)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}»${cntTxt}</span>
    <button type="button" class="btn-sm" style="padding:.15rem .45rem;font-size:.72rem;margin-left:auto;background:#fff;border:1px solid #93c5fd" title="Nueva búsqueda">✕ Limpiar</button>`;
    chip.querySelector('button')?.addEventListener('click', () => limpiarBusquedaDireccionSocios());

    inp.value = '';
    inp.placeholder = 'Nueva búsqueda por dirección…';
    inp.dataset.gnDireccionBusquedaActiva = '1';
}

export function limpiarBusquedaDireccionSocios() {
    const inp = document.getElementById('historial-direccion-input');
    const out = document.getElementById('historial-direccion-result');
    const chip = document.getElementById(CHIP_DIRECCION_ID);
    if (inp) {
        inp.value = '';
        inp.placeholder = 'Ej: Rivadavia 1200';
        delete inp.dataset.gnDireccionBusquedaActiva;
    }
    if (out) out.innerHTML = '';
    if (chip) chip.remove();
    try {
        if (typeof window.volverResultadosDireccion === 'function') {
            window._volverDireccionInterno = null;
        }
    } catch (_) {}
}
