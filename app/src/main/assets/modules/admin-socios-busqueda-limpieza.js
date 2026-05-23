/**
 * Limpieza del campo de búsqueda por apellido en Admin → Socios tras una búsqueda hecha.
 * made by leavera77
 */

const CHIP_ID = 'gn-socios-apellido-busqueda-chip';

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
